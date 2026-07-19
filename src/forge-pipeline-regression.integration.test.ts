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
import {
  runForgeBenchmarkEvalRegressionGate,
  runBenchmarkEvalHarnessProbesWithRecord,
  runBenchmarkEvalRegressionIntegration,
} from "./forge-benchmark-eval-harness.probe.js";
import { detectBenchmarkEvalProbeRegression } from "./forge-benchmark-eval-harness.js";
import {
  runForgeReproducibleFixtureRegressionGate,
  runReproducibleFixtureProbesWithRecord,
  runReproducibleFixtureRegressionIntegration,
} from "./forge-reproducible-fixture.probe.js";
import { detectReproducibleFixtureProbeRegression } from "./forge-reproducible-fixture.js";
import {
  runForgeEvidenceArtifactRegressionGate,
  runEvidenceArtifactProbesWithRecord,
  runEvidenceArtifactRegressionIntegration,
} from "./forge-evidence-artifact.probe.js";
import { detectEvidenceArtifactProbeRegression } from "./forge-evidence-artifact.js";
import {
  runForgeOrchestratorSeamRegressionGate,
  runOrchestratorSeamProbesWithRecord,
  runOrchestratorSeamRegressionIntegration,
} from "./forge-orchestrator-seam.probe.js";
import { detectOrchestratorSeamProbeRegression } from "./forge-orchestrator-seam.js";
import {
  runForgeIntegratedBaselineRegressionGate,
  runIntegratedBaselineBlockGate,
  runIntegratedBaselineProbesWithRecord,
  runIntegratedBaselineRegressionIntegration,
} from "./forge-integrated-baseline.probe.js";
import { detectIntegratedBaselineProbeRegression } from "./forge-integrated-baseline.js";
import {
  runForgeVisionerIntentRegressionGate,
  runVisionerIntentProbesWithRecord,
  runVisionerIntentRegressionIntegration,
  runForgeVisionerIntentBlockGate,
} from "./forge-p02-visioner-intent.probe.js";
import { detectVisionerIntentProbeRegression } from "./forge-p02-visioner-intent.js";
import {
  runForgeVisionerConstraintRegressionGate,
  runVisionerConstraintProbesWithRecord,
  runVisionerConstraintRegressionIntegration,
  runForgeVisionerConstraintBlockGate,
} from "./forge-p02-visioner-constraint.probe.js";
import { detectVisionerConstraintProbeRegression } from "./forge-p02-visioner-constraint.js";
import {
  runForgeVisionerSynthesisRegressionGate,
  runVisionerSynthesisProbesWithRecord,
  runVisionerSynthesisRegressionIntegration,
} from "./forge-p02-visioner-synthesis.probe.js";
import { detectVisionerSynthesisProbeRegression } from "./forge-p02-visioner-synthesis.js";
import {
  runForgeVisionerGroundingRegressionGate,
  runVisionerGroundingProbesWithRecord,
  runVisionerGroundingRegressionIntegration,
} from "./forge-p02-visioner-grounding.probe.js";
import { detectVisionerGroundingProbeRegression } from "./forge-p02-visioner-grounding.js";
import {
  runForgeVisionerResearchTriggerRegressionGate,
  runVisionerResearchTriggerProbesWithRecord,
  runVisionerResearchTriggerRegressionIntegration,
  runForgeVisionerResearchTriggerBlockGate,
} from "./forge-p02-visioner-research-trigger.probe.js";
import { detectVisionerResearchTriggerProbeRegression } from "./forge-p02-visioner-research-trigger.js";
import {
  runForgeVisionerUncertaintyRegressionGate,
  runVisionerUncertaintyProbesWithRecord,
  runVisionerUncertaintyRegressionIntegration,
} from "./forge-p02-visioner-uncertainty.probe.js";
import { detectVisionerUncertaintyProbeRegression } from "./forge-p02-visioner-uncertainty.js";
import {
  runForgeVisionerAlternativeRegressionGate,
  runVisionerAlternativeProbesWithRecord,
  runVisionerAlternativeRegressionIntegration,
} from "./forge-p02-visioner-alternative.probe.js";
import { detectVisionerAlternativeProbeRegression } from "./forge-p02-visioner-alternative.js";
import {
  runForgeVisionerScoringRegressionGate,
  runVisionerScoringProbesWithRecord,
  runVisionerScoringRegressionIntegration,
} from "./forge-p02-visioner-scoring.probe.js";
import { detectVisionerScoringProbeRegression } from "./forge-p02-visioner-scoring.js";
import {
  runForgeVisionerApprovalRegressionGate,
  runVisionerApprovalProbesWithRecord,
  runVisionerApprovalRegressionIntegration,
  runForgeVisionerApprovalBlockGate,
} from "./forge-p02-visioner-approval.probe.js";
import { detectVisionerApprovalProbeRegression } from "./forge-p02-visioner-approval.js";
import {
  runForgeVisionerPhaseGateRegressionGate,
  runVisionerPhaseGateProbesWithRecord,
  runVisionerPhaseGateRegressionIntegration,
  runForgeVisionerPhaseGateBlockGate,
} from "./forge-p02-visioner-phase-gate.probe.js";
import { detectVisionerPhaseGateProbeRegression, validateForgeVisionerPhaseGateGuard } from "./forge-p02-visioner-phase-gate.js";
import {
  runForgeResearcherQuestionDecompositionRegressionGate,
  runResearcherQuestionDecompositionProbesWithRecord,
  runResearcherQuestionDecompositionRegressionIntegration,
} from "./forge-p04-researcher-question-decomposition.probe.js";
import { detectResearcherQuestionDecompositionProbeRegression } from "./forge-p04-researcher-question-decomposition.js";
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

