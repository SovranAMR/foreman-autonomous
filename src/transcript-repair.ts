/**
 * FOREMAN — Transcript Repair
 *
 * Repairs thought chain transcripts after compaction/pruning.
 *
 * When older thoughts are dropped during compaction, tool_call/tool_result
 * pairs can become orphaned — a tool_result exists without its matching
 * tool_call (or vice versa). This causes API errors:
 * "unexpected tool_use_id" (Anthropic), "invalid tool call" (OpenAI).
 *
 * OpenClaw's session-transcript-repair.ts: Repairs AgentMessage arrays
 * by scanning for orphaned tool_results and dropping them. Tightly
 * coupled to pi-agent-core's AgentMessage type.
 *
 * Foreman's Transcript Repair — 5 capabilities that EXCEED OpenClaw:
 *
 * 1. THOUGHT-LEVEL REPAIR: Operates on Thought arrays, not messages.
 *    Understands tool calls within thought.output and thought.workerProtocol.
 *    OpenClaw: operates on flat message arrays.
 *
 * 2. BIDIRECTIONAL ORPHAN DETECTION: Finds both orphaned results
 *    (result without call) AND orphaned calls (call without result).
 *    OpenClaw: only detects orphaned results.
 *
 * 3. CONTEXTREF INTEGRITY: Repairs broken contextRef chains.
 *    If thought A references thought B but B was pruned,
 *    the reference is removed (not left dangling).
 *    OpenClaw: no contextRef concept.
 *
 * 4. CHAIN CONTINUITY: Ensures the thought chain has valid
 *    layer transitions after pruning (visioner→strategist→researcher→worker).
 *    Inserts synthetic "context was pruned" markers at gaps.
 *    OpenClaw: no chain awareness.
 *
 * 5. REPAIR REPORT: Structured report of all repairs made.
 *    OpenClaw: returns count only.
 */

import type { Thought, Layer } from "./types.js";

// ─── TYPES ───────────────────────────────────────────────────

export interface TranscriptRepairReport {
  /** Orphaned tool results dropped */
  droppedOrphanResults: number;
  /** Orphaned tool calls dropped */
  droppedOrphanCalls: number;
  /** Broken contextRefs removed */
  repairedContextRefs: number;
  /** Layer gap markers inserted */
  insertedGapMarkers: number;
  /** Total repairs made */
  totalRepairs: number;
  /** Repaired thought IDs */
  repairedThoughtIds: string[];
}

export interface ToolCallRef {
  id: string;
  name: string;
  thoughtId: string;
}

export interface ToolResultRef {
  callId: string;
  thoughtId: string;
}

// ─── CONSTANTS ───────────────────────────────────────────────

/** Patterns that indicate tool call in thought output */
const TOOL_CALL_PATTERN = /\[TOOL_CALL:([^\]]+)\]\s*(\{[^}]*\})?/g;
const TOOL_RESULT_PATTERN = /\[TOOL_RESULT:([^\]]+)\]/g;

/** Valid layer transitions (each layer can follow these) */
const VALID_PREDECESSORS: Record<Layer, Layer[]> = {
  visioner: [], // visioner can be first
  strategist: ["visioner", "strategist"],
  researcher: ["strategist", "researcher", "visioner"],
  worker: ["researcher", "strategist", "worker"],
};

// ─── REPAIR FUNCTIONS ────────────────────────────────────────

/**
 * Extract tool call references from a thought's output.
 */
export function extractToolCalls(thought: Thought): ToolCallRef[] {
  const refs: ToolCallRef[] = [];
  const text = gatherToolText(thought);

  for (const match of text.matchAll(TOOL_CALL_PATTERN)) {
    refs.push({
      id: match[1].trim(),
      name: match[2] ? match[2].trim() : "",
      thoughtId: thought.id,
    });
  }

  return refs;
}

/**
 * Extract tool result references from a thought's output.
 */
export function extractToolResults(thought: Thought): ToolResultRef[] {
  const refs: ToolResultRef[] = [];
  const text = gatherToolText(thought);

  for (const match of text.matchAll(TOOL_RESULT_PATTERN)) {
    refs.push({
      callId: match[1].trim(),
      thoughtId: thought.id,
    });
  }

  return refs;
}

/**
 * Gather all text that might contain tool references.
 */
function gatherToolText(thought: Thought): string {
  const parts: string[] = [];
  if (thought.output) parts.push(thought.output);
  if (thought.reasoning) parts.push(thought.reasoning);
  if (thought.workerProtocol) {
    for (const step of Object.values(thought.workerProtocol)) {
      if (typeof step === "string") parts.push(step);
    }
  }
  return parts.join("\n");
}

/**
 * Remove tool references from text.
 */
