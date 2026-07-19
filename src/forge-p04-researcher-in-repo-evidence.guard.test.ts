import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeResearcherInRepoEvidenceRegressionGate,
  runResearcherInRepoEvidenceProbesWithRecord,
} from "./forge-p04-researcher-in-repo-evidence.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildResearcherInRepoEvidenceAdversarialGuardScenarios,
  buildResearcherInRepoEvidenceProbeEvidence,
  buildResearcherInRepoEvidenceProbeTelemetry,
  buildResearcherInRepoEvidenceProvenance,
  buildResearcherInRepoEvidenceRunRecord,
  detectResearcherInRepoEvidenceEvidenceSummaryMismatch,
  detectResearcherInRepoEvidenceFalseAlignment,
  getActiveResearcherInRepoEvidenceContract,
  getForgeResearcherInRepoEvidenceGuardControls,
  listResearcherInRepoEvidenceContractProbeIds,
  loadResearcherInRepoEvidenceBaseline,
  runResearcherInRepoEvidenceAdversarialGuardChecks,
  validateForgeResearcherInRepoEvidenceGuard,
  validateResearcherInRepoEvidenceCost,
  validateResearcherInRepoEvidencePerformance,
  validateResearcherInRepoEvidenceSafety,
} from "./forge-p04-researcher-in-repo-evidence.js";

describe("Forge Researcher In-Repo Evidence Guard — P04-B02-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runResearcherInRepoEvidenceProbesWithRecord();
    const contract = getActiveResearcherInRepoEvidenceContract();
    const adversarial = runResearcherInRepoEvidenceAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildResearcherInRepoEvidenceProbeEvidence(
      "riev.version_tagged",
      "repo_signal",
      "PASS",
      "FAIL",
      true,
      "version tagged",
      "false pass claim",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const fixture = loadResearcherInRepoEvidenceBaseline();
    const contract = getActiveResearcherInRepoEvidenceContract();
    const falsePassRecord = buildResearcherInRepoEvidenceRunRecord(
      buildResearcherInRepoEvidenceProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [
        buildResearcherInRepoEvidenceProbeTelemetry(
          "riev.version_tagged",
          "repo_signal",
          0,
          1,
        ),
      ],
    );
    assert.ok(detectResearcherInRepoEvidenceFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildResearcherInRepoEvidenceProbeEvidence(
      "riev.version_tagged",
      "repo_signal",
      "PASS",
      "FAIL",
      false,
      "version tagged",
      "summary tamper",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const summaryRecord = buildResearcherInRepoEvidenceRunRecord(
      buildResearcherInRepoEvidenceProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [
        buildResearcherInRepoEvidenceProbeTelemetry(
          "riev.version_tagged",
          "repo_signal",
          0,
          1,
        ),
      ],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectResearcherInRepoEvidenceEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildResearcherInRepoEvidenceAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildResearcherInRepoEvidenceAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Researcher In-Repo Evidence Guard — P04-B02-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical in-repo evidence run", () => {
    const record = runResearcherInRepoEvidenceProbesWithRecord();
    const contract = getActiveResearcherInRepoEvidenceContract();
    const guard = validateForgeResearcherInRepoEvidenceGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeResearcherInRepoEvidenceGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadResearcherInRepoEvidenceBaseline();
    const contract = getActiveResearcherInRepoEvidenceContract();
    const probeIds = listResearcherInRepoEvidenceContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildResearcherInRepoEvidenceProbeEvidence(
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
      return buildResearcherInRepoEvidenceProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildResearcherInRepoEvidenceRunRecord(
      buildResearcherInRepoEvidenceProvenance(
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

    const perfIssues = validateResearcherInRepoEvidencePerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateResearcherInRepoEvidenceCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadResearcherInRepoEvidenceBaseline();
    const contract = getActiveResearcherInRepoEvidenceContract();
    const evidence = buildResearcherInRepoEvidenceProbeEvidence(
      "riev.version_tagged",
      "repo_signal",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildResearcherInRepoEvidenceRunRecord(
      buildResearcherInRepoEvidenceProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [evidence],
      [
        buildResearcherInRepoEvidenceProbeTelemetry(
          "riev.version_tagged",
          "repo_signal",
          0,
          1,
        ),
      ],
    );

    const safetyIssues = validateResearcherInRepoEvidenceSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Researcher In-Repo Evidence Guard — P04-B02-A09 integration", () => {
  it("runForgeResearcherInRepoEvidenceRegressionGate includes guard PASS in detail", () => {
    const result = runForgeResearcherInRepoEvidenceRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeResearcherInRepoEvidenceGuard emits researcher_in_repo_evidence_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-riev-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-in-repo-evidence" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherInRepoEvidenceGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "researcher_in_repo_evidence_guard",
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