describe("Forge Pipeline Regression — P01-B06-A08", () => {
  it("runForgeBenchmarkEvalRegressionGate passes on canonical benchmark eval matrix", () => {
    const result = runForgeBenchmarkEvalRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 26);
    assert.equal(result.probeRegression, null);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("26/26 probes aligned"));
  });

  it("runBenchmarkEvalRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeBenchmarkEvalRegressionGate();
    const integration = runBenchmarkEvalRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.guard.passed, gate.guard.passed);
    assert.ok(integration.detail.includes("26/26 probes aligned"));
    assert.ok(integration.detail.includes("guard:"));
    assert.equal(integration.record.summary.total, 26);
  });

  it("detectBenchmarkEvalProbeRegression flags newly misaligned probes", () => {
    const prior = runBenchmarkEvalHarnessProbesWithRecord();
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

    const report = detectBenchmarkEvalProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeBenchmarkEvalRegressionGate compares against prior record without false regression", () => {
    const prior = runBenchmarkEvalHarnessProbesWithRecord();
    const result = runForgeBenchmarkEvalRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeBenchmarkEvalRegression emits benchmark_eval_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-benchmark-eval-regression-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "benchmark-eval" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeBenchmarkEvalRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "benchmark_eval_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("26/26 probes aligned"));
    }
  });
});

describe("Forge Pipeline Regression — P01-B07-A08", () => {
  it("runForgeReproducibleFixtureRegressionGate passes on canonical reproducible fixture matrix", () => {
    const result = runForgeReproducibleFixtureRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 21);
    assert.equal(result.probeRegression, null);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("21/21 probes aligned"));
  });

  it("runReproducibleFixtureRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeReproducibleFixtureRegressionGate();
    const integration = runReproducibleFixtureRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.guard.passed, gate.guard.passed);
    assert.ok(integration.detail.includes("21/21 probes aligned"));
    assert.equal(integration.record.summary.total, 21);
  });

  it("detectReproducibleFixtureProbeRegression flags newly misaligned probes", () => {
    const prior = runReproducibleFixtureProbesWithRecord();
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

    const report = detectReproducibleFixtureProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeReproducibleFixtureRegressionGate compares against prior record without false regression", () => {
    const prior = runReproducibleFixtureProbesWithRecord();
    const result = runForgeReproducibleFixtureRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeReproducibleFixtureRegression emits reproducible_fixture_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-reproducible-fixture-regression-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "reproducible-fixture" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeReproducibleFixtureRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "reproducible_fixture_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("21/21 probes aligned"));
    }
  });
});

