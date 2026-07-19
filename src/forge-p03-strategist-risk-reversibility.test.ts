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
  recoverStrategistRiskReversibility,
  assessStrategistRiskReversibilityInputBoundary,
  runStrategistRiskReversibilityProductionSlice,
  validateStrategistRiskReversibilityProbeMatrix,
  STRATEGIST_RISK_REVERSIBILITY_CATEGORIES,
  FORGE_STRATEGIST_RISK_REVERSIBILITY_CONTRACT_V1,
} from "./forge-p03-strategist-risk-reversibility.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

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

describe("Forge Strategist Risk Reversibility Production Slice — P03-B05-A03", () => {
  it("recoverStrategistRiskReversibility restructures malformed decompose into risk-reversibility plan", () => {
    const malformed = `REASONING: Need risk-aware decomposition
Here are the steps:
Block 1: Setup risk baseline types
Block 2: Wire rollback checkpoint seam
Block 3: Add risk reversibility tests
DEPENDENCIES: 2→1, 3→1,2
CONFIDENCE: 0.8`;
    const recovery = recoverStrategistRiskReversibility(malformed);

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.riskReversibilityCompliant, true);
    assert.ok(recovery.blockCount >= 3);
    assert.match(recovery.composedDecompose, /RISKS:/i);
    assert.match(recovery.composedDecompose, /ROLLBACK PLAN:/i);
    assert.ok(recovery.blocks.some(block => block.includes("risk baseline types")));
    assert.ok(recovery.blocks.some(block => block.includes("rollback checkpoint seam")));
    assert.ok(recovery.blocks.some(block => block.includes("risk reversibility tests")));
  });

  it("recoverStrategistRiskReversibility rejects null-byte decompose output safely", () => {
    const recovery = recoverStrategistRiskReversibility("decompose\0output");
    assert.equal(recovery.recovered, false);
    assert.equal(recovery.riskReversibilityCompliant, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_decompose"]);
  });

  it("recoverStrategistRiskReversibility injects risk plan when strategist omits RISKS and ROLLBACK PLAN", () => {
    const missingRiskPlan = `REASONING: Blocks without explicit risk metadata
OUTPUT:
Block 1: Root risk baseline block
Block 2: Wire reversibility seam
Block 3: Final risk integration
DEPENDENCIES: none
CONFIDENCE: 0.75`;
    const recovery = recoverStrategistRiskReversibility(missingRiskPlan);

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.riskReversibilityCompliant, true);
    assert.equal(recovery.hasRisks, true);
    assert.equal(recovery.hasRollbackPlan, true);
    assert.ok(recovery.parseErrors.includes("risks_injected"));
    assert.ok(recovery.parseErrors.includes("rollback_plan_injected"));
  });

  it("assessStrategistRiskReversibilityInputBoundary handles decompose edge cases", () => {
    const empty = assessStrategistRiskReversibilityInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistRiskReversibilityInputBoundary("   \t\n  ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessStrategistRiskReversibilityInputBoundary("bad\0decompose");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);
  });

  it("executes contract-wired probes with zero unexpected mismatches after recovery slice", () => {
    const contract = getActiveStrategistRiskReversibilityContract();
    const slice = runStrategistRiskReversibilityProductionSlice();

    assert.equal(slice.atom, "P03-B05-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 27);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 21);
    assert.equal(slice.matrixValidation.gapAligned, 6);
    assert.equal(slice.summary.knownGaps.length, 6);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateStrategistRiskReversibilityProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });
});
