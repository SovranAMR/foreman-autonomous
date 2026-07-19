/**
 * FOREMAN — Reproducible Fixture System Baseline (P01-B07)
 *
 * Measures reproducible fixture infrastructure on sealed P01-B06
 * benchmark eval harness artifacts.
 */

import { createHash } from "node:crypto";
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP01B06ToB07Handoff,
  getActiveBenchmarkEvalContract,
  summarizeBenchmarkEvalContractCoverage,
  BENCHMARK_EVAL_CATEGORIES,
} from "./forge-benchmark-eval-harness.js";

export const FORGE_REPRODUCIBLE_FIXTURE_VERSION = "1.0.0-a07";

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

export type ReproducibleFixtureProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface ReproducibleFixtureProbeContract {
  id: string;
  category: ReproducibleFixtureCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: ReproducibleFixtureProbeDisposition;
  criterion: string;
}

export interface ReproducibleFixtureCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface ReproducibleFixtureCategoryContract {
  category: ReproducibleFixtureCategory;
  acceptance: ReproducibleFixtureCategoryAcceptance;
  probes: readonly ReproducibleFixtureProbeContract[];
}

export interface ReproducibleFixtureContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<ReproducibleFixtureCategory, ReproducibleFixtureCategoryContract>;
  probes: readonly ReproducibleFixtureProbeContract[];
}

export interface ReproducibleFixtureContractCoverageIssue {
  kind: "missing_category" | "underflow" | "missing_criterion" | "coverage_mismatch" | "duplicate_probe";
  category?: ReproducibleFixtureCategory;
  probeId?: string;
  detail: string;
}

export interface ReproducibleFixtureContractCoverageResult {
  valid: boolean;
  issues: ReproducibleFixtureContractCoverageIssue[];
}

function flattenReproducibleFixtureCategoryProbes(
  categories: Record<ReproducibleFixtureCategory, ReproducibleFixtureCategoryContract>,
): readonly ReproducibleFixtureProbeContract[] {
  return REPRODUCIBLE_FIXTURE_CATEGORIES.flatMap(category => categories[category].probes);
}

const REPRODUCIBLE_FIXTURE_CATEGORY_CONTRACTS: Record<
  ReproducibleFixtureCategory,
  ReproducibleFixtureCategoryContract
