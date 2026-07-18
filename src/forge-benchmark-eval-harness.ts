/**
 * FOREMAN — Benchmark & Eval Harness Baseline (P01-B06)
 *
 * Measures orchestrator benchmark/eval observability on sealed P01-B05
 * pipeline invariant engine artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP01B05ToB06Handoff,
  getActivePipelineInvariantEngineContract,
  summarizePipelineInvariantEngineContractCoverage,
  PIPELINE_INVARIANT_ENGINE_CATEGORIES,
} from "./forge-pipeline-invariant-engine.js";

export const FORGE_BENCHMARK_EVAL_HARNESS_VERSION = "1.0.0-a01";

export const BENCHMARK_EVAL_CATEGORIES = [
  "latency_timing",
  "token_cost",
  "eval_suite",
  "reproducibility",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type BenchmarkEvalCategory = (typeof BENCHMARK_EVAL_CATEGORIES)[number];

export interface BenchmarkEvalFixtureEntry {
  id: string;
  category: BenchmarkEvalCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface BenchmarkEvalFixture {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourcePipelineInvariantEngine: {
    version: string;
    atom: string;
    contractVersion: string;
    probeCount: number;
    invariantCategories: number;
  };
  probes: BenchmarkEvalFixtureEntry[];
}

export interface BenchmarkEvalProbeResult {
  id: string;
  category: BenchmarkEvalCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface BenchmarkEvalProbeSummary {
  total: number;
  aligned: number;
  mismatches: BenchmarkEvalProbeResult[];
  knownGaps: BenchmarkEvalProbeResult[];
  byCategory: Record<
    BenchmarkEvalCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface BenchmarkEvalFixtureValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: BenchmarkEvalCategory;
  detail: string;
}

export interface BenchmarkEvalFixtureValidationResult {
  valid: boolean;
  issues: BenchmarkEvalFixtureValidationIssue[];
}

/** Minimum probes per category for A01 baseline slice. */
export const BENCHMARK_EVAL_A01_MIN_PROBES: Readonly<Record<BenchmarkEvalCategory, number>> = {
  latency_timing: 3,
  token_cost: 3,
  eval_suite: 3,
  reproducibility: 3,
  baseline_link: 2,
  boundary: 3,
  failure_path: 3,
  recovery_path: 3,
  nogo_path: 3,
};

export type BenchmarkEvalProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface BenchmarkEvalProbeContract {
  id: string;
  category: BenchmarkEvalCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: BenchmarkEvalProbeDisposition;
  criterion: string;
}

export interface BenchmarkEvalCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface BenchmarkEvalCategoryContract {
  category: BenchmarkEvalCategory;
  acceptance: BenchmarkEvalCategoryAcceptance;
  probes: readonly BenchmarkEvalProbeContract[];
}

export interface BenchmarkEvalContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<BenchmarkEvalCategory, BenchmarkEvalCategoryContract>;
  probes: readonly BenchmarkEvalProbeContract[];
}

function flattenBenchmarkEvalCategoryProbes(
  categories: Record<BenchmarkEvalCategory, BenchmarkEvalCategoryContract>,
): readonly BenchmarkEvalProbeContract[] {
  return BENCHMARK_EVAL_CATEGORIES.flatMap(category => categories[category].probes);
}

const BENCHMARK_EVAL_CATEGORY_CONTRACTS: Record<
  BenchmarkEvalCategory,
  BenchmarkEvalCategoryContract
