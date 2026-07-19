/**
 * FOREMAN — Visioner Alternative Generation Baseline (P02-B07)
 *
 * Measures alternative vision generation wiring on sealed P02-B06 uncertainty block gate artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getActiveVisionerUncertaintyContract,
  getForgeP02B06ToB07Handoff,
  summarizeVisionerUncertaintyContractCoverage,
} from "./forge-p02-visioner-uncertainty.js";

export const FORGE_VISIONER_ALTERNATIVE_VERSION = "1.0.0-a01";

/** Maximum normalized vision length before truncation (P02-B07-A01 boundary). */
export const VISIONER_ALTERNATIVE_VISION_MAX_LENGTH = 32000;

export const VISIONER_ALTERNATIVE_CATEGORIES = [
  "alternative_versioning",
  "alternative_signal",
  "divergence_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type VisionerAlternativeCategory = (typeof VISIONER_ALTERNATIVE_CATEGORIES)[number];

export type VisionerAlternativeInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface VisionerAlternativeInputBoundary {
  disposition: VisionerAlternativeInputDisposition;
  acceptable: boolean;
  normalizedVision: string;
  truncated: boolean;
  detail: string;
}

export interface VisionerAlternativePresence {
  hasAlternatives: boolean;
  alternativeCount: number;
  alternatives: string[];
  primaryGoal?: string;
  detail: string;
}

export function assessVisionerAlternativeInputBoundary(
  visionOutput: string,
): VisionerAlternativeInputBoundary {
  if (visionOutput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedVision: "",
      truncated: false,
      detail: "null byte in vision output",
    };
  }

  const trimmed = visionOutput.trim();
  if (trimmed.length === 0) {
    const disposition: VisionerAlternativeInputDisposition =
      visionOutput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedVision: "",
      truncated: false,
      detail: disposition === "empty" ? "empty vision output" : "whitespace-only vision output",
    };
  }

  let normalizedVision = visionOutput;
  let truncated = false;
  if (normalizedVision.length > VISIONER_ALTERNATIVE_VISION_MAX_LENGTH) {
    normalizedVision = normalizedVision.slice(0, VISIONER_ALTERNATIVE_VISION_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedVision,
    truncated,
    detail: truncated
      ? `vision truncated to ${VISIONER_ALTERNATIVE_VISION_MAX_LENGTH} characters`
      : "valid vision output",
  };
}

const ALTERNATIVE_SECTION_HEADER =
  /^\*?\*?\s*(?:ALTERNATIVE(?:\s+VISION)?|VISION\s+ALTERNATIVE)\b/i;
const ALTERNATIVE_FIELD = /ALTERNATIVE(?:_VISION)?:/i;
const GENERIC_SECTION_HEADER = /^\*?\*?\s*[A-Z][A-Z\s-]+/;

function collectAlternativeSections(visionOutput: string): string[] {
  const lines = visionOutput.split("\n");
  const alternatives: string[] = [];
  let capturing = false;
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (ALTERNATIVE_SECTION_HEADER.test(trimmed) || ALTERNATIVE_FIELD.test(trimmed)) {
      if (current.length > 0) {
        alternatives.push(current.join("\n").trim());
      }
      current = [trimmed];
      capturing = true;
      continue;
    }
    if (capturing) {
      if (trimmed.length === 0) continue;
      if (
        GENERIC_SECTION_HEADER.test(trimmed) &&
        !ALTERNATIVE_SECTION_HEADER.test(trimmed) &&
        !ALTERNATIVE_FIELD.test(trimmed)
      ) {
        if (current.length > 0) {
          alternatives.push(current.join("\n").trim());
        }
        current = [];
        capturing = false;
      } else {
        current.push(trimmed);
      }
    }
  }

  if (current.length > 0) {
    alternatives.push(current.join("\n").trim());
  }

  return alternatives.filter(Boolean);
}

