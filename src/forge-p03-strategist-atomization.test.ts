import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistAtomizationBaseline,
  getActiveStrategistAtomizationContract,
  getStrategistAtomizationCategoryContract,
  listStrategistAtomizationContractProbeIds,
  listStrategistAtomizationContractProbesByCategory,
  listStrategistAtomizationProbesByDisposition,
  summarizeStrategistAtomizationCoverage,
  validateStrategistAtomizationCoverage,
  validateStrategistAtomizationAgainstContract,
  recoverStrategistAtomize,
  assessStrategistAtomizeInputBoundary,
  runStrategistAtomizationProductionSlice,
  runStrategistAtomizationBoundarySlice,
  runStrategistAtomizationFailureRecoverySlice,
  validateStrategistAtomizationBoundaryProbeMatrix,
  validateStrategistAtomizationFailureRecoveryProbeMatrix,
  listStrategistAtomizationFailureRecoveryProbeIds,
  STRATEGIST_ATOMIZATION_FAILURE_RECOVERY_CATEGORIES,
  validateStrategistAtomizationProbeMatrix,
  runStrategistAtomizationEvidenceSlice,
  runStrategistAtomizationFailureRecoverySliceWithRecord,
  runStrategistAtomizationProbesWithRecord,
  validateStrategistAtomizationFailureRecoveryRunRecord,
  validateStrategistAtomizationRunRecord,
  buildStrategistAtomizationProbeEvidence,
  buildStrategistAtomizationProbeTelemetry,
  buildStrategistAtomizationProvenance,
  buildStrategistAtomizationRunRecord,
  createStrategistAtomizationFuzzRng,
  runStrategistAtomizationPropertyChecks,
  runStrategistAtomizationFuzzValidation,
  runStrategistAtomizationRunRecordFuzzValidation,
  runStrategistAtomizationPropertyFuzzSlice,
  runStrategistAtomizationForgeRegression,
  detectStrategistAtomizationProbeRegression,
  applyStrategistAtomizationRunRecordFuzzMutation,
  getForgeStrategistAtomizationGuardControls,
  validateForgeStrategistAtomizationGuard,
  runStrategistAtomizationAdversarialGuardChecks,
  buildStrategistAtomizationAdversarialGuardScenarios,
  detectStrategistAtomizationFalseAlignment,
  detectStrategistAtomizationEvidenceSummaryMismatch,
  validateStrategistAtomizationPerformance,
  validateStrategistAtomizationCost,
  validateStrategistAtomizationSafety,
  FORGE_STRATEGIST_ATOMIZATION_VERSION,
  loadStrategistAtomizationBaseline,
  STRATEGIST_ATOMIZE_MAX_LENGTH,
  STRATEGIST_ATOMIZATION_CATEGORIES,
  FORGE_STRATEGIST_ATOMIZATION_CONTRACT_V1,
} from "./forge-p03-strategist-atomization.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Atomization Contract — P03-B03-A02", () => {
  it("defines typed acceptance for all eight atomization categories", () => {
    const contract = getActiveStrategistAtomizationContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B03-A06");

    for (const category of STRATEGIST_ATOMIZATION_CATEGORIES) {
      const categoryContract = getStrategistAtomizationCategoryContract(category);
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

  it("maps 24 probes with zero documented FAIL gaps after A04 boundary slice", () => {
    const contract = getActiveStrategistAtomizationContract();
    const summary = summarizeStrategistAtomizationCoverage(contract);
    const coverage = validateStrategistAtomizationCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 24);
    assert.equal(summary.expectedPass, 24);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 18);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.atom_versioning.probeCount, 3);
    assert.equal(summary.byCategory.atom_structure.probeCount, 3);
    assert.equal(summary.byCategory.atom_sizing.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 7);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists zero gap probes after structured atom recovery slice", () => {
    const gaps = listStrategistAtomizationProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistAtomizationBaseline();
    const contract = getActiveStrategistAtomizationContract();
    const validation = validateStrategistAtomizationAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistAtomizationContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_ATOMIZATION_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_ATOMIZATION_CONTRACT_V1.probes.length, 24);
  });

  it("each atomization probe id is globally unique", () => {
    const ids = listStrategistAtomizationContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistAtomizationContract();
    const flatIds = listStrategistAtomizationContractProbeIds(contract);
    const categoryIds = STRATEGIST_ATOMIZATION_CATEGORIES.flatMap(category =>
      listStrategistAtomizationContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });
});

