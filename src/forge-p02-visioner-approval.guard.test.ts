import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadVisionerApprovalBaseline,
  runForgeVisionerApprovalRegressionGate,
  runVisionerApprovalProbesWithRecord,
} from "./forge-p02-visioner-approval.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildVisionerApprovalAdversarialGuardScenarios,
  buildVisionerApprovalProbeEvidence,
  buildVisionerApprovalProbeTelemetry,
  buildVisionerApprovalProvenance,
  buildVisionerApprovalRunRecord,
  detectVisionerApprovalEvidenceSummaryMismatch,
  detectVisionerApprovalFalseAlignment,
  getActiveVisionerApprovalContract,
  getForgeVisionerApprovalGuardControls,
  listVisionerApprovalContractProbeIds,
  runVisionerApprovalAdversarialGuardChecks,
  validateForgeVisionerApprovalGuard,
  validateVisionerApprovalCost,
  validateVisionerApprovalPerformance,
  validateVisionerApprovalSafety,
} from "./forge-p02-visioner-approval.js";

describe("Forge Visioner Approval Guard — P02-B09-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runVisionerApprovalProbesWithRecord();
    const contract = getActiveVisionerApprovalContract();
    const adversarial = runVisionerApprovalAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildVisionerApprovalProbeEvidence(
      "vapp.version_tagged",
      "approval_versioning",
      "PASS",
      "FAIL",
      true,
      "test",
      "false pass claim",
      "observed",
      "2026-07-18T22:00:00.000Z",
    );
    const fixture = loadVisionerApprovalBaseline();
    const contract = getActiveVisionerApprovalContract();
    const falsePassRecord = buildVisionerApprovalRunRecord(
      buildVisionerApprovalProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildVisionerApprovalProbeTelemetry("vapp.version_tagged", "approval_versioning", 0, 1)],
    );
    assert.ok(detectVisionerApprovalFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildVisionerApprovalProbeEvidence(
      "vapp.version_tagged",
      "approval_versioning",
      "PASS",
      "FAIL",
      false,
      "test",
      "summary tamper",
      "observed",
      "2026-07-18T22:00:00.000Z",
    );
    const summaryRecord = buildVisionerApprovalRunRecord(
      buildVisionerApprovalProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildVisionerApprovalProbeTelemetry("vapp.version_tagged", "approval_versioning", 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectVisionerApprovalEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildVisionerApprovalAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildVisionerApprovalAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Visioner Approval Guard — P02-B09-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical visioner approval run", () => {
    const record = runVisionerApprovalProbesWithRecord();
    const contract = getActiveVisionerApprovalContract();
    const guard = validateForgeVisionerApprovalGuard(record, { totalCostUsd: 0, llmCalls: 0, contract });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeVisionerApprovalGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadVisionerApprovalBaseline();
    const contract = getActiveVisionerApprovalContract();
    const probeIds = listVisionerApprovalContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildVisionerApprovalProbeEvidence(
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
      return buildVisionerApprovalProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildVisionerApprovalRunRecord(
      buildVisionerApprovalProvenance(
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

    const perfIssues = validateVisionerApprovalPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateVisionerApprovalCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadVisionerApprovalBaseline();
    const contract = getActiveVisionerApprovalContract();
    const evidence = buildVisionerApprovalProbeEvidence(
      "vapp.version_tagged",
      "approval_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildVisionerApprovalRunRecord(
      buildVisionerApprovalProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [evidence],
      [buildVisionerApprovalProbeTelemetry("vapp.version_tagged", "approval_versioning", 0, 1)],
    );

    const safetyIssues = validateVisionerApprovalSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Visioner Approval Guard — P02-B09-A09 integration", () => {
  it("runForgeVisionerApprovalRegressionGate includes guard PASS in detail", () => {
    const result = runForgeVisionerApprovalRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeVisionerApprovalGuard emits visioner_approval_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-approval-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-approval" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerApprovalGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_approval_guard",
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
