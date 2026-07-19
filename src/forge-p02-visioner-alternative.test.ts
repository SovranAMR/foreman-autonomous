import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerAlternativeBaseline,
  runVisionerAlternativeProbes,
} from "./forge-p02-visioner-alternative.probe.js";
import {
  getActiveVisionerAlternativeContract,
  getVisionerAlternativeCategoryContract,
  listVisionerAlternativeContractProbeIds,
  listVisionerAlternativeContractProbesByCategory,
  listVisionerAlternativeProbesByDisposition,
  summarizeVisionerAlternativeContractCoverage,
  validateVisionerAlternativeContractCoverage,
  validateVisionerAlternativeAgainstContract,
  validateVisionerAlternativeProbeMatrix,
  VISIONER_ALTERNATIVE_CATEGORIES,
  FORGE_VISIONER_ALTERNATIVE_VERSION,
} from "./forge-p02-visioner-alternative.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Alternative Contract — P02-B07-A02", () => {
  it("defines typed acceptance for all eight visioner alternative categories", () => {
    const contract = getActiveVisionerAlternativeContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P02-B07-A06");

    for (const category of VISIONER_ALTERNATIVE_CATEGORIES) {
      const categoryContract = getVisionerAlternativeCategoryContract(category);
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

  it("maps 23 probes with one documented gap anchored on structured alternative recovery", () => {
    const contract = getActiveVisionerAlternativeContract();
    const summary = summarizeVisionerAlternativeContractCoverage(contract);
    const coverage = validateVisionerAlternativeContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 22);
    assert.equal(summary.expectedFail, 1);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 1);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 1);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.alternative_versioning.probeCount, 3);
    assert.equal(summary.byCategory.alternative_signal.probeCount, 3);
    assert.equal(summary.byCategory.divergence_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists one remaining gap probe for structured alternative recovery", () => {
    const gaps = listVisionerAlternativeProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, ["valt.structured_alternative_recovery"]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadVisionerAlternativeBaseline();
    const contract = getActiveVisionerAlternativeContract();
    const validation = validateVisionerAlternativeAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listVisionerAlternativeContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each visioner alternative probe id is globally unique", () => {
    const ids = listVisionerAlternativeContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runVisionerAlternativeProbes();
    const contract = getActiveVisionerAlternativeContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveVisionerAlternativeContract();
    const flatIds = listVisionerAlternativeContractProbeIds(contract);
    const categoryIds = VISIONER_ALTERNATIVE_CATEGORIES.flatMap(category =>
      listVisionerAlternativeContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("validates probe matrix with full alignment on documented FAIL gap", () => {
    const contract = getActiveVisionerAlternativeContract();
    const results = runVisionerAlternativeProbes();
    const matrixValidation = validateVisionerAlternativeProbeMatrix(results, contract);

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

  it("exports A01 harness version for alternative contract gate", () => {
    assert.equal(FORGE_VISIONER_ALTERNATIVE_VERSION, "1.0.0-a01");
  });
});
