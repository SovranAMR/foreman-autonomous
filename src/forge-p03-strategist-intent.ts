/**
 * FOREMAN — Strategist Intent & Task Understanding Baseline (P03-B01)
 *
 * Measures strategist decompose intent, vision-to-block signal wiring and
 * decomposition depth behavior on sealed P02 phase gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import strategistIntentBaseline from "./fixtures/forge-strategist-intent-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP02ToP03PhaseHandoff,
  getActiveVisionerPhaseGateContract,
  summarizeVisionerPhaseGateContractCoverage,
  P02_VISIONER_PHASE_BLOCK_COUNT,
} from "./forge-p02-visioner-phase-gate.js";
import { parseDecomposeResponse } from "./parser.js";

export const FORGE_STRATEGIST_INTENT_VERSION = "1.0.0-a01";

/** Maximum normalized vision length before truncation (P03-B01-A01 boundary). */
export const STRATEGIST_VISION_MAX_LENGTH = 32000;

export const EXPECTED_P02_PHASE_GATE_SEALED_BLOCK_COUNT = P02_VISIONER_PHASE_BLOCK_COUNT;

export const STRATEGIST_INTENT_CATEGORIES = [
  "intent_versioning",
  "task_signal",
  "decomposition_depth",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type StrategistIntentCategory = (typeof STRATEGIST_INTENT_CATEGORIES)[number];

export type StrategistVisionInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface StrategistVisionInputBoundary {
  disposition: StrategistVisionInputDisposition;
  acceptable: boolean;
  normalizedVision: string;
  truncated: boolean;
  detail: string;
}

/**
 * Assess vision input boundary conditions before strategist decompose (P03-B01-A01).
 */
export function assessStrategistVisionInputBoundary(
  visionOutput: string,
): StrategistVisionInputBoundary {
  if (visionOutput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedVision: "",
      truncated: false,
      detail: "null byte detected in vision input",
    };
  }

  const trimmed = visionOutput.trim();
  if (trimmed.length === 0) {
    const disposition: StrategistVisionInputDisposition =
      visionOutput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedVision: "",
      truncated: false,
      detail: disposition === "empty" ? "empty vision input" : "whitespace-only vision input",
    };
  }

  let normalizedVision = visionOutput;
  let truncated = false;
  if (normalizedVision.length > STRATEGIST_VISION_MAX_LENGTH) {
    normalizedVision = normalizedVision.slice(0, STRATEGIST_VISION_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedVision,
    truncated,
    detail: truncated
      ? `vision truncated to ${STRATEGIST_VISION_MAX_LENGTH} characters`
      : "valid vision input",
  };
}

export interface StrategistIntentFixtureEntry {
  id: string;
  category: StrategistIntentCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface StrategistIntentBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourcePhaseGate: {
    version: string;
    atom: string;
    contractVersion: string;
    visionerPhaseGateProbeCount: number;
    sealedBlockCount: number;
  };
  probes: StrategistIntentFixtureEntry[];
}

export interface StrategistIntentProbeResult {
  id: string;
  category: StrategistIntentCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface StrategistIntentProbeSummary {
  total: number;
  aligned: number;
  mismatches: StrategistIntentProbeResult[];
  knownGaps: StrategistIntentProbeResult[];
  byCategory: Record<
    StrategistIntentCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface StrategistIntentValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: StrategistIntentCategory;
  detail: string;
}

export interface StrategistIntentValidationResult {
  valid: boolean;
  issues: StrategistIntentValidationIssue[];
}

export interface StrategistIntentContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: StrategistIntentCategory;
  detail: string;
}

export interface StrategistIntentContractCoverageResult {
  valid: boolean;
  issues: StrategistIntentContractCoverageIssue[];
}

export type StrategistIntentProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface StrategistIntentProbeContract {
  id: string;
  category: StrategistIntentCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: StrategistIntentProbeDisposition;
  criterion: string;
}

export interface StrategistIntentCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface StrategistIntentCategoryContract {
  category: StrategistIntentCategory;
  acceptance: StrategistIntentCategoryAcceptance;
  probes: readonly StrategistIntentProbeContract[];
}

export interface StrategistIntentContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<StrategistIntentCategory, StrategistIntentCategoryContract>;
  probes: readonly StrategistIntentProbeContract[];
}

