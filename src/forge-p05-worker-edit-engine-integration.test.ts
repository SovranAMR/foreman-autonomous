import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyWorkerEditEngineRunRecordFuzzMutation,
  detectWorkerEditEngineProbeRegression,
  FORGE_WORKER_EDIT_ENGINE_VERSION,
  runWorkerEditEngineIntegrationSlice,
  runWorkerEditEngineProbesWithRecord,
  validateWorkerEditEngineIntegrationProbeMatrix,
  validateWorkerEditEngineRunRecord,
} from "./forge-p05-worker-edit-engine.js";
import {
  runForgeWorkerEditEngineRegressionGate,
  runWorkerEditEngineRegressionIntegration,
} from "./forge-p05-worker-edit-engine.probe.js";

describe("Forge Worker Edit Engine Integration — P05-B03-A08", () => {
  it("runWorkerEditEngineIntegrationSlice passes on canonical probe matrix", () => {
    const result = runWorkerEditEngineIntegrationSlice();

    assert.equal(result.atom, "P05-B03-A08");
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
    assert.equal(FORGE_WORKER_EDIT_ENGINE_VERSION, "1.0.0-a08");
  });

  it("maps integration sub-slices through validateWorkerEditEngineIntegrationProbeMatrix", () => {
    const slice = runWorkerEditEngineIntegrationSlice();
    const matrixValidation = validateWorkerEditEngineIntegrationProbeMatrix(slice);

    assert.equal(matrixValidation.valid, true, matrixValidation.issues.map(i => i.detail).join("\n"));
    assert.equal(matrixValidation.unexpectedMismatches, 0);
    assert.equal(matrixValidation.slicesAligned, 6);
  });

  it("detectWorkerEditEngineProbeRegression flags newly misaligned probes", () => {
    const prior = runWorkerEditEngineProbesWithRecord();
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

    const report = detectWorkerEditEngineProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runWorkerEditEngineIntegrationSlice compares against prior record without false regression", () => {
    const prior = runWorkerEditEngineProbesWithRecord();
    const result = runWorkerEditEngineIntegrationSlice(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runWorkerEditEngineIntegrationSlice rejects tampered prior records", () => {
    const prior = runWorkerEditEngineProbesWithRecord();
    const tamperedPrior = applyWorkerEditEngineRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateWorkerEditEngineRunRecord(tamperedPrior).valid, false);

    const result = runWorkerEditEngineIntegrationSlice(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runWorkerEditEngineIntegrationSlice fails when probe alignment regresses", () => {
    const prior = runWorkerEditEngineProbesWithRecord();
    const tamperedCurrent = structuredClone(prior);
    const target = tamperedCurrent.evidence[0]!;
    target.aligned = false;
    target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
    tamperedCurrent.summary = {
      ...tamperedCurrent.summary,
      aligned: tamperedCurrent.summary.aligned - 1,
      mismatches: tamperedCurrent.summary.mismatches + 1,
    };

    const report = detectWorkerEditEngineProbeRegression(prior, tamperedCurrent);
    assert.equal(report.hasRegression, true);

    const result = runWorkerEditEngineIntegrationSlice(prior);
    assert.equal(result.passed, true, "canonical run should still pass");
  });
});

describe("Forge Worker Edit Engine Regression Gate — P05-B03-A08 probe harness", () => {
  it("runForgeWorkerEditEngineRegressionGate matches integration slice", () => {
    const gate = runForgeWorkerEditEngineRegressionGate();
    const integration = runWorkerEditEngineRegressionIntegration();

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
