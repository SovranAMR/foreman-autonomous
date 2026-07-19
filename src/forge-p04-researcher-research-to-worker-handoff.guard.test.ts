import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeResearcherResearchToWorkerHandoffRegressionGate,
  runResearcherResearchToWorkerHandoffProbesWithRecord,
} from "./forge-p04-researcher-research-to-worker-handoff.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildResearcherResearchToWorkerHandoffAdversarialGuardScenarios,
  buildResearcherResearchToWorkerHandoffProbeEvidence,
  buildResearcherResearchToWorkerHandoffProbeTelemetry,
  buildResearcherResearchToWorkerHandoffProvenance,
  buildResearcherResearchToWorkerHandoffRunRecord,
  detectResearcherResearchToWorkerHandoffEvidenceSummaryMismatch,
  detectResearcherResearchToWorkerHandoffFalseAlignment,
  getActiveResearcherResearchToWorkerHandoffContract,
  getForgeResearcherResearchToWorkerHandoffGuardControls,
  listResearcherResearchToWorkerHandoffContractProbeIds,
  loadResearcherResearchToWorkerHandoffBaseline,
  runResearcherResearchToWorkerHandoffAdversarialGuardChecks,
  validateForgeResearcherResearchToWorkerHandoffGuard,
  validateResearcherResearchToWorkerHandoffCost,
  validateResearcherResearchToWorkerHandoffPerformance,
  validateResearcherResearchToWorkerHandoffSafety,
} from "./forge-p04-researcher-research-to-worker-handoff.js";

describe("Forge Researcher Research-to-Worker Handoff Guard — P04-B09-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runResearcherResearchToWorkerHandoffProbesWithRecord();
    const contract = getActiveResearcherResearchToWorkerHandoffContract();
    const adversarial = runResearcherResearchToWorkerHandoffAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildResearcherResearchToWorkerHandoffProbeEvidence(
      "rtwh.version_tagged",
      "evidence_versioning",
      "PASS",
      "FAIL",
      true,
      "version tagged",
      "false pass claim",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const fixture = loadResearcherResearchToWorkerHandoffBaseline();
    const contract = getActiveResearcherResearchToWorkerHandoffContract();
    const falsePassRecord = buildResearcherResearchToWorkerHandoffRunRecord(
      buildResearcherResearchToWorkerHandoffProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [
        buildResearcherResearchToWorkerHandoffProbeTelemetry(
          "rtwh.version_tagged",
          "evidence_versioning",
          0,
          1,
        ),
      ],
    );
    assert.ok(detectResearcherResearchToWorkerHandoffFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildResearcherResearchToWorkerHandoffProbeEvidence(
      "rtwh.version_tagged",
      "evidence_versioning",
      "PASS",
      "FAIL",
      false,
      "version tagged",
      "summary tamper",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const summaryRecord = buildResearcherResearchToWorkerHandoffRunRecord(
      buildResearcherResearchToWorkerHandoffProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [
        buildResearcherResearchToWorkerHandoffProbeTelemetry(
          "rtwh.version_tagged",
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
    assert.ok(detectResearcherResearchToWorkerHandoffEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildResearcherResearchToWorkerHandoffAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildResearcherResearchToWorkerHandoffAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Researcher Research-to-Worker Handoff Guard — P04-B09-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical research-to-worker handoff run", () => {
    const record = runResearcherResearchToWorkerHandoffProbesWithRecord();
    const contract = getActiveResearcherResearchToWorkerHandoffContract();
    const guard = validateForgeResearcherResearchToWorkerHandoffGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeResearcherResearchToWorkerHandoffGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadResearcherResearchToWorkerHandoffBaseline();
    const contract = getActiveResearcherResearchToWorkerHandoffContract();
    const probeIds = listResearcherResearchToWorkerHandoffContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildResearcherResearchToWorkerHandoffProbeEvidence(
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
      return buildResearcherResearchToWorkerHandoffProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildResearcherResearchToWorkerHandoffRunRecord(
      buildResearcherResearchToWorkerHandoffProvenance(
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

    const perfIssues = validateResearcherResearchToWorkerHandoffPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateResearcherResearchToWorkerHandoffCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadResearcherResearchToWorkerHandoffBaseline();
    const contract = getActiveResearcherResearchToWorkerHandoffContract();
    const evidence = buildResearcherResearchToWorkerHandoffProbeEvidence(
      "rtwh.version_tagged",
      "evidence_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildResearcherResearchToWorkerHandoffRunRecord(
      buildResearcherResearchToWorkerHandoffProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [evidence],
      [
        buildResearcherResearchToWorkerHandoffProbeTelemetry(
          "rtwh.version_tagged",
          "evidence_versioning",
          0,
          1,
        ),
      ],
    );

    const safetyIssues = validateResearcherResearchToWorkerHandoffSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Researcher Research-to-Worker Handoff Guard — P04-B09-A09 integration", () => {
  it("runForgeResearcherResearchToWorkerHandoffRegressionGate includes guard PASS in detail", () => {
    const result = runForgeResearcherResearchToWorkerHandoffRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeResearcherResearchToWorkerHandoffGuard emits researcher_research_to_worker_handoff_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rtwh-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-research-to-worker-handoff" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherResearchToWorkerHandoffGuard();
    const verification = events.find(
      event =>
        event.type === "verification" &&
        event.phase === "researcher_research_to_worker_handoff_guard",
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
