import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkerFilesystemGroundingAdversarialGuardScenarios,
  buildWorkerFilesystemGroundingProbeEvidence,
  buildWorkerFilesystemGroundingProbeRunTelemetry,
  buildWorkerFilesystemGroundingProvenance,
  buildWorkerFilesystemGroundingRunRecord,
  detectWorkerFilesystemGroundingEvidenceSummaryMismatch,
  detectWorkerFilesystemGroundingFalseAlignment,
  getActiveWorkerFilesystemGroundingContract,
  getForgeWorkerFilesystemGroundingGuardControls,
  listWorkerFilesystemGroundingContractProbeIds,
  loadWorkerFilesystemGroundingBaseline,
  runWorkerFilesystemGroundingAdversarialGuardChecks,
  runWorkerFilesystemGroundingGuardSlice,
  runWorkerFilesystemGroundingProbesWithRecord,
  validateForgeWorkerFilesystemGroundingGuard,
  validateWorkerFilesystemGroundingCost,
  validateWorkerFilesystemGroundingPerformance,
  validateWorkerFilesystemGroundingSafety,
} from "./forge-p05-worker-filesystem-grounding.js";
import {
  runForgeWorkerFilesystemGroundingGuardGate,
  runForgeWorkerFilesystemGroundingRegressionGate,
} from "./forge-p05-worker-filesystem-grounding.probe.js";

describe("Forge Worker Filesystem Grounding Guard — P05-B02-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runWorkerFilesystemGroundingProbesWithRecord();
    const contract = getActiveWorkerFilesystemGroundingContract();
    const adversarial = runWorkerFilesystemGroundingAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildWorkerFilesystemGroundingProbeEvidence(
      "wfg.version_tagged",
      "grounding_versioning",
      "PASS",
      "FAIL",
      true,
      "version tagged",
      "false pass claim",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const fixture = loadWorkerFilesystemGroundingBaseline();
    const contract = getActiveWorkerFilesystemGroundingContract();
    const falsePassRecord = buildWorkerFilesystemGroundingRunRecord(
      buildWorkerFilesystemGroundingProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [
        buildWorkerFilesystemGroundingProbeRunTelemetry(
          "wfg.version_tagged",
          "grounding_versioning",
          0,
          1,
        ),
      ],
    );
    assert.ok(detectWorkerFilesystemGroundingFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildWorkerFilesystemGroundingProbeEvidence(
      "wfg.version_tagged",
      "grounding_versioning",
      "PASS",
      "FAIL",
      false,
      "version tagged",
      "summary tamper",
      "observed",
      "2026-07-19T10:00:00.000Z",
    );
    const summaryRecord = buildWorkerFilesystemGroundingRunRecord(
      buildWorkerFilesystemGroundingProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [
        buildWorkerFilesystemGroundingProbeRunTelemetry(
          "wfg.version_tagged",
          "grounding_versioning",
          0,
          1,
        ),
      ],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectWorkerFilesystemGroundingEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildWorkerFilesystemGroundingAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildWorkerFilesystemGroundingAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Worker Filesystem Grounding Guard — P05-B02-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical filesystem grounding run", () => {
    const record = runWorkerFilesystemGroundingProbesWithRecord();
    const contract = getActiveWorkerFilesystemGroundingContract();
    const guard = validateForgeWorkerFilesystemGroundingGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeWorkerFilesystemGroundingGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadWorkerFilesystemGroundingBaseline();
    const contract = getActiveWorkerFilesystemGroundingContract();
    const probeIds = listWorkerFilesystemGroundingContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildWorkerFilesystemGroundingProbeEvidence(
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
      return buildWorkerFilesystemGroundingProbeRunTelemetry(id, probe.category, index, 15_000);
    });
    const record = buildWorkerFilesystemGroundingRunRecord(
      buildWorkerFilesystemGroundingProvenance(
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

    const perfIssues = validateWorkerFilesystemGroundingPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateWorkerFilesystemGroundingCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadWorkerFilesystemGroundingBaseline();
    const contract = getActiveWorkerFilesystemGroundingContract();
    const evidence = buildWorkerFilesystemGroundingProbeEvidence(
      "wfg.version_tagged",
      "grounding_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildWorkerFilesystemGroundingRunRecord(
      buildWorkerFilesystemGroundingProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T10:00:00.000Z",
        "2026-07-19T10:00:01.000Z",
        1,
      ),
      [evidence],
      [
        buildWorkerFilesystemGroundingProbeRunTelemetry(
          "wfg.version_tagged",
          "grounding_versioning",
          0,
          1,
        ),
      ],
    );

    const safetyIssues = validateWorkerFilesystemGroundingSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Worker Filesystem Grounding Guard — P05-B02-A09 integration", () => {
  it("runWorkerFilesystemGroundingGuardSlice passes on canonical probe matrix", () => {
    const result = runWorkerFilesystemGroundingGuardSlice();
    assert.equal(result.atom, "P05-B02-A09");
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard PASS"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("runForgeWorkerFilesystemGroundingGuardGate matches guard slice", () => {
    const gate = runForgeWorkerFilesystemGroundingGuardGate();
    const slice = runWorkerFilesystemGroundingGuardSlice();
    assert.equal(gate.passed, slice.passed);
    assert.equal(gate.guard.passed, slice.guard.passed);
  });

  it("runForgeWorkerFilesystemGroundingRegressionGate includes guard PASS in detail", () => {
    const result = runForgeWorkerFilesystemGroundingRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });
});
