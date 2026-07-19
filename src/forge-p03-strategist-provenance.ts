/**
 * FOREMAN — Strategist Plan Provenance & Drift Baseline (P03-B09)
 *
 * A01 slice: load, validate, run probes against sealed P03-B08 replan
 * block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import strategistProvenanceBaseline from "./fixtures/forge-strategist-provenance-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP03B08ToB09Handoff,
  summarizeStrategistReplanCoverage,
  getActiveStrategistReplanContract,
  FORGE_STRATEGIST_REPLAN_VERSION,
  buildStrategistReplanProvenance,
} from "./forge-p03-strategist-replan.js";
import { VALID_TRANSITIONS } from "./types.js";
import { parseDecomposeResponse } from "./parser.js";

export const FORGE_STRATEGIST_PROVENANCE_VERSION = "1.0.0";

export const EXPECTED_P03_B08_SEALED_ATOM_COUNT = 10;

export const STRATEGIST_PROVENANCE_DECOMPOSE_MAX_LENGTH = 64000;

export const STRATEGIST_PROVENANCE_CATEGORIES = [
  "provenance_versioning",
  "plan_lineage",
  "drift_detection",
  "provenance_seam",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type StrategistProvenanceCategory = (typeof STRATEGIST_PROVENANCE_CATEGORIES)[number];

export const STRATEGIST_PROVENANCE_A01_MIN_PROBES: Readonly<
  Record<StrategistProvenanceCategory, number>
> = {
  provenance_versioning: 3,
  plan_lineage: 3,
  drift_detection: 4,
  provenance_seam: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 3,
  recovery_path: 2,
  nogo_path: 2,
};

export const STRATEGIST_PROVENANCE_A01_DOCUMENTED_FAIL_COUNT = 6;

export type StrategistProvenanceInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface StrategistProvenanceInputBoundary {
  disposition: StrategistProvenanceInputDisposition;
  acceptable: boolean;
  normalizedDecompose: string;
  truncated: boolean;
  detail: string;
}

export function assessStrategistProvenanceInputBoundary(
  decomposeOutput: string,
): StrategistProvenanceInputBoundary {
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
    const disposition: StrategistProvenanceInputDisposition =
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
  if (normalizedDecompose.length > STRATEGIST_PROVENANCE_DECOMPOSE_MAX_LENGTH) {
    normalizedDecompose = normalizedDecompose.slice(0, STRATEGIST_PROVENANCE_DECOMPOSE_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedDecompose,
    truncated,
    detail: truncated
      ? `decompose truncated to ${STRATEGIST_PROVENANCE_DECOMPOSE_MAX_LENGTH} characters`
      : "valid decompose output",
  };
}

export interface StrategistProvenanceFixtureEntry {
  id: string;
  category: StrategistProvenanceCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface StrategistProvenanceBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    replanProbeCount: number;
    sealedAtomCount: number;
  };
  probes: StrategistProvenanceFixtureEntry[];
}

export interface StrategistProvenanceProbeResult {
  id: string;
  category: StrategistProvenanceCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface StrategistProvenanceProbeSummary {
  total: number;
  aligned: number;
  mismatches: StrategistProvenanceProbeResult[];
  knownGaps: StrategistProvenanceProbeResult[];
  byCategory: Record<
    StrategistProvenanceCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface StrategistProvenanceValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: StrategistProvenanceCategory;
  detail: string;
}

export interface StrategistProvenanceValidationResult {
  valid: boolean;
  issues: StrategistProvenanceValidationIssue[];
}

export type StrategistProvenanceProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface StrategistProvenanceProbeContract {
  id: string;
  category: StrategistProvenanceCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: StrategistProvenanceProbeDisposition;
  criterion: string;
}

export interface StrategistProvenanceCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface StrategistProvenanceCategoryContract {
  category: StrategistProvenanceCategory;
  acceptance: StrategistProvenanceCategoryAcceptance;
  probes: readonly StrategistProvenanceProbeContract[];
}

export interface StrategistProvenanceContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<StrategistProvenanceCategory, StrategistProvenanceCategoryContract>;
  probes: readonly StrategistProvenanceProbeContract[];
}

export interface StrategistProvenanceCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: StrategistProvenanceCategory;
  detail: string;
}

export interface StrategistProvenanceCoverageResult {
  valid: boolean;
  issues: StrategistProvenanceCoverageIssue[];
}

function provenanceDisposition(
  category: StrategistProvenanceCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistProvenanceProbeDisposition {
  if (category === "failure_path") return "failure";
  if (category === "recovery_path") return "recovery";
  if (category === "nogo_path") return "nogo";
  if (expected === "FAIL") return "gap";
  return "observed";
}

function provenanceProbeContract(
  entry: StrategistProvenanceFixtureEntry,
): StrategistProvenanceProbeContract {
  return {
    ...entry,
    disposition: provenanceDisposition(entry.category, entry.expected),
    criterion: entry.description,
  };
}

function buildProvenanceCategoryContract(
  category: StrategistProvenanceCategory,
  invariant: string,
  requireFullAlignment: boolean,
  entries: StrategistProvenanceFixtureEntry[],
): StrategistProvenanceCategoryContract {
  const probes = entries.map(provenanceProbeContract);
  return {
    category,
    acceptance: {
      invariant,
      minProbeCount: STRATEGIST_PROVENANCE_A01_MIN_PROBES[category],
      requireFullAlignment,
    },
    probes,
  };
}

const PROVENANCE_FIXTURE_ENTRIES =
  strategistProvenanceBaseline.probes as StrategistProvenanceFixtureEntry[];

const STRATEGIST_PROVENANCE_CATEGORY_CONTRACTS: Record<
  StrategistProvenanceCategory,
  StrategistProvenanceCategoryContract
> = {
  provenance_versioning: buildProvenanceCategoryContract(
    "provenance_versioning",
    "Strategist plan provenance baseline declares semver version, atom id and exported harness version.",
    true,
    PROVENANCE_FIXTURE_ENTRIES.filter(p => p.category === "provenance_versioning"),
  ),
  plan_lineage: buildProvenanceCategoryContract(
    "plan_lineage",
    "Plan lineage tracks state history audit, replan lineage and thought chain lineage for auditable execution.",
    true,
    PROVENANCE_FIXTURE_ENTRIES.filter(p => p.category === "plan_lineage"),
  ),
  drift_detection: buildProvenanceCategoryContract(
    "drift_detection",
    "Drift detection wires reflect phase, alignment prompts and strategist plan provenance sections.",
    false,
    PROVENANCE_FIXTURE_ENTRIES.filter(p => p.category === "drift_detection"),
  ),
  provenance_seam: buildProvenanceCategoryContract(
    "provenance_seam",
    "Provenance seam connects replan builder, decompose parser fields and plan provenance graph.",
    false,
    PROVENANCE_FIXTURE_ENTRIES.filter(p => p.category === "provenance_seam"),
  ),
  baseline_link: buildProvenanceCategoryContract(
    "baseline_link",
    "Provenance baseline links to sealed P03-B08 replan block gate and B09 handoff artifacts.",
    true,
    PROVENANCE_FIXTURE_ENTRIES.filter(p => p.category === "baseline_link"),
  ),
  boundary: buildProvenanceCategoryContract(
    "boundary",
    "Provenance boundary assessment, probe runner export and documented gaps wired to baseline matrix.",
    true,
    PROVENANCE_FIXTURE_ENTRIES.filter(p => p.category === "boundary"),
  ),
  failure_path: buildProvenanceCategoryContract(
    "failure_path",
    "Baseline validation rejects invalid versions, malformed input and underflow categories.",
    true,
    PROVENANCE_FIXTURE_ENTRIES.filter(p => p.category === "failure_path"),
  ),
  recovery_path: buildProvenanceCategoryContract(
    "recovery_path",
    "Recovery paths exercise reflecting drift edges and replan lineage checkpoint preservation.",
    true,
    PROVENANCE_FIXTURE_ENTRIES.filter(p => p.category === "recovery_path"),
  ),
  nogo_path: buildProvenanceCategoryContract(
    "nogo_path",
    "NO-GO gates reject undetected plan drift and require exported validatePlanDrift validator.",
    false,
    PROVENANCE_FIXTURE_ENTRIES.filter(p => p.category === "nogo_path"),
  ),
};

export const FORGE_STRATEGIST_PROVENANCE_CONTRACT_V1: StrategistProvenanceContract = {
  version: "1.0.0",
  atom: "P03-B09-A06",
  purpose:
    "Typed strategist plan provenance and drift contract with measurable probes aligned to P03-B08 sealed handoff.",
  categories: STRATEGIST_PROVENANCE_CATEGORY_CONTRACTS,
  probes: STRATEGIST_PROVENANCE_CATEGORIES.flatMap(
    category => STRATEGIST_PROVENANCE_CATEGORY_CONTRACTS[category].probes,
  ),
};

export function getActiveStrategistProvenanceContract(): StrategistProvenanceContract {
  return FORGE_STRATEGIST_PROVENANCE_CONTRACT_V1;
}

export function summarizeStrategistProvenanceCoverage(
  contract: StrategistProvenanceContract = getActiveStrategistProvenanceContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<StrategistProvenanceCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<StrategistProvenanceProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    StrategistProvenanceCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<StrategistProvenanceProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };

  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of STRATEGIST_PROVENANCE_CATEGORIES) {
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

export function validateStrategistProvenanceAgainstContract(
  fixture: StrategistProvenanceBaseline,
  contract: StrategistProvenanceContract = getActiveStrategistProvenanceContract(),
): StrategistProvenanceValidationResult {
  const issues: StrategistProvenanceValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  for (const category of STRATEGIST_PROVENANCE_CATEGORIES) {
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

export function getStrategistProvenanceCategoryContract(
  category: StrategistProvenanceCategory,
  contract: StrategistProvenanceContract = getActiveStrategistProvenanceContract(),
): StrategistProvenanceCategoryContract {
  return contract.categories[category];
}

export function listStrategistProvenanceContractProbeIds(
  contract: StrategistProvenanceContract = getActiveStrategistProvenanceContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listStrategistProvenanceProbesByDisposition(
  disposition: StrategistProvenanceProbeDisposition,
  contract: StrategistProvenanceContract = getActiveStrategistProvenanceContract(),
): StrategistProvenanceProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listStrategistProvenanceContractProbesByCategory(
  category: StrategistProvenanceCategory,
  contract: StrategistProvenanceContract = getActiveStrategistProvenanceContract(),
): StrategistProvenanceProbeContract[] {
  return contract.categories[category].probes;
}

export function validateStrategistProvenanceCoverage(
  contract: StrategistProvenanceContract = getActiveStrategistProvenanceContract(),
): StrategistProvenanceCoverageResult {
  const issues: StrategistProvenanceCoverageIssue[] = [];

  for (const category of STRATEGIST_PROVENANCE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < STRATEGIST_PROVENANCE_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${STRATEGIST_PROVENANCE_A01_MIN_PROBES[category]}`,
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

  const ids = listStrategistProvenanceContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeStrategistProvenanceCoverage(contract);
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
    if (!probeEntry.id.startsWith("sprov.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probeEntry.id,
        detail: `${probeEntry.id} missing sprov. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export const FORGE_STRATEGIST_PROVENANCE_A01_PROBE_MATRIX: readonly StrategistProvenanceFixtureEntry[] =
  strategistProvenanceBaseline.probes as StrategistProvenanceFixtureEntry[];

export function loadStrategistProvenanceBaseline(): StrategistProvenanceBaseline {
  return strategistProvenanceBaseline as StrategistProvenanceBaseline;
}

export function validateStrategistProvenanceBaseline(
  fixture: StrategistProvenanceBaseline,
): StrategistProvenanceValidationResult {
  const issues: StrategistProvenanceValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P03-B09-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    STRATEGIST_PROVENANCE_CATEGORIES.map(category => [category, 0]),
  ) as Record<StrategistProvenanceCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of STRATEGIST_PROVENANCE_CATEGORIES) {
    const min = STRATEGIST_PROVENANCE_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_STRATEGIST_PROVENANCE_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_STRATEGIST_PROVENANCE_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_STRATEGIST_PROVENANCE_A01_PROBE_MATRIX) {
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

  const handoff = getForgeP03B08ToB09Handoff();
  const replanCoverage = summarizeStrategistReplanCoverage(getActiveStrategistReplanContract());

  if (fixture.sourceBlockGate.atom !== "P03-B08-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P03-B08-A10`,
    });
  }
  if (fixture.sourceBlockGate.contractVersion !== FORGE_STRATEGIST_REPLAN_VERSION) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.contractVersion=${fixture.sourceBlockGate.contractVersion} ` +
        `expected=${FORGE_STRATEGIST_REPLAN_VERSION}`,
    });
  }
  if (fixture.sourceBlockGate.replanProbeCount !== replanCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.replanProbeCount=${fixture.sourceBlockGate.replanProbeCount} ` +
        `contract=${replanCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P03_B08_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P03_B08_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P03-B09-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `B08 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P03-B09-A01`,
    });
  }

  const expectedFailCount = getActiveStrategistProvenanceContract().probes.filter(
    p => p.expected === "FAIL",
  ).length;
  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_probe",
      detail: `fixture FAIL count=${failGaps.length} contract=${expectedFailCount}`,
    });
  }

  const contractAlignment = validateStrategistProvenanceAgainstContract(fixture);
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeStrategistProvenanceMatrix(
  results: StrategistProvenanceProbeResult[],
): StrategistProvenanceProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as StrategistProvenanceProbeSummary["byCategory"];
  for (const category of STRATEGIST_PROVENANCE_CATEGORIES) {
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

export function listStrategistProvenanceProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistProvenanceBaseline = loadStrategistProvenanceBaseline(),
): StrategistProvenanceFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listStrategistProvenanceKnownGaps(
  results: StrategistProvenanceProbeResult[],
): StrategistProvenanceProbeResult[] {
  return summarizeStrategistProvenanceMatrix(results).knownGaps;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = __dirname;

function readSrc(relativePath: string): string {
  return readFileSync(join(SRC_ROOT, relativePath), "utf8");
}

function readSrcOptional(relativePath: string): string {
  try {
    return readSrc(relativePath);
  } catch {
    return "";
  }
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: StrategistProvenanceCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): StrategistProvenanceProbeResult {
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

function stateSource(): string {
  return readSrc("state.ts");
}

function productionProvenanceSource(): string {
  return readSrc("forge-p03-strategist-provenance.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionProvenanceSource());
}

const SAMPLE_BLOCK_DECOMPOSE = `REASONING: Plan provenance baseline
OUTPUT:
Block 1: Wire plan lineage types
Block 2: Add drift detection seam
Block 3: Seal provenance baseline tests
DEPENDENCIES: 2→1, 3→1,2
REPLAN PLAN: preserve lineage on block failure
PLAN PROVENANCE: vision→blocks lineage preserved for audit
CONFIDENCE: 0.85`;

/** Default drift score threshold for undetected plan drift rejection (P03-B09-A03). */
export const PLAN_DRIFT_THRESHOLD = 0.65;