export const STRATEGIST_INTENT_A01_MIN_PROBES: Readonly<
  Record<StrategistIntentCategory, number>
> = {
  intent_versioning: 3,
  task_signal: 3,
  decomposition_depth: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

function flattenStrategistIntentCategoryProbes(
  categories: Record<StrategistIntentCategory, StrategistIntentCategoryContract>,
): readonly StrategistIntentProbeContract[] {
  return STRATEGIST_INTENT_CATEGORIES.flatMap(category => categories[category].probes);
}

const STRATEGIST_INTENT_CATEGORY_CONTRACTS: Record<
  StrategistIntentCategory,
  StrategistIntentCategoryContract
> = {
  intent_versioning: {
    category: "intent_versioning",
    acceptance: {
      invariant:
        "Strategist intent baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sint.version_tagged",
        category: "intent_versioning",
        description: "Strategist intent baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist intent baseline declares semver version field",
      },
      {
        id: "sint.atom_tagged",
        category: "intent_versioning",
        description: "Strategist intent baseline declares P03-B01-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist intent baseline declares P03-B01-A01 atom id",
      },
      {
        id: "sint.harness_version_exported",
        category: "intent_versioning",
        description: "FORGE_STRATEGIST_INTENT_VERSION exported for strategist intent harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_STRATEGIST_INTENT_VERSION exported for strategist intent harness",
      },
    ],
  },
  task_signal: {
    category: "task_signal",
    acceptance: {
      invariant:
        "Vision document reaches strategist decompose layer; parseDecomposeResponse exports typed block plan.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sint.vision_document_wired",
        category: "task_signal",
        description: "Orchestrator passes vision document into strategist decompose step input",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator passes vision document into strategist decompose step input",
      },
      {
        id: "sint.strategist_layer_invoke",
        category: "task_signal",
        description: "Decompose phase invokes engine.stepWithPhase with strategist layer",
        expected: "PASS",
        disposition: "observed",
        criterion: "Decompose phase invokes engine.stepWithPhase with strategist layer",
      },
      {
        id: "sint.structured_decompose_parse",
        category: "task_signal",
        description: "Typed parseDecomposeResponse exports structured blocks from decompose output",
        expected: "PASS",
        disposition: "observed",
        criterion: "Typed parseDecomposeResponse exports structured blocks from decompose output",
      },
    ],
  },
  decomposition_depth: {
    category: "decomposition_depth",
    acceptance: {
      invariant:
        "Strategist prompt declares block tiers; parser and orchestrator enforce max 8 blocks.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sint.prompt_block_tiers",
        category: "decomposition_depth",
        description: "STRATEGIST_SYSTEM prompt declares simple, medium and complex block count tiers",
        expected: "PASS",
        disposition: "observed",
        criterion: "STRATEGIST_SYSTEM prompt declares simple, medium and complex block count tiers",
      },
      {
        id: "sint.programmatic_block_cap",
        category: "decomposition_depth",
        description: "parseDecomposeResponse enforces max 8 blocks programmatically",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseDecomposeResponse enforces max 8 blocks programmatically",
      },
      {
        id: "sint.orchestrator_block_cap",
        category: "decomposition_depth",
        description: "Orchestrator caps strategist block output at 8 regardless of model output",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator caps strategist block output at 8 regardless of model output",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant: "Strategist intent baseline links to sealed P02 phase gate and P03 entry handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sint.p02_phase_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P02_TO_P03_PHASE_HANDOFF_V1 targets P03-B01-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P02_TO_P03_PHASE_HANDOFF_V1 targets P03-B01-A01 entry atom",
      },
      {
        id: "sint.p02_sealed_phase_gate_probes",
        category: "baseline_link",
        description: "P02→P03 handoff sealed block inventory matches P02 phase gate block count",
        expected: "PASS",
        disposition: "observed",
        criterion: "P02→P03 handoff sealed block inventory matches P02 phase gate block count",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Vision input boundary assessment handles empty, whitespace-only and oversized inputs; probe runner and documented gaps wired.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sint.source_phase_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P02 phase gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P02 phase gate source artifacts",
      },
      {
        id: "sint.probe_runner_exported",
        category: "boundary",
        description: "runStrategistIntentProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runStrategistIntentProbes executes contract-wired probe matrix",
      },
      {
        id: "sint.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL intent gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL intent gap",
      },
      {
        id: "sint.empty_vision_boundary",
        category: "boundary",
        description: "assessStrategistVisionInputBoundary rejects empty vision input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistVisionInputBoundary rejects empty vision input",
      },
      {
        id: "sint.whitespace_vision_boundary",
        category: "boundary",
        description: "assessStrategistVisionInputBoundary rejects whitespace-only vision input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistVisionInputBoundary rejects whitespace-only vision input",
      },
      {
        id: "sint.long_vision_truncation_boundary",
        category: "boundary",
        description: "assessStrategistVisionInputBoundary truncates vision exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistVisionInputBoundary truncates vision exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Empty decompose guard exists; fixture validation rejects invalid versions.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sint.empty_decompose_guard",
        category: "failure_path",
        description: "Orchestrator rejects decompose output with zero extractable blocks",
        expected: "PASS",
        disposition: "failure",
        criterion: "Orchestrator rejects decompose output with zero extractable blocks",
      },
      {
        id: "sint.invalid_version_rejected",
        category: "failure_path",
        description: "validateStrategistIntentBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateStrategistIntentBaseline rejects unexpected fixture version",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant: "Checkpoint resume reuses decompose blocks; structured decompose recovery is a documented gap.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sint.decompose_checkpoint_resume",
        category: "recovery_path",
        description: "Pipeline resume reuses prior checkpoint decompose blocks without re-invoking LLM",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Pipeline resume reuses prior checkpoint decompose blocks without re-invoking LLM",
      },
      {
        id: "sint.structured_decompose_recovery",
        category: "recovery_path",
        description: "recoverStrategistDecompose restructures failed decompose parse into actionable block plan",
        expected: "FAIL",
        disposition: "gap",
        criterion: "recoverStrategistDecompose restructures failed decompose parse into actionable block plan",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant: "Strategist contradiction BLOCK exists; over-decompose output trimmed at 8 blocks.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sint.strategist_contradiction_block",
        category: "nogo_path",
        description: "Strategist prompt can BLOCK visioner on internal contradictions",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Strategist prompt can BLOCK visioner on internal contradictions",
      },
      {
        id: "sint.over_decompose_nogo",
        category: "nogo_path",
        description: "parseDecomposeResponse trims strategist output exceeding 8 blocks",
        expected: "PASS",
        disposition: "nogo",
        criterion: "parseDecomposeResponse trims strategist output exceeding 8 blocks",
      },
    ],
  },
};

