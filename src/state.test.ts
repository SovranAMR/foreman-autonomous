/**
 * FOREMAN — State Machine Smoke Test
 *
 * Unit test framework olmadan basit assert-based test.
 * Tüm StateManager yeteneklerini doğrular.
 */

import { strict as assert } from "node:assert";
import { existsSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StateManager, InvalidTransitionError, MissingReasonError, CorruptedStateError } from "./state.js";

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

// Temp dir for persist tests
const tempDir = mkdtempSync(join(tmpdir(), "foreman-test-"));

// ─── TESTS ────────────────────────────────────────────────────

test("create() → idle state", () => {
  const sm = StateManager.create(tempDir, "test-project", false);
  assert.equal(sm.current(), "idle");
});

test("snapshot() → full state", () => {
  const sm = StateManager.create(tempDir, "test-project", false);
  const snap = sm.snapshot();
  assert.equal(snap.currentState, "idle");
  assert.equal(snap.projectName, "test-project");
  assert.equal(snap.projectRoot, tempDir);
  assert.equal(snap.totalTokens, 0);
  assert.ok(snap.sessionStartedAt);
});

test("valid transition: idle → visioning", () => {
  const sm = StateManager.create(tempDir, "test-project", false);
  const result = sm.transition("visioning", "starting vision phase");
  assert.equal(result, "visioning");
  assert.equal(sm.current(), "visioning");
});

test("valid transition chain: idle → visioning → decomposing → executing → verifying → complete", () => {
  const sm = StateManager.create(tempDir, "test-project", false);
  sm.transition("visioning", "start");
  sm.transition("decomposing", "vision done");
  sm.transition("executing", "atoms ready");
  sm.transition("verifying", "execution done");
  sm.transition("complete", "all verified");
  assert.equal(sm.current(), "complete");
});

test("invalid transition: idle → executing → REJECT", () => {
  const sm = StateManager.create(tempDir, "test-project", false);
  assert.throws(
    () => sm.transition("executing", "skip everything"),
    InvalidTransitionError,
  );
  assert.equal(sm.current(), "idle"); // state unchanged
});

test("missing reason → REJECT", () => {
  const sm = StateManager.create(tempDir, "test-project", false);
  assert.throws(
    () => sm.transition("visioning", ""),
    MissingReasonError,
  );
  assert.throws(
    () => sm.transition("visioning", "   "),
    MissingReasonError,
  );
});

test("canTransition() → correct checks", () => {
  const sm = StateManager.create(tempDir, "test-project", false);
  assert.equal(sm.canTransition("visioning"), true);
  assert.equal(sm.canTransition("executing"), false);
  assert.equal(sm.canTransition("complete"), false);
});

test("history tracks transitions", () => {
  const sm = StateManager.create(tempDir, "test-project", false);
  sm.transition("visioning", "reason 1", { chainId: "c1" });
  sm.transition("decomposing", "reason 2", { thoughtId: "t1" });

  const history = sm.recentHistory(10);
  assert.equal(history.length, 2);
  assert.equal(history[0].from, "idle");
  assert.equal(history[0].to, "visioning");
  assert.equal(history[0].reason, "reason 1");
  assert.equal(history[0].chainId, "c1");
  assert.equal(history[1].from, "visioning");
  assert.equal(history[1].to, "decomposing");
  assert.equal(history[1].thoughtId, "t1");
});

test("addTokens() tracks usage", () => {
  const sm = StateManager.create(tempDir, "test-project", false);
  sm.addTokens(500);
  sm.addTokens(300);
  assert.equal(sm.snapshot().totalTokens, 800);
});

test("transition clears activeChain/Thought on complete", () => {
  const sm = StateManager.create(tempDir, "test-project", false);
  sm.transition("visioning", "start", { chainId: "c1", thoughtId: "t1" });
  assert.equal(sm.snapshot().activeChainId, "c1");
  assert.equal(sm.snapshot().activeThoughtId, "t1");

  sm.transition("decomposing", "next");
  sm.transition("executing", "go");
  sm.transition("verifying", "check");
  sm.transition("complete", "done");
  assert.equal(sm.snapshot().activeChainId, undefined);
  assert.equal(sm.snapshot().activeThoughtId, undefined);
});

// ─── PERSISTENCE TESTS ───────────────────────────────────────

const persistDir = mkdtempSync(join(tmpdir(), "foreman-persist-"));

test("save() creates state.json", () => {
  const sm = StateManager.create(persistDir, "persist-project", false);
  sm.transition("visioning", "test save");
  sm.save();
  assert.ok(existsSync(join(persistDir, "state.json")));
});

test("load() restores state", () => {
  const sm = StateManager.create(persistDir, "reload-test", false);
  sm.transition("visioning", "before save");
  sm.addTokens(1234);
  sm.save();

  const loaded = StateManager.load(persistDir, false);
  assert.ok(loaded !== null);
  assert.equal(loaded!.current(), "visioning");
  assert.equal(loaded!.snapshot().totalTokens, 1234);
  assert.equal(loaded!.snapshot().projectName, "reload-test");
});

test("load() returns null if no state.json", () => {
  const emptyDir = mkdtempSync(join(tmpdir(), "foreman-empty-"));
  const result = StateManager.load(emptyDir, false);
  assert.equal(result, null);
});

test("auto-persist: transition saves automatically", () => {
  const autoDir = mkdtempSync(join(tmpdir(), "foreman-auto-"));
  const sm = StateManager.create(autoDir, "auto-test", true); // autoPersist ON
  sm.transition("visioning", "auto save test");
  assert.ok(existsSync(join(autoDir, "state.json")));

  const loaded = StateManager.load(autoDir, false);
  assert.equal(loaded!.current(), "visioning");
});

// ─── SUMMARY ──────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