export interface PlanDriftValidationOutcome {
  valid: boolean;
  driftDetected: boolean;
  driftScore: number;
  driftThreshold: number;
  blockCount: number;
  hasPlanProvenance: boolean;
  issues: string[];
}

function tokenizeForDrift(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(token => token.length >= 4);
  return new Set(tokens);
}

function intersectionCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count++;
  }
  return count;
}

/**
 * Validate strategist decompose output for plan drift against vision lineage (P03-B09-A03).
 */
export function validatePlanDrift(
  decomposeOutput: string,
  visionOutput?: string,
): PlanDriftValidationOutcome {
  const boundary = assessStrategistProvenanceInputBoundary(decomposeOutput);
  if (!boundary.acceptable) {
    return {
      valid: false,
      driftDetected: false,
      driftScore: 0,
      driftThreshold: PLAN_DRIFT_THRESHOLD,
      blockCount: 0,
      hasPlanProvenance: false,
      issues: [boundary.detail],
    };
  }

  const parsed = parseDecomposeResponse(boundary.normalizedDecompose);
  if (!parsed.ok) {
    return {
      valid: false,
      driftDetected: false,
      driftScore: 0,
      driftThreshold: PLAN_DRIFT_THRESHOLD,
      blockCount: 0,
      hasPlanProvenance: false,
      issues: parsed.error.missing,
    };
  }

  const blockCount = parsed.data.blocks.length;
  const planProvenance = parsed.data.planProvenance;
  const hasPlanProvenance = planProvenance !== undefined && planProvenance.trim().length > 0;
  const issues: string[] = [];
  let driftScore = 0;

  if (!hasPlanProvenance) {
    driftScore += 0.35;
    issues.push("missing_plan_provenance");
  }

  if (visionOutput && blockCount > 0) {
    const visionTokens = tokenizeForDrift(visionOutput);
    const blockTokens = tokenizeForDrift(parsed.data.blocks.join(" "));
    const blockOverlap = intersectionCount(visionTokens, blockTokens);
    if (visionTokens.size >= 3 && blockOverlap < 2) {
      driftScore += 0.35;
      issues.push("vision_block_token_mismatch");
    }
  }

  if (visionOutput && hasPlanProvenance) {
    const visionTokens = tokenizeForDrift(visionOutput);
    const provenanceTokens = tokenizeForDrift(planProvenance!);
    const overlap = intersectionCount(visionTokens, provenanceTokens);
    if (visionTokens.size >= 3 && overlap < 2) {
      driftScore += 0.4;
      issues.push("vision_provenance_token_mismatch");
    }
  }

  if (blockCount === 0) {
    driftScore += 0.5;
    issues.push("missing_blocks");
  }

  const driftDetected = driftScore >= PLAN_DRIFT_THRESHOLD;

  return {
    valid: !driftDetected,
    driftDetected,
    driftScore,
    driftThreshold: PLAN_DRIFT_THRESHOLD,
    blockCount,
    hasPlanProvenance,
    issues,
  };
}

