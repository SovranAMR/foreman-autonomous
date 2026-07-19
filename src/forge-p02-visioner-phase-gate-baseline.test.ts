import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerPhaseGateBaseline,
  runVisionerPhaseGateProbes,
  validateVisionerPhaseGateBaseline,
  summarizeVisionerPhaseGateMatrix,
  listVisionerPhaseGateProbesByExpected,
  listVisionerPhaseGateKnownGaps,
  VISIONER_PHASE_GATE_CATEGORIES,
} from "./forge-p02-visioner-phase-gate.probe.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Phase Gate — P02-B10-A01", () => {
  it("loads versioned visioner phase gate baseline aligned with P02-B09 block gate handoff", () => {
    const fixture = loadVisionerPhaseGateBaseline();
    const validation = validateVisionerPhaseGateBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P02-B10-A01");
    assert.equal(fixture.contractAtom, "P02-B10-A05");
    assert.equal(fixture.sourceBlockGate.atom, "P02-B09-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures visioner phase gate probes with documented FAIL gaps from P02-B09 sealed handoff", () => {
    const results = runVisionerPhaseGateProbes();
    const summary = summarizeVisionerPhaseGateMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listVisionerPhaseGateProbesByExpected(
      "FAIL",
      loadVisionerPhaseGateBaseline(),
    );
    assert.equal(documentedFail.length, 1);
    assert.ok(documentedFail.some(p => p.id === "vpg.orchestrator_phase_gate_runner"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of VISIONER_PHASE_GATE_CATEGORIES) {
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

  it("documents remaining visioner phase gate gaps as measurable baseline debt", () => {
    const gaps = listVisionerPhaseGateKnownGaps(runVisionerPhaseGateProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, ["vpg.orchestrator_phase_gate_runner"]);
    assert.ok(
      gaps.every(g => VISIONER_PHASE_GATE_CATEGORIES.includes(g.category)),
      "documented gaps are visioner phase gate probes",
    );
  });
});