export const FORGE_STRATEGIST_INTENT_CONTRACT_V1: StrategistIntentContract = {
  version: "1.0.0",
  atom: "P03-B01-A05",
  purpose:
    "Typed strategist intent contract declaring measurable vision signal, decomposition depth and block cap probes.",
  categories: STRATEGIST_INTENT_CATEGORY_CONTRACTS,
  probes: flattenStrategistIntentCategoryProbes(STRATEGIST_INTENT_CATEGORY_CONTRACTS),
};

export function getActiveStrategistIntentContract(): StrategistIntentContract {
  return FORGE_STRATEGIST_INTENT_CONTRACT_V1;
}

export function getStrategistIntentCategoryContract(
  category: StrategistIntentCategory,
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): StrategistIntentCategoryContract {
  return contract.categories[category];
}

export function listStrategistIntentContractProbeIds(
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listStrategistIntentProbesByDisposition(
  disposition: StrategistIntentProbeDisposition,
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): StrategistIntentProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listStrategistIntentContractProbesByCategory(
  category: StrategistIntentCategory,
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): StrategistIntentProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeStrategistIntentContractCoverage(
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<StrategistIntentCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<StrategistIntentProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    StrategistIntentCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<StrategistIntentProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of STRATEGIST_INTENT_CATEGORIES) {
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

export function validateStrategistIntentContractCoverage(
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): StrategistIntentContractCoverageResult {
  const issues: StrategistIntentContractCoverageIssue[] = [];

  for (const category of STRATEGIST_INTENT_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < STRATEGIST_INTENT_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${STRATEGIST_INTENT_A01_MIN_PROBES[category]}`,
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

  const ids = listStrategistIntentContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeStrategistIntentContractCoverage(contract);
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
    if (!probe.id.startsWith("sint.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing sint. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateStrategistIntentAgainstContract(
  fixture: StrategistIntentBaseline,
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): StrategistIntentValidationResult {
  const issues: StrategistIntentValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of STRATEGIST_INTENT_CATEGORIES) {
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

  for (const probeEntry of contract.probes) {
    if (!fixtureIds.has(probeEntry.id)) {
      issues.push({ kind: "missing_probe", probeId: probeEntry.id, detail: `fixture missing ${probeEntry.id}` });
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

export function validateStrategistIntentBaseline(
  fixture: StrategistIntentBaseline,
): StrategistIntentValidationResult {
  const issues: StrategistIntentValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P03-B01-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    STRATEGIST_INTENT_CATEGORIES.map(category => [category, 0]),
  ) as Record<StrategistIntentCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of STRATEGIST_INTENT_CATEGORIES) {
    const min = STRATEGIST_INTENT_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP02ToP03PhaseHandoff();
  const phaseGateCoverage = summarizeVisionerPhaseGateContractCoverage(
    getActiveVisionerPhaseGateContract(),
  );

  if (fixture.sourcePhaseGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourcePhaseGate.atom=${fixture.sourcePhaseGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (fixture.sourcePhaseGate.visionerPhaseGateProbeCount !== phaseGateCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourcePhaseGate.visionerPhaseGateProbeCount=${fixture.sourcePhaseGate.visionerPhaseGateProbeCount} ` +
        `contract=${phaseGateCoverage.totalProbes}`,
    });
  }
  if (fixture.sourcePhaseGate.sealedBlockCount !== EXPECTED_P02_PHASE_GATE_SEALED_BLOCK_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourcePhaseGate.sealedBlockCount=${fixture.sourcePhaseGate.sealedBlockCount} ` +
        `expected=${EXPECTED_P02_PHASE_GATE_SEALED_BLOCK_COUNT}`,
    });
  }
  if (handoff.sourcePhase.completedBlocks.length !== EXPECTED_P02_PHASE_GATE_SEALED_BLOCK_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `P02 handoff completedBlocks=${handoff.sourcePhase.completedBlocks.length} ` +
        `expected=${EXPECTED_P02_PHASE_GATE_SEALED_BLOCK_COUNT}`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length < 1) {
    issues.push({
      kind: "missing_category",
      detail: "A01 fixture must document at least one known FAIL gap",
    });
  }

  const contractAlignment = validateStrategistIntentAgainstContract(
    fixture,
    getActiveStrategistIntentContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function loadStrategistIntentBaseline(): StrategistIntentBaseline {
  return strategistIntentBaseline as StrategistIntentBaseline;
}

export function summarizeStrategistIntentMatrix(
  results: StrategistIntentProbeResult[],
): StrategistIntentProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as StrategistIntentProbeSummary["byCategory"];
  for (const category of STRATEGIST_INTENT_CATEGORIES) {
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

export function listStrategistIntentProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistIntentBaseline,
): StrategistIntentFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listStrategistIntentKnownGaps(
  results: StrategistIntentProbeResult[],
): StrategistIntentProbeResult[] {
  return summarizeStrategistIntentMatrix(results).knownGaps;
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
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): StrategistIntentProbeResult {
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

function productionIntentSource(): string {
  return readSrc("forge-p03-strategist-intent.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionIntentSource());
}

const SAMPLE_DECOMPOSE_OUTPUT = `REASONING: Break into layers
OUTPUT:
Block 1: Setup core types
Block 2: Wire orchestrator seam
Block 3: Add tests
Block 4: Document handoff
Block 5: Seal block gate
Block 6: Regression gate
Block 7: Guard controls
Block 8: Phase gate
Block 9: Extra block trimmed
DEPENDENCIES: 2→1, 3→1,2
CONFIDENCE: 0.85`;

function probeIntentVersioning(
  id: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistIntentBaseline,
): StrategistIntentProbeResult {
  switch (id) {
    case "sint.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "sint.atom_tagged": {
      const ok = fixture.atom === "P03-B01-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "sint.harness_version_exported": {
      const ok = FORGE_STRATEGIST_INTENT_VERSION.startsWith("1.0.0");
      return probe(id, category, expected, ok, `harnessVersion=${FORGE_STRATEGIST_INTENT_VERSION}`);
    }
    default:
      return probe(id, category, expected, false, "unknown intent_versioning probe");
  }
}

function probeTaskSignal(
  id: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistIntentProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "sint.vision_document_wired": {
      const ok =
        orchestrator.includes("VISION DOCUMENT:") &&
        orchestrator.includes("${visionOutput}");
      return probe(id, category, expected, ok, `visionDocumentWired=${ok}`);
    }
    case "sint.strategist_layer_invoke": {
      const ok =
        orchestrator.includes("stepWithPhase(") &&
        orchestrator.includes('"strategist"') &&
        orchestrator.includes('"decompose"');
      return probe(id, category, expected, ok, `strategistDecompose=${ok}`);
    }
    case "sint.structured_decompose_parse": {
      const parsed = parseDecomposeResponse(SAMPLE_DECOMPOSE_OUTPUT);
      const ok = parsed.ok === true && parsed.data.blocks.length >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `parseDecomposeResponse=${ok}, blocks=${parsed.ok ? parsed.data.blocks.length : 0}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown task_signal probe");
  }
}

