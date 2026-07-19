import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistParallelWaveBaseline,
  runStrategistParallelWaveProbes,
  runStrategistParallelWaveProductionSlice,
  runStrategistParallelWaveBoundarySlice,
  runStrategistParallelWaveFailureRecoverySlice,
  runStrategistParallelWaveFailureRecoverySliceWithRecord,
  runStrategistParallelWaveProbesWithRecord,
  runStrategistParallelWaveEvidenceSlice,
  runStrategistParallelWavePropertyChecks,
  runStrategistParallelWaveFuzzValidation,
  runStrategistParallelWaveRunRecordFuzzValidation,
  runStrategistParallelWavePropertyFuzzSlice,
  runStrategistParallelWaveForgeRegression,
  detectStrategistParallelWaveProbeRegression,
  runStrategistParallelWaveProbeRegression,
  validateStrategistParallelWaveProbeRegression,
  applyStrategistParallelWaveRunRecordFuzzMutation,
  createStrategistParallelWaveFuzzRng,
  buildStrategistParallelWaveProbeEvidence,
  buildStrategistParallelWaveProbeTelemetry,
  buildStrategistParallelWaveProvenance,
  buildStrategistParallelWaveRunRecord,
  validateStrategistParallelWaveFailureRecoveryRunRecord,
  validateStrategistParallelWaveRunRecord,
  getActiveStrategistParallelWaveContract,
  validateStrategistParallelWaveBaseline,
  validateStrategistParallelWaveProbeMatrix,
  validateStrategistParallelWaveBoundaryProbeMatrix,
  validateStrategistParallelWaveFailureRecoveryProbeMatrix,
  summarizeStrategistParallelWaveMatrix,
  listStrategistParallelWaveProbesByExpected,
  listStrategistParallelWaveKnownGaps,
  listStrategistParallelWaveContractProbesByCategory,
  listStrategistParallelWaveFailureRecoveryProbeIds,
  listStrategistParallelWaveContractProbeIds,
  assessStrategistParallelWaveInputBoundary,
  STRATEGIST_PARALLEL_WAVE_CATEGORIES,
  STRATEGIST_PARALLEL_WAVE_FAILURE_RECOVERY_CATEGORIES,
  STRATEGIST_PARALLEL_WAVE_DECOMPOSE_MAX_LENGTH,
  FORGE_STRATEGIST_PARALLEL_WAVE_VERSION,
  FORGE_STRATEGIST_PARALLEL_WAVE_CONTRACT_V1,
} from "./forge-p03-strategist-parallel-wave.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Parallel Wave — P03-B07-A01", () => {
  it("loads versioned parallel wave baseline aligned with P03-B06 block gate handoff", () => {
    const fixture = loadStrategistParallelWaveBaseline();
    const validation = validateStrategistParallelWaveBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P03-B07-A01");
    assert.equal(fixture.contractAtom, "P03-B07-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P03-B06-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.resourceBudgetProbeCount, 27);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 27);
  });

  it("measures parallel wave probes with documented FAIL gaps from B06 sealed handoff", () => {
    const results = runStrategistParallelWaveProbes();
    const summary = summarizeStrategistParallelWaveMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 27);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listStrategistParallelWaveProbesByExpected(
      "FAIL",
      loadStrategistParallelWaveBaseline(),
    );
    assert.equal(documentedFail.length, 6);
    assert.ok(documentedFail.some(p => p.id === "swave.prompt_parallel_wave_plan"));
    assert.ok(documentedFail.some(p => p.id === "swave.orchestrator_pre_exec_wave_gate"));
    assert.ok(documentedFail.some(p => p.id === "swave.exported_wave_validator"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of STRATEGIST_PARALLEL_WAVE_CATEGORIES) {
      assert.ok(summary.byCategory[cat], `missing category summary: ${cat}`);
      assert.ok(summary.byCategory[cat].total > 0, `${cat} has no probes`);
    }

    const passMismatches = results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(
      passMismatches.length,
      0,
      formatMismatchReport(passMismatches),
    );
  });

  it("documents parallel wave gaps as measurable baseline debt", () => {
    const gaps = listStrategistParallelWaveKnownGaps(runStrategistParallelWaveProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "swave.exported_wave_validator",
      "swave.nogo_invalid_wave_plan",
      "swave.orchestrator_atom_waves",
      "swave.orchestrator_pre_exec_wave_gate",
      "swave.parser_wave_plan_fields",
      "swave.prompt_parallel_wave_plan",
    ]);
    assert.ok(
      gaps.every(g => STRATEGIST_PARALLEL_WAVE_CATEGORIES.includes(g.category)),
      "documented gaps are parallel wave probes",
    );
  });
});

