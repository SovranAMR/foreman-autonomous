/**
 * FOREMAN — Persistence Smoke Test
 *
 * ThoughtManager, ChainManager, Validators test.
 */

import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ThoughtManager } from "./thought-manager.js";
import { ChainManager } from "./chain-manager.js";
import { validateThoughtCompletion, validateProtocolSteps } from "./validators.js";
import type { Thought, WorkerProtocol } from "./types.js";

const PASS = "✅";
const FAIL = "❌";
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`${PASS} ${name}`);
    passed++;
  } catch (err) {
    console.log(`${FAIL} ${name}`);
    console.error(`   ${err}`);
    failed++;
  }
}

const tempDir = mkdtempSync(join(tmpdir(), "foreman-persist-test-"));

// ─── THOUGHT MANAGER TESTS ──────────────────────────────────

const tm = new ThoughtManager(tempDir);

test("ThoughtManager.create() → t_001", () => {
  const t = tm.create({
    chainId: "chain_001",
    layer: "worker",
    input: "Test thought",
  });
  assert.equal(t.id, "t_001");
  assert.equal(t.status, "pending");
  assert.equal(t.chainId, "chain_001");
  assert.equal(t.layer, "worker");
  assert.equal(t.input, "Test thought");
  assert.equal(t.reasoning, "");
  assert.ok(t.createdAt);
});

test("ThoughtManager.create() auto-increments", () => {
  const t2 = tm.create({ chainId: "chain_001", layer: "worker", input: "Second" });
  const t3 = tm.create({ chainId: "chain_001", layer: "visioner", input: "Third" });
  assert.equal(t2.id, "t_002");
  assert.equal(t3.id, "t_003");
});

test("ThoughtManager.get() reads from disk", () => {
  const t = tm.get("t_001");
  assert.ok(t !== null);
  assert.equal(t!.input, "Test thought");
});

test("ThoughtManager.get() returns null for missing", () => {
  assert.equal(tm.get("t_999"), null);
});

test("ThoughtManager.update() patches thought", () => {
  const updated = tm.update("t_001", {
    reasoning: "Because testing matters",
    output: "Test passed",
    confidence: 0.9,
    status: "done",
  });
  assert.equal(updated.reasoning, "Because testing matters");
  assert.equal(updated.output, "Test passed");
  assert.equal(updated.status, "done");

  // Re-read from disk
  const fromDisk = tm.get("t_001");
  assert.equal(fromDisk!.reasoning, "Because testing matters");
});

test("ThoughtManager.update() throws for missing thought", () => {
  assert.throws(
    () => tm.update("t_999", { reasoning: "nope" }),
    /not found/,
  );
});

test("ThoughtManager.list() returns all", () => {
  const all = tm.list();
  assert.equal(all.length, 3);
});

test("ThoughtManager.list() filters by chainId", () => {
  const filtered = tm.list({ chainId: "chain_001" });
  assert.equal(filtered.length, 3);
});

test("ThoughtManager.list() filters by layer", () => {
  const filtered = tm.list({ layer: "visioner" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "t_003");
});

test("ThoughtManager.exists()", () => {
  assert.equal(tm.exists("t_001"), true);
  assert.equal(tm.exists("t_999"), false);
});

// ─── CHAIN MANAGER TESTS ────────────────────────────────────

const cm = new ChainManager(tempDir);

test("ChainManager.create() with manual id", () => {
  const c = cm.create({
    id: "chain_001_types",
    name: "Type System",
    goal: "Define all core types",
    layer: "worker",
  });
  assert.equal(c.id, "chain_001_types");
  assert.equal(c.status, "active");
  assert.equal(c.thoughts.length, 0);
});

test("ChainManager.create() with auto id", () => {
  const c = cm.create({
    name: "State Machine",
    goal: "Implement state management",
    layer: "worker",
  });
  // Auto-generated
  assert.ok(c.id.startsWith("chain_"));
});

test("ChainManager.get() reads from disk", () => {
  const c = cm.get("chain_001_types");
  assert.ok(c !== null);
  assert.equal(c!.name, "Type System");
});

test("ChainManager.addThought()", () => {
  cm.addThought("chain_001_types", "t_001");
  cm.addThought("chain_001_types", "t_002");
  const c = cm.get("chain_001_types");
  assert.equal(c!.thoughts.length, 2);
  assert.deepEqual(c!.thoughts, ["t_001", "t_002"]);
});

test("ChainManager.addThought() no duplicates", () => {
  cm.addThought("chain_001_types", "t_001"); // already added
  const c = cm.get("chain_001_types");
  assert.equal(c!.thoughts.length, 2);
});

test("ChainManager.updateStatus()", () => {
  cm.updateStatus("chain_001_types", "completed");
  const c = cm.get("chain_001_types");
  assert.equal(c!.status, "completed");
  assert.ok(c!.completedAt);
});

test("ChainManager.updateSummary()", () => {
  cm.updateSummary("chain_001_types", "All types defined and verified.");
  const c = cm.get("chain_001_types");
  assert.equal(c!.contextSummary, "All types defined and verified.");
});

test("ChainManager.list()", () => {
  const all = cm.list();
  assert.ok(all.length >= 2);
});

test("ChainManager.list() with status filter", () => {
  const completed = cm.list("completed");
  assert.equal(completed.length, 1);
  assert.equal(completed[0].id, "chain_001_types");
});

// ─── VALIDATOR TESTS ─────────────────────────────────────────

test("validateThoughtCompletion: missing reasoning → fail", () => {
  const t: Thought = {
    id: "t_test", chainId: "c", layer: "strategist", input: "x",
    contextRefs: [], reasoning: "", output: "result", confidence: 0.8,
    needsResearch: false, needsVerification: false, status: "done",
    createdAt: new Date().toISOString(),
  };
  const result = validateThoughtCompletion(t);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes("Reasoning")));
});