function probeDecompositionDepth(
  id: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistIntentProbeResult {
  const prompts = promptsSource();
  const orchestrator = orchestratorSource();
  const parserSource = readSrc("parser.ts");

  switch (id) {
    case "sint.prompt_block_tiers": {
      const ok =
        prompts.includes("Simple tasks") &&
        prompts.includes("Medium tasks") &&
        prompts.includes("Complex tasks") &&
        prompts.includes("ABSOLUTE MAXIMUM: 8 blocks");
      return probe(id, category, expected, ok, `blockTiersInPrompt=${ok}`);
    }
    case "sint.programmatic_block_cap": {
      const ok =
        parserSource.includes("blocks.length > 8") &&
        parserSource.includes("blocks.length = 8");
      return probe(id, category, expected, ok, `parserBlockCap=${ok}`);
    }
    case "sint.orchestrator_block_cap": {
      const ok =
        orchestrator.includes("blocks.length > 8") &&
        orchestrator.includes("capping at 8");
      return probe(id, category, expected, ok, `orchestratorBlockCap=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown decomposition_depth probe");
  }
}

function probeBaselineLink(
  id: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistIntentProbeResult {
  switch (id) {
    case "sint.p02_phase_handoff_entry": {
      const handoff = getForgeP02ToP03PhaseHandoff();
      const ok =
        handoff.targetPhase.entryBlock === "P03-B01" &&
        handoff.targetPhase.entryAtom === "P03-B01-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetPhase.entryBlock}/${handoff.targetPhase.entryAtom}`,
      );
    }
    case "sint.p02_sealed_phase_gate_probes": {
      const handoff = getForgeP02ToP03PhaseHandoff();
      const ok =
        handoff.sealedArtifacts.sealedBlockInventoryCount ===
        EXPECTED_P02_PHASE_GATE_SEALED_BLOCK_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoff_blocks=${handoff.sealedArtifacts.sealedBlockInventoryCount}, expected=${EXPECTED_P02_PHASE_GATE_SEALED_BLOCK_COUNT}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown baseline_link probe");
  }
}

function probeBoundary(
  id: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistIntentBaseline,
): StrategistIntentProbeResult {
  switch (id) {
    case "sint.source_phase_gate_ref": {
      const handoff = getForgeP02ToP03PhaseHandoff();
      const coverage = summarizeVisionerPhaseGateContractCoverage(
        getActiveVisionerPhaseGateContract(),
      );
      const ok =
        fixture.sourcePhaseGate.atom === handoff.atom &&
        fixture.sourcePhaseGate.visionerPhaseGateProbeCount === coverage.totalProbes &&
        fixture.sourcePhaseGate.sealedBlockCount === EXPECTED_P02_PHASE_GATE_SEALED_BLOCK_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourcePhaseGate.atom}, probes=${fixture.sourcePhaseGate.visionerPhaseGateProbeCount}`,
      );
    }
    case "sint.probe_runner_exported": {
      const ok = productionIntentSource().includes("export function runStrategistIntentProbes");
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "sint.known_gaps_documented": {
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      return probe(id, category, expected, failCount >= 1, `documentedFail=${failCount}`);
    }
    case "sint.empty_vision_boundary": {
      const result = assessStrategistVisionInputBoundary("");
      const ok =
        hasProductionExport("assessStrategistVisionInputBoundary") &&
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
    case "sint.whitespace_vision_boundary": {
      const result = assessStrategistVisionInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessStrategistVisionInputBoundary") &&
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
    case "sint.long_vision_truncation_boundary": {
      const longVision = "x".repeat(STRATEGIST_VISION_MAX_LENGTH + 500);
      const result = assessStrategistVisionInputBoundary(longVision);
      const ok =
        hasProductionExport("assessStrategistVisionInputBoundary") &&
        result.truncated === true &&
        result.normalizedVision.length === STRATEGIST_VISION_MAX_LENGTH &&
        result.acceptable === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `truncated=${result.truncated}, length=${result.normalizedVision.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistIntentBaseline,
): StrategistIntentProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "sint.empty_decompose_guard": {
      const ok =
        orchestrator.includes("blocks.length === 0") &&
        orchestrator.includes("No blocks could be extracted from decompose output");
      return probe(id, category, expected, ok, `emptyDecomposeGuard=${ok}`);
    }
    case "sint.invalid_version_rejected": {
      const badFixture = { ...fixture, version: "9.9.9" };
      const validation = validateStrategistIntentBaseline(badFixture);
      const ok = validation.valid === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `invalidVersionRejected=${ok}, issues=${validation.issues.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistIntentProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "sint.decompose_checkpoint_resume": {
      const ok =
        orchestrator.includes("priorCheckpoint.blocks") &&
        orchestrator.includes('phaseEnd("decompose"') &&
        orchestrator.includes("reused");
      return probe(id, category, expected, ok, `decomposeCheckpointResume=${ok}`);
    }
    case "sint.structured_decompose_recovery": {
      const ok = hasProductionExport("recoverStrategistDecompose");
      return probe(id, category, expected, ok, `recoverStrategistDecompose=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistIntentProbeResult {
  const prompts = promptsSource();

  switch (id) {
    case "sint.strategist_contradiction_block": {
      const ok = prompts.includes("You CAN block the Visioner");
      return probe(id, category, expected, ok, `contradictionBlock=${ok}`);
    }
    case "sint.over_decompose_nogo": {
      const parsed = parseDecomposeResponse(SAMPLE_DECOMPOSE_OUTPUT);
      const ok = parsed.ok === true && parsed.data.blocks.length === 8;
      return probe(
        id,
        category,
        expected,
        ok,
        `trimmedBlocks=${parsed.ok ? parsed.data.blocks.length : 0}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runStrategistIntentProbe(
  entry: StrategistIntentFixtureEntry,
  fixture: StrategistIntentBaseline,
): StrategistIntentProbeResult {
  const { id, category, expected } = entry;

  if (category === "intent_versioning") {
    return probeIntentVersioning(id, category, expected, fixture);
  }
  if (category === "task_signal") {
    return probeTaskSignal(id, category, expected);
  }
  if (category === "decomposition_depth") {
    return probeDecompositionDepth(id, category, expected);
  }
  if (category === "baseline_link") {
    return probeBaselineLink(id, category, expected);
  }
  if (category === "boundary") {
    return probeBoundary(id, category, expected, fixture);
  }
  if (category === "failure_path") {
    return probeFailurePath(id, category, expected, fixture);
  }
  if (category === "recovery_path") {
    return probeRecoveryPath(id, category, expected);
  }
  if (category === "nogo_path") {
    return probeNogoPath(id, category, expected);
  }

  return probe(id, category, expected, false, `unknown category: ${category}`);
}

/** Execute strategist intent baseline probe matrix (P03-B01-A01). */
export function runStrategistIntentProbes(
  fixture: StrategistIntentBaseline = loadStrategistIntentBaseline(),
): StrategistIntentProbeResult[] {
  const contract = getActiveStrategistIntentContract();
  return fixture.probes.map(entry => {
    const result = runStrategistIntentProbe(entry, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}
