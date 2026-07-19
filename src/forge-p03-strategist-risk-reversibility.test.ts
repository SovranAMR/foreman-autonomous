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
  runStrategistRiskReversibilityBoundarySlice,
  runStrategistRiskReversibilityFailureRecoverySlice,
  runStrategistRiskReversibilityEvidenceSlice,
  runStrategistRiskReversibilityProbesWithRecord,
  runStrategistRiskReversibilityFailureRecoverySliceWithRecord,
  buildStrategistRiskReversibilityProbeEvidence,
  buildStrategistRiskReversibilityProbeTelemetry,
  buildStrategistRiskReversibilityProvenance,
  buildStrategistRiskReversibilityRunRecord,
  validateStrategistRiskReversibilityRunRecord,
  validateStrategistRiskReversibilityFailureRecoveryRunRecord,
  validateStrategistRiskReversibilityProbeMatrix,
  validateStrategistRiskReversibilityBoundaryProbeMatrix,
  validateStrategistRiskReversibilityFailureRecoveryProbeMatrix,
  listStrategistRiskReversibilityFailureRecoveryProbeIds,
  runStrategistRiskReversibilityPropertyChecks,
  runStrategistRiskReversibilityFuzzValidation,
  runStrategistRiskReversibilityRunRecordFuzzValidation,
  runStrategistRiskReversibilityPropertyFuzzSlice,
  runStrategistRiskReversibilityForgeRegression,
  detectStrategistRiskReversibilityProbeRegression,
  buildStrategistRiskReversibilityAdversarialGuardScenarios,
  runStrategistRiskReversibilityAdversarialGuardChecks,
  validateForgeStrategistRiskReversibilityGuard,
  detectStrategistRiskReversibilityFalseAlignment,
  detectStrategistRiskReversibilityEvidenceSummaryMismatch,
  validateStrategistRiskReversibilityPerformance,
  validateStrategistRiskReversibilityCost,
  validateStrategistRiskReversibilitySafety,
  getForgeStrategistRiskReversibilityGuardControls,
  applyStrategistRiskReversibilityRunRecordFuzzMutation,
  createStrategistRiskReversibilityFuzzRng,
  STRATEGIST_RISK_REVERSIBILITY_CATEGORIES,
  STRATEGIST_RISK_REVERSIBILITY_FAILURE_RECOVERY_CATEGORIES,
  STRATEGIST_RISK_REVERSIBILITY_DECOMPOSE_MAX_LENGTH,
  FORGE_STRATEGIST_RISK_REVERSIBILITY_CONTRACT_V1,
  FORGE_STRATEGIST_RISK_REVERSIBILITY_VERSION,
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

