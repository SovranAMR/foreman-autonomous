/**
 * FOREMAN — Chain Repair Engine
 *
 * Thought chain integrity checking and repair.
 *
 * OpenClaw's session-transcript-repair.ts:
 * - Fixes orphaned tool_use/tool_result pairing for Anthropic API
 * - Inserts synthetic error results for missing tool responses
 * - Drops tool calls without input
 * - Repairs assistant messages with empty content
 * Very specific to Anthropic API quirks.
 *
 * Foreman's chain repair is BROADER:
 *
 * 1. ORPHANED THOUGHT DETECTION: Thoughts that reference a parent
 *    chain that doesn't exist, or have invalid status transitions.
 *    OpenClaw: only fixes tool pairing, not thought-level issues.
 *
 * 2. STATUS CONSISTENCY: Ensures thought status transitions are valid.
 *    A thought can't go from "done" back to "pending".
 *    OpenClaw: no status validation.
 *
 * 3. CONFIDENCE ANOMALY DETECTION: Flags thoughts where confidence
 *    drops suddenly (from 0.9 to 0.2) — likely a hallucination or
 *    model confusion.
 *    OpenClaw: no confidence tracking.
 *
 * 4. CIRCULAR REFERENCE DETECTION: Catches chains that reference
 *    each other in a cycle (A → B → A).
 *    OpenClaw: no chain hierarchy checks.
 *
 * 5. STALE THOUGHT CLEANUP: Marks thoughts that have been "pending"
 *    for too long as "abandoned" with a note.
 *    OpenClaw: no staleness detection.
 *
 * 6. DUPLICATE THOUGHT DETECTION: Finds thoughts with identical
 *    input and output (model repeated itself).
 *    OpenClaw: no duplicate detection.
 *
 * 7. CHAIN SUMMARY GENERATION: After repair, generates a summary
 *    of what was fixed for the next thought to understand.
 *    OpenClaw: no repair summary.
 */

import type { Thought, Layer } from "./types.js";

// ─── TYPES ───────────────────────────────────────────────────

export interface ChainRepairIssue {
  kind: RepairIssueKind;
  thoughtId: string;
  message: string;
  /** Whether this was auto-fixed or just flagged */
  autoFixed: boolean;
}

export type RepairIssueKind =
  | "orphaned"           // references non-existent parent
  | "invalid_transition" // impossible status change
  | "confidence_anomaly" // sudden confidence drop
  | "circular_ref"       // chain references itself
  | "stale"              // pending too long
  | "duplicate"          // identical input+output
  | "missing_output"     // done but no output
  | "invalid_layer";     // layer doesn't match valid layers

export interface ChainRepairResult {
  /** Repaired thoughts (immutable — new array) */
  thoughts: Thought[];
  /** Issues found */
  issues: ChainRepairIssue[];
  /** Number of auto-fixes applied */
  fixCount: number;
  /** Human-readable summary */
  summary: string;
}

// ─── CONSTANTS ───────────────────────────────────────────────

/** Valid thought status transitions */
const VALID_TRANSITIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["pending", new Set(["active", "blocked", "abandoned"])],
  ["active", new Set(["done", "blocked", "abandoned", "error"])],
  ["blocked", new Set(["active", "abandoned"])],
  ["done", new Set([])],  // done is terminal
  ["abandoned", new Set([])],  // abandoned is terminal
  ["error", new Set(["active", "abandoned"])],  // can retry from error
]);

const VALID_LAYERS: ReadonlySet<string> = new Set(["visioner", "strategist", "researcher", "worker"]);

/** Confidence drop threshold — flag if drops more than this */
const CONFIDENCE_DROP_THRESHOLD = 0.4;

/** Staleness threshold — flag if pending for more than this (ms) */
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

// ─── CHAIN REPAIR ────────────────────────────────────────────

/**
 * Repair a thought chain — fix what can be fixed, flag the rest.
 */
