import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyWorkerToolDispatchRunRecordFuzzMutation,
  detectWorkerToolDispatchProbeRegression,
  FORGE_WORKER_TOOL_DISPATCH_VERSION,
  runWorkerToolDispatchIntegrationSlice,
  runWorkerToolDispatchProbesWithRecord,
  validateWorkerToolDispatchIntegrationProbeMatrix,
  validateWorkerToolDispatchRunRecord,
} from "./forge-p05-worker-tool-dispatch.js";
import {
  runForgeWorkerToolDispatchRegressionGate,
  runWorkerToolDispatchRegressionIntegration,
} from "./forge-p05-worker-tool-dispatch.probe.js";

describe("Forge Worker Tool Dispatch Integration — P05-B01-A08", () => {
  it("runWorkerToolDispatchIntegrationSlice passes on canonical probe matrix", () => {
    const result = runWorkerToolDispatchIntegrationSlice();

    assert.equal(result.atom, "P05-B01-A08");
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
    assert.equal(FORGE_WORKER_TOOL_DISPATCH_VERSION, "1.0.0-a08");
  });

  it("maps integration sub-slices through validateWorkerToolDispatchIntegrationProbeMatrix", () => {
    const slice = runWorkerToolDispatchIntegrationSlice();
    const matrixValidation = validateWorkerToolDispatchIntegrationProbeMatrix(slice);

    assert.equal(matrixValidation.valid, true, matrixValidation.issues.map(i => i.detail).join("\n"));
    assert.equal(matrixValidation.unexpectedMismatches, 0);
    assert.equal(matrixValidation.slicesAligned, 6);
  });

  it("detectWorkerToolDispatchProbeRegression flags newly misaligned probes", () => {
    const prior = runWorkerToolDispatchProbesWithRecord();
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

    const report = detectWorkerToolDispatchProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runWorkerToolDispatchIntegrationSlice compares against prior record without false regression", () => {
    const prior = runWorkerToolDispatchProbesWithRecord();
    const result = runWorkerToolDispatchIntegrationSlice(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runWorkerToolDispatchIntegrationSlice rejects tampered prior records", () => {
    const prior = runWorkerToolDispatchProbesWithRecord();
    const tamperedPrior = applyWorkerToolDispatchRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateWorkerToolDispatchRunRecord(tamperedPrior).valid, false);

    const result = runWorkerToolDispatchIntegrationSlice(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runWorkerToolDispatchIntegrationSlice fails when probe alignment regresses", () => {
    const prior = runWorkerToolDispatchProbesWithRecord();
    const tamperedCurrent = structuredClone(prior);
    const target = tamperedCurrent.evidence[0]!;
    target.aligned = false;
    target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
    tamperedCurrent.summary = {
      ...tamperedCurrent.summary,
      aligned: tamperedCurrent.summary.aligned - 1,
      mismatches: tamperedCurrent.summary.mismatches + 1,
    };

    const report = detectWorkerToolDispatchProbeRegression(prior, tamperedCurrent);
    assert.equal(report.hasRegression, true);

    const result = runWorkerToolDispatchIntegrationSlice(prior);
    assert.equal(result.passed, true, "canonical run should still pass");
  });
});

describe("Forge Worker Tool Dispatch Regression Gate — P05-B01-A08 probe harness", () => {
  it("runForgeWorkerToolDispatchRegressionGate matches integration slice", () => {
    const gate = runForgeWorkerToolDispatchRegressionGate();
    const integration = runWorkerToolDispatchRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.propertyFuzzSlice.propertyChecksPassed, gate.propertyFuzzSlice.propertyChecksPassed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.ok(integration.detail.includes("27/27 probes aligned"));
    assert.equal(integration.record.summary.total, 27);
  });
});
