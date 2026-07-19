import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyWorkerShellProcessRunRecordFuzzMutation,
  detectWorkerShellProcessProbeRegression,
  FORGE_WORKER_SHELL_PROCESS_VERSION,
  runWorkerShellProcessIntegrationSlice,
  runWorkerShellProcessProbesWithRecord,
  validateWorkerShellProcessIntegrationProbeMatrix,
  validateWorkerShellProcessRunRecord,
} from "./forge-p05-worker-shell-process.js";
import {
  runForgeWorkerShellProcessRegressionGate,
  runWorkerShellProcessRegressionIntegration,
} from "./forge-p05-worker-shell-process.probe.js";

describe("Forge Worker Shell Process Integration — P05-B04-A08", () => {
  it("runWorkerShellProcessIntegrationSlice passes on canonical probe matrix", () => {
    const result = runWorkerShellProcessIntegrationSlice();

    assert.equal(result.atom, "P05-B04-A08");
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 27);
    assert.equal(result.probeRegression, null);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.boundarySlice.matrixValid, true);
    assert.equal(result.boundarySlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.failureRecoverySlice.matrixValid, true);
    assert.equal(result.failureRecoverySlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.evidenceSlice.matrixValid, true);
    assert.equal(result.evidenceSlice.recordValid, true);
    assert.equal(result.propertyFuzzSlice.propertyChecksPassed, true);
    assert.equal(result.propertyFuzzSlice.contractFuzzRejected, true);
    assert.equal(result.propertyFuzzSlice.runRecordFuzzRejected, true);
    assert.equal(result.matrixValid, true);
    assert.equal(result.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.matrixValidation.slicesAligned, 6);
    assert.ok(result.detail.includes("27/27 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.equal(FORGE_WORKER_SHELL_PROCESS_VERSION, "1.0.0-a08");
  });

  it("maps integration sub-slices through validateWorkerShellProcessIntegrationProbeMatrix", () => {
    const slice = runWorkerShellProcessIntegrationSlice();
    const matrixValidation = validateWorkerShellProcessIntegrationProbeMatrix(slice);

    assert.equal(matrixValidation.valid, true, matrixValidation.issues.map(i => i.detail).join("\n"));
    assert.equal(matrixValidation.unexpectedMismatches, 0);
    assert.equal(matrixValidation.slicesAligned, 6);
  });

  it("detectWorkerShellProcessProbeRegression flags newly misaligned probes", () => {
    const prior = runWorkerShellProcessProbesWithRecord();
    const current = structuredClone(prior);
    const target = current.evidence.find(item => item.aligned);
    assert.ok(target, "expected at least one aligned probe");

    target!.aligned = false;
    target!.actual = target!.expected === "PASS" ? "FAIL" : "PASS";
    current.summary = {
      ...current.summary,
      aligned: current.summary.aligned - 1,
      mismatches: current.summary.mismatches + 1,
    };

    const report = detectWorkerShellProcessProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runWorkerShellProcessIntegrationSlice compares against prior record without false regression", () => {
    const prior = runWorkerShellProcessProbesWithRecord();
    const result = runWorkerShellProcessIntegrationSlice(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runWorkerShellProcessIntegrationSlice rejects tampered prior records", () => {
    const prior = runWorkerShellProcessProbesWithRecord();
    const tamperedPrior = applyWorkerShellProcessRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateWorkerShellProcessRunRecord(tamperedPrior).valid, false);

    const result = runWorkerShellProcessIntegrationSlice(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runWorkerShellProcessIntegrationSlice fails when probe alignment regresses", () => {
    const prior = runWorkerShellProcessProbesWithRecord();
    const tamperedCurrent = structuredClone(prior);
    const target = tamperedCurrent.evidence[0]!;
    target.aligned = false;
    target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
    tamperedCurrent.summary = {
      ...tamperedCurrent.summary,
      aligned: tamperedCurrent.summary.aligned - 1,
      mismatches: tamperedCurrent.summary.mismatches + 1,
    };

    const report = detectWorkerShellProcessProbeRegression(prior, tamperedCurrent);
    assert.equal(report.hasRegression, true);

    const result = runWorkerShellProcessIntegrationSlice(prior);
    assert.equal(result.passed, true, "canonical run should still pass");
  });
});

describe("Forge Worker Shell Process Regression Gate — P05-B04-A08 probe harness", () => {
  it("runForgeWorkerShellProcessRegressionGate matches integration slice", () => {
    const gate = runForgeWorkerShellProcessRegressionGate();
    const integration = runWorkerShellProcessRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(
      integration.propertyFuzzSlice.propertyChecksPassed,
      gate.propertyFuzzSlice.propertyChecksPassed,
    );
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.ok(integration.detail.includes("27/27 probes aligned"));
    assert.equal(integration.guard.passed, true);
    assert.ok(integration.detail.includes("guard:"));
    assert.equal(integration.record.summary.total, 27);
  });
});
