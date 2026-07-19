/**
 * FOREMAN — Strategist Replan & Plan Repair Baseline (P03-B08)
 *
 * A01 slice: load, validate, run probes against sealed P03-B07 parallel
 * wave block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length === 0) {
    issues.push({
      kind: "missing_category",
      detail: "fixture must document at least one measurable FAIL replan gap",
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
      const ok = failCount === expectedFail && failCount >= 1;
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
