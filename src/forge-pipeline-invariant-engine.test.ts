import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadPipelineInvariantEngineFixture,
  runPipelineInvariantEngineProbes,
  runPipelineInvariantEngineProductionSlice,
  runPipelineInvariantEngineBoundarySlice,
  runPipelineInvariantEngineFailureRecoverySlice,
  runPipelineInvariantEngineProbesWithRecord,
  runPipelineInvariantEngineFailureRecoverySliceWithRecord,
  validatePipelineInvariantEngineRunRecord,
  validatePipelineInvariantEngineFailureRecoveryRunRecord,
  buildPipelineInvariantEngineProbeEvidence,
  buildPipelineInvariantEngineProbeTelemetry,
  buildPipelineInvariantEngineProvenance,
  buildPipelineInvariantEngineRunRecord,
  validatePipelineInvariantEngineFixture,
  validatePipelineInvariantEngineFixtureAgainstContract,
  validatePipelineInvariantEngineProbeMatrix,
  validatePipelineInvariantEngineBoundaryProbeMatrix,
  validatePipelineInvariantEngineFailureRecoveryProbeMatrix,
  summarizePipelineInvariantEngineMatrix,
  summarizePipelineInvariantEngineContractCoverage,
  getActivePipelineInvariantEngineContract,
  getPipelineInvariantEngineCategoryContract,
  listPipelineInvariantEngineContractProbeIds,
  listPipelineInvariantEngineProbesByCategory,
  listPipelineInvariantEngineProbesByDisposition,
  listPipelineInvariantEngineFailureRecoveryProbeIds,
  listPipelineInvariantEngineKnownGaps,
  listPipelineInvariantEngineProbesByExpected,
  PIPELINE_INVARIANT_ENGINE_CATEGORIES,
  PIPELINE_INVARIANT_ENGINE_FAILURE_RECOVERY_CATEGORIES,
} from "./forge-pipeline-invariant-engine-harness.js";

function formatMismatchReport(mismatches: { id: string; expected: string; actual: string; detail: string }[]): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Pipeline Invariant Engine — P01-B05-A01", () => {
  it("loads versioned pipeline invariant engine fixture aligned with B04 handoff", () => {
    const fixture = loadPipelineInvariantEngineFixture();
    const validation = validatePipelineInvariantEngineFixture(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P01-B05-A01");
    assert.equal(fixture.contractAtom, "P01-B05-A05");
    assert.equal(fixture.sourcePhaseEventSchema.probeCount, 35);
    assert.equal(fixture.sourcePhaseEventSchema.schemaCategories, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 32);
  });

  it("measures orchestrator pipeline invariant probes with documented FAIL gaps", () => {
    const results = runPipelineInvariantEngineProbes();
    const summary = summarizePipelineInvariantEngineMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 32);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listPipelineInvariantEngineProbesByExpected("FAIL", loadPipelineInvariantEngineFixture());
    assert.equal(documentedFail.length, 10);
    assert.ok(documentedFail.some(p => p.id === "inv.runtime_phase_balance_checker"));
    assert.ok(documentedFail.some(p => p.id === "inv.event_order_validator"));
    assert.ok(documentedFail.some(p => p.id === "inv.reflection_cadence_invariant"));
    assert.ok(documentedFail.some(p => p.id === "inv.state_phase_coherence_checker"));
    assert.ok(documentedFail.some(p => p.id === "inv.block_invariant_module"));
    assert.ok(documentedFail.some(p => p.id === "inv.verification_gate_invariant"));
    assert.ok(documentedFail.some(p => p.id === "inv.invariant_engine_orchestrator_wired"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of PIPELINE_INVARIANT_ENGINE_CATEGORIES) {
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

  it("documents runtime invariant engine gaps as measurable baseline debt", () => {
    const gaps = listPipelineInvariantEngineKnownGaps();
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "inv.block_invariant_module",
      "inv.event_order_validator",
      "inv.failure_invariant_engine_on_block",
      "inv.invariant_engine_orchestrator_wired",
      "inv.nogo_invariant_on_reject",
      "inv.recovery_invariant_engine_wired",
      "inv.reflection_cadence_invariant",
      "inv.runtime_phase_balance_checker",
      "inv.state_phase_coherence_checker",
      "inv.verification_gate_invariant",
    ]);
    assert.ok(
      gaps.every(
        g =>
          g.category === "phase_lifecycle" ||
          g.category === "event_ordering" ||
          g.category === "reflection_cadence" ||
          g.category === "state_coherence" ||
          g.category === "block_halt" ||
          g.category === "verification_gate" ||
          g.category === "boundary" ||
          g.category === "failure_path" ||
          g.category === "recovery_path" ||
          g.category === "nogo_path",
      ),
      "documented gaps are runtime invariant engine probes",
    );
  });
});

