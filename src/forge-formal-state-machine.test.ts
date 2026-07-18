import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadFormalStateMachineFixture,
  runFormalStateMachineProbes,
  runFormalStateMachineProductionSlice,
  runFormalStateMachineBoundarySlice,
  runFormalStateMachineFailureRecoverySlice,
  runFormalStateMachineProbesWithRecord,
  runFormalStateMachineFailureRecoverySliceWithRecord,
  runForgeFormalStateMachineRegressionGate,
  validateFormalStateMachineRunRecord,
  validateFormalStateMachineFailureRecoveryRunRecord,
  buildFormalStateMachineProbeEvidence,
  buildFormalStateMachineProbeTelemetry,
  buildFormalStateMachineProvenance,
  buildFormalStateMachineRunRecord,
  summarizeFormalStateMachineMatrix,
  validateFormalStateMachineFixture,
  validateFormalStateMachineFixtureAgainstContract,
  validateFormalStateMachineProbeMatrix,
  listFormalStateMachineKnownGaps,
  listFormalStateMachineProbesByExpected,
  getActiveFormalStateMachineContract,
  getFormalStateMachineCategoryContract,
  listFormalStateMachineContractProbeIds,
  listFormalStateMachineProbesByDisposition,
  listFormalStateMachineProbesByCategory,
  validateFormalStateMachineBoundaryProbeMatrix,
  validateFormalStateMachineFailureRecoveryProbeMatrix,
  summarizeFormalStateMachineContractCoverage,
  FORMAL_STATE_MACHINE_FAILURE_RECOVERY_CATEGORIES,
  FORMAL_STATE_MACHINE_CATEGORIES,
  listFormalStateMachineFailureRecoveryProbeIds,
} from "./forge-formal-state-machine-harness.js";
import {
  runFormalStateMachineFuzzValidation,
  runFormalStateMachinePropertyChecks,
  runFormalStateMachineRunRecordFuzzValidation,
  detectFormalStateMachineProbeRegression,
} from "./forge-formal-state-machine.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Formal State Machine — P01-B03-A01", () => {
  it("loads versioned formal state machine fixture aligned with B02 handoff", () => {
    const fixture = loadFormalStateMachineFixture();
    const validation = validateFormalStateMachineFixture(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P01-B03-A01");
    assert.equal(fixture.contractAtom, "P01-B03-A05");
    assert.equal(fixture.sourceBehaviorMap.probeCount, 26);
    assert.equal(fixture.sourceBehaviorMap.behaviorCategories, 8);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 28);
  });

  it("measures orchestrator ↔ StateManager probe matrix with documented FAIL gaps", () => {
    const results = runFormalStateMachineProbes();
    const summary = summarizeFormalStateMachineMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 28);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listFormalStateMachineProbesByExpected("FAIL");
    assert.equal(documentedFail.length, 2);
    assert.ok(documentedFail.some(p => p.id === "fsm.orch_blocked_sync"));
    assert.ok(documentedFail.some(p => p.id === "fsm.orch_awaiting_human_sync"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of FORMAL_STATE_MACHINE_CATEGORIES) {
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

  it("documents orchestrator failure-state sync gaps as measurable baseline debt", () => {
    const gaps = listFormalStateMachineKnownGaps();
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, ["fsm.orch_awaiting_human_sync", "fsm.orch_blocked_sync"]);
    assert.ok(
      gaps.every(g => g.category === "failure_state"),
      "documented gaps are failure_state orchestrator sync probes",
    );
  });
});

describe("Forge Formal State Machine Contract — P01-B03-A02", () => {
  it("defines typed acceptance for all seven formal state machine categories", () => {
    const contract = getActiveFormalStateMachineContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P01-B03-A05");

    for (const category of FORMAL_STATE_MACHINE_CATEGORIES) {
      const categoryContract = getFormalStateMachineCategoryContract(category);
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

  it("maps 28 probes with failure/recovery/gap/boundary/nogo disposition coverage", () => {
    const contract = getActiveFormalStateMachineContract();
    const summary = summarizeFormalStateMachineContractCoverage(contract);

    assert.equal(summary.totalProbes, 28);
    assert.equal(summary.expectedPass, 26);
    assert.equal(summary.expectedFail, 2);
    assert.equal(summary.byDisposition.observed, 19);
    assert.equal(summary.byDisposition.gap, 2);
    assert.equal(summary.byDisposition.failure, 3);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.transition_graph.probeCount, 3);
    assert.equal(summary.byCategory.state_invariant.probeCount, 3);
    assert.equal(summary.byCategory.orchestrator_sync.probeCount, 8);
    assert.equal(summary.byCategory.failure_state.probeCount, 2);
    assert.equal(summary.byCategory.recovery_state.probeCount, 4);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
  });

  it("lists two documented gap probes for orchestrator failure-state sync", () => {
    const gaps = listFormalStateMachineProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, ["fsm.orch_awaiting_human_sync", "fsm.orch_blocked_sync"]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadFormalStateMachineFixture();
    const contract = getActiveFormalStateMachineContract();
    const validation = validateFormalStateMachineFixtureAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listFormalStateMachineContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each formal state machine probe id is globally unique", () => {
    const ids = listFormalStateMachineContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("Forge Formal State Machine Production Slice — P01-B03-A03", () => {
  it("executes contract-wired probes with zero unexpected mismatches", () => {
    const contract = getActiveFormalStateMachineContract();
    const slice = runFormalStateMachineProductionSlice();

    assert.equal(slice.atom, "P01-B03-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 28);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 26);
    assert.equal(slice.matrixValidation.gapAligned, 2);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateFormalStateMachineProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(slice.summary.mismatches.length, 0);
    assert.equal(slice.summary.knownGaps.length, 2);
    assert.deepEqual(
      slice.summary.knownGaps.map(g => g.id).sort(),
      ["fsm.orch_awaiting_human_sync", "fsm.orch_blocked_sync"],
    );
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runFormalStateMachineProbes();
    const contract = getActiveFormalStateMachineContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});

describe("Forge Formal State Machine Boundary Slice — P01-B03-A04", () => {
  it("defines boundary category with edge transitions and invalid-jump probes", () => {
    const boundary = listFormalStateMachineProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "fsm.boundary_blocked_escalate_awaiting_human",
      "fsm.boundary_complete_restart_idle",
      "fsm.boundary_reflecting_replan_visioning",
      "fsm.boundary_rejects_complete_to_executing",
      "fsm.boundary_rejects_idle_to_complete",
      "fsm.boundary_verifying_terminal_complete",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
    assert.equal(boundary.filter(p => p.disposition === "failure").length, 2);
    assert.equal(boundary.filter(p => p.disposition === "observed").length, 4);
  });

  it("executes boundary slice with zero unexpected mismatches on edge and invalid jumps", () => {
    const contract = getActiveFormalStateMachineContract();
    const slice = runFormalStateMachineBoundarySlice();

    assert.equal(slice.atom, "P01-B03-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);

    for (const boundaryProbe of listFormalStateMachineProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, "PASS");
      assert.equal(result!.actual, "PASS");
      assert.equal(result!.aligned, true);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateFormalStateMachineBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure/recovery graph boundary edges without mutating on invalid jumps", () => {
    const results = runFormalStateMachineProbes();
    const boundary = results.filter(r => r.category === "boundary");

    assert.equal(boundary.length, 6);
    assert.equal(boundary.every(r => r.aligned), true);

    const invalidJumpProbes = boundary.filter(r => r.id.includes("rejects_"));
    assert.equal(invalidJumpProbes.length, 2);
    assert.ok(invalidJumpProbes.every(r => r.detail.includes("rejected=true")));
  });
});

describe("Forge Formal State Machine Failure/Recovery/NO-GO — P01-B03-A05", () => {
  it("lists failure, recovery and NO-GO probes by disposition and category", () => {
    const failure = listFormalStateMachineProbesByDisposition("failure");
    const recovery = listFormalStateMachineProbesByDisposition("recovery");
    const nogo = listFormalStateMachineProbesByDisposition("nogo");
    const failureState = listFormalStateMachineProbesByCategory("failure_state");
    const recoveryState = listFormalStateMachineProbesByCategory("recovery_state");

    assert.ok(failure.some(p => p.id === "fsm.invariant_rejects_invalid"));
    assert.ok(recovery.some(p => p.id === "fsm.recovery_blocked_to_decomposing"));
    assert.ok(recovery.some(p => p.id === "fsm.recovery_awaiting_to_executing"));
    assert.deepEqual(
      nogo.map(p => p.id).sort(),
      ["fsm.nogo_awaiting_rejects_verifying", "fsm.nogo_blocked_rejects_complete"],
    );
    assert.equal(failureState.length, 2);
    assert.equal(recoveryState.length, 4);
    assert.deepEqual(
      [...FORMAL_STATE_MACHINE_FAILURE_RECOVERY_CATEGORIES],
      ["failure_state", "recovery_state"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveFormalStateMachineContract();
    const slice = runFormalStateMachineFailureRecoverySlice();

    assert.equal(slice.atom, "P01-B03-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 4);
    assert.equal(slice.matrixValidation.gapAligned, 2);

    for (const category of FORMAL_STATE_MACHINE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listFormalStateMachineProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateFormalStateMachineFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises NO-GO rejection probes without mutating failure states", () => {
    const results = runFormalStateMachineProbes();
    const nogo = results.filter(r => r.id.startsWith("fsm.nogo_"));

    assert.equal(nogo.length, 2);
    assert.ok(nogo.every(r => r.expected === "PASS" && r.actual === "PASS" && r.aligned));
    assert.ok(nogo.every(r => r.detail.includes("rejected=true")));
  });
});

describe("Forge Formal State Machine Evidence — P01-B03-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadFormalStateMachineFixture();
    const contract = getActiveFormalStateMachineContract();
    const probeIds = listFormalStateMachineFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-18T00:00:00.000Z";
    const completedAt = "2026-07-18T00:00:01.000Z";

    const evidence = probeIds.map((probeId, index) => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildFormalStateMachineProbeEvidence(
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
      return buildFormalStateMachineProbeTelemetry(probeId, contractProbe.category, index, index * 0.5);
    });

    const provenance = buildFormalStateMachineProvenance(
      "run-fsm-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P01-B03-A06",
        sliceCategories: FORMAL_STATE_MACHINE_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildFormalStateMachineRunRecord(provenance, evidence, telemetry);
    const validation = validateFormalStateMachineFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 6);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.gap >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBehaviorMapAtom, fixture.sourceBehaviorMap.atom);
  });

  it("records evidence, telemetry and provenance for failure/recovery slice run", () => {
    const contract = getActiveFormalStateMachineContract();
    const record = runFormalStateMachineFailureRecoverySliceWithRecord();
    const validation = validateFormalStateMachineFailureRecoveryRunRecord(record, contract);

    assert.equal(record.evidence.length, 6);
    assert.equal(record.telemetry.length, 6);
    assert.equal(record.provenance.totalProbes, 6);
    assert.equal(record.provenance.sliceAtom, "P01-B03-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_state",
      "recovery_state",
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

  it("records evidence, telemetry and provenance for full formal state machine run", () => {
    const record = runFormalStateMachineProbesWithRecord();
    const validation = validateFormalStateMachineRunRecord(record);

    assert.equal(record.evidence.length, 28);
    assert.equal(record.telemetry.length, 28);
    assert.equal(record.provenance.totalProbes, 28);
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

describe("Forge Formal State Machine Property/Fuzz — P01-B03-A07", () => {
  it("passes structural property checks on canonical contract", () => {
    const contract = getActiveFormalStateMachineContract();
    const result = runFormalStateMachinePropertyChecks(contract);
    assert.equal(result.allPassed, true, result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"));
  });

  it("rejects fuzz-mutated fixtures and corrupted run records", () => {
    const fixture = loadFormalStateMachineFixture();
    const contract = getActiveFormalStateMachineContract();
    const record = runFormalStateMachineProbesWithRecord(fixture);

    const fuzz = runFormalStateMachineFuzzValidation(fixture, contract, 42, 24);
    assert.equal(fuzz.allMutationsRejected, true);

    const runFuzz = runFormalStateMachineRunRecordFuzzValidation(record, contract);
    assert.equal(runFuzz.validBaseline, true);
    assert.equal(runFuzz.mutationsAccepted, 0);
    assert.equal(runFuzz.mutationsRejected, 3);
  });
});

describe("Forge Formal State Machine Regression — P01-B03-A08", () => {
  it("runForgeFormalStateMachineRegressionGate passes on canonical formal state machine matrix", () => {
    const result = runForgeFormalStateMachineRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 28);
    assert.equal(result.probeRegression, null);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("28/28 probes aligned"));
    assert.ok(result.detail.includes("guard:"));
  });

  it("detectFormalStateMachineProbeRegression flags newly misaligned probes", () => {
    const prior = runFormalStateMachineProbesWithRecord();
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

    const report = detectFormalStateMachineProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeFormalStateMachineRegressionGate compares against prior record without false regression", () => {
    const prior = runFormalStateMachineProbesWithRecord();
    const result = runForgeFormalStateMachineRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeFormalStateMachineRegression emits formal_state_machine_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-fsm-regression-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "formal-state-machine" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeFormalStateMachineRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "formal_state_machine_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("28/28 probes aligned"));
    }
  });
});

function formatMismatchReport(
  mismatches: ReturnType<typeof runFormalStateMachineProbes>,
): string {
  if (mismatches.length === 0) return "";
  return mismatches
    .map(m => `${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}
