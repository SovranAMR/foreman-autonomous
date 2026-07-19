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
    assert.equal(fixture.contractAtom, "P02-B10-A02");
    assert.equal(fixture.sourceBlockGate.atom, "P02-B09-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 24);
  });

  it("measures visioner phase gate probes with full alignment after A03 production slice", () => {
    const results = runVisionerPhaseGateProbes();
    const summary = summarizeVisionerPhaseGateMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 24);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listVisionerPhaseGateProbesByExpected(
      "FAIL",
      loadVisionerPhaseGateBaseline(),
    );
    assert.equal(documentedFail.length, 0);

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

  it("documents zero remaining visioner phase gate gaps after A03 orchestrator wiring", () => {
    const gaps = listVisionerPhaseGateKnownGaps(runVisionerPhaseGateProbes());
    assert.deepEqual(gaps.map(g => g.id).sort(), []);
  });
});
