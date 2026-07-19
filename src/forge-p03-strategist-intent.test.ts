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
  assessStrategistVisionInputBoundary,
  runStrategistIntentBoundarySlice,
  validateStrategistIntentBoundaryProbeMatrix,
  runStrategistIntentFailureRecoverySlice,
  validateStrategistIntentFailureRecoveryProbeMatrix,
  listStrategistIntentFailureRecoveryProbeIds,
  STRATEGIST_INTENT_FAILURE_RECOVERY_CATEGORIES,
  STRATEGIST_VISION_MAX_LENGTH,
  STRATEGIST_INTENT_CATEGORIES,
  runStrategistIntentEvidenceSlice,
  validateStrategistIntentEvidenceRunRecord,
  validateStrategistIntentRunRecord,
  buildStrategistIntentProbeEvidence,
  buildStrategistIntentProbeTelemetry,
  buildStrategistIntentProvenance,
  buildStrategistIntentRunRecord,
  runStrategistIntentFailureRecoverySliceWithRecord,
  runStrategistIntentProbesWithRecord,
  FORGE_STRATEGIST_INTENT_VERSION,
  runStrategistIntentPropertyChecks,
  runStrategistIntentFuzzValidation,
  runStrategistIntentRunRecordFuzzValidation,
  runStrategistIntentPropertyFuzzSlice,
  createStrategistIntentFuzzRng,
  FORGE_STRATEGIST_INTENT_CONTRACT_V1,
  runStrategistIntentForgeRegression,
  detectStrategistIntentProbeRegression,
  applyStrategistIntentRunRecordFuzzMutation,
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

