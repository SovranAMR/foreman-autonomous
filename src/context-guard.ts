/**
 * FOREMAN — Context Window Guard
 *
 * OpenClaw context-window-guard.ts'den adapte.
 *
 * Her LLM çağrısından önce context window kontrolü:
 * - Prompt + context toplam token'ı model limitini aşıyor mu?
 * - Aşıyorsa otomatik compaction tetikle
 * - Hâlâ sığmıyorsa BLOCK
 *
 * Model context window bilgileri provider'dan gelir.
 */

import type { Layer } from "./types.js";
import { estimateTokens } from "./context-compression.js";

// ─── CONSTANTS ───────────────────────────────────────────────

/** Mutlak minimum context window — bunun altında LLM çağrısı yapma */
export const CONTEXT_WINDOW_HARD_MIN = 8_000;

/** Uyarı eşiği — bu kadar az kaldıysa compaction düşün */
export const CONTEXT_WINDOW_WARN_BELOW = 16_000;

/** Model başına bilinen context window boyutları (token) */
export const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {
  "claude-opus": 200_000,
  "claude-sonnet": 200_000,
  "claude-haiku": 200_000,
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-4-turbo": 128_000,
  "gemini-pro": 1_048_576,
  "gemini-flash": 1_048_576,
  "gemini-ultra": 1_048_576,
};

const DEFAULT_CONTEXT_WINDOW = 128_000;

// ─── TYPES ───────────────────────────────────────────────────

export interface ContextWindowInfo {
  /** Model'in toplam context window'u */
  totalTokens: number;
  /** Şu anda kullanılan token tahmini */
  usedTokens: number;
  /** Kalan token */
  remainingTokens: number;
  /** Kullanım oranı (0-1) */
  usageRatio: number;
  /** Kaynak (model bilinen mi, default mı) */
  source: "known" | "default";
}

export interface ContextWindowGuardResult extends ContextWindowInfo {
  /** Compaction önerilir mi */
  shouldCompact: boolean;
  /** LLM çağrısı güvenli mi */
  isSafe: boolean;
  /** Uyarı mesajı (varsa) */
  warning?: string;
}

// ─── GUARD ───────────────────────────────────────────────────

/**
 * Model için context window boyutunu belirle.
 */
export function resolveContextWindow(model: string): { tokens: number; source: "known" | "default" } {
  const known = KNOWN_CONTEXT_WINDOWS[model];
  if (known) return { tokens: known, source: "known" };

  // Model adından tahmin
  for (const [key, value] of Object.entries(KNOWN_CONTEXT_WINDOWS)) {
    if (model.includes(key)) return { tokens: value, source: "known" };
  }

  return { tokens: DEFAULT_CONTEXT_WINDOW, source: "default" };
}

/**
 * Context window durumunu değerlendir.
 * Her LLM çağrısından ÖNCE çağır.
 */
export function evaluateContextWindow(params: {
  model: string;
  systemPromptTokens: number;
  userPromptTokens: number;
  contextTokens: number;
  /** Yanıt için ayrılacak token (default: 4000) */
  reserveForResponse?: number;
}): ContextWindowGuardResult {
  const { tokens: totalTokens, source } = resolveContextWindow(params.model);
  const reserveForResponse = params.reserveForResponse ?? 4000;

  const usedTokens = params.systemPromptTokens + params.userPromptTokens + params.contextTokens;
  const remainingTokens = totalTokens - usedTokens - reserveForResponse;
  const usageRatio = usedTokens / totalTokens;

  const shouldCompact = remainingTokens < CONTEXT_WINDOW_WARN_BELOW;
  const isSafe = remainingTokens > CONTEXT_WINDOW_HARD_MIN;

  let warning: string | undefined;
  if (!isSafe) {
    warning = `Context window nearly full: ${usedTokens}/${totalTokens} tokens used (${(usageRatio * 100).toFixed(0)}%). Only ${remainingTokens} remaining.`;
  } else if (shouldCompact) {
    warning = `Context window getting full: ${(usageRatio * 100).toFixed(0)}% used. Consider compaction.`;
  }

  return {
    totalTokens,
    usedTokens,
    remainingTokens,
    usageRatio,
    source,
    shouldCompact,
    isSafe,
    warning,
  };
}

/**
 * Prompt metinlerinden token tahminleriyle guard çalıştır.
 * Convenience wrapper.
 */
export function guardContextWindow(params: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  contextText: string;
}): ContextWindowGuardResult {
  return evaluateContextWindow({
    model: params.model,
    systemPromptTokens: estimateTokens(params.systemPrompt),
    userPromptTokens: estimateTokens(params.userPrompt),
    contextTokens: estimateTokens(params.contextText),
  });
}
