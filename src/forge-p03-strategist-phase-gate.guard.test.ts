import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadStrategistPhaseGateBaseline,
  runForgeStrategistPhaseGateGuardGate,
  runForgeStrategistPhaseGateRegressionGate,
  runStrategistPhaseGateProbesWithRecord,
} from "./forge-p03-strategist-phase-gate.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildStrategistPhaseGateAdversarialGuardScenarios,
  buildStrategistPhaseGateProbeEvidence,
  buildStrategistPhaseGateProbeTelemetry,
  buildStrategistPhaseGateProvenance,
  buildStrategistPhaseGateRunRecord,
  detectStrategistPhaseGateEvidenceSummaryMismatch,
  detectStrategistPhaseGateFalseAlignment,
  getActiveStrategistPhaseGateContract,
  getForgeStrategistPhaseGateGuardControls,
  runStrategistPhaseGateAdversarialGuardChecks,
  validateForgeStrategistPhaseGateGuard,
  validateStrategistPhaseGateCost,
  validateStrategistPhaseGatePerformance,
  validateStrategistPhaseGateSafety,
} from "./forge-p03-strategist-phase-gate.js";

describe("Forge Strategist Phase Gate Guard — P03-B10-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runStrategistPhaseGateProbesWithRecord();
    const contract = getActiveStrategistPhaseGateContract();
    const adversarial = runStrategistPhaseGateAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildStrategistPhaseGateProbeEvidence(
      "spg.version_tagged",
      "phase_versioning",
      "PASS",
      "FAIL",
      true,
      "test",
      "false pass claim",
      "observed",
      "2026-07-19T09:00:00.000Z",
    );
    const fixture = loadStrategistPhaseGateBaseline();
    const contract = getActiveStrategistPhaseGateContract();
    const falsePassRecord = buildStrategistPhaseGateRunRecord(
      buildStrategistPhaseGateProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T09:00:00.000Z",
        "2026-07-19T09:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildStrategistPhaseGateProbeTelemetry("spg.version_tagged", "phase_versioning", 0, 1)],
    );
    assert.ok(detectStrategistPhaseGateFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildStrategistPhaseGateProbeEvidence(
      "spg.version_tagged",
      "phase_versioning",
      "PASS",
      "FAIL",
      false,
      "test",
      "summary tamper",
      "observed",
      "2026-07-19T09:00:00.000Z",
    );
    const summaryRecord = buildStrategistPhaseGateRunRecord(
      buildStrategistPhaseGateProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T09:00:00.000Z",
        "2026-07-19T09:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildStrategistPhaseGateProbeTelemetry("spg.version_tagged", "phase_versioning", 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectStrategistPhaseGateEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildStrategistPhaseGateAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildStrategistPhaseGateAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Strategist Phase Gate Guard — P03-B10-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical strategist phase gate run", () => {
    const record = runStrategistPhaseGateProbesWithRecord();
    const contract = getActiveStrategistPhaseGateContract();
    const guard = validateForgeStrategistPhaseGateGuard(record, { totalCostUsd: 0, llmCalls: 0, contract });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeStrategistPhaseGateGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadStrategistPhaseGateBaseline();
    const contract = getActiveStrategistPhaseGateContract();
    const probe = contract.probes[0]!;
    const evidence = buildStrategistPhaseGateProbeEvidence(
      probe.id,
      probe.category,
      probe.expected,
      probe.expected,
      true,
      probe.criterion,
      "ok",
      probe.disposition,
    );
    const telemetry = buildStrategistPhaseGateProbeTelemetry(probe.id, probe.category, 0, 10_000);
    const record = buildStrategistPhaseGateRunRecord(
      buildStrategistPhaseGateProvenance(
        "perf-test",
        fixture,
        contract,
        "2026-07-19T09:00:00.000Z",
        "2026-07-19T09:00:01.000Z",
        1,
      ),
      [evidence],
      [telemetry],
    );

    const perfIssues = validateStrategistPhaseGatePerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateStrategistPhaseGateCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadStrategistPhaseGateBaseline();
    const contract = getActiveStrategistPhaseGateContract();
    const evidence = buildStrategistPhaseGateProbeEvidence(
      "spg.version_tagged",
      "phase_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildStrategistPhaseGateRunRecord(
      buildStrategistPhaseGateProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T09:00:00.000Z",
        "2026-07-19T09:00:01.000Z",
        1,
      ),
      [evidence],
      [buildStrategistPhaseGateProbeTelemetry("spg.version_tagged", "phase_versioning", 0, 1)],
    );

    const safetyIssues = validateStrategistPhaseGateSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Strategist Phase Gate Guard — P03-B10-A09 integration", () => {
  it("runForgeStrategistPhaseGateGuardGate passes on canonical strategist phase gate matrix", () => {
    const result = runForgeStrategistPhaseGateGuardGate();
    assert.equal(result.atom, "P03-B10-A09");
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("runForgeStrategistPhaseGateRegressionGate includes guard PASS in detail", () => {
    const result = runForgeStrategistPhaseGateRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeP03StrategistPhaseGateGuard emits strategist_phase_gate_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-strategist-phase-gate-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "strategist-phase-gate" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeP03StrategistPhaseGateGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "strategist_phase_gate_guard",
    );

    assert.equal(result.guard.passed, true);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("guard PASS"));
      assert.ok(verification.detail.includes("adversarial=3/3"));
    }
  });
});
