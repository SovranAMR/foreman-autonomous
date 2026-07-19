import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeResearcherQuestionDecompositionRegressionGate,
  runResearcherQuestionDecompositionProbesWithRecord,
} from "./forge-p04-researcher-question-decomposition.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildResearcherQuestionDecompositionAdversarialGuardScenarios,
  buildResearcherQuestionDecompositionProbeEvidence,
  buildResearcherQuestionDecompositionProbeTelemetry,
  buildResearcherQuestionDecompositionProvenance,
  buildResearcherQuestionDecompositionRunRecord,
  detectResearcherQuestionDecompositionEvidenceSummaryMismatch,
  detectResearcherQuestionDecompositionFalseAlignment,
  getActiveResearcherQuestionDecompositionContract,
  getForgeResearcherQuestionDecompositionGuardControls,
  listResearcherQuestionDecompositionContractProbeIds,
  loadResearcherQuestionDecompositionBaseline,
  runResearcherQuestionDecompositionAdversarialGuardChecks,
  validateForgeResearcherQuestionDecompositionGuard,
  validateResearcherQuestionDecompositionCost,
  validateResearcherQuestionDecompositionPerformance,
  validateResearcherQuestionDecompositionSafety,
} from "./forge-p04-researcher-question-decomposition.js";

describe("Forge Researcher Question Decomposition Guard — P04-B01-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runResearcherQuestionDecompositionProbesWithRecord();
    const contract = getActiveResearcherQuestionDecompositionContract();
    const adversarial = runResearcherQuestionDecompositionAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildResearcherQuestionDecompositionProbeEvidence(
      "rques.version_tagged",
      "question_versioning",
      "PASS",
      "FAIL",
      true,
      "test",
      "false pass claim",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const fixture = loadResearcherQuestionDecompositionBaseline();
    const contract = getActiveResearcherQuestionDecompositionContract();
    const falsePassRecord = buildResearcherQuestionDecompositionRunRecord(
      buildResearcherQuestionDecompositionProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [
        buildResearcherQuestionDecompositionProbeTelemetry(
          "rques.question_versioning",
          "question_versioning",
          0,
          1,
        ),
      ],
    );
    assert.ok(detectResearcherQuestionDecompositionFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildResearcherQuestionDecompositionProbeEvidence(
      "rques.version_tagged",
      "question_versioning",
      "PASS",
      "FAIL",
      false,
      "test",
      "summary tamper",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const summaryRecord = buildResearcherQuestionDecompositionRunRecord(
      buildResearcherQuestionDecompositionProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [
        buildResearcherQuestionDecompositionProbeTelemetry(
          "rques.question_versioning",
          "question_versioning",
          0,
          1,
        ),
      ],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectResearcherQuestionDecompositionEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildResearcherQuestionDecompositionAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildResearcherQuestionDecompositionAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Researcher Question Decomposition Guard — P04-B01-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical question decomposition run", () => {
    const record = runResearcherQuestionDecompositionProbesWithRecord();
    const contract = getActiveResearcherQuestionDecompositionContract();
    const guard = validateForgeResearcherQuestionDecompositionGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeResearcherQuestionDecompositionGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadResearcherQuestionDecompositionBaseline();
    const contract = getActiveResearcherQuestionDecompositionContract();
    const probeIds = listResearcherQuestionDecompositionContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildResearcherQuestionDecompositionProbeEvidence(
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
      return buildResearcherQuestionDecompositionProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildResearcherQuestionDecompositionRunRecord(
      buildResearcherQuestionDecompositionProvenance(
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

    const perfIssues = validateResearcherQuestionDecompositionPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateResearcherQuestionDecompositionCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadResearcherQuestionDecompositionBaseline();
    const contract = getActiveResearcherQuestionDecompositionContract();
    const evidence = buildResearcherQuestionDecompositionProbeEvidence(
      "rques.version_tagged",
      "question_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildResearcherQuestionDecompositionRunRecord(
      buildResearcherQuestionDecompositionProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [evidence],
      [
        buildResearcherQuestionDecompositionProbeTelemetry(
          "rques.question_versioning",
          "question_versioning",
          0,
          1,
        ),
      ],
    );

    const safetyIssues = validateResearcherQuestionDecompositionSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Researcher Question Decomposition Guard — P04-B01-A09 integration", () => {
  it("runForgeResearcherQuestionDecompositionRegressionGate includes guard PASS in detail", () => {
    const result = runForgeResearcherQuestionDecompositionRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeResearcherQuestionDecompositionGuard emits researcher_question_decomposition_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-researcher-question-decomposition-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-question-decomposition" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherQuestionDecompositionGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "researcher_question_decomposition_guard",
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
