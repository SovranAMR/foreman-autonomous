import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runOrchestratorSeamProbesWithRecord,
  runForgeOrchestratorSeamRegressionGate,
  loadOrchestratorSeamBaseline,
} from "./forge-orchestrator-seam.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildOrchestratorSeamAdversarialGuardScenarios,
  buildOrchestratorSeamProbeEvidence,
  buildOrchestratorSeamProbeTelemetry,
  buildOrchestratorSeamProvenance,
  buildOrchestratorSeamRunRecord,
  detectOrchestratorSeamEvidenceSummaryMismatch,
  detectOrchestratorSeamFalseAlignment,
  getActiveOrchestratorSeamContract,
  getForgeOrchestratorSeamGuardControls,
  listOrchestratorSeamContractProbeIds,
  runOrchestratorSeamAdversarialGuardChecks,
  validateOrchestratorSeamCost,
  validateOrchestratorSeamPerformance,
  validateOrchestratorSeamSafety,
  validateForgeOrchestratorSeamGuard,
} from "./forge-orchestrator-seam.js";

describe("Forge Orchestrator Seam Guard — P01-B09-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runOrchestratorSeamProbesWithRecord();
    const adversarial = runOrchestratorSeamAdversarialGuardChecks(record);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const contract = getActiveOrchestratorSeamContract();
    const contractProbe = contract.probes.find(p => p.id === "oseam.version_tagged")!;
    const falsePassEvidence = buildOrchestratorSeamProbeEvidence(
      "oseam.version_tagged",
      contractProbe.category,
      "PASS",
      "FAIL",
      true,
      contractProbe.criterion,
      "synthetic false pass",
      contractProbe.disposition,
    );
    const violations = detectOrchestratorSeamFalseAlignment({
      provenance: runOrchestratorSeamProbesWithRecord().provenance,
      evidence: [falsePassEvidence],
      telemetry: [],
      summary: { total: 1, aligned: 1, mismatches: 0, byCategory: {} as never, byDisposition: {} as never },
    });
    assert.ok(violations.length > 0);

    const record = runOrchestratorSeamProbesWithRecord();
    const tampered = structuredClone(record);
    tampered.summary = { ...tampered.summary, mismatches: 0, aligned: tampered.summary.total };
    tampered.evidence[0]!.aligned = false;
    assert.ok(detectOrchestratorSeamEvidenceSummaryMismatch(tampered));
  });

  it("validates performance, cost and safety guard domains", () => {
    const controls = getForgeOrchestratorSeamGuardControls();
    const record = runOrchestratorSeamProbesWithRecord();

    assert.deepEqual(validateOrchestratorSeamPerformance(record, controls), []);
    assert.deepEqual(validateOrchestratorSeamCost(0, 0, controls), []);
    assert.deepEqual(validateOrchestratorSeamSafety(record, controls), []);
  });

  it("buildOrchestratorSeamAdversarialGuardScenarios returns three tamper scenarios", () => {
    const scenarios = buildOrchestratorSeamAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.every(s => s.expectRejected === true));
  });
});

describe("Forge Orchestrator Seam Guard — P01-B09-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical orchestrator seam run", () => {
    const record = runOrchestratorSeamProbesWithRecord();
    const guard = validateForgeOrchestratorSeamGuard(record, { totalCostUsd: 0, llmCalls: 0 });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeOrchestratorSeamGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadOrchestratorSeamBaseline();
    const contract = getActiveOrchestratorSeamContract();
    const probeIds = listOrchestratorSeamContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildOrchestratorSeamProbeEvidence(
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
      return buildOrchestratorSeamProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildOrchestratorSeamRunRecord(
      buildOrchestratorSeamProvenance(
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

    const perfIssues = validateOrchestratorSeamPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateOrchestratorSeamCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadOrchestratorSeamBaseline();
    const contract = getActiveOrchestratorSeamContract();
    const contractProbe = contract.probes.find(p => p.id === "oseam.version_tagged")!;
    const evidence = buildOrchestratorSeamProbeEvidence(
      "oseam.version_tagged",
      contractProbe.category,
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      contractProbe.disposition,
    );
    const record = buildOrchestratorSeamRunRecord(
      buildOrchestratorSeamProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [evidence],
      [buildOrchestratorSeamProbeTelemetry("oseam.version_tagged", contractProbe.category, 0, 1)],
    );

    const safetyIssues = validateOrchestratorSeamSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Orchestrator Seam Guard — P01-B09-A09 integration", () => {
  it("runForgeOrchestratorSeamRegressionGate includes guard PASS in detail", () => {
    const result = runForgeOrchestratorSeamRegressionGate();

    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial="));
  });

  it("orchestrator verifyForgeOrchestratorSeamGuard emits orchestrator_seam_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-oseam-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "orchestrator-seam" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeOrchestratorSeamGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "orchestrator_seam_guard",
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
