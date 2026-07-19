import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistResourceBudgetBaseline,
  runStrategistResourceBudgetProbes,
  getActiveStrategistResourceBudgetContract,
  getStrategistResourceBudgetCategoryContract,
  listStrategistResourceBudgetContractProbeIds,
  listStrategistResourceBudgetContractProbesByCategory,
  listStrategistResourceBudgetProbesByDisposition,
  summarizeStrategistResourceBudgetCoverage,
  validateStrategistResourceBudgetCoverage,
  validateStrategistResourceBudgetAgainstContract,
  validateStrategistResourceBudgetBaseline,
  STRATEGIST_RESOURCE_BUDGET_CATEGORIES,
  FORGE_STRATEGIST_RESOURCE_BUDGET_CONTRACT_V1,
} from "./forge-p03-strategist-resource-budget.js";

describe("Forge Strategist Resource Budget Contract — P03-B06-A02", () => {
  it("defines typed acceptance for all eight resource budget categories", () => {
    const contract = getActiveStrategistResourceBudgetContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B06-A06");

    for (const category of STRATEGIST_RESOURCE_BUDGET_CATEGORIES) {
      const categoryContract = getStrategistResourceBudgetCategoryContract(category);
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

  it("maps 27 probes with four documented FAIL gaps aligned to A01 baseline", () => {
    const contract = getActiveStrategistResourceBudgetContract();
    const summary = summarizeStrategistResourceBudgetCoverage(contract);
    const coverage = validateStrategistResourceBudgetCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 27);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 4);
    assert.equal(summary.byDisposition.observed, 18);
    assert.equal(summary.byDisposition.gap, 2);
    assert.equal(summary.byDisposition.failure, 3);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.budget_versioning.probeCount, 3);
    assert.equal(summary.byCategory.token_budget.probeCount, 5);
    assert.equal(summary.byCategory.cost_budget.probeCount, 4);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 3);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists two remaining gap probes matching documented resource budget debt", () => {
    const gaps = listStrategistResourceBudgetProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), [
      "sbudget.orchestrator_pre_exec_budget_gate",
      "sbudget.prompt_atom_resource_estimate",
    ]);

    const nogoGaps = listStrategistResourceBudgetProbesByDisposition("nogo").filter(
      p => p.expected === "FAIL",
    );
    assert.deepEqual(nogoGaps.map(p => p.id).sort(), [
      "sbudget.exported_orchestrator_budget_validator",
      "sbudget.nogo_budget_recovery_halt",
    ]);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistResourceBudgetBaseline();
    const contract = getActiveStrategistResourceBudgetContract();
    const validation = validateStrategistResourceBudgetAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistResourceBudgetContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("baseline validation includes contract alignment from A02", () => {
    const fixture = loadStrategistResourceBudgetBaseline();
    const validation = validateStrategistResourceBudgetBaseline(fixture);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_RESOURCE_BUDGET_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_RESOURCE_BUDGET_CONTRACT_V1.probes.length, 27);
  });

  it("each resource budget probe id is globally unique", () => {
    const ids = listStrategistResourceBudgetContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistResourceBudgetContract();
    const flatIds = listStrategistResourceBudgetContractProbeIds(contract);
    const categoryIds = STRATEGIST_RESOURCE_BUDGET_CATEGORIES.flatMap(category =>
      listStrategistResourceBudgetContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runStrategistResourceBudgetProbes();
    const contract = getActiveStrategistResourceBudgetContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});
