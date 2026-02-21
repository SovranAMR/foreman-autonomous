/**
 * FOREMAN — Retry Engine
 *
 * OpenClaw'dan adapte edildi (src/infra/retry.ts + backoff.ts).
 *
 * Farklar:
 * - LLM-specific: rate limit, quota, auth error ayrımı
 * - Provider-aware: hangi provider'dan geldi, fallback'e ne geçsin
 * - Katman-aware: worker retry'ı vizyonerden farklı davranalabilir
 * - Event-emitting: orchestrator'a retry durumunu bildiriyor
 */

// ─── TYPES ───────────────────────────────────────────────────

export interface RetryConfig {
  /** Toplam deneme sayısı (ilk dahil) */
  maxAttempts: number;
  /** Başlangıç bekleme süresi (ms) */
  initialDelayMs: number;
  /** Maksimum bekleme süresi (ms) */
  maxDelayMs: number;
  /** Exponential backoff çarpanı */
  factor: number;
  /** Jitter oranı (0-1). 0.2 = ±20% rastgelelik */
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
  | "quota"          // bütçe/kota aşıldı — farklı provider'a geç
  | "auth"           // yetkilendirme hatası — deneme
  | "timeout"        // zaman aşımı — tekrar dene
  | "overloaded"     // 529/503 — sunucu meşgul, bekle
  | "context_length" // prompt çok uzun — kısalt ve tekrar dene
  | "transient"      // geçici ağ hatası — tekrar dene
  | "fatal";         // düzeltilemez — dur

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
 * LLM API hatalarını sınıflandır.
 * OpenClaw'daki failover-error.ts'den esinlenildi.
 */
export function classifyLLMError(err: unknown): ErrorClass {
  if (!err || typeof err !== "object") return "fatal";

  const status = (err as any).status ?? (err as any).statusCode;
  const message = (err as any).message ?? "";
  const code = (err as any).code ?? "";

  // Rate limit
  if (status === 429 || /rate.?limit|too.?many.?requests/i.test(message)) {
    return "rate_limit";
  }

  // Overloaded
  if (status === 529 || status === 503 || /overloaded|unavailable|capacity/i.test(message)) {
    return "overloaded";
  }

  // Auth — status check ÖNCE, mesaj check SONRA
  if (status === 401 || status === 403) {
    return "auth";
  }

  // Context length — quota'dan ÖNCE kontrol et (her ikisi de "exceeded" içerebilir)
  if (/context.?length|too.?long|max.?tokens|token.?limit/i.test(message)) {
    return "context_length";
  }

  // Quota / billing
  if (/quota|billing|insufficient|exceeded|budget/i.test(message)) {
    return "quota";
  }

  // Auth — mesaj bazlı (status yoksa)
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
 * Hata sınıfına göre retry yapılmalı mı?
 */
export function isRetryable(errorClass: ErrorClass): boolean {
  return errorClass === "rate_limit"
    || errorClass === "timeout"
    || errorClass === "overloaded"
    || errorClass === "transient";
}

/**
 * Hata sınıfına göre farklı provider'a fallback yapılmalı mı?
 */
export function shouldFallback(errorClass: ErrorClass): boolean {
  return errorClass === "quota"
    || errorClass === "auth"
    || errorClass === "context_length";
}

// ─── BACKOFF COMPUTATION ─────────────────────────────────────

/**
 * Exponential backoff ile bekleme süresi hesapla.
 * OpenClaw backoff.ts'den adapte.
 */
export function computeBackoff(config: RetryConfig, attempt: number): number {
  const base = config.initialDelayMs * config.factor ** Math.max(attempt - 1, 0);
  const jitterRange = base * config.jitter;
  const jitter = (Math.random() * 2 - 1) * jitterRange;
  return Math.min(config.maxDelayMs, Math.round(base + jitter));
}

/**
 * Rate limit response'ından retry-after süresini çıkar.
 * Anthropic ve OpenAI farklı formatlar kullanır.
 */
export function extractRetryAfterMs(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;

  // Anthropic: headers['retry-after'] (saniye cinsinden)
  const headers = (err as any).headers ?? (err as any).response?.headers;
  if (headers) {
    const retryAfter = headers["retry-after"] ?? headers.get?.("retry-after");
    if (retryAfter) {
      const seconds = parseFloat(String(retryAfter));
      if (Number.isFinite(seconds) && seconds > 0) {
        return Math.ceil(seconds * 1000);
      }
    }
  }

  // OpenAI: error.retry_after (saniye)
  const retryAfterField = (err as any).retry_after ?? (err as any).error?.retry_after;
  if (typeof retryAfterField === "number" && Number.isFinite(retryAfterField)) {
    return Math.ceil(retryAfterField * 1000);
  }

  return null;
}

// ─── RETRY RUNNER ────────────────────────────────────────────

export type OnRetryCallback = (info: RetryInfo) => void;

/**
 * Async fonksiyonu retry ile çalıştır.
 * OpenClaw retryAsync'den adapte, LLM-specific eklemelerle.
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
    // Abort kontrolü
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

      // Fatal veya auth — retry'sız dur
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
        // Rate limit'te server'ın söylediği süreyi kullan
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

      // Bilinmeyen hata sınıfı — dur
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