describe("Forge Strategist Risk Reversibility Boundary Slice — P03-B05-A04", () => {
  it("assessStrategistRiskReversibilityInputBoundary handles decompose edge cases including truncation", () => {
    const empty = assessStrategistRiskReversibilityInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistRiskReversibilityInputBoundary("   \t\n  ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessStrategistRiskReversibilityInputBoundary("bad\0decompose");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const valid = assessStrategistRiskReversibilityInputBoundary(
      "REASONING: valid\nOUTPUT:\nBlock 1: task\nDEPENDENCIES: none\nCONFIDENCE: 0.8",
    );
    assert.equal(valid.disposition, "valid");
    assert.equal(valid.acceptable, true);

    const longDecompose = "x".repeat(STRATEGIST_RISK_REVERSIBILITY_DECOMPOSE_MAX_LENGTH + 500);
    const truncated = assessStrategistRiskReversibilityInputBoundary(longDecompose);
    assert.equal(truncated.disposition, "exceeds_max_length");
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedDecompose.length, STRATEGIST_RISK_REVERSIBILITY_DECOMPOSE_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("defines boundary category with decompose input edge-case probes", () => {
    const boundary = listStrategistRiskReversibilityContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "srisk.empty_decompose_boundary",
      "srisk.known_gaps_documented",
      "srisk.long_decompose_truncation_boundary",
      "srisk.probe_runner_exported",
      "srisk.source_block_gate_ref",
      "srisk.whitespace_decompose_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveStrategistRiskReversibilityContract();
    const slice = runStrategistRiskReversibilityBoundarySlice();

    assert.equal(slice.atom, "P03-B05-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listStrategistRiskReversibilityContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateStrategistRiskReversibilityBoundaryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });
});

describe("Forge Strategist Risk Reversibility Failure/Recovery Slice — P03-B05-A05", () => {
  it("defines failure/recovery categories with seven contract-wired probes", () => {
    const contract = getActiveStrategistRiskReversibilityContract();
    const probeIds = listStrategistRiskReversibilityFailureRecoveryProbeIds(contract);

    assert.equal(STRATEGIST_RISK_REVERSIBILITY_FAILURE_RECOVERY_CATEGORIES.length, 3);
    assert.equal(probeIds.length, 7);
    assert.deepEqual(probeIds.sort(), [
      "srisk.exported_orchestrator_risk_validator",
      "srisk.invalid_version_rejected",
      "srisk.malformed_decompose_guard",
      "srisk.min_category_probes",
      "srisk.nogo_irreversible_halt",
      "srisk.recovery_vision_violation_rollback_block",
      "srisk.recovery_worker_failure_rollback",
    ].sort());
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveStrategistRiskReversibilityContract();
    const slice = runStrategistRiskReversibilityFailureRecoverySlice();

    assert.equal(slice.atom, "P03-B05-A05");
    assert.equal(slice.failureRecoveryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 5);
    assert.equal(slice.matrixValidation.gapAligned, 2);

    for (const category of STRATEGIST_RISK_REVERSIBILITY_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistRiskReversibilityContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateStrategistRiskReversibilityFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves NO-GO gaps while exercising failure/recovery paths", () => {
    const slice = runStrategistRiskReversibilityFailureRecoverySlice();
    const probeIds = listStrategistRiskReversibilityFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 7);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "srisk.malformed_decompose_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const workerRollback = slice.failureRecoveryResults.find(
      r => r.id === "srisk.recovery_worker_failure_rollback",
    );
    assert.ok(workerRollback);
    assert.equal(workerRollback!.expected, "PASS");
    assert.equal(workerRollback!.actual, "PASS");

    const nogoHalt = slice.failureRecoveryResults.find(r => r.id === "srisk.nogo_irreversible_halt");
    assert.ok(nogoHalt);
    assert.equal(nogoHalt!.expected, "FAIL");
    assert.equal(nogoHalt!.actual, "FAIL");

    const riskValidatorGap = slice.failureRecoveryResults.find(
      r => r.id === "srisk.exported_orchestrator_risk_validator",
    );
    assert.ok(riskValidatorGap);
    assert.equal(riskValidatorGap!.expected, "FAIL");
    assert.equal(riskValidatorGap!.actual, "FAIL");
  });
});

describe("Forge Strategist Risk Reversibility Evidence — P03-B05-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadStrategistRiskReversibilityBaseline();
    const contract = getActiveStrategistRiskReversibilityContract();
    const probeIds = listStrategistRiskReversibilityFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildStrategistRiskReversibilityProbeEvidence(
        probeId,
        contractProbe.category,
        contractProbe.expected,
        contractProbe.expected,
        true,
        contractProbe.criterion,
        "synthetic",
        contractProbe.disposition,
        startedAt,
      );
    });

    const telemetry = probeIds.map((probeId, index) => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildStrategistRiskReversibilityProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildStrategistRiskReversibilityProvenance(
      "run-srisk-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P03-B05-A06",
        sliceCategories: STRATEGIST_RISK_REVERSIBILITY_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildStrategistRiskReversibilityRunRecord(provenance, evidence, telemetry);
    const validation = validateStrategistRiskReversibilityFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 7);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 3);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBlockGateAtom, fixture.sourceBlockGate.atom);
  });

  it("executes evidence slice with zero unexpected mismatches and valid run record", () => {
    const contract = getActiveStrategistRiskReversibilityContract();
    const slice = runStrategistRiskReversibilityEvidenceSlice();

    assert.equal(slice.atom, "P03-B05-A06");
    assert.equal(slice.evidenceProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 5);
    assert.equal(slice.matrixValidation.gapAligned, 2);
    assert.equal(
      slice.recordValidation.valid,
      true,
      slice.recordValidation.issues.map(i => i.detail).join("\n"),
    );

    for (const category of STRATEGIST_RISK_REVERSIBILITY_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistRiskReversibilityContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.evidenceResults.find(r => r.id === probe.id);
        assert.ok(result, `missing evidence result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const record = slice.record;
    assert.equal(record.evidence.length, 7);
    assert.equal(record.telemetry.length, 7);
    assert.equal(record.provenance.totalProbes, 7);
    assert.equal(record.provenance.sliceAtom, "P03-B05-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_STRATEGIST_RISK_REVERSIBILITY_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a08");
    assert.equal(record.summary.mismatches, 0);

    for (const item of record.telemetry) {
      assert.ok(item.durationMs >= 0, `${item.probeId} negative duration`);
      assert.ok(Number.isFinite(item.sequenceIndex));
    }

    for (const item of record.evidence) {
      const contractProbe = contract.probes.find(p => p.id === item.probeId)!;
      assert.ok(item.criterion.length > 0, `${item.probeId} missing criterion in evidence`);
      assert.equal(item.criterion, contractProbe.criterion);
      assert.equal(item.disposition, contractProbe.disposition);
      assert.ok(item.recordedAt.length > 10);
    }

    const recoveryProbe = record.evidence.find(
      e => e.probeId === "srisk.recovery_worker_failure_rollback",
    );
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.disposition, "recovery");
  });

  it("records evidence, telemetry and provenance for full risk reversibility run", () => {
    const contract = getActiveStrategistRiskReversibilityContract();
    const record = runStrategistRiskReversibilityProbesWithRecord();
    const validation = validateStrategistRiskReversibilityRunRecord(record, contract);

    assert.equal(record.evidence.length, 27);
    assert.equal(record.telemetry.length, 27);
    assert.equal(record.provenance.totalProbes, 27);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a08");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 27);
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveStrategistRiskReversibilityContract();
    const record = runStrategistRiskReversibilityFailureRecoverySliceWithRecord();
    const validation = validateStrategistRiskReversibilityFailureRecoveryRunRecord(record, contract);

    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.aligned, 7);
  });
});

describe("Forge Strategist Risk Reversibility Property/Fuzz — P03-B05-A07", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runStrategistRiskReversibilityPropertyChecks(FORGE_STRATEGIST_RISK_REVERSIBILITY_CONTRACT_V1);
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createStrategistRiskReversibilityFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createStrategistRiskReversibilityFuzzRng(1337);
    const rngB = createStrategistRiskReversibilityFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createStrategistRiskReversibilityFuzzRng(1338)()));
  });

  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadStrategistRiskReversibilityBaseline();
    const contract = getActiveStrategistRiskReversibilityContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runStrategistRiskReversibilityFuzzValidation(fixture, contract, seed, 24);
      assert.equal(fuzz.iterations, 24);
      assert.equal(fuzz.rejected, 24, `seed=${seed} accepted=${fuzz.accepted}`);
      assert.equal(fuzz.allMutationsRejected, true);
      for (const item of fuzz.cases) {
        assert.equal(item.valid, false, `${item.mutation.kind}@${item.mutation.probeId} should fail`);
        assert.ok(item.issueKinds.length > 0);
      }
    }
  });

  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveStrategistRiskReversibilityContract();
    const record = runStrategistRiskReversibilityFailureRecoverySliceWithRecord();

    assert.equal(
      validateStrategistRiskReversibilityFailureRecoveryRunRecord(record, contract).valid,
      true,
      validateStrategistRiskReversibilityFailureRecoveryRunRecord(record, contract).issues.map(i => i.detail).join("\n"),
    );

    const fuzz = runStrategistRiskReversibilityRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveStrategistRiskReversibilityContract();
    const fixture = loadStrategistRiskReversibilityBaseline();
    const probeIds = listStrategistRiskReversibilityContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistRiskReversibilityProbeEvidence(
        id,
        probe.category,
        probe.expected,
        probe.expected,
        true,
        probe.criterion,
        "synthetic",
        probe.disposition,
        startedAt,
      );
    });

    const telemetry = probeIds.map((id, index) => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistRiskReversibilityProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildStrategistRiskReversibilityProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildStrategistRiskReversibilityRunRecord(provenance, evidence, telemetry);

    assert.equal(validateStrategistRiskReversibilityRunRecord(record, contract).valid, true);

    const fuzz = runStrategistRiskReversibilityRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });

  it("executes property/fuzz slice with zero accepted mutations", () => {
    const slice = runStrategistRiskReversibilityPropertyFuzzSlice();

    assert.equal(slice.atom, "P03-B05-A07");
    assert.equal(slice.propertyChecksPassed, true);
    assert.equal(slice.contractFuzzRejected, true);
    assert.equal(slice.runRecordFuzzRejected, true);
    assert.equal(slice.propertyResult.allPassed, true);
    assert.equal(slice.contractFuzz.allMutationsRejected, true);
    assert.equal(slice.contractFuzz.accepted, 0);
    assert.equal(slice.runRecordFuzz.mutationsAccepted, 0);
  });
});

describe("Forge Strategist Risk Reversibility Regression — P03-B05-A08", () => {
  it("runStrategistRiskReversibilityForgeRegression passes on canonical risk reversibility matrix", () => {
    const result = runStrategistRiskReversibilityForgeRegression();

    assert.equal(result.atom, "P03-B05-A08");
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 27);
    assert.equal(result.probeRegression, null);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.propertyFuzzSlice.propertyChecksPassed, true);
    assert.equal(result.propertyFuzzSlice.contractFuzzRejected, true);
    assert.equal(result.propertyFuzzSlice.runRecordFuzzRejected, true);
    assert.ok(result.detail.includes("27/27 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
  });

  it("detectStrategistRiskReversibilityProbeRegression flags newly misaligned probes", () => {
    const prior = runStrategistRiskReversibilityProbesWithRecord();
    const current = structuredClone(prior);
    const target = current.evidence.find(item => item.aligned);
    assert.ok(target, "expected at least one aligned probe");

    target!.aligned = false;
    target!.actual = target!.expected === "PASS" ? "FAIL" : "PASS";
    current.summary = {
      ...current.summary,
      aligned: current.summary.aligned - 1,
      mismatches: current.summary.mismatches + 1,
    };

    const report = detectStrategistRiskReversibilityProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runStrategistRiskReversibilityForgeRegression compares against prior record without false regression", () => {
    const prior = runStrategistRiskReversibilityProbesWithRecord();
    const result = runStrategistRiskReversibilityForgeRegression(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runStrategistRiskReversibilityForgeRegression rejects tampered prior records", () => {
    const prior = runStrategistRiskReversibilityProbesWithRecord();
    const tamperedPrior = applyStrategistRiskReversibilityRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateStrategistRiskReversibilityRunRecord(tamperedPrior).valid, false);

    const result = runStrategistRiskReversibilityForgeRegression(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runStrategistRiskReversibilityForgeRegression fails when probe alignment regresses", () => {
    const prior = runStrategistRiskReversibilityProbesWithRecord();
    const tamperedCurrent = structuredClone(prior);
    const target = tamperedCurrent.evidence[0]!;
    target.aligned = false;
    target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
    tamperedCurrent.summary = {
      ...tamperedCurrent.summary,
      aligned: tamperedCurrent.summary.aligned - 1,
      mismatches: tamperedCurrent.summary.mismatches + 1,
    };

    const report = detectStrategistRiskReversibilityProbeRegression(prior, tamperedCurrent);
    assert.equal(report.hasRegression, true);
  });
});

describe("Forge Strategist Risk Reversibility Guard — P03-B05-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runStrategistRiskReversibilityProbesWithRecord();
    const contract = getActiveStrategistRiskReversibilityContract();
    const adversarial = runStrategistRiskReversibilityAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildStrategistRiskReversibilityProbeEvidence(
      "srisk.version_tagged",
      "risk_versioning",
      "PASS",
      "FAIL",
      true,
      "test",
      "false pass claim",
      "observed",
      "2026-07-19T06:00:00.000Z",
    );
    const fixture = loadStrategistRiskReversibilityBaseline();
    const contract = getActiveStrategistRiskReversibilityContract();
    const falsePassRecord = buildStrategistRiskReversibilityRunRecord(
      buildStrategistRiskReversibilityProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T06:00:00.000Z",
        "2026-07-19T06:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildStrategistRiskReversibilityProbeTelemetry("srisk.version_tagged", "risk_versioning", 0, 1)],
    );
    assert.ok(detectStrategistRiskReversibilityFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildStrategistRiskReversibilityProbeEvidence(
      "srisk.version_tagged",
      "risk_versioning",
      "PASS",
      "FAIL",
      false,
      "test",
      "summary tamper",
      "observed",
      "2026-07-19T06:00:00.000Z",
    );
    const summaryRecord = buildStrategistRiskReversibilityRunRecord(
      buildStrategistRiskReversibilityProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T06:00:00.000Z",
        "2026-07-19T06:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildStrategistRiskReversibilityProbeTelemetry("srisk.version_tagged", "risk_versioning", 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectStrategistRiskReversibilityEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildStrategistRiskReversibilityAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildStrategistRiskReversibilityAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Strategist Risk Reversibility Guard — P03-B05-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical risk reversibility run", () => {
    const record = runStrategistRiskReversibilityProbesWithRecord();
    const contract = getActiveStrategistRiskReversibilityContract();
    const guard = validateForgeStrategistRiskReversibilityGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeStrategistRiskReversibilityGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadStrategistRiskReversibilityBaseline();
    const contract = getActiveStrategistRiskReversibilityContract();
    const probeIds = listStrategistRiskReversibilityContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistRiskReversibilityProbeEvidence(
        id,
        probe.category,
        probe.expected,
        probe.expected,
        true,
        probe.criterion,
        "ok",
        probe.disposition,
      );
    });
    const telemetry = probeIds.map((id, index) => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistRiskReversibilityProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildStrategistRiskReversibilityRunRecord(
      buildStrategistRiskReversibilityProvenance(
        "perf-test",
        fixture,
        contract,
        "2026-07-19T06:00:00.000Z",
        "2026-07-19T06:00:01.000Z",
        probeIds.length,
      ),
      evidence,
      telemetry,
    );

    const perfIssues = validateStrategistRiskReversibilityPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateStrategistRiskReversibilityCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadStrategistRiskReversibilityBaseline();
    const contract = getActiveStrategistRiskReversibilityContract();
    const evidence = buildStrategistRiskReversibilityProbeEvidence(
      "srisk.version_tagged",
      "risk_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildStrategistRiskReversibilityRunRecord(
      buildStrategistRiskReversibilityProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T06:00:00.000Z",
        "2026-07-19T06:00:01.000Z",
        1,
      ),
      [evidence],
      [buildStrategistRiskReversibilityProbeTelemetry("srisk.version_tagged", "risk_versioning", 0, 1)],
    );

    const safetyIssues = validateStrategistRiskReversibilitySafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});
