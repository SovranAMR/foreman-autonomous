import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeBaselineRegressionGate,
  runForgeBaselineProbesWithRecord,
  detectBaselineProbeRegression,
} from "./forge-baseline-harness.js";
import {
  runForgeBehaviorMapRegressionGate,
  runPipelineBehaviorMapProbesWithRecord,
} from "./forge-pipeline-behavior-map-harness.js";
import { detectBehaviorMapProbeRegression } from "./forge-pipeline-behavior-map.js";
import {
  runForgePipelineInvariantEngineRegressionGate,
  runPipelineInvariantEngineProbesWithRecord,
} from "./forge-pipeline-invariant-engine-harness.js";
import { detectPipelineInvariantEngineProbeRegression } from "./forge-pipeline-invariant-engine.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Pipeline Regression — P01-B01-A08", () => {
  it("runForgeBaselineRegressionGate passes on canonical baseline matrix", async () => {
    const result = await runForgeBaselineRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 27);
    assert.equal(result.probeRegression, null);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("27/27 probes aligned"));
    assert.ok(result.detail.includes("guard:"));
  });

  it("detectBaselineProbeRegression flags newly misaligned probes", async () => {
    const prior = await runForgeBaselineProbesWithRecord();
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

    const report = detectBaselineProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeBaselineRegressionGate compares against prior record without false regression", async () => {
    const prior = await runForgeBaselineProbesWithRecord();
    const result = await runForgeBaselineRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeBaselineRegression emits baseline_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-regression-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "baseline" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeBaselineRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "baseline_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("27/27 probes aligned"));
    }
  });
});

describe("Forge Pipeline Regression — P01-B02-A08", () => {
  it("runForgeBehaviorMapRegressionGate passes on canonical behavior map matrix", () => {
    const result = runForgeBehaviorMapRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.probeRegression, null);
    assert.ok(result.detail.includes(`${result.record.summary.total}/${result.record.summary.total} probes aligned`));
  });

  it("detectBehaviorMapProbeRegression flags newly misaligned probes", () => {
    const prior = runPipelineBehaviorMapProbesWithRecord();
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

    const report = detectBehaviorMapProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeBehaviorMapRegressionGate compares against prior record without false regression", () => {
    const prior = runPipelineBehaviorMapProbesWithRecord();
    const result = runForgeBehaviorMapRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeBehaviorMapRegression emits behavior_map_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-behavior-map-regression-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "behavior-map" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeBehaviorMapRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "behavior_map_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("probes aligned"));
    }
  });
});

describe("Forge Pipeline Regression — P01-B05-A08", () => {
  it("runForgePipelineInvariantEngineRegressionGate passes on canonical invariant engine matrix", () => {
    const result = runForgePipelineInvariantEngineRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 32);
    assert.equal(result.probeRegression, null);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("32/32 probes aligned"));
    assert.ok(result.detail.includes("guard:"));
  });

  it("detectPipelineInvariantEngineProbeRegression flags newly misaligned probes", () => {
    const prior = runPipelineInvariantEngineProbesWithRecord();
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

    const report = detectPipelineInvariantEngineProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgePipelineInvariantEngineRegressionGate compares against prior record without false regression", () => {
    const prior = runPipelineInvariantEngineProbesWithRecord();
    const result = runForgePipelineInvariantEngineRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgePipelineInvariantEngineRegression emits pipeline_invariant_engine_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-invariant-engine-regression-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "invariant-engine" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgePipelineInvariantEngineRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "pipeline_invariant_engine_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("32/32 probes aligned"));
    }
  });
});