describe("Forge Evidence Artifact Regression Integration — P01-B08-A08", () => {
  it("runForgeEvidenceArtifactRegressionGate passes on canonical evidence artifact matrix", () => {
    const result = runForgeEvidenceArtifactRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 25);
    assert.equal(result.probeRegression, null);
    assert.equal(result.guard.passed, true);
    assert.equal(result.propertyFuzz.passed, true);
    assert.ok(result.detail.includes("25/25 probes aligned"));
    assert.ok(result.detail.includes("propertyFuzz:"));
    assert.ok(result.detail.includes("guard:"));
  });

  it("runEvidenceArtifactRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeEvidenceArtifactRegressionGate();
    const integration = runEvidenceArtifactRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.guard.passed, gate.guard.passed);
    assert.equal(integration.propertyFuzz.passed, gate.propertyFuzz.passed);
    assert.ok(integration.detail.includes("25/25 probes aligned"));
    assert.equal(integration.record.summary.total, 25);
  });

  it("detectEvidenceArtifactProbeRegression flags newly misaligned probes", () => {
    const prior = runEvidenceArtifactProbesWithRecord();
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

    const report = detectEvidenceArtifactProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeEvidenceArtifactRegressionGate compares against prior record without false regression", () => {
    const prior = runEvidenceArtifactProbesWithRecord();
    const result = runForgeEvidenceArtifactRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeEvidenceArtifactRegression emits evidence_artifact_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-evidence-artifact-regression-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "evidence-artifact" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeEvidenceArtifactRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "evidence_artifact_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("25/25 probes aligned"));
    }
  });
});

describe("Forge Orchestrator Seam Regression Integration — P01-B09-A08", () => {
  it("runForgeOrchestratorSeamRegressionGate passes on canonical orchestrator seam matrix", () => {
    const result = runForgeOrchestratorSeamRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 23);
    assert.equal(result.probeRegression, null);
    assert.equal(result.guard.passed, true);
    assert.equal(result.propertyFuzz.passed, true);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.ok(result.detail.includes("23/23 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
    assert.ok(result.detail.includes("guard:"));
  });

  it("runOrchestratorSeamRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeOrchestratorSeamRegressionGate();
    const integration = runOrchestratorSeamRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.guard.passed, gate.guard.passed);
    assert.equal(integration.propertyFuzz.passed, gate.propertyFuzz.passed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.ok(integration.detail.includes("23/23 probes aligned"));
    assert.equal(integration.record.summary.total, 23);
  });

  it("detectOrchestratorSeamProbeRegression flags newly misaligned probes", () => {
    const prior = runOrchestratorSeamProbesWithRecord();
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

    const report = detectOrchestratorSeamProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeOrchestratorSeamRegressionGate compares against prior record without false regression", () => {
    const prior = runOrchestratorSeamProbesWithRecord();
    const result = runForgeOrchestratorSeamRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeOrchestratorSeamRegression emits orchestrator_seam_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-orchestrator-seam-regression-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "orchestrator-seam" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeOrchestratorSeamRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "orchestrator_seam_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("23/23 probes aligned"));
    }
  });
});

describe("Forge Pipeline Regression — P01-B10-A08", () => {
  it("runForgeIntegratedBaselineRegressionGate passes on canonical integrated baseline matrix", () => {
    const result = runForgeIntegratedBaselineRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 24);
    assert.equal(result.probeRegression, null);
    assert.ok(result.propertyFuzz.passed);
    assert.ok(result.detail.includes("24/24 probes aligned"));
  });

  it("detectIntegratedBaselineProbeRegression flags newly misaligned probes", () => {
    const prior = runIntegratedBaselineProbesWithRecord();
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

    const report = detectIntegratedBaselineProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runIntegratedBaselineRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeIntegratedBaselineRegressionGate();
    const integration = runIntegratedBaselineRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.guard.passed, gate.guard.passed);
    assert.equal(integration.propertyFuzz.passed, gate.propertyFuzz.passed);
    assert.ok(integration.detail.includes("24/24 probes aligned"));
    assert.equal(integration.record.summary.total, 24);
  });

  it("orchestrator verifyForgeIntegratedRegression emits integrated_baseline_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-integrated-baseline-regression-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "integrated-baseline" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeIntegratedRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "integrated_baseline_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("24/24 probes aligned"));
    }
  });
});
describe("Forge Pipeline Regression — P01-B10-A09", () => {
  it("runForgeIntegratedBaselineRegressionGate guard passes on canonical integrated baseline matrix", () => {
    const result = runForgeIntegratedBaselineRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeIntegratedGuard emits integrated_baseline_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-integrated-baseline-guard-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "integrated-baseline" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeIntegratedGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "integrated_baseline_guard",
    );

    assert.equal(result.guard.passed, true);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("guard PASS"));
      assert.ok(verification.detail.includes("adversarial=3/3"));
    }
  });
});

describe("Forge Pipeline Regression — P01-B10-A10", () => {
  it("runIntegratedBaselineBlockGate seals P01-B10 with full block inventory", () => {
    const result = runIntegratedBaselineBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.sealedBlockCount, 9);
    assert.ok(result.detail.includes("inventory=PASS:9"));
    assert.ok(result.detail.includes("handoff=PASS→P02-B01"));
  });

  it("orchestrator verifyForgeIntegratedBlockGate emits integrated_baseline_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-integrated-baseline-block-gate-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "integrated-baseline" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeIntegratedBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "integrated_baseline_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P02-B01"));
    }
  });
});

