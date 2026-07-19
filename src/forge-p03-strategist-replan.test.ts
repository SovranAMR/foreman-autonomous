import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistReplanBaseline,
  runStrategistReplanProbes,
  runStrategistReplanProductionSlice,
  runStrategistReplanBoundarySlice,
  runStrategistReplanFailureRecoverySlice,
  runStrategistReplanEvidenceSlice,
  runStrategistReplanProbesWithRecord,
  runStrategistReplanFailureRecoverySliceWithRecord,
  validateStrategistReplan,
  validateStrategistReplanProbeMatrix,
  validateStrategistReplanBoundaryProbeMatrix,
  validateStrategistReplanFailureRecoveryProbeMatrix,
  validateStrategistReplanFailureRecoveryRunRecord,
  validateStrategistReplanRunRecord,
  listStrategistReplanFailureRecoveryProbeIds,
  buildStrategistReplanProbeEvidence,
  buildStrategistReplanProbeTelemetry,
  buildStrategistReplanProvenance,
  buildStrategistReplanRunRecord,
  STRATEGIST_REPLAN_FAILURE_RECOVERY_CATEGORIES,
  assessStrategistReplanInputBoundary,
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
  STRATEGIST_REPLAN_DECOMPOSE_MAX_LENGTH,
  FORGE_STRATEGIST_REPLAN_CONTRACT_V1,
  FORGE_STRATEGIST_REPLAN_VERSION,
} from "./forge-p03-strategist-replan.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

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

  it("maps 28 probes with zero remaining FAIL gaps after A03 production slice", () => {
    const contract = getActiveStrategistReplanContract();
    const summary = summarizeStrategistReplanCoverage(contract);
    const coverage = validateStrategistReplanCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 28);
    assert.equal(summary.expectedPass, 28);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 20);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 3);
    assert.equal(summary.byDisposition.recovery, 3);
    assert.equal(summary.byDisposition.nogo, 2);
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

  it("lists no remaining gap probes after A03 replan production slice", () => {
    const gaps = listStrategistReplanProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);

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

describe("Forge Strategist Replan Production Slice — P03-B08-A03", () => {
  it("validateStrategistReplan accepts valid replan plan and rejects invalid block refs", () => {
    const valid = `REASONING: Replan plan
OUTPUT:
Block 1: Setup baseline types
Block 2: Wire replan seam
DEPENDENCIES: 2→1
REPLAN PLAN: re-decompose block 2 on failure
CONFIDENCE: 0.9`;
    const validResult = validateStrategistReplan(valid);
    assert.equal(validResult.valid, true);
    assert.equal(validResult.hasReplanPlan, true);
    assert.equal(validResult.blockCount, 2);
    assert.deepEqual(validResult.invalidBlockRefs, []);

    const invalid = `REASONING: Bad replan refs
OUTPUT:
Block 1: Setup baseline types
DEPENDENCIES: none
REPLAN PLAN: replan block 9 after failure
CONFIDENCE: 0.8`;
    const invalidResult = validateStrategistReplan(invalid);
    assert.equal(invalidResult.valid, false);
    assert.deepEqual(invalidResult.invalidBlockRefs, [9]);
    assert.ok(invalidResult.issues.some(i => i.includes("invalid_replan_block_refs")));
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveStrategistReplanContract();
    const slice = runStrategistReplanProductionSlice();

    assert.equal(slice.atom, "P03-B08-A03");
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
        (r.id === "sreplan.prompt_replan_plan" ||
          r.id === "sreplan.parser_replan_fields" ||
          r.id === "sreplan.orchestrator_strategist_replan_gate" ||
          r.id === "sreplan.exported_replan_validator" ||
          r.id === "sreplan.nogo_invalid_replan" ||
          r.id === "sreplan.recovery_replan_checkpoint") &&
        r.expected === "PASS" &&
        r.actual === "PASS",
    );
    assert.equal(flippedGaps.length, 6, "A03 closes all six replan contract gaps");

    const matrixValidation = validateStrategistReplanProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });
});

