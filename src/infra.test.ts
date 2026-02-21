/**
 * FOREMAN — Retry + Fallback + Compression + Guard Tests
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyLLMError,
  isRetryable,
  shouldFallback,
  computeBackoff,
  extractRetryAfterMs,
  DEFAULT_RETRY_CONFIG,
} from "./retry.js";

import {
  estimateTokens,
  estimateThoughtTokens,
  chunkThoughtsByTokens,
  buildCompactContext,
  shouldCompact,
  computeAdaptiveChunkRatio,
} from "./context-compression.js";

import {
  resolveContextWindow,
  evaluateContextWindow,
  guardContextWindow,
  KNOWN_CONTEXT_WINDOWS,
} from "./context-guard.js";

import {
  BlockedError,
  BudgetExceededError,
  NoProviderError,
  ParseFailedError,
  formatErrorMessage,
  safeJsonParse,
  safeJsonParseOr,
  loadJsonFile,
  saveJsonFile,
} from "./errors.js";

import type { Thought } from "./types.js";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ─── RETRY TESTS ─────────────────────────────────────────────

test("classifyLLMError: rate limit (429)", () => {
  assert.equal(classifyLLMError({ status: 429 }), "rate_limit");
  assert.equal(classifyLLMError({ message: "Rate limit exceeded" }), "rate_limit");
});

test("classifyLLMError: overloaded (529/503)", () => {
  assert.equal(classifyLLMError({ status: 529 }), "overloaded");
  assert.equal(classifyLLMError({ status: 503 }), "overloaded");
  assert.equal(classifyLLMError({ message: "Server overloaded" }), "overloaded");
});

test("classifyLLMError: auth (401/403)", () => {
  assert.equal(classifyLLMError({ status: 401 }), "auth");
  assert.equal(classifyLLMError({ status: 403 }), "auth");
  assert.equal(classifyLLMError({ message: "invalid_api_key" }), "auth");
  assert.equal(classifyLLMError({ message: "Permission denied" }), "auth");
});

test("classifyLLMError: quota", () => {
  assert.equal(classifyLLMError({ message: "Quota exceeded" }), "quota");
  assert.equal(classifyLLMError({ message: "billing error" }), "quota");
});

test("classifyLLMError: context length", () => {
  assert.equal(classifyLLMError({ message: "context length exceeded" }), "context_length");
  assert.equal(classifyLLMError({ message: "maximum token limit" }), "context_length");
});

test("classifyLLMError: timeout", () => {
  assert.equal(classifyLLMError({ code: "ETIMEDOUT" }), "timeout");
  assert.equal(classifyLLMError({ message: "Request timed out" }), "timeout");
});

test("classifyLLMError: transient", () => {
  assert.equal(classifyLLMError({ code: "ECONNREFUSED" }), "transient");
  assert.equal(classifyLLMError({ code: "ENETUNREACH" }), "transient");
});

test("classifyLLMError: fatal (unknown)", () => {
  assert.equal(classifyLLMError({ message: "Something weird" }), "fatal");
  assert.equal(classifyLLMError(null), "fatal");
});

test("isRetryable: correct classification", () => {
  assert.equal(isRetryable("rate_limit"), true);
  assert.equal(isRetryable("timeout"), true);
  assert.equal(isRetryable("overloaded"), true);
  assert.equal(isRetryable("transient"), true);
  assert.equal(isRetryable("fatal"), false);
  assert.equal(isRetryable("auth"), false);
  assert.equal(isRetryable("quota"), false);
});

test("shouldFallback: correct classification", () => {
  assert.equal(shouldFallback("quota"), true);
  assert.equal(shouldFallback("auth"), true);
  assert.equal(shouldFallback("context_length"), true);
  assert.equal(shouldFallback("rate_limit"), false);
  assert.equal(shouldFallback("fatal"), false);
});

test("computeBackoff: exponential growth", () => {
  const d1 = computeBackoff(DEFAULT_RETRY_CONFIG, 1);
  const d2 = computeBackoff(DEFAULT_RETRY_CONFIG, 2);
  const d3 = computeBackoff(DEFAULT_RETRY_CONFIG, 3);

  // Jitter ile tam eşitlik olmaz ama artış olmalı
  assert.ok(d1 >= 800); // 1000 * (1 - 0.2)
  assert.ok(d2 >= 1600); // 2000 * (1 - 0.2)
  assert.ok(d3 <= DEFAULT_RETRY_CONFIG.maxDelayMs);
});

test("extractRetryAfterMs: headers", () => {
  assert.equal(extractRetryAfterMs({ headers: { "retry-after": "5" } }), 5000);
  assert.equal(extractRetryAfterMs({ retry_after: 3 }), 3000);
  assert.equal(extractRetryAfterMs({}), null);
  assert.equal(extractRetryAfterMs(null), null);
});

// ─── CONTEXT COMPRESSION TESTS ───────────────────────────────

function makeThought(overrides: Partial<Thought> = {}): Thought {
  return {
    id: "t_001",
    chainId: "chain_001",
    layer: "worker",
    input: "Test input for this thought",
    contextRefs: [],
    reasoning: "This is the reasoning",
    needsResearch: false,
    output: "This is the output",
    confidence: 0.8,
    needsVerification: false,
    status: "done",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test("estimateTokens: roughly 4 chars per token", () => {
  assert.equal(estimateTokens("1234"), 1);
  assert.equal(estimateTokens("12345678"), 2);
  assert.equal(estimateTokens(""), 0);
});

test("estimateThoughtTokens: includes all fields", () => {
  const t = makeThought({ input: "a".repeat(100), reasoning: "b".repeat(200), output: "c".repeat(400) });
  const tokens = estimateThoughtTokens(t);
  assert.ok(tokens >= 175); // (100+200+400)/4 = 175
});

test("chunkThoughtsByTokens: splits correctly", () => {
  const thoughts = Array.from({ length: 10 }, (_, i) =>
    makeThought({ id: `t_${i}`, input: "x".repeat(400) }) // ~100 tokens each
  );
  const chunks = chunkThoughtsByTokens(thoughts, 350); // ~3 thoughts per chunk
  assert.ok(chunks.length >= 3);
  assert.equal(chunks.flat().length, 10);
});

test("buildCompactContext: recent thoughts full, old summarized", () => {
  const thoughts = Array.from({ length: 8 }, (_, i) =>
    makeThought({
      id: `t_${i}`,
      input: `Task number ${i}`,
      output: `Result for task ${i}`,
      layer: "worker",
      confidence: 0.7 + i * 0.03,
    })
  );

  const result = buildCompactContext({
    thoughts,
    maxTokens: 5000,
    recentFullCount: 3,
  });

  assert.ok(result.includedFull <= 3);
  assert.ok(result.summarized > 0);
  assert.ok(result.context.includes("Earlier Work"));
  assert.ok(result.context.includes("t_7")); // son thought dahil olmalı
});

test("buildCompactContext: empty thoughts", () => {
  const result = buildCompactContext({ thoughts: [], maxTokens: 5000 });
  assert.equal(result.includedFull, 0);
  assert.equal(result.summarized, 0);
});

test("shouldCompact: triggers at threshold", () => {
  const small = [makeThought({ input: "x".repeat(40) })]; // ~10 tokens
  assert.equal(shouldCompact({ thoughts: small, contextWindow: 128000 }), false);

  const big = Array.from({ length: 100 }, () =>
    makeThought({ input: "x".repeat(4000), reasoning: "y".repeat(4000), output: "z".repeat(4000) })
  ); // ~300K tokens
  assert.equal(shouldCompact({ thoughts: big, contextWindow: 128000 }), true);
});

test("computeAdaptiveChunkRatio: reduces for large thoughts", () => {
  const small = [makeThought({ input: "x".repeat(40) })];
  const ratio1 = computeAdaptiveChunkRatio(small, 128000);
  assert.ok(ratio1 >= 0.35); // BASE_CHUNK_RATIO civarı

  const large = Array.from({ length: 5 }, () =>
    makeThought({ input: "x".repeat(60000) }) // ~15K tokens each
  );
  const ratio2 = computeAdaptiveChunkRatio(large, 128000);
  assert.ok(ratio2 < ratio1); // büyük thought'larda oran düşmeli
});

// ─── CONTEXT GUARD TESTS ─────────────────────────────────────

test("resolveContextWindow: known models", () => {
  const opus = resolveContextWindow("claude-opus");
  assert.equal(opus.tokens, 200_000);
  assert.equal(opus.source, "known");

  const gpt = resolveContextWindow("gpt-4o");
  assert.equal(gpt.tokens, 128_000);
});

test("resolveContextWindow: unknown model gets default", () => {
  const unknown = resolveContextWindow("my-custom-model");
  assert.equal(unknown.source, "default");
  assert.equal(unknown.tokens, 128_000);
});

test("evaluateContextWindow: safe", () => {
  const result = evaluateContextWindow({
    model: "claude-opus",
    systemPromptTokens: 2000,
    userPromptTokens: 3000,
    contextTokens: 5000,
  });
  assert.ok(result.isSafe);
  assert.ok(!result.shouldCompact);
  assert.equal(result.totalTokens, 200_000);
});

test("evaluateContextWindow: unsafe (nearly full)", () => {
  const result = evaluateContextWindow({
    model: "gpt-4o-mini",
    systemPromptTokens: 60000,
    userPromptTokens: 50000,
    contextTokens: 15000,
  });
  // 60K + 50K + 15K + 4K reserve = 129K > 128K
  assert.ok(!result.isSafe);
  assert.ok(result.warning);
});

test("guardContextWindow: convenience wrapper", () => {
  const result = guardContextWindow({
    model: "claude-sonnet",
    systemPrompt: "x".repeat(100),
    userPrompt: "y".repeat(200),
    contextText: "z".repeat(300),
  });
  assert.ok(result.isSafe); // 150 tokens << 200K
});

// ─── ERROR TESTS ─────────────────────────────────────────────

test("BlockedError: has correct properties", () => {
  const err = new BlockedError("t_001", "vision", "Low confidence");
  assert.equal(err.thoughtId, "t_001");
  assert.equal(err.phase, "vision");
  assert.equal(err.reason, "Low confidence");
  assert.ok(err.message.includes("vision"));
});

test("BudgetExceededError", () => {
  const err = new BudgetExceededError("chain", 50000, 60000);
  assert.equal(err.budgetType, "chain");
  assert.equal(err.limit, 50000);
  assert.equal(err.used, 60000);
});

test("formatErrorMessage: various types", () => {
  assert.equal(formatErrorMessage(new Error("test")), "test");
  assert.equal(formatErrorMessage("plain string"), "plain string");
  assert.equal(formatErrorMessage(42), "42");
  assert.equal(formatErrorMessage({ key: "value" }), '{"key":"value"}');
});

test("safeJsonParse: valid and invalid", () => {
  assert.deepEqual(safeJsonParse('{"a":1}'), { a: 1 });
  assert.equal(safeJsonParse("not json"), null);
});

test("safeJsonParseOr: fallback", () => {
  assert.deepEqual(safeJsonParseOr("not json", { default: true }), { default: true });
  assert.deepEqual(safeJsonParseOr('{"ok":true}', { default: true }), { ok: true });
});

test("loadJsonFile + saveJsonFile", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "foreman-errors-"));
  const filePath = join(tmpDir, "sub", "test.json");

  // Load non-existent
  assert.equal(loadJsonFile(filePath), undefined);

  // Save + load
  saveJsonFile(filePath, { hello: "world" });
  assert.ok(existsSync(filePath));
  const loaded = loadJsonFile<{ hello: string }>(filePath);
  assert.deepEqual(loaded, { hello: "world" });

  rmSync(tmpDir, { recursive: true });
});
