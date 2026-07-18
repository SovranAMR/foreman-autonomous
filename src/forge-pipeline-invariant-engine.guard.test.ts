import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runPipelineInvariantEngineProbesWithRecord,
  runForgePipelineInvariantEngineRegressionGate,
  loadPipelineInvariantEngineFixture,
} from "./forge-pipeline-invariant-engine-harness.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildPipelineInvariantEngineAdversarialGuardScenarios,
  buildPipelineInvariantEngineProbeEvidence,
  buildPipelineInvariantEngineProbeTelemetry,
  buildPipelineInvariantEngineProvenance,
  buildPipelineInvariantEngineRunRecord,
  detectPipelineInvariantEngineEvidenceSummaryMismatch,
  detectPipelineInvariantEngineFalseAlignment,
  getActivePipelineInvariantEngineContract,
  getForgePipelineInvariantEngineGuardControls,
  listPipelineInvariantEngineContractProbeIds,
  runPipelineInvariantEngineAdversarialGuardChecks,
  validatePipelineInvariantEngineCost,
  validatePipelineInvariantEnginePerformance,
  validatePipelineInvariantEngineSafety,
  validateForgePipelineInvariantEngineGuard,
} from "./forge-pipeline-invariant-engine.js";

describe("Forge Pipeline Invariant Engine Guard — P01-B05-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runPipelineInvariantEngineProbesWithRecord();
    const adversarial = runPipelineInvariantEngineAdversarialGuardChecks(record);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const contract = getActivePipelineInvariantEngineContract();
    const contractProbe = contract.probes.find(p => p.id === "inv.phase_start_end_present")!;
    const falsePassEvidence = buildPipelineInvariantEngineProbeEvidence(
      "inv.phase_start_end_present",
      contractProbe.category,
      "PASS",
      "FAIL",
      true,
      contractProbe.criterion,
      "false pass claim",
      contractProbe.disposition,
      "2026-07-18T22:00:00.000Z",
    );
    const falsePassRecord = buildPipelineInvariantEngineRunRecord(
      buildPipelineInvariantEngineProvenance(
        "adv-false-pass",
        loadPipelineInvariantEngineFixture(),
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildPipelineInvariantEngineProbeTelemetry("inv.phase_start_end_present", contractProbe.category, 0, 1)],
    );
    assert.ok(detectPipelineInvariantEngineFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildPipelineInvariantEngineProbeEvidence(
      "inv.phase_start_end_present",
      contractProbe.category,
      "PASS",
      "FAIL",
      false,
      contractProbe.criterion,
      "summary tamper",
      contractProbe.disposition,
      "2026-07-18T22:00:00.000Z",
    );
    const summaryRecord = buildPipelineInvariantEngineRunRecord(
      buildPipelineInvariantEngineProvenance(
        "adv-summary",
        loadPipelineInvariantEngineFixture(),
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildPipelineInvariantEngineProbeTelemetry("inv.phase_start_end_present", contractProbe.category, 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectPipelineInvariantEngineEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildPipelineInvariantEngineAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildPipelineInvariantEngineAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Pipeline Invariant Engine Guard — P01-B05-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical invariant engine run", () => {
    const record = runPipelineInvariantEngineProbesWithRecord();
    const guard = validateForgePipelineInvariantEngineGuard(record, { totalCostUsd: 0, llmCalls: 0 });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgePipelineInvariantEngineGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadPipelineInvariantEngineFixture();
    const contract = getActivePipelineInvariantEngineContract();
    const probeIds = listPipelineInvariantEngineContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildPipelineInvariantEngineProbeEvidence(
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
      return buildPipelineInvariantEngineProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildPipelineInvariantEngineRunRecord(
      buildPipelineInvariantEngineProvenance(
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

    const perfIssues = validatePipelineInvariantEnginePerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validatePipelineInvariantEngineCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadPipelineInvariantEngineFixture();
    const contract = getActivePipelineInvariantEngineContract();
    const contractProbe = contract.probes.find(p => p.id === "inv.phase_start_end_present")!;
    const evidence = buildPipelineInvariantEngineProbeEvidence(
      "inv.phase_start_end_present",
      contractProbe.category,
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      contractProbe.disposition,
    );
    const record = buildPipelineInvariantEngineRunRecord(
      buildPipelineInvariantEngineProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [evidence],
      [buildPipelineInvariantEngineProbeTelemetry("inv.phase_start_end_present", contractProbe.category, 0, 1)],
    );

    const safetyIssues = validatePipelineInvariantEngineSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Pipeline Invariant Engine Guard — P01-B05-A09 integration", () => {
  it("runForgePipelineInvariantEngineRegressionGate includes guard PASS in detail", () => {
    const result = runForgePipelineInvariantEngineRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
  });

  it("orchestrator verifyForgePipelineInvariantEngineGuard emits pipeline_invariant_engine_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-inv-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "pipeline-invariant-engine" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgePipelineInvariantEngineGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "pipeline_invariant_engine_guard",
    );

    assert.equal(result.guard.passed, true);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("guard PASS"));
    }
  });
});