describe("Forge Pipeline Invariant Engine Contract — P01-B05-A02", () => {
  it("defines typed acceptance for all eleven pipeline invariant categories", () => {
    const contract = getActivePipelineInvariantEngineContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P01-B05-A05");

    for (const category of PIPELINE_INVARIANT_ENGINE_CATEGORIES) {
      const categoryContract = getPipelineInvariantEngineCategoryContract(category);
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

  it("maps 32 probes with ten documented gap dispositions from A01 baseline", () => {
    const contract = getActivePipelineInvariantEngineContract();
    const summary = summarizePipelineInvariantEngineContractCoverage(contract);

    assert.equal(summary.totalProbes, 32);
    assert.equal(summary.expectedPass, 22);
    assert.equal(summary.expectedFail, 10);
    assert.equal(summary.byDisposition.observed, 16);
    assert.equal(summary.byDisposition.gap, 10);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.phase_lifecycle.probeCount, 3);
    assert.equal(summary.byCategory.event_ordering.probeCount, 3);
    assert.equal(summary.byCategory.reflection_cadence.probeCount, 3);
    assert.equal(summary.byCategory.state_coherence.probeCount, 3);
    assert.equal(summary.byCategory.block_halt.probeCount, 3);
    assert.equal(summary.byCategory.verification_gate.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 3);
    assert.equal(summary.byCategory.failure_path.probeCount, 3);
    assert.equal(summary.byCategory.recovery_path.probeCount, 3);
    assert.equal(summary.byCategory.nogo_path.probeCount, 3);
  });

  it("lists ten documented gap probes for runtime invariant engine wiring", () => {
    const gaps = listPipelineInvariantEngineProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, [
      "inv.block_invariant_module",
      "inv.event_order_validator",
      "inv.failure_invariant_engine_on_block",
      "inv.invariant_engine_orchestrator_wired",
      "inv.nogo_invariant_on_reject",
      "inv.recovery_invariant_engine_wired",
      "inv.reflection_cadence_invariant",
      "inv.runtime_phase_balance_checker",
      "inv.state_phase_coherence_checker",
      "inv.verification_gate_invariant",
    ]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadPipelineInvariantEngineFixture();
    const contract = getActivePipelineInvariantEngineContract();
    const validation = validatePipelineInvariantEngineFixtureAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listPipelineInvariantEngineContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each pipeline invariant probe id is globally unique", () => {
    const ids = listPipelineInvariantEngineContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runPipelineInvariantEngineProbes();
    const contract = getActivePipelineInvariantEngineContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});

describe("Forge Pipeline Invariant Engine Production Slice — P01-B05-A03", () => {
  it("executes contract-wired probes with zero unexpected mismatches", () => {
    const contract = getActivePipelineInvariantEngineContract();
    const slice = runPipelineInvariantEngineProductionSlice();

    assert.equal(slice.atom, "P01-B05-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 32);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 22);
    assert.equal(slice.matrixValidation.gapAligned, 10);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validatePipelineInvariantEngineProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(slice.summary.mismatches.length, 0);
    assert.equal(slice.summary.knownGaps.length, 10);
    assert.deepEqual(
      slice.summary.knownGaps.map(g => g.id).sort(),
      [
        "inv.block_invariant_module",
        "inv.event_order_validator",
        "inv.failure_invariant_engine_on_block",
        "inv.invariant_engine_orchestrator_wired",
        "inv.nogo_invariant_on_reject",
        "inv.recovery_invariant_engine_wired",
        "inv.reflection_cadence_invariant",
        "inv.runtime_phase_balance_checker",
        "inv.state_phase_coherence_checker",
        "inv.verification_gate_invariant",
      ],
    );
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runPipelineInvariantEngineProbes();
    const contract = getActivePipelineInvariantEngineContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});

describe("Forge Pipeline Invariant Engine Boundary Slice — P01-B05-A04", () => {
  it("defines boundary category with empty vision, format_retry and wiring edge probes", () => {
    const boundary = listPipelineInvariantEngineProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 3);
    assert.deepEqual(ids, [
      "inv.error_on_empty_vision",
      "inv.format_retry_handling",
      "inv.invariant_engine_orchestrator_wired",
    ]);
    assert.equal(boundary.filter(p => p.expected === "PASS").length, 2);
    assert.equal(boundary.filter(p => p.disposition === "gap").length, 1);
    assert.ok(boundary.some(p => p.id === "inv.error_on_empty_vision"));
    assert.ok(boundary.some(p => p.id === "inv.format_retry_handling"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActivePipelineInvariantEngineContract();
    const slice = runPipelineInvariantEngineBoundarySlice();

    assert.equal(slice.atom, "P01-B05-A04");
    assert.equal(slice.boundaryProbeCount, 3);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 3);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 2);
    assert.equal(slice.matrixValidation.gapAligned, 1);

    for (const boundaryProbe of listPipelineInvariantEngineProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validatePipelineInvariantEngineBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves documented boundary gap for invariant engine orchestrator wiring", () => {
    const results = runPipelineInvariantEngineProbes();
    const boundary = results.filter(r => r.category === "boundary");

    assert.equal(boundary.length, 3);
    assert.equal(boundary.every(r => r.aligned), true);

    const wiringGap = boundary.find(r => r.id === "inv.invariant_engine_orchestrator_wired");
    assert.ok(wiringGap);
    assert.equal(wiringGap!.expected, "FAIL");
    assert.equal(wiringGap!.actual, "FAIL");

    const emptyVision = boundary.find(r => r.id === "inv.error_on_empty_vision");
    assert.ok(emptyVision);
    assert.equal(emptyVision!.expected, "PASS");
    assert.equal(emptyVision!.actual, "PASS");

    const formatRetry = boundary.find(r => r.id === "inv.format_retry_handling");
    assert.ok(formatRetry);
    assert.equal(formatRetry!.expected, "PASS");
    assert.equal(formatRetry!.actual, "PASS");
  });
});

describe("Forge Pipeline Invariant Engine Failure/Recovery Slice — P01-B05-A05", () => {
  it("defines failure, recovery and NO-GO categories with invariant probes", () => {
    const failure = listPipelineInvariantEngineProbesByDisposition("failure");
    const recovery = listPipelineInvariantEngineProbesByDisposition("recovery");
    const nogo = listPipelineInvariantEngineProbesByDisposition("nogo");
    const failurePath = listPipelineInvariantEngineProbesByCategory("failure_path");
    const recoveryPath = listPipelineInvariantEngineProbesByCategory("recovery_path");
    const nogoPath = listPipelineInvariantEngineProbesByCategory("nogo_path");

    assert.ok(failure.some(p => p.id === "inv.failure_block_halt_invariant"));
    assert.ok(failure.some(p => p.id === "inv.failure_error_recovery_queue"));
    assert.ok(recovery.some(p => p.id === "inv.recovery_phase_events_balanced"));
    assert.ok(recovery.some(p => p.id === "inv.recovery_re_decompose_wired"));
    assert.ok(nogo.some(p => p.id === "inv.nogo_reviewer_reject_rollback"));
    assert.ok(nogo.some(p => p.id === "inv.nogo_format_retry_gate"));
    assert.equal(failurePath.length, 3);
    assert.equal(recoveryPath.length, 3);
    assert.equal(nogoPath.length, 3);
    assert.deepEqual(
      [...PIPELINE_INVARIANT_ENGINE_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActivePipelineInvariantEngineContract();
    const slice = runPipelineInvariantEngineFailureRecoverySlice();

    assert.equal(slice.atom, "P01-B05-A05");
    assert.equal(slice.failureRecoveryProbeCount, 9);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 9);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 3);

    for (const category of PIPELINE_INVARIANT_ENGINE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listPipelineInvariantEngineProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validatePipelineInvariantEngineFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves documented gaps while exercising failure/recovery/NO-GO paths", () => {
    const results = runPipelineInvariantEngineProbes();
    const summary = summarizePipelineInvariantEngineMatrix(results);

    assert.equal(summary.total, 32);
    assert.equal(summary.knownGaps.length, 10);
    assert.equal(summary.mismatches.length, 0, formatMismatchReport(summary.mismatches));

    const probeIds = listPipelineInvariantEngineFailureRecoveryProbeIds();
    assert.equal(probeIds.length, 9);
    assert.ok(probeIds.every(id => results.find(r => r.id === id)?.aligned));
  });
});

describe("Forge Pipeline Invariant Engine Evidence — P01-B05-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadPipelineInvariantEngineFixture();
    const contract = getActivePipelineInvariantEngineContract();
    const probeIds = listPipelineInvariantEngineFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-18T00:00:00.000Z";
    const completedAt = "2026-07-18T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildPipelineInvariantEngineProbeEvidence(
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
      return buildPipelineInvariantEngineProbeTelemetry(probeId, contractProbe.category, index, index * 0.5);
    });

    const provenance = buildPipelineInvariantEngineProvenance(
      "run-inv-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P01-B05-A06",
        sliceCategories: PIPELINE_INVARIANT_ENGINE_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildPipelineInvariantEngineRunRecord(provenance, evidence, telemetry);
    const validation = validatePipelineInvariantEngineFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 9);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.gap >= 3);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourcePhaseEventSchemaAtom, fixture.sourcePhaseEventSchema.atom);
  });

  it("records evidence, telemetry and provenance for failure/recovery slice run", () => {
    const contract = getActivePipelineInvariantEngineContract();
    const record = runPipelineInvariantEngineFailureRecoverySliceWithRecord();
    const validation = validatePipelineInvariantEngineFailureRecoveryRunRecord(record, contract);

    assert.equal(record.evidence.length, 9);
    assert.equal(record.telemetry.length, 9);
    assert.equal(record.provenance.totalProbes, 9);
    assert.equal(record.provenance.sliceAtom, "P01-B05-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
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
      assert.equal(item.aligned, true);
      assert.ok(item.recordedAt.length > 10);
    }
  });

  it("records evidence, telemetry and provenance for full pipeline invariant engine run", () => {
    const record = runPipelineInvariantEngineProbesWithRecord();
    const validation = validatePipelineInvariantEngineRunRecord(record);

    assert.equal(record.evidence.length, 32);
    assert.equal(record.telemetry.length, 32);
    assert.equal(record.provenance.totalProbes, 32);
    assert.ok(record.provenance.runId.length > 8);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);

    for (const item of record.evidence) {
      assert.ok(item.criterion.length > 0, `${item.probeId} missing criterion provenance`);
      assert.ok(
        item.disposition === "observed" ||
          item.disposition === "gap" ||
          item.disposition === "failure" ||
          item.disposition === "recovery" ||
          item.disposition === "nogo",
      );
    }
  });
});