describe("Forge Visioner Intent Regression Integration — P02-B01-A08", () => {
  it("runForgeVisionerIntentRegressionGate passes on canonical visioner intent matrix", () => {
    const result = runForgeVisionerIntentRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 23);
    assert.equal(result.probeRegression, null);
    assert.equal(result.guard.passed, true);
    assert.equal(result.propertyFuzz.passed, true);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.ok(result.detail.includes("23/23 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
    assert.ok(result.detail.includes("guard:"));
  });

  it("runVisionerIntentRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeVisionerIntentRegressionGate();
    const integration = runVisionerIntentRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.guard.passed, gate.guard.passed);
    assert.equal(integration.propertyFuzz.passed, gate.propertyFuzz.passed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.ok(integration.detail.includes("23/23 probes aligned"));
    assert.equal(integration.record.summary.total, 23);
  });

  it("detectVisionerIntentProbeRegression flags newly misaligned probes", () => {
    const prior = runVisionerIntentProbesWithRecord();
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

    const report = detectVisionerIntentProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeVisionerIntentRegressionGate compares against prior record without false regression", () => {
    const prior = runVisionerIntentProbesWithRecord();
    const result = runForgeVisionerIntentRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeVisionerIntentRegression emits visioner_intent_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-intent-regression-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-intent" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerIntentRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_intent_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("23/23 probes aligned"));
    }
  });
});

describe("Forge Visioner Intent Guard Integration — P02-B01-A09", () => {
  it("runForgeVisionerIntentRegressionGate guard passes on canonical visioner intent matrix", () => {
    const result = runForgeVisionerIntentRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeVisionerIntentGuard emits visioner_intent_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-intent-guard-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-intent" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerIntentGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_intent_guard",
    );

    assert.equal(result.guard.passed, true);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("guard PASS"));
      assert.ok(verification.detail.includes("adversarial=3/3"));
    }
  });
});

describe("Forge Visioner Intent Block Gate Integration — P02-B01-A10", () => {
  it("runForgeVisionerIntentBlockGate seals P02-B01 with full block inventory", () => {
    const result = runForgeVisionerIntentBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P02-B01");
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed));
    assert.ok(result.detail.includes("handoff=PASS→P02-B02"));
  });

  it("orchestrator verifyForgeVisionerIntentBlockGate emits visioner_intent_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-intent-block-gate-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-intent" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerIntentBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_intent_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P02-B02"));
    }
  });
});

describe("Forge Visioner Constraint Regression Integration — P02-B02-A08", () => {
  it("runForgeVisionerConstraintRegressionGate passes on canonical visioner constraint matrix", () => {
    const result = runForgeVisionerConstraintRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 23);
    assert.equal(result.probeRegression, null);
    assert.equal(result.propertyFuzz.passed, true);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.ok(result.detail.includes("23/23 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
  });

  it("runVisionerConstraintRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeVisionerConstraintRegressionGate();
    const integration = runVisionerConstraintRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.propertyFuzz.passed, gate.propertyFuzz.passed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.ok(integration.detail.includes("23/23 probes aligned"));
    assert.equal(integration.record.summary.total, 23);
  });

  it("detectVisionerConstraintProbeRegression flags newly misaligned probes", () => {
    const prior = runVisionerConstraintProbesWithRecord();
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

    const report = detectVisionerConstraintProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeVisionerConstraintRegressionGate compares against prior record without false regression", () => {
    const prior = runVisionerConstraintProbesWithRecord();
    const result = runForgeVisionerConstraintRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeVisionerConstraintRegression emits visioner_constraint_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-constraint-regression-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-constraint" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerConstraintRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_constraint_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("23/23 probes aligned"));
    }
  });
});

describe("Forge Visioner Constraint Block Gate Integration — P02-B02-A10", () => {
  it("runForgeVisionerConstraintBlockGate seals P02-B02 with full block inventory", () => {
    const result = runForgeVisionerConstraintBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P02-B02");
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed));
    assert.ok(result.detail.includes("handoff=PASS→P02-B03"));
  });

  it("orchestrator verifyForgeVisionerConstraintBlockGate emits visioner_constraint_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-constraint-block-gate-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-constraint" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerConstraintBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_constraint_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P02-B03"));
    }
  });
});

