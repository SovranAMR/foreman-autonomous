import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkerShellProcessAdversarialGuardScenarios,
  buildWorkerShellProcessProbeEvidence,
  buildWorkerShellProcessProbeRunTelemetry,
  buildWorkerShellProcessProvenance,
  buildWorkerShellProcessRunRecord,
  detectWorkerShellProcessEvidenceSummaryMismatch,
  detectWorkerShellProcessFalseAlignment,
  getActiveWorkerShellProcessContract,
  getForgeWorkerShellProcessGuardControls,
  listWorkerShellProcessContractProbeIds,
  loadWorkerShellProcessBaseline,
  runWorkerShellProcessAdversarialGuardChecks,
  runWorkerShellProcessGuardSlice,
  runWorkerShellProcessProbesWithRecord,
  validateForgeWorkerShellProcessGuard,
  validateWorkerShellProcessCost,
  validateWorkerShellProcessPerformance,
  validateWorkerShellProcessSafety,
} from "./forge-p05-worker-shell-process.js";
import {
  runForgeWorkerShellProcessGuardGate,
  runForgeWorkerShellProcessRegressionGate,
} from "./forge-p05-worker-shell-process.probe.js";

describe("Forge Worker Shell Process Guard — P05-B04-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runWorkerShellProcessProbesWithRecord();
    const contract = getActiveWorkerShellProcessContract();
    const adversarial = runWorkerShellProcessAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildWorkerShellProcessProbeEvidence(
      "wsp.version_tagged",
      "shell_versioning",
      "PASS",
      "FAIL",
      true,
      "version tagged",
      "false pass claim",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const fixture = loadWorkerShellProcessBaseline();
    const contract = getActiveWorkerShellProcessContract();
    const falsePassRecord = buildWorkerShellProcessRunRecord(
      buildWorkerShellProcessProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [
        buildWorkerShellProcessProbeRunTelemetry(
          "wsp.version_tagged",
          "shell_versioning",
          0,
          1,
        ),
      ],
    );
    assert.ok(detectWorkerShellProcessFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildWorkerShellProcessProbeEvidence(
      "wsp.version_tagged",
      "shell_versioning",
      "PASS",
      "FAIL",
      false,
      "version tagged",
      "summary tamper",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const summaryRecord = buildWorkerShellProcessRunRecord(
      buildWorkerShellProcessProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [
        buildWorkerShellProcessProbeRunTelemetry(
          "wsp.version_tagged",
          "shell_versioning",
          0,
          1,
        ),
      ],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectWorkerShellProcessEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildWorkerShellProcessAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildWorkerShellProcessAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Worker Shell Process Guard — P05-B04-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical worker shell process run", () => {
    const record = runWorkerShellProcessProbesWithRecord();
    const contract = getActiveWorkerShellProcessContract();
    const guard = validateForgeWorkerShellProcessGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeWorkerShellProcessGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadWorkerShellProcessBaseline();
    const contract = getActiveWorkerShellProcessContract();
    const probeIds = listWorkerShellProcessContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildWorkerShellProcessProbeEvidence(
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
      return buildWorkerShellProcessProbeRunTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildWorkerShellProcessRunRecord(
      buildWorkerShellProcessProvenance(
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

    const perfIssues = validateWorkerShellProcessPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateWorkerShellProcessCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadWorkerShellProcessBaseline();
    const contract = getActiveWorkerShellProcessContract();
    const evidence = buildWorkerShellProcessProbeEvidence(
      "wsp.version_tagged",
      "shell_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildWorkerShellProcessRunRecord(
      buildWorkerShellProcessProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [evidence],
      [
        buildWorkerShellProcessProbeRunTelemetry(
          "wsp.version_tagged",
          "shell_versioning",
          0,
          1,
        ),
      ],
    );

    const safetyIssues = validateWorkerShellProcessSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Worker Shell Process Guard — P05-B04-A09 integration", () => {
  it("runWorkerShellProcessGuardSlice passes on canonical probe matrix", () => {
    const result = runWorkerShellProcessGuardSlice();
    assert.equal(result.atom, "P05-B04-A09");
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard PASS"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("runForgeWorkerShellProcessGuardGate matches guard slice", () => {
    const gate = runForgeWorkerShellProcessGuardGate();
    const slice = runWorkerShellProcessGuardSlice();
    assert.equal(gate.passed, slice.passed);
    assert.equal(gate.guard.passed, slice.guard.passed);
  });

  it("runForgeWorkerShellProcessRegressionGate includes guard PASS in detail", () => {
    const result = runForgeWorkerShellProcessRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });
});