describe("Forge Strategist Parallel Wave Production Slice — P03-B07-A03", () => {
  it("executes contract-wired probes with zero unexpected mismatches preserving FAIL gaps", () => {
    const contract = getActiveStrategistParallelWaveContract();
    const slice = runStrategistParallelWaveProductionSlice();

    assert.equal(slice.atom, "P03-B07-A03");
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

    const matrixValidation = validateStrategistParallelWaveProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const gapIds = slice.summary.knownGaps.map(g => g.id).sort();
    assert.deepEqual(gapIds, [
      "swave.exported_wave_validator",
      "swave.nogo_invalid_wave_plan",
      "swave.orchestrator_atom_waves",
      "swave.orchestrator_pre_exec_wave_gate",
      "swave.parser_wave_plan_fields",
      "swave.prompt_parallel_wave_plan",
    ]);
  });
});

describe("Forge Strategist Parallel Wave Boundary Slice — P03-B07-A04", () => {
  it("assessStrategistParallelWaveInputBoundary handles decompose edge cases including truncation", () => {
    const empty = assessStrategistParallelWaveInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistParallelWaveInputBoundary("   \t\n  ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessStrategistParallelWaveInputBoundary("bad\0decompose");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const valid = assessStrategistParallelWaveInputBoundary(
      "REASONING: valid\nOUTPUT:\nBlock 1: task\nDEPENDENCIES: none\nRESOURCE PLAN: lightweight\nTOKEN BUDGET: perThought=4096\nCONFIDENCE: 0.8",
    );
    assert.equal(valid.disposition, "valid");
    assert.equal(valid.acceptable, true);

    const longDecompose = "x".repeat(STRATEGIST_PARALLEL_WAVE_DECOMPOSE_MAX_LENGTH + 500);
    const truncated = assessStrategistParallelWaveInputBoundary(longDecompose);
    assert.equal(truncated.disposition, "exceeds_max_length");
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedDecompose.length, STRATEGIST_PARALLEL_WAVE_DECOMPOSE_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("defines boundary category with decompose input edge-case probes", () => {
    const boundary = listStrategistParallelWaveContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "swave.empty_decompose_boundary",
      "swave.known_gaps_documented",
      "swave.long_decompose_truncation_boundary",
      "swave.probe_runner_exported",
      "swave.source_block_gate_ref",
      "swave.whitespace_decompose_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveStrategistParallelWaveContract();
    const slice = runStrategistParallelWaveBoundarySlice();

    assert.equal(slice.atom, "P03-B07-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listStrategistParallelWaveContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateStrategistParallelWaveBoundaryProbeMatrix(
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

describe("Forge Strategist Parallel Wave Failure/Recovery Slice — P03-B07-A05", () => {
  it("defines seven failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveStrategistParallelWaveContract();
    const probeIds = listStrategistParallelWaveFailureRecoveryProbeIds(contract);

    assert.equal(STRATEGIST_PARALLEL_WAVE_FAILURE_RECOVERY_CATEGORIES.length, 3);
    assert.equal(probeIds.length, 7);
    assert.deepEqual(probeIds.sort(), [
      "swave.exported_wave_validator",
      "swave.invalid_version_rejected",
      "swave.malformed_decompose_guard",
      "swave.min_category_probes",
      "swave.nogo_invalid_wave_plan",
      "swave.recovery_sequential_fallback",
      "swave.recovery_wave_checkpoint",
    ].sort());

    assert.equal(
      listStrategistParallelWaveContractProbesByCategory("failure_path", contract).length,
      3,
    );
    assert.equal(
      listStrategistParallelWaveContractProbesByCategory("recovery_path", contract).length,
      2,
    );
    assert.equal(
      listStrategistParallelWaveContractProbesByCategory("nogo_path", contract).length,
      2,
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveStrategistParallelWaveContract();
    const slice = runStrategistParallelWaveFailureRecoverySlice();

    assert.equal(slice.atom, "P03-B07-A05");
    assert.equal(slice.failureRecoveryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 5);
    assert.equal(slice.matrixValidation.gapAligned, 2);

    for (const category of STRATEGIST_PARALLEL_WAVE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistParallelWaveContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateStrategistParallelWaveFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves NO-GO gaps while exercising failure and recovery paths", () => {
    const slice = runStrategistParallelWaveFailureRecoverySlice();
    const probeIds = listStrategistParallelWaveFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 7);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "swave.malformed_decompose_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const sequentialFallback = slice.failureRecoveryResults.find(
      r => r.id === "swave.recovery_sequential_fallback",
    );
    assert.ok(sequentialFallback);
    assert.equal(sequentialFallback!.expected, "PASS");
    assert.equal(sequentialFallback!.actual, "PASS");

    const waveCheckpoint = slice.failureRecoveryResults.find(
      r => r.id === "swave.recovery_wave_checkpoint",
    );
    assert.ok(waveCheckpoint);
    assert.equal(waveCheckpoint!.expected, "PASS");
    assert.equal(waveCheckpoint!.actual, "PASS");

    const nogoInvalidPlan = slice.failureRecoveryResults.find(
      r => r.id === "swave.nogo_invalid_wave_plan",
    );
    assert.ok(nogoInvalidPlan);
    assert.equal(nogoInvalidPlan!.expected, "FAIL");
    assert.equal(nogoInvalidPlan!.actual, "FAIL");

    const exportedValidator = slice.failureRecoveryResults.find(
      r => r.id === "swave.exported_wave_validator",
    );
    assert.ok(exportedValidator);
    assert.equal(exportedValidator!.expected, "FAIL");
    assert.equal(exportedValidator!.actual, "FAIL");
  });
});

describe("Forge Strategist Parallel Wave Evidence — P03-B07-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadStrategistParallelWaveBaseline();
    const contract = getActiveStrategistParallelWaveContract();
    const probeIds = listStrategistParallelWaveFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildStrategistParallelWaveProbeEvidence(
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
      return buildStrategistParallelWaveProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildStrategistParallelWaveProvenance(
      "run-swave-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P03-B07-A06",
        sliceCategories: STRATEGIST_PARALLEL_WAVE_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildStrategistParallelWaveRunRecord(provenance, evidence, telemetry);
    const validation = validateStrategistParallelWaveFailureRecoveryRunRecord(record, contract);

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
    const contract = getActiveStrategistParallelWaveContract();
    const slice = runStrategistParallelWaveEvidenceSlice();

    assert.equal(slice.atom, "P03-B07-A06");
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

    for (const category of STRATEGIST_PARALLEL_WAVE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistParallelWaveContractProbesByCategory(
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
    assert.equal(record.provenance.sliceAtom, "P03-B07-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_STRATEGIST_PARALLEL_WAVE_VERSION);
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
      e => e.probeId === "swave.recovery_sequential_fallback",
    );
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.disposition, "recovery");
  });

  it("records evidence, telemetry and provenance for full parallel wave run", () => {
    const contract = getActiveStrategistParallelWaveContract();
    const record = runStrategistParallelWaveProbesWithRecord();
    const validation = validateStrategistParallelWaveRunRecord(record, contract);

    assert.equal(record.evidence.length, 27);
    assert.equal(record.telemetry.length, 27);
    assert.equal(record.provenance.totalProbes, 27);
    assert.equal(record.provenance.harnessVersion, "1.0.0");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 27);
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveStrategistParallelWaveContract();
    const record = runStrategistParallelWaveFailureRecoverySliceWithRecord();
    const validation = validateStrategistParallelWaveFailureRecoveryRunRecord(record, contract);

    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.aligned, 7);
  });
});

describe("Forge Strategist Parallel Wave Property/Fuzz — P03-B07-A07", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runStrategistParallelWavePropertyChecks(FORGE_STRATEGIST_PARALLEL_WAVE_CONTRACT_V1);
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createStrategistParallelWaveFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createStrategistParallelWaveFuzzRng(1337);
    const rngB = createStrategistParallelWaveFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createStrategistParallelWaveFuzzRng(1338)()));
  });

  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadStrategistParallelWaveBaseline();
    const contract = getActiveStrategistParallelWaveContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runStrategistParallelWaveFuzzValidation(fixture, contract, seed, 24);
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
    const contract = getActiveStrategistParallelWaveContract();
    const record = runStrategistParallelWaveFailureRecoverySliceWithRecord();

    assert.equal(
      validateStrategistParallelWaveFailureRecoveryRunRecord(record, contract).valid,
      true,
      validateStrategistParallelWaveFailureRecoveryRunRecord(record, contract).issues.map(i => i.detail).join("\n"),
    );

    const fuzz = runStrategistParallelWaveRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveStrategistParallelWaveContract();
    const fixture = loadStrategistParallelWaveBaseline();
    const probeIds = listStrategistParallelWaveContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistParallelWaveProbeEvidence(
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
      return buildStrategistParallelWaveProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildStrategistParallelWaveProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildStrategistParallelWaveRunRecord(provenance, evidence, telemetry);

    assert.equal(validateStrategistParallelWaveRunRecord(record, contract).valid, true);

    const fuzz = runStrategistParallelWaveRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });

  it("executes property/fuzz slice with zero accepted mutations", () => {
    const slice = runStrategistParallelWavePropertyFuzzSlice();

    assert.equal(slice.atom, "P03-B07-A07");
    assert.equal(slice.propertyChecksPassed, true);
    assert.equal(slice.contractFuzzRejected, true);
    assert.equal(slice.runRecordFuzzRejected, true);
    assert.equal(slice.propertyResult.allPassed, true);
    assert.equal(slice.contractFuzz.allMutationsRejected, true);
    assert.equal(slice.contractFuzz.accepted, 0);
    assert.equal(slice.runRecordFuzz.mutationsAccepted, 0);
  });
});