describe("Forge Strategist Intent Boundary Slice — P03-B01-A04", () => {
  it("assessStrategistVisionInputBoundary handles empty, whitespace-only and oversized inputs", () => {
    const empty = assessStrategistVisionInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistVisionInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessStrategistVisionInputBoundary("vision\x00output");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const longVision = "x".repeat(STRATEGIST_VISION_MAX_LENGTH + 500);
    const truncated = assessStrategistVisionInputBoundary(longVision);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedVision.length, STRATEGIST_VISION_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("defines boundary category with vision input edge-case probes", () => {
    const boundary = listStrategistIntentContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "sint.empty_vision_boundary",
      "sint.known_gaps_documented",
      "sint.long_vision_truncation_boundary",
      "sint.probe_runner_exported",
      "sint.source_phase_gate_ref",
      "sint.whitespace_vision_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveStrategistIntentContract();
    const slice = runStrategistIntentBoundarySlice();

    assert.equal(slice.atom, "P03-B01-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listStrategistIntentContractProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateStrategistIntentBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });
});

describe("Forge Strategist Intent Failure/Recovery Slice — P03-B01-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveStrategistIntentContract();
    const failure = listStrategistIntentContractProbesByCategory("failure_path", contract);
    const recovery = listStrategistIntentContractProbesByCategory("recovery_path", contract);
    const nogo = listStrategistIntentContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...STRATEGIST_INTENT_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveStrategistIntentContract();
    const slice = runStrategistIntentFailureRecoverySlice();

    assert.equal(slice.atom, "P03-B01-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of STRATEGIST_INTENT_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistIntentContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateStrategistIntentFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure, recovery and NO-GO strategist intent paths", () => {
    const slice = runStrategistIntentFailureRecoverySlice();
    const probeIds = listStrategistIntentFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const emptyDecomposeGuard = slice.failureRecoveryResults.find(
      r => r.id === "sint.empty_decompose_guard",
    );
    assert.ok(emptyDecomposeGuard);
    assert.equal(emptyDecomposeGuard!.expected, "PASS");
    assert.equal(emptyDecomposeGuard!.actual, "PASS");

    const recoveryProbe = slice.failureRecoveryResults.find(
      r => r.id === "sint.structured_decompose_recovery",
    );
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");

    const nogoProbe = slice.failureRecoveryResults.find(r => r.id === "sint.over_decompose_nogo");
    assert.ok(nogoProbe);
    assert.equal(nogoProbe!.expected, "PASS");
    assert.equal(nogoProbe!.actual, "PASS");
  });
});

describe("Forge Strategist Intent Evidence — P03-B01-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadStrategistIntentBaseline();
    const contract = getActiveStrategistIntentContract();
    const probeIds = listStrategistIntentFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildStrategistIntentProbeEvidence(
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
      return buildStrategistIntentProbeTelemetry(probeId, contractProbe.category, index, index * 0.5);
    });

    const provenance = buildStrategistIntentProvenance(
      "run-sint-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P03-B01-A06",
        sliceCategories: STRATEGIST_INTENT_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildStrategistIntentRunRecord(provenance, evidence, telemetry);
    const validation = validateStrategistIntentEvidenceRunRecord(record, contract);

    assert.equal(record.summary.total, 6);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourcePhaseGateAtom, fixture.sourcePhaseGate.atom);
  });

  it("executes evidence slice with zero unexpected mismatches and valid run record", () => {
    const contract = getActiveStrategistIntentContract();
    const slice = runStrategistIntentEvidenceSlice();

    assert.equal(slice.atom, "P03-B01-A06");
    assert.equal(slice.evidenceProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.recordValidation.valid, true, slice.recordValidation.issues.map(i => i.detail).join("\n"));

    for (const category of STRATEGIST_INTENT_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistIntentContractProbesByCategory(category, contract)) {
        const result = slice.evidenceResults.find(r => r.id === probe.id);
        assert.ok(result, `missing evidence result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const record = slice.record;
    assert.equal(record.evidence.length, 6);
    assert.equal(record.telemetry.length, 6);
    assert.equal(record.provenance.totalProbes, 6);
    assert.equal(record.provenance.sliceAtom, "P03-B01-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_STRATEGIST_INTENT_VERSION);
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

    const recoveryProbe = record.evidence.find(e => e.probeId === "sint.structured_decompose_recovery");
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.disposition, "recovery");
  });

  it("records evidence, telemetry and provenance for full strategist intent run", () => {
    const contract = getActiveStrategistIntentContract();
    const record = runStrategistIntentProbesWithRecord();
    const validation = validateStrategistIntentRunRecord(record, contract);

    assert.equal(record.evidence.length, 23);
    assert.equal(record.telemetry.length, 23);
    assert.equal(record.provenance.totalProbes, 23);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a08");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 23);
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveStrategistIntentContract();
    const record = runStrategistIntentFailureRecoverySliceWithRecord();
    const validation = validateStrategistIntentEvidenceRunRecord(record, contract);

    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.aligned, 6);
  });
});

describe("Forge Strategist Intent Property/Fuzz — P03-B01-A07", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runStrategistIntentPropertyChecks(FORGE_STRATEGIST_INTENT_CONTRACT_V1);
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createStrategistIntentFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createStrategistIntentFuzzRng(1337);
    const rngB = createStrategistIntentFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createStrategistIntentFuzzRng(1338)()));
  });

  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadStrategistIntentBaseline();
    const contract = getActiveStrategistIntentContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runStrategistIntentFuzzValidation(fixture, contract, seed, 24);
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
    const contract = getActiveStrategistIntentContract();
    const record = runStrategistIntentFailureRecoverySliceWithRecord();

    assert.equal(
      validateStrategistIntentEvidenceRunRecord(record, contract).valid,
      true,
      validateStrategistIntentEvidenceRunRecord(record, contract).issues.map(i => i.detail).join("\n"),
    );

    const fuzz = runStrategistIntentRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveStrategistIntentContract();
    const fixture = loadStrategistIntentBaseline();
    const probeIds = listStrategistIntentContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistIntentProbeEvidence(
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
      return buildStrategistIntentProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildStrategistIntentProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildStrategistIntentRunRecord(provenance, evidence, telemetry);

    assert.equal(validateStrategistIntentRunRecord(record, contract).valid, true);

    const fuzz = runStrategistIntentRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });

  it("executes property/fuzz slice with zero accepted mutations", () => {
    const slice = runStrategistIntentPropertyFuzzSlice();

    assert.equal(slice.atom, "P03-B01-A07");
    assert.equal(slice.propertyChecksPassed, true);
    assert.equal(slice.contractFuzzRejected, true);
    assert.equal(slice.runRecordFuzzRejected, true);
    assert.equal(slice.propertyResult.allPassed, true);
    assert.equal(slice.contractFuzz.allMutationsRejected, true);
    assert.equal(slice.contractFuzz.accepted, 0);
    assert.equal(slice.runRecordFuzz.mutationsAccepted, 0);
  });
});

describe("Forge Strategist Intent Regression — P03-B01-A08", () => {
  it("runStrategistIntentForgeRegression passes on canonical strategist intent matrix", () => {
    const result = runStrategistIntentForgeRegression();

    assert.equal(result.atom, "P03-B01-A08");
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 23);
    assert.equal(result.probeRegression, null);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.propertyFuzzSlice.propertyChecksPassed, true);
    assert.equal(result.propertyFuzzSlice.contractFuzzRejected, true);
    assert.equal(result.propertyFuzzSlice.runRecordFuzzRejected, true);
    assert.ok(result.detail.includes("23/23 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
  });

  it("detectStrategistIntentProbeRegression flags newly misaligned probes", () => {
    const prior = runStrategistIntentProbesWithRecord();
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

    const report = detectStrategistIntentProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runStrategistIntentForgeRegression compares against prior record without false regression", () => {
    const prior = runStrategistIntentProbesWithRecord();
    const result = runStrategistIntentForgeRegression(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runStrategistIntentForgeRegression rejects tampered prior records", () => {
    const prior = runStrategistIntentProbesWithRecord();
    const tamperedPrior = applyStrategistIntentRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateStrategistIntentRunRecord(tamperedPrior).valid, false);

    const result = runStrategistIntentForgeRegression(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runStrategistIntentForgeRegression fails when probe alignment regresses", () => {
    const prior = runStrategistIntentProbesWithRecord();
    const tamperedCurrent = structuredClone(prior);
    const target = tamperedCurrent.evidence[0]!;
    target.aligned = false;
    target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
    tamperedCurrent.summary = {
      ...tamperedCurrent.summary,
      aligned: tamperedCurrent.summary.aligned - 1,
      mismatches: tamperedCurrent.summary.mismatches + 1,
    };

    const report = detectStrategistIntentProbeRegression(prior, tamperedCurrent);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target.probeId]);
  });
});
