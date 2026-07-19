import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistBlockContractBaseline,
  getActiveStrategistBlockContract,
  getStrategistBlockContractCategoryContract,
  listStrategistBlockContractContractProbeIds,
  listStrategistBlockContractProbesByDisposition,
  summarizeStrategistBlockContractCoverage,
  validateStrategistBlockContractCoverage,
  validateStrategistBlockContractAgainstContract,
  STRATEGIST_BLOCK_CONTRACT_CATEGORIES,
  FORGE_STRATEGIST_BLOCK_CONTRACT_V1,
} from "./forge-p03-strategist-block-contract.js";

describe("Forge Strategist Block Contract — P03-B02-A02", () => {
  it("defines typed acceptance for all eight block production contract categories", () => {
    const contract = getActiveStrategistBlockContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B02-A05");

    for (const category of STRATEGIST_BLOCK_CONTRACT_CATEGORIES) {
      const categoryContract = getStrategistBlockContractCategoryContract(category);
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

  it("maps 23 probes with one documented FAIL gap for structured block recovery", () => {
    const contract = getActiveStrategistBlockContract();
    const summary = summarizeStrategistBlockContractCoverage(contract);
    const coverage = validateStrategistBlockContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 22);
    assert.equal(summary.expectedFail, 1);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 1);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 1);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.block_versioning.probeCount, 3);
    assert.equal(summary.byCategory.block_structure.probeCount, 3);
    assert.equal(summary.byCategory.block_metadata.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists one gap probe for structured block recovery", () => {
    const gaps = listStrategistBlockContractProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), ["sblk.structured_block_recovery"]);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistBlockContractBaseline();
    const contract = getActiveStrategistBlockContract();
    const validation = validateStrategistBlockContractAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistBlockContractContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_BLOCK_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_BLOCK_CONTRACT_V1.probes.length, 23);
  });
});
