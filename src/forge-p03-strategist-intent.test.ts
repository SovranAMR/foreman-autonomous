import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistIntentBaseline,
  runStrategistIntentProbes,
  getActiveStrategistIntentContract,
  getStrategistIntentCategoryContract,
  listStrategistIntentContractProbeIds,
  listStrategistIntentContractProbesByCategory,
  listStrategistIntentProbesByDisposition,
  summarizeStrategistIntentContractCoverage,
  validateStrategistIntentContractCoverage,
  validateStrategistIntentAgainstContract,
  STRATEGIST_INTENT_CATEGORIES,
} from "./forge-p03-strategist-intent.js";

describe("Forge Strategist Intent Contract — P03-B01-A02", () => {
  it("defines typed acceptance for all eight strategist intent categories", () => {
    const contract = getActiveStrategistIntentContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B01-A05");

    for (const category of STRATEGIST_INTENT_CATEGORIES) {
      const categoryContract = getStrategistIntentCategoryContract(category);
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

  it("maps 23 probes with zero remaining gaps after A03 recovery slice", () => {
    const contract = getActiveStrategistIntentContract();
    const summary = summarizeStrategistIntentContractCoverage(contract);
    const coverage = validateStrategistIntentContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.intent_versioning.probeCount, 3);
    assert.equal(summary.byCategory.task_signal.probeCount, 3);
    assert.equal(summary.byCategory.decomposition_depth.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists zero remaining gap probes after A03 recovery slice", () => {
    const gaps = listStrategistIntentProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistIntentBaseline();
    const contract = getActiveStrategistIntentContract();
    const validation = validateStrategistIntentAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listStrategistIntentContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each strategist intent probe id is globally unique", () => {
    const ids = listStrategistIntentContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runStrategistIntentProbes();
    const contract = getActiveStrategistIntentContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistIntentContract();
    const flatIds = listStrategistIntentContractProbeIds(contract);
    const categoryIds = STRATEGIST_INTENT_CATEGORIES.flatMap(category =>
      listStrategistIntentContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });
});
