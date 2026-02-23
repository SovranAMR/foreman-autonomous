/**
 * FOREMAN — Retry Engine
 *
 * Adapted from OpenClaw (src/infra/retry.ts + backoff.ts).
 *
 * Farklar:
 * - LLM-specific: rate limit, quota, auth error differentiation
 * - Provider-aware: which provider it came from, what to fall back to
 * - Layer-aware: worker retry may behave differently from visioner
 * - Event-emitting: orchestrator'a retry durumunu bildiriyor
 */

// ─── TYPES ───────────────────────────────────────────────────

export interface RetryConfig {
  /** Total number of attempts (including first) */
  maxAttempts: number;
  /** Initial wait time (ms) */
  initialDelayMs: number;
  /** Maximum wait time (ms) */
  maxDelayMs: number;
  /** Exponential backoff multiplier */
  factor: number;
  /** Jitter ratio (0-1). 0.2 = ±20% randomness */
  jitter: number;
}

export interface RetryInfo {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: unknown;
  label?: string;
}

export type ErrorClassifier = (err: unknown) => ErrorClass;

export type ErrorClass =
  | "rate_limit"     // 429 — bekle ve tekrar dene
  | "quota"          // budget/quota exceeded — switch to different provider
  | "auth"           // authorization error — no retry
  | "timeout"        // timeout — retry
  | "overloaded"     // 529/503 — server busy, wait
  | "context_length" // prompt too long — shorten and retry
  | "transient"      // transient network error — retry
  | "fatal";         // unrecoverable — stop

export interface BackoffPolicy {
  initialMs: number;
  maxMs: number;
  factor: number;
  jitter: number;
}

// ─── DEFAULTS ────────────────────────────────────────────────

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60_000,
  factor: 2,
  jitter: 0.2,
};

export const AGGRESSIVE_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 2000,
  maxDelayMs: 120_000,
  factor: 2.5,
  jitter: 0.3,
};

// ─── ERROR CLASSIFICATION ────────────────────────────────────

/**
 * Classify LLM API errors.
 * Inspired by OpenClaw's failover-error.ts.
 */
export function classifyLLMError(err: unknown): ErrorClass {
  if (!err || typeof err !== "object") return "fatal";

  const e = err as Record<string, unknown>;
  const status = (e.status ?? e.statusCode) as number | undefined;
  const message = (e.message ?? "") as string;
  const code = (e.code ?? "") as string;

  // Rate limit
  if (status === 429 || /rate.?limit|too.?many.?requests/i.test(message)) {
    return "rate_limit";
  }

  // Overloaded
  if (status === 529 || status === 503 || /overloaded|unavailable|capacity/i.test(message)) {
    return "overloaded";
  }

  // Auth — status check FIRST, message check AFTER
  if (status === 401 || status === 403) {
    return "auth";
  }

  // Model not found — 404 from LLM API means the model doesn't exist
  // on this endpoint/provider. Should fallback to next model, not die.
  if (status === 404 || /not.?found|entity.*not.*found/i.test(message)) {
    return "quota"; // Treated as "try next provider/model"
  }

  // Context length — check BEFORE quota (both may contain "exceeded")
  if (/context.?length|too.?long|max.?tokens|token.?limit/i.test(message)) {
    return "context_length";
  }

  // Quota / billing
  if (/quota|billing|insufficient|exceeded|budget/i.test(message)) {
    return "quota";
  }

  // Auth — message-based (if no status)
  if (/auth|permission|forbidden|invalid.*key|api.?key.*invalid/i.test(message)) {
    return "auth";
  }

  // Timeout
  if (code === "ETIMEDOUT" || code === "ECONNRESET" || /timeout|timed.?out/i.test(message)) {
    return "timeout";
  }

  // Transient network
  if (/ECONNREFUSED|ENETUNREACH|ENOTFOUND|socket|network/i.test(code + message)) {
    return "transient";
  }

  return "fatal";
}

/**
 * Should retry based on error class?
 */
export function isRetryable(errorClass: ErrorClass): boolean {
  return errorClass === "rate_limit"
    || errorClass === "timeout"
    || errorClass === "overloaded"
    || errorClass === "transient";
}

