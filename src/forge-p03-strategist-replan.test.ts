import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistReplanBaseline,
  runStrategistReplanProbes,
  getActiveStrategistReplanContract,
  getStrategistReplanCategoryContract,
  listStrategistReplanContractProbeIds,
  listStrategistReplanContractProbesByCategory,
  listStrategistReplanProbesByDisposition,
  summarizeStrategistReplanCoverage,
  validateStrategistReplanCoverage,
  validateStrategistReplanAgainstContract,
  validateStrategistReplanBaseline,
  STRATEGIST_REPLAN_CATEGORIES,
  FORGE_STRATEGIST_REPLAN_CONTRACT_V1,
} from "./forge-p03-strategist-replan.js";

describe("Forge Strategist Replan Contract — P03-B08-A02", () => {
  it("defines typed acceptance for all nine replan categories", () => {
    const contract = getActiveStrategistReplanContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B08-A06");

    for (const category of STRATEGIST_REPLAN_CATEGORIES) {
      const categoryContract = getStrategistReplanCategoryContract(category);
      assert.ok(categoryContract.acceptance.invariant.length > 20, `${category} invariant too short`);
      assert.ok(categoryContract.probes.length >= categoryContract.acceptance.minProbeCount);

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

  it("maps 28 probes with six documented FAIL gaps aligned to A01 baseline", () => {
    const contract = getActiveStrategistReplanContract();
    const summary = summarizeStrategistReplanCoverage(contract);
    const coverage = validateStrategistReplanCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 28);
    assert.equal(summary.expectedPass, 22);
    assert.equal(summary.expectedFail, 6);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 5);
    assert.equal(summary.byDisposition.failure, 3);
    assert.equal(summary.byDisposition.recovery, 3);
    assert.equal(summary.byDisposition.nogo, 0);
    assert.equal(summary.byCategory.replan_versioning.probeCount, 3);
    assert.equal(summary.byCategory.block_replan_path.probeCount, 4);
    assert.equal(summary.byCategory.atom_replan_path.probeCount, 2);
    assert.equal(summary.byCategory.plan_repair_seam.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 3);
    assert.equal(summary.byCategory.recovery_path.probeCount, 3);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists five remaining gap probes matching documented replan debt", () => {
    const gaps = listStrategistReplanProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), [
      "sreplan.exported_replan_validator",
      "sreplan.nogo_invalid_replan",
      "sreplan.orchestrator_strategist_replan_gate",
      "sreplan.parser_replan_fields",
      "sreplan.prompt_replan_plan",
    ]);

    const nogoGaps = listStrategistReplanProbesByDisposition("nogo").filter(
      p => p.expected === "FAIL",
    );
    assert.deepEqual(nogoGaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistReplanBaseline();
    const contract = getActiveStrategistReplanContract();
    const validation = validateStrategistReplanAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistReplanContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("baseline validation includes contract alignment from A02", () => {
    const fixture = loadStrategistReplanBaseline();
    const validation = validateStrategistReplanBaseline(fixture);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_REPLAN_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_REPLAN_CONTRACT_V1.probes.length, 28);
  });

  it("each replan probe id is globally unique", () => {
    const ids = listStrategistReplanContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistReplanContract();
    const flatIds = listStrategistReplanContractProbeIds(contract);
    const categoryIds = STRATEGIST_REPLAN_CATEGORIES.flatMap(category =>
      listStrategistReplanContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runStrategistReplanProbes();
    const contract = getActiveStrategistReplanContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});
