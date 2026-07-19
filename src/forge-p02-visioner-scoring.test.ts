import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerScoringBaseline,
  runVisionerScoringProbes,
} from "./forge-p02-visioner-scoring.probe.js";
import {
  getActiveVisionerScoringContract,
  getVisionerScoringCategoryContract,
  listVisionerScoringContractProbeIds,
  listVisionerScoringContractProbesByCategory,
  listVisionerScoringProbesByDisposition,
  summarizeVisionerScoringContractCoverage,
  validateVisionerScoringContractCoverage,
  validateVisionerScoringAgainstContract,
  validateVisionerScoringProbeMatrix,
  VISIONER_SCORING_CATEGORIES,
  FORGE_VISIONER_SCORING_VERSION,
} from "./forge-p02-visioner-scoring.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Scoring Contract — P02-B08-A02", () => {
  it("defines typed acceptance for all eight visioner scoring categories", () => {
    const contract = getActiveVisionerScoringContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P02-B08-A06");

    for (const category of VISIONER_SCORING_CATEGORIES) {
      const categoryContract = getVisionerScoringCategoryContract(category);
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

  it("maps 23 probes with one documented gap from P02-B08-A01 baseline", () => {
    const contract = getActiveVisionerScoringContract();
    const summary = summarizeVisionerScoringContractCoverage(contract);
    const coverage = validateVisionerScoringContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 22);
    assert.equal(summary.expectedFail, 1);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 1);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 1);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.scoring_versioning.probeCount, 3);
    assert.equal(summary.byCategory.scoring_signal.probeCount, 3);
    assert.equal(summary.byCategory.tradeoff_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists one remaining gap probe after A01 baseline fixture", () => {
    const gaps = listVisionerScoringProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, ["vsco.structured_tradeoff_recovery"]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadVisionerScoringBaseline();
    const contract = getActiveVisionerScoringContract();
    const validation = validateVisionerScoringAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listVisionerScoringContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each visioner scoring probe id is globally unique", () => {
    const ids = listVisionerScoringContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runVisionerScoringProbes();
    const contract = getActiveVisionerScoringContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveVisionerScoringContract();
    const flatIds = listVisionerScoringContractProbeIds(contract);
    const categoryIds = VISIONER_SCORING_CATEGORIES.flatMap(category =>
      listVisionerScoringContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("validates probe matrix with full alignment and one documented gap", () => {
    const contract = getActiveVisionerScoringContract();
    const results = runVisionerScoringProbes();
    const matrixValidation = validateVisionerScoringProbeMatrix(results, contract);

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

  it("exports B07 harness version for scoring baseline handoff", () => {
    assert.equal(FORGE_VISIONER_SCORING_VERSION, "1.0.0-b07");
  });
});
