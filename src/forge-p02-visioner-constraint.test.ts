import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerConstraintBaseline,
  runVisionerConstraintProbes,
} from "./forge-p02-visioner-constraint.probe.js";
import {
  getActiveVisionerConstraintContract,
  getVisionerConstraintCategoryContract,
  listVisionerConstraintContractProbeIds,
  listVisionerConstraintContractProbesByCategory,
  listVisionerConstraintProbesByDisposition,
  summarizeVisionerConstraintContractCoverage,
  validateVisionerConstraintContractCoverage,
  validateVisionerConstraintAgainstContract,
  VISIONER_CONSTRAINT_CATEGORIES,
} from "./forge-p02-visioner-constraint.js";

describe("Forge Visioner Constraint Contract — P02-B02-A02", () => {
  it("defines typed acceptance for all eight visioner constraint categories", () => {
    const contract = getActiveVisionerConstraintContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P02-B02-A05");

    for (const category of VISIONER_CONSTRAINT_CATEGORIES) {
      const categoryContract = getVisionerConstraintCategoryContract(category);
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
    const contract = getActiveVisionerConstraintContract();
    const summary = summarizeVisionerConstraintContractCoverage(contract);
    const coverage = validateVisionerConstraintContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 22);
    assert.equal(summary.expectedFail, 1);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 1);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 1);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.constraint_versioning.probeCount, 3);
    assert.equal(summary.byCategory.constraint_signal.probeCount, 3);
    assert.equal(summary.byCategory.non_goal_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists one remaining gap probe for structured constraint recovery", () => {
    const gaps = listVisionerConstraintProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, ["vcon.structured_constraint_recovery"]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadVisionerConstraintBaseline();
    const contract = getActiveVisionerConstraintContract();
    const validation = validateVisionerConstraintAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listVisionerConstraintContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each visioner constraint probe id is globally unique", () => {
    const ids = listVisionerConstraintContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runVisionerConstraintProbes();
    const contract = getActiveVisionerConstraintContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveVisionerConstraintContract();
    const flatIds = listVisionerConstraintContractProbeIds(contract);
    const categoryIds = VISIONER_CONSTRAINT_CATEGORIES.flatMap(category =>
      listVisionerConstraintContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });
});