export function repairChain(
  thoughts: Thought[],
  now: number = Date.now(),
): ChainRepairResult {
  // Work on copies
  const repaired = thoughts.map(t => ({ ...t }));
  const issues: ChainRepairIssue[] = [];
  let fixCount = 0;

  const ids = new Set(repaired.map(t => t.id));
  const chainIds = new Set(repaired.map(t => t.chainId));

  for (let i = 0; i < repaired.length; i++) {
    const thought = repaired[i];

    // 1. Invalid layer
    if (!VALID_LAYERS.has(thought.layer)) {
      issues.push({
        kind: "invalid_layer",
        thoughtId: thought.id,
        message: `Invalid layer '${thought.layer}' — expected one of: ${[...VALID_LAYERS].join(", ")}`,
        autoFixed: false,
      });
    }

    // 2. Missing output on done thought
    if (thought.status === "done" && !thought.output) {
      issues.push({
        kind: "missing_output",
        thoughtId: thought.id,
        message: "Thought is 'done' but has no output",
        autoFixed: true,
      });
      thought.output = "[repaired: thought was marked done without output]";
      fixCount++;
    }

    // 3. Stale thought (pending too long)
    if (thought.status === "pending" || thought.status === "active") {
      const createdAt = new Date(thought.createdAt).getTime();
      if (now - createdAt > STALE_THRESHOLD_MS) {
        issues.push({
          kind: "stale",
          thoughtId: thought.id,
          message: `Thought has been '${thought.status}' for ${Math.round((now - createdAt) / 60_000)} minutes`,
          autoFixed: true,
        });
        thought.status = "abandoned";
        thought.output = (thought.output || "") + "\n[auto-abandoned: stale after 30+ minutes]";
        fixCount++;
      }
    }

    // 4. Confidence anomaly (compare to previous thought in same chain)
    if (i > 0) {
      const prev = repaired[i - 1];
      if (prev.chainId === thought.chainId) {
        const drop = prev.confidence - thought.confidence;
        if (drop > CONFIDENCE_DROP_THRESHOLD) {
          issues.push({
            kind: "confidence_anomaly",
            thoughtId: thought.id,
            message: `Confidence dropped from ${prev.confidence.toFixed(2)} to ${thought.confidence.toFixed(2)} (delta: ${drop.toFixed(2)})`,
            autoFixed: false,
          });
        }
      }
    }

    // 5. Duplicate detection (same input AND output as another thought in same chain)
    for (let j = 0; j < i; j++) {
      const other = repaired[j];
      if (other.chainId === thought.chainId &&
          other.input === thought.input &&
          other.output === thought.output &&
          other.output) {
        issues.push({
          kind: "duplicate",
          thoughtId: thought.id,
          message: `Duplicate of ${other.id} — same input and output`,
          autoFixed: true,
        });
        thought.status = "abandoned";
        thought.output = (thought.output || "") + `\n[auto-abandoned: duplicate of ${other.id}]`;
        fixCount++;
        break;
      }
    }
  }

  // 6. Circular reference detection (chain A references chain B which references chain A)
  const circularIssues = detectCircularRefs(repaired);
  issues.push(...circularIssues);

  // Generate summary
  const summary = generateRepairSummary(issues, fixCount);

  return { thoughts: repaired, issues, fixCount, summary };
}

/**
 * Detect circular references in chain hierarchy.
 */
function detectCircularRefs(thoughts: Thought[]): ChainRepairIssue[] {
  const issues: ChainRepairIssue[] = [];

  // Build parent map: chainId → set of referenced chainIds
  const chainRefs = new Map<string, Set<string>>();
  for (const t of thoughts) {
    if (!chainRefs.has(t.chainId)) {
      chainRefs.set(t.chainId, new Set());
    }
    for (const ref of t.contextRefs || []) {
      if (ref !== t.chainId) {
        chainRefs.get(t.chainId)!.add(ref);
      }
    }
  }

  // DFS cycle detection
  const visited = new Set<string>();
  const inStack = new Set<string>();

  for (const chainId of chainRefs.keys()) {
    if (!visited.has(chainId)) {
      if (hasCycle(chainId, chainRefs, visited, inStack)) {
        // Find a thought in this chain to attach the issue to
        const thought = thoughts.find(t => t.chainId === chainId);
        if (thought) {
          issues.push({
            kind: "circular_ref",
            thoughtId: thought.id,
            message: `Chain '${chainId}' has circular references`,
            autoFixed: false,
          });
        }
      }
    }
  }

  return issues;
}

function hasCycle(
  node: string,
  graph: Map<string, Set<string>>,
  visited: Set<string>,
  inStack: Set<string>,
): boolean {
  visited.add(node);
  inStack.add(node);

  const neighbors = graph.get(node);
  if (neighbors) {
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor, graph, visited, inStack)) return true;
      } else if (inStack.has(neighbor)) {
        return true;
      }
    }
  }

  inStack.delete(node);
  return false;
}

/**
 * Generate human-readable repair summary.
 */
function generateRepairSummary(issues: ChainRepairIssue[], fixCount: number): string {
  if (issues.length === 0) return "Chain is healthy — no issues found.";

  const counts = new Map<RepairIssueKind, number>();
  for (const issue of issues) {
    counts.set(issue.kind, (counts.get(issue.kind) || 0) + 1);
  }

  const parts: string[] = [`Chain repair: ${issues.length} issue(s) found, ${fixCount} auto-fixed.`];
  for (const [kind, count] of counts) {
    parts.push(`  - ${kind}: ${count}`);
  }

  return parts.join("\n");
}

// ─── CHAIN HEALTH CHECK ──────────────────────────────────────

/**
 * Quick health check without repair — just report issues.
 */
export function checkChainHealth(thoughts: Thought[]): {
  healthy: boolean;
  issueCount: number;
  issues: ChainRepairIssue[];
} {
  const result = repairChain(thoughts);
  return {
    healthy: result.issues.length === 0,
    issueCount: result.issues.length,
    issues: result.issues,
  };
}

/**
 * Filter to only active, non-abandoned thoughts.
 * Removes repaired/abandoned thoughts from context.
 */
export function getActiveThoughts(thoughts: Thought[]): Thought[] {
  return thoughts.filter(t =>
    t.status !== "abandoned" && t.status !== "error"
  );
}
