/**
 * FOREMAN — Context Window Guard
 *
 * Adapted from OpenClaw context-window-guard.ts.
 *
 * Context window check before each LLM call:
 * - Does prompt + context total tokens exceed the model limit?
 * - If so, trigger automatic compaction
 * - If it still doesn't fit, BLOCK
 *
 * Model context window info comes from the provider.
 */

import type { Layer } from "./types.js";
import { estimateTokens } from "./context-compression.js";

// ─── CONSTANTS ───────────────────────────────────────────────

/** Absolute minimum context window — do not make LLM calls below this */
export const CONTEXT_WINDOW_HARD_MIN = 8_000;

/** Warning threshold — consider compaction if this little remains */
export const CONTEXT_WINDOW_WARN_BELOW = 16_000;

/** Known context window sizes per model (tokens) */
export const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic
  "claude-opus": 200_000,
  "claude-sonnet": 200_000,
  "claude-haiku": 200_000,
  // OpenAI
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-4-turbo": 128_000,
  // Google
  "gemini-pro": 1_048_576,
  "gemini-flash": 1_048_576,
  "gemini-ultra": 1_048_576,
  "gemini-3.1-pro": 1_048_576,
  "gemini-3.1-pro-high": 1_048_576,
  // Kimi / Moonshot — K2.5/K2.6 provide 256K context windows (per platform docs)
  "kimi-k2.6": 262_144,
  "kimi-k2.6-instant": 262_144,
  "kimi-k2.5": 262_144,
  "kimi-k2-thinking": 262_144,
  "kimi-k2-thinking-turbo": 262_144,
  "moonshot-v1-128k": 131_072,
  // Note: kimi-k2.5-thinking does not exist; use kimi-k2-thinking for thinking capability
};

const DEFAULT_CONTEXT_WINDOW = 128_000;

// ─── TYPES ───────────────────────────────────────────────────

export interface ContextWindowInfo {
  /** Model's total context window */
  totalTokens: number;
  /** Estimated tokens currently used */
  usedTokens: number;
  /** Remaining tokens */
  remainingTokens: number;
  /** Usage ratio (0-1) */
  usageRatio: number;
  /** Source (is the model known or default) */
  source: "known" | "default";
}

export interface ContextWindowGuardResult extends ContextWindowInfo {
  /** Is compaction recommended */
  shouldCompact: boolean;
  /** Is the LLM call safe */
  isSafe: boolean;
  /** Warning message (if any) */
  warning?: string;
}

// ─── GUARD ───────────────────────────────────────────────────

/**
 * Determine context window size for a model.
 */
export function resolveContextWindow(model: string): { tokens: number; source: "known" | "default" } {
  const known = KNOWN_CONTEXT_WINDOWS[model];
  if (known) return { tokens: known, source: "known" };

  // Guess from model name
  for (const [key, value] of Object.entries(KNOWN_CONTEXT_WINDOWS)) {
    if (model.includes(key)) return { tokens: value, source: "known" };
  }

  return { tokens: DEFAULT_CONTEXT_WINDOW, source: "default" };
}

/**
 * Evaluate context window status.
 * Call BEFORE each LLM call.
 */
export function evaluateContextWindow(params: {
  model: string;
  systemPromptTokens: number;
  userPromptTokens: number;
  contextTokens: number;
  /** Tokens to reserve for response (default: 4000) */
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
 * Run guard with token estimates from prompt texts.
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
