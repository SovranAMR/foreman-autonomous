import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistPhaseGateBaseline,
  runStrategistPhaseGateProbes,
  validateStrategistPhaseGateBaseline,
  summarizeStrategistPhaseGateMatrix,
  listStrategistPhaseGateProbesByExpected,
  listStrategistPhaseGateKnownGaps,
  STRATEGIST_PHASE_GATE_CATEGORIES,
} from "./forge-p03-strategist-phase-gate.probe.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Phase Gate — P03-B10-A01", () => {
  it("loads versioned strategist phase gate baseline aligned with P03-B09 block gate handoff", () => {
    const fixture = loadStrategistPhaseGateBaseline();
    const validation = validateStrategistPhaseGateBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P03-B10-A01");
    assert.equal(fixture.contractAtom, "P03-B10-A02");
    assert.equal(fixture.sourceBlockGate.atom, "P03-B09-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.strategistProvenanceProbeCount, 28);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 24);
  });

  it("measures strategist phase gate probes with documented FAIL gaps from P03-B09 sealed handoff", () => {
    const results = runStrategistPhaseGateProbes();
    const summary = summarizeStrategistPhaseGateMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 24);
    assert.equal(summary.knownGaps.length, 1);

    const documentedFail = listStrategistPhaseGateProbesByExpected(
      "FAIL",
      loadStrategistPhaseGateBaseline(),
    );
    assert.equal(documentedFail.length, 1);
    assert.equal(documentedFail[0]?.id, "spg.orchestrator_phase_gate_runner");

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of STRATEGIST_PHASE_GATE_CATEGORIES) {
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

  it("documents strategist phase gate gaps as measurable baseline debt", () => {
    const gaps = listStrategistPhaseGateKnownGaps(runStrategistPhaseGateProbes());
    assert.deepEqual(gaps.map(g => g.id).sort(), ["spg.orchestrator_phase_gate_runner"]);
  });
});