> = {
  fixture_versioning: {
    category: "fixture_versioning",
    acceptance: {
      invariant:
        "Sealed forge fixture JSON files are version-tagged and discoverable under src/fixtures with semver metadata.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "fix.sealed_fixture_files",
        category: "fixture_versioning",
        description: "All six sealed forge baseline fixture JSON files exist under src/fixtures",
        expected: "PASS",
        disposition: "observed",
        criterion: "All six sealed forge baseline fixture JSON files exist under src/fixtures",
      },
      {
        id: "fix.version_tagged",
        category: "fixture_versioning",
        description: "Reproducible fixture baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Reproducible fixture baseline declares semver version field",
      },
      {
        id: "fix.atom_tagged",
        category: "fixture_versioning",
        description: "Reproducible fixture baseline declares P01-B07-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Reproducible fixture baseline declares P01-B07-A01 atom id",
      },
    ],
  },
  fixture_integrity: {
    category: "fixture_integrity",
    acceptance: {
      invariant:
        "Fixture imports are typed and content-addressable digests or hash sidecars enforce fixture integrity.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "fix.json_stable_import",
        category: "fixture_integrity",
        description: "Forge harness modules import fixtures with typed JSON import assertions",
        expected: "PASS",
        disposition: "observed",
        criterion: "Forge harness modules import fixtures with typed JSON import assertions",
      },
      {
        id: "fix.canonical_fixture_hash",
        category: "fixture_integrity",
        description: "Central canonicalFixtureHash computes stable SHA-256 over fixture content",
        expected: "PASS",
        disposition: "observed",
        criterion: "Central canonicalFixtureHash computes stable SHA-256 over fixture content",
      },
      {
        id: "fix.content_addressable_store",
        category: "fixture_integrity",
        description: "Fixture hash sidecar or registry stores content-addressable fixture digests",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Fixture hash sidecar or registry stores content-addressable fixture digests",
      },
    ],
  },
  deterministic_load: {
    category: "deterministic_load",
    acceptance: {
      invariant:
        "Versioned baseline loaders are idempotent and support deterministic eval seed wiring for reproducible runs.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "fix.load_reproducible_baseline",
        category: "deterministic_load",
        description: "loadReproducibleFixtureBaseline exports versioned baseline loader",
        expected: "PASS",
        disposition: "observed",
        criterion: "loadReproducibleFixtureBaseline exports versioned baseline loader",
      },
      {
        id: "fix.validate_reproducible_baseline",
        category: "deterministic_load",
        description: "validateReproducibleFixtureBaseline validates fixture structure and B06 handoff",
        expected: "PASS",
        disposition: "observed",
        criterion: "validateReproducibleFixtureBaseline validates fixture structure and B06 handoff",
      },
      {
        id: "fix.deterministic_eval_seed",
        category: "deterministic_load",
        description: "Orchestrator accepts deterministic eval seed for reproducible benchmark runs",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator accepts deterministic eval seed for reproducible benchmark runs",
      },
      {
        id: "fix.fixture_load_idempotent",
        category: "deterministic_load",
        description: "Repeated loadReproducibleFixtureBaseline returns identical fixture snapshot",
        expected: "PASS",
        disposition: "observed",
        criterion: "Repeated loadReproducibleFixtureBaseline returns identical fixture snapshot",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Reproducible fixture baseline links to sealed B06 benchmark eval handoff with aligned probe counts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "fix.b06_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P01_B06_TO_B07_HANDOFF_V1 targets P01-B07-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P01_B06_TO_B07_HANDOFF_V1 targets P01-B07-A01 entry atom",
      },
      {
        id: "fix.b06_sealed_probe_count",
        category: "baseline_link",
        description: "Sealed B06 handoff probeCount matches active benchmark eval contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "Sealed B06 handoff probeCount matches active benchmark eval contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Baseline fixture references sealed sourceBenchmarkEval artifacts and documents measurable FAIL gaps.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "fix.source_benchmark_eval_ref",
        category: "boundary",
        description: "Baseline fixture references sealed sourceBenchmarkEval artifacts from B06-A10",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed sourceBenchmarkEval artifacts from B06-A10",
      },
      {
        id: "fix.probe_runner_exported",
        category: "boundary",
        description: "runReproducibleFixtureProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runReproducibleFixtureProbes executes contract-wired probe matrix",
      },
      {
        id: "fix.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL reproducibility gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL reproducibility gap",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant:
        "validateReproducibleFixtureBaseline rejects invalid versions and enforces per-category minimum probe counts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "fix.invalid_version_rejected",
        category: "failure_path",
        description: "validateReproducibleFixtureBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateReproducibleFixtureBaseline rejects unexpected fixture version",
      },
      {
        id: "fix.min_category_probes",
        category: "failure_path",
        description: "validateReproducibleFixtureBaseline enforces per-category minimum probe counts",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateReproducibleFixtureBaseline enforces per-category minimum probe counts",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Recovery loaders fall back on missing fixture files and reset baseline metrics on recovery transitions.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "fix.recovery_missing_fixture_file",
        category: "recovery_path",
        description: "Recovery loader falls back when versioned fixture file is missing",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Recovery loader falls back when versioned fixture file is missing",
      },
      {
        id: "fix.recovery_baseline_reset",
        category: "recovery_path",
        description: "Reproducible fixture harness resets baseline metrics on recovery transition",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Reproducible fixture harness resets baseline metrics on recovery transition",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "NO-GO gates halt eval on reproducible fixture drift and reject runs when canonical hash mismatches registry.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "fix.nogo_fixture_drift_gate",
        category: "nogo_path",
        description: "NO-GO gate halts eval when reproducible fixture drift is detected",
        expected: "FAIL",
        disposition: "gap",
        criterion: "NO-GO gate halts eval when reproducible fixture drift is detected",
      },
      {
        id: "fix.nogo_hash_mismatch_gate",
        category: "nogo_path",
        description: "NO-GO gate rejects benchmark run when fixture canonical hash mismatches registry",
        expected: "FAIL",
        disposition: "gap",
        criterion: "NO-GO gate rejects benchmark run when fixture canonical hash mismatches registry",
      },
    ],
  },
};

/** Typed reproducible fixture contract v1 — source of truth for measurable acceptance. */
export const FORGE_REPRODUCIBLE_FIXTURE_CONTRACT_V1: ReproducibleFixtureContract = {
  version: "1.0.0",
  atom: "P01-B07-A05",
  purpose:
    "Measurable acceptance criteria for reproducible fixture system (versioning, integrity, deterministic load, B06 link, boundary, failure, recovery, NO-GO).",
  categories: REPRODUCIBLE_FIXTURE_CATEGORY_CONTRACTS,
  probes: flattenReproducibleFixtureCategoryProbes(REPRODUCIBLE_FIXTURE_CATEGORY_CONTRACTS),
};

export function getActiveReproducibleFixtureContract(): ReproducibleFixtureContract {
  return FORGE_REPRODUCIBLE_FIXTURE_CONTRACT_V1;
}

