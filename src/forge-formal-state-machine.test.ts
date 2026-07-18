import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadFormalStateMachineFixture,
  runFormalStateMachineProbes,
  summarizeFormalStateMachineMatrix,
  validateFormalStateMachineFixture,
  listFormalStateMachineKnownGaps,
  listFormalStateMachineProbesByExpected,
  FORMAL_STATE_MACHINE_CATEGORIES,
} from "./forge-formal-state-machine-harness.js";

describe("Forge Formal State Machine — P01-B03-A01", () => {
  it("loads versioned formal state machine fixture aligned with B02 handoff", () => {
    const fixture = loadFormalStateMachineFixture();
    const validation = validateFormalStateMachineFixture(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P01-B03-A01");
    assert.equal(fixture.sourceBehaviorMap.probeCount, 26);
    assert.equal(fixture.sourceBehaviorMap.behaviorCategories, 8);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 20);
  });

  it("measures orchestrator ↔ StateManager probe matrix with documented FAIL gaps", () => {
    const results = runFormalStateMachineProbes();
    const summary = summarizeFormalStateMachineMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 20);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listFormalStateMachineProbesByExpected("FAIL");
    assert.equal(documentedFail.length, 2);
    assert.ok(documentedFail.some(p => p.id === "fsm.orch_blocked_sync"));
    assert.ok(documentedFail.some(p => p.id === "fsm.orch_awaiting_human_sync"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of FORMAL_STATE_MACHINE_CATEGORIES) {
      assert.ok(summary.byCategory[cat], `missing category summary: ${cat}`);
      assert.ok(summary.byCategory[cat].total > 0, `${cat} has no probes`);
    }

    const passMismatches = results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(
      passMismatches.length,
      0,
      formatMismatchReport(passMismatches),
    );
  });

  it("documents orchestrator failure-state sync gaps as measurable baseline debt", () => {
    const gaps = listFormalStateMachineKnownGaps();
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, ["fsm.orch_awaiting_human_sync", "fsm.orch_blocked_sync"]);
    assert.ok(
      gaps.every(g => g.category === "failure_state"),
      "documented gaps are failure_state orchestrator sync probes",
    );
  });
});

function formatMismatchReport(
  mismatches: ReturnType<typeof runFormalStateMachineProbes>,
): string {
  if (mismatches.length === 0) return "";
  return mismatches
    .map(m => `${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}
