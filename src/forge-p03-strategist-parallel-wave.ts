/**
 * FOREMAN — Strategist Parallel Execution Wave Baseline (P03-B07)
 *
 * A01 slice: load, validate, run probes against sealed P03-B06 resource
 * budget block gate artifacts.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import strategistParallelWaveBaseline from "./fixtures/forge-strategist-parallel-wave-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP03B06ToB07Handoff,
  summarizeStrategistResourceBudgetCoverage,
  getActiveStrategistResourceBudgetContract,
  FORGE_STRATEGIST_RESOURCE_BUDGET_VERSION,
} from "./forge-p03-strategist-resource-budget.js";
import { parseDecomposeResponse } from "./parser.js";

export const FORGE_STRATEGIST_PARALLEL_WAVE_VERSION = "1.0.0";

export const EXPECTED_P03_B06_SEALED_ATOM_COUNT = 10;

export const STRATEGIST_PARALLEL_WAVE_DECOMPOSE_MAX_LENGTH = 64000;

export const STRATEGIST_PARALLEL_WAVE_CATEGORIES = [
  "wave_versioning",
  "block_wave_plan",
  "atom_wave_plan",
  "resource_wave_budget",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type StrategistParallelWaveCategory = (typeof STRATEGIST_PARALLEL_WAVE_CATEGORIES)[number];

export const STRATEGIST_PARALLEL_WAVE_A01_MIN_PROBES: Readonly<
  Record<StrategistParallelWaveCategory, number>
> = {
  wave_versioning: 3,
  block_wave_plan: 4,
  atom_wave_plan: 2,
  resource_wave_budget: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 3,
  recovery_path: 2,
  nogo_path: 2,
};

export type StrategistParallelWaveInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface StrategistParallelWaveInputBoundary {
  disposition: StrategistParallelWaveInputDisposition;
  acceptable: boolean;
  normalizedDecompose: string;
  truncated: boolean;
  detail: string;
}

export function assessStrategistParallelWaveInputBoundary(
  decomposeOutput: string,
): StrategistParallelWaveInputBoundary {
  if (decomposeOutput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedDecompose: "",
      truncated: false,
      detail: "null byte detected in decompose output",
    };
  }

  const trimmed = decomposeOutput.trim();
  if (trimmed.length === 0) {
    const disposition: StrategistParallelWaveInputDisposition =
      decomposeOutput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedDecompose: "",
      truncated: false,
      detail: disposition === "empty" ? "empty decompose output" : "whitespace-only decompose output",
    };
  }

  let normalizedDecompose = decomposeOutput;
  let truncated = false;
  if (normalizedDecompose.length > STRATEGIST_PARALLEL_WAVE_DECOMPOSE_MAX_LENGTH) {
    normalizedDecompose = normalizedDecompose.slice(0, STRATEGIST_PARALLEL_WAVE_DECOMPOSE_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedDecompose,
    truncated,
    detail: truncated
      ? `decompose truncated to ${STRATEGIST_PARALLEL_WAVE_DECOMPOSE_MAX_LENGTH} characters`
      : "valid decompose output",
  };
}

export interface StrategistParallelWaveFixtureEntry {
  id: string;
  category: StrategistParallelWaveCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface StrategistParallelWaveBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    resourceBudgetProbeCount: number;
    sealedAtomCount: number;
  };
  probes: StrategistParallelWaveFixtureEntry[];
}

export interface StrategistParallelWaveProbeResult {
  id: string;
  category: StrategistParallelWaveCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface StrategistParallelWaveProbeSummary {
  total: number;
  aligned: number;
  mismatches: StrategistParallelWaveProbeResult[];
  knownGaps: StrategistParallelWaveProbeResult[];
  byCategory: Record<
    StrategistParallelWaveCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface StrategistParallelWaveValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: StrategistParallelWaveCategory;
  detail: string;
}

export interface StrategistParallelWaveValidationResult {
  valid: boolean;
  issues: StrategistParallelWaveValidationIssue[];
}

export type StrategistParallelWaveProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface StrategistParallelWaveProbeContract {
  id: string;
  category: StrategistParallelWaveCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: StrategistParallelWaveProbeDisposition;
  criterion: string;
}

export interface StrategistParallelWaveCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface StrategistParallelWaveCategoryContract {
  category: StrategistParallelWaveCategory;
  acceptance: StrategistParallelWaveCategoryAcceptance;
  probes: readonly StrategistParallelWaveProbeContract[];
}

export interface StrategistParallelWaveContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<StrategistParallelWaveCategory, StrategistParallelWaveCategoryContract>;
  probes: readonly StrategistParallelWaveProbeContract[];
}

export interface StrategistParallelWaveCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: StrategistParallelWaveCategory;
  detail: string;
}

export interface StrategistParallelWaveCoverageResult {
  valid: boolean;
  issues: StrategistParallelWaveCoverageIssue[];
}

function flattenStrategistParallelWaveCategoryProbes(
  categories: Record<StrategistParallelWaveCategory, StrategistParallelWaveCategoryContract>,
): readonly StrategistParallelWaveProbeContract[] {
  return STRATEGIST_PARALLEL_WAVE_CATEGORIES.flatMap(category => categories[category].probes);
}

const STRATEGIST_PARALLEL_WAVE_CATEGORY_CONTRACTS: Record<
  StrategistParallelWaveCategory,
  StrategistParallelWaveCategoryContract
> = {
  wave_versioning: {
    category: "wave_versioning",
    acceptance: {
      invariant:
        "Strategist parallel wave baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "swave.version_tagged",
        category: "wave_versioning",
        description: "Strategist parallel wave baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist parallel wave baseline declares semver version field",
      },
      {
        id: "swave.atom_tagged",
        category: "wave_versioning",
        description: "Strategist parallel wave baseline declares P03-B07-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist parallel wave baseline declares P03-B07-A01 atom id",
      },
      {
        id: "swave.harness_version_exported",
        category: "wave_versioning",
        description: "FORGE_STRATEGIST_PARALLEL_WAVE_VERSION exported for parallel wave harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_STRATEGIST_PARALLEL_WAVE_VERSION exported for parallel wave harness",
      },
    ],
  },
  block_wave_plan: {
    category: "block_wave_plan",
    acceptance: {
      invariant:
        "Block wave plan infrastructure derives waves from blockDeps and emits parallel_plan phase.",
      minProbeCount: 4,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "swave.orchestrator_block_waves",
        category: "block_wave_plan",
        description: "Orchestrator computeBlockWaves derives execution waves from blockDeps graph",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator computeBlockWaves derives execution waves from blockDeps graph",
      },
      {
        id: "swave.orchestrator_parallel_plan_phase",
        category: "block_wave_plan",
        description: "Orchestrator emits parallel_plan streaming phase with wave summary",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator emits parallel_plan streaming phase with wave summary",
      },
      {
        id: "swave.prompt_parallel_wave_plan",
        category: "block_wave_plan",
        description: "STRATEGIST decompose format declares PARALLEL WAVE PLAN section",
        expected: "FAIL",
        disposition: "gap",
        criterion: "STRATEGIST decompose format declares PARALLEL WAVE PLAN section",
      },
      {
        id: "swave.parser_wave_plan_fields",
        category: "block_wave_plan",
        description: "parseDecomposeResponse exports parallelWavePlan fields from decompose output",
        expected: "FAIL",
        disposition: "gap",
        criterion: "parseDecomposeResponse exports parallelWavePlan fields from decompose output",
      },
    ],
  },
  atom_wave_plan: {
    category: "atom_wave_plan",
    acceptance: {
      invariant:
        "Atom wave plan infrastructure derives atom execution waves and preserves block wave ordering.",
      minProbeCount: 2,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "swave.orchestrator_atom_waves",
        category: "atom_wave_plan",
        description: "Orchestrator computeAtomWaves derives execution waves from atom dependency graph",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator computeAtomWaves derives execution waves from atom dependency graph",
      },
      {
        id: "swave.block_order_preserves_waves",
        category: "atom_wave_plan",
        description: "Orchestrator block loop preserves computeBlockWaves wave ordering",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator block loop preserves computeBlockWaves wave ordering",
      },
    ],
  },
  resource_wave_budget: {
    category: "resource_wave_budget",
    acceptance: {
      invariant:
        "Resource wave budget links rate limiter safety, resource plan prompts and pre-execution wave gates.",
      minProbeCount: 3,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "swave.rate_limiter_parallel_safety",
        category: "resource_wave_budget",
        description: "RateLimiter throttles parallel LLM calls to protect wave execution budget",
        expected: "PASS",
        disposition: "observed",
        criterion: "RateLimiter throttles parallel LLM calls to protect wave execution budget",
      },
      {
        id: "swave.resource_plan_wave_budget_link",
        category: "resource_wave_budget",
        description: "Strategist decompose RESOURCE PLAN section links blocks to resource-aware wave batches",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist decompose RESOURCE PLAN section links blocks to resource-aware wave batches",
      },
      {
        id: "swave.orchestrator_pre_exec_wave_gate",
        category: "resource_wave_budget",
        description: "Orchestrator validates strategist parallel wave plan before block execution",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator validates strategist parallel wave plan before block execution",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Parallel wave baseline links to sealed P03-B06 resource budget block gate handoff artifacts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "swave.b06_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P03_B06_TO_B07_HANDOFF_V1 targets P03-B07-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P03_B06_TO_B07_HANDOFF_V1 targets P03-B07-A01 entry atom",
      },
      {
        id: "swave.b06_sealed_resource_budget_probes",
        category: "baseline_link",
        description: "P03-B06→B07 handoff sealed probeCount matches active resource budget contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P03-B06→B07 handoff sealed probeCount matches active resource budget contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Parallel wave baseline documents source block gate references and decompose input boundaries.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "swave.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P03-B06 resource budget block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P03-B06 resource budget block gate source artifacts",
      },
      {
        id: "swave.probe_runner_exported",
        category: "boundary",
        description: "runStrategistParallelWaveProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runStrategistParallelWaveProbes executes contract-wired probe matrix",
      },
      {
        id: "swave.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL parallel wave gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL parallel wave gap",
      },
      {
        id: "swave.empty_decompose_boundary",
        category: "boundary",
        description: "assessStrategistParallelWaveInputBoundary rejects empty decompose output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistParallelWaveInputBoundary rejects empty decompose output",
      },
      {
        id: "swave.whitespace_decompose_boundary",
        category: "boundary",
        description: "assessStrategistParallelWaveInputBoundary rejects whitespace-only decompose output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistParallelWaveInputBoundary rejects whitespace-only decompose output",
      },
      {
        id: "swave.long_decompose_truncation_boundary",
        category: "boundary",
        description: "assessStrategistParallelWaveInputBoundary truncates decompose exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistParallelWaveInputBoundary truncates decompose exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant:
        "Parallel wave baseline validation rejects invalid versions and enforces minimum category probe counts.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "swave.invalid_version_rejected",
        category: "failure_path",
        description: "validateStrategistParallelWaveBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateStrategistParallelWaveBaseline rejects unexpected fixture version",
      },
      {
        id: "swave.malformed_decompose_guard",
        category: "failure_path",
        description: "assessStrategistParallelWaveInputBoundary rejects null-byte decompose output safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessStrategistParallelWaveInputBoundary rejects null-byte decompose output safely",
      },
      {
        id: "swave.min_category_probes",
        category: "failure_path",
        description: "validateStrategistParallelWaveBaseline enforces per-category minimum probe counts",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateStrategistParallelWaveBaseline enforces per-category minimum probe counts",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Parallel wave recovery paths include sequential fallback within waves and block checkpoint resume.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "swave.recovery_sequential_fallback",
        category: "recovery_path",
        description: "Orchestrator falls back to sequential execution within each wave for shared filesystem safety",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Orchestrator falls back to sequential execution within each wave for shared filesystem safety",
      },
      {
        id: "swave.recovery_wave_checkpoint",
        category: "recovery_path",
        description: "Rollback checkpoint created per block preserves wave resume ordering after failure",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Rollback checkpoint created per block preserves wave resume ordering after failure",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "NO-GO paths halt execution when parallel wave plan is invalid without strategist wave validator.",
      minProbeCount: 2,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "swave.nogo_invalid_wave_plan",
        category: "nogo_path",
        description: "NO-GO gate rejects run when parallel wave plan references non-existent block indices",
        expected: "FAIL",
        disposition: "nogo",
        criterion: "NO-GO gate rejects run when parallel wave plan references non-existent block indices",
      },
      {
        id: "swave.exported_wave_validator",
        category: "nogo_path",
        description: "validateStrategistParallelWave exported for orchestrator pre-execution wave checks",
        expected: "FAIL",
        disposition: "nogo",
        criterion: "validateStrategistParallelWave exported for orchestrator pre-execution wave checks",
      },
    ],
  },
};

export const FORGE_STRATEGIST_PARALLEL_WAVE_CONTRACT_V1: StrategistParallelWaveContract = {
  version: "1.0.0",
  atom: "P03-B07-A06",
  purpose:
    "Typed strategist parallel execution wave contract aligned to baseline probe matrix and sealed P03-B06 block gate.",
  categories: STRATEGIST_PARALLEL_WAVE_CATEGORY_CONTRACTS,
  probes: flattenStrategistParallelWaveCategoryProbes(STRATEGIST_PARALLEL_WAVE_CATEGORY_CONTRACTS),
};

export function getActiveStrategistParallelWaveContract(): StrategistParallelWaveContract {
  return FORGE_STRATEGIST_PARALLEL_WAVE_CONTRACT_V1;
}

export function summarizeStrategistParallelWaveCoverage(
  contract: StrategistParallelWaveContract = getActiveStrategistParallelWaveContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<StrategistParallelWaveCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<StrategistParallelWaveProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    StrategistParallelWaveCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<StrategistParallelWaveProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };

  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of STRATEGIST_PARALLEL_WAVE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    byCategory[category] = {
      probeCount: categoryContract.probes.length,
      invariant: categoryContract.acceptance.invariant,
    };
    totalProbes += categoryContract.probes.length;
    for (const probeEntry of categoryContract.probes) {
      if (probeEntry.expected === "PASS") {
        expectedPass++;
      } else {
        expectedFail++;
      }
      byDisposition[probeEntry.disposition]++;
    }
  }

  return { totalProbes, expectedPass, expectedFail, byCategory, byDisposition };
}

export function validateStrategistParallelWaveAgainstContract(
  fixture: StrategistParallelWaveBaseline,
  contract: StrategistParallelWaveContract = getActiveStrategistParallelWaveContract(),
): StrategistParallelWaveValidationResult {
  const issues: StrategistParallelWaveValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  for (const category of STRATEGIST_PARALLEL_WAVE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    const categoryProbes = fixture.probes.filter(p => p.category === category);
    if (categoryProbes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} has ${categoryProbes.length} probes; ` +
          `contract requires >= ${categoryContract.acceptance.minProbeCount}`,
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
    issues.push({
      kind: "missing_category",
      detail: "fixture must document known FAIL gaps matching contract",
    });
  }
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_probe",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${expectedFailCount}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

export function getStrategistParallelWaveCategoryContract(
  category: StrategistParallelWaveCategory,
  contract: StrategistParallelWaveContract = getActiveStrategistParallelWaveContract(),
): StrategistParallelWaveCategoryContract {
  return contract.categories[category];
}

export function listStrategistParallelWaveContractProbeIds(
  contract: StrategistParallelWaveContract = getActiveStrategistParallelWaveContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listStrategistParallelWaveProbesByDisposition(
  disposition: StrategistParallelWaveProbeDisposition,
  contract: StrategistParallelWaveContract = getActiveStrategistParallelWaveContract(),
): StrategistParallelWaveProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listStrategistParallelWaveContractProbesByCategory(
  category: StrategistParallelWaveCategory,
  contract: StrategistParallelWaveContract = getActiveStrategistParallelWaveContract(),
): StrategistParallelWaveProbeContract[] {
  return contract.categories[category].probes;
}

export function validateStrategistParallelWaveCoverage(
  contract: StrategistParallelWaveContract = getActiveStrategistParallelWaveContract(),
): StrategistParallelWaveCoverageResult {
  const issues: StrategistParallelWaveCoverageIssue[] = [];

  for (const category of STRATEGIST_PARALLEL_WAVE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < STRATEGIST_PARALLEL_WAVE_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${STRATEGIST_PARALLEL_WAVE_A01_MIN_PROBES[category]}`,
      });
    }
    if (categoryContract.probes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} has ${categoryContract.probes.length} probes; ` +
          `contract requires >= ${categoryContract.acceptance.minProbeCount}`,
      });
    }
    if (categoryContract.acceptance.invariant.trim().length <= 20) {
      issues.push({
        kind: "missing_criterion",
        category,
        detail: `${category} invariant too short`,
      });
    }
    for (const probeEntry of categoryContract.probes) {
      if (probeEntry.criterion.trim().length <= 10) {
        issues.push({
          kind: "missing_criterion",
          probeId: probeEntry.id,
          detail: `${probeEntry.id} criterion too short`,
        });
      }
    }
  }

  const ids = listStrategistParallelWaveContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeStrategistParallelWaveCoverage(contract);
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

  for (const probeEntry of contract.probes) {
    if (!probeEntry.id.startsWith("swave.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probeEntry.id,
        detail: `${probeEntry.id} missing swave. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export const FORGE_STRATEGIST_PARALLEL_WAVE_A01_PROBE_MATRIX: readonly StrategistParallelWaveFixtureEntry[] =
  strategistParallelWaveBaseline.probes as StrategistParallelWaveFixtureEntry[];

export function loadStrategistParallelWaveBaseline(): StrategistParallelWaveBaseline {
  return strategistParallelWaveBaseline as StrategistParallelWaveBaseline;
}

export function validateStrategistParallelWaveBaseline(
  fixture: StrategistParallelWaveBaseline,
): StrategistParallelWaveValidationResult {
  const issues: StrategistParallelWaveValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P03-B07-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    STRATEGIST_PARALLEL_WAVE_CATEGORIES.map(category => [category, 0]),
  ) as Record<StrategistParallelWaveCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of STRATEGIST_PARALLEL_WAVE_CATEGORIES) {
    const min = STRATEGIST_PARALLEL_WAVE_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_STRATEGIST_PARALLEL_WAVE_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_STRATEGIST_PARALLEL_WAVE_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_STRATEGIST_PARALLEL_WAVE_A01_PROBE_MATRIX) {
    const entry = fixture.probes.find(p => p.id === expected.id);
    if (!entry) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `missing probe ${expected.id}`,
      });
      continue;
    }
    if (entry.category !== expected.category) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `category mismatch for ${expected.id}`,
      });
    }
    if (entry.expected !== expected.expected) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `expected mismatch for ${expected.id}`,
      });
    }
  }

  const handoff = getForgeP03B06ToB07Handoff();
  const resourceCoverage = summarizeStrategistResourceBudgetCoverage(
    getActiveStrategistResourceBudgetContract(),
  );

  if (fixture.sourceBlockGate.atom !== "P03-B06-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P03-B06-A10`,
    });
  }
  if (fixture.sourceBlockGate.contractVersion !== FORGE_STRATEGIST_RESOURCE_BUDGET_VERSION) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.contractVersion=${fixture.sourceBlockGate.contractVersion} ` +
        `expected=${FORGE_STRATEGIST_RESOURCE_BUDGET_VERSION}`,
    });
  }
  if (fixture.sourceBlockGate.resourceBudgetProbeCount !== resourceCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.resourceBudgetProbeCount=${fixture.sourceBlockGate.resourceBudgetProbeCount} ` +
        `contract=${resourceCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P03_B06_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P03_B06_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P03_B06_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B06 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P03_B06_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P03-B07-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `B06 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P03-B07-A01`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length === 0) {
    issues.push({
      kind: "missing_category",
      detail: "fixture must document at least one measurable FAIL parallel wave gap",
    });
  }

  const contractAlignment = validateStrategistParallelWaveAgainstContract(
    fixture,
    getActiveStrategistParallelWaveContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeStrategistParallelWaveMatrix(
  results: StrategistParallelWaveProbeResult[],
): StrategistParallelWaveProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as StrategistParallelWaveProbeSummary["byCategory"];
  for (const category of STRATEGIST_PARALLEL_WAVE_CATEGORIES) {
    const catResults = results.filter(r => r.category === category);
    byCategory[category] = {
      total: catResults.length,
      aligned: catResults.filter(r => r.aligned).length,
      expectedFail: catResults.filter(r => r.expected === "FAIL").length,
    };
  }

  return {
    total: results.length,
    aligned: results.length - mismatches.length,
    mismatches,
    knownGaps,
    byCategory,
  };
}

export function listStrategistParallelWaveProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistParallelWaveBaseline = loadStrategistParallelWaveBaseline(),
): StrategistParallelWaveFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listStrategistParallelWaveKnownGaps(
  results: StrategistParallelWaveProbeResult[],
): StrategistParallelWaveProbeResult[] {
  return summarizeStrategistParallelWaveMatrix(results).knownGaps;
}

export interface StrategistParallelWaveProbeMatrixValidationIssue {
  kind:
    | "missing_result"
    | "extra_result"
    | "pass_mismatch"
    | "gap_misaligned"
    | "unexpected_mismatch"
    | "criterion_mismatch";
  probeId?: string;
  detail: string;
}

export interface StrategistParallelWaveProbeMatrixValidationResult {
  valid: boolean;
  issues: StrategistParallelWaveProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 */
