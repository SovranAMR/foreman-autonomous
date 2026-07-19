import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeResearcherPhaseGateRegressionGate,
  runResearcherPhaseGateRegressionIntegration,
  runResearcherPhaseGateProbesWithRecord,
} from "./forge-p04-researcher-phase-gate.probe.js";
import {
  detectResearcherPhaseGateProbeRegression,
  applyResearcherPhaseGateRunRecordFuzzMutation,
  validateResearcherPhaseGateRunRecord,
} from "./forge-p04-researcher-phase-gate.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Researcher Phase Gate Regression — P04-B10-A08", () => {
  it("runForgeResearcherPhaseGateRegressionGate passes on canonical phase gate matrix", () => {
    const result = runForgeResearcherPhaseGateRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 24);
    assert.equal(result.probeRegression, null);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.propertyFuzzSlice.propertyChecksPassed, true);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("24/24 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("runForgeResearcherPhaseGateRegressionGate guard passes on canonical phase gate matrix", () => {
    const result = runForgeResearcherPhaseGateRegressionGate();
    assert.equal(result.guard.passed, true, result.guard.issues.map(i => i.detail).join("; "));
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
    assert.equal(result.guard.metrics.adversarialScenariosTotal, 3);
  });

  it("runResearcherPhaseGateRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeResearcherPhaseGateRegressionGate();
    const integration = runResearcherPhaseGateRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.propertyFuzzSlice.propertyChecksPassed, gate.propertyFuzzSlice.propertyChecksPassed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.ok(integration.detail.includes("24/24 probes aligned"));
    assert.equal(integration.record.summary.total, 24);
  });

  it("detectResearcherPhaseGateProbeRegression flags newly misaligned probes", () => {
    const prior = runResearcherPhaseGateProbesWithRecord();
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

    const report = detectResearcherPhaseGateProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeResearcherPhaseGateRegressionGate rejects tampered prior record", () => {
    const prior = runResearcherPhaseGateProbesWithRecord();
    const tamperedPrior = applyResearcherPhaseGateRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateResearcherPhaseGateRunRecord(tamperedPrior).valid, false);

    const result = runForgeResearcherPhaseGateRegressionGate(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false, result.detail);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runForgeResearcherPhaseGateRegressionGate compares against prior record without false regression", () => {
    const prior = runResearcherPhaseGateProbesWithRecord();
    const result = runForgeResearcherPhaseGateRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeResearcherPhaseGateRegression emits researcher_phase_gate_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rpg-regression-orch-"));
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

    const result = await orchestrator.verifyForgeResearcherPhaseGateRegression();
    const verification = events.find(
      event =>
        event.type === "verification" &&
        event.phase === "researcher_phase_gate_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("24/24 probes aligned"));
    }
  });
});
