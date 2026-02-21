/**
 * FOREMAN — Model Fallback
 *
 * OpenClaw model-fallback.ts'den adapte edildi.
 *
 * LLM çağrısı başarısız olduğunda:
 * 1. Hata sınıflandır (rate_limit, quota, auth, timeout, overloaded, context_length, fatal)
 * 2. Retryable ise → backoff ile tekrar dene (aynı model)
 * 3. Fallback gerektiriyorsa → sonraki model'e geç
 * 4. Tüm modeller tükenirse → hata at
 *
 * OpenClaw'dan fark: auth profile rotation yok (henüz),
 * ama katman bazlı model tercihi var.
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
  /** Katman bazlı model tercihleri */
  layerModels: Record<Layer, ModelCandidate[]>;
  /** Retry konfigürasyonu */
  retry: RetryConfig;
}

// ─── DEFAULTS ────────────────────────────────────────────────

/**
 * Katman bazlı model fallback zinciri.
 * Her katman farklı modellere düşebilir.
 */
export const DEFAULT_LAYER_MODELS: Record<Layer, ModelCandidate[]> = {
  visioner: [
    { provider: "anthropic", model: "claude-opus" },
    { provider: "openai", model: "gpt-4o" },
    { provider: "google", model: "gemini-ultra" },
    { provider: "anthropic", model: "claude-sonnet" },
  ],
  strategist: [
    { provider: "anthropic", model: "claude-opus" },
    { provider: "anthropic", model: "claude-sonnet" },
    { provider: "google", model: "gemini-ultra" },
    { provider: "openai", model: "gpt-4o" },
  ],
  researcher: [
    { provider: "openai", model: "gpt-4o" },
    { provider: "google", model: "gemini-pro" },
    { provider: "anthropic", model: "claude-sonnet" },
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "google", model: "gemini-flash" },
  ],
  worker: [
    { provider: "anthropic", model: "claude-sonnet" },
    { provider: "openai", model: "gpt-4o" },
    { provider: "google", model: "gemini-pro" },
    { provider: "openai", model: "gpt-4o-mini" },
    { provider: "google", model: "gemini-flash" },
  ],
};

// ─── FALLBACK RUNNER ─────────────────────────────────────────

/**
 * LLM çağrısını model fallback zinciriyle çalıştır.
 *
 * Akış:
 * 1. Birincil model ile dene
 * 2. Retryable hata → backoff ile tekrar dene (aynı model, max 3)
 * 3. Fallback hata (quota/auth/context) → sonraki model'e geç
 * 4. Tüm modeller başarısız → son hatayı at
 */
export async function runWithFallback<T>(params: {
  /** Provider registry — hangi provider hangi modeli destekler */
  registry: ProviderRegistry;
  /** Hangi katman için çalışıyor */
  layer: Layer;
  /** Model fallback listesi (opsiyonel — yoksa default) */
  candidates?: ModelCandidate[];
  /** Retry config (opsiyonel) */
  retry?: RetryConfig;
  /** Asıl çalıştırılacak fonksiyon */
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

  // Sadece erişilebilir modelleri filtrele
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

      // Fatal hata — başka model deneme
      if (errorClass === "fatal") break;

      // Fallback bildirimi
      const next = availableCandidates[i + 1];
      if (next) {
        params.onFallback?.(candidate, next, errorClass);
      }
    }
  }

  // Tüm modeller başarısız
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
