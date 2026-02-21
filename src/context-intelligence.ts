/**
 * FOREMAN — Context Intelligence
 *
 * Thought-chain aware context management that EXCEEDS OpenClaw.
 *
 * OpenClaw's context management:
 * - Sliding window on chat messages (FIFO drop)
 * - LLM-based summarization of dropped messages
 * - Token estimation (char/4)
 * - Progressive chunk splitting
 *
 * Foreman's context intelligence:
 * 1. LAYER-AWARE BUDGET: Each layer gets a different context share.
 *    Visioner gets 40% (needs full picture), worker gets 20% (tactical).
 *    OpenClaw gives everyone the same budget.
 *
 * 2. THOUGHT RELEVANCE SCORING: Not FIFO — relevance-based retention.
 *    A thought about "TypeScript types" is more relevant when working on
 *    types than when working on CSS. Uses similarity engine.
 *
 * 3. PROGRESSIVE SUMMARIZATION: As chain grows, earlier thoughts get
 *    progressively more compressed. 3 tiers:
 *    - Full (recent): complete thought with reasoning
 *    - Condensed (medium): input + output only
 *    - Headline (old): one-line summary
 *    OpenClaw has binary: full or summarized.
 *
 * 4. DECISION ANCHORING: High-confidence decisions are NEVER dropped
 *    from context regardless of age. They anchor the chain.
 *    OpenClaw drops everything by position.
 *
 * 5. CROSS-CHAIN CONTEXT: When a worker chain needs context from
 *    the parent strategist chain, it gets the relevant parts only.
 *    OpenClaw has no chain hierarchy awareness.
 */

import type { Thought, Layer } from "./types.js";
import { estimateTokens, estimateThoughtTokens } from "./context-compression.js";
import { SimilarityEngine } from "./similarity-engine.js";

// ─── TYPES ───────────────────────────────────────────────────

/** Context tier — how much detail to include */
export type ContextTier = "full" | "condensed" | "headline";

/** A thought with its context tier and relevance score */
export interface ScoredThought {
  thought: Thought;
  tier: ContextTier;
  relevanceScore: number;
  estimatedTokens: number;
}

/** Layer-specific context budget allocation */
export interface LayerBudget {
  layer: Layer;
  /** Share of total context window (0-1) */
  share: number;
  /** Max tokens for this layer's context */
  maxTokens: number;
  /** How many recent thoughts to always include full */
  recentFullCount: number;
}

/** Context build result */
export interface ContextBuildResult {
  /** Compiled context text */
  text: string;
  /** Thoughts included at each tier */
  tiers: { full: number; condensed: number; headline: number };
  /** Anchored decisions (never dropped) */
  anchoredCount: number;
  /** Total estimated tokens */
  estimatedTokens: number;
  /** Thoughts that were excluded */
  excludedCount: number;
}

// ─── CONSTANTS ───────────────────────────────────────────────

/** Layer budget shares (must sum to 1.0) */
const LAYER_BUDGET_SHARES: Record<Layer, number> = {
  visioner: 0.40,    // needs the full picture
  strategist: 0.30,  // needs structure overview
  researcher: 0.15,  // focused, less context needed
  worker: 0.15,      // tactical, most context comes from instructions
};

/** Recent thoughts always included in full per layer */
const LAYER_RECENT_FULL: Record<Layer, number> = {
  visioner: 5,
  strategist: 4,
  researcher: 3,
  worker: 2,
};

/** Decision anchoring threshold — thoughts above this confidence are never dropped */
const ANCHOR_CONFIDENCE_THRESHOLD = 0.85;

/** Categories that are always anchored regardless of confidence */
const ANCHOR_STATUSES: ReadonlySet<string> = new Set(["done"]);

/** Minimum relevance score to include a thought at all */
const MIN_RELEVANCE_SCORE = 0.02;

// ─── LAYER-AWARE BUDGET ──────────────────────────────────────

/**
 * Compute context budget for a specific layer.
 *
 * OpenClaw gives everyone the same budget.
 * Foreman allocates differently: visioner gets 40% of context,
 * worker gets 15%. This matches how humans think —
 * strategic decisions need more context than tactical ones.
 */
