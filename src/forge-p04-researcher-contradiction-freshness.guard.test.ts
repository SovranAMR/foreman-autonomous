import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeResearcherContradictionFreshnessRegressionGate,
  runResearcherContradictionFreshnessProbesWithRecord,
} from "./forge-p04-researcher-contradiction-freshness.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildResearcherContradictionFreshnessAdversarialGuardScenarios,
  buildResearcherContradictionFreshnessProbeEvidence,
  buildResearcherContradictionFreshnessProbeTelemetry,
  buildResearcherContradictionFreshnessProvenance,
  buildResearcherContradictionFreshnessRunRecord,
  detectResearcherContradictionFreshnessEvidenceSummaryMismatch,
  detectResearcherContradictionFreshnessFalseAlignment,
  getActiveResearcherContradictionFreshnessContract,
  getForgeResearcherContradictionFreshnessGuardControls,
  listResearcherContradictionFreshnessContractProbeIds,
  loadResearcherContradictionFreshnessBaseline,
  runResearcherContradictionFreshnessAdversarialGuardChecks,
  validateForgeResearcherContradictionFreshnessGuard,
  validateResearcherContradictionFreshnessCost,
  validateResearcherContradictionFreshnessPerformance,
  validateResearcherContradictionFreshnessSafety,
} from "./forge-p04-researcher-contradiction-freshness.js";

describe("Forge Researcher Contradiction Freshness Guard — P04-B06-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runResearcherContradictionFreshnessProbesWithRecord();
    const contract = getActiveResearcherContradictionFreshnessContract();
    const adversarial = runResearcherContradictionFreshnessAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildResearcherContradictionFreshnessProbeEvidence(
      "rcfr.version_tagged",
      "evidence_versioning",
      "PASS",
      "FAIL",
      true,
      "version tagged",
      "false pass claim",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const fixture = loadResearcherContradictionFreshnessBaseline();
    const contract = getActiveResearcherContradictionFreshnessContract();
    const falsePassRecord = buildResearcherContradictionFreshnessRunRecord(
      buildResearcherContradictionFreshnessProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [
        buildResearcherContradictionFreshnessProbeTelemetry(
          "rcfr.version_tagged",
          "evidence_versioning",
          0,
          1,
        ),
      ],
    );
    assert.ok(detectResearcherContradictionFreshnessFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildResearcherContradictionFreshnessProbeEvidence(
      "rcfr.version_tagged",
      "evidence_versioning",
      "PASS",
      "FAIL",
      false,
      "version tagged",
      "summary tamper",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const summaryRecord = buildResearcherContradictionFreshnessRunRecord(
      buildResearcherContradictionFreshnessProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [
        buildResearcherContradictionFreshnessProbeTelemetry(
          "rcfr.version_tagged",
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
    assert.ok(detectResearcherContradictionFreshnessEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildResearcherContradictionFreshnessAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildResearcherContradictionFreshnessAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Researcher Contradiction Freshness Guard — P04-B06-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical contradiction freshness run", () => {
    const record = runResearcherContradictionFreshnessProbesWithRecord();
    const contract = getActiveResearcherContradictionFreshnessContract();
    const guard = validateForgeResearcherContradictionFreshnessGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeResearcherContradictionFreshnessGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadResearcherContradictionFreshnessBaseline();
    const contract = getActiveResearcherContradictionFreshnessContract();
    const probeIds = listResearcherContradictionFreshnessContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildResearcherContradictionFreshnessProbeEvidence(
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
      return buildResearcherContradictionFreshnessProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildResearcherContradictionFreshnessRunRecord(
      buildResearcherContradictionFreshnessProvenance(
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

    const perfIssues = validateResearcherContradictionFreshnessPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateResearcherContradictionFreshnessCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadResearcherContradictionFreshnessBaseline();
    const contract = getActiveResearcherContradictionFreshnessContract();
    const evidence = buildResearcherContradictionFreshnessProbeEvidence(
      "rcfr.version_tagged",
      "evidence_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildResearcherContradictionFreshnessRunRecord(
      buildResearcherContradictionFreshnessProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [evidence],
      [
        buildResearcherContradictionFreshnessProbeTelemetry(
          "rcfr.version_tagged",
          "evidence_versioning",
          0,
          1,
        ),
      ],
    );

    const safetyIssues = validateResearcherContradictionFreshnessSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Researcher Contradiction Freshness Guard — P04-B06-A09 integration", () => {
  it("runForgeResearcherContradictionFreshnessRegressionGate includes guard PASS in detail", () => {
    const result = runForgeResearcherContradictionFreshnessRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeResearcherContradictionFreshnessGuard emits researcher_contradiction_freshness_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rcfr-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-contradiction-freshness" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherContradictionFreshnessGuard();
    const verification = events.find(
      event =>
        event.type === "verification" &&
        event.phase === "researcher_contradiction_freshness_guard",
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