describe("Forge Visioner Synthesis Regression Integration — P02-B03-A08", () => {
  it("runForgeVisionerSynthesisRegressionGate passes on canonical visioner synthesis matrix", () => {
    const result = runForgeVisionerSynthesisRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 23);
    assert.equal(result.probeRegression, null);
    assert.equal(result.propertyFuzz.passed, true);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.ok(result.detail.includes("23/23 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
  });

  it("runVisionerSynthesisRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeVisionerSynthesisRegressionGate();
    const integration = runVisionerSynthesisRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.propertyFuzz.passed, gate.propertyFuzz.passed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.ok(integration.detail.includes("23/23 probes aligned"));
    assert.equal(integration.record.summary.total, 23);
  });

  it("detectVisionerSynthesisProbeRegression flags newly misaligned probes", () => {
    const prior = runVisionerSynthesisProbesWithRecord();
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

    const report = detectVisionerSynthesisProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeVisionerSynthesisRegressionGate compares against prior record without false regression", () => {
    const prior = runVisionerSynthesisProbesWithRecord();
    const result = runForgeVisionerSynthesisRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeVisionerSynthesisRegression emits visioner_synthesis_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-synthesis-regression-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-synthesis" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerSynthesisRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_synthesis_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("23/23 probes aligned"));
    }
  });
});

describe("Forge Visioner Grounding Regression Integration — P02-B04-A08", () => {
  it("runForgeVisionerGroundingRegressionGate passes on canonical visioner grounding matrix", () => {
    const result = runForgeVisionerGroundingRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 23);
    assert.equal(result.probeRegression, null);
    assert.equal(result.propertyFuzz.passed, true);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.ok(result.detail.includes("23/23 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
  });

  it("runVisionerGroundingRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeVisionerGroundingRegressionGate();
    const integration = runVisionerGroundingRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.propertyFuzz.passed, gate.propertyFuzz.passed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.ok(integration.detail.includes("23/23 probes aligned"));
    assert.equal(integration.record.summary.total, 23);
  });

  it("detectVisionerGroundingProbeRegression flags newly misaligned probes", () => {
    const prior = runVisionerGroundingProbesWithRecord();
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

    const report = detectVisionerGroundingProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeVisionerGroundingRegressionGate compares against prior record without false regression", () => {
    const prior = runVisionerGroundingProbesWithRecord();
    const result = runForgeVisionerGroundingRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeVisionerGroundingRegression emits visioner_grounding_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-grounding-regression-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-grounding" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerGroundingRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_grounding_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("23/23 probes aligned"));
    }
  });
});

describe("Forge Visioner Research Trigger Regression Integration — P02-B05-A08", () => {
  it("runForgeVisionerResearchTriggerRegressionGate passes on canonical research trigger matrix", () => {
    const result = runForgeVisionerResearchTriggerRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 23);
    assert.equal(result.probeRegression, null);
    assert.equal(result.propertyFuzz.passed, true);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.ok(result.detail.includes("23/23 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
  });

  it("runVisionerResearchTriggerRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeVisionerResearchTriggerRegressionGate();
    const integration = runVisionerResearchTriggerRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.propertyFuzz.passed, gate.propertyFuzz.passed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.ok(integration.detail.includes("23/23 probes aligned"));
    assert.equal(integration.record.summary.total, 23);
  });

  it("detectVisionerResearchTriggerProbeRegression flags newly misaligned probes", () => {
    const prior = runVisionerResearchTriggerProbesWithRecord();
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

    const report = detectVisionerResearchTriggerProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeVisionerResearchTriggerRegressionGate compares against prior record without false regression", () => {
    const prior = runVisionerResearchTriggerProbesWithRecord();
    const result = runForgeVisionerResearchTriggerRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeVisionerResearchTriggerRegression emits visioner_research_trigger_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-research-trigger-regression-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-research-trigger" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerResearchTriggerRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_research_trigger_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("23/23 probes aligned"));
    }
  });
});

describe("Forge Visioner Research Trigger Guard Integration — P02-B05-A09", () => {
  it("runForgeVisionerResearchTriggerRegressionGate guard passes on canonical research trigger matrix", () => {
    const result = runForgeVisionerResearchTriggerRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeVisionerResearchTriggerGuard emits visioner_research_trigger_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-research-trigger-guard-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-research-trigger" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerResearchTriggerGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_research_trigger_guard",
    );

    assert.equal(result.guard.passed, true);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("guard PASS"));
      assert.ok(verification.detail.includes("adversarial=3/3"));
    }
  });
});

