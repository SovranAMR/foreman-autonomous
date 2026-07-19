import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeResearcherRiskTradeoffRegressionGate,
  runResearcherRiskTradeoffProbesWithRecord,
} from "./forge-p04-researcher-risk-tradeoff.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildResearcherRiskTradeoffAdversarialGuardScenarios,
  buildResearcherRiskTradeoffProbeEvidence,
  buildResearcherRiskTradeoffProbeTelemetry,
  buildResearcherRiskTradeoffProvenance,
  buildResearcherRiskTradeoffRunRecord,
  detectResearcherRiskTradeoffEvidenceSummaryMismatch,
  detectResearcherRiskTradeoffFalseAlignment,
  getActiveResearcherRiskTradeoffContract,
  getForgeResearcherRiskTradeoffGuardControls,
  listResearcherRiskTradeoffContractProbeIds,
  loadResearcherRiskTradeoffBaseline,
  runResearcherRiskTradeoffAdversarialGuardChecks,
  validateForgeResearcherRiskTradeoffGuard,
  validateResearcherRiskTradeoffCost,
  validateResearcherRiskTradeoffPerformance,
  validateResearcherRiskTradeoffSafety,
} from "./forge-p04-researcher-risk-tradeoff.js";

describe("Forge Researcher Risk Trade-off Guard — P04-B07-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runResearcherRiskTradeoffProbesWithRecord();
    const contract = getActiveResearcherRiskTradeoffContract();
    const adversarial = runResearcherRiskTradeoffAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildResearcherRiskTradeoffProbeEvidence(
      "rrto.version_tagged",
      "evidence_versioning",
      "PASS",
      "FAIL",
      true,
      "version tagged",
      "false pass claim",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const fixture = loadResearcherRiskTradeoffBaseline();
    const contract = getActiveResearcherRiskTradeoffContract();
    const falsePassRecord = buildResearcherRiskTradeoffRunRecord(
      buildResearcherRiskTradeoffProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [
        buildResearcherRiskTradeoffProbeTelemetry(
          "rrto.version_tagged",
          "evidence_versioning",
          0,
          1,
        ),
      ],
    );
    assert.ok(detectResearcherRiskTradeoffFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildResearcherRiskTradeoffProbeEvidence(
      "rrto.version_tagged",
      "evidence_versioning",
      "PASS",
      "FAIL",
      false,
      "version tagged",
      "summary tamper",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const summaryRecord = buildResearcherRiskTradeoffRunRecord(
      buildResearcherRiskTradeoffProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [
        buildResearcherRiskTradeoffProbeTelemetry(
          "rrto.version_tagged",
          "evidence_versioning",
          0,
          1,
        ),
      ],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectResearcherRiskTradeoffEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildResearcherRiskTradeoffAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildResearcherRiskTradeoffAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Researcher Risk Trade-off Guard — P04-B07-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical risk trade-off run", () => {
    const record = runResearcherRiskTradeoffProbesWithRecord();
    const contract = getActiveResearcherRiskTradeoffContract();
    const guard = validateForgeResearcherRiskTradeoffGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeResearcherRiskTradeoffGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadResearcherRiskTradeoffBaseline();
    const contract = getActiveResearcherRiskTradeoffContract();
    const probeIds = listResearcherRiskTradeoffContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildResearcherRiskTradeoffProbeEvidence(
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
      return buildResearcherRiskTradeoffProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildResearcherRiskTradeoffRunRecord(
      buildResearcherRiskTradeoffProvenance(
        "perf-test",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        probeIds.length,
      ),
      evidence,
      telemetry,
    );

    const perfIssues = validateResearcherRiskTradeoffPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateResearcherRiskTradeoffCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadResearcherRiskTradeoffBaseline();
    const contract = getActiveResearcherRiskTradeoffContract();
    const evidence = buildResearcherRiskTradeoffProbeEvidence(
      "rrto.version_tagged",
      "evidence_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildResearcherRiskTradeoffRunRecord(
      buildResearcherRiskTradeoffProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [evidence],
      [
        buildResearcherRiskTradeoffProbeTelemetry(
          "rrto.version_tagged",
          "evidence_versioning",
          0,
          1,
        ),
      ],
    );

    const safetyIssues = validateResearcherRiskTradeoffSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Researcher Risk Trade-off Guard — P04-B07-A09 integration", () => {
  it("runForgeResearcherRiskTradeoffRegressionGate includes guard PASS in detail", () => {
    const result = runForgeResearcherRiskTradeoffRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeResearcherRiskTradeoffGuard emits researcher_risk_tradeoff_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rrto-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-risk-tradeoff" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherRiskTradeoffGuard();
    const verification = events.find(
      event =>
        event.type === "verification" &&
        event.phase === "researcher_risk_tradeoff_guard",
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
