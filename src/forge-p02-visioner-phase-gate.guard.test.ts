import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadVisionerPhaseGateBaseline,
  runForgeVisionerPhaseGateRegressionGate,
  runVisionerPhaseGateProbesWithRecord,
} from "./forge-p02-visioner-phase-gate.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildVisionerPhaseGateAdversarialGuardScenarios,
  buildVisionerPhaseGateProbeEvidence,
  buildVisionerPhaseGateProbeTelemetry,
  buildVisionerPhaseGateProvenance,
  buildVisionerPhaseGateRunRecord,
  detectVisionerPhaseGateEvidenceSummaryMismatch,
  detectVisionerPhaseGateFalseAlignment,
  getActiveVisionerPhaseGateContract,
  getForgeVisionerPhaseGateGuardControls,
  runVisionerPhaseGateAdversarialGuardChecks,
  validateForgeVisionerPhaseGateGuard,
  validateVisionerPhaseGateCost,
  validateVisionerPhaseGatePerformance,
  validateVisionerPhaseGateSafety,
} from "./forge-p02-visioner-phase-gate.js";

describe("Forge Visioner Phase Gate Guard — P02-B10-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runVisionerPhaseGateProbesWithRecord();
    const contract = getActiveVisionerPhaseGateContract();
    const adversarial = runVisionerPhaseGateAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildVisionerPhaseGateProbeEvidence(
      "vpg.version_tagged",
      "phase_versioning",
      "PASS",
      "FAIL",
      true,
      "test",
      "false pass claim",
      "observed",
      "2026-07-18T22:00:00.000Z",
    );
    const fixture = loadVisionerPhaseGateBaseline();
    const contract = getActiveVisionerPhaseGateContract();
    const falsePassRecord = buildVisionerPhaseGateRunRecord(
      buildVisionerPhaseGateProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildVisionerPhaseGateProbeTelemetry("vpg.version_tagged", "phase_versioning", 0, 1)],
    );
    assert.ok(detectVisionerPhaseGateFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildVisionerPhaseGateProbeEvidence(
      "vpg.version_tagged",
      "phase_versioning",
      "PASS",
      "FAIL",
      false,
      "test",
      "summary tamper",
      "observed",
      "2026-07-18T22:00:00.000Z",
    );
    const summaryRecord = buildVisionerPhaseGateRunRecord(
      buildVisionerPhaseGateProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildVisionerPhaseGateProbeTelemetry("vpg.version_tagged", "phase_versioning", 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectVisionerPhaseGateEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildVisionerPhaseGateAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildVisionerPhaseGateAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Visioner Phase Gate Guard — P02-B10-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical visioner phase gate run", () => {
    const record = runVisionerPhaseGateProbesWithRecord();
    const contract = getActiveVisionerPhaseGateContract();
    const guard = validateForgeVisionerPhaseGateGuard(record, { totalCostUsd: 0, llmCalls: 0, contract });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeVisionerPhaseGateGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadVisionerPhaseGateBaseline();
    const contract = getActiveVisionerPhaseGateContract();
    const probe = contract.probes[0]!;
    const evidence = buildVisionerPhaseGateProbeEvidence(
      probe.id,
      probe.category,
      probe.expected,
      probe.expected,
      true,
      probe.criterion,
      "ok",
      probe.disposition,
    );
    const telemetry = buildVisionerPhaseGateProbeTelemetry(probe.id, probe.category, 0, 10_000);
    const record = buildVisionerPhaseGateRunRecord(
      buildVisionerPhaseGateProvenance(
        "perf-test",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [evidence],
      [telemetry],
    );

    const perfIssues = validateVisionerPhaseGatePerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateVisionerPhaseGateCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadVisionerPhaseGateBaseline();
    const contract = getActiveVisionerPhaseGateContract();
    const evidence = buildVisionerPhaseGateProbeEvidence(
      "vpg.version_tagged",
      "phase_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildVisionerPhaseGateRunRecord(
      buildVisionerPhaseGateProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [evidence],
      [buildVisionerPhaseGateProbeTelemetry("vpg.version_tagged", "phase_versioning", 0, 1)],
    );

    const safetyIssues = validateVisionerPhaseGateSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Visioner Phase Gate Guard — P02-B10-A09 integration", () => {
  it("runForgeVisionerPhaseGateRegressionGate includes guard PASS in detail", () => {
    const result = runForgeVisionerPhaseGateRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeP02VisionerPhaseGateGuard emits visioner_phase_gate_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-phase-gate-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-phase-gate" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeP02VisionerPhaseGateGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_phase_gate_guard",
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
