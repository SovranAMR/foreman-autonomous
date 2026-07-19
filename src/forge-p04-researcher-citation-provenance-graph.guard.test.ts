import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeResearcherCitationProvenanceGraphRegressionGate,
  runResearcherCitationProvenanceGraphProbesWithRecord,
} from "./forge-p04-researcher-citation-provenance-graph.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildResearcherCitationProvenanceGraphAdversarialGuardScenarios,
  buildResearcherCitationProvenanceGraphProbeEvidence,
  buildResearcherCitationProvenanceGraphProbeTelemetry,
  buildResearcherCitationProvenanceGraphProvenance,
  buildResearcherCitationProvenanceGraphRunRecord,
  detectResearcherCitationProvenanceGraphEvidenceSummaryMismatch,
  detectResearcherCitationProvenanceGraphFalseAlignment,
  getActiveResearcherCitationProvenanceGraphContract,
  getForgeResearcherCitationProvenanceGraphGuardControls,
  listResearcherCitationProvenanceGraphContractProbeIds,
  loadResearcherCitationProvenanceGraphBaseline,
  runResearcherCitationProvenanceGraphAdversarialGuardChecks,
  validateForgeResearcherCitationProvenanceGraphGuard,
  validateResearcherCitationProvenanceGraphCost,
  validateResearcherCitationProvenanceGraphPerformance,
  validateResearcherCitationProvenanceGraphSafety,
} from "./forge-p04-researcher-citation-provenance-graph.js";

describe("Forge Researcher Citation Provenance Graph Guard — P04-B05-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runResearcherCitationProvenanceGraphProbesWithRecord();
    const contract = getActiveResearcherCitationProvenanceGraphContract();
    const adversarial = runResearcherCitationProvenanceGraphAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildResearcherCitationProvenanceGraphProbeEvidence(
      "rcpg.version_tagged",
      "evidence_versioning",
      "PASS",
      "FAIL",
      true,
      "version tagged",
      "false pass claim",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const fixture = loadResearcherCitationProvenanceGraphBaseline();
    const contract = getActiveResearcherCitationProvenanceGraphContract();
    const falsePassRecord = buildResearcherCitationProvenanceGraphRunRecord(
      buildResearcherCitationProvenanceGraphProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [
        buildResearcherCitationProvenanceGraphProbeTelemetry(
          "rcpg.version_tagged",
          "evidence_versioning",
          0,
          1,
        ),
      ],
    );
    assert.ok(detectResearcherCitationProvenanceGraphFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildResearcherCitationProvenanceGraphProbeEvidence(
      "rcpg.version_tagged",
      "evidence_versioning",
      "PASS",
      "FAIL",
      false,
      "version tagged",
      "summary tamper",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const summaryRecord = buildResearcherCitationProvenanceGraphRunRecord(
      buildResearcherCitationProvenanceGraphProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [
        buildResearcherCitationProvenanceGraphProbeTelemetry(
          "rcpg.version_tagged",
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
    assert.ok(detectResearcherCitationProvenanceGraphEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildResearcherCitationProvenanceGraphAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildResearcherCitationProvenanceGraphAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Researcher Citation Provenance Graph Guard — P04-B05-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical citation graph run", () => {
    const record = runResearcherCitationProvenanceGraphProbesWithRecord();
    const contract = getActiveResearcherCitationProvenanceGraphContract();
    const guard = validateForgeResearcherCitationProvenanceGraphGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeResearcherCitationProvenanceGraphGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadResearcherCitationProvenanceGraphBaseline();
    const contract = getActiveResearcherCitationProvenanceGraphContract();
    const probeIds = listResearcherCitationProvenanceGraphContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildResearcherCitationProvenanceGraphProbeEvidence(
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
      return buildResearcherCitationProvenanceGraphProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildResearcherCitationProvenanceGraphRunRecord(
      buildResearcherCitationProvenanceGraphProvenance(
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

    const perfIssues = validateResearcherCitationProvenanceGraphPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateResearcherCitationProvenanceGraphCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadResearcherCitationProvenanceGraphBaseline();
    const contract = getActiveResearcherCitationProvenanceGraphContract();
    const evidence = buildResearcherCitationProvenanceGraphProbeEvidence(
      "rcpg.version_tagged",
      "evidence_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildResearcherCitationProvenanceGraphRunRecord(
      buildResearcherCitationProvenanceGraphProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [evidence],
      [
        buildResearcherCitationProvenanceGraphProbeTelemetry(
          "rcpg.version_tagged",
          "evidence_versioning",
          0,
          1,
        ),
      ],
    );

    const safetyIssues = validateResearcherCitationProvenanceGraphSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Researcher Citation Provenance Graph Guard — P04-B05-A09 integration", () => {
  it("runForgeResearcherCitationProvenanceGraphRegressionGate includes guard PASS in detail", () => {
    const result = runForgeResearcherCitationProvenanceGraphRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeResearcherCitationProvenanceGraphGuard emits researcher_citation_provenance_graph_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rcpg-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-citation-provenance-graph" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherCitationProvenanceGraphGuard();
    const verification = events.find(
      event =>
        event.type === "verification" &&
        event.phase === "researcher_citation_provenance_graph_guard",
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