/**
 * Should fallback to a different provider based on error class?
 */
export function shouldFallback(errorClass: ErrorClass): boolean {
  return errorClass === "quota"
    || errorClass === "auth"
    || errorClass === "context_length";
}

// ─── BACKOFF COMPUTATION ─────────────────────────────────────

/**
 * Calculate wait time with exponential backoff.
 * Adapted from OpenClaw backoff.ts.
 */
export function computeBackoff(config: RetryConfig, attempt: number): number {
  const base = config.initialDelayMs * config.factor ** Math.max(attempt - 1, 0);
  const jitterRange = base * config.jitter;
  const jitter = (Math.random() * 2 - 1) * jitterRange;
  return Math.min(config.maxDelayMs, Math.round(base + jitter));
}

/**
 * Extract retry-after duration from rate limit response.
 * Anthropic and OpenAI use different formats.
 */
export function extractRetryAfterMs(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;

  const e = err as Record<string, unknown>;

  // Anthropic: headers['retry-after'] (saniye cinsinden)
  const headers = (e.headers ?? (e.response as Record<string, unknown> | undefined)?.headers) as Record<string, unknown> | undefined;
  if (headers) {
    const h = headers as Record<string, unknown> & { get?: (key: string) => string | null };
    const retryAfter = (h["retry-after"] ?? h.get?.("retry-after")) as string | undefined;
    if (retryAfter) {
      const seconds = parseFloat(String(retryAfter));
      if (Number.isFinite(seconds) && seconds > 0) {
        return Math.ceil(seconds * 1000);
      }
    }
  }

  // OpenAI: error.retry_after (saniye)
  const retryAfterField = (e.retry_after ?? (e.error as Record<string, unknown> | undefined)?.retry_after) as number | undefined;
  if (typeof retryAfterField === "number" && Number.isFinite(retryAfterField)) {
    return Math.ceil(retryAfterField * 1000);
  }

  return null;
}

// ─── RETRY RUNNER ────────────────────────────────────────────

export type OnRetryCallback = (info: RetryInfo) => void;

/**
 * Run an async function with retry.
 * Adapted from OpenClaw retryAsync, with LLM-specific additions.
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  options?: {
    label?: string;
    classifier?: ErrorClassifier;
    onRetry?: OnRetryCallback;
    onFallback?: (errorClass: ErrorClass, err: unknown) => void;
    abortSignal?: AbortSignal;
  },
): Promise<T> {
  const classifier = options?.classifier ?? classifyLLMError;
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    // Abort check
    if (options?.abortSignal?.aborted) {
      throw new Error("Aborted", { cause: lastError });
    }

    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const errorClass = classifier(err);

      // Son deneme — hata at
      if (attempt >= config.maxAttempts) {
        break;
      }

      // Fatal or auth — stop without retry
      if (errorClass === "fatal" || errorClass === "auth") {
        break;
      }

      // Fallback gerektiren hatalar
      if (shouldFallback(errorClass)) {
        options?.onFallback?.(errorClass, err);
        break;
      }

      // Retryable — bekle ve tekrar dene
      if (isRetryable(errorClass)) {
        // Use the server-specified wait time for rate limits
        const serverDelay = errorClass === "rate_limit" ? extractRetryAfterMs(err) : null;
        const computedDelay = computeBackoff(config, attempt);
        const delayMs = serverDelay ? Math.max(serverDelay, computedDelay) : computedDelay;

        options?.onRetry?.({
          attempt,
          maxAttempts: config.maxAttempts,
          delayMs,
          error: err,
          label: options.label,
        });

        await sleep(delayMs, options?.abortSignal);
        continue;
      }

      // Unknown error class — stop
      break;
    }
  }

  throw lastError ?? new Error("Retry failed");
}

// ─── SLEEP ───────────────────────────────────────────────────

async function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);

    if (abortSignal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      };
      if (abortSignal.aborted) {
        clearTimeout(timer);
        reject(new Error("Aborted"));
        return;
      }
      abortSignal.addEventListener("abort", onAbort, { once: true });
    }
  });
}