> = {
  latency_timing: {
    category: "latency_timing",
    acceptance: {
      invariant:
        "Pipeline latency observability via pipelineStartTime initialization, duration logging, and phase timing collection.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "bench.pipeline_duration_logged",
        category: "latency_timing",
        description: "Pipeline completion logs duration derived from pipelineStartTime",
        expected: "PASS",
        disposition: "observed",
        criterion: "Pipeline completion logs duration derived from pipelineStartTime",
      },
      {
        id: "bench.pipeline_start_time_set",
        category: "latency_timing",
        description: "pipelineStartTime initialized at pipeline run start",
        expected: "PASS",
        disposition: "observed",
        criterion: "pipelineStartTime initialized at pipeline run start",
      },
      {
        id: "bench.phase_timing_collector",
        category: "latency_timing",
        description: "phaseTimings map populated during pipeline phases for latency eval",
        expected: "FAIL",
        disposition: "gap",
        criterion: "phaseTimings map populated during pipeline phases for latency eval",
      },
    ],
  },
  token_cost: {
    category: "token_cost",
    acceptance: {
      invariant:
        "Token and cost observability via per-phase token maps, session budget gates, and phase-level budget caps.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "bench.phase_token_map",
        category: "token_cost",
        description: "Orchestrator tracks per-phase token usage in phaseTokens map",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator tracks per-phase token usage in phaseTokens map",
      },
      {
        id: "bench.session_budget_gate",
        category: "token_cost",
        description: "Session token budget gate halts pipeline when exceeded",
        expected: "PASS",
        disposition: "observed",
        criterion: "Session token budget gate halts pipeline when exceeded",
      },
      {
        id: "bench.phase_budget_caps",
        category: "token_cost",
        description: "Phase-level token budget caps enforced via PHASE_BUDGET_PCT",
        expected: "PASS",
        disposition: "observed",
        criterion: "Phase-level token budget caps enforced via PHASE_BUDGET_PCT",
      },
    ],
  },
  eval_suite: {
    category: "eval_suite",
    acceptance: {
      invariant:
        "Forge regression and guard eval suite exports wired on orchestrator with benchmark eval regression gate.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "bench.forge_regression_exports",
        category: "eval_suite",
        description: "Orchestrator exports verifyForge*Regression gate methods",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator exports verifyForge*Regression gate methods",
      },
      {
        id: "bench.forge_guard_exports",
        category: "eval_suite",
        description: "Orchestrator exports verifyForge*Guard gate methods",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator exports verifyForge*Guard gate methods",
      },
      {
        id: "bench.benchmark_regression_export",
        category: "eval_suite",
        description: "Orchestrator exports verifyForgeBenchmarkEvalRegression eval gate",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator exports verifyForgeBenchmarkEvalRegression eval gate",
      },
    ],
  },
  reproducibility: {
    category: "reproducibility",
    acceptance: {
      invariant:
        "Reproducible benchmark runs via pipeline resume checkpoints, deterministic eval seed, and fixture hash provenance.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "bench.pipeline_resume_checkpoint",
        category: "reproducibility",
        description: "PipelineResumeEngine checkpoints pipeline phase for reproducible resume",
        expected: "PASS",
        disposition: "observed",
        criterion: "PipelineResumeEngine checkpoints pipeline phase for reproducible resume",
      },
      {
        id: "bench.deterministic_eval_seed",
        category: "reproducibility",
        description: "Orchestrator accepts deterministic eval seed for reproducible benchmark runs",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator accepts deterministic eval seed for reproducible benchmark runs",
      },
      {
        id: "bench.fixture_hash_provenance",
        category: "reproducibility",
        description: "Eval harness records fixture hash provenance on benchmark runs",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Eval harness records fixture hash provenance on benchmark runs",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Benchmark eval harness baseline links to sealed P01-B05 pipeline invariant engine handoff artifacts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "bench.b05_handoff_target",
        category: "baseline_link",
        description: "FORGE_P01_B05_TO_B06_HANDOFF_V1 targets P01-B06-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "B05→B06 handoff entry atom is P01-B06-A01",
      },
      {
        id: "bench.b05_invariant_sealed",
        category: "baseline_link",
        description: "Sealed B05 pipeline invariant engine probe count matches handoff artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Sealed B05 handoff probe count matches active pipeline invariant engine contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Quality metrics, pipeline observer, and benchmark eval harness orchestrator wiring for live validation.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "bench.quality_metrics_tracked",
        category: "boundary",
        description: "Orchestrator emits atom_quality verification with tokenCost metrics",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator emits atom_quality verification with tokenCost metrics",
      },
      {
        id: "bench.observer_wired",
        category: "boundary",
        description: "PipelineObserver receives orchestrator events for observability",
        expected: "PASS",
        disposition: "observed",
        criterion: "PipelineObserver receives orchestrator events for observability",
      },
      {
        id: "bench.eval_harness_orchestrator_wired",
        category: "boundary",
        description: "Orchestrator imports and wires benchmark eval harness for live validation",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator imports and wires benchmark eval harness for live validation",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant:
        "Benchmark metrics capture preserved on block_detected failure path with eval harness validation.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "bench.failure_pipeline_timing_on_block",
        category: "failure_path",
        description: "Block path preserves pipeline timing finalization for benchmark capture",
        expected: "PASS",
        disposition: "failure",
        criterion: "Block path preserves pipeline timing finalization for benchmark capture",
      },
      {
        id: "bench.failure_cost_on_block",
        category: "failure_path",
        description: "Cost tracker remains available when block_detected halts pipeline",
        expected: "PASS",
        disposition: "failure",
        criterion: "Cost tracker remains available when block_detected halts pipeline",
      },
      {
        id: "bench.failure_eval_harness_on_block",
        category: "failure_path",
        description: "Benchmark eval harness validates metrics capture on block_detected path",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Benchmark eval harness validates metrics capture on block_detected path",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Recovery transitions wired with resume and re_decompose plus eval baseline reset on recovery.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "bench.recovery_resume_wired",
        category: "recovery_path",
        description: "Recovery phase wired for pipeline resume after failure",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Recovery phase wired for pipeline resume after failure",
      },
      {
        id: "bench.recovery_re_decompose",
        category: "recovery_path",
        description: "re_decompose phase wired on block failure threshold for replan recovery",
        expected: "PASS",
        disposition: "recovery",
        criterion: "re_decompose phase wired on block failure threshold for replan recovery",
      },
      {
        id: "bench.recovery_eval_baseline_reset",
        category: "recovery_path",
        description: "Benchmark eval harness resets baseline metrics on recovery transition",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Benchmark eval harness resets baseline metrics on recovery transition",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "NO-GO gates enforce reviewer REJECT rollback, format_retry validation, and eval metrics gate on reject.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "bench.nogo_reviewer_reject",
        category: "nogo_path",
        description: "reviewResult.verdict === REJECT triggers rollbackLastAtom before retry",
        expected: "PASS",
        disposition: "nogo",
        criterion: 'reviewResult.verdict === "REJECT" triggers rollbackLastAtom before retry',
      },
      {
        id: "bench.nogo_format_retry",
        category: "nogo_path",
        description: "format_retry emitted with attempt and missing fields before atom retry",
        expected: "PASS",
        disposition: "nogo",
        criterion: "format_retry emitted with attempt and missing fields before atom retry",
      },
      {
        id: "bench.nogo_eval_gate_on_reject",
        category: "nogo_path",
        description: "Benchmark eval harness enforces NO-GO metrics gate on reviewer REJECT",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Benchmark eval harness enforces NO-GO metrics gate on reviewer REJECT",
      },
    ],
  },
};

