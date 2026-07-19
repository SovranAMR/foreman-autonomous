import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerUncertaintyBaseline,
  runVisionerUncertaintyProbes,
} from "./forge-p02-visioner-uncertainty.probe.js";
import {
  getActiveVisionerUncertaintyContract,
  getVisionerUncertaintyCategoryContract,
  listVisionerUncertaintyContractProbeIds,
  listVisionerUncertaintyContractProbesByCategory,
  listVisionerUncertaintyProbesByDisposition,
  summarizeVisionerUncertaintyContractCoverage,
  validateVisionerUncertaintyContractCoverage,
  validateVisionerUncertaintyAgainstContract,
  validateVisionerUncertaintyProbeMatrix,
  VISIONER_UNCERTAINTY_CATEGORIES,
  FORGE_VISIONER_UNCERTAINTY_VERSION,
} from "./forge-p02-visioner-uncertainty.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Uncertainty Contract — P02-B06-A02", () => {
  it("defines typed acceptance for all eight visioner uncertainty categories", () => {
    const contract = getActiveVisionerUncertaintyContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P02-B06-A06");

    for (const category of VISIONER_UNCERTAINTY_CATEGORIES) {
      const categoryContract = getVisionerUncertaintyCategoryContract(category);
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

  it("maps 23 probes with one documented gap aligned to baseline fixture", () => {
    const contract = getActiveVisionerUncertaintyContract();
    const summary = summarizeVisionerUncertaintyContractCoverage(contract);
    const coverage = validateVisionerUncertaintyContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 22);
    assert.equal(summary.expectedFail, 1);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 1);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 1);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.uncertainty_versioning.probeCount, 3);
    assert.equal(summary.byCategory.uncertainty_signal.probeCount, 3);
    assert.equal(summary.byCategory.clarification_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists one remaining gap probe for structured clarification recovery", () => {
    const gaps = listVisionerUncertaintyProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, ["vunc.structured_clarification_recovery"]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadVisionerUncertaintyBaseline();
    const contract = getActiveVisionerUncertaintyContract();
    const validation = validateVisionerUncertaintyAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listVisionerUncertaintyContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each visioner uncertainty probe id is globally unique", () => {
    const ids = listVisionerUncertaintyContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runVisionerUncertaintyProbes();
    const contract = getActiveVisionerUncertaintyContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveVisionerUncertaintyContract();
    const flatIds = listVisionerUncertaintyContractProbeIds(contract);
    const categoryIds = VISIONER_UNCERTAINTY_CATEGORIES.flatMap(category =>
      listVisionerUncertaintyContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("validates probe matrix with documented gap alignment and zero unexpected mismatches", () => {
    const contract = getActiveVisionerUncertaintyContract();
    const results = runVisionerUncertaintyProbes();
    const matrixValidation = validateVisionerUncertaintyProbeMatrix(results, contract);

    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
    assert.equal(matrixValidation.passAligned, 22);
    assert.equal(matrixValidation.gapAligned, 1);
    assert.equal(matrixValidation.unexpectedMismatches, 0);

    const passMismatches = results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));
  });

  it("exports A01 harness version for uncertainty contract gate", () => {
    assert.equal(FORGE_VISIONER_UNCERTAINTY_VERSION, "1.0.0-a01");
  });
});
