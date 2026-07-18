import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runPipelineBehaviorMapProbesWithRecord,
  runForgeBehaviorMapRegressionGate,
  loadPipelineBehaviorMapFixture,
} from "./forge-pipeline-behavior-map-harness.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildBehaviorMapAdversarialGuardScenarios,
  buildBehaviorMapProbeEvidence,
  buildBehaviorMapProbeTelemetry,
  buildBehaviorMapProvenance,
  buildBehaviorMapRunRecord,
  detectBehaviorMapEvidenceSummaryMismatch,
  detectBehaviorMapFalseAlignment,
  getActivePipelineBehaviorMapContract,
  getForgeBehaviorMapGuardControls,
  listBehaviorMapProbeIds,
  runBehaviorMapAdversarialGuardChecks,
  validateBehaviorMapCost,
  validateBehaviorMapPerformance,
  validateBehaviorMapSafety,
  validateForgeBehaviorMapGuard,
} from "./forge-pipeline-behavior-map.js";

describe("Forge Behavior Map Guard — P01-B02-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runPipelineBehaviorMapProbesWithRecord();
    const adversarial = runBehaviorMapAdversarialGuardChecks(record);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildBehaviorMapProbeEvidence(
      "map.vision_phase_presence",
      "vision",
      "phase_presence",
      "PASS",
      "FAIL",
      true,
      'orchestrator.ts contains phase_start with phase "vision"',
      "false pass claim",
      "observed",
      "2026-07-18T22:00:00.000Z",
    );
    const falsePassRecord = buildBehaviorMapRunRecord(
      buildBehaviorMapProvenance(
        "adv-false-pass",
        loadPipelineBehaviorMapFixture(),
        getActivePipelineBehaviorMapContract(),
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildBehaviorMapProbeTelemetry("map.vision_phase_presence", "phase_presence", 0, 1)],
    );
    assert.ok(detectBehaviorMapFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildBehaviorMapProbeEvidence(
      "map.vision_phase_presence",
      "vision",
      "phase_presence",
      "PASS",
      "FAIL",
      false,
      'orchestrator.ts contains phase_start with phase "vision"',
      "summary tamper",
      "observed",
      "2026-07-18T22:00:00.000Z",
    );
    const summaryRecord = buildBehaviorMapRunRecord(
      buildBehaviorMapProvenance(
        "adv-summary",
        loadPipelineBehaviorMapFixture(),
        getActivePipelineBehaviorMapContract(),
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildBehaviorMapProbeTelemetry("map.vision_phase_presence", "phase_presence", 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectBehaviorMapEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildBehaviorMapAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildBehaviorMapAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Behavior Map Guard — P01-B02-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical behavior map run", () => {
    const record = runPipelineBehaviorMapProbesWithRecord();
    const guard = validateForgeBehaviorMapGuard(record, { totalCostUsd: 0, llmCalls: 0 });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(guard.metrics.maxProbeDurationMs < getForgeBehaviorMapGuardControls().performance.maxProbeDurationMs);
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadPipelineBehaviorMapFixture();
    const contract = getActivePipelineBehaviorMapContract();
    const probeIds = listBehaviorMapProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildBehaviorMapProbeEvidence(
        id,
        probe.phase,
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
      return buildBehaviorMapProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildBehaviorMapRunRecord(
      buildBehaviorMapProvenance(
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

    const perfIssues = validateBehaviorMapPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateBehaviorMapCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadPipelineBehaviorMapFixture();
    const contract = getActivePipelineBehaviorMapContract();
    const evidence = buildBehaviorMapProbeEvidence(
      "map.vision_phase_presence",
      "vision",
      "phase_presence",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildBehaviorMapRunRecord(
      buildBehaviorMapProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [evidence],
      [buildBehaviorMapProbeTelemetry("map.vision_phase_presence", "phase_presence", 0, 1)],
    );

    const safetyIssues = validateBehaviorMapSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Behavior Map Guard — P01-B02-A09 integration", () => {
  it("runForgeBehaviorMapRegressionGate includes guard PASS in detail", () => {
    const result = runForgeBehaviorMapRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
  });

  it("orchestrator verifyForgeBehaviorMapGuard emits behavior_map_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-behavior-map-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "behavior-map" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeBehaviorMapGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "behavior_map_guard",
    );

    assert.equal(result.guard.passed, true);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("guard PASS"));
    }
  });
});
