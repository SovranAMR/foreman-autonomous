import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkerEditEngineAdversarialGuardScenarios,
  buildWorkerEditEngineProbeEvidence,
  buildWorkerEditEngineProbeRunTelemetry,
  buildWorkerEditEngineProvenance,
  buildWorkerEditEngineRunRecord,
  detectWorkerEditEngineEvidenceSummaryMismatch,
  detectWorkerEditEngineFalseAlignment,
  getActiveWorkerEditEngineContract,
  getForgeWorkerEditEngineGuardControls,
  listWorkerEditEngineContractProbeIds,
  loadWorkerEditEngineBaseline,
  runWorkerEditEngineAdversarialGuardChecks,
  runWorkerEditEngineGuardSlice,
  runWorkerEditEngineProbesWithRecord,
  validateForgeWorkerEditEngineGuard,
  validateWorkerEditEngineCost,
  validateWorkerEditEnginePerformance,
  validateWorkerEditEngineSafety,
} from "./forge-p05-worker-edit-engine.js";
import {
  runForgeWorkerEditEngineGuardGate,
  runForgeWorkerEditEngineRegressionGate,
} from "./forge-p05-worker-edit-engine.probe.js";

describe("Forge Worker Edit Engine Guard — P05-B03-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runWorkerEditEngineProbesWithRecord();
    const contract = getActiveWorkerEditEngineContract();
    const adversarial = runWorkerEditEngineAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildWorkerEditEngineProbeEvidence(
      "wee.version_tagged",
      "edit_versioning",
      "PASS",
      "FAIL",
      true,
      "version tagged",
      "false pass claim",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const fixture = loadWorkerEditEngineBaseline();
    const contract = getActiveWorkerEditEngineContract();
    const falsePassRecord = buildWorkerEditEngineRunRecord(
      buildWorkerEditEngineProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [
        buildWorkerEditEngineProbeRunTelemetry(
          "wee.version_tagged",
          "edit_versioning",
          0,
          1,
        ),
      ],
    );
    assert.ok(detectWorkerEditEngineFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildWorkerEditEngineProbeEvidence(
      "wee.version_tagged",
      "edit_versioning",
      "PASS",
      "FAIL",
      false,
      "version tagged",
      "summary tamper",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const summaryRecord = buildWorkerEditEngineRunRecord(
      buildWorkerEditEngineProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [
        buildWorkerEditEngineProbeRunTelemetry(
          "wee.version_tagged",
          "edit_versioning",
          0,
          1,
        ),
      ],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectWorkerEditEngineEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildWorkerEditEngineAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildWorkerEditEngineAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Worker Edit Engine Guard — P05-B03-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical edit engine run", () => {
    const record = runWorkerEditEngineProbesWithRecord();
    const contract = getActiveWorkerEditEngineContract();
    const guard = validateForgeWorkerEditEngineGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeWorkerEditEngineGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadWorkerEditEngineBaseline();
    const contract = getActiveWorkerEditEngineContract();
    const probeIds = listWorkerEditEngineContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildWorkerEditEngineProbeEvidence(
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
      return buildWorkerEditEngineProbeRunTelemetry(id, probe.category, index, 15_000);
    });
    const record = buildWorkerEditEngineRunRecord(
      buildWorkerEditEngineProvenance(
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

    const perfIssues = validateWorkerEditEnginePerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateWorkerEditEngineCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadWorkerEditEngineBaseline();
    const contract = getActiveWorkerEditEngineContract();
    const evidence = buildWorkerEditEngineProbeEvidence(
      "wee.version_tagged",
      "edit_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildWorkerEditEngineRunRecord(
      buildWorkerEditEngineProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [evidence],
      [
        buildWorkerEditEngineProbeRunTelemetry(
          "wee.version_tagged",
          "edit_versioning",
          0,
          1,
        ),
      ],
    );

    const safetyIssues = validateWorkerEditEngineSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Worker Edit Engine Guard — P05-B03-A09 integration", () => {
  it("runWorkerEditEngineGuardSlice passes on canonical probe matrix", () => {
    const result = runWorkerEditEngineGuardSlice();
    assert.equal(result.atom, "P05-B03-A09");
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard PASS"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("runForgeWorkerEditEngineGuardGate matches guard slice", () => {
    const gate = runForgeWorkerEditEngineGuardGate();
    const slice = runWorkerEditEngineGuardSlice();
    assert.equal(gate.passed, slice.passed);
    assert.equal(gate.guard.passed, slice.guard.passed);
  });

  it("runForgeWorkerEditEngineRegressionGate includes guard PASS in detail", () => {
    const result = runForgeWorkerEditEngineRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });
});
