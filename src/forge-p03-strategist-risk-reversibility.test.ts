import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistRiskReversibilityBaseline,
  getActiveStrategistRiskReversibilityContract,
  getStrategistRiskReversibilityCategoryContract,
  listStrategistRiskReversibilityContractProbeIds,
  listStrategistRiskReversibilityContractProbesByCategory,
  listStrategistRiskReversibilityProbesByDisposition,
  summarizeStrategistRiskReversibilityCoverage,
  validateStrategistRiskReversibilityCoverage,
  validateStrategistRiskReversibilityAgainstContract,
  validateStrategistRiskReversibilityBaseline,
  STRATEGIST_RISK_REVERSIBILITY_CATEGORIES,
  FORGE_STRATEGIST_RISK_REVERSIBILITY_CONTRACT_V1,
} from "./forge-p03-strategist-risk-reversibility.js";

describe("Forge Strategist Risk Reversibility Contract — P03-B05-A02", () => {
  it("defines typed acceptance for all eight risk reversibility categories", () => {
    const contract = getActiveStrategistRiskReversibilityContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B05-A06");

    for (const category of STRATEGIST_RISK_REVERSIBILITY_CATEGORIES) {
      const categoryContract = getStrategistRiskReversibilityCategoryContract(category);
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

  it("maps 27 probes with six documented FAIL gaps aligned to A01 baseline", () => {
    const contract = getActiveStrategistRiskReversibilityContract();
    const summary = summarizeStrategistRiskReversibilityCoverage(contract);
    const coverage = validateStrategistRiskReversibilityCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 27);
    assert.equal(summary.expectedPass, 21);
    assert.equal(summary.expectedFail, 6);
    assert.equal(summary.byDisposition.observed, 16);
    assert.equal(summary.byDisposition.gap, 4);
    assert.equal(summary.byDisposition.failure, 3);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.risk_versioning.probeCount, 3);
    assert.equal(summary.byCategory.risk_assessment.probeCount, 5);
    assert.equal(summary.byCategory.reversibility_plan.probeCount, 4);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 3);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists six gap probes matching documented risk reversibility debt", () => {
    const gaps = listStrategistRiskReversibilityProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), [
      "srisk.orchestrator_pre_exec_risk_gate",
      "srisk.parser_risk_plan_fields",
      "srisk.prompt_atom_blast_radius",
      "srisk.prompt_decompose_risk_plan",
    ]);

    const nogoGaps = listStrategistRiskReversibilityProbesByDisposition("nogo").filter(
      p => p.expected === "FAIL",
    );
    assert.deepEqual(nogoGaps.map(p => p.id).sort(), [
      "srisk.exported_orchestrator_risk_validator",
      "srisk.nogo_irreversible_halt",
    ]);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistRiskReversibilityBaseline();
    const contract = getActiveStrategistRiskReversibilityContract();
    const validation = validateStrategistRiskReversibilityAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistRiskReversibilityContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("baseline validation includes contract alignment from A02", () => {
    const fixture = loadStrategistRiskReversibilityBaseline();
    const validation = validateStrategistRiskReversibilityBaseline(fixture);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_RISK_REVERSIBILITY_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_RISK_REVERSIBILITY_CONTRACT_V1.probes.length, 27);
  });

  it("each risk reversibility probe id is globally unique", () => {
    const ids = listStrategistRiskReversibilityContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistRiskReversibilityContract();
    const flatIds = listStrategistRiskReversibilityContractProbeIds(contract);
    const categoryIds = STRATEGIST_RISK_REVERSIBILITY_CATEGORIES.flatMap(category =>
      listStrategistRiskReversibilityContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });
});
