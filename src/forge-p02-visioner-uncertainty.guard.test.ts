import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadVisionerUncertaintyBaseline,
  runForgeVisionerUncertaintyRegressionGate,
  runVisionerUncertaintyProbesWithRecord,
} from "./forge-p02-visioner-uncertainty.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildVisionerUncertaintyAdversarialGuardScenarios,
  buildVisionerUncertaintyProbeEvidence,
  buildVisionerUncertaintyProbeTelemetry,
  buildVisionerUncertaintyProvenance,
  buildVisionerUncertaintyRunRecord,
  detectVisionerUncertaintyEvidenceSummaryMismatch,
  detectVisionerUncertaintyFalseAlignment,
  getActiveVisionerUncertaintyContract,
  getForgeVisionerUncertaintyGuardControls,
  listVisionerUncertaintyContractProbeIds,
  runVisionerUncertaintyAdversarialGuardChecks,
  validateForgeVisionerUncertaintyGuard,
  validateVisionerUncertaintyCost,
  validateVisionerUncertaintyPerformance,
  validateVisionerUncertaintySafety,
} from "./forge-p02-visioner-uncertainty.js";

describe("Forge Visioner Uncertainty Guard — P02-B06-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runVisionerUncertaintyProbesWithRecord();
    const contract = getActiveVisionerUncertaintyContract();
    const adversarial = runVisionerUncertaintyAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildVisionerUncertaintyProbeEvidence(
      "vunc.version_tagged",
      "uncertainty_versioning",
      "PASS",
      "FAIL",
      true,
      "test",
      "false pass claim",
      "observed",
      "2026-07-18T22:00:00.000Z",
    );
    const fixture = loadVisionerUncertaintyBaseline();
    const contract = getActiveVisionerUncertaintyContract();
    const falsePassRecord = buildVisionerUncertaintyRunRecord(
      buildVisionerUncertaintyProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildVisionerUncertaintyProbeTelemetry("vunc.version_tagged", "uncertainty_versioning", 0, 1)],
    );
    assert.ok(detectVisionerUncertaintyFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildVisionerUncertaintyProbeEvidence(
      "vunc.version_tagged",
      "uncertainty_versioning",
      "PASS",
      "FAIL",
      false,
      "test",
      "summary tamper",
      "observed",
      "2026-07-18T22:00:00.000Z",
    );
    const summaryRecord = buildVisionerUncertaintyRunRecord(
      buildVisionerUncertaintyProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildVisionerUncertaintyProbeTelemetry("vunc.version_tagged", "uncertainty_versioning", 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectVisionerUncertaintyEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildVisionerUncertaintyAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildVisionerUncertaintyAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Visioner Uncertainty Guard — P02-B06-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical visioner uncertainty run", () => {
    const record = runVisionerUncertaintyProbesWithRecord();
    const contract = getActiveVisionerUncertaintyContract();
    const guard = validateForgeVisionerUncertaintyGuard(record, { totalCostUsd: 0, llmCalls: 0, contract });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeVisionerUncertaintyGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadVisionerUncertaintyBaseline();
    const contract = getActiveVisionerUncertaintyContract();
    const probeIds = listVisionerUncertaintyContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildVisionerUncertaintyProbeEvidence(
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
      return buildVisionerUncertaintyProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildVisionerUncertaintyRunRecord(
      buildVisionerUncertaintyProvenance(
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

    const perfIssues = validateVisionerUncertaintyPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateVisionerUncertaintyCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadVisionerUncertaintyBaseline();
    const contract = getActiveVisionerUncertaintyContract();
    const evidence = buildVisionerUncertaintyProbeEvidence(
      "vunc.version_tagged",
      "uncertainty_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildVisionerUncertaintyRunRecord(
      buildVisionerUncertaintyProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [evidence],
      [buildVisionerUncertaintyProbeTelemetry("vunc.version_tagged", "uncertainty_versioning", 0, 1)],
    );

    const safetyIssues = validateVisionerUncertaintySafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Visioner Uncertainty Guard — P02-B06-A09 integration", () => {
  it("runForgeVisionerUncertaintyRegressionGate includes guard PASS in detail", () => {
    const result = runForgeVisionerUncertaintyRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeVisionerUncertaintyGuard emits visioner_uncertainty_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-uncertainty-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-uncertainty" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerUncertaintyGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_uncertainty_guard",
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
