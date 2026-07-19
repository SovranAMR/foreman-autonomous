import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistProvenanceBaseline,
  runStrategistProvenanceProbes,
  getActiveStrategistProvenanceContract,
  getStrategistProvenanceCategoryContract,
  listStrategistProvenanceContractProbeIds,
  listStrategistProvenanceContractProbesByCategory,
  listStrategistProvenanceProbesByDisposition,
  summarizeStrategistProvenanceCoverage,
  validateStrategistProvenanceCoverage,
  validateStrategistProvenanceAgainstContract,
  validateStrategistProvenanceBaseline,
  validateStrategistProvenanceProbeMatrix,
  validateStrategistProvenanceBoundaryProbeMatrix,
  validatePlanDrift,
  rejectUndetectedPlanDrift,
  assessStrategistProvenanceInputBoundary,
  runStrategistProvenanceProductionSlice,
  runStrategistProvenanceBoundarySlice,
  runStrategistProvenanceFailureRecoverySlice,
  validateStrategistProvenanceFailureRecoveryProbeMatrix,
  listStrategistProvenanceFailureRecoveryProbeIds,
  runStrategistProvenanceEvidenceSlice,
  runStrategistProvenanceProbesWithRecord,
  runStrategistProvenanceFailureRecoverySliceWithRecord,
  validateStrategistProvenanceRunRecord,
  validateStrategistProvenanceFailureRecoveryRunRecord,
  buildStrategistProvenanceProbeEvidence,
  buildStrategistProvenanceProbeTelemetry,
  buildStrategistProvenanceProvenance,
  buildStrategistProvenanceRunRecord,
  runStrategistProvenancePropertyChecks,
  createStrategistProvenanceFuzzRng,
  runStrategistProvenanceFuzzValidation,
  runStrategistProvenanceRunRecordFuzzValidation,
  runStrategistProvenancePropertyFuzzSlice,
  detectStrategistProvenanceProbeRegression,
  runStrategistProvenanceProbeRegression,
  validateStrategistProvenanceProbeRegression,
  runStrategistProvenanceForgeRegression,
  runForgeStrategistProvenanceRegressionGate,
  applyStrategistProvenanceRunRecordFuzzMutation,
  STRATEGIST_PROVENANCE_FAILURE_RECOVERY_CATEGORIES,
  STRATEGIST_PROVENANCE_CATEGORIES,
  STRATEGIST_PROVENANCE_DECOMPOSE_MAX_LENGTH,
  PLAN_DRIFT_THRESHOLD,
  FORGE_STRATEGIST_PROVENANCE_CONTRACT_V1,
  FORGE_STRATEGIST_PROVENANCE_VERSION,
} from "./forge-p03-strategist-provenance.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Plan Provenance Contract — P03-B09-A02", () => {
  it("defines typed acceptance for all nine provenance categories", () => {
    const contract = getActiveStrategistProvenanceContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B09-A06");

    for (const category of STRATEGIST_PROVENANCE_CATEGORIES) {
      const categoryContract = getStrategistProvenanceCategoryContract(category);
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

  it("maps 28 probes with zero remaining FAIL gaps after A03 production slice", () => {
    const contract = getActiveStrategistProvenanceContract();
    const summary = summarizeStrategistProvenanceCoverage(contract);
    const coverage = validateStrategistProvenanceCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 28);
    assert.equal(summary.expectedPass, 28);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 21);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 3);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.provenance_versioning.probeCount, 3);
    assert.equal(summary.byCategory.plan_lineage.probeCount, 3);
    assert.equal(summary.byCategory.drift_detection.probeCount, 4);
    assert.equal(summary.byCategory.provenance_seam.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 3);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists no remaining gap probes after A03 provenance production slice", () => {
    const gaps = listStrategistProvenanceProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);

    const nogoGaps = listStrategistProvenanceProbesByDisposition("nogo").filter(
      p => p.expected === "FAIL",
    );
    assert.deepEqual(nogoGaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistProvenanceBaseline();
    const contract = getActiveStrategistProvenanceContract();
    const validation = validateStrategistProvenanceAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistProvenanceContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("baseline validation includes contract alignment from A02", () => {
    const fixture = loadStrategistProvenanceBaseline();
    const validation = validateStrategistProvenanceBaseline(fixture);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_PROVENANCE_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_PROVENANCE_CONTRACT_V1.probes.length, 28);
  });

  it("each provenance probe id is globally unique", () => {
    const ids = listStrategistProvenanceContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistProvenanceContract();
    const flatIds = listStrategistProvenanceContractProbeIds(contract);
    const categoryIds = STRATEGIST_PROVENANCE_CATEGORIES.flatMap(category =>
      listStrategistProvenanceContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runStrategistProvenanceProbes();
    const contract = getActiveStrategistProvenanceContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});

describe("Forge Strategist Plan Provenance Production Slice — P03-B09-A03", () => {
  it("validatePlanDrift accepts valid provenance and rejects severe vision mismatch", () => {
    const valid = `REASONING: Plan provenance
OUTPUT:
Block 1: Wire plan lineage types
Block 2: Add drift detection seam
DEPENDENCIES: 2→1
PLAN PROVENANCE: vision lineage preserved for audit trail
CONFIDENCE: 0.9`;
    const validResult = validatePlanDrift(
      valid,
      "vision lineage preserved for audit trail and execution",
    );
    assert.equal(validResult.valid, true);
    assert.equal(validResult.driftDetected, false);
    assert.equal(validResult.hasPlanProvenance, true);
    assert.equal(validResult.blockCount, 2);

    const drifted = `REASONING: Drifted plan
OUTPUT:
Block 1: Unrelated work
DEPENDENCIES: none
CONFIDENCE: 0.8`;
    const driftResult = validatePlanDrift(
      drifted,
      "minimal authentication service with session tokens only",
    );
    assert.equal(driftResult.driftDetected, true);
    assert.ok(driftResult.driftScore >= driftResult.driftThreshold);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveStrategistProvenanceContract();
    const slice = runStrategistProvenanceProductionSlice();

    assert.equal(slice.atom, "P03-B09-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 28);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 28);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const flippedGaps = slice.results.filter(
      r =>
        (r.id === "sprov.prompt_plan_provenance" ||
          r.id === "sprov.orchestrator_pre_exec_drift_gate" ||
          r.id === "sprov.parser_provenance_fields" ||
          r.id === "sprov.plan_provenance_graph" ||
          r.id === "sprov.exported_plan_drift_validator" ||
          r.id === "sprov.nogo_undetected_drift") &&
        r.expected === "PASS" &&
        r.actual === "PASS",
    );
    assert.equal(flippedGaps.length, 6, "A03 closes all six provenance contract gaps");

    const matrixValidation = validateStrategistProvenanceProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });
});

describe("Forge Strategist Plan Provenance Boundary Slice — P03-B09-A04", () => {
  it("assessStrategistProvenanceInputBoundary handles decompose edge cases including truncation", () => {
    const empty = assessStrategistProvenanceInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistProvenanceInputBoundary("   \t\n  ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessStrategistProvenanceInputBoundary("bad\0decompose");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const valid = assessStrategistProvenanceInputBoundary(SAMPLE_BLOCK_DECOMPOSE);
    assert.equal(valid.disposition, "valid");
    assert.equal(valid.acceptable, true);

    const longDecompose = "x".repeat(STRATEGIST_PROVENANCE_DECOMPOSE_MAX_LENGTH + 500);
    const truncated = assessStrategistProvenanceInputBoundary(longDecompose);
    assert.equal(truncated.disposition, "exceeds_max_length");
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedDecompose.length, STRATEGIST_PROVENANCE_DECOMPOSE_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("validatePlanDrift rejects unacceptable decompose input and respects drift threshold", () => {
    const emptyDrift = validatePlanDrift("");
    assert.equal(emptyDrift.valid, false);
    assert.equal(emptyDrift.driftDetected, false);
    assert.ok(emptyDrift.issues.length > 0);

    const whitespaceDrift = validatePlanDrift("   ");
    assert.equal(whitespaceDrift.valid, false);
    assert.equal(whitespaceDrift.driftDetected, false);

    const missingProvenance = `REASONING: No provenance
OUTPUT:
Block 1: Wire plan lineage types
DEPENDENCIES: none
CONFIDENCE: 0.8`;
    const missingResult = validatePlanDrift(missingProvenance);
    assert.equal(missingResult.hasPlanProvenance, false);
    assert.ok(missingResult.driftScore >= 0.35);
    assert.equal(rejectUndetectedPlanDrift(missingResult), missingResult.driftDetected);
    assert.equal(PLAN_DRIFT_THRESHOLD, 0.65);

    const aligned = validatePlanDrift(
      SAMPLE_BLOCK_DECOMPOSE,
      "vision lineage preserved for audit trail and execution",
    );
    assert.equal(aligned.valid, true);
    assert.equal(aligned.driftDetected, false);
    assert.equal(aligned.driftThreshold, PLAN_DRIFT_THRESHOLD);
  });

  it("defines boundary category with decompose input edge-case probes", () => {
    const boundary = listStrategistProvenanceContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "sprov.empty_decompose_boundary",
      "sprov.known_gaps_documented",
      "sprov.long_decompose_truncation_boundary",
      "sprov.probe_runner_exported",
      "sprov.source_block_gate_ref",
      "sprov.whitespace_decompose_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveStrategistProvenanceContract();
    const slice = runStrategistProvenanceBoundarySlice();

    assert.equal(slice.atom, "P03-B09-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listStrategistProvenanceContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateStrategistProvenanceBoundaryProbeMatrix(
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

describe("Forge Strategist Plan Provenance Failure/Recovery Slice — P03-B09-A05", () => {
  it("defines seven failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveStrategistProvenanceContract();
    const probeIds = listStrategistProvenanceFailureRecoveryProbeIds(contract);

    assert.equal(STRATEGIST_PROVENANCE_FAILURE_RECOVERY_CATEGORIES.length, 3);
    assert.equal(probeIds.length, 7);
    assert.deepEqual(probeIds.sort(), [
      "sprov.exported_plan_drift_validator",
      "sprov.invalid_version_rejected",
      "sprov.malformed_decompose_guard",
      "sprov.min_category_probes",
      "sprov.nogo_undetected_drift",
      "sprov.recovery_reflecting_drift",
      "sprov.recovery_replan_lineage_checkpoint",
    ].sort());

    assert.equal(
      listStrategistProvenanceContractProbesByCategory("failure_path", contract).length,
      3,
    );
    assert.equal(
      listStrategistProvenanceContractProbesByCategory("recovery_path", contract).length,
      2,
    );
    assert.equal(
      listStrategistProvenanceContractProbesByCategory("nogo_path", contract).length,
      2,
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveStrategistProvenanceContract();
    const slice = runStrategistProvenanceFailureRecoverySlice();

    assert.equal(slice.atom, "P03-B09-A05");
    assert.equal(slice.failureRecoveryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of STRATEGIST_PROVENANCE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistProvenanceContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateStrategistProvenanceFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure, recovery and NO-GO provenance paths with all probes passing", () => {
    const slice = runStrategistProvenanceFailureRecoverySlice();
    const probeIds = listStrategistProvenanceFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 7);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "sprov.malformed_decompose_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const reflectingDrift = slice.failureRecoveryResults.find(
      r => r.id === "sprov.recovery_reflecting_drift",
    );
    assert.ok(reflectingDrift);
    assert.equal(reflectingDrift!.expected, "PASS");
    assert.equal(reflectingDrift!.actual, "PASS");

    const undetectedDrift = slice.failureRecoveryResults.find(
      r => r.id === "sprov.nogo_undetected_drift",
    );
    assert.ok(undetectedDrift);
    assert.equal(undetectedDrift!.expected, "PASS");
    assert.equal(undetectedDrift!.actual, "PASS");

    const planDriftValidator = slice.failureRecoveryResults.find(
      r => r.id === "sprov.exported_plan_drift_validator",
    );
    assert.ok(planDriftValidator);
    assert.equal(planDriftValidator!.expected, "PASS");
    assert.equal(planDriftValidator!.actual, "PASS");
  });
});

describe("Forge Strategist Plan Provenance Evidence — P03-B09-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadStrategistProvenanceBaseline();
    const contract = getActiveStrategistProvenanceContract();
    const probeIds = listStrategistProvenanceFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildStrategistProvenanceProbeEvidence(
        probeId,
        contractProbe.category,
        contractProbe.expected,
        contractProbe.expected,
        true,
        contractProbe.criterion,
        "synthetic",
        contractProbe.disposition,
        completedAt,
      );
    });

    const telemetry = probeIds.map((probeId, index) => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildStrategistProvenanceProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildStrategistProvenanceProvenance(
      "run-sprov-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P03-B09-A06",
        sliceCategories: STRATEGIST_PROVENANCE_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildStrategistProvenanceRunRecord(provenance, evidence, telemetry);
    const validation = validateStrategistProvenanceFailureRecoveryRunRecord(record, contract);

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
    const contract = getActiveStrategistProvenanceContract();
    const slice = runStrategistProvenanceEvidenceSlice();

    assert.equal(slice.atom, "P03-B09-A06");
    assert.equal(slice.evidenceProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(
      slice.recordValidation.valid,
      true,
      slice.recordValidation.issues.map(i => i.detail).join("\n"),
    );

    for (const category of STRATEGIST_PROVENANCE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistProvenanceContractProbesByCategory(
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
    assert.equal(record.provenance.sliceAtom, "P03-B09-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_STRATEGIST_PROVENANCE_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0");
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
      e => e.probeId === "sprov.recovery_replan_lineage_checkpoint",
    );
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.disposition, "recovery");
  });

  it("records evidence, telemetry and provenance for full provenance run", () => {
    const contract = getActiveStrategistProvenanceContract();
    const record = runStrategistProvenanceProbesWithRecord();
    const validation = validateStrategistProvenanceRunRecord(record, contract);

    assert.equal(record.evidence.length, 28);
    assert.equal(record.telemetry.length, 28);
    assert.equal(record.provenance.totalProbes, 28);
    assert.equal(record.provenance.harnessVersion, "1.0.0");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 28);
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveStrategistProvenanceContract();
    const record = runStrategistProvenanceFailureRecoverySliceWithRecord();
    const validation = validateStrategistProvenanceFailureRecoveryRunRecord(record, contract);

    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.aligned, 7);
  });
});

describe("Forge Strategist Plan Provenance Property/Fuzz — P03-B09-A07", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runStrategistProvenancePropertyChecks(FORGE_STRATEGIST_PROVENANCE_CONTRACT_V1);
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createStrategistProvenanceFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createStrategistProvenanceFuzzRng(1337);
    const rngB = createStrategistProvenanceFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createStrategistProvenanceFuzzRng(1338)()));
  });

  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadStrategistProvenanceBaseline();
    const contract = getActiveStrategistProvenanceContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runStrategistProvenanceFuzzValidation(fixture, contract, seed, 24);
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
    const contract = getActiveStrategistProvenanceContract();
    const record = runStrategistProvenanceFailureRecoverySliceWithRecord();

    assert.equal(
      validateStrategistProvenanceFailureRecoveryRunRecord(record, contract).valid,
      true,
      validateStrategistProvenanceFailureRecoveryRunRecord(record, contract).issues.map(i => i.detail).join("\n"),
    );

    const fuzz = runStrategistProvenanceRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveStrategistProvenanceContract();
    const fixture = loadStrategistProvenanceBaseline();
    const probeIds = listStrategistProvenanceContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistProvenanceProbeEvidence(
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
      return buildStrategistProvenanceProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildStrategistProvenanceProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildStrategistProvenanceRunRecord(provenance, evidence, telemetry);

    assert.equal(validateStrategistProvenanceRunRecord(record, contract).valid, true);

    const fuzz = runStrategistProvenanceRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });

  it("executes property/fuzz slice with zero accepted mutations", () => {
    const slice = runStrategistProvenancePropertyFuzzSlice();

    assert.equal(slice.atom, "P03-B09-A07");
    assert.equal(slice.propertyChecksPassed, true);
    assert.equal(slice.contractFuzzRejected, true);
    assert.equal(slice.runRecordFuzzRejected, true);
    assert.equal(slice.propertyResult.allPassed, true);
    assert.equal(slice.contractFuzz.allMutationsRejected, true);
    assert.equal(slice.contractFuzz.accepted, 0);
    assert.equal(slice.runRecordFuzz.mutationsAccepted, 0);
  });
});