export function assessVisionerAlternativePresence(
  visionOutput: string,
): VisionerAlternativePresence {
  const boundary = assessVisionerAlternativeInputBoundary(visionOutput);
  if (!boundary.acceptable) {
    return {
      hasAlternatives: false,
      alternativeCount: 0,
      alternatives: [],
      detail: boundary.detail,
    };
  }

  const normalized = boundary.normalizedVision;
  const alternatives = collectAlternativeSections(normalized);
  const goalMatch = normalized.match(/\*\*GOAL\*\*:\s*(.+)/i);

  return {
    hasAlternatives: alternatives.length > 0,
    alternativeCount: alternatives.length,
    alternatives,
    primaryGoal: goalMatch?.[1]?.trim(),
    detail: `alternatives=${alternatives.length}`,
  };
}

export interface VisionerAlternativeFixtureEntry {
  id: string;
  category: VisionerAlternativeCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface VisionerAlternativeBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    visionerUncertaintyProbeCount: number;
    sealedAtomCount: number;
  };
  probes: VisionerAlternativeFixtureEntry[];
}

export interface VisionerAlternativeProbeResult {
  id: string;
  category: VisionerAlternativeCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface VisionerAlternativeProbeSummary {
  total: number;
  aligned: number;
  mismatches: VisionerAlternativeProbeResult[];
  knownGaps: VisionerAlternativeProbeResult[];
  byCategory: Record<
    VisionerAlternativeCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface VisionerAlternativeValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: VisionerAlternativeCategory;
  detail: string;
}

export interface VisionerAlternativeValidationResult {
  valid: boolean;
  issues: VisionerAlternativeValidationIssue[];
}

export interface VisionerAlternativeProbeMatrixValidationIssue {
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

export interface VisionerAlternativeProbeMatrixValidationResult {
  valid: boolean;
  issues: VisionerAlternativeProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

export interface VisionerAlternativeContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: VisionerAlternativeCategory;
  detail: string;
}

export interface VisionerAlternativeContractCoverageResult {
  valid: boolean;
  issues: VisionerAlternativeContractCoverageIssue[];
}

export type VisionerAlternativeProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface VisionerAlternativeProbeContract {
  id: string;
  category: VisionerAlternativeCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: VisionerAlternativeProbeDisposition;
  criterion: string;
}

export interface VisionerAlternativeCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface VisionerAlternativeCategoryContract {
  category: VisionerAlternativeCategory;
  acceptance: VisionerAlternativeCategoryAcceptance;
  probes: readonly VisionerAlternativeProbeContract[];
}

export interface VisionerAlternativeContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<VisionerAlternativeCategory, VisionerAlternativeCategoryContract>;
  probes: readonly VisionerAlternativeProbeContract[];
}

export const VISIONER_ALTERNATIVE_A01_MIN_PROBES: Readonly<
  Record<VisionerAlternativeCategory, number>
> = {
  alternative_versioning: 3,
  alternative_signal: 3,
  divergence_signal: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

function flattenVisionerAlternativeCategoryProbes(
  categories: Record<VisionerAlternativeCategory, VisionerAlternativeCategoryContract>,
): readonly VisionerAlternativeProbeContract[] {
  return VISIONER_ALTERNATIVE_CATEGORIES.flatMap(category => categories[category].probes);
}

const VISIONER_ALTERNATIVE_CATEGORY_CONTRACTS: Record<
  VisionerAlternativeCategory,
  VisionerAlternativeCategoryContract
> = {
  alternative_versioning: {
    category: "alternative_versioning",
    acceptance: {
      invariant:
        "Visioner alternative baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "valt.version_tagged",
        category: "alternative_versioning",
        description: "Visioner alternative baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner alternative baseline declares semver version field",
      },
      {
        id: "valt.atom_tagged",
        category: "alternative_versioning",
        description: "Visioner alternative baseline declares P02-B07-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner alternative baseline declares P02-B07-A01 atom id",
      },
      {
        id: "valt.harness_version_exported",
        category: "alternative_versioning",
        description: "FORGE_VISIONER_ALTERNATIVE_VERSION exported for alternative harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_VISIONER_ALTERNATIVE_VERSION exported for alternative harness",
      },
    ],
  },
  alternative_signal: {
    category: "alternative_signal",
    acceptance: {
      invariant:
        "Uncertainty confidence wiring and B06 handoff prerequisites anchor alternative generation entry.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "valt.uncertainty_confidence_wired",
        category: "alternative_signal",
        description:
          "assessVisionerUncertaintyPresence detects confidence prerequisite for alternative branching",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessVisionerUncertaintyPresence detects confidence prerequisite for alternative branching",
      },
      {
        id: "valt.orchestrator_low_confidence_block",
        category: "alternative_signal",
        description:
          "Orchestrator checkBlock emits block_detected when visioner confidence level is block",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Orchestrator checkBlock emits block_detected when visioner confidence level is block",
      },
      {
        id: "valt.b06_handoff_prerequisite",
        category: "alternative_signal",
        description:
          "FORGE_P02_B06_TO_B07_HANDOFF requires sealed visioner uncertainty record before alternative entry",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "FORGE_P02_B06_TO_B07_HANDOFF requires sealed visioner uncertainty record before alternative entry",
      },
    ],
  },
  divergence_signal: {
    category: "divergence_signal",
    acceptance: {
      invariant:
        "Primary single-vision path is observable; typed alternative presence detection is exported.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "valt.single_vision_output_store",
        category: "divergence_signal",
        description: "Orchestrator stores a single primary visionOutput string before decomposition",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator stores a single primary visionOutput string before decomposition",
      },
      {
        id: "valt.assess_alternative_presence",
        category: "divergence_signal",
        description:
          "assessVisionerAlternativePresence exports typed alternative detection from vision output",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessVisionerAlternativePresence exports typed alternative detection from vision output",
      },
      {
        id: "valt.parse_primary_vision_only",
        category: "divergence_signal",
        description: "parseVisionResponse extracts primary vision fields without alternative array",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseVisionResponse extracts primary vision fields without alternative array",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant: "P02-B06 block gate handoff targets P02-B07-A01 with sealed uncertainty probe count.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "valt.b06_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P02_B06_TO_B07_HANDOFF_V1 targets P02-B07-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P02_B06_TO_B07_HANDOFF_V1 targets P02-B07-A01 entry atom",
      },
      {
        id: "valt.b06_sealed_uncertainty_probes",
        category: "baseline_link",
        description:
          "P02-B06→B07 handoff sealed probeCount matches active visioner uncertainty contract",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "P02-B06→B07 handoff sealed probeCount matches active visioner uncertainty contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Baseline fixture references sealed B06 gate; probe runner exported; known gaps documented; input boundaries enforced.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "valt.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P02-B06 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P02-B06 block gate source artifacts",
      },
      {
        id: "valt.probe_runner_exported",
        category: "boundary",
        description: "runVisionerAlternativeProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runVisionerAlternativeProbes executes contract-wired probe matrix",
      },
      {
        id: "valt.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL alternative gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL alternative gap",
      },
      {
        id: "valt.empty_vision_alternative_presence",
        category: "boundary",
        description: "assessVisionerAlternativeInputBoundary rejects empty vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerAlternativeInputBoundary rejects empty vision output",
      },
      {
        id: "valt.whitespace_vision_boundary",
        category: "boundary",
        description: "assessVisionerAlternativeInputBoundary rejects whitespace-only vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerAlternativeInputBoundary rejects whitespace-only vision output",
      },
      {
        id: "valt.long_vision_truncation_boundary",
        category: "boundary",
        description: "assessVisionerAlternativeInputBoundary truncates vision exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerAlternativeInputBoundary truncates vision exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Malformed vision guard exists; fixture validation rejects invalid versions.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "valt.invalid_version_rejected",
        category: "failure_path",
        description: "validateVisionerAlternativeBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateVisionerAlternativeBaseline rejects unexpected fixture version",
      },
      {
        id: "valt.malformed_vision_presence_guard",
        category: "failure_path",
        description: "assessVisionerAlternativePresence rejects null-byte vision output safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessVisionerAlternativePresence rejects null-byte vision output safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Checkpoint resume preserves primary vision; structured alternative recovery is a documented gap.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "valt.vision_checkpoint_primary",
        category: "recovery_path",
        description:
          "Pipeline resume reuses checkpoint primary vision output without alternative fan-out",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "Pipeline resume reuses checkpoint primary vision output without alternative fan-out",
      },
      {
        id: "valt.structured_alternative_recovery",
        category: "recovery_path",
        description:
          "recoverVisionerAlternatives restructures failed alternative parse into selectable vision variants",
        expected: "FAIL",
        disposition: "gap",
        criterion:
          "recoverVisionerAlternatives restructures failed alternative parse into selectable vision variants",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Confidence block gate and clarification NO-GO guard alternative generation spend.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "valt.visioner_confidence_block_gate",
        category: "nogo_path",
        description:
          "Orchestrator checkBlock blocks vision phase when evaluateConfidence returns block",
        expected: "PASS",
        disposition: "nogo",
        criterion:
          "Orchestrator checkBlock blocks vision phase when evaluateConfidence returns block",
      },
      {
        id: "valt.uncertainty_clarification_nogo",
        category: "nogo_path",
        description:
          "assessVisionerUncertaintyPresence flags clarification need before alternative generation spend",
        expected: "PASS",
        disposition: "nogo",
        criterion:
          "assessVisionerUncertaintyPresence flags clarification need before alternative generation spend",
      },
    ],
  },
};

