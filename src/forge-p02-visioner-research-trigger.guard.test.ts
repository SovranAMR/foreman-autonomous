import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadVisionerResearchTriggerBaseline,
  runForgeVisionerResearchTriggerRegressionGate,
  runVisionerResearchTriggerProbesWithRecord,
} from "./forge-p02-visioner-research-trigger.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildVisionerResearchTriggerAdversarialGuardScenarios,
  buildVisionerResearchTriggerProbeEvidence,
  buildVisionerResearchTriggerProbeTelemetry,
  buildVisionerResearchTriggerProvenance,
  buildVisionerResearchTriggerRunRecord,
  detectVisionerResearchTriggerEvidenceSummaryMismatch,
  detectVisionerResearchTriggerFalseAlignment,
  getActiveVisionerResearchTriggerContract,
  getForgeVisionerResearchTriggerGuardControls,
  listVisionerResearchTriggerContractProbeIds,
  runVisionerResearchTriggerAdversarialGuardChecks,
  validateForgeVisionerResearchTriggerGuard,
  validateVisionerResearchTriggerCost,
  validateVisionerResearchTriggerPerformance,
  validateVisionerResearchTriggerSafety,
} from "./forge-p02-visioner-research-trigger.js";

describe("Forge Visioner Research Trigger Guard — P02-B05-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runVisionerResearchTriggerProbesWithRecord();
    const contract = getActiveVisionerResearchTriggerContract();
    const adversarial = runVisionerResearchTriggerAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildVisionerResearchTriggerProbeEvidence(
      "vrtr.version_tagged",
      "trigger_versioning",
      "PASS",
      "FAIL",
      true,
      "test",
      "false pass claim",
      "observed",
      "2026-07-18T22:00:00.000Z",
    );
    const fixture = loadVisionerResearchTriggerBaseline();
    const contract = getActiveVisionerResearchTriggerContract();
    const falsePassRecord = buildVisionerResearchTriggerRunRecord(
      buildVisionerResearchTriggerProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildVisionerResearchTriggerProbeTelemetry("vrtr.version_tagged", "trigger_versioning", 0, 1)],
    );
    assert.ok(detectVisionerResearchTriggerFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildVisionerResearchTriggerProbeEvidence(
      "vrtr.version_tagged",
      "trigger_versioning",
      "PASS",
      "FAIL",
      false,
      "test",
      "summary tamper",
      "observed",
      "2026-07-18T22:00:00.000Z",
    );
    const summaryRecord = buildVisionerResearchTriggerRunRecord(
      buildVisionerResearchTriggerProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildVisionerResearchTriggerProbeTelemetry("vrtr.version_tagged", "trigger_versioning", 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectVisionerResearchTriggerEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildVisionerResearchTriggerAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildVisionerResearchTriggerAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Visioner Research Trigger Guard — P02-B05-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical visioner research trigger run", () => {
    const record = runVisionerResearchTriggerProbesWithRecord();
    const contract = getActiveVisionerResearchTriggerContract();
    const guard = validateForgeVisionerResearchTriggerGuard(record, { totalCostUsd: 0, llmCalls: 0, contract });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeVisionerResearchTriggerGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadVisionerResearchTriggerBaseline();
    const contract = getActiveVisionerResearchTriggerContract();
    const probeIds = listVisionerResearchTriggerContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildVisionerResearchTriggerProbeEvidence(
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
      return buildVisionerResearchTriggerProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildVisionerResearchTriggerRunRecord(
      buildVisionerResearchTriggerProvenance(
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

    const perfIssues = validateVisionerResearchTriggerPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateVisionerResearchTriggerCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadVisionerResearchTriggerBaseline();
    const contract = getActiveVisionerResearchTriggerContract();
    const evidence = buildVisionerResearchTriggerProbeEvidence(
      "vrtr.version_tagged",
      "trigger_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildVisionerResearchTriggerRunRecord(
      buildVisionerResearchTriggerProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [evidence],
      [buildVisionerResearchTriggerProbeTelemetry("vrtr.version_tagged", "trigger_versioning", 0, 1)],
    );

    const safetyIssues = validateVisionerResearchTriggerSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Visioner Research Trigger Guard — P02-B05-A09 integration", () => {
  it("runForgeVisionerResearchTriggerRegressionGate includes guard PASS in detail", () => {
    const result = runForgeVisionerResearchTriggerRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeVisionerResearchTriggerGuard emits visioner_research_trigger_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-research-trigger-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-research-trigger" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerResearchTriggerGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_research_trigger_guard",
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