describe("Forge Strategist Provenance Regression — P03-B09-A08", () => {
  it("runStrategistProvenanceForgeRegression passes on canonical provenance matrix", () => {
    const result = runStrategistProvenanceForgeRegression();

    assert.equal(result.atom, "P03-B09-A08");
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 28);
    assert.equal(result.probeRegression, null);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.propertyFuzzSlice.propertyChecksPassed, true);
    assert.equal(result.propertyFuzzSlice.contractFuzzRejected, true);
    assert.equal(result.propertyFuzzSlice.runRecordFuzzRejected, true);
    assert.ok(result.detail.includes("28/28 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
  });

  it("detectStrategistProvenanceProbeRegression flags newly misaligned probes", () => {
    const prior = runStrategistProvenanceProbesWithRecord();
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

    const report = detectStrategistProvenanceProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runStrategistProvenanceProbeRegression alias matches detect helper", () => {
    const prior = runStrategistProvenanceProbesWithRecord();
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

    const detectReport = detectStrategistProvenanceProbeRegression(prior, current);
    const runReport = runStrategistProvenanceProbeRegression(prior, current);
    assert.deepEqual(runReport, detectReport);
  });

  it("validateStrategistProvenanceProbeRegression rejects probe drift", () => {
    const prior = runStrategistProvenanceProbesWithRecord();
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

    const validation = validateStrategistProvenanceProbeRegression(prior, current);
    assert.equal(validation.valid, false);
    assert.equal(validation.report.hasRegression, true);
  });

  it("runStrategistProvenanceForgeRegression compares against prior record without false regression", () => {
    const prior = runStrategistProvenanceProbesWithRecord();
    const result = runStrategistProvenanceForgeRegression(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runStrategistProvenanceForgeRegression rejects tampered prior records", () => {
    const prior = runStrategistProvenanceProbesWithRecord();
    const tamperedPrior = applyStrategistProvenanceRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateStrategistProvenanceRunRecord(tamperedPrior).valid, false);

    const result = runStrategistProvenanceForgeRegression(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runStrategistProvenanceForgeRegression fails when probe alignment regresses", () => {
    const prior = runStrategistProvenanceProbesWithRecord();
    const tamperedCurrent = structuredClone(prior);
    const target = tamperedCurrent.evidence[0]!;
    target.aligned = false;
    target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
    tamperedCurrent.summary = {
      ...tamperedCurrent.summary,
      aligned: tamperedCurrent.summary.aligned - 1,
      mismatches: tamperedCurrent.summary.mismatches + 1,
    };

    const report = detectStrategistProvenanceProbeRegression(prior, tamperedCurrent);
    assert.equal(report.hasRegression, true);
  });

  it("runForgeStrategistProvenanceRegressionGate passes on canonical provenance run", () => {
    const gate = runForgeStrategistProvenanceRegressionGate();

    assert.equal(gate.passed, true, gate.detail);
    assert.equal(gate.atom, "P03-B09-A08");
    assert.equal(gate.record.summary.mismatches, 0);
    assert.equal(gate.record.evidence.length, 28);
  });
});

const SAMPLE_BLOCK_DECOMPOSE = `REASONING: Plan provenance baseline
OUTPUT:
Block 1: Wire plan lineage types
Block 2: Add drift detection seam
Block 3: Seal provenance baseline tests
DEPENDENCIES: 2→1, 3→1,2
REPLAN PLAN: preserve lineage on block failure
PLAN PROVENANCE: vision→blocks lineage preserved for audit
CONFIDENCE: 0.85`;
