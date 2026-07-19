import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadVisionerSynthesisBaseline,
  runForgeVisionerSynthesisRegressionGate,
  runVisionerSynthesisProbesWithRecord,
} from "./forge-p02-visioner-synthesis.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildVisionerSynthesisAdversarialGuardScenarios,
  buildVisionerSynthesisProbeEvidence,
  buildVisionerSynthesisProbeTelemetry,
  buildVisionerSynthesisProvenance,
  buildVisionerSynthesisRunRecord,
  detectVisionerSynthesisEvidenceSummaryMismatch,
  detectVisionerSynthesisFalseAlignment,
  getActiveVisionerSynthesisContract,
  getForgeVisionerSynthesisGuardControls,
  listVisionerSynthesisContractProbeIds,
  runVisionerSynthesisAdversarialGuardChecks,
  validateForgeVisionerSynthesisGuard,
  validateVisionerSynthesisCost,
  validateVisionerSynthesisPerformance,
  validateVisionerSynthesisSafety,
} from "./forge-p02-visioner-synthesis.js";

describe("Forge Visioner Synthesis Guard — P02-B03-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runVisionerSynthesisProbesWithRecord();
    const contract = getActiveVisionerSynthesisContract();
    const adversarial = runVisionerSynthesisAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildVisionerSynthesisProbeEvidence(
      "vsyn.version_tagged",
      "synthesis_versioning",
      "PASS",
      "FAIL",
      true,
      "test",
      "false pass claim",
      "observed",
      "2026-07-19T03:00:00.000Z",
    );
    const fixture = loadVisionerSynthesisBaseline();
    const contract = getActiveVisionerSynthesisContract();
    const falsePassRecord = buildVisionerSynthesisRunRecord(
      buildVisionerSynthesisProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T03:00:00.000Z",
        "2026-07-19T03:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildVisionerSynthesisProbeTelemetry("vsyn.version_tagged", "synthesis_versioning", 0, 1)],
    );
    assert.ok(detectVisionerSynthesisFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildVisionerSynthesisProbeEvidence(
      "vsyn.version_tagged",
      "synthesis_versioning",
      "PASS",
      "FAIL",
      false,
      "test",
      "summary tamper",
      "observed",
      "2026-07-19T03:00:00.000Z",
    );
    const summaryRecord = buildVisionerSynthesisRunRecord(
      buildVisionerSynthesisProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T03:00:00.000Z",
        "2026-07-19T03:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildVisionerSynthesisProbeTelemetry("vsyn.version_tagged", "synthesis_versioning", 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectVisionerSynthesisEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildVisionerSynthesisAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildVisionerSynthesisAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Visioner Synthesis Guard — P02-B03-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical visioner synthesis run", () => {
    const record = runVisionerSynthesisProbesWithRecord();
    const contract = getActiveVisionerSynthesisContract();
    const guard = validateForgeVisionerSynthesisGuard(record, { totalCostUsd: 0, llmCalls: 0, contract });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeVisionerSynthesisGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadVisionerSynthesisBaseline();
    const contract = getActiveVisionerSynthesisContract();
    const probeIds = listVisionerSynthesisContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildVisionerSynthesisProbeEvidence(
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
      return buildVisionerSynthesisProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildVisionerSynthesisRunRecord(
      buildVisionerSynthesisProvenance(
        "perf-test",
        fixture,
        contract,
        "2026-07-19T03:00:00.000Z",
        "2026-07-19T03:00:01.000Z",
        probeIds.length,
      ),
      evidence,
      telemetry,
    );

    const perfIssues = validateVisionerSynthesisPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateVisionerSynthesisCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadVisionerSynthesisBaseline();
    const contract = getActiveVisionerSynthesisContract();
    const evidence = buildVisionerSynthesisProbeEvidence(
      "vsyn.version_tagged",
      "synthesis_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildVisionerSynthesisRunRecord(
      buildVisionerSynthesisProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T03:00:00.000Z",
        "2026-07-19T03:00:01.000Z",
        1,
      ),
      [evidence],
      [buildVisionerSynthesisProbeTelemetry("vsyn.version_tagged", "synthesis_versioning", 0, 1)],
    );

    const safetyIssues = validateVisionerSynthesisSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Visioner Synthesis Guard — P02-B03-A09 integration", () => {
  it("runForgeVisionerSynthesisRegressionGate includes guard PASS in detail", () => {
    const result = runForgeVisionerSynthesisRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.issues.length, 0);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeVisionerSynthesisGuard emits visioner_synthesis_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-synthesis-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-synthesis" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerSynthesisGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_synthesis_guard",
    );

    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.issues.length, 0);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("guard PASS"));
      assert.ok(verification.detail.includes("adversarial=3/3"));
    }
  });
});