export function getReproducibleFixtureCategoryContract(
  category: ReproducibleFixtureCategory,
  contract: ReproducibleFixtureContract = getActiveReproducibleFixtureContract(),
): ReproducibleFixtureCategoryContract {
  return contract.categories[category];
}

export function listReproducibleFixtureContractProbeIds(
  contract: ReproducibleFixtureContract = getActiveReproducibleFixtureContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listReproducibleFixtureProbesByDisposition(
  disposition: ReproducibleFixtureProbeDisposition,
  contract: ReproducibleFixtureContract = getActiveReproducibleFixtureContract(),
): ReproducibleFixtureProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listReproducibleFixtureProbesByCategory(
  category: ReproducibleFixtureCategory,
  contract: ReproducibleFixtureContract = getActiveReproducibleFixtureContract(),
): ReproducibleFixtureProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeReproducibleFixtureContractCoverage(
  contract: ReproducibleFixtureContract = getActiveReproducibleFixtureContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<ReproducibleFixtureCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<ReproducibleFixtureProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    ReproducibleFixtureCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<ReproducibleFixtureProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of REPRODUCIBLE_FIXTURE_CATEGORIES) {
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

export function validateReproducibleFixtureContractCoverage(
  contract: ReproducibleFixtureContract = getActiveReproducibleFixtureContract(),
): ReproducibleFixtureContractCoverageResult {
  const issues: ReproducibleFixtureContractCoverageIssue[] = [];

  for (const category of REPRODUCIBLE_FIXTURE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < REPRODUCIBLE_FIXTURE_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${REPRODUCIBLE_FIXTURE_A01_MIN_PROBES[category]}`,
      });
    }
    if (categoryContract.probes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${categoryContract.probes.length} probes; contract requires >= ${categoryContract.acceptance.minProbeCount}`,
      });
    }
    if (categoryContract.acceptance.invariant.trim().length <= 20) {
      issues.push({
        kind: "missing_criterion",
        category,
        detail: `${category} invariant too short`,
      });
    }
    for (const probe of categoryContract.probes) {
      if (probe.criterion.trim().length <= 10) {
        issues.push({
          kind: "missing_criterion",
          probeId: probe.id,
          detail: `${probe.id} criterion too short`,
        });
      }
    }
  }

  const ids = listReproducibleFixtureContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeReproducibleFixtureContractCoverage(contract);
  if (summary.totalProbes !== ids.length) {
    issues.push({
      kind: "coverage_mismatch",
      detail: `totalProbes=${summary.totalProbes} ids=${ids.length}`,
    });
  }
  const dispositionSum =
    summary.byDisposition.observed +
    summary.byDisposition.gap +
    summary.byDisposition.failure +
    summary.byDisposition.recovery +
    summary.byDisposition.nogo;
  if (dispositionSum !== summary.totalProbes) {
    issues.push({
      kind: "coverage_mismatch",
      detail: `disposition sum=${dispositionSum} total=${summary.totalProbes}`,
    });
  }

  for (const probe of contract.probes) {
    if (!probe.id.startsWith("fix.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing fix. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateReproducibleFixtureBaselineAgainstContract(
  fixture: ReproducibleFixtureBaseline,
  contract: ReproducibleFixtureContract = getActiveReproducibleFixtureContract(),
): ReproducibleFixtureValidationResult {
  const issues: ReproducibleFixtureValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of REPRODUCIBLE_FIXTURE_CATEGORIES) {
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

export interface ReproducibleFixtureProbeMatrixValidationIssue {
  kind:
    | "missing_result"
    | "unexpected_mismatch"
    | "pass_mismatch"
    | "gap_misaligned"
    | "criterion_mismatch"
    | "extra_result";
  probeId?: string;
  detail: string;
}

export interface ReproducibleFixtureProbeMatrixValidationResult {
  valid: boolean;
  issues: ReproducibleFixtureProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Compute stable SHA-256 digest over fixture content for content-addressable integrity (P01-B07-A03).
 */
export function canonicalFixtureHash(content: string | Buffer | Record<string, unknown>): string {
  const payload =
    typeof content === "string" || Buffer.isBuffer(content)
      ? content
      : JSON.stringify(content);
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 * PASS probes must align; documented FAIL gaps must remain aligned (actual === FAIL).
 */
export function validateReproducibleFixtureProbeMatrix(
  results: ReproducibleFixtureProbeResult[],
  contract: ReproducibleFixtureContract = getActiveReproducibleFixtureContract(),
): ReproducibleFixtureProbeMatrixValidationResult {
  const issues: ReproducibleFixtureProbeMatrixValidationIssue[] = [];
  const resultById = new Map(results.map(r => [r.id, r]));
  let passAligned = 0;
  let gapAligned = 0;
  let unexpectedMismatches = 0;

  for (const contractProbe of contract.probes) {
    const result = resultById.get(contractProbe.id);
    if (!result) {
      issues.push({
        kind: "missing_result",
        probeId: contractProbe.id,
        detail: `probe matrix missing ${contractProbe.id}`,
      });
      unexpectedMismatches++;
      continue;
    }

    if (result.criterion && result.criterion !== contractProbe.criterion) {
      issues.push({
        kind: "criterion_mismatch",
        probeId: contractProbe.id,
        detail: `criterion mismatch result=${result.criterion} contract=${contractProbe.criterion}`,
      });
      unexpectedMismatches++;
    }

    if (contractProbe.expected === "PASS") {
      if (result.aligned) {
        passAligned++;
      } else {
        issues.push({
          kind: "pass_mismatch",
          probeId: contractProbe.id,
          detail: `PASS probe misaligned: expected=${result.expected} actual=${result.actual} (${result.detail})`,
        });
        unexpectedMismatches++;
      }
    } else if (contractProbe.expected === "FAIL") {
      if (result.aligned && result.actual === "FAIL") {
        gapAligned++;
      } else {
        issues.push({
          kind: "gap_misaligned",
          probeId: contractProbe.id,
          detail: `documented FAIL gap misaligned: expected=${result.expected} actual=${result.actual} (${result.detail})`,
        });
        unexpectedMismatches++;
      }
    } else if (!result.aligned) {
      issues.push({
        kind: "unexpected_mismatch",
        probeId: contractProbe.id,
        detail: `unexpected mismatch: expected=${result.expected} actual=${result.actual}`,
      });
      unexpectedMismatches++;
    }
  }

  for (const result of results) {
    if (!contract.probes.some(p => p.id === result.id)) {
      issues.push({
        kind: "extra_result",
        probeId: result.id,
        detail: `probe matrix extra ${result.id}`,
      });
      unexpectedMismatches++;
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    passAligned,
    gapAligned,
    unexpectedMismatches,
  };
}

/**
 * Validate boundary category probe matrix — A04 slice gate.
 * PASS boundary probes must align; documented FAIL gaps in boundary category preserved.
 */
export function validateReproducibleFixtureBoundaryProbeMatrix(
  results: ReproducibleFixtureProbeResult[],
  contract: ReproducibleFixtureContract = getActiveReproducibleFixtureContract(),
): ReproducibleFixtureProbeMatrixValidationResult {
  const boundaryProbes = listReproducibleFixtureProbesByCategory("boundary", contract);
  const boundaryContract: ReproducibleFixtureContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateReproducibleFixtureProbeMatrix(boundaryResults, boundaryContract);
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const REPRODUCIBLE_FIXTURE_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly ReproducibleFixtureCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes and documented FAIL gaps must align; zero unexpected mismatches.
 */
export function validateReproducibleFixtureFailureRecoveryProbeMatrix(
  results: ReproducibleFixtureProbeResult[],
  contract: ReproducibleFixtureContract = getActiveReproducibleFixtureContract(),
): ReproducibleFixtureProbeMatrixValidationResult {
  const failureRecoveryProbes = REPRODUCIBLE_FIXTURE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listReproducibleFixtureProbesByCategory(category, contract),
  );
  const failureRecoveryContract: ReproducibleFixtureContract = {
    ...contract,
    probes: failureRecoveryProbes,
    categories: {
      ...contract.categories,
      failure_path: contract.categories.failure_path,
      recovery_path: contract.categories.recovery_path,
      nogo_path: contract.categories.nogo_path,
    },
  };
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  return validateReproducibleFixtureProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listReproducibleFixtureFailureRecoveryProbeIds(
  contract: ReproducibleFixtureContract = getActiveReproducibleFixtureContract(),
): string[] {
  return REPRODUCIBLE_FIXTURE_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listReproducibleFixtureProbesByCategory(category, contract).map(p => p.id),
  );
}

/** Per-probe evidence artifact — auditable proof of reproducible fixture probe outcome (P01-B07-A06). */
export interface ReproducibleFixtureProbeEvidence {
  probeId: string;
  category: ReproducibleFixtureCategory;
  disposition: ReproducibleFixtureProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for reproducible fixture runs (P01-B07-A06). */
export interface ReproducibleFixtureProbeTelemetry {
  probeId: string;
  category: ReproducibleFixtureCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P01-B07-A06). */
export interface ReproducibleFixtureProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourceBenchmarkEvalVersion: string;
  sourceBenchmarkEvalAtom: string;
  /** Slice atom when record covers a subset (e.g. failure/recovery gate). */
  sliceAtom?: string;
  /** Categories included when sliceAtom is set. */
  sliceCategories?: readonly ReproducibleFixtureCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated reproducible fixture run record bundling evidence, telemetry and provenance. */
export interface ReproducibleFixtureRunRecord {
  provenance: ReproducibleFixtureProvenance;
  evidence: ReproducibleFixtureProbeEvidence[];
  telemetry: ReproducibleFixtureProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<ReproducibleFixtureCategory, number>;
    byDisposition: Record<ReproducibleFixtureProbeDisposition, number>;
  };
}

export interface ReproducibleFixtureRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface ReproducibleFixtureRunValidationResult {
  valid: boolean;
  issues: ReproducibleFixtureRunValidationIssue[];
}

export function buildReproducibleFixtureProbeEvidence(
  probeId: string,
  category: ReproducibleFixtureCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: ReproducibleFixtureProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): ReproducibleFixtureProbeEvidence {
  return {
    probeId,
    category,
    disposition,
    expected,
    actual,
    aligned,
    criterion,
    detail,
    recordedAt,
  };
}

export function buildReproducibleFixtureProbeTelemetry(
  probeId: string,
  category: ReproducibleFixtureCategory,
  sequenceIndex: number,
  durationMs: number,
): ReproducibleFixtureProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildReproducibleFixtureProvenance(
  runId: string,
  fixture: ReproducibleFixtureBaseline,
  contract: ReproducibleFixtureContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly ReproducibleFixtureCategory[];
  },
): ReproducibleFixtureProvenance {
  return {
    runId,
    harnessVersion: FORGE_REPRODUCIBLE_FIXTURE_VERSION,
    contractVersion: contract.version,
    contractAtom: contract.atom,
    fixtureVersion: fixture.version,
    fixtureAtom: fixture.atom,
    sourceBenchmarkEvalVersion: fixture.sourceBenchmarkEval.version,
    sourceBenchmarkEvalAtom: fixture.sourceBenchmarkEval.atom,
    startedAt,
    completedAt,
    totalProbes,
    ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
    ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    ...(options?.gitCommit ? { gitCommit: options.gitCommit } : {}),
  };
}

export function buildReproducibleFixtureRunRecord(
  provenance: ReproducibleFixtureProvenance,
  evidence: ReproducibleFixtureProbeEvidence[],
  telemetry: ReproducibleFixtureProbeTelemetry[],
): ReproducibleFixtureRunRecord {
  const byCategory = {} as Record<ReproducibleFixtureCategory, number>;
  const byDisposition: Record<ReproducibleFixtureProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of REPRODUCIBLE_FIXTURE_CATEGORIES) {
    byCategory[category] = 0;
  }
  let aligned = 0;
  for (const item of evidence) {
    byCategory[item.category]++;
    byDisposition[item.disposition]++;
    if (item.aligned) aligned++;
  }
  return {
    provenance,
    evidence,
    telemetry,
    summary: {
      total: evidence.length,
      aligned,
      mismatches: evidence.length - aligned,
      byCategory,
      byDisposition,
    },
  };
}

function validateReproducibleFixtureRunRecordAgainstProbeIds(
  record: ReproducibleFixtureRunRecord,
  expectedProbeIds: string[],
  contract: ReproducibleFixtureContract,
): ReproducibleFixtureRunValidationResult {
  const issues: ReproducibleFixtureRunValidationIssue[] = [];
  const expectedProbeCount = expectedProbeIds.length;

  if (record.provenance.totalProbes !== expectedProbeCount) {
    issues.push({
      kind: "provenance_mismatch",
      detail: `provenance.totalProbes=${record.provenance.totalProbes} expected=${expectedProbeCount}`,
    });
  }

  if (record.evidence.length !== expectedProbeCount) {
    issues.push({
      kind: "count_mismatch",
      detail: `evidence count=${record.evidence.length} expected=${expectedProbeCount}`,
    });
  }

  if (record.telemetry.length !== expectedProbeCount) {
    issues.push({
      kind: "count_mismatch",
      detail: `telemetry count=${record.telemetry.length} expected=${expectedProbeCount}`,
    });
  }

  const evidenceIds = new Set(record.evidence.map(e => e.probeId));
  const telemetryIds = new Set(record.telemetry.map(t => t.probeId));

  for (const probeId of expectedProbeIds) {
    if (!evidenceIds.has(probeId)) {
      issues.push({ kind: "missing_evidence", probeId, detail: `no evidence for ${probeId}` });
    }
    if (!telemetryIds.has(probeId)) {
      issues.push({ kind: "missing_telemetry", probeId, detail: `no telemetry for ${probeId}` });
    }
  }

  if (record.provenance.contractVersion !== contract.version) {
    issues.push({
      kind: "provenance_mismatch",
      detail: `contractVersion=${record.provenance.contractVersion} expected=${contract.version}`,
    });
  }

  for (const item of record.evidence) {
    if (!item.criterion || item.criterion.length === 0) {
      issues.push({
        kind: "missing_evidence",
        probeId: item.probeId,
        detail: `${item.probeId} evidence missing criterion provenance`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateReproducibleFixtureRunRecord(
  record: ReproducibleFixtureRunRecord,
  contract: ReproducibleFixtureContract = getActiveReproducibleFixtureContract(),
): ReproducibleFixtureRunValidationResult {
  return validateReproducibleFixtureRunRecordAgainstProbeIds(
    record,
    listReproducibleFixtureContractProbeIds(contract),
    contract,
  );
}

/** Validate failure/recovery slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateReproducibleFixtureFailureRecoveryRunRecord(
  record: ReproducibleFixtureRunRecord,
  contract: ReproducibleFixtureContract = getActiveReproducibleFixtureContract(),
): ReproducibleFixtureRunValidationResult {
  const issues: ReproducibleFixtureRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P01-B07-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P01-B07-A06`,
    });
  }

  const expectedCategories = [...REPRODUCIBLE_FIXTURE_FAILURE_RECOVERY_CATEGORIES];
  const sliceCategories = record.provenance.sliceCategories ?? [];
  if (
    sliceCategories.length !== expectedCategories.length ||
    !expectedCategories.every(cat => sliceCategories.includes(cat))
  ) {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceCategories=${sliceCategories.join(",")} expected=${expectedCategories.join(",")}`,
    });
  }

  const probeValidation = validateReproducibleFixtureRunRecordAgainstProbeIds(
    record,
    listReproducibleFixtureFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

export interface ReproducibleFixturePropertyViolation {
  propertyId: string;
  detail: string;
}

export interface ReproducibleFixturePropertyResult {
  passed: number;
  failed: ReproducibleFixturePropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type ReproducibleFixturePropertyCheck = {
  id: string;
  description: string;
  check: (contract: ReproducibleFixtureContract) => string | null;
};

const REPRODUCIBLE_FIXTURE_STRUCTURAL_PROPERTIES: readonly ReproducibleFixturePropertyCheck[] = [
  {
    id: "categories_complete",
    description: "All eight reproducible fixture categories are declared",
    check: contract => {
      for (const category of REPRODUCIBLE_FIXTURE_CATEGORIES) {
        if (!contract.categories[category]) return `missing category: ${category}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listReproducibleFixtureContractProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each category meets contract minProbeCount",
    check: contract => {
      for (const category of REPRODUCIBLE_FIXTURE_CATEGORIES) {
        const categoryContract = contract.categories[category];
        if (categoryContract.probes.length < categoryContract.acceptance.minProbeCount) {
          return `${category} has ${categoryContract.probes.length} probes; requires >= ${categoryContract.acceptance.minProbeCount}`;
        }
      }
      return null;
    },
  },
  {
    id: "criterion_measurable",
    description: "Every probe declares a measurable criterion",
    check: contract => {
      for (const probe of contract.probes) {
        if (probe.criterion.trim().length <= 10) {
          return `${probe.id} criterion too short`;
        }
      }
      return null;
    },
  },
  {
    id: "coverage_consistent",
    description: "summarizeReproducibleFixtureContractCoverage totals match listReproducibleFixtureContractProbeIds",
    check: contract => {
      const summary = summarizeReproducibleFixtureContractCoverage(contract);
      const ids = listReproducibleFixtureContractProbeIds(contract);
      if (summary.totalProbes !== ids.length) {
        return `totalProbes=${summary.totalProbes} ids=${ids.length}`;
      }
      const dispositionSum =
        summary.byDisposition.observed +
        summary.byDisposition.gap +
        summary.byDisposition.failure +
        summary.byDisposition.recovery +
        summary.byDisposition.nogo;
      if (dispositionSum !== summary.totalProbes) {
        return `disposition sum=${dispositionSum} total=${summary.totalProbes}`;
      }
      return null;
    },
  },
  {
    id: "probe_id_prefix",
    description: "Probe ids are namespaced with fix. prefix",
    check: contract => {
      for (const probe of contract.probes) {
        if (!probe.id.startsWith("fix.")) {
          return `${probe.id} missing fix. prefix`;
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const probeIds = listReproducibleFixtureContractProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildReproducibleFixtureProbeEvidence(
          id,
          probe.category,
          probe.expected,
          probe.expected,
          true,
          probe.criterion,
          "synthetic",
          probe.disposition,
        );
      });
      const telemetry = probeIds.map((id, index) => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildReproducibleFixtureProbeTelemetry(id, probe.category, index, index);
      });
      const record = buildReproducibleFixtureRunRecord(
        buildReproducibleFixtureProvenance(
          "property-check",
          {
            version: "0",
            atom: "x",
            purpose: "x",
            sourceBenchmarkEval: buildDefaultReproducibleSourceBenchmarkEval(),
            probes: [],
          },
          contract,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:01.000Z",
          probeIds.length,
        ),
        evidence,
        telemetry,
      );
      if (record.summary.aligned + record.summary.mismatches !== record.summary.total) {
        return `aligned(${record.summary.aligned}) + mismatches(${record.summary.mismatches}) != total(${record.summary.total})`;
      }
      return null;
    },
  },
  {
    id: "failure_recovery_run_record_gate",
    description: "Synthetic failure/recovery slice record passes validateReproducibleFixtureFailureRecoveryRunRecord",
    check: contract => {
      const probeIds = listReproducibleFixtureFailureRecoveryProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildReproducibleFixtureProbeEvidence(
          id,
          probe.category,
          probe.expected,
          probe.expected,
          true,
          probe.criterion,
          "synthetic",
          probe.disposition,
        );
      });
      const telemetry = probeIds.map((id, index) => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildReproducibleFixtureProbeTelemetry(id, probe.category, index, index * 0.5);
      });
      const record = buildReproducibleFixtureRunRecord(
        buildReproducibleFixtureProvenance(
          "property-check-failure-recovery",
          {
            version: "0",
            atom: "x",
            purpose: "x",
            sourceBenchmarkEval: buildDefaultReproducibleSourceBenchmarkEval(),
            probes: [],
          },
          contract,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:01.000Z",
          probeIds.length,
          {
            sliceAtom: "P01-B07-A06",
            sliceCategories: REPRODUCIBLE_FIXTURE_FAILURE_RECOVERY_CATEGORIES,
          },
        ),
        evidence,
        telemetry,
      );
      const validation = validateReproducibleFixtureFailureRecoveryRunRecord(record, contract);
      if (!validation.valid) {
        return validation.issues.map(i => i.detail).join("; ");
      }
      return null;
    },
  },
] as const;

export function runReproducibleFixturePropertyChecks(
  contract: ReproducibleFixtureContract = getActiveReproducibleFixtureContract(),
): ReproducibleFixturePropertyResult {
  const failed: ReproducibleFixturePropertyViolation[] = [];
  for (const property of REPRODUCIBLE_FIXTURE_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = REPRODUCIBLE_FIXTURE_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type ReproducibleFixtureFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface ReproducibleFixtureFuzzMutationCase {
  seed: number;
  kind: ReproducibleFixtureFuzzMutationKind;
  probeId?: string;
  category?: ReproducibleFixtureCategory;
}

export interface ReproducibleFixtureFuzzValidationCaseResult {
  mutation: ReproducibleFixtureFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface ReproducibleFixtureFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: ReproducibleFixtureFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createReproducibleFixtureFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneReproducibleFixtureBaseline(
  fixture: ReproducibleFixtureBaseline,
): ReproducibleFixtureBaseline {
  return {
    ...fixture,
    sourceBenchmarkEval: { ...fixture.sourceBenchmarkEval },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickReproducibleFixtureFuzzTarget(
  fixture: ReproducibleFixtureBaseline,
  rng: () => number,
): { category: ReproducibleFixtureCategory; index: number; entry: ReproducibleFixtureEntry } {
  const category =
    REPRODUCIBLE_FIXTURE_CATEGORIES[Math.floor(rng() * REPRODUCIBLE_FIXTURE_CATEGORIES.length)]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyReproducibleFixtureFuzzMutation(
  fixture: ReproducibleFixtureBaseline,
  mutation: ReproducibleFixtureFuzzMutationCase,
): ReproducibleFixtureBaseline {
  const mutated = cloneReproducibleFixtureBaseline(fixture);
  const targetCategory = mutation.category ?? REPRODUCIBLE_FIXTURE_CATEGORIES[0]!;
  const categoryEntries = mutated.probes.filter(p => p.category === targetCategory);

  switch (mutation.kind) {
    case "flip_expected": {
      const probeId = mutation.probeId ?? categoryEntries[0]!.id;
      const entry = mutated.probes.find(e => e.id === probeId) ?? categoryEntries[0]!;
      entry.expected = entry.expected === "PASS" ? "FAIL" : "PASS";
      break;
    }
    case "drop_probe": {
      const probeId = mutation.probeId ?? categoryEntries[0]!.id;
      mutated.probes = mutated.probes.filter(e => e.id !== probeId);
      break;
    }
    case "extra_probe":
      mutated.probes = [
        ...mutated.probes,
        {
          id: `fix.fuzz.extra.${mutation.seed}`,
          category: targetCategory,
          description: "synthetic extra probe",
          expected: "PASS",
        },
      ];
      break;
    case "rename_probe": {
      const probeId = mutation.probeId ?? categoryEntries[0]!.id;
      const entry = mutated.probes.find(e => e.id === probeId) ?? categoryEntries[0]!;
      entry.id = `${entry.id}.fuzz_${mutation.seed}`;
      break;
    }
    case "flip_category": {
      const probeId = mutation.probeId ?? categoryEntries[0]!.id;
      const entry = mutated.probes.find(e => e.id === probeId) ?? categoryEntries[0]!;
      const other = REPRODUCIBLE_FIXTURE_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateReproducibleFixtureFuzzMutationCases(
  fixture: ReproducibleFixtureBaseline,
  seed: number,
  iterations: number,
): ReproducibleFixtureFuzzMutationCase[] {
  const rng = createReproducibleFixtureFuzzRng(seed);
  const kinds: ReproducibleFixtureFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: ReproducibleFixtureFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickReproducibleFixtureFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P01-B07-A07). */
export function runReproducibleFixtureFuzzValidation(
  fixture: ReproducibleFixtureBaseline,
  contract: ReproducibleFixtureContract = getActiveReproducibleFixtureContract(),
  seed = 42,
  iterations = 24,
): ReproducibleFixtureFuzzValidationResult {
  const cases = generateReproducibleFixtureFuzzMutationCases(fixture, seed, iterations);
  const results: ReproducibleFixtureFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyReproducibleFixtureFuzzMutation(fixture, mutation);
    const validation = validateReproducibleFixtureBaselineAgainstContract(mutated, contract);
    if (validation.valid) accepted++;
    else rejected++;
    results.push({
      mutation,
      valid: validation.valid,
      issueKinds: [...new Set(validation.issues.map(i => i.kind))],
    });
  }

  return {
    seed,
    iterations,
    rejected,
    accepted,
    cases: results,
    allMutationsRejected: accepted === 0,
  };
}

export type ReproducibleFixtureRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface ReproducibleFixtureRunRecordFuzzCase {
  kind: ReproducibleFixtureRunRecordFuzzKind;
  probeId?: string;
}

export function applyReproducibleFixtureRunRecordFuzzMutation(
  record: ReproducibleFixtureRunRecord,
  mutation: ReproducibleFixtureRunRecordFuzzCase,
): ReproducibleFixtureRunRecord {
  const cloned: ReproducibleFixtureRunRecord = {
    provenance: { ...record.provenance },
    evidence: record.evidence.map(item => ({ ...item })),
    telemetry: record.telemetry.map(item => ({ ...item })),
    summary: {
      ...record.summary,
      byCategory: { ...record.summary.byCategory },
      byDisposition: { ...record.summary.byDisposition },
    },
  };

  switch (mutation.kind) {
    case "drop_evidence": {
      const probeId = mutation.probeId ?? cloned.evidence[0]?.probeId;
      cloned.evidence = cloned.evidence.filter(item => item.probeId !== probeId);
      break;
    }
    case "drop_telemetry": {
      const probeId = mutation.probeId ?? cloned.telemetry[0]?.probeId;
      cloned.telemetry = cloned.telemetry.filter(item => item.probeId !== probeId);
      break;
    }
    case "wrong_total":
      cloned.provenance = { ...cloned.provenance, totalProbes: cloned.provenance.totalProbes + 1 };
      break;
    case "wrong_slice_atom":
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P01-B07-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["fixture_versioning"],
      };
      break;
  }

  cloned.summary = buildReproducibleFixtureRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveReproducibleFixtureRunRecordValidator(
  record: ReproducibleFixtureRunRecord,
): (
  record: ReproducibleFixtureRunRecord,
  contract: ReproducibleFixtureContract,
) => ReproducibleFixtureRunValidationResult {
  return record.provenance.sliceAtom === "P01-B07-A06"
    ? validateReproducibleFixtureFailureRecoveryRunRecord
    : validateReproducibleFixtureRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P01-B07-A07). */
export function runReproducibleFixtureRunRecordFuzzValidation(
  record: ReproducibleFixtureRunRecord,
  contract: ReproducibleFixtureContract = getActiveReproducibleFixtureContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveReproducibleFixtureRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: ReproducibleFixtureRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P01-B07-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyReproducibleFixtureRunRecordFuzzMutation(record, mutation);
    const validation = validate(mutated, contract);
    if (validation.valid) mutationsAccepted++;
    else mutationsRejected++;
  }

  return {
    validBaseline: baseline.valid,
    mutationsRejected,
    mutationsAccepted,
  };
}