describe("Forge Visioner Research Trigger Block Gate Integration — P02-B05-A10", () => {
  it("runForgeVisionerResearchTriggerBlockGate seals P02-B05 with full block inventory", () => {
    const result = runForgeVisionerResearchTriggerBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P02-B05");
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed));
    assert.ok(result.detail.includes("handoff=PASS→P02-B06"));
  });

  it("orchestrator verifyForgeVisionerResearchTriggerBlockGate emits visioner_research_trigger_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-research-trigger-block-gate-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-research-trigger" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerResearchTriggerBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_research_trigger_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P02-B06"));
    }
  });
});

describe("Forge Visioner Uncertainty Regression Integration — P02-B06-A08", () => {
  it("runForgeVisionerUncertaintyRegressionGate passes on canonical visioner uncertainty matrix", () => {
    const result = runForgeVisionerUncertaintyRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 23);
    assert.equal(result.probeRegression, null);
    assert.equal(result.propertyFuzz.passed, true);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("23/23 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("runVisionerUncertaintyRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeVisionerUncertaintyRegressionGate();
    const integration = runVisionerUncertaintyRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.propertyFuzz.passed, gate.propertyFuzz.passed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.equal(integration.guard.passed, gate.guard.passed);
    assert.ok(integration.detail.includes("23/23 probes aligned"));
    assert.equal(integration.record.summary.total, 23);
  });

  it("detectVisionerUncertaintyProbeRegression flags newly misaligned probes", () => {
    const prior = runVisionerUncertaintyProbesWithRecord();
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

    const report = detectVisionerUncertaintyProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeVisionerUncertaintyRegressionGate compares against prior record without false regression", () => {
    const prior = runVisionerUncertaintyProbesWithRecord();
    const result = runForgeVisionerUncertaintyRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });
});

describe("Forge Visioner Alternative Regression Integration — P02-B07-A08", () => {
  it("runForgeVisionerAlternativeRegressionGate passes on canonical visioner alternative matrix", () => {
    const result = runForgeVisionerAlternativeRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 23);
    assert.equal(result.probeRegression, null);
    assert.equal(result.propertyFuzz.passed, true);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("23/23 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("runVisionerAlternativeRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeVisionerAlternativeRegressionGate();
    const integration = runVisionerAlternativeRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.propertyFuzz.passed, gate.propertyFuzz.passed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.equal(integration.guard.passed, gate.guard.passed);
    assert.ok(integration.detail.includes("23/23 probes aligned"));
    assert.equal(integration.record.summary.total, 23);
  });

  it("detectVisionerAlternativeProbeRegression flags newly misaligned probes", () => {
    const prior = runVisionerAlternativeProbesWithRecord();
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

    const report = detectVisionerAlternativeProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeVisionerAlternativeRegressionGate compares against prior record without false regression", () => {
    const prior = runVisionerAlternativeProbesWithRecord();
    const result = runForgeVisionerAlternativeRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeVisionerAlternativeRegression emits visioner_alternative_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-alternative-regression-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-alternative" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerAlternativeRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_alternative_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("23/23 probes aligned"));
    }
  });
});

describe("Forge Visioner Scoring Regression Integration — P02-B08-A08", () => {
  it("runForgeVisionerScoringRegressionGate passes on canonical scoring matrix", () => {
    const result = runForgeVisionerScoringRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 23);
    assert.equal(result.probeRegression, null);
    assert.equal(result.propertyFuzz.passed, true);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.ok(result.detail.includes("23/23 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
  });

  it("runVisionerScoringRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeVisionerScoringRegressionGate();
    const integration = runVisionerScoringRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.propertyFuzz.passed, gate.propertyFuzz.passed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.ok(integration.detail.includes("23/23 probes aligned"));
    assert.equal(integration.record.summary.total, 23);
  });

  it("detectVisionerScoringProbeRegression flags newly misaligned probes", () => {
    const prior = runVisionerScoringProbesWithRecord();
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

    const report = detectVisionerScoringProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeVisionerScoringRegressionGate compares against prior record without false regression", () => {
    const prior = runVisionerScoringProbesWithRecord();
    const result = runForgeVisionerScoringRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeVisionerScoringRegression emits visioner_scoring_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-scoring-regression-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-scoring" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerScoringRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_scoring_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("23/23 probes aligned"));
    }
  });
});

