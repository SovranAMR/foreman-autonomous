/**
 * FOREMAN — Context Compression
 *
 * Adapted from OpenClaw compaction.ts.
 *
 * When long thought chains fill up the context window:
 * 1. Summarize old thoughts (via LLM)
 * 2. Write the summary to chain.contextSummary
 * 3. Use summary instead of full thoughts
 *
 * Differences from OpenClaw:
 * - Uses Thought instead of AgentMessage
 * - Simple character/4 token estimation (similar to OpenClaw)
 * - Chunk splitting token-aware
 * - Fallback: demote oversized thoughts to notes
 */

import type { Thought, Layer } from "./types.js";

// ─── TOKEN ESTIMATION ────────────────────────────────────────

/** Basit token tahmini: ~4 karakter = 1 token */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Thought'un tahmini token maliyeti */
export function estimateThoughtTokens(thought: Thought): number {
  let total = 0;
  total += estimateTokens(thought.input);
  if (thought.reasoning) total += estimateTokens(thought.reasoning);
  if (thought.output) total += estimateTokens(thought.output);
  if (thought.researchFindings) total += estimateTokens(thought.researchFindings);
  if (thought.workerProtocol) {
    for (const step of Object.values(thought.workerProtocol)) {
      total += estimateTokens(step);
    }
  }
  return total;
}

/** Thought listesinin toplam token tahmini */
export function estimateThoughtsTokens(thoughts: Thought[]): number {
  return thoughts.reduce((sum, t) => sum + estimateThoughtTokens(t), 0);
}

// ─── CHUNK SPLITTING ─────────────────────────────────────────

/**
 * Split thoughts into chunks by token budget.
 * Adapted from OpenClaw chunkMessagesByMaxTokens.
 */
