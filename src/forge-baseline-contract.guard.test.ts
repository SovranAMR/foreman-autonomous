import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeBaselineProbesWithRecord,
  runForgeBaselineRegressionGate,
} from "./forge-baseline-harness.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildAdversarialGuardScenarios,
  buildBaselineProvenance,
  buildBaselineRunRecord,
  buildProbeEvidence,
  buildProbeTelemetry,
  detectEvidenceSummaryMismatch,
  detectFalseAlignment,
  getForgeBaselineGuardControls,
  listContractProbeIds,
  runAdversarialGuardChecks,
  validateBaselineCost,
  validateBaselinePerformance,
  validateBaselineSafety,
  validateForgeBaselineGuard,
  getActiveForgeBaselineContract,
} from "./forge-baseline-contract.js";
import { loadForgeBaselineFixture } from "./forge-baseline-harness.js";

describe("Forge Baseline Guard — P01-B01-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", async () => {
    const record = await runForgeBaselineProbesWithRecord();
    const adversarial = runAdversarialGuardChecks(record);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildProbeEvidence(
      "state.valid_pipeline_chain",
      "state",
      "PASS",
      "FAIL",
      true,
      "test",
      "false pass claim",
      "happy",
      "2026-07-18T22:00:00.000Z",
    );
    const falsePassRecord = buildBaselineRunRecord(
      buildBaselineProvenance(
        "adv-false-pass",
        loadForgeBaselineFixture(),
        getActiveForgeBaselineContract(),
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildProbeTelemetry("state.valid_pipeline_chain", "state", 0, 1)],
    );
    assert.ok(detectFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildProbeEvidence(
      "state.valid_pipeline_chain",
      "state",
      "PASS",
      "FAIL",
      false,
      "test",
      "summary tamper",
      "happy",
      "2026-07-18T22:00:00.000Z",
    );
    const summaryRecord = buildBaselineRunRecord(
      buildBaselineProvenance(
        "adv-summary",
        loadForgeBaselineFixture(),
        getActiveForgeBaselineContract(),
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildProbeTelemetry("state.valid_pipeline_chain", "state", 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Baseline Guard — P01-B01-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical baseline run", async () => {
    const record = await runForgeBaselineProbesWithRecord();
    const guard = validateForgeBaselineGuard(record, { totalCostUsd: 0, llmCalls: 0 });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(guard.metrics.maxProbeDurationMs < getForgeBaselineGuardControls().performance.maxProbeDurationMs);
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadForgeBaselineFixture();
    const contract = getActiveForgeBaselineContract();
    const probeIds = listContractProbeIds(contract);
    const evidence = probeIds.map((id, index) => {
      const path = (["state", "tool", "verification", "reviewer", "rollback", "resume"] as const).find(p =>
        contract.paths[p].probes.some(probe => probe.id === id),
      )!;
      const probe = contract.paths[path].probes.find(p => p.id === id)!;
      return buildProbeEvidence(id, path, probe.expected, probe.expected, true, probe.criterion, "ok", probe.disposition);
    });
    const telemetry = probeIds.map((id, index) => {
      const path = (["state", "tool", "verification", "reviewer", "rollback", "resume"] as const).find(p =>
        contract.paths[p].probes.some(probe => probe.id === id),
      )!;
      return buildProbeTelemetry(id, path, index, 10_000);
    });
    const record = buildBaselineRunRecord(
      buildBaselineProvenance(
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

    const perfIssues = validateBaselinePerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateBaselineCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadForgeBaselineFixture();
    const contract = getActiveForgeBaselineContract();
    const evidence = buildProbeEvidence(
      "state.valid_pipeline_chain",
      "state",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "happy",
    );
    const record = buildBaselineRunRecord(
      buildBaselineProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [evidence],
      [buildProbeTelemetry("state.valid_pipeline_chain", "state", 0, 1)],
    );

    const safetyIssues = validateBaselineSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Baseline Guard — P01-B01-A09 integration", () => {
  it("runForgeBaselineRegressionGate includes guard PASS in detail", async () => {
    const result = await runForgeBaselineRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
  });

  it("orchestrator verifyForgeBaselineGuard emits baseline_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "baseline" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeBaselineGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "baseline_guard",
    );

    assert.equal(result.guard.passed, true);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("guard PASS"));
    }
  });
});