describe("Forge Visioner Approval Regression Integration — P02-B09-A08", () => {
  it("runForgeVisionerApprovalRegressionGate passes on canonical visioner approval matrix", () => {
    const result = runForgeVisionerApprovalRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 23);
    assert.equal(result.probeRegression, null);
    assert.equal(result.propertyFuzz.passed, true);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("23/23 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("runVisionerApprovalRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeVisionerApprovalRegressionGate();
    const integration = runVisionerApprovalRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.propertyFuzz.passed, gate.propertyFuzz.passed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.equal(integration.guard.passed, gate.guard.passed);
    assert.ok(integration.detail.includes("23/23 probes aligned"));
    assert.equal(integration.record.summary.total, 23);
  });

  it("detectVisionerApprovalProbeRegression flags newly misaligned probes", () => {
    const prior = runVisionerApprovalProbesWithRecord();
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

    const report = detectVisionerApprovalProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeVisionerApprovalRegressionGate compares against prior record without false regression", () => {
    const prior = runVisionerApprovalProbesWithRecord();
    const result = runForgeVisionerApprovalRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeVisionerApprovalRegression emits visioner_approval_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-approval-regression-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-approval" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerApprovalRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_approval_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("23/23 probes aligned"));
    }
  });
});

describe("Forge Visioner Approval Guard Integration — P02-B09-A09", () => {
  it("runForgeVisionerApprovalRegressionGate guard passes on canonical visioner approval matrix", () => {
    const result = runForgeVisionerApprovalRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeVisionerApprovalGuard emits visioner_approval_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-approval-guard-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-approval" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerApprovalGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_approval_guard",
    );

    assert.equal(result.guard.passed, true);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("guard PASS"));
      assert.ok(verification.detail.includes("adversarial=3/3"));
    }
  });
});

describe("Forge Visioner Approval Block Gate Integration — P02-B09-A10", () => {
  it("runForgeVisionerApprovalBlockGate passes with 10/10 atom seals and B10 handoff", () => {
    const result = runForgeVisionerApprovalBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed));
    assert.equal(result.evidence.handoffValid, true);
    assert.ok(result.detail.includes("handoff=PASS→P02-B10"));
    assert.equal(result.handoff.targetBlock.blockId, "P02-B10");
    assert.equal(result.handoff.targetBlock.entryAtom, "P02-B10-A01");
  });

  it("orchestrator verifyForgeVisionerApprovalBlockGate emits visioner_approval_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-approval-block-gate-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-approval" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerApprovalBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_approval_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P02-B10"));
      assert.ok(verification.detail.includes("seals=10/10"));
    }
  });
});

describe("Forge Visioner Phase Gate Regression Integration — P02-B10-A08", () => {
  it("runForgeVisionerPhaseGateRegressionGate passes on canonical visioner phase gate matrix", () => {
    const result = runForgeVisionerPhaseGateRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 24);
    assert.equal(result.probeRegression, null);
    assert.equal(result.guard.passed, true);
    assert.equal(result.propertyFuzz.passed, true);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.ok(result.detail.includes("24/24 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
    assert.ok(result.detail.includes("guard:"));
  });

  it("runVisionerPhaseGateRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeVisionerPhaseGateRegressionGate();
    const integration = runVisionerPhaseGateRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.propertyFuzz.passed, gate.propertyFuzz.passed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.ok(integration.detail.includes("24/24 probes aligned"));
    assert.equal(integration.record.summary.total, 24);
  });

  it("detectVisionerPhaseGateProbeRegression flags newly misaligned probes", () => {
    const prior = runVisionerPhaseGateProbesWithRecord();
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

    const report = detectVisionerPhaseGateProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeVisionerPhaseGateRegressionGate compares against prior record without false regression", () => {
    const prior = runVisionerPhaseGateProbesWithRecord();
    const result = runForgeVisionerPhaseGateRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("orchestrator verifyForgeP02VisionerPhaseGateRegression emits visioner_phase_gate_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-phase-gate-regression-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-phase-gate" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeP02VisionerPhaseGateRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_phase_gate_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("24/24 probes aligned"));
    }
  });
});

describe("Forge Visioner Phase Gate Guard Integration — P02-B10-A09", () => {
  it("validateForgeVisionerPhaseGateGuard passes on canonical run record", () => {
    const record = runVisionerPhaseGateProbesWithRecord();
    const guard = validateForgeVisionerPhaseGateGuard(record);
    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runForgeVisionerPhaseGateRegressionGate guard metrics included when prior record supplied", () => {
    const prior = runVisionerPhaseGateProbesWithRecord();
    const result = runForgeVisionerPhaseGateRegressionGate(prior);
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("orchestrator verifyForgeP02VisionerPhaseGateGuard emits visioner_phase_gate_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-phase-guard-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-phase-gate" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeP02VisionerPhaseGateGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_phase_gate_guard",
    );

    assert.equal(result.guard.passed, true);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("guard PASS"));
    }
  });
});

