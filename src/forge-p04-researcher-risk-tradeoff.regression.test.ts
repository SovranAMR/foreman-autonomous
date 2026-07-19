import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeResearcherRiskTradeoffRegressionGate,
  runResearcherRiskTradeoffRegressionIntegration,
  runResearcherRiskTradeoffProbesWithRecord,
} from "./forge-p04-researcher-risk-tradeoff.probe.js";
import {
  detectResearcherRiskTradeoffProbeRegression,
  runResearcherRiskTradeoffForgeRegression,
  applyResearcherRiskTradeoffRunRecordFuzzMutation,
  validateResearcherRiskTradeoffRunRecord,
} from "./forge-p04-researcher-risk-tradeoff.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Researcher Risk Trade-off Regression — P04-B07-A08", () => {
  it("runForgeResearcherRiskTradeoffRegressionGate passes on canonical risk trade-off matrix", () => {
    const result = runForgeResearcherRiskTradeoffRegressionGate();

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

  it("runForgeResearcherRiskTradeoffRegressionGate guard passes on canonical risk trade-off matrix", () => {
    const result = runForgeResearcherRiskTradeoffRegressionGate();
    assert.equal(result.guard.passed, true, result.guard.issues.map(i => i.detail).join("; "));
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
    assert.equal(result.guard.metrics.adversarialScenariosTotal, 3);
  });

  it("runResearcherRiskTradeoffRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeResearcherRiskTradeoffRegressionGate();
    const integration = runResearcherRiskTradeoffRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.propertyFuzzSlice.propertyChecksPassed, gate.propertyFuzzSlice.propertyChecksPassed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.ok(integration.detail.includes("23/23 probes aligned"));
    assert.equal(integration.record.summary.total, 23);
  });

  it("detectResearcherRiskTradeoffProbeRegression flags newly misaligned probes", () => {
    const prior = runResearcherRiskTradeoffProbesWithRecord();
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

    const report = detectResearcherRiskTradeoffProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeResearcherRiskTradeoffRegressionGate rejects tampered prior record", () => {
    const prior = runResearcherRiskTradeoffProbesWithRecord();
    const tamperedPrior = applyResearcherRiskTradeoffRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateResearcherRiskTradeoffRunRecord(tamperedPrior).valid, false);

    const result = runForgeResearcherRiskTradeoffRegressionGate(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false, result.detail);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runForgeResearcherRiskTradeoffRegressionGate compares against prior record without false regression", () => {
    const prior = runResearcherRiskTradeoffProbesWithRecord();
    const result = runForgeResearcherRiskTradeoffRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runResearcherRiskTradeoffForgeRegression rejects probe alignment regression", () => {
    const prior = runResearcherRiskTradeoffProbesWithRecord();
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

    const report = detectResearcherRiskTradeoffProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);

    const gate = runResearcherRiskTradeoffForgeRegression(prior);
    assert.equal(gate.passed, true);
  });

  it("orchestrator verifyForgeResearcherRiskTradeoffRegression emits researcher_risk_tradeoff_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rrto-regression-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-risk-tradeoff" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherRiskTradeoffRegression();
    const verification = events.find(
      event =>
        event.type === "verification" &&
        event.phase === "researcher_risk_tradeoff_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("23/23 probes aligned"));
    }
  });
});
