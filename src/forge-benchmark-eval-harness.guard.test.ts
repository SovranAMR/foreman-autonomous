import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runBenchmarkEvalHarnessProbesWithRecord,
  runForgeBenchmarkEvalRegressionGate,
  loadBenchmarkEvalHarnessFixture,
} from "./forge-benchmark-eval-harness.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildBenchmarkEvalAdversarialGuardScenarios,
  buildBenchmarkEvalProbeEvidence,
  buildBenchmarkEvalProbeTelemetry,
  buildBenchmarkEvalProvenance,
  buildBenchmarkEvalRunRecord,
  detectBenchmarkEvalEvidenceSummaryMismatch,
  detectBenchmarkEvalFalseAlignment,
  getActiveBenchmarkEvalContract,
  getForgeBenchmarkEvalGuardControls,
  listBenchmarkEvalContractProbeIds,
  runBenchmarkEvalAdversarialGuardChecks,
  validateBenchmarkEvalCost,
  validateBenchmarkEvalPerformance,
  validateBenchmarkEvalSafety,
  validateForgeBenchmarkEvalGuard,
} from "./forge-benchmark-eval-harness.js";

describe("Forge Benchmark Eval Harness Guard — P01-B06-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runBenchmarkEvalHarnessProbesWithRecord();
    const adversarial = runBenchmarkEvalAdversarialGuardChecks(record);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const contract = getActiveBenchmarkEvalContract();
    const contractProbe = contract.probes.find(p => p.id === "bench.pipeline_duration_logged")!;
    const falsePassEvidence = buildBenchmarkEvalProbeEvidence(
      "bench.pipeline_duration_logged",
      contractProbe.category,
      "PASS",
      "FAIL",
      true,
      contractProbe.criterion,
      "false pass claim",
      contractProbe.disposition,
      "2026-07-18T22:00:00.000Z",
    );
    const falsePassRecord = buildBenchmarkEvalRunRecord(
      buildBenchmarkEvalProvenance(
        "adv-false-pass",
        loadBenchmarkEvalHarnessFixture(),
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildBenchmarkEvalProbeTelemetry("bench.pipeline_duration_logged", contractProbe.category, 0, 1)],
    );
    assert.ok(detectBenchmarkEvalFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildBenchmarkEvalProbeEvidence(
      "bench.pipeline_duration_logged",
      contractProbe.category,
      "PASS",
      "FAIL",
      false,
      contractProbe.criterion,
      "summary tamper",
      contractProbe.disposition,
      "2026-07-18T22:00:00.000Z",
    );
    const summaryRecord = buildBenchmarkEvalRunRecord(
      buildBenchmarkEvalProvenance(
        "adv-summary",
        loadBenchmarkEvalHarnessFixture(),
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildBenchmarkEvalProbeTelemetry("bench.pipeline_duration_logged", contractProbe.category, 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectBenchmarkEvalEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildBenchmarkEvalAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildBenchmarkEvalAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Benchmark Eval Harness Guard — P01-B06-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical benchmark eval run", () => {
    const record = runBenchmarkEvalHarnessProbesWithRecord();
    const guard = validateForgeBenchmarkEvalGuard(record, { totalCostUsd: 0, llmCalls: 0 });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeBenchmarkEvalGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadBenchmarkEvalHarnessFixture();
    const contract = getActiveBenchmarkEvalContract();
    const probeIds = listBenchmarkEvalContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildBenchmarkEvalProbeEvidence(
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
      return buildBenchmarkEvalProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildBenchmarkEvalRunRecord(
      buildBenchmarkEvalProvenance(
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

    const perfIssues = validateBenchmarkEvalPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateBenchmarkEvalCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadBenchmarkEvalHarnessFixture();
    const contract = getActiveBenchmarkEvalContract();
    const contractProbe = contract.probes.find(p => p.id === "bench.pipeline_duration_logged")!;
    const evidence = buildBenchmarkEvalProbeEvidence(
      "bench.pipeline_duration_logged",
      contractProbe.category,
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      contractProbe.disposition,
    );
    const record = buildBenchmarkEvalRunRecord(
      buildBenchmarkEvalProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [evidence],
      [buildBenchmarkEvalProbeTelemetry("bench.pipeline_duration_logged", contractProbe.category, 0, 1)],
    );

    const safetyIssues = validateBenchmarkEvalSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Benchmark Eval Harness Guard — P01-B06-A09 integration", () => {
  it("runForgeBenchmarkEvalRegressionGate includes guard PASS in detail", () => {
    const result = runForgeBenchmarkEvalRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
  });

  it("orchestrator verifyForgeBenchmarkEvalGuard emits benchmark_eval_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-bench-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "benchmark-eval" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeBenchmarkEvalGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "benchmark_eval_guard",
    );

    assert.equal(result.guard.passed, true);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("guard PASS"));
    }
  });
});
