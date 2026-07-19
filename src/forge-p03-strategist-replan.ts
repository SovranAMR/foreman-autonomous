/**
 * FOREMAN — Strategist Replan & Plan Repair Baseline (P03-B08)
 *
 * A01 slice: load, validate, run probes against sealed P03-B07 parallel
 * wave block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import strategistReplanBaseline from "./fixtures/forge-strategist-replan-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP03B07ToB08Handoff,
  summarizeStrategistParallelWaveCoverage,
  getActiveStrategistParallelWaveContract,
  FORGE_STRATEGIST_PARALLEL_WAVE_VERSION,
} from "./forge-p03-strategist-parallel-wave.js";
import { VALID_TRANSITIONS } from "./types.js";
import { parseDecomposeResponse } from "./parser.js";

export const FORGE_STRATEGIST_REPLAN_VERSION = "1.0.0";

export const EXPECTED_P03_B07_SEALED_ATOM_COUNT = 10;

export const STRATEGIST_REPLAN_DECOMPOSE_MAX_LENGTH = 64000;

export const STRATEGIST_REPLAN_CATEGORIES = [
  "replan_versioning",
  "block_replan_path",
  "atom_replan_path",
  "plan_repair_seam",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type StrategistReplanCategory = (typeof STRATEGIST_REPLAN_CATEGORIES)[number];

export const STRATEGIST_REPLAN_A01_MIN_PROBES: Readonly<
  Record<StrategistReplanCategory, number>
> = {
  replan_versioning: 3,
  block_replan_path: 4,
  atom_replan_path: 2,
  plan_repair_seam: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 3,
  recovery_path: 3,
  nogo_path: 2,
};

export type StrategistReplanInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface StrategistReplanInputBoundary {
  disposition: StrategistReplanInputDisposition;
  acceptable: boolean;
  normalizedDecompose: string;
  truncated: boolean;
  detail: string;
}

export function assessStrategistReplanInputBoundary(
  decomposeOutput: string,
): StrategistReplanInputBoundary {
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
    const disposition: StrategistReplanInputDisposition =
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
  if (normalizedDecompose.length > STRATEGIST_REPLAN_DECOMPOSE_MAX_LENGTH) {
    normalizedDecompose = normalizedDecompose.slice(0, STRATEGIST_REPLAN_DECOMPOSE_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedDecompose,
    truncated,
    detail: truncated
      ? `decompose truncated to ${STRATEGIST_REPLAN_DECOMPOSE_MAX_LENGTH} characters`
      : "valid decompose output",
  };
}

export interface StrategistReplanValidationOutcome {
  valid: boolean;
  hasReplanPlan: boolean;
  blockCount: number;
  invalidBlockRefs: number[];
  issues: string[];
}

/**
 * Extract 1-based block indices referenced in a strategist replan plan section.
 */
export function parseReplanBlockRefs(
  replanPlan: string | undefined,
  blockCount: number,
): number[] {
  if (!replanPlan || replanPlan.trim().length === 0 || blockCount <= 0) {
    return [];
  }

  const refs = new Set<number>();
  const matches = replanPlan.match(/\b(?:block\s*)?(\d+)\b/gi) ?? [];
  for (const match of matches) {
    const numMatch = match.match(/(\d+)/);
    if (!numMatch) continue;
    const blockNum = parseInt(numMatch[1], 10);
    if (Number.isFinite(blockNum)) {
      refs.add(blockNum);
    }
  }

  const invalid: number[] = [];
  for (const ref of refs) {
    if (ref < 1 || ref > blockCount) {
      invalid.push(ref);
    }
  }
  return [...new Set(invalid)].sort((a, b) => a - b);
}

/**
 * Validate strategist decompose output and replan plan block references (P03-B08-A03).
 */
export function validateStrategistReplan(
  decomposeOutput: string,
): StrategistReplanValidationOutcome {
  const boundary = assessStrategistReplanInputBoundary(decomposeOutput);
  if (!boundary.acceptable) {
    return {
      valid: false,
      hasReplanPlan: false,
      blockCount: 0,
      invalidBlockRefs: [],
      issues: [boundary.detail],
    };
  }

  const parsed = parseDecomposeResponse(boundary.normalizedDecompose);
  if (!parsed.ok) {
    return {
      valid: false,
      hasReplanPlan: false,
      blockCount: 0,
      invalidBlockRefs: [],
      issues: parsed.error.missing,
    };
  }

  const blockCount = parsed.data.blocks.length;
  const replanPlan = parsed.data.replanPlan;
  const hasReplanPlan = replanPlan !== undefined && replanPlan.trim().length > 0;
  const invalidBlockRefs = parseReplanBlockRefs(replanPlan, blockCount);
  const issues: string[] = [];

  if (blockCount === 0) {
    issues.push("missing_blocks");
  }
  if (invalidBlockRefs.length > 0) {
    issues.push(`invalid_replan_block_refs:${invalidBlockRefs.join(",")}`);
  }

  return {
    valid: issues.length === 0,
    hasReplanPlan,
    blockCount,
    invalidBlockRefs,
    issues,
  };
}

export interface StrategistReplanFixtureEntry {
  id: string;
  category: StrategistReplanCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface StrategistReplanBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    parallelWaveProbeCount: number;
    sealedAtomCount: number;
  };
  probes: StrategistReplanFixtureEntry[];
}

export interface StrategistReplanProbeResult {
  id: string;
  category: StrategistReplanCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface StrategistReplanProbeSummary {
  total: number;
  aligned: number;
  mismatches: StrategistReplanProbeResult[];
  knownGaps: StrategistReplanProbeResult[];
  byCategory: Record<
    StrategistReplanCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface StrategistReplanValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: StrategistReplanCategory;
  detail: string;
}

export interface StrategistReplanValidationResult {
  valid: boolean;
  issues: StrategistReplanValidationIssue[];
}

export type StrategistReplanProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface StrategistReplanProbeContract {
  id: string;
  category: StrategistReplanCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: StrategistReplanProbeDisposition;
  criterion: string;
}

export interface StrategistReplanCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface StrategistReplanCategoryContract {
  category: StrategistReplanCategory;
  acceptance: StrategistReplanCategoryAcceptance;
  probes: readonly StrategistReplanProbeContract[];
}

export interface StrategistReplanContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<StrategistReplanCategory, StrategistReplanCategoryContract>;
  probes: readonly StrategistReplanProbeContract[];
}

export interface StrategistReplanCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: StrategistReplanCategory;
  detail: string;
}

export interface StrategistReplanCoverageResult {
  valid: boolean;
  issues: StrategistReplanCoverageIssue[];
}

