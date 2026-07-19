import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistParallelWaveBaseline,
  runStrategistParallelWaveProbes,
  runStrategistParallelWaveProductionSlice,
  runStrategistParallelWaveBoundarySlice,
  runStrategistParallelWaveFailureRecoverySlice,
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
  assessStrategistParallelWaveInputBoundary,
  STRATEGIST_PARALLEL_WAVE_CATEGORIES,
  STRATEGIST_PARALLEL_WAVE_FAILURE_RECOVERY_CATEGORIES,
  STRATEGIST_PARALLEL_WAVE_DECOMPOSE_MAX_LENGTH,
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
