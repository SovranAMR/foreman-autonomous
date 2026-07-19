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
  recoverStrategistBlockProduction,
  runStrategistBlockContractProductionSlice,
  runStrategistBlockContractBoundarySlice,
  runStrategistBlockContractFailureRecoverySlice,
  runStrategistBlockContractFailureRecoverySliceWithRecord,
  runStrategistBlockContractEvidenceSlice,
  runStrategistBlockContractProbesWithRecord,
  buildStrategistBlockContractProbeEvidence,
  buildStrategistBlockContractProbeTelemetry,
  buildStrategistBlockContractProvenance,
  buildStrategistBlockContractRunRecord,
  validateStrategistBlockContractFailureRecoveryRunRecord,
  validateStrategistBlockContractRunRecord,
  validateStrategistBlockContractProbeMatrix,
  validateStrategistBlockContractBoundaryProbeMatrix,
  validateStrategistBlockContractFailureRecoveryProbeMatrix,
  listStrategistBlockContractContractProbesByCategory,
  listStrategistBlockContractFailureRecoveryProbeIds,
  STRATEGIST_BLOCK_CONTRACT_FAILURE_RECOVERY_CATEGORIES,
  assessStrategistBlockInputBoundary,
  STRATEGIST_BLOCK_DECOMPOSE_MAX_LENGTH,
  STRATEGIST_BLOCK_CONTRACT_CATEGORIES,
  FORGE_STRATEGIST_BLOCK_CONTRACT_V1,
  FORGE_STRATEGIST_BLOCK_CONTRACT_VERSION,
  runStrategistBlockContractPropertyChecks,
  createStrategistBlockContractFuzzRng,
  runStrategistBlockContractFuzzValidation,
  runStrategistBlockContractRunRecordFuzzValidation,
  runStrategistBlockContractPropertyFuzzSlice,
  runStrategistBlockContractForgeRegression,
  detectStrategistBlockContractProbeRegression,
  applyStrategistBlockContractRunRecordFuzzMutation,
  getForgeStrategistBlockContractGuardControls,
  buildStrategistBlockContractAdversarialGuardScenarios,
  runStrategistBlockContractAdversarialGuardChecks,
  validateForgeStrategistBlockContractGuard,
  detectStrategistBlockContractFalseAlignment,
  detectStrategistBlockContractEvidenceSummaryMismatch,
  validateStrategistBlockContractPerformance,
  validateStrategistBlockContractCost,
  validateStrategistBlockContractSafety,
} from "./forge-p03-strategist-block-contract.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Block Contract — P03-B02-A02", () => {
  it("defines typed acceptance for all eight block production contract categories", () => {
    const contract = getActiveStrategistBlockContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B02-A06");

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

  it("maps 23 probes with zero documented FAIL gaps after A03 recovery slice", () => {
    const contract = getActiveStrategistBlockContract();
    const summary = summarizeStrategistBlockContractCoverage(contract);
    const coverage = validateStrategistBlockContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
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

  it("lists zero gap probes after structured block recovery slice", () => {
    const gaps = listStrategistBlockContractProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
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

describe("Forge Strategist Block Contract Production Slice — P03-B02-A03", () => {
  it("recoverStrategistBlockProduction restructures malformed block parse into contract-compliant plan", () => {
    const malformed = `REASONING: Need block production plan
Here are the steps:
Block 1: Setup block contract types
Block 2: Wire block production seam
Block 3: Add block contract baseline tests
CONFIDENCE: 0.8`;
    const recovery = recoverStrategistBlockProduction(malformed);

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.contractCompliant, true);
    assert.ok(recovery.blockCount >= 3);
    assert.match(recovery.composedDecompose, /REASONING:/);
    assert.match(recovery.composedDecompose, /OUTPUT:/);
    assert.ok(recovery.blocks.some(block => block.includes("block contract types")));
    assert.ok(recovery.blocks.some(block => block.includes("block production seam")));
    assert.ok(recovery.blocks.some(block => block.includes("block contract baseline")));
  });

  it("recoverStrategistBlockProduction rejects null-byte decompose output safely", () => {
    const recovery = recoverStrategistBlockProduction("decompose\0output");
    assert.equal(recovery.recovered, false);
    assert.equal(recovery.contractCompliant, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_decompose"]);
  });

  it("executes contract-wired probes with zero unexpected mismatches after recovery slice", () => {
    const contract = getActiveStrategistBlockContract();
    const slice = runStrategistBlockContractProductionSlice();

    assert.equal(slice.atom, "P03-B02-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 23);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateStrategistBlockContractProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const recoveryProbe = slice.results.find(r => r.id === "sblk.structured_block_recovery");
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
  });
});

describe("Forge Strategist Block Contract Boundary Slice — P03-B02-A04", () => {
  it("assessStrategistBlockInputBoundary handles decompose edge cases", () => {
    const empty = assessStrategistBlockInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistBlockInputBoundary("   \t\n  ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessStrategistBlockInputBoundary("bad\0decompose");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const valid = assessStrategistBlockInputBoundary("Block 1: valid decompose output");
    assert.equal(valid.disposition, "valid");
    assert.equal(valid.acceptable, true);

    const longInput = "x".repeat(STRATEGIST_BLOCK_DECOMPOSE_MAX_LENGTH + 500);
    const truncated = assessStrategistBlockInputBoundary(longInput);
    assert.equal(truncated.disposition, "exceeds_max_length");
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedDecompose.length, STRATEGIST_BLOCK_DECOMPOSE_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("defines boundary category with decompose input edge-case probes", () => {
    const boundary = listStrategistBlockContractContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "sblk.block_cap_boundary",
      "sblk.empty_decompose_boundary",
      "sblk.known_gaps_documented",
      "sblk.probe_runner_exported",
      "sblk.source_block_gate_ref",
      "sblk.whitespace_decompose_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveStrategistBlockContract();
    const slice = runStrategistBlockContractBoundarySlice();

    assert.equal(slice.atom, "P03-B02-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listStrategistBlockContractContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateStrategistBlockContractBoundaryProbeMatrix(
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

describe("Forge Strategist Block Contract Failure/Recovery Slice — P03-B02-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveStrategistBlockContract();
    const failure = listStrategistBlockContractContractProbesByCategory("failure_path", contract);
    const recovery = listStrategistBlockContractContractProbesByCategory("recovery_path", contract);
    const nogo = listStrategistBlockContractContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...STRATEGIST_BLOCK_CONTRACT_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveStrategistBlockContract();
    const slice = runStrategistBlockContractFailureRecoverySlice();

    assert.equal(slice.atom, "P03-B02-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of STRATEGIST_BLOCK_CONTRACT_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistBlockContractContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateStrategistBlockContractFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure, recovery and NO-GO block production paths", () => {
    const slice = runStrategistBlockContractFailureRecoverySlice();
    const probeIds = listStrategistBlockContractFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "sblk.malformed_decompose_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const recoveryProbe = slice.failureRecoveryResults.find(
      r => r.id === "sblk.structured_block_recovery",
    );
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");

    const emptyBlocksNogo = slice.failureRecoveryResults.find(
      r => r.id === "sblk.strategist_empty_blocks_block",
    );
    assert.ok(emptyBlocksNogo);
    assert.equal(emptyBlocksNogo!.expected, "PASS");
    assert.equal(emptyBlocksNogo!.actual, "PASS");
  });
});

describe("Forge Strategist Block Contract Evidence — P03-B02-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadStrategistBlockContractBaseline();
    const contract = getActiveStrategistBlockContract();
    const probeIds = listStrategistBlockContractFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildStrategistBlockContractProbeEvidence(
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
      return buildStrategistBlockContractProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildStrategistBlockContractProvenance(
      "run-sblk-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P03-B02-A06",
        sliceCategories: STRATEGIST_BLOCK_CONTRACT_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildStrategistBlockContractRunRecord(provenance, evidence, telemetry);
    const validation = validateStrategistBlockContractFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 6);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBlockGateAtom, fixture.sourceBlockGate.atom);
  });

  it("executes evidence slice with zero unexpected mismatches and valid run record", () => {
    const contract = getActiveStrategistBlockContract();
    const slice = runStrategistBlockContractEvidenceSlice();

    assert.equal(slice.atom, "P03-B02-A06");
    assert.equal(slice.evidenceProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(
      slice.recordValidation.valid,
      true,
      slice.recordValidation.issues.map(i => i.detail).join("\n"),
    );

    for (const category of STRATEGIST_BLOCK_CONTRACT_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistBlockContractContractProbesByCategory(category, contract)) {
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
    assert.equal(record.provenance.sliceAtom, "P03-B02-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_STRATEGIST_BLOCK_CONTRACT_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a10");
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

    const recoveryProbe = record.evidence.find(e => e.probeId === "sblk.structured_block_recovery");
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.disposition, "recovery");
  });

  it("records evidence, telemetry and provenance for full block contract run", () => {
    const contract = getActiveStrategistBlockContract();
    const record = runStrategistBlockContractProbesWithRecord();
    const validation = validateStrategistBlockContractRunRecord(record, contract);

    assert.equal(record.evidence.length, 23);
    assert.equal(record.telemetry.length, 23);
    assert.equal(record.provenance.totalProbes, 23);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a10");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 23);
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveStrategistBlockContract();
    const record = runStrategistBlockContractFailureRecoverySliceWithRecord();
    const validation = validateStrategistBlockContractFailureRecoveryRunRecord(record, contract);

    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.aligned, 6);
  });
});

describe("Forge Strategist Block Contract Property/Fuzz — P03-B02-A07", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runStrategistBlockContractPropertyChecks(FORGE_STRATEGIST_BLOCK_CONTRACT_V1);
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createStrategistBlockContractFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createStrategistBlockContractFuzzRng(1337);
    const rngB = createStrategistBlockContractFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(
      seqA,
      Array.from({ length: 5 }, () => createStrategistBlockContractFuzzRng(1338)()),
    );
  });

  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadStrategistBlockContractBaseline();
    const contract = getActiveStrategistBlockContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runStrategistBlockContractFuzzValidation(fixture, contract, seed, 24);
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
    const contract = getActiveStrategistBlockContract();
    const record = runStrategistBlockContractFailureRecoverySliceWithRecord();

    assert.equal(
      validateStrategistBlockContractFailureRecoveryRunRecord(record, contract).valid,
      true,
      validateStrategistBlockContractFailureRecoveryRunRecord(record, contract)
        .issues.map(i => i.detail)
        .join("\n"),
    );

    const fuzz = runStrategistBlockContractRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveStrategistBlockContract();
    const fixture = loadStrategistBlockContractBaseline();
    const probeIds = listStrategistBlockContractContractProbeIds(contract);
    const startedAt = "2026-07-19T06:40:00.000Z";
    const completedAt = "2026-07-19T06:40:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistBlockContractProbeEvidence(
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
      return buildStrategistBlockContractProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildStrategistBlockContractProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildStrategistBlockContractRunRecord(provenance, evidence, telemetry);

    assert.equal(validateStrategistBlockContractRunRecord(record, contract).valid, true);

    const fuzz = runStrategistBlockContractRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });

  it("executes property/fuzz slice with zero accepted mutations", () => {
    const slice = runStrategistBlockContractPropertyFuzzSlice();

    assert.equal(slice.atom, "P03-B02-A07");
    assert.equal(slice.propertyChecksPassed, true);
    assert.equal(slice.contractFuzzRejected, true);
    assert.equal(slice.runRecordFuzzRejected, true);
    assert.equal(slice.propertyResult.allPassed, true);
    assert.equal(slice.contractFuzz.allMutationsRejected, true);
    assert.equal(slice.contractFuzz.accepted, 0);
    assert.equal(slice.runRecordFuzz.mutationsAccepted, 0);
  });
});

describe("Forge Strategist Block Contract Regression — P03-B02-A08", () => {
  it("runStrategistBlockContractForgeRegression passes on canonical block contract matrix", () => {
    const result = runStrategistBlockContractForgeRegression();

    assert.equal(result.atom, "P03-B02-A08");
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

  it("detectStrategistBlockContractProbeRegression flags newly misaligned probes", () => {
    const prior = runStrategistBlockContractProbesWithRecord();
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

    const report = detectStrategistBlockContractProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runStrategistBlockContractForgeRegression compares against prior record without false regression", () => {
    const prior = runStrategistBlockContractProbesWithRecord();
    const result = runStrategistBlockContractForgeRegression(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runStrategistBlockContractForgeRegression rejects tampered prior records", () => {
    const prior = runStrategistBlockContractProbesWithRecord();
    const tamperedPrior = applyStrategistBlockContractRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateStrategistBlockContractRunRecord(tamperedPrior).valid, false);

    const result = runStrategistBlockContractForgeRegression(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runStrategistBlockContractForgeRegression fails when probe alignment regresses", () => {
    const prior = runStrategistBlockContractProbesWithRecord();
    const tamperedCurrent = structuredClone(prior);
    const target = tamperedCurrent.evidence[0]!;
    target.aligned = false;
    target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
    tamperedCurrent.summary = {
      ...tamperedCurrent.summary,
      aligned: tamperedCurrent.summary.aligned - 1,
      mismatches: tamperedCurrent.summary.mismatches + 1,
    };

    const report = detectStrategistBlockContractProbeRegression(prior, tamperedCurrent);
    assert.equal(report.hasRegression, true);
  });
});

describe("Forge Strategist Block Contract Guard — P03-B02-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runStrategistBlockContractProbesWithRecord();
    const contract = getActiveStrategistBlockContract();
    const adversarial = runStrategistBlockContractAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildStrategistBlockContractProbeEvidence(
      "sblk.version_tagged",
      "block_versioning",
      "PASS",
      "FAIL",
      true,
      "test",
      "false pass claim",
      "observed",
      "2026-07-19T06:00:00.000Z",
    );
    const fixture = loadStrategistBlockContractBaseline();
    const contract = getActiveStrategistBlockContract();
    const falsePassRecord = buildStrategistBlockContractRunRecord(
      buildStrategistBlockContractProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T06:00:00.000Z",
        "2026-07-19T06:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildStrategistBlockContractProbeTelemetry("sblk.version_tagged", "block_versioning", 0, 1)],
    );
    assert.ok(detectStrategistBlockContractFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildStrategistBlockContractProbeEvidence(
      "sblk.version_tagged",
      "block_versioning",
      "PASS",
      "FAIL",
      false,
      "test",
      "summary tamper",
      "observed",
      "2026-07-19T06:00:00.000Z",
    );
    const summaryRecord = buildStrategistBlockContractRunRecord(
      buildStrategistBlockContractProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T06:00:00.000Z",
        "2026-07-19T06:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildStrategistBlockContractProbeTelemetry("sblk.version_tagged", "block_versioning", 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectStrategistBlockContractEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildStrategistBlockContractAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildStrategistBlockContractAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Strategist Block Contract Guard — P03-B02-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical block contract run", () => {
    const record = runStrategistBlockContractProbesWithRecord();
    const contract = getActiveStrategistBlockContract();
    const guard = validateForgeStrategistBlockContractGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeStrategistBlockContractGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadStrategistBlockContractBaseline();
    const contract = getActiveStrategistBlockContract();
    const probeIds = listStrategistBlockContractContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistBlockContractProbeEvidence(
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
      return buildStrategistBlockContractProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildStrategistBlockContractRunRecord(
      buildStrategistBlockContractProvenance(
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

    const perfIssues = validateStrategistBlockContractPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateStrategistBlockContractCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadStrategistBlockContractBaseline();
    const contract = getActiveStrategistBlockContract();
    const evidence = buildStrategistBlockContractProbeEvidence(
      "sblk.version_tagged",
      "block_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildStrategistBlockContractRunRecord(
      buildStrategistBlockContractProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T06:00:00.000Z",
        "2026-07-19T06:00:01.000Z",
        1,
      ),
      [evidence],
      [buildStrategistBlockContractProbeTelemetry("sblk.version_tagged", "block_versioning", 0, 1)],
    );

    const safetyIssues = validateStrategistBlockContractSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});