/**
 * NO-GO gate helper — reject run when plan drift exceeds driftThreshold undetected.
 */
export function rejectUndetectedPlanDrift(outcome: PlanDriftValidationOutcome): boolean {
  return outcome.driftDetected;
}

function probeProvenanceVersioning(
  id: string,
  category: StrategistProvenanceCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistProvenanceBaseline,
): StrategistProvenanceProbeResult {
  switch (id) {
    case "sprov.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "sprov.atom_tagged": {
      const ok = fixture.atom === "P03-B09-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "sprov.harness_version_exported": {
      const ok = FORGE_STRATEGIST_PROVENANCE_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_STRATEGIST_PROVENANCE_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown provenance_versioning probe");
  }
}

function probePlanLineage(
  id: string,
  category: StrategistProvenanceCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistProvenanceProbeResult {
  const orchestrator = orchestratorSource();
  const state = stateSource();
  const thoughtManager = readSrc("thought-manager.ts");
  const chainManager = readSrc("chain-manager.ts");

  switch (id) {
    case "sprov.state_history_audit": {
      const ok =
        state.includes("history.push(transition)") &&
        state.includes("MAX_HISTORY");
      return probe(id, category, expected, ok, `stateHistoryAudit=${ok}`);
    }
    case "sprov.orchestrator_replan_lineage": {
      const ok =
        orchestrator.includes("replanLineage") &&
        orchestrator.includes("replanCheckpoint");
      return probe(id, category, expected, ok, `replanLineage=${ok}`);
    }
    case "sprov.thought_chain_lineage": {
      const ok =
        thoughtManager.includes("export class ThoughtManager") &&
        chainManager.includes("export class ChainManager") &&
        chainManager.includes("addThought");
      return probe(id, category, expected, ok, `thoughtChainLineage=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown plan_lineage probe");
  }
}

function probeDriftDetection(
  id: string,
  category: StrategistProvenanceCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistProvenanceProbeResult {
  const orchestrator = orchestratorSource();
  const prompts = promptsSource();

  switch (id) {
    case "sprov.orchestrator_reflect_phase": {
      const ok =
        orchestrator.includes('phaseStart("reflect"') &&
        orchestrator.includes("Vision drift check");
      return probe(id, category, expected, ok, `reflectPhase=${ok}`);
    }
    case "sprov.prompt_alignment_section": {
      const ok =
        prompts.includes("ALIGNMENT") &&
        prompts.includes("drifting");
      return probe(id, category, expected, ok, `alignmentSection=${ok}`);
    }
    case "sprov.prompt_plan_provenance": {
      const ok =
        prompts.includes("PLAN PROVENANCE:") ||
        prompts.includes("Plan provenance:");
      return probe(id, category, expected, ok, `planProvenanceSection=${ok}`);
    }
    case "sprov.orchestrator_pre_exec_drift_gate": {
      const ok =
        orchestrator.includes("validatePlanDrift(") ||
        orchestrator.includes("plan drift gate") ||
        orchestrator.includes("preExecDriftGate");
      return probe(id, category, expected, ok, `preExecDriftGate=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown drift_detection probe");
  }
}

function probeProvenanceSeam(
  id: string,
  category: StrategistProvenanceCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistProvenanceProbeResult {
  const parser = readSrc("parser.ts");
  const replanSource = readSrc("forge-p03-strategist-replan.ts");

  switch (id) {
    case "sprov.replan_provenance_builder": {
      const ok =
        replanSource.includes("export function buildStrategistReplanProvenance") &&
        typeof buildStrategistReplanProvenance === "function";
      return probe(id, category, expected, ok, `replanProvenanceBuilder=${ok}`);
    }
    case "sprov.parser_provenance_fields": {
      const parsed = parseDecomposeResponse(SAMPLE_BLOCK_DECOMPOSE);
      const ok =
        parsed.ok === true &&
        "planProvenance" in parsed.data &&
        parser.includes("PLAN PROVENANCE");
      return probe(id, category, expected, ok, `planProvenanceField=${ok}`);
    }
    case "sprov.plan_provenance_graph": {
      const ok = readSrcOptional("plan-provenance-graph.ts").includes(
        "export function buildPlanProvenanceGraph",
      );
      return probe(id, category, expected, ok, `planProvenanceGraph=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown provenance_seam probe");
  }
}

function probeBaselineLink(
  id: string,
  category: StrategistProvenanceCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistProvenanceProbeResult {
  switch (id) {
    case "sprov.b08_block_handoff_entry": {
      const handoff = getForgeP03B08ToB09Handoff();
      const ok =
        handoff.targetBlock.blockId === "P03-B09" &&
        handoff.targetBlock.entryAtom === "P03-B09-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "sprov.b08_sealed_replan_probes": {
      const handoff = getForgeP03B08ToB09Handoff();
      const coverage = summarizeStrategistReplanCoverage(getActiveStrategistReplanContract());
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
  category: StrategistProvenanceCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistProvenanceBaseline,
): StrategistProvenanceProbeResult {
  switch (id) {
    case "sprov.source_block_gate_ref": {
      const handoff = getForgeP03B08ToB09Handoff();
      const coverage = summarizeStrategistReplanCoverage(getActiveStrategistReplanContract());
      const ok =
        fixture.sourceBlockGate.atom === "P03-B08-A10" &&
        fixture.sourceBlockGate.replanProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P03_B08_SEALED_ATOM_COUNT &&
        handoff.sourceBlock.blockId === "P03-B08";
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.replanProbeCount}`,
      );
    }
    case "sprov.probe_runner_exported": {
      const ok = productionProvenanceSource().includes(
        "export function runStrategistProvenanceProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "sprov.known_gaps_documented": {
      const contract = getActiveStrategistProvenanceContract();
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
    case "sprov.empty_decompose_boundary": {
      const result = assessStrategistProvenanceInputBoundary("");
      const ok =
        hasProductionExport("assessStrategistProvenanceInputBoundary") &&
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
    case "sprov.whitespace_decompose_boundary": {
      const result = assessStrategistProvenanceInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessStrategistProvenanceInputBoundary") &&
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
    case "sprov.long_decompose_truncation_boundary": {
      const longDecompose = "x".repeat(STRATEGIST_PROVENANCE_DECOMPOSE_MAX_LENGTH + 500);
      const result = assessStrategistProvenanceInputBoundary(longDecompose);
      const ok =
        hasProductionExport("assessStrategistProvenanceInputBoundary") &&
        result.disposition === "exceeds_max_length" &&
        result.truncated === true &&
        result.normalizedDecompose.length === STRATEGIST_PROVENANCE_DECOMPOSE_MAX_LENGTH &&
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
  category: StrategistProvenanceCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistProvenanceBaseline,
): StrategistProvenanceProbeResult {
  switch (id) {
    case "sprov.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateStrategistProvenanceBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "sprov.malformed_decompose_guard": {
      const boundary = assessStrategistProvenanceInputBoundary("bad\0decompose");
      const ok =
        hasProductionExport("assessStrategistProvenanceInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false;
      return probe(id, category, expected, ok, `detail=${boundary.detail}`);
    }
    case "sprov.min_category_probes": {
      const underflow = {
        ...fixture,
        probes: fixture.probes.filter(p => p.category !== "nogo_path"),
      };
      const ok = validateStrategistProvenanceBaseline(underflow).valid === false;
      return probe(id, category, expected, ok, `rejectsUnderflow=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: StrategistProvenanceCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistProvenanceProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "sprov.recovery_reflecting_drift": {
      const reflectingTargets = VALID_TRANSITIONS.reflecting as readonly string[];
      const ok =
        reflectingTargets.includes("decomposing") &&
        reflectingTargets.includes("visioning");
      return probe(id, category, expected, ok, `reflectingDriftRecovery=${ok}`);
    }
    case "sprov.recovery_replan_lineage_checkpoint": {
      const ok =
        orchestrator.includes("replanLineage") &&
        orchestrator.includes("replanCheckpoint") &&
        orchestrator.includes("createPoint(");
      return probe(id, category, expected, ok, `replanLineageCheckpoint=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: StrategistProvenanceCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistProvenanceProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "sprov.nogo_undetected_drift": {
      const ok =
        orchestrator.includes("undetected drift") ||
        orchestrator.includes("driftThreshold") ||
        orchestrator.includes("rejectUndetectedPlanDrift(");
      return probe(id, category, expected, ok, `undetectedDriftGate=${ok}`);
    }
    case "sprov.exported_plan_drift_validator": {
      const ok =
        productionProvenanceSource().includes("export function validatePlanDrift") &&
        orchestrator.includes("validatePlanDrift(");
      return probe(id, category, expected, ok, `planDriftValidator=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: StrategistProvenanceCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistProvenanceBaseline,
): StrategistProvenanceProbeResult {
  switch (category) {
    case "provenance_versioning":
      return probeProvenanceVersioning(id, category, expected, fixture);
    case "plan_lineage":
      return probePlanLineage(id, category, expected);
    case "drift_detection":
      return probeDriftDetection(id, category, expected);
    case "provenance_seam":
      return probeProvenanceSeam(id, category, expected);
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

export function runStrategistProvenanceProbes(
  fixture: StrategistProvenanceBaseline = loadStrategistProvenanceBaseline(),
): StrategistProvenanceProbeResult[] {
  const contract = getActiveStrategistProvenanceContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion ? { ...result, criterion: contractProbe.criterion } : result;
  });
}

export interface StrategistProvenanceProbeMatrixValidationIssue {
  kind: "missing_result" | "criterion_mismatch" | "pass_mismatch" | "gap_misaligned";
  probeId?: string;
  detail: string;
}

export interface StrategistProvenanceProbeMatrixValidationResult {
  valid: boolean;
  issues: StrategistProvenanceProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 */
export function validateStrategistProvenanceProbeMatrix(
  results: StrategistProvenanceProbeResult[],
  contract: StrategistProvenanceContract = getActiveStrategistProvenanceContract(),
): StrategistProvenanceProbeMatrixValidationResult {
  const issues: StrategistProvenanceProbeMatrixValidationIssue[] = [];
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

export interface StrategistProvenanceProductionSliceResult {
  atom: "P03-B09-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: StrategistProvenanceProbeResult[];
  summary: StrategistProvenanceProbeSummary;
  matrixValidation: StrategistProvenanceProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: validatePlanDrift wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runStrategistProvenanceProductionSlice(
  fixture: StrategistProvenanceBaseline = loadStrategistProvenanceBaseline(),
): StrategistProvenanceProductionSliceResult {
  const contract = getActiveStrategistProvenanceContract();
  const fixtureValidation = validateStrategistProvenanceBaseline(fixture);
  const contractValidation = validateStrategistProvenanceAgainstContract(fixture, contract);
  const results = runStrategistProvenanceProbes(fixture);
  const summary = summarizeStrategistProvenanceMatrix(results);
  const matrixValidation = validateStrategistProvenanceProbeMatrix(results, contract);

  return {
    atom: "P03-B09-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}
