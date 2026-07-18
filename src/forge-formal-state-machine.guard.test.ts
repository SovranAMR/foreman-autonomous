import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runFormalStateMachineProbesWithRecord,
  runForgeFormalStateMachineRegressionGate,
  loadFormalStateMachineFixture,
} from "./forge-formal-state-machine-harness.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildFormalStateMachineAdversarialGuardScenarios,
  buildFormalStateMachineProbeEvidence,
  buildFormalStateMachineProbeTelemetry,
  buildFormalStateMachineProvenance,
  buildFormalStateMachineRunRecord,
  detectFormalStateMachineEvidenceSummaryMismatch,
  detectFormalStateMachineFalseAlignment,
  getActiveFormalStateMachineContract,
  getForgeFormalStateMachineGuardControls,
  listFormalStateMachineContractProbeIds,
  runFormalStateMachineAdversarialGuardChecks,
  validateFormalStateMachineCost,
  validateFormalStateMachinePerformance,
  validateFormalStateMachineSafety,
  validateForgeFormalStateMachineGuard,
} from "./forge-formal-state-machine.js";

describe("Forge Formal State Machine Guard — P01-B03-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runFormalStateMachineProbesWithRecord();
    const adversarial = runFormalStateMachineAdversarialGuardChecks(record);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildFormalStateMachineProbeEvidence(
      "fsm.invariant_valid_transitions",
      "state_invariant",
      "PASS",
      "FAIL",
      true,
      "canTransition reflects VALID_TRANSITIONS membership",
      "false pass claim",
      "observed",
      "2026-07-18T22:00:00.000Z",
    );
    const falsePassRecord = buildFormalStateMachineRunRecord(
      buildFormalStateMachineProvenance(
        "adv-false-pass",
        loadFormalStateMachineFixture(),
        getActiveFormalStateMachineContract(),
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildFormalStateMachineProbeTelemetry("fsm.invariant_valid_transitions", "state_invariant", 0, 1)],
    );
    assert.ok(detectFormalStateMachineFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildFormalStateMachineProbeEvidence(
      "fsm.invariant_valid_transitions",
      "state_invariant",
      "PASS",
      "FAIL",
      false,
      "canTransition reflects VALID_TRANSITIONS membership",
      "summary tamper",
      "observed",
      "2026-07-18T22:00:00.000Z",
    );
    const summaryRecord = buildFormalStateMachineRunRecord(
      buildFormalStateMachineProvenance(
        "adv-summary",
        loadFormalStateMachineFixture(),
        getActiveFormalStateMachineContract(),
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildFormalStateMachineProbeTelemetry("fsm.invariant_valid_transitions", "state_invariant", 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectFormalStateMachineEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildFormalStateMachineAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildFormalStateMachineAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Formal State Machine Guard — P01-B03-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical formal state machine run", () => {
    const record = runFormalStateMachineProbesWithRecord();
    const guard = validateForgeFormalStateMachineGuard(record, { totalCostUsd: 0, llmCalls: 0 });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeFormalStateMachineGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadFormalStateMachineFixture();
    const contract = getActiveFormalStateMachineContract();
    const probeIds = listFormalStateMachineContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildFormalStateMachineProbeEvidence(
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
      return buildFormalStateMachineProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildFormalStateMachineRunRecord(
      buildFormalStateMachineProvenance(
        "perf-test",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        probeIds.length,
      ),
      evidence,
      telemetry,
    );

    const perfIssues = validateFormalStateMachinePerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateFormalStateMachineCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadFormalStateMachineFixture();
    const contract = getActiveFormalStateMachineContract();
    const evidence = buildFormalStateMachineProbeEvidence(
      "fsm.invariant_valid_transitions",
      "state_invariant",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildFormalStateMachineRunRecord(
      buildFormalStateMachineProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [evidence],
      [buildFormalStateMachineProbeTelemetry("fsm.invariant_valid_transitions", "state_invariant", 0, 1)],
    );

    const safetyIssues = validateFormalStateMachineSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Formal State Machine Guard — P01-B03-A09 integration", () => {
  it("runForgeFormalStateMachineRegressionGate includes guard PASS in detail", () => {
    const result = runForgeFormalStateMachineRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
  });

  it("orchestrator verifyForgeFormalStateMachineGuard emits formal_state_machine_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-fsm-guard-orch-"));
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

    const result = await orchestrator.verifyForgeFormalStateMachineGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "formal_state_machine_guard",
    );

    assert.equal(result.guard.passed, true);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("guard PASS"));
    }
  });
});
