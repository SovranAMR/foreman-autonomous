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
  getActiveIntegratedBaselineContract,
  getIntegratedBaselineCategoryContract,
  listIntegratedBaselineContractProbeIds,
  listIntegratedBaselineProbesByDisposition,
  summarizeIntegratedBaselineContractCoverage,
  validateIntegratedBaselineContractCoverage,
  validateIntegratedBaselineAgainstContract,
} from "./forge-integrated-baseline.probe.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Integrated Baseline Contract — P01-B10-A02", () => {
  it("defines typed acceptance for all ten integrated baseline categories", () => {
    const contract = getActiveIntegratedBaselineContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P01-B10-A05");

    for (const category of INTEGRATED_BASELINE_CATEGORIES) {
      const categoryContract = getIntegratedBaselineCategoryContract(category);
      assert.ok(categoryContract.acceptance.invariant.length > 20, `${category} invariant too short`);
      assert.ok(categoryContract.probes.length >= categoryContract.acceptance.minProbeCount);
      assert.equal(categoryContract.acceptance.requireFullAlignment, true);

      for (const probe of categoryContract.probes) {
        assert.ok(probe.criterion.length > 10, `${probe.id} missing measurable criterion`);
        assert.ok(probe.expected === "PASS" || probe.expected === "FAIL");
        assert.ok(
          probe.disposition === "observed" ||
            probe.disposition === "gap" ||
            probe.disposition === "failure" ||
            probe.disposition === "recovery" ||
            probe.disposition === "nogo",
          `${probe.id} missing disposition`,
        );
      }
    }
  });

  it("maps 24 probes with eight documented gap dispositions from A01 baseline", () => {
    const contract = getActiveIntegratedBaselineContract();
    const summary = summarizeIntegratedBaselineContractCoverage(contract);
    const coverage = validateIntegratedBaselineContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 24);
    assert.equal(summary.expectedPass, 16);
    assert.equal(summary.expectedFail, 8);
    assert.equal(summary.byDisposition.observed, 14);
    assert.equal(summary.byDisposition.gap, 4);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.gate_versioning.probeCount, 3);
    assert.equal(summary.byCategory.block_inventory.probeCount, 3);
    assert.equal(summary.byCategory.regression_integration.probeCount, 3);
    assert.equal(summary.byCategory.guard_integration.probeCount, 2);
    assert.equal(summary.byCategory.block_gate_integration.probeCount, 2);
    assert.equal(summary.byCategory.orchestrator_seam_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 3);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists four documented gap probes for integrated gate wiring", () => {
    const gaps = listIntegratedBaselineProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, [
      "ibase.integrated_block_gate_method",
      "ibase.integrated_guard_orchestrator",
      "ibase.unified_block_catalog",
      "ibase.unified_regression_runner",
    ]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadIntegratedBaseline();
    const contract = getActiveIntegratedBaselineContract();
    const validation = validateIntegratedBaselineAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listIntegratedBaselineContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each integrated baseline probe id is globally unique", () => {
    const ids = listIntegratedBaselineContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runIntegratedBaselineProbes();
    const contract = getActiveIntegratedBaselineContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});

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