test("validateThoughtCompletion: missing output on done → fail", () => {
  const t: Thought = {
    id: "t_test", chainId: "c", layer: "strategist", input: "x",
    contextRefs: [], reasoning: "because", output: "", confidence: 0.8,
    needsResearch: false, needsVerification: false, status: "done",
    createdAt: new Date().toISOString(),
  };
  const result = validateThoughtCompletion(t);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes("Output")));
});

test("validateThoughtCompletion: worker without protocol → fail", () => {
  const t: Thought = {
    id: "t_test", chainId: "c", layer: "worker", input: "x",
    contextRefs: [], reasoning: "because", output: "result", confidence: 0.8,
    needsResearch: false, needsVerification: false, status: "done",
    createdAt: new Date().toISOString(),
  };
  const result = validateThoughtCompletion(t);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes("WorkerProtocol")));
});

test("validateThoughtCompletion: valid worker with protocol → pass", () => {
  const protocol: WorkerProtocol = {
    step1_read: "Read HeroSection.tsx: 350 lines, SVG path at line 180, GSAP timeline at line 75",
    step2_context: "SVG inside motion.div z-index:-10, GSAP timeline has 3 tweens, path 'smileArc'",
    step3_impact: "Adding strokeDasharray won't affect fill (none). No other animations target this path.",
    step4_decide: "Line 182: add strokeDasharray='500' strokeDashoffset='500'. Line 80: GSAP tween at 0.3",
    step5_predict: "Smile arc draws left-to-right over 1.8s, starting 0.3s after bloom",
    step6_execute: "Added strokeDasharray and strokeDashoffset to SVG path, GSAP tween added to timeline",
    step7_verify: "Build passed ✔, 12 tests pass, visual check shows arc drawing correctly",
    step8_report: "SVG draw-on animation working. No unexpected side effects found.",
  };
  const t: Thought = {
    id: "t_test", chainId: "c", layer: "worker", input: "x",
    contextRefs: [], reasoning: "because", output: "result", confidence: 0.8,
    needsResearch: false, needsVerification: false, status: "done",
    workerProtocol: protocol,
    createdAt: new Date().toISOString(),
  };
  const result = validateThoughtCompletion(t);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateProtocolSteps: empty step → fail", () => {
  const protocol: WorkerProtocol = {
    step1_read: "Read file",
    step2_context: "",  // EMPTY
    step3_impact: "No side effects",
    step4_decide: "Will add X",
    step5_predict: "Expected Z",
    step6_execute: "Added code",
    step7_verify: "Build passed",
    step8_report: "Done",
  };
  const result = validateProtocolSteps(protocol);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes("step2_context")));
});

test("validateThoughtCompletion: confidence out of range → fail", () => {
  const t: Thought = {
    id: "t_test", chainId: "c", layer: "strategist", input: "x",
    contextRefs: [], reasoning: "because", output: "result", confidence: 1.5,
    needsResearch: false, needsVerification: false, status: "done",
    createdAt: new Date().toISOString(),
  };
  const result = validateThoughtCompletion(t);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes("Confidence")));
});

// ─── SUMMARY ──────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
