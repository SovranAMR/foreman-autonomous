import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadIntegratedBaseline,
  runIntegratedBaselineProbes,
  validateIntegratedBaseline,
  summarizeIntegratedBaselineMatrix,
  listIntegratedBaselineProbesByExpected,
  listIntegratedBaselineKnownGaps,
  INTEGRATED_BASELINE_CATEGORIES,
} from "./forge-integrated-baseline.probe.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Integrated Baseline Gate — P01-B10-A01", () => {
  it("loads versioned integrated baseline aligned with B09 handoff", () => {
    const fixture = loadIntegratedBaseline();
    const validation = validateIntegratedBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P01-B10-A01");
    assert.equal(fixture.contractAtom, "P01-B10-A05");
    assert.equal(fixture.sourceOrchestratorSeam.probeCount, 23);
    assert.equal(fixture.sourceOrchestratorSeam.orchestratorSeamCategories, 9);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 24);
  });

  it("measures integrated baseline probes with documented FAIL gaps from B09 sealed handoff", () => {
    const results = runIntegratedBaselineProbes();
    const summary = summarizeIntegratedBaselineMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 24);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listIntegratedBaselineProbesByExpected(
      "FAIL",
      loadIntegratedBaseline(),
    );
    assert.equal(documentedFail.length, 8);
    assert.ok(documentedFail.some(p => p.id === "ibase.unified_block_catalog"));
    assert.ok(documentedFail.some(p => p.id === "ibase.unified_regression_runner"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of INTEGRATED_BASELINE_CATEGORIES) {
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

  it("documents integrated baseline gaps as measurable baseline debt", () => {
    const gaps = listIntegratedBaselineKnownGaps(runIntegratedBaselineProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "ibase.integrated_block_gate_method",
      "ibase.integrated_guard_orchestrator",
      "ibase.nogo_block_inventory_drift",
      "ibase.nogo_integrated_gate_mismatch",
      "ibase.recovery_integrated_state_reset",
      "ibase.recovery_missing_b09_handoff_fallback",
      "ibase.unified_block_catalog",
      "ibase.unified_regression_runner",
    ]);
    assert.ok(
      gaps.every(g => INTEGRATED_BASELINE_CATEGORIES.includes(g.category)),
      "documented gaps are integrated baseline probes",
    );
  });
});
