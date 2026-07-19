import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistAtomizationBaseline,
  getActiveStrategistAtomizationContract,
  getStrategistAtomizationCategoryContract,
  listStrategistAtomizationContractProbeIds,
  listStrategistAtomizationContractProbesByCategory,
  listStrategistAtomizationProbesByDisposition,
  summarizeStrategistAtomizationCoverage,
  validateStrategistAtomizationCoverage,
  validateStrategistAtomizationAgainstContract,
  STRATEGIST_ATOMIZATION_CATEGORIES,
  FORGE_STRATEGIST_ATOMIZATION_CONTRACT_V1,
} from "./forge-p03-strategist-atomization.js";

describe("Forge Strategist Atomization Contract — P03-B03-A02", () => {
  it("defines typed acceptance for all eight atomization categories", () => {
    const contract = getActiveStrategistAtomizationContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B03-A06");

    for (const category of STRATEGIST_ATOMIZATION_CATEGORIES) {
      const categoryContract = getStrategistAtomizationCategoryContract(category);
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

  it("maps 23 probes with four documented FAIL gaps from A01 baseline", () => {
    const contract = getActiveStrategistAtomizationContract();
    const summary = summarizeStrategistAtomizationCoverage(contract);
    const coverage = validateStrategistAtomizationCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 19);
    assert.equal(summary.expectedFail, 4);
    assert.equal(summary.byDisposition.observed, 15);
    assert.equal(summary.byDisposition.gap, 4);
    assert.equal(summary.byDisposition.failure, 1);
    assert.equal(summary.byDisposition.recovery, 1);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.atom_versioning.probeCount, 3);
    assert.equal(summary.byCategory.atom_structure.probeCount, 3);
    assert.equal(summary.byCategory.atom_sizing.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists four gap probes documenting A01 baseline debt", () => {
    const gaps = listStrategistAtomizationProbesByDisposition("gap");
    assert.deepEqual(
      gaps.map(p => p.id).sort(),
      [
        "satom.empty_atomize_boundary",
        "satom.malformed_atomize_guard",
        "satom.structured_atom_recovery",
        "satom.whitespace_atomize_boundary",
      ],
    );
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistAtomizationBaseline();
    const contract = getActiveStrategistAtomizationContract();
    const validation = validateStrategistAtomizationAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistAtomizationContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_ATOMIZATION_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_ATOMIZATION_CONTRACT_V1.probes.length, 23);
  });

  it("each atomization probe id is globally unique", () => {
    const ids = listStrategistAtomizationContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistAtomizationContract();
    const flatIds = listStrategistAtomizationContractProbeIds(contract);
    const categoryIds = STRATEGIST_ATOMIZATION_CATEGORIES.flatMap(category =>
      listStrategistAtomizationContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });
});