export function chunkThoughtsByTokens(
  thoughts: Thought[],
  maxTokensPerChunk: number,
): Thought[][] {
  if (thoughts.length === 0) return [];

  const chunks: Thought[][] = [];
  let current: Thought[] = [];
  let currentTokens = 0;

  for (const thought of thoughts) {
    const tokens = estimateThoughtTokens(thought);

    if (current.length > 0 && currentTokens + tokens > maxTokensPerChunk) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }

    current.push(thought);
    currentTokens += tokens;

    // If a single thought is larger than a chunk — put it in its own chunk
    if (tokens > maxTokensPerChunk) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

// ─── CONTEXT BUILDER ─────────────────────────────────────────

/**
 * Build compact context text from thoughts.
 *
 * Strategy:
 * 1. Include last N thoughts in full (freshness)
 * 2. Reduce older thoughts to their summaries
 * 3. Do not exceed the total token budget
 */
export function buildCompactContext(params: {
  thoughts: Thought[];
  maxTokens: number;
  /** How many recent thoughts to include in full (default: 3) */
  recentFullCount?: number;
  /** Mevcut chain context summary */
  existingSummary?: string;
}): {
  context: string;
  includedFull: number;
  summarized: number;
  estimatedTokens: number;
} {
  const { thoughts, maxTokens } = params;
  const recentFullCount = params.recentFullCount ?? 3;

  if (thoughts.length === 0) {
    const fallback = params.existingSummary || "";
    return {
      context: fallback,
      includedFull: 0,
      summarized: 0,
      estimatedTokens: estimateTokens(fallback),
    };
  }

  const parts: string[] = [];
  let usedTokens = 0;

  // 1. Mevcut summary varsa ekle
  if (params.existingSummary) {
    const summaryTokens = estimateTokens(params.existingSummary);
    if (usedTokens + summaryTokens < maxTokens * 0.3) { // summary should take max 30%
      parts.push(`## Previous Context\n${params.existingSummary}`);
      usedTokens += summaryTokens;
    }
  }

  // 2. Son N thought'u tam dahil et
  const recentStart = Math.max(0, thoughts.length - recentFullCount);
  const recentThoughts = thoughts.slice(recentStart);
  const olderThoughts = thoughts.slice(0, recentStart);

  // 3. Add older thoughts as summaries
  let summarizedCount = 0;
  if (olderThoughts.length > 0) {
    const summaryLines: string[] = [];

    for (const t of olderThoughts) {
      const conf = `${(t.confidence * 100).toFixed(0)}%`;
      const line = `- [${t.id}/${t.layer}] ${t.input.slice(0, 60)}… → ${(t.output || "").slice(0, 80)}… (${conf})`;
      const lineTokens = estimateTokens(line);

      if (usedTokens + lineTokens > maxTokens * 0.5) break; // older thoughts max 50%

      summaryLines.push(line);
      usedTokens += lineTokens;
      summarizedCount++;
    }

    if (summaryLines.length > 0) {
      parts.push(`## Earlier Work (${summaryLines.length} thoughts)\n${summaryLines.join("\n")}`);
    }
  }

  // 4. Include recent thoughts in full
  let includedFull = 0;
  for (const t of recentThoughts) {
    const section = formatThoughtForContext(t);
    const sectionTokens = estimateTokens(section);

    if (usedTokens + sectionTokens > maxTokens) break;

    parts.push(section);
    usedTokens += sectionTokens;
    includedFull++;
  }

  return {
    context: parts.join("\n\n"),
    includedFull,
    summarized: summarizedCount,
    estimatedTokens: usedTokens,
  };
}

/**
 * Tek thought'u context metni olarak formatla.
 */
function formatThoughtForContext(t: Thought): string {
  const confLabel = t.confidence >= 0.8 ? "HIGH" : t.confidence >= 0.5 ? "MEDIUM" : "LOW";
  const lines: string[] = [
    `### ${t.id} [${t.layer}] (${confLabel} confidence)`,
    `Task: ${t.input}`,
  ];

  if (t.output) {
    lines.push(`Result: ${t.output.slice(0, 500)}`);
  }

  if (t.reasoning && t.reasoning !== t.output) {
    lines.push(`Reasoning: ${t.reasoning.slice(0, 300)}`);
  }

  if (t.workerProtocol) {
    lines.push(`Decision: ${t.workerProtocol.step4_decide.slice(0, 200)}`);
    lines.push(`Verified: ${t.workerProtocol.step7_verify.slice(0, 200)}`);
  }

  return lines.join("\n");
}

// ─── ADAPTIVE CHUNK RATIO ────────────────────────────────────

const BASE_CHUNK_RATIO = 0.4;
const MIN_CHUNK_RATIO = 0.15;
const SAFETY_MARGIN = 1.2;

/**
 * Calculate adaptive chunk ratio based on thought size.
 * Adapted from OpenClaw computeAdaptiveChunkRatio.
 */
export function computeAdaptiveChunkRatio(
  thoughts: Thought[],
  contextWindow: number,
): number {
  if (thoughts.length === 0) return BASE_CHUNK_RATIO;

  const totalTokens = estimateThoughtsTokens(thoughts);
  const avgTokens = (totalTokens / thoughts.length) * SAFETY_MARGIN;
  const avgRatio = avgTokens / contextWindow;

  // If average thought is larger than 10% of the context, reduce chunk ratio
  if (avgRatio > 0.1) {
    const reduction = Math.min(avgRatio * 2, BASE_CHUNK_RATIO - MIN_CHUNK_RATIO);
    return Math.max(MIN_CHUNK_RATIO, BASE_CHUNK_RATIO - reduction);
  }

  return BASE_CHUNK_RATIO;
}

// ─── SHOULD COMPACT ──────────────────────────────────────────

/**
 * Is compaction needed?
 * Returns true if the thought chain exceeds a certain ratio of the context window.
 */
export function shouldCompact(params: {
  thoughts: Thought[];
  contextWindow: number;
  threshold?: number;  // default: 0.6 — compact when exceeding 60% of context
}): boolean {
  const threshold = params.threshold ?? 0.6;
  const totalTokens = estimateThoughtsTokens(params.thoughts);
  return totalTokens > params.contextWindow * threshold;
}
