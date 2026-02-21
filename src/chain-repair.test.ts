/**
 * FOREMAN — Chain Repair Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Thought, Layer } from "./types.js";
import { repairChain, checkChainHealth, getActiveThoughts } from "./chain-repair.js";

function makeThought(overrides: Partial<Thought> & { id: string }): Thought {
  return {
    chainId: "chain_test",
    layer: "worker" as Layer,
    input: "Test input",
    contextRefs: [],
    confidence: 0.7,
    needsResearch: false,
    needsVerification: false,
    status: "done",
    output: "Test output",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── MISSING OUTPUT ──────────────────────────────────────────

describe("missing output repair", () => {
  it("flags done thought with no output", () => {
    const thoughts = [
      makeThought({ id: "t_001", status: "done", output: undefined }),
    ];
    const result = repairChain(thoughts);
    assert.ok(result.issues.some(i => i.kind === "missing_output"));
    assert.ok(result.thoughts[0].output?.includes("[repaired"));
    assert.equal(result.fixCount, 1);
  });

  it("leaves done thought with output alone", () => {
    const thoughts = [
      makeThought({ id: "t_001", status: "done", output: "real output" }),
    ];
    const result = repairChain(thoughts);
    assert.equal(result.issues.filter(i => i.kind === "missing_output").length, 0);
  });
});

// ─── STALE THOUGHTS ──────────────────────────────────────────

describe("stale thought detection", () => {
  it("marks old pending thoughts as abandoned", () => {
    const oldTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    const thoughts = [
      makeThought({ id: "t_stale", status: "pending", createdAt: oldTime, output: undefined }),
    ];
    const result = repairChain(thoughts);
    assert.ok(result.issues.some(i => i.kind === "stale"));
    assert.equal(result.thoughts[0].status, "abandoned");
  });

  it("leaves recent pending thoughts alone", () => {
    const thoughts = [
      makeThought({ id: "t_fresh", status: "pending", output: undefined }),
    ];
    const result = repairChain(thoughts);
    assert.equal(result.issues.filter(i => i.kind === "stale").length, 0);
    assert.equal(result.thoughts[0].status, "pending");
  });

  it("marks old active thoughts as abandoned", () => {
    const oldTime = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    const thoughts = [
      makeThought({ id: "t_active_old", status: "active", createdAt: oldTime }),
    ];
    const result = repairChain(thoughts);
    assert.ok(result.issues.some(i => i.kind === "stale"));
  });
});

// ─── CONFIDENCE ANOMALY ──────────────────────────────────────

describe("confidence anomaly detection", () => {
  it("flags sudden confidence drops", () => {
    const thoughts = [
      makeThought({ id: "t_001", chainId: "c1", confidence: 0.9 }),
      makeThought({ id: "t_002", chainId: "c1", confidence: 0.3 }),
    ];
    const result = repairChain(thoughts);
    assert.ok(result.issues.some(i => i.kind === "confidence_anomaly"));
  });

  it("ignores gradual confidence changes", () => {
    const thoughts = [
      makeThought({ id: "t_001", chainId: "c1", confidence: 0.8 }),
      makeThought({ id: "t_002", chainId: "c1", confidence: 0.6 }),
    ];
    const result = repairChain(thoughts);
    assert.equal(result.issues.filter(i => i.kind === "confidence_anomaly").length, 0);
  });

  it("only compares within same chain", () => {
    const thoughts = [
      makeThought({ id: "t_001", chainId: "c1", confidence: 0.9 }),
      makeThought({ id: "t_002", chainId: "c2", confidence: 0.1 }),
    ];
    const result = repairChain(thoughts);
    assert.equal(result.issues.filter(i => i.kind === "confidence_anomaly").length, 0);
  });
});

// ─── DUPLICATE DETECTION ─────────────────────────────────────

describe("duplicate thought detection", () => {
  it("detects identical input+output in same chain", () => {
    const thoughts = [
      makeThought({ id: "t_001", chainId: "c1", input: "build X", output: "X built" }),
      makeThought({ id: "t_002", chainId: "c1", input: "build X", output: "X built" }),
    ];
    const result = repairChain(thoughts);
    assert.ok(result.issues.some(i => i.kind === "duplicate"));
    assert.equal(result.thoughts[1].status, "abandoned");
  });

  it("allows same input different output", () => {
    const thoughts = [
      makeThought({ id: "t_001", chainId: "c1", input: "build X", output: "X built v1" }),
      makeThought({ id: "t_002", chainId: "c1", input: "build X", output: "X built v2" }),
    ];
    const result = repairChain(thoughts);
    assert.equal(result.issues.filter(i => i.kind === "duplicate").length, 0);
  });

  it("allows duplicates across different chains", () => {
    const thoughts = [
      makeThought({ id: "t_001", chainId: "c1", input: "same", output: "same" }),
      makeThought({ id: "t_002", chainId: "c2", input: "same", output: "same" }),
    ];
    const result = repairChain(thoughts);
    assert.equal(result.issues.filter(i => i.kind === "duplicate").length, 0);
  });
});

// ─── CIRCULAR REFERENCES ────────────────────────────────────

describe("circular reference detection", () => {
  it("detects A→B→A cycle", () => {
    const thoughts = [
      makeThought({ id: "t_001", chainId: "chainA", contextRefs: ["chainB"] }),
      makeThought({ id: "t_002", chainId: "chainB", contextRefs: ["chainA"] }),
    ];
    const result = repairChain(thoughts);
    assert.ok(result.issues.some(i => i.kind === "circular_ref"));
  });

  it("allows valid chain hierarchy", () => {
    const thoughts = [
      makeThought({ id: "t_001", chainId: "parent", contextRefs: [] }),
      makeThought({ id: "t_002", chainId: "child", contextRefs: ["parent"] }),
    ];
    const result = repairChain(thoughts);
    assert.equal(result.issues.filter(i => i.kind === "circular_ref").length, 0);
  });
});

// ─── INVALID LAYER ───────────────────────────────────────────

describe("invalid layer detection", () => {
  it("flags invalid layer names", () => {
    const thoughts = [
      makeThought({ id: "t_001", layer: "executor" as Layer }),
    ];
    const result = repairChain(thoughts);
    assert.ok(result.issues.some(i => i.kind === "invalid_layer"));
  });

  it("accepts valid layers", () => {
    const layers: Layer[] = ["visioner", "strategist", "researcher", "worker"];
    for (const layer of layers) {
      const thoughts = [makeThought({ id: "t_001", layer })];
      const result = repairChain(thoughts);
      assert.equal(result.issues.filter(i => i.kind === "invalid_layer").length, 0,
        `Layer '${layer}' should be valid`);
    }
  });
});

// ─── HEALTH CHECK ────────────────────────────────────────────

describe("chain health check", () => {
  it("healthy chain returns healthy=true", () => {
    const thoughts = [
      makeThought({ id: "t_001", status: "done", input: "task A", output: "result A" }),
      makeThought({ id: "t_002", status: "done", input: "task B", output: "result B" }),
    ];
    const health = checkChainHealth(thoughts);
    assert.equal(health.healthy, true);
    assert.equal(health.issueCount, 0);
  });

  it("unhealthy chain returns issues", () => {
    const thoughts = [
      makeThought({ id: "t_001", status: "done", output: undefined }),
    ];
    const health = checkChainHealth(thoughts);
    assert.equal(health.healthy, false);
    assert.ok(health.issueCount > 0);
  });
});

// ─── ACTIVE THOUGHTS FILTER ─────────────────────────────────

describe("getActiveThoughts", () => {
  it("filters out abandoned and error thoughts", () => {
    const thoughts = [
      makeThought({ id: "t_001", status: "done" }),
      makeThought({ id: "t_002", status: "abandoned" }),
      makeThought({ id: "t_003", status: "active" }),
      makeThought({ id: "t_004", status: "error" }),
      makeThought({ id: "t_005", status: "pending" }),
    ];
    const active = getActiveThoughts(thoughts);
    assert.equal(active.length, 3);
    assert.ok(active.every(t => t.status !== "abandoned" && t.status !== "error"));
  });
});

// ─── REPAIR SUMMARY ─────────────────────────────────────────

describe("repair summary", () => {
  it("generates useful summary for multiple issues", () => {
    const oldTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const thoughts = [
      makeThought({ id: "t_001", status: "done", output: undefined }),
      makeThought({ id: "t_stale", status: "pending", createdAt: oldTime, output: undefined }),
      makeThought({ id: "t_dup1", chainId: "c1", input: "X", output: "Y" }),
      makeThought({ id: "t_dup2", chainId: "c1", input: "X", output: "Y" }),
    ];
    const result = repairChain(thoughts);
    assert.ok(result.summary.includes("issue(s) found"));
    assert.ok(result.summary.includes("auto-fixed"));
  });

  it("reports healthy chain", () => {
    const thoughts = [makeThought({ id: "t_001" })];
    const result = repairChain(thoughts);
    assert.ok(result.summary.includes("healthy"));
  });
});
