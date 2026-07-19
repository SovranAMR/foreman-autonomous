import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runReproducibleFixtureProbesWithRecord,
  runForgeReproducibleFixtureRegressionGate,
  loadReproducibleFixtureBaseline,
} from "./forge-reproducible-fixture.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildReproducibleFixtureAdversarialGuardScenarios,
  buildReproducibleFixtureProbeEvidence,
  buildReproducibleFixtureProbeTelemetry,
  buildReproducibleFixtureProvenance,
  buildReproducibleFixtureRunRecord,
  detectReproducibleFixtureEvidenceSummaryMismatch,
  detectReproducibleFixtureFalseAlignment,
  getActiveReproducibleFixtureContract,
  getForgeReproducibleFixtureGuardControls,
  listReproducibleFixtureContractProbeIds,
  runReproducibleFixtureAdversarialGuardChecks,
  validateReproducibleFixtureCost,
  validateReproducibleFixturePerformance,
  validateReproducibleFixtureSafety,
  validateForgeReproducibleFixtureGuard,
} from "./forge-reproducible-fixture.js";

describe("Forge Reproducible Fixture Guard — P01-B07-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runReproducibleFixtureProbesWithRecord();
    const adversarial = runReproducibleFixtureAdversarialGuardChecks(record);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const contract = getActiveReproducibleFixtureContract();
    const contractProbe = contract.probes.find(p => p.id === "fix.sealed_fixture_files")!;
    const falsePassEvidence = buildReproducibleFixtureProbeEvidence(
      "fix.sealed_fixture_files",
      contractProbe.category,
      "PASS",
      "FAIL",
      true,
      contractProbe.criterion,
      "false pass claim",
      contractProbe.disposition,
      "2026-07-18T22:00:00.000Z",
    );
    const falsePassRecord = buildReproducibleFixtureRunRecord(
      buildReproducibleFixtureProvenance(
        "adv-false-pass",
        loadReproducibleFixtureBaseline(),
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildReproducibleFixtureProbeTelemetry("fix.sealed_fixture_files", contractProbe.category, 0, 1)],
    );
    assert.ok(detectReproducibleFixtureFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildReproducibleFixtureProbeEvidence(
      "fix.sealed_fixture_files",
      contractProbe.category,
      "PASS",
      "FAIL",
      false,
      contractProbe.criterion,
      "summary tamper",
      contractProbe.disposition,
      "2026-07-18T22:00:00.000Z",
    );
    const summaryRecord = buildReproducibleFixtureRunRecord(
      buildReproducibleFixtureProvenance(
        "adv-summary",
        loadReproducibleFixtureBaseline(),
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildReproducibleFixtureProbeTelemetry("fix.sealed_fixture_files", contractProbe.category, 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectReproducibleFixtureEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildReproducibleFixtureAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildReproducibleFixtureAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Reproducible Fixture Guard — P01-B07-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical reproducible fixture run", () => {
    const record = runReproducibleFixtureProbesWithRecord();
    const guard = validateForgeReproducibleFixtureGuard(record, { totalCostUsd: 0, llmCalls: 0 });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeReproducibleFixtureGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadReproducibleFixtureBaseline();
    const contract = getActiveReproducibleFixtureContract();
    const probeIds = listReproducibleFixtureContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildReproducibleFixtureProbeEvidence(
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
      return buildReproducibleFixtureProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildReproducibleFixtureRunRecord(
      buildReproducibleFixtureProvenance(
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

    const perfIssues = validateReproducibleFixturePerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateReproducibleFixtureCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadReproducibleFixtureBaseline();
    const contract = getActiveReproducibleFixtureContract();
    const contractProbe = contract.probes.find(p => p.id === "fix.sealed_fixture_files")!;
    const evidence = buildReproducibleFixtureProbeEvidence(
      "fix.sealed_fixture_files",
      contractProbe.category,
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      contractProbe.disposition,
    );
    const record = buildReproducibleFixtureRunRecord(
      buildReproducibleFixtureProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [evidence],
      [buildReproducibleFixtureProbeTelemetry("fix.sealed_fixture_files", contractProbe.category, 0, 1)],
    );

    const safetyIssues = validateReproducibleFixtureSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Reproducible Fixture Guard — P01-B07-A09 integration", () => {
  it("runForgeReproducibleFixtureRegressionGate includes guard PASS in detail", () => {
    const result = runForgeReproducibleFixtureRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
  });

  it("orchestrator verifyForgeReproducibleFixtureGuard emits reproducible_fixture_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-fix-guard-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "reproducible-fixture" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeReproducibleFixtureGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "reproducible_fixture_guard",
    );

    assert.equal(result.guard.passed, true);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("guard PASS"));
    }
  });
});
