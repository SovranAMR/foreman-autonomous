import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeResearcherSpikeFalsificationRegressionGate,
  runResearcherSpikeFalsificationRegressionIntegration,
  runResearcherSpikeFalsificationProbesWithRecord,
} from "./forge-p04-researcher-spike-falsification.probe.js";
import {
  detectResearcherSpikeFalsificationProbeRegression,
  runResearcherSpikeFalsificationForgeRegression,
  applyResearcherSpikeFalsificationRunRecordFuzzMutation,
  validateResearcherSpikeFalsificationRunRecord,
} from "./forge-p04-researcher-spike-falsification.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Researcher Spike Falsification Regression — P04-B08-A08", () => {
  it("runForgeResearcherSpikeFalsificationRegressionGate passes on canonical spike falsification matrix", () => {
    const result = runForgeResearcherSpikeFalsificationRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 23);
    assert.equal(result.probeRegression, null);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.propertyFuzzSlice.propertyChecksPassed, true);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("23/23 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("runForgeResearcherSpikeFalsificationRegressionGate guard passes on canonical spike falsification matrix", () => {
    const result = runForgeResearcherSpikeFalsificationRegressionGate();
    assert.equal(result.guard.passed, true, result.guard.issues.map(i => i.detail).join("; "));
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
    assert.equal(result.guard.metrics.adversarialScenariosTotal, 3);
  });

  it("runResearcherSpikeFalsificationRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeResearcherSpikeFalsificationRegressionGate();
    const integration = runResearcherSpikeFalsificationRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.propertyFuzzSlice.propertyChecksPassed, gate.propertyFuzzSlice.propertyChecksPassed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.ok(integration.detail.includes("23/23 probes aligned"));
    assert.equal(integration.record.summary.total, 23);
  });

  it("detectResearcherSpikeFalsificationProbeRegression flags newly misaligned probes", () => {
    const prior = runResearcherSpikeFalsificationProbesWithRecord();
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

    const report = detectResearcherSpikeFalsificationProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeResearcherSpikeFalsificationRegressionGate rejects tampered prior record", () => {
    const prior = runResearcherSpikeFalsificationProbesWithRecord();
    const tamperedPrior = applyResearcherSpikeFalsificationRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateResearcherSpikeFalsificationRunRecord(tamperedPrior).valid, false);

    const result = runForgeResearcherSpikeFalsificationRegressionGate(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false, result.detail);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runForgeResearcherSpikeFalsificationRegressionGate compares against prior record without false regression", () => {
    const prior = runResearcherSpikeFalsificationProbesWithRecord();
    const result = runForgeResearcherSpikeFalsificationRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runResearcherSpikeFalsificationForgeRegression rejects probe alignment regression", () => {
    const prior = runResearcherSpikeFalsificationProbesWithRecord();
    const current = structuredClone(prior);
    const target = current.evidence.find(item => item.aligned);
    assert.ok(target);
    target!.aligned = false;
    target!.actual = target!.expected === "PASS" ? "FAIL" : "PASS";
    current.summary = {
      ...current.summary,
      aligned: current.summary.aligned - 1,
      mismatches: current.summary.mismatches + 1,
    };

    const report = detectResearcherSpikeFalsificationProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);

    const gate = runResearcherSpikeFalsificationForgeRegression(prior);
    assert.equal(gate.passed, true);
  });

  it("orchestrator verifyForgeResearcherSpikeFalsificationRegression emits researcher_spike_falsification_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rsf-regression-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-spike-falsification" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherSpikeFalsificationRegression();
    const verification = events.find(
      event =>
        event.type === "verification" &&
        event.phase === "researcher_spike_falsification_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("23/23 probes aligned"));
    }
  });
});
