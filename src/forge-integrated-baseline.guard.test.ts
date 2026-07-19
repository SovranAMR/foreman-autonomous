import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runIntegratedBaselineProbesWithRecord,
  runForgeIntegratedBaselineRegressionGate,
  loadIntegratedBaseline,
} from "./forge-integrated-baseline.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildIntegratedBaselineAdversarialGuardScenarios,
  buildIntegratedBaselineProbeEvidence,
  buildIntegratedBaselineProbeTelemetry,
  buildIntegratedBaselineProvenance,
  buildIntegratedBaselineRunRecord,
  detectIntegratedBaselineEvidenceSummaryMismatch,
  detectIntegratedBaselineFalseAlignment,
  getActiveIntegratedBaselineContract,
  getForgeIntegratedBaselineGuardControls,
  listIntegratedBaselineContractProbeIds,
  runIntegratedBaselineAdversarialGuardChecks,
  validateForgeIntegratedBaselineGuard,
  validateIntegratedBaselineCost,
  validateIntegratedBaselinePerformance,
  validateIntegratedBaselineSafety,
} from "./forge-integrated-baseline.js";

describe("Forge Integrated Baseline Guard — P01-B10-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runIntegratedBaselineProbesWithRecord();
    const adversarial = runIntegratedBaselineAdversarialGuardChecks(record);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const contract = getActiveIntegratedBaselineContract();
    const contractProbe = contract.probes.find(p => p.id === "ibase.version_tagged")!;
    const falsePassEvidence = buildIntegratedBaselineProbeEvidence(
      "ibase.version_tagged",
      contractProbe.category,
      "PASS",
      "FAIL",
      true,
      contractProbe.criterion,
      "synthetic false pass",
      contractProbe.disposition,
    );
    const violations = detectIntegratedBaselineFalseAlignment({
      provenance: runIntegratedBaselineProbesWithRecord().provenance,
      evidence: [falsePassEvidence],
      telemetry: [],
      summary: { total: 1, aligned: 1, mismatches: 0, byCategory: {} as never, byDisposition: {} as never },
    });
    assert.ok(violations.length > 0);

    const record = runIntegratedBaselineProbesWithRecord();
    const tampered = structuredClone(record);
    tampered.summary = { ...tampered.summary, mismatches: 0, aligned: tampered.summary.total };
    tampered.evidence[0]!.aligned = false;
    assert.ok(detectIntegratedBaselineEvidenceSummaryMismatch(tampered));
  });

  it("validates performance, cost and safety guard domains", () => {
    const controls = getForgeIntegratedBaselineGuardControls();
    const record = runIntegratedBaselineProbesWithRecord();

    assert.deepEqual(validateIntegratedBaselinePerformance(record, controls), []);
    assert.deepEqual(validateIntegratedBaselineCost(0, 0, controls), []);
    assert.deepEqual(validateIntegratedBaselineSafety(record, controls), []);
  });

  it("buildIntegratedBaselineAdversarialGuardScenarios returns three tamper scenarios", () => {
    const scenarios = buildIntegratedBaselineAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.every(s => s.expectRejected === true));
  });
});

describe("Forge Integrated Baseline Guard — P01-B10-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical integrated baseline run", () => {
    const record = runIntegratedBaselineProbesWithRecord();
    const guard = validateForgeIntegratedBaselineGuard(record, { totalCostUsd: 0, llmCalls: 0 });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeIntegratedBaselineGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadIntegratedBaseline();
    const contract = getActiveIntegratedBaselineContract();
    const probeIds = listIntegratedBaselineContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildIntegratedBaselineProbeEvidence(
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
      return buildIntegratedBaselineProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildIntegratedBaselineRunRecord(
      buildIntegratedBaselineProvenance(
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

    const perfIssues = validateIntegratedBaselinePerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateIntegratedBaselineCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadIntegratedBaseline();
    const contract = getActiveIntegratedBaselineContract();
    const contractProbe = contract.probes.find(p => p.id === "ibase.version_tagged")!;
    const evidence = buildIntegratedBaselineProbeEvidence(
      "ibase.version_tagged",
      contractProbe.category,
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      contractProbe.disposition,
    );
    const record = buildIntegratedBaselineRunRecord(
      buildIntegratedBaselineProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [evidence],
      [buildIntegratedBaselineProbeTelemetry("ibase.version_tagged", contractProbe.category, 0, 1)],
    );

    const safetyIssues = validateIntegratedBaselineSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Integrated Baseline Guard — P01-B10-A09 integration", () => {
  it("runForgeIntegratedBaselineRegressionGate includes guard PASS in detail", () => {
    const result = runForgeIntegratedBaselineRegressionGate();

    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial="));
  });

  it("orchestrator verifyForgeIntegratedGuard emits integrated_baseline_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-ibase-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "integrated-baseline" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeIntegratedGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "integrated_baseline_guard",
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