/** Typed benchmark eval contract v1 — source of truth for measurable acceptance. */
export const FORGE_BENCHMARK_EVAL_CONTRACT_V1: BenchmarkEvalContract = {
  version: "1.0.0",
  atom: "P01-B06-A05",
  purpose:
    "Measurable acceptance criteria for orchestrator benchmark and eval harness (latency, token cost, eval suite, reproducibility, B05 link, boundary).",
  categories: BENCHMARK_EVAL_CATEGORY_CONTRACTS,
  probes: flattenBenchmarkEvalCategoryProbes(BENCHMARK_EVAL_CATEGORY_CONTRACTS),
};

export function getActiveBenchmarkEvalContract(): BenchmarkEvalContract {
  return FORGE_BENCHMARK_EVAL_CONTRACT_V1;
}

export function getBenchmarkEvalCategoryContract(
  category: BenchmarkEvalCategory,
  contract: BenchmarkEvalContract = getActiveBenchmarkEvalContract(),
): BenchmarkEvalCategoryContract {
  return contract.categories[category];
}

export function listBenchmarkEvalContractProbeIds(
  contract: BenchmarkEvalContract = getActiveBenchmarkEvalContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listBenchmarkEvalProbesByDisposition(
  disposition: BenchmarkEvalProbeDisposition,
  contract: BenchmarkEvalContract = getActiveBenchmarkEvalContract(),
): BenchmarkEvalProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listBenchmarkEvalProbesByCategory(
  category: BenchmarkEvalCategory,
  contract: BenchmarkEvalContract = getActiveBenchmarkEvalContract(),
): BenchmarkEvalProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeBenchmarkEvalContractCoverage(
  contract: BenchmarkEvalContract = getActiveBenchmarkEvalContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<BenchmarkEvalCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<BenchmarkEvalProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    BenchmarkEvalCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<BenchmarkEvalProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of BENCHMARK_EVAL_CATEGORIES) {
    const categoryContract = contract.categories[category];
    byCategory[category] = {
      probeCount: categoryContract.probes.length,
      invariant: categoryContract.acceptance.invariant,
    };
    for (const probe of categoryContract.probes) {
      totalProbes++;
      if (probe.expected === "PASS") expectedPass++;
      else expectedFail++;
      byDisposition[probe.disposition]++;
    }
  }

  return { totalProbes, expectedPass, expectedFail, byCategory, byDisposition };
}

