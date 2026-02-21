/**
 * FOREMAN — Transcript Repair Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  repairTranscript,
  extractToolCalls,
  extractToolResults,
} from "./transcript-repair.js";
import type { Thought } from "./types.js";

function makeThought(overrides: Partial<Thought> & { id: string; layer: Thought["layer"] }): Thought {
  return {
    chainId: "chain_1",
    input: "test input",
    output: "",
    contextRefs: [],
    confidence: 0.8,
    status: "done",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── TOOL EXTRACTION ─────────────────────────────────────────

describe("tool extraction", () => {
  it("extracts tool calls from output", () => {
    const thought = makeThought({
      id: "t_001", layer: "worker",
      output: "Running [TOOL_CALL:call_123] {bash} for build",
    });
    const calls = extractToolCalls(thought);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, "call_123");
  });

  it("extracts tool results from output", () => {
    const thought = makeThought({
      id: "t_002", layer: "worker",
      output: "Got [TOOL_RESULT:call_123] success",
    });
    const results = extractToolResults(thought);
    assert.equal(results.length, 1);
    assert.equal(results[0].callId, "call_123");
  });

  it("extracts from worker protocol steps", () => {
    const thought = makeThought({
      id: "t_003", layer: "worker",
      output: "",
      workerProtocol: {
        step1_understand: "read the file",
        step2_plan: "edit it",
        step3_clarify: "clear",
        step4_decide: "proceed",
        step5_prep: "ready",
        step6_execute: "[TOOL_CALL:exec_001] {bash}",
        step7_verify: "[TOOL_RESULT:exec_001] pass",
        step8_report: "done",
      },
    });
    const calls = extractToolCalls(thought);
    const results = extractToolResults(thought);
    assert.equal(calls.length, 1);
    assert.equal(results.length, 1);
  });

  it("extracts multiple tool refs", () => {
    const thought = makeThought({
      id: "t_004", layer: "worker",
      output: "[TOOL_CALL:a] [TOOL_CALL:b] [TOOL_RESULT:a] [TOOL_RESULT:b]",
    });
    assert.equal(extractToolCalls(thought).length, 2);
    assert.equal(extractToolResults(thought).length, 2);
  });
});

// ─── ORPHAN REPAIR ───────────────────────────────────────────

describe("orphan repair", () => {
  it("repairs orphaned tool results", () => {
    // Result exists but its call was in a pruned thought
    const thoughts = [
      makeThought({
        id: "t_002", layer: "worker",
        output: "Got [TOOL_RESULT:call_999] from pruned thought",
      }),
    ];

    const { thoughts: repaired, report } = repairTranscript(thoughts);
    assert.equal(report.droppedOrphanResults, 1);
    assert.ok(!repaired[0].output.includes("[TOOL_RESULT:call_999]"));
    assert.ok(repaired[0].output.includes("[pruned tool result]"));
  });

  it("repairs orphaned tool calls", () => {
    // Call exists but its result was in a pruned thought
    const thoughts = [
      makeThought({
        id: "t_001", layer: "worker",
        output: "Ran [TOOL_CALL:call_888] awaiting result",
      }),
    ];

    const { report } = repairTranscript(thoughts);
    assert.equal(report.droppedOrphanCalls, 1);
  });

  it("leaves matched pairs intact", () => {
    const thoughts = [
      makeThought({
        id: "t_001", layer: "worker",
        output: "[TOOL_CALL:call_100] running bash",
      }),
      makeThought({
        id: "t_002", layer: "worker",
        output: "[TOOL_RESULT:call_100] success",
      }),
    ];

    const { report } = repairTranscript(thoughts);
    assert.equal(report.droppedOrphanResults, 0);
    assert.equal(report.droppedOrphanCalls, 0);
    assert.equal(report.totalRepairs, 0);
  });
});

// ─── CONTEXTREF REPAIR ───────────────────────────────────────

describe("contextRef repair", () => {
  it("removes refs to pruned thoughts", () => {
    const thoughts = [
      makeThought({
        id: "t_003", layer: "worker",
        contextRefs: ["t_001", "t_002", "t_003"],
        // t_001 and t_002 were pruned — not in this array
      }),
    ];

    const { thoughts: repaired, report } = repairTranscript(thoughts);
    assert.equal(report.repairedContextRefs, 2); // t_001 and t_002 removed
    assert.deepEqual(repaired[0].contextRefs, ["t_003"]); // only self-ref remains
  });

  it("keeps valid refs intact", () => {
    const thoughts = [
      makeThought({ id: "t_001", layer: "visioner" }),
      makeThought({ id: "t_002", layer: "strategist", contextRefs: ["t_001"] }),
    ];

    const { report } = repairTranscript(thoughts);
    assert.equal(report.repairedContextRefs, 0);
  });
});

// ─── LAYER GAP REPAIR ────────────────────────────────────────

describe("layer gap repair", () => {
  it("inserts gap marker for invalid transition", () => {
    // visioner → worker is invalid (skips strategist+researcher)
    const thoughts = [
      makeThought({ id: "t_001", layer: "visioner" }),
      makeThought({ id: "t_005", layer: "worker" }),
    ];

    const { thoughts: repaired, report } = repairTranscript(thoughts);
    assert.equal(report.insertedGapMarkers, 1);
    assert.equal(repaired.length, 3); // original 2 + 1 gap marker
    assert.ok(repaired[1].id.startsWith("gap_"));
    assert.ok(repaired[1].output.includes("Gap"));
  });

  it("does not insert marker for valid transition", () => {
    const thoughts = [
      makeThought({ id: "t_001", layer: "visioner" }),
      makeThought({ id: "t_002", layer: "strategist" }),
      makeThought({ id: "t_003", layer: "researcher" }),
      makeThought({ id: "t_004", layer: "worker" }),
    ];

    const { report } = repairTranscript(thoughts);
    assert.equal(report.insertedGapMarkers, 0);
  });

  it("handles same-layer sequences", () => {
    const thoughts = [
      makeThought({ id: "t_001", layer: "worker" }),
      makeThought({ id: "t_002", layer: "worker" }),
      makeThought({ id: "t_003", layer: "worker" }),
    ];

    const { report } = repairTranscript(thoughts);
    assert.equal(report.insertedGapMarkers, 0);
  });
});

// ─── FULL REPAIR ─────────────────────────────────────────────

describe("full repair", () => {
  it("handles empty array", () => {
    const { thoughts, report } = repairTranscript([]);
    assert.equal(thoughts.length, 0);
    assert.equal(report.totalRepairs, 0);
  });

  it("combines all repairs", () => {
    const thoughts = [
      makeThought({
        id: "t_001", layer: "visioner",
        output: "[TOOL_RESULT:orphan_1] stale result",
        contextRefs: ["pruned_thought"],
      }),
      makeThought({
        id: "t_005", layer: "worker",
        output: "doing work",
      }),
    ];

    const { report } = repairTranscript(thoughts);
    assert.ok(report.totalRepairs > 0);
    assert.ok(report.repairedThoughtIds.length > 0);
  });

  it("does not mutate original thoughts", () => {
    const original = makeThought({
      id: "t_001", layer: "worker",
      output: "[TOOL_RESULT:orphan_1] stale",
      contextRefs: ["pruned"],
    });
    const originalOutput = original.output;
    const originalRefs = [...original.contextRefs];

    repairTranscript([original]);

    // Original should be unchanged
    assert.equal(original.output, originalOutput);
    assert.deepEqual(original.contextRefs, originalRefs);
  });
});
