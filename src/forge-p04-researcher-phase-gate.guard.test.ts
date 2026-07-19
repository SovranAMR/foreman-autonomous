import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadResearcherPhaseGateBaseline,
  runForgeResearcherPhaseGateGuardGate,
  runForgeResearcherPhaseGateRegressionGate,
  runResearcherPhaseGateProbesWithRecord,
} from "./forge-p04-researcher-phase-gate.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildResearcherPhaseGateAdversarialGuardScenarios,
  buildResearcherPhaseGateProbeEvidence,
  buildResearcherPhaseGateProbeTelemetry,
  buildResearcherPhaseGateProvenance,
  buildResearcherPhaseGateRunRecord,
  detectResearcherPhaseGateEvidenceSummaryMismatch,
  detectResearcherPhaseGateFalseAlignment,
  getActiveResearcherPhaseGateContract,
  getForgeResearcherPhaseGateGuardControls,
  listResearcherPhaseGateContractProbeIds,
  runResearcherPhaseGateAdversarialGuardChecks,
  validateForgeResearcherPhaseGateGuard,
  validateResearcherPhaseGateCost,
  validateResearcherPhaseGatePerformance,
  validateResearcherPhaseGateSafety,
} from "./forge-p04-researcher-phase-gate.js";

describe("Forge Researcher Phase Gate Guard — P04-B10-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runResearcherPhaseGateProbesWithRecord();
    const contract = getActiveResearcherPhaseGateContract();
    const adversarial = runResearcherPhaseGateAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildResearcherPhaseGateProbeEvidence(
      "rpg.version_tagged",
      "phase_versioning",
      "PASS",
      "FAIL",
      true,
      "version tagged",
      "false pass claim",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const fixture = loadResearcherPhaseGateBaseline();
    const contract = getActiveResearcherPhaseGateContract();
    const falsePassRecord = buildResearcherPhaseGateRunRecord(
      buildResearcherPhaseGateProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [
        buildResearcherPhaseGateProbeTelemetry(
          "rpg.version_tagged",
          "phase_versioning",
          0,
          1,
        ),
      ],
    );
    assert.ok(detectResearcherPhaseGateFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildResearcherPhaseGateProbeEvidence(
      "rpg.version_tagged",
      "phase_versioning",
      "PASS",
      "FAIL",
      false,
      "version tagged",
      "summary tamper",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const summaryRecord = buildResearcherPhaseGateRunRecord(
      buildResearcherPhaseGateProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [
        buildResearcherPhaseGateProbeTelemetry(
          "rpg.version_tagged",
          "phase_versioning",
          0,
          1,
        ),
      ],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectResearcherPhaseGateEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildResearcherPhaseGateAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildResearcherPhaseGateAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Researcher Phase Gate Guard — P04-B10-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical researcher phase gate run", () => {
    const record = runResearcherPhaseGateProbesWithRecord();
    const contract = getActiveResearcherPhaseGateContract();
    const guard = validateForgeResearcherPhaseGateGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeResearcherPhaseGateGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadResearcherPhaseGateBaseline();
    const contract = getActiveResearcherPhaseGateContract();
    const probeIds = listResearcherPhaseGateContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildResearcherPhaseGateProbeEvidence(
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
      return buildResearcherPhaseGateProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildResearcherPhaseGateRunRecord(
      buildResearcherPhaseGateProvenance(
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

    const perfIssues = validateResearcherPhaseGatePerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateResearcherPhaseGateCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadResearcherPhaseGateBaseline();
    const contract = getActiveResearcherPhaseGateContract();
    const evidence = buildResearcherPhaseGateProbeEvidence(
      "rpg.version_tagged",
      "phase_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildResearcherPhaseGateRunRecord(
      buildResearcherPhaseGateProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [evidence],
      [
        buildResearcherPhaseGateProbeTelemetry(
          "rpg.version_tagged",
          "phase_versioning",
          0,
          1,
        ),
      ],
    );

    const safetyIssues = validateResearcherPhaseGateSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Researcher Phase Gate Guard — P04-B10-A09 integration", () => {
  it("runForgeResearcherPhaseGateGuardGate passes on canonical researcher phase gate matrix", () => {
    const result = runForgeResearcherPhaseGateGuardGate();
    assert.equal(result.atom, "P04-B10-A09");
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("runForgeResearcherPhaseGateRegressionGate includes guard PASS in detail", () => {
    const result = runForgeResearcherPhaseGateRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeResearcherPhaseGateGuard emits researcher_phase_gate_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rpg-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-phase-gate" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherPhaseGateGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "researcher_phase_gate_guard",
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
