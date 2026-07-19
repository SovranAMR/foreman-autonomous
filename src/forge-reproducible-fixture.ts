/**
 * FOREMAN — Reproducible Fixture System Baseline (P01-B07)
 *
 * Measures reproducible fixture infrastructure on sealed P01-B06
 * benchmark eval harness artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP01B06ToB07Handoff,
  getActiveBenchmarkEvalContract,
  summarizeBenchmarkEvalContractCoverage,
  BENCHMARK_EVAL_CATEGORIES,
} from "./forge-benchmark-eval-harness.js";

export const FORGE_REPRODUCIBLE_FIXTURE_VERSION = "1.0.0-a01";

export const REPRODUCIBLE_FIXTURE_CATEGORIES = [
  "fixture_versioning",
  "fixture_integrity",
  "deterministic_load",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type ReproducibleFixtureCategory = (typeof REPRODUCIBLE_FIXTURE_CATEGORIES)[number];

export const SEALED_FORGE_FIXTURE_FILES = [
  "forge-baseline-v1.json",
  "forge-pipeline-behavior-map-v1.json",
  "forge-formal-state-machine-v1.json",
  "forge-phase-event-schema-v1.json",
  "forge-pipeline-invariant-engine-v1.json",
  "forge-benchmark-eval-harness-v1.json",
] as const;

export interface ReproducibleFixtureEntry {
  id: string;
  category: ReproducibleFixtureCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface ReproducibleFixtureBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBenchmarkEval: {
    version: string;
    atom: string;
    contractVersion: string;
    probeCount: number;
    benchmarkEvalCategories: number;
  };
  probes: ReproducibleFixtureEntry[];
}

export interface ReproducibleFixtureProbeResult {
  id: string;
  category: ReproducibleFixtureCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface ReproducibleFixtureProbeSummary {
  total: number;
  aligned: number;
  mismatches: ReproducibleFixtureProbeResult[];
  knownGaps: ReproducibleFixtureProbeResult[];
  byCategory: Record<
    ReproducibleFixtureCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface ReproducibleFixtureValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: ReproducibleFixtureCategory;
  detail: string;
}

export interface ReproducibleFixtureValidationResult {
  valid: boolean;
  issues: ReproducibleFixtureValidationIssue[];
}

/** Minimum probes per category for A01 baseline slice. */
export const REPRODUCIBLE_FIXTURE_A01_MIN_PROBES: Readonly<
  Record<ReproducibleFixtureCategory, number>
> = {
  fixture_versioning: 3,
  fixture_integrity: 3,
  deterministic_load: 3,
  baseline_link: 2,
  boundary: 3,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

export function buildDefaultReproducibleSourceBenchmarkEval(): ReproducibleFixtureBaseline["sourceBenchmarkEval"] {
  const contract = getActiveBenchmarkEvalContract();
  const coverage = summarizeBenchmarkEvalContractCoverage(contract);
  const handoff = getForgeP01B06ToB07Handoff();
  return {
    version: handoff.sealedArtifacts.fixtureVersion,
    atom: "P01-B06-A10",
    contractVersion: contract.version,
    probeCount: coverage.totalProbes,
    benchmarkEvalCategories: BENCHMARK_EVAL_CATEGORIES.length,
  };
}

export function validateReproducibleFixtureBaseline(
  fixture: ReproducibleFixtureBaseline,
): ReproducibleFixtureValidationResult {
  const issues: ReproducibleFixtureValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P01-B07-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory: Record<ReproducibleFixtureCategory, number> = {
    fixture_versioning: 0,
    fixture_integrity: 0,
    deterministic_load: 0,
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

  for (const category of REPRODUCIBLE_FIXTURE_CATEGORIES) {
    const min = REPRODUCIBLE_FIXTURE_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP01B06ToB07Handoff();
  if (fixture.sourceBenchmarkEval.probeCount !== handoff.sealedArtifacts.probeCount) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBenchmarkEval.probeCount=${fixture.sourceBenchmarkEval.probeCount} handoff=${handoff.sealedArtifacts.probeCount}`,
    });
  }
  if (
    fixture.sourceBenchmarkEval.benchmarkEvalCategories !==
    handoff.sealedArtifacts.benchmarkEvalCategories.length
  ) {
    issues.push({
      kind: "missing_probe",
      detail: "sourceBenchmarkEval.benchmarkEvalCategories mismatch with B06 handoff",
    });
  }
  if (fixture.sourceBenchmarkEval.contractVersion !== handoff.sealedArtifacts.contractVersion) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBenchmarkEval.contractVersion=${fixture.sourceBenchmarkEval.contractVersion} handoff=${handoff.sealedArtifacts.contractVersion}`,
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

export function summarizeReproducibleFixtureMatrix(
  results: ReproducibleFixtureProbeResult[],
): ReproducibleFixtureProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as ReproducibleFixtureProbeSummary["byCategory"];
  for (const cat of REPRODUCIBLE_FIXTURE_CATEGORIES) {
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

export function listReproducibleFixtureProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: ReproducibleFixtureBaseline,
): ReproducibleFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listReproducibleFixtureKnownGaps(
  results: ReproducibleFixtureProbeResult[],
): ReproducibleFixtureProbeResult[] {
  return summarizeReproducibleFixtureMatrix(results).knownGaps;
}