export const FORGE_VISIONER_ALTERNATIVE_CONTRACT_V1: VisionerAlternativeContract = {
  version: "1.0.0",
  atom: "P02-B07-A06",
  purpose:
    "Typed visioner alternative contract declaring measurable uncertainty, divergence and guard probes.",
  categories: VISIONER_ALTERNATIVE_CATEGORY_CONTRACTS,
  probes: flattenVisionerAlternativeCategoryProbes(VISIONER_ALTERNATIVE_CATEGORY_CONTRACTS),
};

export const EXPECTED_P02_B06_SEALED_ATOM_COUNT = 10;

export function getActiveVisionerAlternativeContract(): VisionerAlternativeContract {
  return FORGE_VISIONER_ALTERNATIVE_CONTRACT_V1;
}

export function summarizeVisionerAlternativeContractCoverage(
  contract: VisionerAlternativeContract = getActiveVisionerAlternativeContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<VisionerAlternativeCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<VisionerAlternativeProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    VisionerAlternativeCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<VisionerAlternativeProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of VISIONER_ALTERNATIVE_CATEGORIES) {
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

export function getVisionerAlternativeCategoryContract(
  category: VisionerAlternativeCategory,
  contract: VisionerAlternativeContract = getActiveVisionerAlternativeContract(),
): VisionerAlternativeCategoryContract {
  return contract.categories[category];
}

export function listVisionerAlternativeContractProbeIds(
  contract: VisionerAlternativeContract = getActiveVisionerAlternativeContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listVisionerAlternativeProbesByDisposition(
  disposition: VisionerAlternativeProbeDisposition,
  contract: VisionerAlternativeContract = getActiveVisionerAlternativeContract(),
): VisionerAlternativeProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listVisionerAlternativeContractProbesByCategory(
  category: VisionerAlternativeCategory,
  contract: VisionerAlternativeContract = getActiveVisionerAlternativeContract(),
): readonly VisionerAlternativeProbeContract[] {
  return contract.categories[category].probes;
}

export function validateVisionerAlternativeContractCoverage(
  contract: VisionerAlternativeContract = getActiveVisionerAlternativeContract(),
): VisionerAlternativeContractCoverageResult {
  const issues: VisionerAlternativeContractCoverageIssue[] = [];

  for (const category of VISIONER_ALTERNATIVE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < VISIONER_ALTERNATIVE_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${VISIONER_ALTERNATIVE_A01_MIN_PROBES[category]}`,
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

  const ids = listVisionerAlternativeContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeVisionerAlternativeContractCoverage(contract);
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
    if (!probe.id.startsWith("valt.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing valt. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateVisionerAlternativeProbeMatrix(
  results: VisionerAlternativeProbeResult[],
  contract: VisionerAlternativeContract = getActiveVisionerAlternativeContract(),
): VisionerAlternativeProbeMatrixValidationResult {
  const issues: VisionerAlternativeProbeMatrixValidationIssue[] = [];
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

export function validateVisionerAlternativeAgainstContract(
  fixture: VisionerAlternativeBaseline,
  contract: VisionerAlternativeContract = getActiveVisionerAlternativeContract(),
): VisionerAlternativeValidationResult {
  const issues: VisionerAlternativeValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of VISIONER_ALTERNATIVE_CATEGORIES) {
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

export function validateVisionerAlternativeBaseline(
  fixture: VisionerAlternativeBaseline,
): VisionerAlternativeValidationResult {
  const issues: VisionerAlternativeValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P02-B07-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    VISIONER_ALTERNATIVE_CATEGORIES.map(category => [category, 0]),
  ) as Record<VisionerAlternativeCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of VISIONER_ALTERNATIVE_CATEGORIES) {
    const min = VISIONER_ALTERNATIVE_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP02B06ToB07Handoff();
  const uncertaintyCoverage = summarizeVisionerUncertaintyContractCoverage(
    getActiveVisionerUncertaintyContract(),
  );

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (
    fixture.sourceBlockGate.visionerUncertaintyProbeCount !== uncertaintyCoverage.totalProbes
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.visionerUncertaintyProbeCount=${fixture.sourceBlockGate.visionerUncertaintyProbeCount} ` +
        `contract=${uncertaintyCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P02_B06_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P02_B06_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P02_B06_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B06 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P02_B06_SEALED_ATOM_COUNT}`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length < 1) {
    issues.push({
      kind: "missing_category",
      detail: "A01 fixture must document at least one known FAIL gap",
    });
  }

  const contractAlignment = validateVisionerAlternativeAgainstContract(
    fixture,
    getActiveVisionerAlternativeContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeVisionerAlternativeMatrix(
  results: VisionerAlternativeProbeResult[],
): VisionerAlternativeProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as VisionerAlternativeProbeSummary["byCategory"];
  for (const category of VISIONER_ALTERNATIVE_CATEGORIES) {
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

export function listVisionerAlternativeProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerAlternativeBaseline,
): VisionerAlternativeFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listVisionerAlternativeKnownGaps(
  results: VisionerAlternativeProbeResult[],
): VisionerAlternativeProbeResult[] {
  return results.filter(r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned);
}

/** Sample low-confidence vision used by alternative presence probes. */
export const SAMPLE_LOW_CONFIDENCE_VISION = `REASONING: Scope unclear — admin dashboard or public landing page
OUTPUT:
**GOAL**: Website refresh
CONFIDENCE: 0.52
NEEDS_RESEARCH: false`;

/** Sample vision with explicit alternative section for presence detection probes. */
export const SAMPLE_VISION_WITH_ALTERNATIVES = `REASONING: Two viable product directions
OUTPUT:
**GOAL**: Dental clinic platform
**ALTERNATIVE VISION A**: Premium concierge booking experience
**ALTERNATIVE VISION B**: Self-serve patient portal
CONFIDENCE: 0.78
NEEDS_RESEARCH: false`;