describe("Forge Strategist Replan Boundary Slice — P03-B08-A04", () => {
  it("assessStrategistReplanInputBoundary handles decompose edge cases including truncation", () => {
    const empty = assessStrategistReplanInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistReplanInputBoundary("   \t\n  ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessStrategistReplanInputBoundary("bad\0decompose");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const valid = assessStrategistReplanInputBoundary(
      "REASONING: valid\nOUTPUT:\nBlock 1: task\nDEPENDENCIES: none\nREPLAN PLAN: re-decompose block 1\nCONFIDENCE: 0.8",
    );
    assert.equal(valid.disposition, "valid");
    assert.equal(valid.acceptable, true);

    const longDecompose = "x".repeat(STRATEGIST_REPLAN_DECOMPOSE_MAX_LENGTH + 500);
    const truncated = assessStrategistReplanInputBoundary(longDecompose);
    assert.equal(truncated.disposition, "exceeds_max_length");
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedDecompose.length, STRATEGIST_REPLAN_DECOMPOSE_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("defines boundary category with decompose input edge-case probes", () => {
    const boundary = listStrategistReplanContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "sreplan.empty_decompose_boundary",
      "sreplan.known_gaps_documented",
      "sreplan.long_decompose_truncation_boundary",
      "sreplan.probe_runner_exported",
      "sreplan.source_block_gate_ref",
      "sreplan.whitespace_decompose_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveStrategistReplanContract();
    const slice = runStrategistReplanBoundarySlice();

    assert.equal(slice.atom, "P03-B08-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listStrategistReplanContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateStrategistReplanBoundaryProbeMatrix(
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

describe("Forge Strategist Replan Failure/Recovery Slice — P03-B08-A05", () => {
  it("defines eight failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveStrategistReplanContract();
    const probeIds = listStrategistReplanFailureRecoveryProbeIds(contract);

    assert.equal(STRATEGIST_REPLAN_FAILURE_RECOVERY_CATEGORIES.length, 3);
    assert.equal(probeIds.length, 8);
    assert.deepEqual(probeIds.sort(), [
      "sreplan.exported_replan_validator",
      "sreplan.invalid_version_rejected",
      "sreplan.malformed_decompose_guard",
      "sreplan.min_category_probes",
      "sreplan.nogo_invalid_replan",
      "sreplan.recovery_fsm_blocked_replan",
      "sreplan.recovery_reflecting_replan",
      "sreplan.recovery_replan_checkpoint",
    ].sort());

    assert.equal(
      listStrategistReplanContractProbesByCategory("failure_path", contract).length,
      3,
    );
    assert.equal(
      listStrategistReplanContractProbesByCategory("recovery_path", contract).length,
      3,
    );
    assert.equal(
      listStrategistReplanContractProbesByCategory("nogo_path", contract).length,
      2,
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveStrategistReplanContract();
    const slice = runStrategistReplanFailureRecoverySlice();

    assert.equal(slice.atom, "P03-B08-A05");
    assert.equal(slice.failureRecoveryProbeCount, 8);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 8);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 8);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of STRATEGIST_REPLAN_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistReplanContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateStrategistReplanFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure, recovery and NO-GO replan paths with all probes passing", () => {
    const slice = runStrategistReplanFailureRecoverySlice();
    const probeIds = listStrategistReplanFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 8);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "sreplan.malformed_decompose_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const reflectingReplan = slice.failureRecoveryResults.find(
      r => r.id === "sreplan.recovery_reflecting_replan",
    );
    assert.ok(reflectingReplan);
    assert.equal(reflectingReplan!.expected, "PASS");
    assert.equal(reflectingReplan!.actual, "PASS");

    const replanCheckpoint = slice.failureRecoveryResults.find(
      r => r.id === "sreplan.recovery_replan_checkpoint",
    );
    assert.ok(replanCheckpoint);
    assert.equal(replanCheckpoint!.expected, "PASS");
    assert.equal(replanCheckpoint!.actual, "PASS");

    const nogoInvalidReplan = slice.failureRecoveryResults.find(
      r => r.id === "sreplan.nogo_invalid_replan",
    );
    assert.ok(nogoInvalidReplan);
    assert.equal(nogoInvalidReplan!.expected, "PASS");
    assert.equal(nogoInvalidReplan!.actual, "PASS");

    const exportedValidator = slice.failureRecoveryResults.find(
      r => r.id === "sreplan.exported_replan_validator",
    );
    assert.ok(exportedValidator);
    assert.equal(exportedValidator!.expected, "PASS");
    assert.equal(exportedValidator!.actual, "PASS");
  });
});

describe("Forge Strategist Replan Evidence — P03-B08-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadStrategistReplanBaseline();
    const contract = getActiveStrategistReplanContract();
    const probeIds = listStrategistReplanFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildStrategistReplanProbeEvidence(
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
      return buildStrategistReplanProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildStrategistReplanProvenance(
      "run-sreplan-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P03-B08-A06",
        sliceCategories: STRATEGIST_REPLAN_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildStrategistReplanRunRecord(provenance, evidence, telemetry);
    const validation = validateStrategistReplanFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 8);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 3);
    assert.ok(record.summary.byDisposition.recovery >= 3);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBlockGateAtom, fixture.sourceBlockGate.atom);
  });

  it("executes evidence slice with zero unexpected mismatches and valid run record", () => {
    const contract = getActiveStrategistReplanContract();
    const slice = runStrategistReplanEvidenceSlice();

    assert.equal(slice.atom, "P03-B08-A06");
    assert.equal(slice.evidenceProbeCount, 8);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 8);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 8);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(
      slice.recordValidation.valid,
      true,
      slice.recordValidation.issues.map(i => i.detail).join("\n"),
    );

    for (const category of STRATEGIST_REPLAN_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistReplanContractProbesByCategory(category, contract)) {
        const result = slice.evidenceResults.find(r => r.id === probe.id);
        assert.ok(result, `missing evidence result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const record = slice.record;
    assert.equal(record.evidence.length, 8);
    assert.equal(record.telemetry.length, 8);
    assert.equal(record.provenance.totalProbes, 8);
    assert.equal(record.provenance.sliceAtom, "P03-B08-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_STRATEGIST_REPLAN_VERSION);
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

    const recoveryProbe = record.evidence.find(e => e.probeId === "sreplan.recovery_replan_checkpoint");
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.disposition, "recovery");
  });

  it("records evidence, telemetry and provenance for full replan run", () => {
    const contract = getActiveStrategistReplanContract();
    const record = runStrategistReplanProbesWithRecord();
    const validation = validateStrategistReplanRunRecord(record, contract);

    assert.equal(record.evidence.length, 28);
    assert.equal(record.telemetry.length, 28);
    assert.equal(record.provenance.totalProbes, 28);
    assert.equal(record.provenance.harnessVersion, "1.0.0");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 28);
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveStrategistReplanContract();
    const record = runStrategistReplanFailureRecoverySliceWithRecord();
    const validation = validateStrategistReplanFailureRecoveryRunRecord(record, contract);

    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.aligned, 8);
  });
});