describe("Forge Strategist Parallel Wave Regression — P03-B07-A08", () => {
  it("runStrategistParallelWaveForgeRegression passes on canonical parallel wave matrix", () => {
    const result = runStrategistParallelWaveForgeRegression();

    assert.equal(result.atom, "P03-B07-A08");
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

  it("detectStrategistParallelWaveProbeRegression flags newly misaligned probes", () => {
    const prior = runStrategistParallelWaveProbesWithRecord();
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

    const report = detectStrategistParallelWaveProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runStrategistParallelWaveProbeRegression alias matches detect helper", () => {
    const prior = runStrategistParallelWaveProbesWithRecord();
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

    const detectReport = detectStrategistParallelWaveProbeRegression(prior, current);
    const runReport = runStrategistParallelWaveProbeRegression(prior, current);
    assert.deepEqual(runReport, detectReport);
  });

  it("validateStrategistParallelWaveProbeRegression rejects probe drift", () => {
    const prior = runStrategistParallelWaveProbesWithRecord();
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

    const validation = validateStrategistParallelWaveProbeRegression(prior, current);
    assert.equal(validation.valid, false);
    assert.equal(validation.report.hasRegression, true);
  });

  it("runStrategistParallelWaveForgeRegression compares against prior record without false regression", () => {
    const prior = runStrategistParallelWaveProbesWithRecord();
    const result = runStrategistParallelWaveForgeRegression(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runStrategistParallelWaveForgeRegression rejects tampered prior records", () => {
    const prior = runStrategistParallelWaveProbesWithRecord();
    const tamperedPrior = applyStrategistParallelWaveRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateStrategistParallelWaveRunRecord(tamperedPrior).valid, false);

    const result = runStrategistParallelWaveForgeRegression(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runStrategistParallelWaveForgeRegression fails when probe alignment regresses", () => {
    const prior = runStrategistParallelWaveProbesWithRecord();
    const tamperedCurrent = structuredClone(prior);
    const target = tamperedCurrent.evidence[0]!;
    target.aligned = false;
    target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
    tamperedCurrent.summary = {
      ...tamperedCurrent.summary,
      aligned: tamperedCurrent.summary.aligned - 1,
      mismatches: tamperedCurrent.summary.mismatches + 1,
    };

    const report = detectStrategistParallelWaveProbeRegression(prior, tamperedCurrent);
    assert.equal(report.hasRegression, true);
  });
});
