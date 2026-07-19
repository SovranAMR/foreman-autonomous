import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkerToolDispatchAdversarialGuardScenarios,
  buildWorkerToolDispatchProbeEvidence,
  buildWorkerToolDispatchProbeRunTelemetry,
  buildWorkerToolDispatchProvenance,
  buildWorkerToolDispatchRunRecord,
  detectWorkerToolDispatchEvidenceSummaryMismatch,
  detectWorkerToolDispatchFalseAlignment,
  getActiveWorkerToolDispatchContract,
  getForgeWorkerToolDispatchGuardControls,
  listWorkerToolDispatchContractProbeIds,
  loadWorkerToolDispatchBaseline,
  runWorkerToolDispatchAdversarialGuardChecks,
  runWorkerToolDispatchGuardSlice,
  runWorkerToolDispatchProbesWithRecord,
  validateForgeWorkerToolDispatchGuard,
  validateWorkerToolDispatchCost,
  validateWorkerToolDispatchPerformance,
  validateWorkerToolDispatchSafety,
} from "./forge-p05-worker-tool-dispatch.js";
import {
  runForgeWorkerToolDispatchGuardGate,
  runForgeWorkerToolDispatchRegressionGate,
} from "./forge-p05-worker-tool-dispatch.probe.js";

describe("Forge Worker Tool Dispatch Guard — P05-B01-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runWorkerToolDispatchProbesWithRecord();
    const contract = getActiveWorkerToolDispatchContract();
    const adversarial = runWorkerToolDispatchAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildWorkerToolDispatchProbeEvidence(
      "wtd.version_tagged",
      "dispatch_versioning",
      "PASS",
      "FAIL",
      true,
      "version tagged",
      "false pass claim",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const fixture = loadWorkerToolDispatchBaseline();
    const contract = getActiveWorkerToolDispatchContract();
    const falsePassRecord = buildWorkerToolDispatchRunRecord(
      buildWorkerToolDispatchProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [
        buildWorkerToolDispatchProbeRunTelemetry(
          "wtd.version_tagged",
          "dispatch_versioning",
          0,
          1,
        ),
      ],
    );
    assert.ok(detectWorkerToolDispatchFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildWorkerToolDispatchProbeEvidence(
      "wtd.version_tagged",
      "dispatch_versioning",
      "PASS",
      "FAIL",
      false,
      "version tagged",
      "summary tamper",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const summaryRecord = buildWorkerToolDispatchRunRecord(
      buildWorkerToolDispatchProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [
        buildWorkerToolDispatchProbeRunTelemetry(
          "wtd.version_tagged",
          "dispatch_versioning",
          0,
          1,
        ),
      ],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectWorkerToolDispatchEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildWorkerToolDispatchAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildWorkerToolDispatchAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Worker Tool Dispatch Guard — P05-B01-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical worker tool dispatch run", () => {
    const record = runWorkerToolDispatchProbesWithRecord();
    const contract = getActiveWorkerToolDispatchContract();
    const guard = validateForgeWorkerToolDispatchGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeWorkerToolDispatchGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadWorkerToolDispatchBaseline();
    const contract = getActiveWorkerToolDispatchContract();
    const probeIds = listWorkerToolDispatchContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildWorkerToolDispatchProbeEvidence(
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
      return buildWorkerToolDispatchProbeRunTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildWorkerToolDispatchRunRecord(
      buildWorkerToolDispatchProvenance(
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

    const perfIssues = validateWorkerToolDispatchPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateWorkerToolDispatchCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadWorkerToolDispatchBaseline();
    const contract = getActiveWorkerToolDispatchContract();
    const evidence = buildWorkerToolDispatchProbeEvidence(
      "wtd.version_tagged",
      "dispatch_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildWorkerToolDispatchRunRecord(
      buildWorkerToolDispatchProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [evidence],
      [
        buildWorkerToolDispatchProbeRunTelemetry(
          "wtd.version_tagged",
          "dispatch_versioning",
          0,
          1,
        ),
      ],
    );

    const safetyIssues = validateWorkerToolDispatchSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Worker Tool Dispatch Guard — P05-B01-A09 integration", () => {
  it("runWorkerToolDispatchGuardSlice passes on canonical probe matrix", () => {
    const result = runWorkerToolDispatchGuardSlice();
    assert.equal(result.atom, "P05-B01-A09");
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard PASS"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("runForgeWorkerToolDispatchGuardGate matches guard slice", () => {
    const gate = runForgeWorkerToolDispatchGuardGate();
    const slice = runWorkerToolDispatchGuardSlice();
    assert.equal(gate.passed, slice.passed);
    assert.equal(gate.guard.passed, slice.guard.passed);
  });

  it("runForgeWorkerToolDispatchRegressionGate includes guard PASS in detail", () => {
    const result = runForgeWorkerToolDispatchRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });
});