export function validateStrategistParallelWaveProbeMatrix(
  results: StrategistParallelWaveProbeResult[],
  contract: StrategistParallelWaveContract = getActiveStrategistParallelWaveContract(),
): StrategistParallelWaveProbeMatrixValidationResult {
  const issues: StrategistParallelWaveProbeMatrixValidationIssue[] = [];
  const resultById = new Map(results.map(result => [result.id, result]));
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
    if (!contract.probes.some(probe => probe.id === result.id)) {
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

export interface StrategistParallelWaveProductionSliceResult {
  atom: "P03-B07-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: StrategistParallelWaveProbeResult[];
  summary: StrategistParallelWaveProbeSummary;
  matrixValidation: StrategistParallelWaveProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: contract-wired probe execution and matrix alignment gate
 * with zero unexpected mismatches while preserving documented FAIL gaps.
 */
export function runStrategistParallelWaveProductionSlice(
  fixture: StrategistParallelWaveBaseline = loadStrategistParallelWaveBaseline(),
): StrategistParallelWaveProductionSliceResult {
  const contract = getActiveStrategistParallelWaveContract();
  const fixtureValidation = validateStrategistParallelWaveBaseline(fixture);
  const contractValidation = validateStrategistParallelWaveAgainstContract(fixture, contract);
  const results = runStrategistParallelWaveProbes(fixture);
  const summary = summarizeStrategistParallelWaveMatrix(results);
  const matrixValidation = validateStrategistParallelWaveProbeMatrix(results, contract);

  return {
    atom: "P03-B07-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface StrategistParallelWaveBoundarySliceResult {
  atom: "P03-B07-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: StrategistParallelWaveProbeResult[];
  boundaryResults: StrategistParallelWaveProbeResult[];
  matrixValidation: StrategistParallelWaveProbeMatrixValidationResult;
}

/**
 * Validate boundary-category probe matrix — A04 slice gate.
 */
export function validateStrategistParallelWaveBoundaryProbeMatrix(
  results: StrategistParallelWaveProbeResult[],
  contract: StrategistParallelWaveContract = getActiveStrategistParallelWaveContract(),
): StrategistParallelWaveProbeMatrixValidationResult {
  const boundaryProbes = listStrategistParallelWaveContractProbesByCategory("boundary", contract);
  const boundaryContract: StrategistParallelWaveContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateStrategistParallelWaveProbeMatrix(boundaryResults, boundaryContract);
}

/**
 * A04 boundary slice: contract-wired boundary probes (decompose input edge cases, probe runner,
 * documented gaps, source block gate refs) with zero unexpected mismatches.
 */
export function runStrategistParallelWaveBoundarySlice(
  fixture: StrategistParallelWaveBaseline = loadStrategistParallelWaveBaseline(),
): StrategistParallelWaveBoundarySliceResult {
  const contract = getActiveStrategistParallelWaveContract();
  const results = runStrategistParallelWaveProbes(fixture);
  const boundaryProbes = listStrategistParallelWaveContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateStrategistParallelWaveBoundaryProbeMatrix(results, contract);

  return {
    atom: "P03-B07-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const STRATEGIST_PARALLEL_WAVE_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly StrategistParallelWaveCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery probes and documented FAIL NO-GO gaps must align; zero unexpected mismatches.
 */
export function validateStrategistParallelWaveFailureRecoveryProbeMatrix(
  results: StrategistParallelWaveProbeResult[],
  contract: StrategistParallelWaveContract = getActiveStrategistParallelWaveContract(),
): StrategistParallelWaveProbeMatrixValidationResult {
  const failureRecoveryProbes = STRATEGIST_PARALLEL_WAVE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistParallelWaveContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: StrategistParallelWaveContract = {
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
  return validateStrategistParallelWaveProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listStrategistParallelWaveFailureRecoveryProbeIds(
  contract: StrategistParallelWaveContract = getActiveStrategistParallelWaveContract(),
): string[] {
  return STRATEGIST_PARALLEL_WAVE_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listStrategistParallelWaveContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface StrategistParallelWaveFailureRecoverySliceResult {
  atom: "P03-B07-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: StrategistParallelWaveProbeResult[];
  failureRecoveryResults: StrategistParallelWaveProbeResult[];
  matrixValidation: StrategistParallelWaveProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches.
 */
export function runStrategistParallelWaveFailureRecoverySlice(
  fixture: StrategistParallelWaveBaseline = loadStrategistParallelWaveBaseline(),
): StrategistParallelWaveFailureRecoverySliceResult {
  const contract = getActiveStrategistParallelWaveContract();
  const results = runStrategistParallelWaveProbes(fixture);
  const failureRecoveryProbes = STRATEGIST_PARALLEL_WAVE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistParallelWaveContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateStrategistParallelWaveFailureRecoveryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P03-B07-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = __dirname;

function readSrc(relativePath: string): string {
  return readFileSync(join(SRC_ROOT, relativePath), "utf8");
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
): StrategistParallelWaveProbeResult {
  const actual = outcome(ok);
  return {
    id,
    category,
    expected,
    actual,
    aligned: actual === expected,
    detail,
  };
}

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function parserSource(): string {
  return readSrc("parser.ts");
}

function rateLimiterSource(): string {
  return readSrc("rate-limiter.ts");
}

function productionParallelWaveSource(): string {
  return readSrc("forge-p03-strategist-parallel-wave.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionParallelWaveSource());
}

const SAMPLE_BLOCK_DECOMPOSE_WITH_DEPS = `REASONING: Parallel wave ordered blocks
OUTPUT:
Block 1: Setup parallel wave baseline types
Block 2: Wire wave planner seam
Block 3: Add parallel wave tests
DEPENDENCIES: 2→1, 3→1,2
RESOURCE PLAN: Block 1 lightweight; Block 2 moderate; Block 3 integration
TOKEN BUDGET: perThought=4096
CONFIDENCE: 0.85`;

function probeWaveVersioning(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistParallelWaveBaseline,
): StrategistParallelWaveProbeResult {
  switch (id) {
    case "swave.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "swave.atom_tagged": {
      const ok = fixture.atom === "P03-B07-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "swave.harness_version_exported": {
      const ok = FORGE_STRATEGIST_PARALLEL_WAVE_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_STRATEGIST_PARALLEL_WAVE_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown wave_versioning probe");
  }
}

function probeBlockWavePlan(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistParallelWaveProbeResult {
  const orchestrator = orchestratorSource();
  const prompts = promptsSource();
  const parser = parserSource();

  switch (id) {
    case "swave.orchestrator_block_waves": {
      const ok =
        orchestrator.includes("computeBlockWaves(") &&
        orchestrator.includes("blockDeps");
      return probe(id, category, expected, ok, `blockWaves=${ok}`);
    }
    case "swave.orchestrator_parallel_plan_phase": {
      const ok =
        orchestrator.includes('phaseStart("parallel_plan"') &&
        orchestrator.includes("waveSummary");
      return probe(id, category, expected, ok, `parallelPlanPhase=${ok}`);
    }
    case "swave.prompt_parallel_wave_plan": {
      const ok =
        prompts.includes("PARALLEL WAVE PLAN:") ||
        prompts.includes("Parallel wave plan:");
      return probe(id, category, expected, ok, `parallelWavePlanSection=${ok}`);
    }
    case "swave.parser_wave_plan_fields": {
      const parsed = parseDecomposeResponse(SAMPLE_BLOCK_DECOMPOSE_WITH_DEPS);
      const ok =
        parsed.ok === true &&
        "parallelWavePlan" in parsed.data &&
        parser.includes("PARALLEL WAVE PLAN");
      return probe(id, category, expected, ok, `parallelWavePlanField=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown block_wave_plan probe");
  }
}

function probeAtomWavePlan(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistParallelWaveProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "swave.orchestrator_atom_waves": {
      const ok = orchestrator.includes("computeAtomWaves(");
      return probe(id, category, expected, ok, `atomWaves=${ok}`);
    }
    case "swave.block_order_preserves_waves": {
      const ok =
        orchestrator.includes("computeBlockWaves(") &&
        orchestrator.includes("for (const { index: i, wave } of effectiveBlockOrder)") &&
        orchestrator.includes("blockOrder");
      return probe(id, category, expected, ok, `waveOrdering=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown atom_wave_plan probe");
  }
}

function probeResourceWaveBudget(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistParallelWaveProbeResult {
  const orchestrator = orchestratorSource();
  const prompts = promptsSource();
  const rateLimiter = rateLimiterSource();

  switch (id) {
    case "swave.rate_limiter_parallel_safety": {
      const ok =
        rateLimiter.includes("maxCallsPerMinute") &&
        rateLimiter.includes("minDelayBetweenCalls") &&
        rateLimiter.includes("BudgetExceededError");
      return probe(id, category, expected, ok, `parallelSafety=${ok}`);
    }
    case "swave.resource_plan_wave_budget_link": {
      const ok =
        prompts.includes("RESOURCE PLAN:") &&
        prompts.includes("Blocks with NO dependencies can run IN PARALLEL");
      return probe(id, category, expected, ok, `resourceWaveLink=${ok}`);
    }
    case "swave.orchestrator_pre_exec_wave_gate": {
      const ok =
        hasProductionExport("validateStrategistParallelWave") &&
        orchestrator.includes("validateStrategistParallelWave(");
      return probe(id, category, expected, ok, `preExecWaveGate=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown resource_wave_budget probe");
  }
}

function probeBaselineLink(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistParallelWaveProbeResult {
  switch (id) {
    case "swave.b06_block_handoff_entry": {
      const handoff = getForgeP03B06ToB07Handoff();
      const ok =
        handoff.targetBlock.blockId === "P03-B07" &&
        handoff.targetBlock.entryAtom === "P03-B07-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "swave.b06_sealed_resource_budget_probes": {
      const handoff = getForgeP03B06ToB07Handoff();
      const coverage = summarizeStrategistResourceBudgetCoverage(
        getActiveStrategistResourceBudgetContract(),
      );
      const ok = handoff.sealedArtifacts.probeCount === coverage.totalProbes;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoff_probes=${handoff.sealedArtifacts.probeCount}, contract=${coverage.totalProbes}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown baseline_link probe");
  }
}

function probeBoundary(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistParallelWaveBaseline,
): StrategistParallelWaveProbeResult {
  switch (id) {
    case "swave.source_block_gate_ref": {
      const handoff = getForgeP03B06ToB07Handoff();
      const coverage = summarizeStrategistResourceBudgetCoverage(
        getActiveStrategistResourceBudgetContract(),
      );
      const ok =
        fixture.sourceBlockGate.atom === "P03-B06-A10" &&
        fixture.sourceBlockGate.resourceBudgetProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P03_B06_SEALED_ATOM_COUNT &&
        handoff.atom === "P03-B06-A10";
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.resourceBudgetProbeCount}`,
      );
    }
    case "swave.probe_runner_exported": {
      const ok = productionParallelWaveSource().includes(
        "export function runStrategistParallelWaveProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "swave.known_gaps_documented": {
      const contract = getActiveStrategistParallelWaveContract();
      const expectedFail = contract.probes.filter(p => p.expected === "FAIL").length;
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount === expectedFail && failCount >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, matrixExpectedFail=${expectedFail}`,
      );
    }
    case "swave.empty_decompose_boundary": {
      const result = assessStrategistParallelWaveInputBoundary("");
      const ok =
        hasProductionExport("assessStrategistParallelWaveInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, acceptable=${result.acceptable}`,
      );
    }
    case "swave.whitespace_decompose_boundary": {
      const result = assessStrategistParallelWaveInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessStrategistParallelWaveInputBoundary") &&
        result.disposition === "whitespace_only" &&
        result.acceptable === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, acceptable=${result.acceptable}`,
      );
    }
    case "swave.long_decompose_truncation_boundary": {
      const longDecompose = "x".repeat(STRATEGIST_PARALLEL_WAVE_DECOMPOSE_MAX_LENGTH + 500);
      const result = assessStrategistParallelWaveInputBoundary(longDecompose);
      const ok =
        hasProductionExport("assessStrategistParallelWaveInputBoundary") &&
        result.disposition === "exceeds_max_length" &&
        result.truncated === true &&
        result.normalizedDecompose.length === STRATEGIST_PARALLEL_WAVE_DECOMPOSE_MAX_LENGTH &&
        result.acceptable === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, truncated=${result.truncated}, len=${result.normalizedDecompose.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistParallelWaveBaseline,
): StrategistParallelWaveProbeResult {
  switch (id) {
    case "swave.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateStrategistParallelWaveBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "swave.malformed_decompose_guard": {
      const boundary = assessStrategistParallelWaveInputBoundary("bad\0decompose");
      const ok =
        hasProductionExport("assessStrategistParallelWaveInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false;
      return probe(id, category, expected, ok, `detail=${boundary.detail}`);
    }
    case "swave.min_category_probes": {
      const underflow = { ...fixture, probes: fixture.probes.filter(p => p.category !== "nogo_path") };
      const ok = validateStrategistParallelWaveBaseline(underflow).valid === false;
      return probe(id, category, expected, ok, `rejectsUnderflow=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistParallelWaveProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "swave.recovery_sequential_fallback": {
      const ok =
        orchestrator.includes("Within each wave, blocks run sequentially") ||
        orchestrator.includes("shared file system safety");
      return probe(id, category, expected, ok, `sequentialFallback=${ok}`);
    }
    case "swave.recovery_wave_checkpoint": {
      const ok =
        orchestrator.includes("createPoint(\"block\"") &&
        orchestrator.includes("effectiveBlockOrder") &&
        orchestrator.includes("resumeFromBlock");
      return probe(id, category, expected, ok, `waveCheckpoint=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistParallelWaveProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "swave.nogo_invalid_wave_plan": {
      const ok =
        orchestrator.includes("validateStrategistParallelWave(") ||
        orchestrator.includes("invalid wave plan") ||
        orchestrator.includes("wave plan rejected");
      return probe(id, category, expected, ok, `invalidWavePlanGate=${ok}`);
    }
    case "swave.exported_wave_validator": {
      const ok =
        hasProductionExport("validateStrategistParallelWave") &&
        orchestrator.includes("validateStrategistParallelWave(");
      return probe(id, category, expected, ok, `waveValidator=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistParallelWaveBaseline,
): StrategistParallelWaveProbeResult {
  switch (category) {
    case "wave_versioning":
      return probeWaveVersioning(id, category, expected, fixture);
    case "block_wave_plan":
      return probeBlockWavePlan(id, category, expected);
    case "atom_wave_plan":
      return probeAtomWavePlan(id, category, expected);
    case "resource_wave_budget":
      return probeResourceWaveBudget(id, category, expected);
    case "baseline_link":
      return probeBaselineLink(id, category, expected);
    case "boundary":
      return probeBoundary(id, category, expected, fixture);
    case "failure_path":
      return probeFailurePath(id, category, expected, fixture);
    case "recovery_path":
      return probeRecoveryPath(id, category, expected);
    case "nogo_path":
      return probeNogoPath(id, category, expected);
    default:
      return probe(id, category, expected, false, "unknown category");
  }
}

export function runStrategistParallelWaveProbes(
  fixture: StrategistParallelWaveBaseline = loadStrategistParallelWaveBaseline(),
): StrategistParallelWaveProbeResult[] {
  const contract = getActiveStrategistParallelWaveContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion ? { ...result, criterion: contractProbe.criterion } : result;
  });
}

// ─── Evidence, telemetry and provenance (P03-B07-A06) ────────────────────────

export interface StrategistParallelWaveProbeEvidence {
  probeId: string;
  category: StrategistParallelWaveCategory;
  disposition: StrategistParallelWaveProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

export interface StrategistParallelWaveProbeTelemetry {
  probeId: string;
  category: StrategistParallelWaveCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P03-B07-A06). */
export interface StrategistParallelWaveProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourceBlockGateVersion: string;
  sourceBlockGateAtom: string;
  sliceAtom?: string;
  sliceCategories?: readonly StrategistParallelWaveCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated parallel wave run record bundling evidence, telemetry and provenance. */
export interface StrategistParallelWaveRunRecord {
  provenance: StrategistParallelWaveProvenance;
  evidence: StrategistParallelWaveProbeEvidence[];
  telemetry: StrategistParallelWaveProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<StrategistParallelWaveCategory, number>;
    byDisposition: Record<StrategistParallelWaveProbeDisposition, number>;
  };
}

export interface StrategistParallelWaveRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface StrategistParallelWaveRunValidationResult {
  valid: boolean;
  issues: StrategistParallelWaveRunValidationIssue[];
}

export function buildStrategistParallelWaveProbeEvidence(
  probeId: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: StrategistParallelWaveProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): StrategistParallelWaveProbeEvidence {
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

export function buildStrategistParallelWaveProbeTelemetry(
  probeId: string,
  category: StrategistParallelWaveCategory,
  sequenceIndex: number,
  durationMs: number,
): StrategistParallelWaveProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildStrategistParallelWaveProvenance(
  runId: string,
  fixture: StrategistParallelWaveBaseline,
  contract: StrategistParallelWaveContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly StrategistParallelWaveCategory[];
  },
): StrategistParallelWaveProvenance {
  return {
    runId,
    harnessVersion: FORGE_STRATEGIST_PARALLEL_WAVE_VERSION,
    contractVersion: contract.version,
    contractAtom: contract.atom,
    fixtureVersion: fixture.version,
    fixtureAtom: fixture.atom,
    sourceBlockGateVersion: fixture.sourceBlockGate.version,
    sourceBlockGateAtom: fixture.sourceBlockGate.atom,
    startedAt,
    completedAt,
    totalProbes,
    ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
    ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    ...(options?.gitCommit ? { gitCommit: options.gitCommit } : {}),
  };
}

export function buildStrategistParallelWaveRunRecord(
  provenance: StrategistParallelWaveProvenance,
  evidence: StrategistParallelWaveProbeEvidence[],
  telemetry: StrategistParallelWaveProbeTelemetry[],
): StrategistParallelWaveRunRecord {
  const byCategory = {} as Record<StrategistParallelWaveCategory, number>;
  const byDisposition: Record<StrategistParallelWaveProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of STRATEGIST_PARALLEL_WAVE_CATEGORIES) {
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

function validateStrategistParallelWaveRunRecordAgainstProbeIds(
  record: StrategistParallelWaveRunRecord,
  expectedProbeIds: string[],
  contract: StrategistParallelWaveContract,
): StrategistParallelWaveRunValidationResult {
  const issues: StrategistParallelWaveRunValidationIssue[] = [];
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

export function validateStrategistParallelWaveRunRecord(
  record: StrategistParallelWaveRunRecord,
  contract: StrategistParallelWaveContract = getActiveStrategistParallelWaveContract(),
): StrategistParallelWaveRunValidationResult {
  return validateStrategistParallelWaveRunRecordAgainstProbeIds(
    record,
    listStrategistParallelWaveContractProbeIds(contract),
    contract,
  );
}

/** Validate failure/recovery slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateStrategistParallelWaveFailureRecoveryRunRecord(
  record: StrategistParallelWaveRunRecord,
  contract: StrategistParallelWaveContract = getActiveStrategistParallelWaveContract(),
): StrategistParallelWaveRunValidationResult {
  const issues: StrategistParallelWaveRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P03-B07-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P03-B07-A06`,
    });
  }

  const expectedCategories = [...STRATEGIST_PARALLEL_WAVE_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateStrategistParallelWaveRunRecordAgainstProbeIds(
    record,
    listStrategistParallelWaveFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

export interface StrategistParallelWaveEvidenceSliceResult {
  atom: "P03-B07-A06";
  evidenceProbeCount: number;
  matrixValid: boolean;
  recordValid: boolean;
  results: StrategistParallelWaveProbeResult[];
  evidenceResults: StrategistParallelWaveProbeResult[];
  matrixValidation: StrategistParallelWaveProbeMatrixValidationResult;
  record: StrategistParallelWaveRunRecord;
  recordValidation: StrategistParallelWaveRunValidationResult;
}

function resolveStrategistParallelWaveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function runStrategistParallelWaveProbeWithTiming(
  entry: StrategistParallelWaveFixtureEntry,
  fixture: StrategistParallelWaveBaseline,
  contractProbe:
    | { criterion: string; disposition: StrategistParallelWaveProbeDisposition }
    | undefined,
): {
  result: StrategistParallelWaveProbeResult;
  durationMs: number;
  disposition: StrategistParallelWaveProbeDisposition;
} {
  const start = performance.now();
  const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
  const enriched = contractProbe?.criterion
    ? { ...result, criterion: contractProbe.criterion }
    : result;
  const durationMs = performance.now() - start;
  return {
    result: enriched,
    durationMs,
    disposition: contractProbe?.disposition ?? "observed",
  };
}

function buildStrategistParallelWaveRecordFromEntries(
  entries: StrategistParallelWaveFixtureEntry[],
  fixture: StrategistParallelWaveBaseline,
  contract: StrategistParallelWaveContract,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly StrategistParallelWaveCategory[];
  },
): StrategistParallelWaveRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: StrategistParallelWaveProbeEvidence[] = [];
  const telemetry: StrategistParallelWaveProbeTelemetry[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runStrategistParallelWaveProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildStrategistParallelWaveProbeEvidence(
        result.id,
        result.category,
        result.expected,
        result.actual,
        result.aligned,
        criterion,
        result.detail,
        disposition,
      ),
    );
    telemetry.push(
      buildStrategistParallelWaveProbeTelemetry(
        result.id,
        result.category,
        sequenceIndex,
        durationMs,
      ),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildStrategistParallelWaveProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveStrategistParallelWaveGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildStrategistParallelWaveRunRecord(provenance, evidence, telemetry);
}

/** Run all parallel wave probes and emit auditable evidence, telemetry and provenance (P03-B07-A06). */
export function runStrategistParallelWaveProbesWithRecord(
  fixture: StrategistParallelWaveBaseline = loadStrategistParallelWaveBaseline(),
): StrategistParallelWaveRunRecord {
  const contract = getActiveStrategistParallelWaveContract();
  return buildStrategistParallelWaveRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P03-B07-A06). */
export function runStrategistParallelWaveFailureRecoverySliceWithRecord(
  fixture: StrategistParallelWaveBaseline = loadStrategistParallelWaveBaseline(),
): StrategistParallelWaveRunRecord {
  const contract = getActiveStrategistParallelWaveContract();
  const failureRecoveryIds = new Set(listStrategistParallelWaveFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildStrategistParallelWaveRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P03-B07-A06",
    sliceCategories: STRATEGIST_PARALLEL_WAVE_FAILURE_RECOVERY_CATEGORIES,
  });
}

/**
 * A06 evidence slice: contract-wired failure_path, recovery_path, and nogo_path probes
 * with auditable evidence, telemetry and provenance — zero unexpected mismatches.
 */
export function runStrategistParallelWaveEvidenceSlice(
  fixture: StrategistParallelWaveBaseline = loadStrategistParallelWaveBaseline(),
): StrategistParallelWaveEvidenceSliceResult {
  const contract = getActiveStrategistParallelWaveContract();
  const results = runStrategistParallelWaveProbes(fixture);
  const failureRecoveryProbes = STRATEGIST_PARALLEL_WAVE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistParallelWaveContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const evidenceResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateStrategistParallelWaveFailureRecoveryProbeMatrix(
    results,
    contract,
  );
  const record = runStrategistParallelWaveFailureRecoverySliceWithRecord(fixture);
  const recordValidation = validateStrategistParallelWaveFailureRecoveryRunRecord(
    record,
    contract,
  );

  return {
    atom: "P03-B07-A06",
    evidenceProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    recordValid: recordValidation.valid && record.summary.mismatches === 0,
    results,
    evidenceResults,
    matrixValidation,
    record,
    recordValidation,
  };
}

// ─── Property and fuzz validation (P03-B07-A07) ──────────────────────────────

export interface StrategistParallelWavePropertyViolation {
  propertyId: string;
  detail: string;
}

export interface StrategistParallelWavePropertyResult {
  passed: number;
  failed: StrategistParallelWavePropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type StrategistParallelWavePropertyCheck = {
  id: string;
  description: string;
  check: (contract: StrategistParallelWaveContract) => string | null;
};

const STRATEGIST_PARALLEL_WAVE_STRUCTURAL_PROPERTIES: readonly StrategistParallelWavePropertyCheck[] = [
  {
    id: "categories_complete",
    description: "All nine strategist parallel wave categories are declared",
    check: contract => {
      for (const category of STRATEGIST_PARALLEL_WAVE_CATEGORIES) {
        if (!contract.categories[category]) return `missing category: ${category}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listStrategistParallelWaveContractProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each category meets contract minProbeCount",
    check: contract => {
      for (const category of STRATEGIST_PARALLEL_WAVE_CATEGORIES) {
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
    description:
      "summarizeStrategistParallelWaveCoverage totals match listStrategistParallelWaveContractProbeIds",
    check: contract => {
      const summary = summarizeStrategistParallelWaveCoverage(contract);
      const ids = listStrategistParallelWaveContractProbeIds(contract);
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
    description: "Probe ids are namespaced with swave. prefix",
    check: contract => {
      for (const probe of contract.probes) {
        if (!probe.id.startsWith("swave.")) {
          return `${probe.id} missing swave. prefix`;
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const fixture = loadStrategistParallelWaveBaseline();
      const probeIds = listStrategistParallelWaveContractProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildStrategistParallelWaveProbeEvidence(
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
        return buildStrategistParallelWaveProbeTelemetry(id, probe.category, index, index);
      });
      const record = buildStrategistParallelWaveRunRecord(
        buildStrategistParallelWaveProvenance(
          "property-check",
          fixture,
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
    description:
      "Synthetic failure/recovery slice record passes validateStrategistParallelWaveFailureRecoveryRunRecord",
    check: contract => {
      const fixture = loadStrategistParallelWaveBaseline();
      const probeIds = listStrategistParallelWaveFailureRecoveryProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildStrategistParallelWaveProbeEvidence(
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
        return buildStrategistParallelWaveProbeTelemetry(id, probe.category, index, index * 0.5);
      });
      const record = buildStrategistParallelWaveRunRecord(
        buildStrategistParallelWaveProvenance(
          "property-check-failure-recovery",
          fixture,
          contract,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:01.000Z",
          probeIds.length,
          {
            sliceAtom: "P03-B07-A06",
            sliceCategories: STRATEGIST_PARALLEL_WAVE_FAILURE_RECOVERY_CATEGORIES,
          },
        ),
        evidence,
        telemetry,
      );
      const validation = validateStrategistParallelWaveFailureRecoveryRunRecord(record, contract);
      if (!validation.valid) {
        return validation.issues.map(i => i.detail).join("; ");
      }
      return null;
    },
  },
] as const;

export function runStrategistParallelWavePropertyChecks(
  contract: StrategistParallelWaveContract = getActiveStrategistParallelWaveContract(),
): StrategistParallelWavePropertyResult {
  const failed: StrategistParallelWavePropertyViolation[] = [];
  for (const property of STRATEGIST_PARALLEL_WAVE_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = STRATEGIST_PARALLEL_WAVE_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type StrategistParallelWaveFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface StrategistParallelWaveFuzzMutationCase {
  seed: number;
  kind: StrategistParallelWaveFuzzMutationKind;
  probeId?: string;
  category?: StrategistParallelWaveCategory;
}

export interface StrategistParallelWaveFuzzValidationCaseResult {
  mutation: StrategistParallelWaveFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface StrategistParallelWaveFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: StrategistParallelWaveFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createStrategistParallelWaveFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneStrategistParallelWaveBaseline(
  fixture: StrategistParallelWaveBaseline,
): StrategistParallelWaveBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickStrategistParallelWaveFuzzTarget(
  fixture: StrategistParallelWaveBaseline,
  rng: () => number,
): { category: StrategistParallelWaveCategory; index: number; entry: StrategistParallelWaveFixtureEntry } {
  const category =
    STRATEGIST_PARALLEL_WAVE_CATEGORIES[Math.floor(rng() * STRATEGIST_PARALLEL_WAVE_CATEGORIES.length)]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyStrategistParallelWaveFuzzMutation(
  fixture: StrategistParallelWaveBaseline,
  mutation: StrategistParallelWaveFuzzMutationCase,
): StrategistParallelWaveBaseline {
  const mutated = cloneStrategistParallelWaveBaseline(fixture);
  const targetCategory = mutation.category ?? STRATEGIST_PARALLEL_WAVE_CATEGORIES[0]!;
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
          id: `swave.fuzz.extra.${mutation.seed}`,
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
      const other = STRATEGIST_PARALLEL_WAVE_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateStrategistParallelWaveFuzzMutationCases(
  fixture: StrategistParallelWaveBaseline,
  seed: number,
  iterations: number,
): StrategistParallelWaveFuzzMutationCase[] {
  const rng = createStrategistParallelWaveFuzzRng(seed);
  const kinds: StrategistParallelWaveFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: StrategistParallelWaveFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickStrategistParallelWaveFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P03-B07-A07). */
export function runStrategistParallelWaveFuzzValidation(
  fixture: StrategistParallelWaveBaseline,
  contract: StrategistParallelWaveContract = getActiveStrategistParallelWaveContract(),
  seed = 42,
  iterations = 24,
): StrategistParallelWaveFuzzValidationResult {
  const cases = generateStrategistParallelWaveFuzzMutationCases(fixture, seed, iterations);
  const results: StrategistParallelWaveFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyStrategistParallelWaveFuzzMutation(fixture, mutation);
    const validation = validateStrategistParallelWaveAgainstContract(mutated, contract);
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

export type StrategistParallelWaveRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface StrategistParallelWaveRunRecordFuzzCase {
  kind: StrategistParallelWaveRunRecordFuzzKind;
  probeId?: string;
}

export function applyStrategistParallelWaveRunRecordFuzzMutation(
  record: StrategistParallelWaveRunRecord,
  mutation: StrategistParallelWaveRunRecordFuzzCase,
): StrategistParallelWaveRunRecord {
  const cloned: StrategistParallelWaveRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P03-B07-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["wave_versioning"],
      };
      break;
  }

  cloned.summary = buildStrategistParallelWaveRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveStrategistParallelWaveRunRecordValidator(
  record: StrategistParallelWaveRunRecord,
): (
  record: StrategistParallelWaveRunRecord,
  contract: StrategistParallelWaveContract,
) => StrategistParallelWaveRunValidationResult {
  return record.provenance.sliceAtom === "P03-B07-A06"
    ? validateStrategistParallelWaveFailureRecoveryRunRecord
    : validateStrategistParallelWaveRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P03-B07-A07). */
export function runStrategistParallelWaveRunRecordFuzzValidation(
  record: StrategistParallelWaveRunRecord,
  contract: StrategistParallelWaveContract = getActiveStrategistParallelWaveContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveStrategistParallelWaveRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: StrategistParallelWaveRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P03-B07-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyStrategistParallelWaveRunRecordFuzzMutation(record, mutation);
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

export interface StrategistParallelWavePropertyFuzzSliceResult {
  atom: "P03-B07-A07";
  propertyChecksPassed: boolean;
  contractFuzzRejected: boolean;
  runRecordFuzzRejected: boolean;
  propertyResult: StrategistParallelWavePropertyResult;
  contractFuzz: StrategistParallelWaveFuzzValidationResult;
  runRecordFuzz: {
    validBaseline: boolean;
    mutationsRejected: number;
    mutationsAccepted: number;
  };
}

/**
 * A07 property/fuzz slice: structural property checks and contract fuzz gates
 * with zero accepted mutations.
 */
export function runStrategistParallelWavePropertyFuzzSlice(
  fixture: StrategistParallelWaveBaseline = loadStrategistParallelWaveBaseline(),
): StrategistParallelWavePropertyFuzzSliceResult {
  const contract = getActiveStrategistParallelWaveContract();
  const propertyResult = runStrategistParallelWavePropertyChecks(contract);
  const contractFuzz = runStrategistParallelWaveFuzzValidation(fixture, contract);
  const record = runStrategistParallelWaveFailureRecoverySliceWithRecord(fixture);
  const runRecordFuzz = runStrategistParallelWaveRunRecordFuzzValidation(record, contract);

  return {
    atom: "P03-B07-A07",
    propertyChecksPassed: propertyResult.allPassed,
    contractFuzzRejected: contractFuzz.allMutationsRejected,
    runRecordFuzzRejected: runRecordFuzz.mutationsAccepted === 0,
    propertyResult,
    contractFuzz,
    runRecordFuzz,
  };
}