export function validateBenchmarkEvalHarnessFixtureAgainstContract(
  fixture: BenchmarkEvalFixture,
  contract: BenchmarkEvalContract = getActiveBenchmarkEvalContract(),
): BenchmarkEvalFixtureValidationResult {
  const issues: BenchmarkEvalFixtureValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of BENCHMARK_EVAL_CATEGORIES) {
    const categoryContract = contract.categories[category];
    const categoryProbes = fixture.probes.filter(p => p.category === category);
    if (categoryProbes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${categoryProbes.length} probes; contract requires >= ${categoryContract.acceptance.minProbeCount}`,
      });
    }
  }

  for (const probe of contract.probes) {
    if (!fixtureIds.has(probe.id)) {
      issues.push({ kind: "missing_probe", probeId: probe.id, detail: `fixture missing ${probe.id}` });
    }
  }

  for (const entry of fixture.probes) {
    if (!contractIds.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: `fixture extra ${entry.id}` });
      continue;
    }
    const expected = contract.probes.find(p => p.id === entry.id)!;
    if (entry.expected !== expected.expected) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `expected mismatch fixture=${entry.expected} contract=${expected.expected}`,
      });
    }
    if (entry.description !== expected.description) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `description mismatch for ${entry.id}`,
      });
    }
    if (entry.category !== expected.category) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `category mismatch fixture=${entry.category} contract=${expected.category}`,
      });
    }
  }

  const expectedFailCount = contract.probes.filter(p => p.expected === "FAIL").length;
  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (expectedFailCount > 0 && failGaps.length === 0) {
    issues.push({ kind: "missing_category", detail: "fixture must document known FAIL gaps matching contract" });
  }
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_probe",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${expectedFailCount}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

export function buildDefaultBenchmarkEvalSourcePipelineInvariantEngine(): BenchmarkEvalFixture["sourcePipelineInvariantEngine"] {
  const contract = getActivePipelineInvariantEngineContract();
  const coverage = summarizePipelineInvariantEngineContractCoverage(contract);
  return {
    version: "1.0.0",
    atom: "P01-B05-A10",
    contractVersion: contract.version,
    probeCount: coverage.totalProbes,
    invariantCategories: PIPELINE_INVARIANT_ENGINE_CATEGORIES.length,
  };
}

export function validateBenchmarkEvalHarnessFixture(
  fixture: BenchmarkEvalFixture,
): BenchmarkEvalFixtureValidationResult {
  const issues: BenchmarkEvalFixtureValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P01-B06-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory: Record<BenchmarkEvalCategory, number> = {
    latency_timing: 0,
    token_cost: 0,
    eval_suite: 0,
    reproducibility: 0,
    baseline_link: 0,
    boundary: 0,
    failure_path: 0,
    recovery_path: 0,
    nogo_path: 0,
  };

  for (const probe of fixture.probes) {
    if (ids.has(probe.id)) {
      issues.push({ kind: "extra_probe", probeId: probe.id, detail: "duplicate probe id" });
    }
    ids.add(probe.id);
    byCategory[probe.category]++;
  }

  for (const category of BENCHMARK_EVAL_CATEGORIES) {
    const min = BENCHMARK_EVAL_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP01B05ToB06Handoff();
  if (fixture.sourcePipelineInvariantEngine.probeCount !== handoff.sealedArtifacts.probeCount) {
    issues.push({
      kind: "missing_probe",
      detail: `sourcePipelineInvariantEngine.probeCount=${fixture.sourcePipelineInvariantEngine.probeCount} handoff=${handoff.sealedArtifacts.probeCount}`,
    });
  }
  if (
    fixture.sourcePipelineInvariantEngine.invariantCategories !==
    handoff.sealedArtifacts.invariantCategories.length
  ) {
    issues.push({
      kind: "missing_probe",
      detail: "sourcePipelineInvariantEngine.invariantCategories mismatch with B05 handoff",
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length < 1) {
    issues.push({
      kind: "missing_category",
      detail: "A01 fixture must document at least one known FAIL gap",
    });
  }

  return { valid: issues.length === 0, issues };
}

export function summarizeBenchmarkEvalHarnessMatrix(
  results: BenchmarkEvalProbeResult[],
): BenchmarkEvalProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as BenchmarkEvalProbeSummary["byCategory"];
  for (const cat of BENCHMARK_EVAL_CATEGORIES) {
    byCategory[cat] = { total: 0, aligned: 0, expectedFail: 0 };
  }

  for (const result of results) {
    const bucket = byCategory[result.category];
    bucket.total++;
    if (result.aligned) bucket.aligned++;
    if (result.expected === "FAIL") bucket.expectedFail++;
  }

  return {
    total: results.length,
    aligned: results.length - mismatches.length,
    mismatches,
    knownGaps,
    byCategory,
  };
}

export function listBenchmarkEvalHarnessProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: BenchmarkEvalFixture,
): BenchmarkEvalFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}