describe("Forge Strategist Atomization Production Slice — P03-B03-A03", () => {
  it("recoverStrategistAtomize restructures malformed atomize parse into contract-compliant plan", () => {
    const malformed = `REASONING: Need atom production plan
Here are the steps:
1. Setup atomization types
2. Wire atomize production seam
3. Add atomization baseline tests
CONFIDENCE: 0.8`;
    const recovery = recoverStrategistAtomize(malformed);

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.contractCompliant, true);
    assert.ok(recovery.atomCount >= 3);
    assert.match(recovery.composedAtomize, /OUTPUT:/);
    assert.ok(recovery.atoms.some(atom => atom.includes("atomization types")));
    assert.ok(recovery.atoms.some(atom => atom.includes("atomize production seam")));
    assert.ok(recovery.atoms.some(atom => atom.includes("atomization baseline")));
  });

  it("recoverStrategistAtomize rejects null-byte atomize output safely", () => {
    const recovery = recoverStrategistAtomize("atomize\0output");
    assert.equal(recovery.recovered, false);
    assert.equal(recovery.contractCompliant, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_atomize"]);
  });

  it("assessStrategistAtomizeInputBoundary handles atomize edge cases", () => {
    const empty = assessStrategistAtomizeInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistAtomizeInputBoundary("   \t\n  ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessStrategistAtomizeInputBoundary("bad\0atomize");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const valid = assessStrategistAtomizeInputBoundary("OUTPUT:\n1. valid atom task\nCONFIDENCE: 0.8");
    assert.equal(valid.disposition, "valid");
    assert.equal(valid.acceptable, true);
  });

  it("executes contract-wired probes with zero unexpected mismatches after recovery slice", () => {
    const contract = getActiveStrategistAtomizationContract();
    const slice = runStrategistAtomizationProductionSlice();

    assert.equal(slice.atom, "P03-B03-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 24);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 24);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateStrategistAtomizationProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const recoveryProbe = slice.results.find(r => r.id === "satom.structured_atom_recovery");
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
  });
});

describe("Forge Strategist Atomization Boundary Slice — P03-B03-A04", () => {
  it("assessStrategistAtomizeInputBoundary handles atomize edge cases including truncation", () => {
    const empty = assessStrategistAtomizeInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistAtomizeInputBoundary("   \t\n  ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessStrategistAtomizeInputBoundary("bad\0atomize");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const valid = assessStrategistAtomizeInputBoundary("OUTPUT:\n1. valid atom task\nCONFIDENCE: 0.8");
    assert.equal(valid.disposition, "valid");
    assert.equal(valid.acceptable, true);

    const longAtomize = "x".repeat(STRATEGIST_ATOMIZE_MAX_LENGTH + 500);
    const truncated = assessStrategistAtomizeInputBoundary(longAtomize);
    assert.equal(truncated.disposition, "exceeds_max_length");
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedAtomize.length, STRATEGIST_ATOMIZE_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("defines boundary category with atomize input edge-case probes", () => {
    const boundary = listStrategistAtomizationContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 7);
    assert.deepEqual(ids, [
      "satom.atom_cap_boundary",
      "satom.empty_atomize_boundary",
      "satom.known_gaps_documented",
      "satom.long_atomize_truncation_boundary",
      "satom.probe_runner_exported",
      "satom.source_block_gate_ref",
      "satom.whitespace_atomize_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveStrategistAtomizationContract();
    const slice = runStrategistAtomizationBoundarySlice();

    assert.equal(slice.atom, "P03-B03-A04");
    assert.equal(slice.boundaryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listStrategistAtomizationContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateStrategistAtomizationBoundaryProbeMatrix(
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

describe("Forge Strategist Atomization Failure/Recovery Slice — P03-B03-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveStrategistAtomizationContract();
    const failure = listStrategistAtomizationContractProbesByCategory("failure_path", contract);
    const recovery = listStrategistAtomizationContractProbesByCategory("recovery_path", contract);
    const nogo = listStrategistAtomizationContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...STRATEGIST_ATOMIZATION_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveStrategistAtomizationContract();
    const slice = runStrategistAtomizationFailureRecoverySlice();

    assert.equal(slice.atom, "P03-B03-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of STRATEGIST_ATOMIZATION_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistAtomizationContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateStrategistAtomizationFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure, recovery and NO-GO atomization paths", () => {
    const slice = runStrategistAtomizationFailureRecoverySlice();
    const probeIds = listStrategistAtomizationFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "satom.malformed_atomize_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const recoveryProbe = slice.failureRecoveryResults.find(
      r => r.id === "satom.structured_atom_recovery",
    );
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");

    const zeroAtomsNogo = slice.failureRecoveryResults.find(
      r => r.id === "satom.orchestrator_zero_atoms_skip",
    );
    assert.ok(zeroAtomsNogo);
    assert.equal(zeroAtomsNogo!.expected, "PASS");
    assert.equal(zeroAtomsNogo!.actual, "PASS");
  });
});

describe("Forge Strategist Atomization Evidence — P03-B03-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadStrategistAtomizationBaseline();
    const contract = getActiveStrategistAtomizationContract();
    const probeIds = listStrategistAtomizationFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildStrategistAtomizationProbeEvidence(
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
      return buildStrategistAtomizationProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildStrategistAtomizationProvenance(
      "run-satom-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P03-B03-A06",
        sliceCategories: STRATEGIST_ATOMIZATION_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildStrategistAtomizationRunRecord(provenance, evidence, telemetry);
    const validation = validateStrategistAtomizationFailureRecoveryRunRecord(record, contract);

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
    const contract = getActiveStrategistAtomizationContract();
    const slice = runStrategistAtomizationEvidenceSlice();

    assert.equal(slice.atom, "P03-B03-A06");
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

    for (const category of STRATEGIST_ATOMIZATION_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistAtomizationContractProbesByCategory(category, contract)) {
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
    assert.equal(record.provenance.sliceAtom, "P03-B03-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_STRATEGIST_ATOMIZATION_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a09");
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

    const recoveryProbe = record.evidence.find(e => e.probeId === "satom.structured_atom_recovery");
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.disposition, "recovery");
  });

  it("records evidence, telemetry and provenance for full atomization run", () => {
    const contract = getActiveStrategistAtomizationContract();
    const record = runStrategistAtomizationProbesWithRecord();
    const validation = validateStrategistAtomizationRunRecord(record, contract);

    assert.equal(record.evidence.length, 24);
    assert.equal(record.telemetry.length, 24);
    assert.equal(record.provenance.totalProbes, 24);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a09");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 24);
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveStrategistAtomizationContract();
    const record = runStrategistAtomizationFailureRecoverySliceWithRecord();
    const validation = validateStrategistAtomizationFailureRecoveryRunRecord(record, contract);

    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.aligned, 6);
  });
});

describe("Forge Strategist Atomization Property/Fuzz — P03-B03-A07", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runStrategistAtomizationPropertyChecks(FORGE_STRATEGIST_ATOMIZATION_CONTRACT_V1);
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createStrategistAtomizationFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createStrategistAtomizationFuzzRng(1337);
    const rngB = createStrategistAtomizationFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createStrategistAtomizationFuzzRng(1338)()));
  });

  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadStrategistAtomizationBaseline();
    const contract = getActiveStrategistAtomizationContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runStrategistAtomizationFuzzValidation(fixture, contract, seed, 24);
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
    const contract = getActiveStrategistAtomizationContract();
    const record = runStrategistAtomizationFailureRecoverySliceWithRecord();

    assert.equal(
      validateStrategistAtomizationFailureRecoveryRunRecord(record, contract).valid,
      true,
      validateStrategistAtomizationFailureRecoveryRunRecord(record, contract).issues.map(i => i.detail).join("\n"),
    );

    const fuzz = runStrategistAtomizationRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveStrategistAtomizationContract();
    const fixture = loadStrategistAtomizationBaseline();
    const probeIds = listStrategistAtomizationContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistAtomizationProbeEvidence(
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
      return buildStrategistAtomizationProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildStrategistAtomizationProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildStrategistAtomizationRunRecord(provenance, evidence, telemetry);

    assert.equal(validateStrategistAtomizationRunRecord(record, contract).valid, true);

    const fuzz = runStrategistAtomizationRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });

  it("executes property/fuzz slice with zero accepted mutations", () => {
    const slice = runStrategistAtomizationPropertyFuzzSlice();

    assert.equal(slice.atom, "P03-B03-A07");
    assert.equal(slice.propertyChecksPassed, true);
    assert.equal(slice.contractFuzzRejected, true);
    assert.equal(slice.runRecordFuzzRejected, true);
    assert.equal(slice.propertyResult.allPassed, true);
    assert.equal(slice.contractFuzz.allMutationsRejected, true);
    assert.equal(slice.contractFuzz.accepted, 0);
    assert.equal(slice.runRecordFuzz.mutationsAccepted, 0);
  });
});

describe("Forge Strategist Atomization Regression — P03-B03-A08", () => {
  it("runStrategistAtomizationForgeRegression passes on canonical atomization matrix", () => {
    const result = runStrategistAtomizationForgeRegression();

    assert.equal(result.atom, "P03-B03-A08");
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 24);
    assert.equal(result.probeRegression, null);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.propertyFuzzSlice.propertyChecksPassed, true);
    assert.equal(result.propertyFuzzSlice.contractFuzzRejected, true);
    assert.equal(result.propertyFuzzSlice.runRecordFuzzRejected, true);
    assert.ok(result.detail.includes("24/24 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
  });

  it("detectStrategistAtomizationProbeRegression flags newly misaligned probes", () => {
    const prior = runStrategistAtomizationProbesWithRecord();
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

    const report = detectStrategistAtomizationProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runStrategistAtomizationForgeRegression compares against prior record without false regression", () => {
    const prior = runStrategistAtomizationProbesWithRecord();
    const result = runStrategistAtomizationForgeRegression(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runStrategistAtomizationForgeRegression rejects tampered prior records", () => {
    const prior = runStrategistAtomizationProbesWithRecord();
    const tamperedPrior = applyStrategistAtomizationRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateStrategistAtomizationRunRecord(tamperedPrior).valid, false);

    const result = runStrategistAtomizationForgeRegression(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runStrategistAtomizationForgeRegression fails when probe alignment regresses", () => {
    const prior = runStrategistAtomizationProbesWithRecord();
    const tamperedCurrent = structuredClone(prior);
    const target = tamperedCurrent.evidence[0]!;
    target.aligned = false;
    target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
    tamperedCurrent.summary = {
      ...tamperedCurrent.summary,
      aligned: tamperedCurrent.summary.aligned - 1,
      mismatches: tamperedCurrent.summary.mismatches + 1,
    };

    const report = detectStrategistAtomizationProbeRegression(prior, tamperedCurrent);
    assert.equal(report.hasRegression, true);
  });
});

describe("Forge Strategist Atomization Guard — P03-B03-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runStrategistAtomizationProbesWithRecord();
    const contract = getActiveStrategistAtomizationContract();
    const adversarial = runStrategistAtomizationAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildStrategistAtomizationProbeEvidence(
      "satom.version_tagged",
      "atom_versioning",
      "PASS",
      "FAIL",
      true,
      "test",
      "false pass claim",
      "observed",
      "2026-07-19T06:00:00.000Z",
    );
    const fixture = loadStrategistAtomizationBaseline();
    const contract = getActiveStrategistAtomizationContract();
    const falsePassRecord = buildStrategistAtomizationRunRecord(
      buildStrategistAtomizationProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T06:00:00.000Z",
        "2026-07-19T06:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildStrategistAtomizationProbeTelemetry("satom.version_tagged", "atom_versioning", 0, 1)],
    );
    assert.ok(detectStrategistAtomizationFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildStrategistAtomizationProbeEvidence(
      "satom.version_tagged",
      "atom_versioning",
      "PASS",
      "FAIL",
      false,
      "test",
      "summary tamper",
      "observed",
      "2026-07-19T06:00:00.000Z",
    );
    const summaryRecord = buildStrategistAtomizationRunRecord(
      buildStrategistAtomizationProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T06:00:00.000Z",
        "2026-07-19T06:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildStrategistAtomizationProbeTelemetry("satom.version_tagged", "atom_versioning", 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectStrategistAtomizationEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildStrategistAtomizationAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildStrategistAtomizationAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Strategist Atomization Guard — P03-B03-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical atomization run", () => {
    const record = runStrategistAtomizationProbesWithRecord();
    const contract = getActiveStrategistAtomizationContract();
    const guard = validateForgeStrategistAtomizationGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeStrategistAtomizationGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadStrategistAtomizationBaseline();
    const contract = getActiveStrategistAtomizationContract();
    const probeIds = listStrategistAtomizationContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistAtomizationProbeEvidence(
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
      return buildStrategistAtomizationProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildStrategistAtomizationRunRecord(
      buildStrategistAtomizationProvenance(
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

    const perfIssues = validateStrategistAtomizationPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateStrategistAtomizationCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadStrategistAtomizationBaseline();
    const contract = getActiveStrategistAtomizationContract();
    const evidence = buildStrategistAtomizationProbeEvidence(
      "satom.version_tagged",
      "atom_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildStrategistAtomizationRunRecord(
      buildStrategistAtomizationProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T06:00:00.000Z",
        "2026-07-19T06:00:01.000Z",
        1,
      ),
      [evidence],
      [buildStrategistAtomizationProbeTelemetry("satom.version_tagged", "atom_versioning", 0, 1)],
    );

    const safetyIssues = validateStrategistAtomizationSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});