describe("Forge Visioner Phase Gate Block Gate Integration — P02-B10-A10", () => {
  it("runForgeVisionerPhaseGateBlockGate passes with 10/10 atom seals and P03 handoff", () => {
    const result = runForgeVisionerPhaseGateBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed));
    assert.equal(result.evidence.handoffValid, true);
    assert.ok(result.detail.includes("handoff=PASS→P03-B01"));
    assert.equal(result.handoff.targetBlock.blockId, "P03-B01");
    assert.equal(result.handoff.targetBlock.entryAtom, "P03-B01-A01");
  });

  it("orchestrator verifyForgeP02VisionerPhaseGateBlockGate emits visioner_phase_gate_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-visioner-phase-block-gate-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-phase-gate" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeP02VisionerPhaseGateBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_phase_gate_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P03-B01"));
      assert.ok(verification.detail.includes("seals=10/10"));
    }
  });
});

describe("Forge Researcher Question Decomposition Regression Integration — P04-B01-A08", () => {
  it("runForgeResearcherQuestionDecompositionRegressionGate passes on canonical question decomposition matrix", () => {
    const result = runForgeResearcherQuestionDecompositionRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 27);
    assert.equal(result.probeRegression, null);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.propertyFuzzSlice.propertyChecksPassed, true);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("27/27 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("runForgeResearcherQuestionDecompositionRegressionGate guard passes on canonical question decomposition matrix", () => {
    const result = runForgeResearcherQuestionDecompositionRegressionGate();
    assert.equal(result.guard.passed, true, result.guard.issues.map(i => i.detail).join("; "));
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
    assert.equal(result.guard.metrics.adversarialScenariosTotal, 3);
  });

  it("runResearcherQuestionDecompositionRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeResearcherQuestionDecompositionRegressionGate();
    const integration = runResearcherQuestionDecompositionRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.propertyFuzzSlice.propertyChecksPassed, gate.propertyFuzzSlice.propertyChecksPassed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.ok(integration.detail.includes("27/27 probes aligned"));
    assert.equal(integration.record.summary.total, 27);
  });

  it("detectResearcherQuestionDecompositionProbeRegression flags newly misaligned probes", () => {
    const prior = runResearcherQuestionDecompositionProbesWithRecord();
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

    const report = detectResearcherQuestionDecompositionProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeResearcherQuestionDecompositionRegressionGate compares against prior record without false regression", () => {
    const prior = runResearcherQuestionDecompositionProbesWithRecord();
    const result = runForgeResearcherQuestionDecompositionRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });
});

describe("Forge Researcher Question Decomposition Regression Integration — P04-B01-A08", () => {
  it("runForgeResearcherQuestionDecompositionRegressionGate passes on canonical question decomposition matrix", () => {
    const result = runForgeResearcherQuestionDecompositionRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 27);
    assert.equal(result.probeRegression, null);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.propertyFuzzSlice.propertyChecksPassed, true);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("27/27 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("runForgeResearcherQuestionDecompositionRegressionGate guard passes on canonical question decomposition matrix", () => {
    const result = runForgeResearcherQuestionDecompositionRegressionGate();
    assert.equal(result.guard.passed, true, result.guard.issues.map(i => i.detail).join("; "));
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
    assert.equal(result.guard.metrics.adversarialScenariosTotal, 3);
  });

  it("runResearcherQuestionDecompositionRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeResearcherQuestionDecompositionRegressionGate();
    const integration = runResearcherQuestionDecompositionRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.propertyFuzzSlice.propertyChecksPassed, gate.propertyFuzzSlice.propertyChecksPassed);
    assert.equal(integration.productionSlice.matrixValid, gate.productionSlice.matrixValid);
    assert.ok(integration.detail.includes("27/27 probes aligned"));
    assert.equal(integration.record.summary.total, 27);
  });

  it("detectResearcherQuestionDecompositionProbeRegression flags newly misaligned probes", () => {
    const prior = runResearcherQuestionDecompositionProbesWithRecord();
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

    const report = detectResearcherQuestionDecompositionProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeResearcherQuestionDecompositionRegressionGate compares against prior record without false regression", () => {
    const prior = runResearcherQuestionDecompositionProbesWithRecord();
    const result = runForgeResearcherQuestionDecompositionRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });
});
