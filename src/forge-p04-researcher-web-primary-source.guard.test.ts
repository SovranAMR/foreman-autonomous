import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeResearcherWebPrimarySourceRegressionGate,
  runResearcherWebPrimarySourceProbesWithRecord,
} from "./forge-p04-researcher-web-primary-source.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildResearcherWebPrimarySourceAdversarialGuardScenarios,
  buildResearcherWebPrimarySourceProbeEvidence,
  buildResearcherWebPrimarySourceProbeTelemetry,
  buildResearcherWebPrimarySourceProvenance,
  buildResearcherWebPrimarySourceRunRecord,
  detectResearcherWebPrimarySourceEvidenceSummaryMismatch,
  detectResearcherWebPrimarySourceFalseAlignment,
  getActiveResearcherWebPrimarySourceContract,
  getForgeResearcherWebPrimarySourceGuardControls,
  listResearcherWebPrimarySourceContractProbeIds,
  loadResearcherWebPrimarySourceBaseline,
  runResearcherWebPrimarySourceAdversarialGuardChecks,
  validateForgeResearcherWebPrimarySourceGuard,
  validateResearcherWebPrimarySourceCost,
  validateResearcherWebPrimarySourcePerformance,
  validateResearcherWebPrimarySourceSafety,
} from "./forge-p04-researcher-web-primary-source.js";

describe("Forge Researcher Web Primary-Source Guard — P04-B03-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runResearcherWebPrimarySourceProbesWithRecord();
    const contract = getActiveResearcherWebPrimarySourceContract();
    const adversarial = runResearcherWebPrimarySourceAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildResearcherWebPrimarySourceProbeEvidence(
      "rwps.version_tagged",
      "web_signal",
      "PASS",
      "FAIL",
      true,
      "version tagged",
      "false pass claim",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const fixture = loadResearcherWebPrimarySourceBaseline();
    const contract = getActiveResearcherWebPrimarySourceContract();
    const falsePassRecord = buildResearcherWebPrimarySourceRunRecord(
      buildResearcherWebPrimarySourceProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [
        buildResearcherWebPrimarySourceProbeTelemetry(
          "rwps.version_tagged",
          "web_signal",
          0,
          1,
        ),
      ],
    );
    assert.ok(detectResearcherWebPrimarySourceFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildResearcherWebPrimarySourceProbeEvidence(
      "rwps.version_tagged",
      "web_signal",
      "PASS",
      "FAIL",
      false,
      "version tagged",
      "summary tamper",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const summaryRecord = buildResearcherWebPrimarySourceRunRecord(
      buildResearcherWebPrimarySourceProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [
        buildResearcherWebPrimarySourceProbeTelemetry(
          "rwps.version_tagged",
          "web_signal",
          0,
          1,
        ),
      ],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectResearcherWebPrimarySourceEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildResearcherWebPrimarySourceAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildResearcherWebPrimarySourceAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Researcher Web Primary-Source Guard — P04-B03-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical web primary-source run", () => {
    const record = runResearcherWebPrimarySourceProbesWithRecord();
    const contract = getActiveResearcherWebPrimarySourceContract();
    const guard = validateForgeResearcherWebPrimarySourceGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeResearcherWebPrimarySourceGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadResearcherWebPrimarySourceBaseline();
    const contract = getActiveResearcherWebPrimarySourceContract();
    const probeIds = listResearcherWebPrimarySourceContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildResearcherWebPrimarySourceProbeEvidence(
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
      return buildResearcherWebPrimarySourceProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildResearcherWebPrimarySourceRunRecord(
      buildResearcherWebPrimarySourceProvenance(
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

    const perfIssues = validateResearcherWebPrimarySourcePerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateResearcherWebPrimarySourceCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadResearcherWebPrimarySourceBaseline();
    const contract = getActiveResearcherWebPrimarySourceContract();
    const evidence = buildResearcherWebPrimarySourceProbeEvidence(
      "rwps.version_tagged",
      "web_signal",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildResearcherWebPrimarySourceRunRecord(
      buildResearcherWebPrimarySourceProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [evidence],
      [
        buildResearcherWebPrimarySourceProbeTelemetry(
          "rwps.version_tagged",
          "web_signal",
          0,
          1,
        ),
      ],
    );

    const safetyIssues = validateResearcherWebPrimarySourceSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Researcher Web Primary-Source Guard — P04-B03-A09 integration", () => {
  it("runForgeResearcherWebPrimarySourceRegressionGate includes guard PASS in detail", () => {
    const result = runForgeResearcherWebPrimarySourceRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeResearcherWebPrimarySourceGuard emits researcher_web_primary_source_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rwps-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-web-primary-source" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherWebPrimarySourceGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "researcher_web_primary_source_guard",
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
