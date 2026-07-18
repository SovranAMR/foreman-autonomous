/**
 * FOREMAN — Benchmark & Eval Harness Probe Seam (P01-B06)
 *
 * Static orchestrator probes for benchmark/eval baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import benchmarkEvalFixture from "./fixtures/forge-benchmark-eval-harness-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP01B05ToB06Handoff,
  getActivePipelineInvariantEngineContract,
  summarizePipelineInvariantEngineContractCoverage,
} from "./forge-pipeline-invariant-engine.js";
import {
  summarizeBenchmarkEvalHarnessMatrix,
  type BenchmarkEvalCategory,
  type BenchmarkEvalFixture,
  type BenchmarkEvalProbeResult,
} from "./forge-benchmark-eval-harness.js";

export type { BenchmarkEvalFixture, BenchmarkEvalProbeResult } from "./forge-benchmark-eval-harness.js";
export {
  validateBenchmarkEvalHarnessFixture,
  summarizeBenchmarkEvalHarnessMatrix,
  listBenchmarkEvalHarnessProbesByExpected,
  BENCHMARK_EVAL_CATEGORIES,
  BENCHMARK_EVAL_A01_MIN_PROBES,
  buildDefaultBenchmarkEvalSourcePipelineInvariantEngine,
} from "./forge-benchmark-eval-harness.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(__dirname);

function readSrc(relativePath: string): string {
  return readFileSync(join(SRC_ROOT, relativePath), "utf8");
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: BenchmarkEvalCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): BenchmarkEvalProbeResult {
  const actual = outcome(ok);
  return {
    id,
    category,
    expected,
    actual,
    aligned: actual === expected,
    detail,
    criterion,
  };
}

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function probeLatencyTiming(
  id: string,
  category: BenchmarkEvalCategory,
  expected: ForgeAcceptanceOutcome,
): BenchmarkEvalProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "bench.pipeline_duration_logged": {
      const ok =
        src.includes("pipelineStartTime") &&
        src.includes("durationMs = Date.now() - this.pipelineStartTime") &&
        src.includes("[forge] Pipeline");
      return probe(
        id,
        category,
        expected,
        ok,
        `durationLog=${ok}`,
        "Pipeline completion logs duration derived from pipelineStartTime",
      );
    }
    case "bench.pipeline_start_time_set": {
      const ok = src.includes("this.pipelineStartTime = Date.now()");
      return probe(
        id,
        category,
        expected,
        ok,
        `startTimeSet=${ok}`,
        "pipelineStartTime initialized at pipeline run start",
      );
    }
    case "bench.phase_timing_collector": {
      const populated =
        /\.phaseTimings\.set\(/.test(src) ||
        /phaseTimings\.get\(/.test(src) ||
        src.includes("recordPhaseTiming") ||
        src.includes("benchmarkPhaseTiming");
      return probe(
        id,
        category,
        expected,
        populated,
        `phaseTimingsPopulated=${populated}`,
        "phaseTimings map populated during pipeline phases for latency eval",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown latency_timing probe");
  }
}

function probeTokenCost(
  id: string,
  category: BenchmarkEvalCategory,
  expected: ForgeAcceptanceOutcome,
): BenchmarkEvalProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "bench.phase_token_map": {
      const ok = src.includes("phaseTokens: Map<string, number>");
      return probe(
        id,
        category,
        expected,
        ok,
        `phaseTokenMap=${ok}`,
        "Orchestrator tracks per-phase token usage in phaseTokens map",
      );
    }
    case "bench.session_budget_gate": {
      const ok = src.includes("MAX_TOKENS_SESSION") && src.includes("Session budget exceeded");
      return probe(
        id,
        category,
        expected,
        ok,
        `sessionBudgetGate=${ok}`,
        "Session token budget gate halts pipeline when exceeded",
      );
    }
    case "bench.phase_budget_caps": {
      const ok =
        src.includes("PHASE_BUDGET_PCT") &&
        src.includes("checkPhaseBudget") &&
        src.includes("trackPhaseTokens");
      return probe(
        id,
        category,
        expected,
        ok,
        `phaseBudgetCaps=${ok}`,
        "Phase-level token budget caps enforced via PHASE_BUDGET_PCT",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown token_cost probe");
  }
}

function probeEvalSuite(
  id: string,
  category: BenchmarkEvalCategory,
  expected: ForgeAcceptanceOutcome,
): BenchmarkEvalProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "bench.forge_regression_exports": {
      const ok =
        src.includes("verifyForgeBaselineRegression") &&
        src.includes("verifyForgeBehaviorMapRegression") &&
        src.includes("verifyForgeFormalStateMachineRegression") &&
        src.includes("verifyForgePhaseEventSchemaRegression") &&
        src.includes("verifyForgePipelineInvariantEngineRegression");
      return probe(
        id,
        category,
        expected,
        ok,
        `regressionExports=${ok}`,
        "Orchestrator exports verifyForge*Regression gate methods",
      );
    }
    case "bench.forge_guard_exports": {
      const ok =
        src.includes("verifyForgeBaselineGuard") &&
        src.includes("verifyForgeBehaviorMapGuard") &&
        src.includes("verifyForgePhaseEventSchemaGuard") &&
        src.includes("verifyForgeFormalStateMachineGuard") &&
        src.includes("verifyForgePipelineInvariantEngineGuard");
      return probe(
        id,
        category,
        expected,
        ok,
        `guardExports=${ok}`,
        "Orchestrator exports verifyForge*Guard gate methods",
      );
    }
    case "bench.benchmark_regression_export": {
      const ok =
        src.includes("verifyForgeBenchmarkEvalRegression") ||
        src.includes("runForgeBenchmarkEvalRegressionGate");
      return probe(
        id,
        category,
        expected,
        ok,
        `benchmarkRegressionExport=${ok}`,
        "Orchestrator exports verifyForgeBenchmarkEvalRegression eval gate",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown eval_suite probe");
  }
}

function probeReproducibility(
  id: string,
  category: BenchmarkEvalCategory,
  expected: ForgeAcceptanceOutcome,
): BenchmarkEvalProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "bench.pipeline_resume_checkpoint": {
      const ok =
        src.includes("PipelineResumeEngine") &&
        src.includes("this.resume") &&
        src.includes("updatePhase");
      return probe(
        id,
        category,
        expected,
        ok,
        `resumeCheckpoint=${ok}`,
        "PipelineResumeEngine checkpoints pipeline phase for reproducible resume",
      );
    }
    case "bench.deterministic_eval_seed": {
      const ok =
        src.includes("evalSeed") ||
        src.includes("deterministicEvalSeed") ||
        src.includes("BENCHMARK_EVAL_SEED");
      return probe(
        id,
        category,
        expected,
        ok,
        `evalSeed=${ok}`,
        "Orchestrator accepts deterministic eval seed for reproducible benchmark runs",
      );
    }
    case "bench.fixture_hash_provenance": {
      const ok =
        src.includes("evalProvenanceHash") ||
        src.includes("benchmarkRunHash") ||
        src.includes("buildBenchmarkEvalProvenance");
      return probe(
        id,
        category,
        expected,
        ok,
        `provenanceHash=${ok}`,
        "Eval harness records fixture hash provenance on benchmark runs",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown reproducibility probe");
  }
}

function probeBaselineLink(
  id: string,
  category: BenchmarkEvalCategory,
  expected: ForgeAcceptanceOutcome,
): BenchmarkEvalProbeResult {
  switch (id) {
    case "bench.b05_handoff_target": {
      const handoff = getForgeP01B05ToB06Handoff();
      const ok =
        handoff.targetBlock.blockId === "P01-B06" &&
        handoff.targetBlock.entryAtom === "P01-B06-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
        "B05→B06 handoff entry atom is P01-B06-A01",
      );
    }
    case "bench.b05_invariant_sealed": {
      const handoff = getForgeP01B05ToB06Handoff();
      const coverage = summarizePipelineInvariantEngineContractCoverage(
        getActivePipelineInvariantEngineContract(),
      );
      const ok =
        handoff.sealedArtifacts.probeCount === coverage.totalProbes &&
        handoff.sealedArtifacts.contractVersion === getActivePipelineInvariantEngineContract().version;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoff_probes=${handoff.sealedArtifacts.probeCount}, contract_probes=${coverage.totalProbes}`,
        "Sealed B05 handoff probe count matches active pipeline invariant engine contract",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown baseline_link probe");
  }
}

function probeBoundary(
  id: string,
  category: BenchmarkEvalCategory,
  expected: ForgeAcceptanceOutcome,
): BenchmarkEvalProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "bench.quality_metrics_tracked": {
      const ok = src.includes('phase: "atom_quality"') && src.includes("tokenCost:");
      return probe(
        id,
        category,
        expected,
        ok,
        `qualityMetrics=${ok}`,
        "Orchestrator emits atom_quality verification with tokenCost metrics",
      );
    }
    case "bench.observer_wired": {
      const ok =
        src.includes("PipelineObserver") &&
        src.includes("this.observer.onOrchestratorEvent");
      return probe(
        id,
        category,
        expected,
        ok,
        `observerWired=${ok}`,
        "PipelineObserver receives orchestrator events for observability",
      );
    }
    case "bench.eval_harness_orchestrator_wired": {
      const ok =
        src.includes("forge-benchmark-eval-harness") &&
        (src.includes("verifyForgeBenchmarkEvalRegression") ||
          src.includes("runBenchmarkEvalHarnessProbes"));
      return probe(
        id,
        category,
        expected,
        ok,
        `evalHarnessWired=${ok}`,
        "Orchestrator imports and wires benchmark eval harness for live validation",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: BenchmarkEvalCategory,
  expected: ForgeAcceptanceOutcome,
): BenchmarkEvalProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "bench.failure_pipeline_timing_on_block": {
      const ok =
        src.includes('type: "block_detected"') &&
        (src.includes("finalizePipeline") || src.includes("pipelineStartTime"));
      return probe(
        id,
        category,
        expected,
        ok,
        `timingOnBlock=${ok}`,
        "Block path preserves pipeline timing finalization for benchmark capture",
      );
    }
    case "bench.failure_cost_on_block": {
      const ok =
        src.includes("costTracker.formatReport") &&
        src.includes('type: "block_detected"');
      return probe(
        id,
        category,
        expected,
        ok,
        `costOnBlock=${ok}`,
        "Cost tracker remains available when block_detected halts pipeline",
      );
    }
    case "bench.failure_eval_harness_on_block": {
      const ok =
        src.includes("validateEvalOnBlock") ||
        (src.includes("forge-benchmark-eval-harness") && src.includes("block_detected"));
      return probe(
        id,
        category,
        expected,
        ok,
        `evalOnBlock=${ok}`,
        "Benchmark eval harness validates metrics capture on block_detected path",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: BenchmarkEvalCategory,
  expected: ForgeAcceptanceOutcome,
): BenchmarkEvalProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "bench.recovery_resume_wired": {
      const ok = src.includes("runRecoveryPhase") || src.includes("recoveryPhase");
      return probe(
        id,
        category,
        expected,
        ok,
        `recoveryResume=${ok}`,
        "Recovery phase wired for pipeline resume after failure",
      );
    }
    case "bench.recovery_re_decompose": {
      const ok = src.includes("re_decompose") || src.includes('"re_decompose"');
      return probe(
        id,
        category,
        expected,
        ok,
        `reDecompose=${ok}`,
        "re_decompose phase wired on block failure threshold for replan recovery",
      );
    }
    case "bench.recovery_eval_baseline_reset": {
      const ok =
        src.includes("resetEvalBaseline") ||
        (src.includes("forge-benchmark-eval-harness") && src.includes("recovery"));
      return probe(
        id,
        category,
        expected,
        ok,
        `evalBaselineReset=${ok}`,
        "Benchmark eval harness resets baseline metrics on recovery transition",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: BenchmarkEvalCategory,
  expected: ForgeAcceptanceOutcome,
): BenchmarkEvalProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "bench.nogo_reviewer_reject": {
      const ok =
        src.includes('reviewResult.verdict === "REJECT"') &&
        src.includes("rollbackLastAtom");
      return probe(
        id,
        category,
        expected,
        ok,
        `rejectRollback=${ok}`,
        'reviewResult.verdict === "REJECT" triggers rollbackLastAtom before retry',
      );
    }
    case "bench.nogo_format_retry": {
      const ok =
        src.includes('type: "format_retry"') &&
        src.includes("attempt:") &&
        src.includes("missing:");
      return probe(
        id,
        category,
        expected,
        ok,
        `formatRetryGate=${ok}`,
        "format_retry emitted with attempt and missing fields before atom retry",
      );
    }
    case "bench.nogo_eval_gate_on_reject": {
      const ok =
        src.includes("validateEvalOnReject") ||
        (src.includes("forge-benchmark-eval-harness") &&
          src.includes('verdict === "REJECT"'));
      return probe(
        id,
        category,
        expected,
        ok,
        `evalGateOnReject=${ok}`,
        "Benchmark eval harness enforces NO-GO metrics gate on reviewer REJECT",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: BenchmarkEvalCategory,
  expected: ForgeAcceptanceOutcome,
): BenchmarkEvalProbeResult {
  switch (category) {
    case "latency_timing":
      return probeLatencyTiming(id, category, expected);
    case "token_cost":
      return probeTokenCost(id, category, expected);
    case "eval_suite":
      return probeEvalSuite(id, category, expected);
    case "reproducibility":
      return probeReproducibility(id, category, expected);
    case "baseline_link":
      return probeBaselineLink(id, category, expected);
    case "boundary":
      return probeBoundary(id, category, expected);
    case "failure_path":
      return probeFailurePath(id, category, expected);
    case "recovery_path":
      return probeRecoveryPath(id, category, expected);
    case "nogo_path":
      return probeNogoPath(id, category, expected);
    default:
      return probe(id, category, expected, false, `unknown category: ${category}`);
  }
}

export function loadBenchmarkEvalHarnessFixture(): BenchmarkEvalFixture {
  return benchmarkEvalFixture as BenchmarkEvalFixture;
}

export function runBenchmarkEvalHarnessProbes(
  fixture: BenchmarkEvalFixture = loadBenchmarkEvalHarnessFixture(),
): BenchmarkEvalProbeResult[] {
  return fixture.probes.map(entry => runSingleProbe(entry.id, entry.category, entry.expected));
}

export function listBenchmarkEvalHarnessKnownGaps(
  results: BenchmarkEvalProbeResult[] = runBenchmarkEvalHarnessProbes(),
): BenchmarkEvalProbeResult[] {
  return summarizeBenchmarkEvalHarnessMatrix(results).knownGaps;
}