function removeToolRef(text: string, id: string): string {
  return text
    .replace(new RegExp(`\\[TOOL_CALL:${escapeRegex(id)}\\][^\\n]*`, "g"), "[pruned tool call]")
    .replace(new RegExp(`\\[TOOL_RESULT:${escapeRegex(id)}\\][^\\n]*`, "g"), "[pruned tool result]");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── MAIN REPAIR ─────────────────────────────────────────────

/**
 * Repair a thought chain transcript after compaction.
 *
 * Returns the repaired array and a report of changes.
 */
export function repairTranscript(thoughts: Thought[]): {
  thoughts: Thought[];
  report: TranscriptRepairReport;
} {
  if (thoughts.length === 0) {
    return {
      thoughts: [],
      report: emptyReport(),
    };
  }

  // Work on copies to avoid mutation
  let repaired = thoughts.map(t => ({ ...t }));
  const report = emptyReport();

  // 1. Repair orphaned tool calls/results
  const toolRepair = repairToolPairing(repaired);
  repaired = toolRepair.thoughts;
  report.droppedOrphanResults += toolRepair.droppedResults;
  report.droppedOrphanCalls += toolRepair.droppedCalls;
  report.repairedThoughtIds.push(...toolRepair.repairedIds);

  // 2. Repair broken contextRefs
  const refRepair = repairContextRefs(repaired);
  repaired = refRepair.thoughts;
  report.repairedContextRefs += refRepair.repairedCount;
  report.repairedThoughtIds.push(...refRepair.repairedIds);

  // 3. Insert gap markers for layer discontinuities
  const gapRepair = repairLayerGaps(repaired);
  repaired = gapRepair.thoughts;
  report.insertedGapMarkers += gapRepair.insertedCount;

  // Dedupe repaired IDs
  report.repairedThoughtIds = [...new Set(report.repairedThoughtIds)];
  report.totalRepairs = report.droppedOrphanResults + report.droppedOrphanCalls +
    report.repairedContextRefs + report.insertedGapMarkers;

  return { thoughts: repaired, report };
}

// ─── TOOL PAIRING REPAIR ─────────────────────────────────────

function repairToolPairing(thoughts: Thought[]): {
  thoughts: Thought[];
  droppedResults: number;
  droppedCalls: number;
  repairedIds: string[];
} {
  // Collect all tool calls and results
  const allCalls = new Map<string, ToolCallRef>();
  const allResults = new Map<string, ToolResultRef>();

  for (const thought of thoughts) {
    for (const call of extractToolCalls(thought)) {
      allCalls.set(call.id, call);
    }
    for (const result of extractToolResults(thought)) {
      allResults.set(result.callId, result);
    }
  }

  // Find orphans
  const orphanResults: string[] = [];
  for (const [callId, result] of allResults) {
    if (!allCalls.has(callId)) {
      orphanResults.push(callId);
    }
  }

  const orphanCalls: string[] = [];
  for (const [callId, call] of allCalls) {
    if (!allResults.has(callId)) {
      orphanCalls.push(callId);
    }
  }

  if (orphanResults.length === 0 && orphanCalls.length === 0) {
    return { thoughts, droppedResults: 0, droppedCalls: 0, repairedIds: [] };
  }

  const repairedIds: string[] = [];
  const repaired = thoughts.map(thought => {
    let modified = false;
    let output = thought.output || "";
    let reasoning = thought.reasoning || "";

    for (const id of [...orphanResults, ...orphanCalls]) {
      const beforeOutput = output;
      const beforeReasoning = reasoning;
      output = removeToolRef(output, id);
      reasoning = removeToolRef(reasoning, id);
      if (output !== beforeOutput || reasoning !== beforeReasoning) {
        modified = true;
      }
    }

    if (modified) {
      repairedIds.push(thought.id);
      return { ...thought, output, reasoning };
    }
    return thought;
  });

  return {
    thoughts: repaired,
    droppedResults: orphanResults.length,
    droppedCalls: orphanCalls.length,
    repairedIds,
  };
}

// ─── CONTEXTREF REPAIR ───────────────────────────────────────

function repairContextRefs(thoughts: Thought[]): {
  thoughts: Thought[];
  repairedCount: number;
  repairedIds: string[];
} {
  const validIds = new Set(thoughts.map(t => t.id));
  let repairedCount = 0;
  const repairedIds: string[] = [];

  const repaired = thoughts.map(thought => {
    if (!thought.contextRefs || thought.contextRefs.length === 0) {
      return thought;
    }

    const validRefs = thought.contextRefs.filter(ref => validIds.has(ref));
    const droppedCount = thought.contextRefs.length - validRefs.length;

    if (droppedCount > 0) {
      repairedCount += droppedCount;
      repairedIds.push(thought.id);
      return { ...thought, contextRefs: validRefs };
    }

    return thought;
  });

  return { thoughts: repaired, repairedCount, repairedIds };
}

// ─── LAYER GAP REPAIR ────────────────────────────────────────

function repairLayerGaps(thoughts: Thought[]): {
  thoughts: Thought[];
  insertedCount: number;
} {
  if (thoughts.length < 2) {
    return { thoughts, insertedCount: 0 };
  }

  const result: Thought[] = [thoughts[0]];
  let insertedCount = 0;

  for (let i = 1; i < thoughts.length; i++) {
    const prev = thoughts[i - 1];
    const current = thoughts[i];

    // Check if this is a valid transition
    const validPreds = VALID_PREDECESSORS[current.layer];
    if (validPreds && validPreds.length > 0 && !validPreds.includes(prev.layer)) {
      // Insert gap marker
      const marker: Thought = {
        id: `gap_${prev.id}_${current.id}`,
        chainId: current.chainId,
        layer: prev.layer,
        input: "[context pruned — intermediate thoughts removed during compaction]",
        output: `Gap: ${prev.layer} → ${current.layer}. Intermediate thoughts were compacted.`,
        contextRefs: [],
        reasoning: "[auto-generated gap marker]",
        confidence: 0.5,
        needsResearch: false,
        needsVerification: false,
        status: "done",
        createdAt: prev.createdAt,
      };
      result.push(marker);
      insertedCount++;
    }

    result.push(current);
  }

  return { thoughts: result, insertedCount };
}

// ─── HELPERS ─────────────────────────────────────────────────

function emptyReport(): TranscriptRepairReport {
  return {
    droppedOrphanResults: 0,
    droppedOrphanCalls: 0,
    repairedContextRefs: 0,
    insertedGapMarkers: 0,
    totalRepairs: 0,
    repairedThoughtIds: [],
  };
}
