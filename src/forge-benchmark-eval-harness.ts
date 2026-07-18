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