export function computeLayerBudget(
  layer: Layer,
  totalContextTokens: number,
  reserveForResponse: number = 4000,
): LayerBudget {
  const available = totalContextTokens - reserveForResponse;
  const share = LAYER_BUDGET_SHARES[layer];
  const maxTokens = Math.floor(available * share);

  return {
    layer,
    share,
    maxTokens,
    recentFullCount: LAYER_RECENT_FULL[layer],
  };
}

// ─── THOUGHT RELEVANCE SCORING ───────────────────────────────

/**
 * Score how relevant each thought is to the current task.
 *
 * OpenClaw uses FIFO — oldest messages get dropped first regardless of content.
 * Foreman scores by RELEVANCE — a thought about "API design" stays in context
 * when you're working on APIs, even if it's old.
 *
 * Scoring factors:
 * 1. Semantic similarity to current input (via TF-IDF)
 * 2. Recency bonus (exponential decay)
 * 3. Confidence bonus (high-confidence thoughts are more valuable)
 * 4. Layer affinity (same-layer thoughts are more relevant)
 * 5. Decision anchor (critical decisions get max score)
 */
export function scoreThoughts(
  thoughts: Thought[],
  currentInput: string,
  currentLayer: Layer,
): ScoredThought[] {
  if (thoughts.length === 0) return [];

  // Build similarity engine from thought outputs
  const simEngine = new SimilarityEngine();
  for (const t of thoughts) {
    const searchText = [t.input, t.output, t.reasoning]
      .filter(Boolean)
      .join(" ");
    simEngine.index(t.id, searchText);
  }
  simEngine.reindex();

  // Score each thought
  const results = simEngine.search(currentInput, thoughts.length, 0);
  const similarityMap = new Map(results.map(r => [r.id, r.score]));

  return thoughts.map((thought, index) => {
    // 1. Semantic similarity (0-1)
    const similarity = similarityMap.get(thought.id) ?? 0;

    // 2. Recency: exponential decay based on position in chain
    //    Most recent = 1.0, decays by ~50% every 5 positions
    const positionFromEnd = thoughts.length - 1 - index;
    const recency = Math.exp(-0.14 * positionFromEnd);

    // 3. Confidence bonus
    const confidenceBonus = thought.confidence * 0.15;

    // 4. Layer affinity — same layer gets a boost
    const layerBonus = thought.layer === currentLayer ? 0.1 : 0;

    // 5. Decision anchor — critical thoughts get max score
    const isAnchored =
      thought.confidence >= ANCHOR_CONFIDENCE_THRESHOLD &&
      ANCHOR_STATUSES.has(thought.status);

    if (isAnchored) {
      return {
        thought,
        tier: "full" as ContextTier,
        relevanceScore: 1.0,
        estimatedTokens: estimateThoughtTokens(thought),
      };
    }

    // Composite score
    const score = Math.min(1.0,
      similarity * 0.35 +
      recency * 0.35 +
      confidenceBonus +
      layerBonus +
      0.05  // base score (everything gets at least 0.05)
    );

    // Determine tier based on score
    let tier: ContextTier;
    if (score >= 0.5 || positionFromEnd < 3) {
      tier = "full";
    } else if (score >= 0.2) {
      tier = "condensed";
    } else {
      tier = "headline";
    }

    return {
      thought,
      tier,
      relevanceScore: score,
      estimatedTokens: estimateThoughtTokensForTier(thought, tier),
    };
  }).sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// ─── PROGRESSIVE SUMMARIZATION ───────────────────────────────

/**
 * Format a thought at a specific tier.
 *
 * OpenClaw: binary (full text or LLM summary).
 * Foreman: 3 tiers without requiring LLM calls.
 *
 * Full:      Input + Reasoning + Output + Worker Protocol
 * Condensed: Input + Output (no reasoning, no protocol)
 * Headline:  "[layer] input → output_first_60_chars" (one line)
 */
export function formatThoughtAtTier(thought: Thought, tier: ContextTier): string {
  switch (tier) {
    case "full": {
      const parts = [
        `### ${thought.id} [${thought.layer}] — ${thought.status}`,
        `**Task:** ${thought.input}`,
      ];
      if (thought.reasoning) {
        parts.push(`**Reasoning:** ${thought.reasoning.slice(0, 500)}`);
      }
      if (thought.output) {
        parts.push(`**Result:** ${thought.output.slice(0, 800)}`);
      }
      if (thought.workerProtocol) {
        parts.push(`**Decision:** ${thought.workerProtocol.step4_decide.slice(0, 300)}`);
        parts.push(`**Verified:** ${thought.workerProtocol.step7_verify.slice(0, 200)}`);
      }
      const conf = `${(thought.confidence * 100).toFixed(0)}%`;
      parts.push(`*Confidence: ${conf}*`);
      return parts.join("\n");
    }

    case "condensed": {
      const output = thought.output
        ? thought.output.slice(0, 200) + (thought.output.length > 200 ? "…" : "")
        : "(no output)";
      return `- **${thought.id}** [${thought.layer}]: ${thought.input.slice(0, 100)} → ${output}`;
    }

    case "headline": {
      const outputSnippet = thought.output
        ? thought.output.slice(0, 60).replace(/\n/g, " ")
        : "…";
      return `- ${thought.id}/${thought.layer}: ${thought.input.slice(0, 50)}… → ${outputSnippet}`;
    }
  }
}

/**
 * Estimate tokens for a thought at a specific tier.
 */
function estimateThoughtTokensForTier(thought: Thought, tier: ContextTier): number {
  switch (tier) {
    case "full":
      return estimateThoughtTokens(thought);
    case "condensed":
      return estimateTokens(
        thought.input.slice(0, 100) + (thought.output ?? "").slice(0, 200),
      ) + 20; // overhead
    case "headline":
      return estimateTokens(
        thought.input.slice(0, 50) + (thought.output ?? "").slice(0, 60),
      ) + 10;
  }
}

// ─── CONTEXT BUILDER ─────────────────────────────────────────

/**
 * Build optimized context for a thought step.
 *
 * This is the main entry point. Combines:
 * - Layer-aware budget allocation
 * - Relevance scoring
 * - Progressive tiering
 * - Decision anchoring
 * - Token budget enforcement
 */
export function buildIntelligentContext(params: {
  /** All thoughts in the chain so far */
  thoughts: Thought[];
  /** Current input (what we're about to think about) */
  currentInput: string;
  /** Which layer is thinking */
  currentLayer: Layer;
  /** Total context window tokens for the model */
  contextWindowTokens: number;
  /** Existing chain summary (if any) */
  chainSummary?: string;
  /** Cross-chain context (from parent chain) */
  parentChainSummary?: string;
}): ContextBuildResult {
  const {
    thoughts, currentInput, currentLayer,
    contextWindowTokens, chainSummary, parentChainSummary,
  } = params;

  const budget = computeLayerBudget(currentLayer, contextWindowTokens);
  let remainingTokens = budget.maxTokens;

  const parts: string[] = [];
  let anchoredCount = 0;
  let excludedCount = 0;
  const tierCounts = { full: 0, condensed: 0, headline: 0 };

  // 1. Parent chain context (cross-chain, max 15% of budget)
  if (parentChainSummary) {
    const parentBudget = Math.floor(budget.maxTokens * 0.15);
    const parentText = parentChainSummary.slice(0, parentBudget * 4);
    const parentTokens = estimateTokens(parentText);
    if (parentTokens < remainingTokens) {
      parts.push(`## Parent Chain Context\n${parentText}`);
      remainingTokens -= parentTokens;
    }
  }

  // 2. Chain summary (max 20% of budget)
  if (chainSummary) {
    const summaryBudget = Math.floor(budget.maxTokens * 0.20);
    const summaryText = chainSummary.slice(0, summaryBudget * 4);
    const summaryTokens = estimateTokens(summaryText);
    if (summaryTokens < remainingTokens) {
      parts.push(`## Chain Summary\n${summaryText}`);
      remainingTokens -= summaryTokens;
    }
  }

  // 3. Score and tier all thoughts
  const scored = scoreThoughts(thoughts, currentInput, currentLayer);

  // 4. Add thoughts by relevance (highest first), respecting budget
  const fullThoughts: string[] = [];
  const condensedThoughts: string[] = [];
  const headlineThoughts: string[] = [];

  for (const item of scored) {
    if (item.estimatedTokens > remainingTokens) {
      // Try downgrading tier
      const downgraded = downgrade(item);
      if (downgraded && downgraded.estimatedTokens <= remainingTokens) {
        const text = formatThoughtAtTier(downgraded.thought, downgraded.tier);
        addToTier(downgraded.tier, text);
        remainingTokens -= downgraded.estimatedTokens;
        tierCounts[downgraded.tier]++;
        continue;
      }
      excludedCount++;
      continue;
    }

    if (item.relevanceScore < MIN_RELEVANCE_SCORE) {
      excludedCount++;
      continue;
    }

    const text = formatThoughtAtTier(item.thought, item.tier);
    addToTier(item.tier, text);
    remainingTokens -= item.estimatedTokens;
    tierCounts[item.tier]++;

    if (item.relevanceScore >= 1.0) anchoredCount++;
  }

  // 5. Assemble final context
  if (headlineThoughts.length > 0) {
    parts.push(`## Earlier Work (${headlineThoughts.length} thoughts)\n${headlineThoughts.join("\n")}`);
  }
  if (condensedThoughts.length > 0) {
    parts.push(`## Recent Context\n${condensedThoughts.join("\n\n")}`);
  }
  if (fullThoughts.length > 0) {
    parts.push(`## Current Context\n${fullThoughts.join("\n\n")}`);
  }

  const text = parts.join("\n\n");

  return {
    text,
    tiers: tierCounts,
    anchoredCount,
    estimatedTokens: budget.maxTokens - remainingTokens,
    excludedCount,
  };

  function addToTier(tier: ContextTier, text: string) {
    switch (tier) {
      case "full": fullThoughts.push(text); break;
      case "condensed": condensedThoughts.push(text); break;
      case "headline": headlineThoughts.push(text); break;
    }
  }
}

/**
 * Downgrade a thought to a cheaper tier.
 */
function downgrade(item: ScoredThought): ScoredThought | null {
  const nextTier: Record<ContextTier, ContextTier | null> = {
    full: "condensed",
    condensed: "headline",
    headline: null,
  };

  const newTier = nextTier[item.tier];
  if (!newTier) return null;

  return {
    ...item,
    tier: newTier,
    estimatedTokens: estimateThoughtTokensForTier(item.thought, newTier),
  };
}

// ─── CROSS-CHAIN CONTEXT ─────────────────────────────────────

/**
 * Extract relevant context from a parent chain for a child chain.
 *
 * OpenClaw has no chain hierarchy.
 * Foreman's fractal decomposition means worker chains are children
 * of strategist chains. The worker needs strategic context but
 * not all of it — only the relevant parts.
 */
export function extractCrossChainContext(
  parentThoughts: Thought[],
  childGoal: string,
  maxTokens: number = 2000,
): string {
  if (parentThoughts.length === 0) return "";

  // Score parent thoughts by relevance to child's goal
  const simEngine = new SimilarityEngine();
  for (const t of parentThoughts) {
    simEngine.index(t.id, `${t.input} ${t.output ?? ""}`);
  }
  simEngine.reindex();

  const results = simEngine.search(childGoal, 5, 0.05);
  const parts: string[] = [];
  let usedTokens = 0;

  for (const result of results) {
    const thought = parentThoughts.find(t => t.id === result.id);
    if (!thought) continue;

    const line = `- [${thought.layer}] ${thought.input.slice(0, 80)}: ${(thought.output ?? "").slice(0, 150)}`;
    const lineTokens = estimateTokens(line);

    if (usedTokens + lineTokens > maxTokens) break;
    parts.push(line);
    usedTokens += lineTokens;
  }

  return parts.join("\n");
}
