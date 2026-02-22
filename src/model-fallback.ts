/**
 * FOREMAN — Model Fallback
 *
 * Adapted from OpenClaw model-fallback.ts.
 *
 * When an LLM call fails:
 * 1. Classify error (rate_limit, quota, auth, timeout, overloaded, context_length, fatal)
 * 2. If retryable → retry with backoff (same model)
 * 3. If fallback needed → switch to next model
 * 4. If all models exhausted → throw error
 *
 * Difference from OpenClaw: no auth profile rotation (yet),
 * but layer-based model preferences exist.
 */

import type { Layer } from "./types.js";
import type { GenerateResult, LLMProvider } from "./provider.js";
import { ProviderRegistry } from "./provider.js";
import {
  classifyLLMError,
  isRetryable,
  shouldFallback,
  retryAsync,
  DEFAULT_RETRY_CONFIG,
  type ErrorClass,
  type RetryConfig,
  type RetryInfo,
} from "./retry.js";

// ─── TYPES ───────────────────────────────────────────────────

export interface ModelCandidate {
  provider: string;
  model: string;
}

export interface FallbackAttempt {
  provider: string;
  model: string;
  error: string;
  errorClass: ErrorClass;
  attempt: number;
}

export interface FallbackResult<T> {
  result: T;
  provider: string;
  model: string;
  attempts: FallbackAttempt[];
}

export interface FallbackConfig {
  /** Layer-based model preferences */
  layerModels: Record<Layer, ModelCandidate[]>;
  /** Retry configuration */
  retry: RetryConfig;
}

// ─── DEFAULTS ────────────────────────────────────────────────

/**
 * Layer-based model fallback chain.
 * Each layer can fall back to different models.
 */
export const DEFAULT_LAYER_MODELS: Record<Layer, ModelCandidate[]> = {
  visioner: [
    { provider: "google-antigravity", model: "gemini-3.1-pro-high" },
    { provider: "google-antigravity", model: "claude-opus" },
    { provider: "anthropic", model: "claude-opus" },
    { provider: "google-antigravity", model: "gemini-2.5-pro" },
    { provider: "openai", model: "gpt-4o" },
    { provider: "anthropic", model: "claude-sonnet" },
  ],
  strategist: [
    { provider: "google-antigravity", model: "gemini-3.1-pro-high" },
    { provider: "google-antigravity", model: "claude-opus" },
    { provider: "anthropic", model: "claude-opus" },
    { provider: "anthropic", model: "claude-sonnet" },
    { provider: "google-antigravity", model: "claude-sonnet" },
    { provider: "google-antigravity", model: "gemini-2.5-pro" },
    { provider: "openai", model: "gpt-4o" },
  ],
  researcher: [
    { provider: "google-antigravity", model: "gemini-3.1-pro-high" },
    { provider: "google-antigravity", model: "gemini-2.5-flash" },
    { provider: "openai", model: "gpt-4o" },
    { provider: "google", model: "gemini-pro" },
    { provider: "anthropic", model: "claude-sonnet" },
    { provider: "google-antigravity", model: "claude-sonnet" },
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "google", model: "gemini-flash" },
  ],
  worker: [
    { provider: "google-antigravity", model: "gemini-3.1-pro-high" },
    { provider: "google-antigravity", model: "claude-sonnet" },
    { provider: "anthropic", model: "claude-sonnet" },
    { provider: "openai", model: "gpt-4o" },
    { provider: "google-antigravity", model: "gemini-2.5-flash" },
    { provider: "google", model: "gemini-pro" },
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "google", model: "gemini-flash" },
  ],
};

// ─── FALLBACK RUNNER ─────────────────────────────────────────

/**
 * Run LLM call with model fallback chain.
 *
 * Flow:
 * 1. Try with primary model
 * 2. Retryable error → retry with backoff (same model, max 3)
 * 3. Fallback error (quota/auth/context) → switch to next model
 * 4. All models failed → throw last error
 */
export async function runWithFallback<T>(params: {
  /** Provider registry — hangi provider hangi modeli destekler */
  registry: ProviderRegistry;
  /** Which layer this is running for */
  layer: Layer;
  /** Model fallback listesi (opsiyonel — yoksa default) */
  candidates?: ModelCandidate[];
  /** Retry config (opsiyonel) */
  retry?: RetryConfig;
  /** The actual function to run */
  run: (provider: LLMProvider, model: string) => Promise<T>;
  /** Retry bildirimi */
  onRetry?: (info: RetryInfo & { model: string }) => void;
  /** Fallback bildirimi */
  onFallback?: (from: ModelCandidate, to: ModelCandidate, errorClass: ErrorClass) => void;
  /** Abort sinyali */
  abortSignal?: AbortSignal;
}): Promise<FallbackResult<T>> {
  const candidates = params.candidates ?? DEFAULT_LAYER_MODELS[params.layer];
  const retryConfig = params.retry ?? DEFAULT_RETRY_CONFIG;
  const attempts: FallbackAttempt[] = [];
  let lastError: unknown;

  // Filter to only accessible models
  const availableCandidates = candidates.filter(c =>
    params.registry.getProviderForModel(c.model) !== null
  );

  if (availableCandidates.length === 0) {
    throw new Error(
      `No available providers for layer ${params.layer}. ` +
      `Candidates: ${candidates.map(c => `${c.provider}/${c.model}`).join(", ")}`
    );
  }

  for (let i = 0; i < availableCandidates.length; i++) {
    const candidate = availableCandidates[i];
    const provider = params.registry.getProviderForModel(candidate.model);
    if (!provider) continue;

    try {
      const result = await retryAsync(
        () => params.run(provider, candidate.model),
        retryConfig,
        {
          label: `${params.layer}/${candidate.model}`,
          onRetry: (info) => {
            params.onRetry?.({ ...info, model: candidate.model });
          },
          onFallback: (errorClass) => {
            const next = availableCandidates[i + 1];
            if (next) {
              params.onFallback?.(candidate, next, errorClass);
            }
          },
          abortSignal: params.abortSignal,
        },
      );

      return {
        result,
        provider: candidate.provider,
        model: candidate.model,
        attempts,
      };
    } catch (err) {
      lastError = err;
      const errorClass = classifyLLMError(err);
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        error: err instanceof Error ? err.message : String(err),
        errorClass,
        attempt: i + 1,
      });

      // Fatal error — don't try other models
      if (errorClass === "fatal") break;

      // Fallback bildirimi
      const next = availableCandidates[i + 1];
      if (next) {
        params.onFallback?.(candidate, next, errorClass);
      }
    }
  }

  // All models failed
  if (attempts.length <= 1 && lastError) {
    throw lastError;
  }

  const summary = attempts
    .map(a => `${a.provider}/${a.model}: ${a.error} (${a.errorClass})`)
    .join(" → ");

  throw new Error(
    `All models failed for ${params.layer} (${attempts.length} attempts): ${summary}`,
    { cause: lastError instanceof Error ? lastError : undefined },
  );
}
