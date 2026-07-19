import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeResearcherWebPrimarySourceRegressionGate,
  runResearcherWebPrimarySourceRegressionIntegration,
  runResearcherWebPrimarySourceProbesWithRecord,
} from "./forge-p04-researcher-web-primary-source.probe.js";
import {
  detectResearcherWebPrimarySourceProbeRegression,
  runResearcherWebPrimarySourceForgeRegression,
  applyResearcherWebPrimarySourceRunRecordFuzzMutation,
  validateResearcherWebPrimarySourceRunRecord,
} from "./forge-p04-researcher-web-primary-source.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Researcher Web Primary-Source Regression — P04-B03-A08", () => {
  it("runForgeResearcherWebPrimarySourceRegressionGate passes on canonical web primary-source matrix", () => {
    const result = runForgeResearcherWebPrimarySourceRegressionGate();

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

  it("runForgeResearcherWebPrimarySourceRegressionGate guard passes on canonical web primary-source matrix", () => {
    const result = runForgeResearcherWebPrimarySourceRegressionGate();
    assert.equal(result.guard.passed, true, result.guard.issues.map(i => i.detail).join("; "));
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
    assert.equal(result.guard.metrics.adversarialScenariosTotal, 3);
  });

  it("runResearcherWebPrimarySourceRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeResearcherWebPrimarySourceRegressionGate();
    const integration = runResearcherWebPrimarySourceRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.propertyFuzzSlice.propertyChecksPassed, gate.propertyFuzzSlice.propertyChecksPassed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.ok(integration.detail.includes("23/23 probes aligned"));
    assert.equal(integration.record.summary.total, 23);
  });

  it("detectResearcherWebPrimarySourceProbeRegression flags newly misaligned probes", () => {
    const prior = runResearcherWebPrimarySourceProbesWithRecord();
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

    const report = detectResearcherWebPrimarySourceProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeResearcherWebPrimarySourceRegressionGate rejects tampered prior record", () => {
    const prior = runResearcherWebPrimarySourceProbesWithRecord();
    const tamperedPrior = applyResearcherWebPrimarySourceRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateResearcherWebPrimarySourceRunRecord(tamperedPrior).valid, false);

    const result = runForgeResearcherWebPrimarySourceRegressionGate(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false, result.detail);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runForgeResearcherWebPrimarySourceRegressionGate compares against prior record without false regression", () => {
    const prior = runResearcherWebPrimarySourceProbesWithRecord();
    const result = runForgeResearcherWebPrimarySourceRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runResearcherWebPrimarySourceForgeRegression rejects probe alignment regression", () => {
    const prior = runResearcherWebPrimarySourceProbesWithRecord();
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

    const report = detectResearcherWebPrimarySourceProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);

    const gate = runResearcherWebPrimarySourceForgeRegression(prior);
    assert.equal(gate.passed, true);
  });

  it("orchestrator verifyForgeResearcherWebPrimarySourceRegression emits researcher_web_primary_source_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rwps-regression-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-web-primary-source" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherWebPrimarySourceRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "researcher_web_primary_source_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("23/23 probes aligned"));
    }
  });
});
