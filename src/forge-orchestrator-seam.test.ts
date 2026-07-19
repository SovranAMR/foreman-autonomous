import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadOrchestratorSeamBaseline,
  runOrchestratorSeamProbes,
  runOrchestratorSeamProductionSlice,
} from "./forge-orchestrator-seam.probe.js";
import {
  getActiveOrchestratorSeamContract,
  getOrchestratorSeamCategoryContract,
  listOrchestratorSeamContractProbeIds,
  listOrchestratorSeamProbesByDisposition,
  summarizeOrchestratorSeamContractCoverage,
  validateOrchestratorSeamContractCoverage,
  validateOrchestratorSeamBaselineAgainstContract,
  validateOrchestratorSeamProbeMatrix,
  ORCHESTRATOR_SEAM_CATEGORIES,
} from "./forge-orchestrator-seam.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Orchestrator Seam Contract — P01-B09-A02", () => {
  it("defines typed acceptance for all nine orchestrator seam categories", () => {
    const contract = getActiveOrchestratorSeamContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P01-B09-A05");

    for (const category of ORCHESTRATOR_SEAM_CATEGORIES) {
      const categoryContract = getOrchestratorSeamCategoryContract(category);
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

  it("maps 23 probes with seven documented gap dispositions from A01 baseline", () => {
    const contract = getActiveOrchestratorSeamContract();
    const summary = summarizeOrchestratorSeamContractCoverage(contract);
    const coverage = validateOrchestratorSeamContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 16);
    assert.equal(summary.expectedFail, 7);
    assert.equal(summary.byDisposition.observed, 14);
    assert.equal(summary.byDisposition.gap, 3);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.seam_versioning.probeCount, 3);
    assert.equal(summary.byCategory.method_inventory.probeCount, 3);
    assert.equal(summary.byCategory.lazy_import_seam.probeCount, 3);
    assert.equal(summary.byCategory.composition_seam.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 3);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists three documented gap probes for orchestrator seam wiring", () => {
    const gaps = listOrchestratorSeamProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, [
      "oseam.extracted_seam_interface",
      "oseam.guard_methods_inventory",
      "oseam.unified_lazy_import_registry",
    ]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadOrchestratorSeamBaseline();
    const contract = getActiveOrchestratorSeamContract();
    const validation = validateOrchestratorSeamBaselineAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listOrchestratorSeamContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each orchestrator seam probe id is globally unique", () => {
    const ids = listOrchestratorSeamContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runOrchestratorSeamProbes();
    const contract = getActiveOrchestratorSeamContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});

describe("Forge Orchestrator Seam Production Slice — P01-B09-A03", () => {
  it("executes contract-wired probes with zero unexpected mismatches", () => {
    const contract = getActiveOrchestratorSeamContract();
    const slice = runOrchestratorSeamProductionSlice();

    assert.equal(slice.atom, "P01-B09-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 16);
    assert.equal(slice.matrixValidation.gapAligned, 7);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateOrchestratorSeamProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(slice.summary.mismatches.length, 0);
    assert.equal(slice.summary.knownGaps.length, 7);
    assert.deepEqual(
      slice.summary.knownGaps.map(g => g.id).sort(),
      [
        "oseam.extracted_seam_interface",
        "oseam.guard_methods_inventory",
        "oseam.nogo_seam_inventory_drift",
        "oseam.nogo_verification_method_mismatch",
        "oseam.recovery_missing_handoff_fallback",
        "oseam.recovery_seam_state_reset",
        "oseam.unified_lazy_import_registry",
      ],
    );
  });
});
