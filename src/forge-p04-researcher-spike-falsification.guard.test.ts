import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeResearcherSpikeFalsificationRegressionGate,
  runResearcherSpikeFalsificationProbesWithRecord,
} from "./forge-p04-researcher-spike-falsification.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildResearcherSpikeFalsificationAdversarialGuardScenarios,
  buildResearcherSpikeFalsificationProbeEvidence,
  buildResearcherSpikeFalsificationProbeTelemetry,
  buildResearcherSpikeFalsificationProvenance,
  buildResearcherSpikeFalsificationRunRecord,
  detectResearcherSpikeFalsificationEvidenceSummaryMismatch,
  detectResearcherSpikeFalsificationFalseAlignment,
  getActiveResearcherSpikeFalsificationContract,
  getForgeResearcherSpikeFalsificationGuardControls,
  listResearcherSpikeFalsificationContractProbeIds,
  loadResearcherSpikeFalsificationBaseline,
  runResearcherSpikeFalsificationAdversarialGuardChecks,
  validateForgeResearcherSpikeFalsificationGuard,
  validateResearcherSpikeFalsificationCost,
  validateResearcherSpikeFalsificationPerformance,
  validateResearcherSpikeFalsificationSafety,
} from "./forge-p04-researcher-spike-falsification.js";

describe("Forge Researcher Spike Falsification Guard — P04-B08-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runResearcherSpikeFalsificationProbesWithRecord();
    const contract = getActiveResearcherSpikeFalsificationContract();
    const adversarial = runResearcherSpikeFalsificationAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildResearcherSpikeFalsificationProbeEvidence(
      "rsf.version_tagged",
      "evidence_versioning",
      "PASS",
      "FAIL",
      true,
      "version tagged",
      "false pass claim",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const fixture = loadResearcherSpikeFalsificationBaseline();
    const contract = getActiveResearcherSpikeFalsificationContract();
    const falsePassRecord = buildResearcherSpikeFalsificationRunRecord(
      buildResearcherSpikeFalsificationProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [
        buildResearcherSpikeFalsificationProbeTelemetry(
          "rsf.version_tagged",
          "evidence_versioning",
          0,
          1,
        ),
      ],
    );
    assert.ok(detectResearcherSpikeFalsificationFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildResearcherSpikeFalsificationProbeEvidence(
      "rsf.version_tagged",
      "evidence_versioning",
      "PASS",
      "FAIL",
      false,
      "version tagged",
      "summary tamper",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const summaryRecord = buildResearcherSpikeFalsificationRunRecord(
      buildResearcherSpikeFalsificationProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [
        buildResearcherSpikeFalsificationProbeTelemetry(
          "rsf.version_tagged",
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
    assert.ok(detectResearcherSpikeFalsificationEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildResearcherSpikeFalsificationAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildResearcherSpikeFalsificationAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Researcher Spike Falsification Guard — P04-B08-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical spike falsification run", () => {
    const record = runResearcherSpikeFalsificationProbesWithRecord();
    const contract = getActiveResearcherSpikeFalsificationContract();
    const guard = validateForgeResearcherSpikeFalsificationGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeResearcherSpikeFalsificationGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadResearcherSpikeFalsificationBaseline();
    const contract = getActiveResearcherSpikeFalsificationContract();
    const probeIds = listResearcherSpikeFalsificationContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildResearcherSpikeFalsificationProbeEvidence(
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
      return buildResearcherSpikeFalsificationProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildResearcherSpikeFalsificationRunRecord(
      buildResearcherSpikeFalsificationProvenance(
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

    const perfIssues = validateResearcherSpikeFalsificationPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateResearcherSpikeFalsificationCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadResearcherSpikeFalsificationBaseline();
    const contract = getActiveResearcherSpikeFalsificationContract();
    const evidence = buildResearcherSpikeFalsificationProbeEvidence(
      "rsf.version_tagged",
      "evidence_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildResearcherSpikeFalsificationRunRecord(
      buildResearcherSpikeFalsificationProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [evidence],
      [
        buildResearcherSpikeFalsificationProbeTelemetry(
          "rsf.version_tagged",
          "evidence_versioning",
          0,
          1,
        ),
      ],
    );

    const safetyIssues = validateResearcherSpikeFalsificationSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Researcher Spike Falsification Guard — P04-B08-A09 integration", () => {
  it("runForgeResearcherSpikeFalsificationRegressionGate includes guard PASS in detail", () => {
    const result = runForgeResearcherSpikeFalsificationRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeResearcherSpikeFalsificationGuard emits researcher_spike_falsification_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rsf-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-spike-falsification" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherSpikeFalsificationGuard();
    const verification = events.find(
      event =>
        event.type === "verification" &&
        event.phase === "researcher_spike_falsification_guard",
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