function replanDisposition(
  category: StrategistReplanCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistReplanProbeDisposition {
  if (category === "failure_path") return "failure";
  if (category === "recovery_path") return "recovery";
  if (category === "nogo_path") return expected === "FAIL" ? "gap" : "nogo";
  if (expected === "FAIL") return "gap";
  return "observed";
}

function replanProbeContract(entry: StrategistReplanFixtureEntry): StrategistReplanProbeContract {
  return {
    ...entry,
    disposition: replanDisposition(entry.category, entry.expected),
    criterion: entry.description,
  };
}

function buildReplanCategoryContract(
  category: StrategistReplanCategory,
  invariant: string,
  entries: StrategistReplanFixtureEntry[],
): StrategistReplanCategoryContract {
  const probes = entries.map(replanProbeContract);
  return {
    category,
    acceptance: {
      invariant,
      minProbeCount: STRATEGIST_REPLAN_A01_MIN_PROBES[category],
      requireFullAlignment: true,
    },
    probes,
  };
}

const REPLAN_FIXTURE_ENTRIES =
  strategistReplanBaseline.probes as StrategistReplanFixtureEntry[];

const STRATEGIST_REPLAN_CATEGORY_CONTRACTS: Record<
  StrategistReplanCategory,
  StrategistReplanCategoryContract
> = {
  replan_versioning: buildReplanCategoryContract(
    "replan_versioning",
    "Strategist replan baseline declares semver version, atom id and exported harness version.",
    REPLAN_FIXTURE_ENTRIES.filter(p => p.category === "replan_versioning"),
  ),
  block_replan_path: buildReplanCategoryContract(
    "block_replan_path",
    "Block-level replan paths are wired via state machine, orchestrator re_decompose and strategist BLOCK signals.",
    REPLAN_FIXTURE_ENTRIES.filter(p => p.category === "block_replan_path"),
  ),
  atom_replan_path: buildReplanCategoryContract(
    "atom_replan_path",
    "Atom-level replan triggers and parser fields measure block failure recovery depth.",
    REPLAN_FIXTURE_ENTRIES.filter(p => p.category === "atom_replan_path"),
  ),
  plan_repair_seam: buildReplanCategoryContract(
    "plan_repair_seam",
    "Plan repair seam connects work tracker, tools and orchestrator strategist replan validation.",
    REPLAN_FIXTURE_ENTRIES.filter(p => p.category === "plan_repair_seam"),
  ),
  baseline_link: buildReplanCategoryContract(
    "baseline_link",
    "Replan baseline links to sealed P03-B07 parallel wave block gate and B08 handoff.",
    REPLAN_FIXTURE_ENTRIES.filter(p => p.category === "baseline_link"),
  ),
  boundary: buildReplanCategoryContract(
    "boundary",
    "Replan boundary assessment, probe runner export and documented gaps wired.",
    REPLAN_FIXTURE_ENTRIES.filter(p => p.category === "boundary"),
  ),
  failure_path: buildReplanCategoryContract(
    "failure_path",
    "Baseline validation rejects invalid versions, malformed input and underflow categories.",
    REPLAN_FIXTURE_ENTRIES.filter(p => p.category === "failure_path"),
  ),
  recovery_path: buildReplanCategoryContract(
    "recovery_path",
    "Recovery paths exercise reflecting replan edges and formal state machine blocked recovery.",
    REPLAN_FIXTURE_ENTRIES.filter(p => p.category === "recovery_path"),
  ),
  nogo_path: buildReplanCategoryContract(
    "nogo_path",
    "NO-GO gates reject invalid replan plans and require exported strategist replan validator.",
    REPLAN_FIXTURE_ENTRIES.filter(p => p.category === "nogo_path"),
  ),
};

export const FORGE_STRATEGIST_REPLAN_CONTRACT_V1: StrategistReplanContract = {
  version: "1.0.0",
  atom: "P03-B08-A06",
  purpose:
    "Typed strategist replan and plan repair contract with measurable probes for block/atom replan, boundary and recovery paths.",
  categories: STRATEGIST_REPLAN_CATEGORY_CONTRACTS,
  probes: STRATEGIST_REPLAN_CATEGORIES.flatMap(category => STRATEGIST_REPLAN_CATEGORY_CONTRACTS[category].probes),
};

export function getActiveStrategistReplanContract(): StrategistReplanContract {
  return FORGE_STRATEGIST_REPLAN_CONTRACT_V1;
}

export function summarizeStrategistReplanCoverage(
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<StrategistReplanCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<StrategistReplanProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    StrategistReplanCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<StrategistReplanProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };

  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of STRATEGIST_REPLAN_CATEGORIES) {
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

export function validateStrategistReplanAgainstContract(
  fixture: StrategistReplanBaseline,
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
): StrategistReplanValidationResult {
  const issues: StrategistReplanValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  for (const category of STRATEGIST_REPLAN_CATEGORIES) {
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
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_probe",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${expectedFailCount}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

export function getStrategistReplanCategoryContract(
  category: StrategistReplanCategory,
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
): StrategistReplanCategoryContract {
  return contract.categories[category];
}

export function listStrategistReplanContractProbeIds(
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listStrategistReplanProbesByDisposition(
  disposition: StrategistReplanProbeDisposition,
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
): StrategistReplanProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listStrategistReplanContractProbesByCategory(
  category: StrategistReplanCategory,
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
): StrategistReplanProbeContract[] {
  return contract.categories[category].probes;
}

export function validateStrategistReplanCoverage(
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
): StrategistReplanCoverageResult {
  const issues: StrategistReplanCoverageIssue[] = [];

  for (const category of STRATEGIST_REPLAN_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < STRATEGIST_REPLAN_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${STRATEGIST_REPLAN_A01_MIN_PROBES[category]}`,
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

  const ids = listStrategistReplanContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeStrategistReplanCoverage(contract);
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
    if (!probeEntry.id.startsWith("sreplan.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probeEntry.id,
        detail: `${probeEntry.id} missing sreplan. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export const FORGE_STRATEGIST_REPLAN_A01_PROBE_MATRIX: readonly StrategistReplanFixtureEntry[] =
  strategistReplanBaseline.probes as StrategistReplanFixtureEntry[];

export function loadStrategistReplanBaseline(): StrategistReplanBaseline {
  return strategistReplanBaseline as StrategistReplanBaseline;
}

export function validateStrategistReplanBaseline(
  fixture: StrategistReplanBaseline,
): StrategistReplanValidationResult {
  const issues: StrategistReplanValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P03-B08-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    STRATEGIST_REPLAN_CATEGORIES.map(category => [category, 0]),
  ) as Record<StrategistReplanCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of STRATEGIST_REPLAN_CATEGORIES) {
    const min = STRATEGIST_REPLAN_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_STRATEGIST_REPLAN_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_STRATEGIST_REPLAN_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_STRATEGIST_REPLAN_A01_PROBE_MATRIX) {
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

  const handoff = getForgeP03B07ToB08Handoff();
  const parallelCoverage = summarizeStrategistParallelWaveCoverage(
    getActiveStrategistParallelWaveContract(),
  );

  if (fixture.sourceBlockGate.atom !== "P03-B07-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P03-B07-A10`,
    });
  }
  if (fixture.sourceBlockGate.contractVersion !== FORGE_STRATEGIST_PARALLEL_WAVE_VERSION) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.contractVersion=${fixture.sourceBlockGate.contractVersion} ` +
        `expected=${FORGE_STRATEGIST_PARALLEL_WAVE_VERSION}`,
    });
  }
  if (fixture.sourceBlockGate.parallelWaveProbeCount !== parallelCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.parallelWaveProbeCount=${fixture.sourceBlockGate.parallelWaveProbeCount} ` +
        `contract=${parallelCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P03_B07_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P03_B07_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P03-B08-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `B07 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P03-B08-A01`,
    });
  }

  const expectedFailCount = getActiveStrategistReplanContract().probes.filter(
    p => p.expected === "FAIL",
  ).length;
  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_probe",
      detail: `fixture FAIL count=${failGaps.length} contract=${expectedFailCount}`,
    });
  }

  const contractAlignment = validateStrategistReplanAgainstContract(fixture);
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeStrategistReplanMatrix(
  results: StrategistReplanProbeResult[],
): StrategistReplanProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as StrategistReplanProbeSummary["byCategory"];
  for (const category of STRATEGIST_REPLAN_CATEGORIES) {
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

export function listStrategistReplanProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistReplanBaseline = loadStrategistReplanBaseline(),
): StrategistReplanFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listStrategistReplanKnownGaps(
  results: StrategistReplanProbeResult[],
): StrategistReplanProbeResult[] {
  return summarizeStrategistReplanMatrix(results).knownGaps;
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
  category: StrategistReplanCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): StrategistReplanProbeResult {
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

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function toolsSource(): string {
  return readSrc("tools.ts");
}

function workTrackerSource(): string {
  return readSrc("work-tracker.ts");
}

function fsmHarnessSource(): string {
  return readSrc("forge-formal-state-machine-harness.ts");
}

function productionReplanSource(): string {
  return readSrc("forge-p03-strategist-replan.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionReplanSource());
}

const SAMPLE_BLOCK_DECOMPOSE = `REASONING: Replan ordered blocks
OUTPUT:
Block 1: Setup replan baseline types
Block 2: Wire replan planner seam
Block 3: Add replan baseline tests
DEPENDENCIES: 2→1, 3→1,2
REPLAN PLAN: on block failure re-decompose blocks 2-3 with smaller atoms
CONFIDENCE: 0.85`;

function probeReplanVersioning(
  id: string,
  category: StrategistReplanCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistReplanBaseline,
): StrategistReplanProbeResult {
  switch (id) {
    case "sreplan.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "sreplan.atom_tagged": {
      const ok = fixture.atom === "P03-B08-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "sreplan.harness_version_exported": {
      const ok = FORGE_STRATEGIST_REPLAN_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_STRATEGIST_REPLAN_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown replan_versioning probe");
  }
}

function probeBlockReplanPath(
  id: string,
  category: StrategistReplanCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistReplanProbeResult {
  const orchestrator = orchestratorSource();
  const prompts = promptsSource();

  switch (id) {
    case "sreplan.state_blocked_to_decomposing": {
      const ok = (VALID_TRANSITIONS.blocked as readonly string[]).includes("decomposing");
      return probe(id, category, expected, ok, `blockedTargets=${ok}`);
    }
    case "sreplan.orchestrator_re_decompose_phase": {
      const ok =
        orchestrator.includes('phaseStart("re_decompose"') ||
        orchestrator.includes('phaseStart?.("re_decompose"');
      return probe(id, category, expected, ok, `reDecomposePhase=${ok}`);
    }
    case "sreplan.prompt_block_replan_signals": {
      const ok =
        prompts.includes("STRATEGIST_SYSTEM") &&
        prompts.includes("BLOCK Signal") &&
        prompts.includes("BLOCK signals UP");
      return probe(id, category, expected, ok, `blockReplanSignals=${ok}`);
    }
    case "sreplan.prompt_replan_plan": {
      const ok =
        prompts.includes("REPLAN PLAN:") ||
        prompts.includes("Replan plan:");
      return probe(id, category, expected, ok, `replanPlanSection=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown block_replan_path probe");
  }
}

function probeAtomReplanPath(
  id: string,
  category: StrategistReplanCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistReplanProbeResult {
  const orchestrator = orchestratorSource();
  const parser = readSrc("parser.ts");

  switch (id) {
    case "sreplan.orchestrator_block_failure_replan": {
      const ok =
        orchestrator.includes("blockSuccessRate") &&
        orchestrator.includes('phaseStart("re_decompose"');
      return probe(id, category, expected, ok, `blockFailureReplan=${ok}`);
    }
    case "sreplan.parser_replan_fields": {
      const parsed = parseDecomposeResponse(SAMPLE_BLOCK_DECOMPOSE);
      const ok =
        parsed.ok === true &&
        "replanPlan" in parsed.data &&
        parser.includes("REPLAN PLAN");
      return probe(id, category, expected, ok, `replanPlanField=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown atom_replan_path probe");
  }
}

function probePlanRepairSeam(
  id: string,
  category: StrategistReplanCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistReplanProbeResult {
  const orchestrator = orchestratorSource();
  const tools = toolsSource();
  const workTracker = workTrackerSource();

  switch (id) {
    case "sreplan.tools_work_replan": {
      const ok =
        tools.includes('name: "work_replan"') &&
        tools.includes('case "work_replan"');
      return probe(id, category, expected, ok, `workReplanTool=${ok}`);
    }
    case "sreplan.work_tracker_replan": {
      const ok =
        workTracker.includes("replan(workId: string") ||
        workTracker.includes("replan(workId:");
      return probe(id, category, expected, ok, `workTrackerReplan=${ok}`);
    }
    case "sreplan.orchestrator_strategist_replan_gate": {
      const ok =
        orchestrator.includes("validateStrategistReplan(") ||
        orchestrator.includes("invalid replan plan");
      return probe(id, category, expected, ok, `strategistReplanGate=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown plan_repair_seam probe");
  }
}

function probeBaselineLink(
  id: string,
  category: StrategistReplanCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistReplanProbeResult {
  switch (id) {
    case "sreplan.b07_block_handoff_entry": {
      const handoff = getForgeP03B07ToB08Handoff();
      const ok =
        handoff.targetBlock.blockId === "P03-B08" &&
        handoff.targetBlock.entryAtom === "P03-B08-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "sreplan.b07_sealed_parallel_wave_probes": {
      const handoff = getForgeP03B07ToB08Handoff();
      const coverage = summarizeStrategistParallelWaveCoverage(
        getActiveStrategistParallelWaveContract(),
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
  category: StrategistReplanCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistReplanBaseline,
): StrategistReplanProbeResult {
  switch (id) {
    case "sreplan.source_block_gate_ref": {
      const handoff = getForgeP03B07ToB08Handoff();
      const coverage = summarizeStrategistParallelWaveCoverage(
        getActiveStrategistParallelWaveContract(),
      );
      const ok =
        fixture.sourceBlockGate.atom === "P03-B07-A10" &&
        fixture.sourceBlockGate.parallelWaveProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P03_B07_SEALED_ATOM_COUNT &&
        handoff.sourceBlock.blockId === "P03-B07";
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.parallelWaveProbeCount}`,
      );
    }
    case "sreplan.probe_runner_exported": {
      const ok = productionReplanSource().includes(
        "export function runStrategistReplanProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "sreplan.known_gaps_documented": {
      const contract = getActiveStrategistReplanContract();
      const expectedFail = contract.probes.filter(p => p.expected === "FAIL").length;
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount === expectedFail;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, matrixExpectedFail=${expectedFail}`,
      );
    }
    case "sreplan.empty_decompose_boundary": {
      const result = assessStrategistReplanInputBoundary("");
      const ok =
        hasProductionExport("assessStrategistReplanInputBoundary") &&
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
    case "sreplan.whitespace_decompose_boundary": {
      const result = assessStrategistReplanInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessStrategistReplanInputBoundary") &&
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
    case "sreplan.long_decompose_truncation_boundary": {
      const longDecompose = "x".repeat(STRATEGIST_REPLAN_DECOMPOSE_MAX_LENGTH + 500);
      const result = assessStrategistReplanInputBoundary(longDecompose);
      const ok =
        hasProductionExport("assessStrategistReplanInputBoundary") &&
        result.disposition === "exceeds_max_length" &&
        result.truncated === true &&
        result.normalizedDecompose.length === STRATEGIST_REPLAN_DECOMPOSE_MAX_LENGTH &&
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
  category: StrategistReplanCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistReplanBaseline,
): StrategistReplanProbeResult {
  switch (id) {
    case "sreplan.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateStrategistReplanBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "sreplan.malformed_decompose_guard": {
      const boundary = assessStrategistReplanInputBoundary("bad\0decompose");
      const ok =
        hasProductionExport("assessStrategistReplanInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false;
      return probe(id, category, expected, ok, `detail=${boundary.detail}`);
    }
    case "sreplan.min_category_probes": {
      const underflow = {
        ...fixture,
        probes: fixture.probes.filter(p => p.category !== "nogo_path"),
      };
      const ok = validateStrategistReplanBaseline(underflow).valid === false;
      return probe(id, category, expected, ok, `rejectsUnderflow=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: StrategistReplanCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistReplanProbeResult {
  const fsmHarness = fsmHarnessSource();

  switch (id) {
    case "sreplan.recovery_reflecting_replan": {
      const reflectingTargets = VALID_TRANSITIONS.reflecting as readonly string[];
      const ok =
        reflectingTargets.includes("decomposing") &&
        reflectingTargets.includes("visioning");
      return probe(id, category, expected, ok, `reflectingReplanEdges=${ok}`);
    }
    case "sreplan.recovery_fsm_blocked_replan": {
      const ok =
        fsmHarness.includes("fsm.recovery_blocked_to_decomposing") &&
        fsmHarness.includes('sm.transition("decomposing", "replan after block")');
      return probe(id, category, expected, ok, `fsmBlockedReplan=${ok}`);
    }
    case "sreplan.recovery_replan_checkpoint": {
      const orchestrator = orchestratorSource();
      const ok =
        orchestrator.includes("replanCheckpoint") ||
        orchestrator.includes("replanLineage") ||
        (orchestrator.includes("createPoint(\"replan\"") &&
          orchestrator.includes("resumeFromReplan"));
      return probe(id, category, expected, ok, `replanCheckpoint=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: StrategistReplanCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistReplanProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "sreplan.nogo_invalid_replan": {
      const ok =
        orchestrator.includes("validateStrategistReplan(") ||
        orchestrator.includes("invalid replan plan") ||
        orchestrator.includes("replan plan rejected");
      return probe(id, category, expected, ok, `invalidReplanGate=${ok}`);
    }
    case "sreplan.exported_replan_validator": {
      const ok =
        hasProductionExport("validateStrategistReplan") &&
        orchestrator.includes("validateStrategistReplan(");
      return probe(id, category, expected, ok, `replanValidator=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

export interface StrategistReplanProbeMatrixValidationIssue {
  kind: "missing_result" | "criterion_mismatch" | "pass_mismatch" | "gap_misaligned";
  probeId?: string;
  detail: string;
}

export interface StrategistReplanProbeMatrixValidationResult {
  valid: boolean;
  issues: StrategistReplanProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 */
export function validateStrategistReplanProbeMatrix(
  results: StrategistReplanProbeResult[],
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
): StrategistReplanProbeMatrixValidationResult {
  const issues: StrategistReplanProbeMatrixValidationIssue[] = [];
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

export interface StrategistReplanProductionSliceResult {
  atom: "P03-B08-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: StrategistReplanProbeResult[];
  summary: StrategistReplanProbeSummary;
  matrixValidation: StrategistReplanProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: validateStrategistReplan wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runStrategistReplanProductionSlice(
  fixture: StrategistReplanBaseline = loadStrategistReplanBaseline(),
): StrategistReplanProductionSliceResult {
  const contract = getActiveStrategistReplanContract();
  const fixtureValidation = validateStrategistReplanBaseline(fixture);
  const contractValidation = validateStrategistReplanAgainstContract(fixture, contract);
  const results = runStrategistReplanProbes(fixture);
  const summary = summarizeStrategistReplanMatrix(results);
  const matrixValidation = validateStrategistReplanProbeMatrix(results, contract);

  return {
    atom: "P03-B08-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface StrategistReplanBoundarySliceResult {
  atom: "P03-B08-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: StrategistReplanProbeResult[];
  boundaryResults: StrategistReplanProbeResult[];
  matrixValidation: StrategistReplanProbeMatrixValidationResult;
}

/**
 * Validate boundary-category probe matrix — A04 slice gate.
 */
export function validateStrategistReplanBoundaryProbeMatrix(
  results: StrategistReplanProbeResult[],
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
): StrategistReplanProbeMatrixValidationResult {
  const boundaryProbes = listStrategistReplanContractProbesByCategory("boundary", contract);
  const boundaryContract: StrategistReplanContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateStrategistReplanProbeMatrix(boundaryResults, boundaryContract);
}

/**
 * A04 boundary slice: contract-wired boundary probes (decompose input edge cases, probe runner,
 * documented gaps, source block gate refs) with zero unexpected mismatches.
 */
export function runStrategistReplanBoundarySlice(
  fixture: StrategistReplanBaseline = loadStrategistReplanBaseline(),
): StrategistReplanBoundarySliceResult {
  const contract = getActiveStrategistReplanContract();
  const results = runStrategistReplanProbes(fixture);
  const boundaryProbes = listStrategistReplanContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateStrategistReplanBoundaryProbeMatrix(results, contract);

  return {
    atom: "P03-B08-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const STRATEGIST_REPLAN_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly StrategistReplanCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes must align; zero unexpected mismatches required.
 */
export function validateStrategistReplanFailureRecoveryProbeMatrix(
  results: StrategistReplanProbeResult[],
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
): StrategistReplanProbeMatrixValidationResult {
  const failureRecoveryProbes = STRATEGIST_REPLAN_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistReplanContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: StrategistReplanContract = {
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
  return validateStrategistReplanProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listStrategistReplanFailureRecoveryProbeIds(
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
): string[] {
  return STRATEGIST_REPLAN_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listStrategistReplanContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface StrategistReplanFailureRecoverySliceResult {
  atom: "P03-B08-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: StrategistReplanProbeResult[];
  failureRecoveryResults: StrategistReplanProbeResult[];
  matrixValidation: StrategistReplanProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches.
 */
export function runStrategistReplanFailureRecoverySlice(
  fixture: StrategistReplanBaseline = loadStrategistReplanBaseline(),
): StrategistReplanFailureRecoverySliceResult {
  const contract = getActiveStrategistReplanContract();
  const results = runStrategistReplanProbes(fixture);
  const failureRecoveryProbes = STRATEGIST_REPLAN_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistReplanContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateStrategistReplanFailureRecoveryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P03-B08-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

/** Per-probe evidence artifact — disposition, criterion and aligned outcomes (P03-B08-A06). */
export interface StrategistReplanProbeEvidence {
  probeId: string;
  category: StrategistReplanCategory;
  disposition: StrategistReplanProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for replan runs (P03-B08-A06). */
export interface StrategistReplanProbeTelemetry {
  probeId: string;
  category: StrategistReplanCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P03-B08-A06). */
export interface StrategistReplanProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourceBlockGateVersion: string;
  sourceBlockGateAtom: string;
  sliceAtom?: string;
  sliceCategories?: readonly StrategistReplanCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated replan run record bundling evidence, telemetry and provenance. */
export interface StrategistReplanRunRecord {
  provenance: StrategistReplanProvenance;
  evidence: StrategistReplanProbeEvidence[];
  telemetry: StrategistReplanProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<StrategistReplanCategory, number>;
    byDisposition: Record<StrategistReplanProbeDisposition, number>;
  };
}

export interface StrategistReplanRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface StrategistReplanRunValidationResult {
  valid: boolean;
  issues: StrategistReplanRunValidationIssue[];
}

export function buildStrategistReplanProbeEvidence(
  probeId: string,
  category: StrategistReplanCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: StrategistReplanProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): StrategistReplanProbeEvidence {
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

export function buildStrategistReplanProbeTelemetry(
  probeId: string,
  category: StrategistReplanCategory,
  sequenceIndex: number,
  durationMs: number,
): StrategistReplanProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildStrategistReplanProvenance(
  runId: string,
  fixture: StrategistReplanBaseline,
  contract: StrategistReplanContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly StrategistReplanCategory[];
  },
): StrategistReplanProvenance {
  return {
    runId,
    harnessVersion: FORGE_STRATEGIST_REPLAN_VERSION,
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

export function buildStrategistReplanRunRecord(
  provenance: StrategistReplanProvenance,
  evidence: StrategistReplanProbeEvidence[],
  telemetry: StrategistReplanProbeTelemetry[],
): StrategistReplanRunRecord {
  const byCategory = {} as Record<StrategistReplanCategory, number>;
  const byDisposition: Record<StrategistReplanProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of STRATEGIST_REPLAN_CATEGORIES) {
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

function validateStrategistReplanRunRecordAgainstProbeIds(
  record: StrategistReplanRunRecord,
  expectedProbeIds: string[],
  contract: StrategistReplanContract,
): StrategistReplanRunValidationResult {
  const issues: StrategistReplanRunValidationIssue[] = [];
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

export function validateStrategistReplanRunRecord(
  record: StrategistReplanRunRecord,
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
): StrategistReplanRunValidationResult {
  return validateStrategistReplanRunRecordAgainstProbeIds(
    record,
    listStrategistReplanContractProbeIds(contract),
    contract,
  );
}

/** Validate failure/recovery slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateStrategistReplanFailureRecoveryRunRecord(
  record: StrategistReplanRunRecord,
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
): StrategistReplanRunValidationResult {
  const issues: StrategistReplanRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P03-B08-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P03-B08-A06`,
    });
  }

  const expectedCategories = [...STRATEGIST_REPLAN_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateStrategistReplanRunRecordAgainstProbeIds(
    record,
    listStrategistReplanFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

export interface StrategistReplanEvidenceSliceResult {
  atom: "P03-B08-A06";
  evidenceProbeCount: number;
  matrixValid: boolean;
  recordValid: boolean;
  results: StrategistReplanProbeResult[];
  evidenceResults: StrategistReplanProbeResult[];
  matrixValidation: StrategistReplanProbeMatrixValidationResult;
  record: StrategistReplanRunRecord;
  recordValidation: StrategistReplanRunValidationResult;
}

function resolveStrategistReplanGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function runStrategistReplanProbeWithTiming(
  entry: StrategistReplanFixtureEntry,
  fixture: StrategistReplanBaseline,
  contractProbe:
    | { criterion: string; disposition: StrategistReplanProbeDisposition }
    | undefined,
): {
  result: StrategistReplanProbeResult;
  durationMs: number;
  disposition: StrategistReplanProbeDisposition;
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

function buildStrategistReplanRecordFromEntries(
  entries: StrategistReplanFixtureEntry[],
  fixture: StrategistReplanBaseline,
  contract: StrategistReplanContract,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly StrategistReplanCategory[];
  },
): StrategistReplanRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: StrategistReplanProbeEvidence[] = [];
  const telemetry: StrategistReplanProbeTelemetry[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runStrategistReplanProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildStrategistReplanProbeEvidence(
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
      buildStrategistReplanProbeTelemetry(
        result.id,
        result.category,
        sequenceIndex,
        durationMs,
      ),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildStrategistReplanProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveStrategistReplanGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildStrategistReplanRunRecord(provenance, evidence, telemetry);
}

/** Run all replan probes and emit auditable evidence, telemetry and provenance (P03-B08-A06). */
export function runStrategistReplanProbesWithRecord(
  fixture: StrategistReplanBaseline = loadStrategistReplanBaseline(),
): StrategistReplanRunRecord {
  const contract = getActiveStrategistReplanContract();
  return buildStrategistReplanRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P03-B08-A06). */
export function runStrategistReplanFailureRecoverySliceWithRecord(
  fixture: StrategistReplanBaseline = loadStrategistReplanBaseline(),
): StrategistReplanRunRecord {
  const contract = getActiveStrategistReplanContract();
  const failureRecoveryIds = new Set(listStrategistReplanFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildStrategistReplanRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P03-B08-A06",
    sliceCategories: STRATEGIST_REPLAN_FAILURE_RECOVERY_CATEGORIES,
  });
}

/**
 * A06 evidence slice: contract-wired failure_path, recovery_path, and nogo_path probes
 * with auditable evidence, telemetry and provenance — zero unexpected mismatches.
 */
export function runStrategistReplanEvidenceSlice(
  fixture: StrategistReplanBaseline = loadStrategistReplanBaseline(),
): StrategistReplanEvidenceSliceResult {
  const contract = getActiveStrategistReplanContract();
  const results = runStrategistReplanProbes(fixture);
  const failureRecoveryProbes = STRATEGIST_REPLAN_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistReplanContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const evidenceResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateStrategistReplanFailureRecoveryProbeMatrix(
    results,
    contract,
  );
  const record = runStrategistReplanFailureRecoverySliceWithRecord(fixture);
  const recordValidation = validateStrategistReplanFailureRecoveryRunRecord(
    record,
    contract,
  );

  return {
    atom: "P03-B08-A06",
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

function runSingleProbe(
  id: string,
  category: StrategistReplanCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistReplanBaseline,
): StrategistReplanProbeResult {
  switch (category) {
    case "replan_versioning":
      return probeReplanVersioning(id, category, expected, fixture);
    case "block_replan_path":
      return probeBlockReplanPath(id, category, expected);
    case "atom_replan_path":
      return probeAtomReplanPath(id, category, expected);
    case "plan_repair_seam":
      return probePlanRepairSeam(id, category, expected);
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

export function runStrategistReplanProbes(
  fixture: StrategistReplanBaseline = loadStrategistReplanBaseline(),
): StrategistReplanProbeResult[] {
  const contract = getActiveStrategistReplanContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion ? { ...result, criterion: contractProbe.criterion } : result;
  });
}

// ─── Property and fuzz validation (P03-B08-A07) ──────────────────────────────

export interface StrategistReplanPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface StrategistReplanPropertyResult {
  passed: number;
  failed: StrategistReplanPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type StrategistReplanPropertyCheck = {
  id: string;
  description: string;
  check: (contract: StrategistReplanContract) => string | null;
};

const STRATEGIST_REPLAN_STRUCTURAL_PROPERTIES: readonly StrategistReplanPropertyCheck[] = [
  {
    id: "categories_complete",
    description: "All nine strategist replan categories are declared",
    check: contract => {
      for (const category of STRATEGIST_REPLAN_CATEGORIES) {
        if (!contract.categories[category]) return `missing category: ${category}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listStrategistReplanContractProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each category meets contract minProbeCount",
    check: contract => {
      for (const category of STRATEGIST_REPLAN_CATEGORIES) {
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
      "summarizeStrategistReplanCoverage totals match listStrategistReplanContractProbeIds",
    check: contract => {
      const summary = summarizeStrategistReplanCoverage(contract);
      const ids = listStrategistReplanContractProbeIds(contract);
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
    description: "Probe ids are namespaced with sreplan. prefix",
    check: contract => {
      for (const probe of contract.probes) {
        if (!probe.id.startsWith("sreplan.")) {
          return `${probe.id} missing sreplan. prefix`;
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const fixture = loadStrategistReplanBaseline();
      const probeIds = listStrategistReplanContractProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildStrategistReplanProbeEvidence(
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
        return buildStrategistReplanProbeTelemetry(id, probe.category, index, index);
      });
      const record = buildStrategistReplanRunRecord(
        buildStrategistReplanProvenance(
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
      "Synthetic failure/recovery slice record passes validateStrategistReplanFailureRecoveryRunRecord",
    check: contract => {
      const fixture = loadStrategistReplanBaseline();
      const probeIds = listStrategistReplanFailureRecoveryProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildStrategistReplanProbeEvidence(
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
        return buildStrategistReplanProbeTelemetry(id, probe.category, index, index * 0.5);
      });
      const record = buildStrategistReplanRunRecord(
        buildStrategistReplanProvenance(
          "property-check-failure-recovery",
          fixture,
          contract,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:01.000Z",
          probeIds.length,
          {
            sliceAtom: "P03-B08-A06",
            sliceCategories: STRATEGIST_REPLAN_FAILURE_RECOVERY_CATEGORIES,
          },
        ),
        evidence,
        telemetry,
      );
      const validation = validateStrategistReplanFailureRecoveryRunRecord(record, contract);
      if (!validation.valid) {
        return validation.issues.map(i => i.detail).join("; ");
      }
      return null;
    },
  },
] as const;

export function runStrategistReplanPropertyChecks(
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
): StrategistReplanPropertyResult {
  const failed: StrategistReplanPropertyViolation[] = [];
  for (const property of STRATEGIST_REPLAN_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = STRATEGIST_REPLAN_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type StrategistReplanFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface StrategistReplanFuzzMutationCase {
  seed: number;
  kind: StrategistReplanFuzzMutationKind;
  probeId?: string;
  category?: StrategistReplanCategory;
}

export interface StrategistReplanFuzzValidationCaseResult {
  mutation: StrategistReplanFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface StrategistReplanFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: StrategistReplanFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createStrategistReplanFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneStrategistReplanBaseline(
  fixture: StrategistReplanBaseline,
): StrategistReplanBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickStrategistReplanFuzzTarget(
  fixture: StrategistReplanBaseline,
  rng: () => number,
): { category: StrategistReplanCategory; index: number; entry: StrategistReplanFixtureEntry } {
  const category =
    STRATEGIST_REPLAN_CATEGORIES[Math.floor(rng() * STRATEGIST_REPLAN_CATEGORIES.length)]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyStrategistReplanFuzzMutation(
  fixture: StrategistReplanBaseline,
  mutation: StrategistReplanFuzzMutationCase,
): StrategistReplanBaseline {
  const mutated = cloneStrategistReplanBaseline(fixture);
  const targetCategory = mutation.category ?? STRATEGIST_REPLAN_CATEGORIES[0]!;
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
          id: `sreplan.fuzz.extra.${mutation.seed}`,
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
      const other = STRATEGIST_REPLAN_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateStrategistReplanFuzzMutationCases(
  fixture: StrategistReplanBaseline,
  seed: number,
  iterations: number,
): StrategistReplanFuzzMutationCase[] {
  const rng = createStrategistReplanFuzzRng(seed);
  const kinds: StrategistReplanFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: StrategistReplanFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickStrategistReplanFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P03-B08-A07). */
export function runStrategistReplanFuzzValidation(
  fixture: StrategistReplanBaseline,
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
  seed = 42,
  iterations = 24,
): StrategistReplanFuzzValidationResult {
  const cases = generateStrategistReplanFuzzMutationCases(fixture, seed, iterations);
  const results: StrategistReplanFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyStrategistReplanFuzzMutation(fixture, mutation);
    const validation = validateStrategistReplanAgainstContract(mutated, contract);
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

export type StrategistReplanRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface StrategistReplanRunRecordFuzzCase {
  kind: StrategistReplanRunRecordFuzzKind;
  probeId?: string;
}

export function applyStrategistReplanRunRecordFuzzMutation(
  record: StrategistReplanRunRecord,
  mutation: StrategistReplanRunRecordFuzzCase,
): StrategistReplanRunRecord {
  const cloned: StrategistReplanRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P03-B08-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["replan_versioning"],
      };
      break;
  }

  cloned.summary = buildStrategistReplanRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveStrategistReplanRunRecordValidator(
  record: StrategistReplanRunRecord,
): (
  record: StrategistReplanRunRecord,
  contract: StrategistReplanContract,
) => StrategistReplanRunValidationResult {
  return record.provenance.sliceAtom === "P03-B08-A06"
    ? validateStrategistReplanFailureRecoveryRunRecord
    : validateStrategistReplanRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P03-B08-A07). */
export function runStrategistReplanRunRecordFuzzValidation(
  record: StrategistReplanRunRecord,
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveStrategistReplanRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: StrategistReplanRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P03-B08-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyStrategistReplanRunRecordFuzzMutation(record, mutation);
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

export interface StrategistReplanPropertyFuzzSliceResult {
  atom: "P03-B08-A07";
  propertyChecksPassed: boolean;
  contractFuzzRejected: boolean;
  runRecordFuzzRejected: boolean;
  propertyResult: StrategistReplanPropertyResult;
  contractFuzz: StrategistReplanFuzzValidationResult;
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
export function runStrategistReplanPropertyFuzzSlice(
  fixture: StrategistReplanBaseline = loadStrategistReplanBaseline(),
): StrategistReplanPropertyFuzzSliceResult {
  const contract = getActiveStrategistReplanContract();
  const propertyResult = runStrategistReplanPropertyChecks(contract);
  const contractFuzz = runStrategistReplanFuzzValidation(fixture, contract);
  const record = runStrategistReplanFailureRecoverySliceWithRecord(fixture);
  const runRecordFuzz = runStrategistReplanRunRecordFuzzValidation(record, contract);

  return {
    atom: "P03-B08-A07",
    propertyChecksPassed: propertyResult.allPassed,
    contractFuzzRejected: contractFuzz.allMutationsRejected,
    runRecordFuzzRejected: runRecordFuzz.mutationsAccepted === 0,
    propertyResult,
    contractFuzz,
    runRecordFuzz,
  };
}

// ─── Forge regression integration (P03-B08-A08) ─────────────────────────────

export interface StrategistReplanProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare replan run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectStrategistReplanProbeRegression(
  prior: StrategistReplanRunRecord,
  current: StrategistReplanRunRecord,
): StrategistReplanProbeRegressionReport {
  const priorById = new Map(prior.evidence.map(item => [item.probeId, item]));
  const regressions: string[] = [];
  const fixed: string[] = [];
  const newMismatches: string[] = [];

  for (const item of current.evidence) {
    const previous = priorById.get(item.probeId);
    if (!previous) {
      newMismatches.push(item.probeId);
      continue;
    }
    if (previous.aligned && !item.aligned) {
      regressions.push(item.probeId);
    } else if (!previous.aligned && item.aligned) {
      fixed.push(item.probeId);
    } else if (!item.aligned) {
      newMismatches.push(item.probeId);
    }
  }

  const hasRegression =
    regressions.length > 0 || current.summary.mismatches > prior.summary.mismatches;
  const parts: string[] = [];
  if (regressions.length > 0) parts.push(`${regressions.length} probe regression(s)`);
  if (newMismatches.length > 0) parts.push(`${newMismatches.length} new mismatch(es)`);
  if (fixed.length > 0) parts.push(`${fixed.length} fixed`);
  if (parts.length === 0) parts.push("no alignment regression");

  return {
    hasRegression,
    regressions,
    fixed,
    newMismatches,
    summary: parts.join("; "),
  };
}

/** Alias matching ACTIVE_FRONT target name. */
export const runStrategistReplanProbeRegression = detectStrategistReplanProbeRegression;

export interface StrategistReplanProbeRegressionValidation {
  valid: boolean;
  report: StrategistReplanProbeRegressionReport;
}

/** Validate probe alignment between prior and current replan run records. */
export function validateStrategistReplanProbeRegression(
  prior: StrategistReplanRunRecord,
  current: StrategistReplanRunRecord,
): StrategistReplanProbeRegressionValidation {
  const report = detectStrategistReplanProbeRegression(prior, current);
  return { valid: !report.hasRegression, report };
}

export interface StrategistReplanForgeRegressionResult {
  atom: "P03-B08-A08";
  passed: boolean;
  productionSlice: StrategistReplanProductionSliceResult;
  propertyFuzzSlice: StrategistReplanPropertyFuzzSliceResult;
  record: StrategistReplanRunRecord;
  recordValid: boolean;
  priorRecordValid: boolean;
  validationIssues: string[];
  priorValidationIssues: string[];
  probeRegression: StrategistReplanProbeRegressionReport | null;
  detail: string;
}

/**
 * Execute replan probes, validate production slice + run record, property/fuzz gates,
 * and optionally detect regression vs prior run. Forge pipeline integration gate (P03-B08-A08).
 */
export function runStrategistReplanForgeRegression(
  priorRecord?: StrategistReplanRunRecord,
): StrategistReplanForgeRegressionResult {
  const fixture = loadStrategistReplanBaseline();
  const contract = getActiveStrategistReplanContract();
  const productionSlice = runStrategistReplanProductionSlice(fixture);
  const propertyFuzzSlice = runStrategistReplanPropertyFuzzSlice(fixture);
  const record = runStrategistReplanProbesWithRecord(fixture);
  const validation = validateStrategistReplanRunRecord(record, contract);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  let priorRecordValid = true;
  let priorValidationIssues: string[] = [];
  if (priorRecord) {
    const priorValidation = validateStrategistReplanRunRecord(priorRecord, contract);
    priorRecordValid = priorValidation.valid && priorRecord.summary.mismatches === 0;
    priorValidationIssues = priorValidation.issues.map(issue => issue.detail);
  }

  const probeRegression = priorRecord
    ? detectStrategistReplanProbeRegression(priorRecord, record)
    : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;

  const productionSliceOk =
    productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0;
  const propertyFuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;

  const passed =
    productionSliceOk && recordValid && priorRecordValid && !alignmentRegression && propertyFuzzOk;

  const detailParts: string[] = [];
  detailParts.push(`${record.summary.aligned}/${record.summary.total} probes aligned`);
  detailParts.push(
    `productionSlice: unexpected=${productionSlice.matrixValidation.unexpectedMismatches}`,
  );
  if (!recordValid) {
    detailParts.push(`validation: ${validationIssues.join("; ") || "mismatches present"}`);
  }
  if (!priorRecordValid) {
    detailParts.push(
      `priorValidation: ${priorValidationIssues.join("; ") || "tampered prior record"}`,
    );
  }
  if (probeRegression) detailParts.push(`regression: ${probeRegression.summary}`);
  detailParts.push(
    `propertyFuzz: properties=${propertyFuzzSlice.propertyResult.passed}/${propertyFuzzSlice.propertyResult.total} contractFuzz rejected=${propertyFuzzSlice.contractFuzz.rejected}/${propertyFuzzSlice.contractFuzz.iterations} runFuzz rejected=${propertyFuzzSlice.runRecordFuzz.mutationsRejected}`,
  );

  return {
    atom: "P03-B08-A08",
    passed,
    productionSlice,
    propertyFuzzSlice,
    record,
    recordValid,
    priorRecordValid,
    validationIssues,
    priorValidationIssues,
    probeRegression,
    detail: detailParts.join(" | "),
  };
}

// ─── Guard controls (P03-B08-A09) ─────────────────────────────────────────────

export interface ForgeStrategistReplanGuardControls {
  atom: string;
  adversarial: {
    rejectTamperedRecords: true;
    rejectFalseAlignment: true;
    rejectSummaryEvidenceMismatch: true;
  };
  performance: {
    maxSuiteDurationMs: number;
    maxProbeDurationMs: number;
    maxWallClockMs: number;
  };
  cost: {
    maxTotalCostUsd: number;
    maxLlmCalls: number;
  };
  safety: {
    maxDetailLength: number;
    forbiddenPatterns: readonly RegExp[];
  };
}

export interface StrategistReplanGuardCheckIssue {
  domain: "adversarial" | "performance" | "cost" | "safety";
  code: string;
  detail: string;
}

export interface StrategistReplanGuardCheckResult {
  passed: boolean;
  issues: StrategistReplanGuardCheckIssue[];
  metrics: {
    suiteDurationMs: number;
    wallClockMs: number;
    maxProbeDurationMs: number;
    totalCostUsd: number;
    llmCalls: number;
    adversarialScenariosRejected: number;
    adversarialScenariosTotal: number;
  };
}

export interface StrategistReplanAdversarialGuardScenario {
  id: string;
  description: string;
  build: (record: StrategistReplanRunRecord) => StrategistReplanRunRecord;
  expectRejected: true;
}

export const FORGE_STRATEGIST_REPLAN_GUARD_CONTROLS_V1: ForgeStrategistReplanGuardControls = {
  atom: "P03-B08-A09",
  adversarial: {
    rejectTamperedRecords: true,
    rejectFalseAlignment: true,
    rejectSummaryEvidenceMismatch: true,
  },
  performance: {
    maxSuiteDurationMs: 30_000,
    maxProbeDurationMs: 5_000,
    maxWallClockMs: 45_000,
  },
  cost: {
    maxTotalCostUsd: 0,
    maxLlmCalls: 0,
  },
  safety: {
    maxDetailLength: 4096,
    forbiddenPatterns: [
      /sk-[a-zA-Z0-9]{20,}/,
      /api[_-]?key\s*[:=]\s*\S+/i,
      /Bearer\s+[a-zA-Z0-9._-]{20,}/i,
      /password\s*[:=]\s*\S+/i,
      /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
    ],
  },
};

export function getForgeStrategistReplanGuardControls(): ForgeStrategistReplanGuardControls {
  return FORGE_STRATEGIST_REPLAN_GUARD_CONTROLS_V1;
}

function parseStrategistReplanIsoDurationMs(startedAt: string, completedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function summarizeStrategistReplanTelemetry(
  telemetry: StrategistReplanProbeTelemetry[],
): {
  suiteDurationMs: number;
  maxProbeDurationMs: number;
} {
  let suiteDurationMs = 0;
  let maxProbeDurationMs = 0;
  for (const item of telemetry) {
    suiteDurationMs += item.durationMs;
    if (item.durationMs > maxProbeDurationMs) maxProbeDurationMs = item.durationMs;
  }
  return { suiteDurationMs, maxProbeDurationMs };
}

export function detectStrategistReplanEvidenceSummaryMismatch(
  record: StrategistReplanRunRecord,
): string | null {
  let alignedCount = 0;
  for (const item of record.evidence) {
    if (item.aligned) alignedCount++;
  }
  const mismatches = record.evidence.length - alignedCount;
  if (record.summary.aligned !== alignedCount) {
    return `summary.aligned=${record.summary.aligned} evidence=${alignedCount}`;
  }
  if (record.summary.mismatches !== mismatches) {
    return `summary.mismatches=${record.summary.mismatches} evidence=${mismatches}`;
  }
  if (record.summary.total !== record.evidence.length) {
    return `summary.total=${record.summary.total} evidence=${record.evidence.length}`;
  }
  return null;
}

export function detectStrategistReplanFalseAlignment(record: StrategistReplanRunRecord): string[] {
  const violations: string[] = [];
  for (const item of record.evidence) {
    const shouldAlign = item.actual === item.expected;
    if (item.aligned !== shouldAlign) {
      violations.push(
        `${item.probeId}: aligned=${item.aligned} actual=${item.actual} expected=${item.expected}`,
      );
    }
    if (item.aligned && item.actual !== item.expected) {
      violations.push(`${item.probeId}: false PASS claim`);
    }
  }
  return violations;
}

export function validateStrategistReplanSafety(
  record: StrategistReplanRunRecord,
  controls: ForgeStrategistReplanGuardControls = getForgeStrategistReplanGuardControls(),
): StrategistReplanGuardCheckIssue[] {
  const issues: StrategistReplanGuardCheckIssue[] = [];
  for (const item of record.evidence) {
    if (item.detail.length > controls.safety.maxDetailLength) {
      issues.push({
        domain: "safety",
        code: "detail_too_long",
        detail: `${item.probeId} detail length=${item.detail.length}`,
      });
    }
    for (const pattern of controls.safety.forbiddenPatterns) {
      if (pattern.test(item.detail) || pattern.test(item.criterion)) {
        issues.push({
          domain: "safety",
          code: "forbidden_pattern",
          detail: `${item.probeId} matched ${pattern.source}`,
        });
      }
    }
  }
  return issues;
}

export function validateStrategistReplanPerformance(
  record: StrategistReplanRunRecord,
  controls: ForgeStrategistReplanGuardControls = getForgeStrategistReplanGuardControls(),
): StrategistReplanGuardCheckIssue[] {
  const issues: StrategistReplanGuardCheckIssue[] = [];
  const { suiteDurationMs, maxProbeDurationMs } = summarizeStrategistReplanTelemetry(
    record.telemetry,
  );
  const wallClockMs = parseStrategistReplanIsoDurationMs(
    record.provenance.startedAt,
    record.provenance.completedAt,
  );

  if (suiteDurationMs > controls.performance.maxSuiteDurationMs) {
    issues.push({
      domain: "performance",
      code: "suite_duration_exceeded",
      detail: `${suiteDurationMs}ms > ${controls.performance.maxSuiteDurationMs}ms`,
    });
  }
  if (maxProbeDurationMs > controls.performance.maxProbeDurationMs) {
    issues.push({
      domain: "performance",
      code: "probe_duration_exceeded",
      detail: `${maxProbeDurationMs}ms > ${controls.performance.maxProbeDurationMs}ms`,
    });
  }
  if (wallClockMs > controls.performance.maxWallClockMs) {
    issues.push({
      domain: "performance",
      code: "wall_clock_exceeded",
      detail: `${wallClockMs}ms > ${controls.performance.maxWallClockMs}ms`,
    });
  }
  return issues;
}

export function validateStrategistReplanCost(
  totalCostUsd: number,
  llmCalls: number,
  controls: ForgeStrategistReplanGuardControls = getForgeStrategistReplanGuardControls(),
): StrategistReplanGuardCheckIssue[] {
  const issues: StrategistReplanGuardCheckIssue[] = [];
  if (totalCostUsd > controls.cost.maxTotalCostUsd) {
    issues.push({
      domain: "cost",
      code: "cost_exceeded",
      detail: `$${totalCostUsd.toFixed(4)} > $${controls.cost.maxTotalCostUsd}`,
    });
  }
  if (llmCalls > controls.cost.maxLlmCalls) {
    issues.push({
      domain: "cost",
      code: "llm_calls_exceeded",
      detail: `${llmCalls} > ${controls.cost.maxLlmCalls}`,
    });
  }
  return issues;
}

export function buildStrategistReplanAdversarialGuardScenarios(): StrategistReplanAdversarialGuardScenario[] {
  return [
    {
      id: "adversarial.false_alignment_claim",
      description: "Evidence claims aligned while actual !== expected",
      expectRejected: true,
      build: record => {
        const cloned = structuredClone(record);
        const target = cloned.evidence[0];
        if (!target) return cloned;
        target.aligned = true;
        target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
        return cloned;
      },
    },
    {
      id: "adversarial.summary_mismatch",
      description: "Summary reports zero mismatches while evidence is tampered",
      expectRejected: true,
      build: record => {
        const cloned = structuredClone(record);
        const target = cloned.evidence[0];
        if (!target) return cloned;
        target.aligned = false;
        target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
        cloned.summary = { ...cloned.summary, aligned: cloned.summary.total, mismatches: 0 };
        return cloned;
      },
    },
    {
      id: "adversarial.dropped_probe",
      description: "Run record omits required probe evidence",
      expectRejected: true,
      build: record => {
        const cloned = structuredClone(record);
        cloned.evidence = cloned.evidence.slice(1);
        cloned.telemetry = cloned.telemetry.slice(1);
        cloned.summary = {
          ...cloned.summary,
          total: cloned.evidence.length,
          aligned: cloned.evidence.filter(item => item.aligned).length,
          mismatches: cloned.evidence.filter(item => !item.aligned).length,
        };
        return cloned;
      },
    },
  ];
}

export function runStrategistReplanAdversarialGuardChecks(
  fixtureRecord: StrategistReplanRunRecord,
  contract: StrategistReplanContract = getActiveStrategistReplanContract(),
): { rejected: number; total: number; failures: string[] } {
  const scenarios = buildStrategistReplanAdversarialGuardScenarios();
  const failures: string[] = [];
  let rejected = 0;

  for (const scenario of scenarios) {
    const tampered = scenario.build(fixtureRecord);
    const validation = validateStrategistReplanRunRecord(tampered, contract);
    const falseAlignment = detectStrategistReplanFalseAlignment(tampered);
    const summaryMismatch = detectStrategistReplanEvidenceSummaryMismatch(tampered);
    const rejectedByGuard =
      !validation.valid || falseAlignment.length > 0 || summaryMismatch !== null;

    if (rejectedByGuard) rejected++;
    else failures.push(`${scenario.id}: tampered record was not rejected`);
  }

  return { rejected, total: scenarios.length, failures };
}

export function validateForgeStrategistReplanGuard(
  record: StrategistReplanRunRecord,
  options: {
    totalCostUsd?: number;
    llmCalls?: number;
    contract?: StrategistReplanContract;
    controls?: ForgeStrategistReplanGuardControls;
  } = {},
): StrategistReplanGuardCheckResult {
  const controls = options.controls ?? getForgeStrategistReplanGuardControls();
  const contract = options.contract ?? getActiveStrategistReplanContract();
  const totalCostUsd = options.totalCostUsd ?? 0;
  const llmCalls = options.llmCalls ?? 0;
  const issues: StrategistReplanGuardCheckIssue[] = [];

  issues.push(...validateStrategistReplanPerformance(record, controls));
  issues.push(...validateStrategistReplanCost(totalCostUsd, llmCalls, controls));
  issues.push(...validateStrategistReplanSafety(record, controls));

  const falseAlignment = detectStrategistReplanFalseAlignment(record);
  if (falseAlignment.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "false_alignment",
      detail: falseAlignment.join("; "),
    });
  }
  const summaryMismatch = detectStrategistReplanEvidenceSummaryMismatch(record);
  if (summaryMismatch) {
    issues.push({
      domain: "adversarial",
      code: "summary_evidence_mismatch",
      detail: summaryMismatch,
    });
  }

  const adversarial = runStrategistReplanAdversarialGuardChecks(record, contract);
  if (adversarial.failures.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "scenario_not_rejected",
      detail: adversarial.failures.join("; "),
    });
  }

  const telemetrySummary = summarizeStrategistReplanTelemetry(record.telemetry);
  const wallClockMs = parseStrategistReplanIsoDurationMs(
    record.provenance.startedAt,
    record.provenance.completedAt,
  );

  return {
    passed: issues.length === 0 && adversarial.rejected === adversarial.total,
    issues,
    metrics: {
      suiteDurationMs: telemetrySummary.suiteDurationMs,
      wallClockMs,
      maxProbeDurationMs: telemetrySummary.maxProbeDurationMs,
      totalCostUsd,
      llmCalls,
      adversarialScenariosRejected: adversarial.rejected,
      adversarialScenariosTotal: adversarial.total,
    },
  };
}

export interface ForgeStrategistReplanRegressionGateResult extends StrategistReplanForgeRegressionResult {
  guard: StrategistReplanGuardCheckResult;
}

/**
 * Replan regression gate with guard controls (P03-B08-A08 + A09 integration).
 */
export function runForgeStrategistReplanRegressionGate(
  priorRecord?: StrategistReplanRunRecord,
): ForgeStrategistReplanRegressionGateResult {
  const contract = getActiveStrategistReplanContract();
  const regression = runStrategistReplanForgeRegression(priorRecord);
  const guard = validateForgeStrategistReplanGuard(regression.record, {
    totalCostUsd: 0,
    llmCalls: 0,
    contract,
  });

  const passed = regression.passed && guard.passed;
  const detailParts = [regression.detail];
  if (!guard.passed) {
    detailParts.push(
      `guard: ${guard.issues.map(issue => `${issue.domain}/${issue.code}`).join(", ") || "failed"}`,
    );
  } else {
    detailParts.push(
      `guard: perf=${guard.metrics.suiteDurationMs.toFixed(1)}ms cost=$${guard.metrics.totalCostUsd} adversarial=${guard.metrics.adversarialScenariosRejected}/${guard.metrics.adversarialScenariosTotal}`,
    );
  }

  return {
    ...regression,
    passed,
    guard,
    detail: detailParts.join(" | "),
  };
}
