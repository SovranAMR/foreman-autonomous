/**
 * FOREMAN — Visioner Scoring & Trade-off Baseline (P02-B08)
 *
 * Measures vision scoring and trade-off analysis wiring on sealed P02-B07
 * alternative block gate artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  assessVisionerAlternativeInputBoundary,
  assessVisionerAlternativePresence,
  getActiveVisionerAlternativeContract,
  getForgeP02B07ToB08Handoff,
  summarizeVisionerAlternativeContractCoverage,
  VISIONER_ALTERNATIVE_VISION_MAX_LENGTH,
  type VisionerAlternativeInputBoundary,
  type VisionerAlternativePresence,
} from "./forge-p02-visioner-alternative.js";

export const FORGE_VISIONER_SCORING_VERSION = "1.0.0-b07";

/** Maximum normalized vision length before truncation (P02-B08-A01 boundary). */
export const VISIONER_SCORING_VISION_MAX_LENGTH = VISIONER_ALTERNATIVE_VISION_MAX_LENGTH;

export const VISIONER_SCORING_CATEGORIES = [
  "scoring_versioning",
  "scoring_signal",
  "tradeoff_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type VisionerScoringCategory = (typeof VISIONER_SCORING_CATEGORIES)[number];

export type VisionerScoringInputDisposition = VisionerAlternativeInputBoundary["disposition"];

export interface VisionerScoringInputBoundary {
  disposition: VisionerScoringInputDisposition;
  acceptable: boolean;
  normalizedVision: string;
  truncated: boolean;
  detail: string;
}

export interface VisionerScoringPresence {
  hasAlternatives: boolean;
  alternativeCount: number;
  alternatives: string[];
  primaryGoal?: string;
  scoreable: boolean;
  detail: string;
}

export interface VisionerScoringTieBreakCheck {
  shouldBlock: boolean;
  tiedAlternatives: number;
  threshold: number;
  reason?: string;
}

/** Default tie threshold before NO-GO gate blocks scoring spend (P02-B08-A01 stub). */
export const VISIONER_SCORING_TIEBREAK_THRESHOLD = 2;

/**
 * Assess vision input boundary for scoring — wraps alternative input boundary (P02-B08-A01).
 */
export function assessVisionerScoringInputBoundary(
  visionOutput: string,
): VisionerScoringInputBoundary {
  const boundary = assessVisionerAlternativeInputBoundary(visionOutput);
  return {
    disposition: boundary.disposition,
    acceptable: boundary.acceptable,
    normalizedVision: boundary.normalizedVision,
    truncated: boundary.truncated,
    detail: boundary.detail,
  };
}

/**
 * Detect scoreable alternative presence from vision output (P02-B08-A01).
 */
export function assessVisionerScoringPresence(visionOutput: string): VisionerScoringPresence {
  const boundary = assessVisionerScoringInputBoundary(visionOutput);
  if (!boundary.acceptable) {
    return {
      hasAlternatives: false,
      alternativeCount: 0,
      alternatives: [],
      detail: boundary.detail,
      scoreable: false,
    };
  }

  const presence = assessVisionerAlternativePresence(boundary.normalizedVision);
  return {
    hasAlternatives: presence.hasAlternatives,
    alternativeCount: presence.alternativeCount,
    alternatives: presence.alternatives,
    primaryGoal: presence.primaryGoal,
    scoreable: presence.hasAlternatives && presence.alternativeCount >= 1,
    detail: presence.detail,
  };
}

/**
 * NO-GO stub: block tied alternatives before scoring LLM spend (P02-B08-A01).
 */
export function checkVisionerScoringTieBreak(
  presence: VisionerScoringPresence | string,
  threshold: number = VISIONER_SCORING_TIEBREAK_THRESHOLD,
): VisionerScoringTieBreakCheck {
  const scored =
    typeof presence === "string" ? assessVisionerScoringPresence(presence) : presence;
  const tiedAlternatives = scored.alternativeCount;
  const shouldBlock = scored.hasAlternatives && tiedAlternatives >= threshold;
  return {
    shouldBlock,
    tiedAlternatives,
    threshold,
    reason: shouldBlock
      ? `${tiedAlternatives} alternatives tied at threshold ${threshold}`
      : undefined,
  };
}

export interface VisionerTradeoffRecoveryHints {
  alternatives?: string[];
  tradeoffs?: string[];
  primaryGoal?: string;
  reasoning?: string;
  confidence?: number;
}

export interface VisionerTradeoffRecoveryResult {
  recovered: boolean;
  composedVision: string;
  presence: VisionerScoringPresence;
  alternatives: string[];
  tradeoffs: string[];
  parseErrors: string[];
  detail: string;
}

const INFORMAL_TRADEOFF_LINE =
  /^(?:trade[-\s]?off|tradeoff)\s*[:=\-]\s*(.+)$/i;

const INFORMAL_SCORING_OPTION_LINE =
  /^option\s*([a-z0-9]+)(?:\s*\([^)]+\))?\s*[:=\-]\s*(.+)$/i;

/**
 * Restructure failed trade-off parse into scoreable vision with structured alternatives (P02-B08-A03).
 */
export function recoverVisionerTradeoff(
  failedParse: string,
  hints: VisionerTradeoffRecoveryHints = {},
): VisionerTradeoffRecoveryResult {
  const parseErrors: string[] = [];
  const boundary = assessVisionerScoringInputBoundary(failedParse);

  if (
    boundary.disposition === "contains_null_byte" ||
    boundary.disposition === "empty" ||
    boundary.disposition === "whitespace_only"
  ) {
    const parseError =
      boundary.disposition === "contains_null_byte"
        ? "null_byte_in_vision"
        : boundary.disposition === "empty"
          ? "empty_vision"
          : "whitespace_only_vision";
    return {
      recovered: false,
      composedVision: "",
      presence: assessVisionerScoringPresence(""),
      alternatives: [],
      tradeoffs: [],
      parseErrors: [parseError],
      detail: `cannot recover ${boundary.disposition.replace(/_/g, "-")} vision output`,
    };
  }

  const raw = boundary.acceptable ? boundary.normalizedVision : failedParse.trim();
  const initialPresence = assessVisionerScoringPresence(raw);
  const hasStructuredAlternatives =
    initialPresence.hasAlternatives &&
    /\*\*ALTERNATIVE VISION [A-Z]\*\*:/i.test(raw);

  if (hasStructuredAlternatives && initialPresence.scoreable) {
    const tradeoffs = collectTradeoffDimensions(raw);
    return {
      recovered: true,
      composedVision: raw,
      presence: initialPresence,
      alternatives: initialPresence.alternatives,
      tradeoffs,
      parseErrors,
      detail: initialPresence.detail,
    };
  }

  let alternatives = [...(hints.alternatives ?? [])];
  let tradeoffs = [...(hints.tradeoffs ?? [])];
  let primaryGoal = hints.primaryGoal;
  let reasoning = hints.reasoning;
  const confidence = hints.confidence ?? 0.78;

  const goalMatch =
    raw.match(/\*\*GOAL\*\*:\s*(.+?)(?:\n|$)/i) ??
    raw.match(/goal\s*[:=]\s*(.+?)(?:\n|$)/i);
  if (goalMatch && !primaryGoal) {
    primaryGoal = goalMatch[1].trim();
  }

  const reasoningMatch = raw.match(
    /REASONING:\s*(.+?)(?:\n(?:OUTPUT|CONFIDENCE|NEEDS_RESEARCH|trade[-\s]?off|option|alternative)|$)/is,
  );
  if (reasoningMatch && !reasoning) {
    reasoning = reasoningMatch[1].trim();
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const tradeoffMatch = trimmed.match(INFORMAL_TRADEOFF_LINE);
    if (tradeoffMatch) {
      tradeoffs.push(tradeoffMatch[1].trim());
      continue;
    }

    const optionMatch = trimmed.match(INFORMAL_SCORING_OPTION_LINE);
    if (optionMatch) {
      alternatives.push(optionMatch[2].trim());
      continue;
    }

    const looseAltMatch = trimmed.match(/^alternative\s*([a-z0-9]+)\s*[:=\-]\s*(.+)$/i);
    if (looseAltMatch) {
      alternatives.push(looseAltMatch[2].trim());
    }
  }

  alternatives = [...new Set(alternatives.map(a => a.trim()).filter(Boolean))];
  tradeoffs = [...new Set(tradeoffs.map(t => t.trim()).filter(Boolean))];

  if (tradeoffs.length === 0) {
    const vsMatch = raw.match(/(?:trade[-\s]?off|compare)\s+(.+?\s+vs\.?\s+.+?)(?:\n|$)/i);
    if (vsMatch) {
      tradeoffs.push(vsMatch[1].trim());
    }
  }

  if (alternatives.length === 0) {
    parseErrors.push("missing_scoring_alternatives");
    alternatives = ["Recovered scoring alternative pending refinement"];
  }

  if (tradeoffs.length === 0) {
    parseErrors.push("missing_tradeoff_dimensions");
    tradeoffs = ["Recovered trade-off dimensions pending refinement"];
  }

  if (!primaryGoal) {
    parseErrors.push("missing_primary_goal");
    primaryGoal = "Recovered vision goal pending trade-off scoring";
  }

  if (!reasoning) {
    reasoning =
      alternatives.length > 1
        ? "Recovered trade-off scoring input from failed parse"
        : "Recovered scoring alternative from failed parse";
  }

  const alternativeSections = alternatives
    .map((alt, index) => {
      const label = String.fromCharCode(65 + index);
      return `**ALTERNATIVE VISION ${label}**: ${alt}`;
    })
    .join("\n");

  const tradeoffSection = tradeoffs
    .map(dimension => `**TRADE-OFF**: ${dimension}`)
    .join("\n");

  const composedVision = [
    `REASONING: ${reasoning}`,
    "OUTPUT:",
    `**GOAL**: ${primaryGoal}`,
    alternativeSections,
    tradeoffSection,
    `CONFIDENCE: ${confidence}`,
    "NEEDS_RESEARCH: false",
  ].join("\n");

  const presence = assessVisionerScoringPresence(composedVision);
  const recovered =
    presence.scoreable &&
    presence.hasAlternatives &&
    presence.alternativeCount >= 1 &&
    tradeoffs.length >= 1;

  return {
    recovered,
    composedVision,
    presence,
    alternatives: presence.alternatives.length > 0 ? presence.alternatives : alternatives,
    tradeoffs,
    parseErrors,
    detail: presence.detail,
  };
}

function collectTradeoffDimensions(visionOutput: string): string[] {
  const tradeoffs: string[] = [];
  for (const line of visionOutput.split("\n")) {
    const trimmed = line.trim();
    const structuredMatch = trimmed.match(/^\*\*TRADE-OFF\*\*:\s*(.+)$/i);
    if (structuredMatch) {
      tradeoffs.push(structuredMatch[1].trim());
      continue;
    }
    const informalMatch = trimmed.match(INFORMAL_TRADEOFF_LINE);
    if (informalMatch) {
      tradeoffs.push(informalMatch[1].trim());
    }
  }
  return [...new Set(tradeoffs.filter(Boolean))];
}

export interface VisionerScoringFixtureEntry {
  id: string;
  category: VisionerScoringCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface VisionerScoringBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    visionerAlternativeProbeCount: number;
    sealedAtomCount: number;
  };
  probes: VisionerScoringFixtureEntry[];
}

export interface VisionerScoringProbeResult {
  id: string;
  category: VisionerScoringCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface VisionerScoringProbeSummary {
  total: number;
  aligned: number;
  mismatches: VisionerScoringProbeResult[];
  knownGaps: VisionerScoringProbeResult[];
  byCategory: Record<
    VisionerScoringCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface VisionerScoringValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: VisionerScoringCategory;
  detail: string;
}

export interface VisionerScoringValidationResult {
  valid: boolean;
  issues: VisionerScoringValidationIssue[];
}

export interface VisionerScoringContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: VisionerScoringCategory;
  detail: string;
}

export interface VisionerScoringContractCoverageResult {
  valid: boolean;
  issues: VisionerScoringContractCoverageIssue[];
}

export interface VisionerScoringProbeMatrixValidationIssue {
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

export interface VisionerScoringProbeMatrixValidationResult {
  valid: boolean;
  issues: VisionerScoringProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

export const VISIONER_SCORING_A01_MIN_PROBES: Readonly<
  Record<VisionerScoringCategory, number>
> = {
  scoring_versioning: 3,
  scoring_signal: 3,
  tradeoff_signal: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

export type VisionerScoringProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface VisionerScoringProbeContract {
  id: string;
  category: VisionerScoringCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: VisionerScoringProbeDisposition;
  criterion: string;
}

export interface VisionerScoringCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface VisionerScoringCategoryContract {
  category: VisionerScoringCategory;
  acceptance: VisionerScoringCategoryAcceptance;
  probes: readonly VisionerScoringProbeContract[];
}

export interface VisionerScoringContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<VisionerScoringCategory, VisionerScoringCategoryContract>;
  probes: readonly VisionerScoringProbeContract[];
}

function flattenVisionerScoringCategoryProbes(
  categories: Record<VisionerScoringCategory, VisionerScoringCategoryContract>,
): readonly VisionerScoringProbeContract[] {
  return VISIONER_SCORING_CATEGORIES.flatMap(category => categories[category].probes);
}

const VISIONER_SCORING_CATEGORY_CONTRACTS: Record<
  VisionerScoringCategory,
  VisionerScoringCategoryContract
> = {
  scoring_versioning: {
    category: "scoring_versioning",
    acceptance: {
      invariant:
        "Visioner scoring baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vsco.version_tagged",
        category: "scoring_versioning",
        description: "Visioner scoring baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner scoring baseline declares semver version field",
      },
      {
        id: "vsco.atom_tagged",
        category: "scoring_versioning",
        description: "Visioner scoring baseline declares P02-B08-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner scoring baseline declares P02-B08-A01 atom id",
      },
      {
        id: "vsco.harness_version_exported",
        category: "scoring_versioning",
        description: "FORGE_VISIONER_SCORING_VERSION exported for scoring harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_VISIONER_SCORING_VERSION exported for scoring harness",
      },
    ],
  },
  scoring_signal: {
    category: "scoring_signal",
    acceptance: {
      invariant:
        "Alternative presence and B07 handoff prerequisites anchor vision scoring entry.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vsco.alternative_presence_wired",
        category: "scoring_signal",
        description:
          "assessVisionerScoringPresence detects alternatives prerequisite for scoring input",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessVisionerScoringPresence detects alternatives prerequisite for scoring input",
      },
      {
        id: "vsco.orchestrator_vision_before_decompose",
        category: "scoring_signal",
        description:
          "Orchestrator stores primary visionOutput string before decomposition for scoring context",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Orchestrator stores primary visionOutput string before decomposition for scoring context",
      },
      {
        id: "vsco.b07_handoff_prerequisite",
        category: "scoring_signal",
        description:
          "FORGE_P02_B07_TO_B08_HANDOFF requires sealed visioner alternative record before scoring entry",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "FORGE_P02_B07_TO_B08_HANDOFF requires sealed visioner alternative record before scoring entry",
      },
    ],
  },
  tradeoff_signal: {
    category: "tradeoff_signal",
    acceptance: {
      invariant:
        "Trade-off language in prompts and typed scoring presence detection are observable.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vsco.prompt_tradeoff_language",
        category: "tradeoff_signal",
        description: "VISIONER_SYSTEM prompt declares trade-off analysis language",
        expected: "PASS",
        disposition: "observed",
        criterion: "VISIONER_SYSTEM prompt declares trade-off analysis language",
      },
      {
        id: "vsco.assess_scoring_presence",
        category: "tradeoff_signal",
        description:
          "assessVisionerScoringPresence exports typed scoreable alternative detection from vision output",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessVisionerScoringPresence exports typed scoreable alternative detection from vision output",
      },
      {
        id: "vsco.parse_vision_without_scores",
        category: "tradeoff_signal",
        description: "parseVisionResponse extracts primary vision fields without score array",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseVisionResponse extracts primary vision fields without score array",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant: "P02-B07 block gate handoff targets P02-B08-A01 with sealed alternative probe count.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vsco.b07_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P02_B07_TO_B08_HANDOFF_V1 targets P02-B08-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P02_B07_TO_B08_HANDOFF_V1 targets P02-B08-A01 entry atom",
      },
      {
        id: "vsco.b07_sealed_alternative_probes",
        category: "baseline_link",
        description:
          "P02-B07→B08 handoff sealed probeCount matches active visioner alternative contract",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "P02-B07→B08 handoff sealed probeCount matches active visioner alternative contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Baseline fixture references sealed B07 gate; probe runner exported; known gaps documented; input boundaries enforced.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vsco.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P02-B07 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P02-B07 block gate source artifacts",
      },
      {
        id: "vsco.probe_runner_exported",
        category: "boundary",
        description: "runVisionerScoringProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runVisionerScoringProbes executes contract-wired probe matrix",
      },
      {
        id: "vsco.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL scoring gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL scoring gap",
      },
      {
        id: "vsco.empty_vision_scoring_boundary",
        category: "boundary",
        description: "assessVisionerScoringInputBoundary rejects empty vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerScoringInputBoundary rejects empty vision output",
      },
      {
        id: "vsco.whitespace_vision_boundary",
        category: "boundary",
        description: "assessVisionerScoringInputBoundary rejects whitespace-only vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerScoringInputBoundary rejects whitespace-only vision output",
      },
      {
        id: "vsco.long_vision_truncation_boundary",
        category: "boundary",
        description: "assessVisionerScoringInputBoundary truncates vision exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerScoringInputBoundary truncates vision exceeding max length",
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
        id: "vsco.invalid_version_rejected",
        category: "failure_path",
        description: "validateVisionerScoringBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateVisionerScoringBaseline rejects unexpected fixture version",
      },
      {
        id: "vsco.malformed_vision_scoring_guard",
        category: "failure_path",
        description: "assessVisionerScoringPresence rejects null-byte vision output safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessVisionerScoringPresence rejects null-byte vision output safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Checkpoint resume preserves vision; recoverVisionerTradeoff restructures failed trade-off parse.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vsco.vision_checkpoint_scoring",
        category: "recovery_path",
        description:
          "Pipeline resume reuses checkpoint primary vision output without scoring fan-out",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "Pipeline resume reuses checkpoint primary vision output without scoring fan-out",
      },
      {
        id: "vsco.structured_tradeoff_recovery",
        category: "recovery_path",
        description:
          "recoverVisionerTradeoff restructures failed trade-off parse into actionable scoring input",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "recoverVisionerTradeoff restructures failed trade-off parse into actionable scoring input",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Tie-break NO-GO gate and alternative clarification guard scoring LLM spend.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vsco.scoring_tiebreak_nogo",
        category: "nogo_path",
        description:
          "checkVisionerScoringTieBreak NO-GO gate blocks tied alternatives before scoring spend",
        expected: "PASS",
        disposition: "nogo",
        criterion:
          "checkVisionerScoringTieBreak NO-GO gate blocks tied alternatives before scoring spend",
      },
      {
        id: "vsco.alternative_clarification_nogo",
        category: "nogo_path",
        description:
          "assessVisionerAlternativePresence flags clarification need before scoring spend",
        expected: "PASS",
        disposition: "nogo",
        criterion:
          "assessVisionerAlternativePresence flags clarification need before scoring spend",
      },
    ],
  },
};

export const FORGE_VISIONER_SCORING_CONTRACT_V1: VisionerScoringContract = {
  version: "1.0.0",
  atom: "P02-B08-A06",
  purpose:
    "Typed visioner scoring contract declaring measurable alternative, trade-off and guard probes.",
  categories: VISIONER_SCORING_CATEGORY_CONTRACTS,
  probes: flattenVisionerScoringCategoryProbes(VISIONER_SCORING_CATEGORY_CONTRACTS),
};

export const EXPECTED_P02_B07_SEALED_ATOM_COUNT = 10;

export function getActiveVisionerScoringContract(): VisionerScoringContract {
  return FORGE_VISIONER_SCORING_CONTRACT_V1;
}

export function summarizeVisionerScoringContractCoverage(
  contract: VisionerScoringContract = getActiveVisionerScoringContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<VisionerScoringCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<VisionerScoringProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    VisionerScoringCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<VisionerScoringProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of VISIONER_SCORING_CATEGORIES) {
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

export function getVisionerScoringCategoryContract(
  category: VisionerScoringCategory,
  contract: VisionerScoringContract = getActiveVisionerScoringContract(),
): VisionerScoringCategoryContract {
  return contract.categories[category];
}

export function listVisionerScoringContractProbeIds(
  contract: VisionerScoringContract = getActiveVisionerScoringContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listVisionerScoringProbesByDisposition(
  disposition: VisionerScoringProbeDisposition,
  contract: VisionerScoringContract = getActiveVisionerScoringContract(),
): VisionerScoringProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listVisionerScoringContractProbesByCategory(
  category: VisionerScoringCategory,
  contract: VisionerScoringContract = getActiveVisionerScoringContract(),
): readonly VisionerScoringProbeContract[] {
  return contract.categories[category].probes;
}

export function validateVisionerScoringContractCoverage(
  contract: VisionerScoringContract = getActiveVisionerScoringContract(),
): VisionerScoringContractCoverageResult {
  const issues: VisionerScoringContractCoverageIssue[] = [];

  for (const category of VISIONER_SCORING_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < VISIONER_SCORING_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${VISIONER_SCORING_A01_MIN_PROBES[category]}`,
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

  const ids = listVisionerScoringContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeVisionerScoringContractCoverage(contract);
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
    if (!probe.id.startsWith("vsco.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing vsco. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Validate probe matrix against typed contract — A02 contract gate.
 * PASS probes must align; documented FAIL gaps must remain aligned (actual === FAIL).
 */
export function validateVisionerScoringProbeMatrix(
  results: VisionerScoringProbeResult[],
  contract: VisionerScoringContract = getActiveVisionerScoringContract(),
): VisionerScoringProbeMatrixValidationResult {
  const issues: VisionerScoringProbeMatrixValidationIssue[] = [];
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
 * Validate boundary-category probe matrix — A04 slice gate.
 * Only boundary probes are evaluated; zero unexpected mismatches required.
 */
export function validateVisionerScoringBoundaryProbeMatrix(
  results: VisionerScoringProbeResult[],
  contract: VisionerScoringContract = getActiveVisionerScoringContract(),
): VisionerScoringProbeMatrixValidationResult {
  const boundaryProbes = listVisionerScoringContractProbesByCategory("boundary", contract);
  const boundaryContract: VisionerScoringContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateVisionerScoringProbeMatrix(boundaryResults, boundaryContract);
}

export const VISIONER_SCORING_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly VisionerScoringCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes and documented FAIL gaps must align; zero unexpected mismatches.
 */
export function validateVisionerScoringFailureRecoveryProbeMatrix(
  results: VisionerScoringProbeResult[],
  contract: VisionerScoringContract = getActiveVisionerScoringContract(),
): VisionerScoringProbeMatrixValidationResult {
  const failureRecoveryProbes = VISIONER_SCORING_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listVisionerScoringContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: VisionerScoringContract = {
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
  return validateVisionerScoringProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listVisionerScoringFailureRecoveryProbeIds(
  contract: VisionerScoringContract = getActiveVisionerScoringContract(),
): string[] {
  return VISIONER_SCORING_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listVisionerScoringContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export function validateVisionerScoringAgainstContract(
  fixture: VisionerScoringBaseline,
  contract: VisionerScoringContract = getActiveVisionerScoringContract(),
): VisionerScoringValidationResult {
  const issues: VisionerScoringValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of VISIONER_SCORING_CATEGORIES) {
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

export function buildDefaultSourceBlockGate(): VisionerScoringBaseline["sourceBlockGate"] {
  const handoff = getForgeP02B07ToB08Handoff();
  const coverage = summarizeVisionerAlternativeContractCoverage(getActiveVisionerAlternativeContract());
  return {
    version: handoff.version,
    atom: handoff.atom,
    contractVersion: handoff.version,
    visionerAlternativeProbeCount: coverage.totalProbes,
    sealedAtomCount: EXPECTED_P02_B07_SEALED_ATOM_COUNT,
  };
}

export function validateVisionerScoringBaseline(
  fixture: VisionerScoringBaseline,
): VisionerScoringValidationResult {
  const issues: VisionerScoringValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P02-B08-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    VISIONER_SCORING_CATEGORIES.map(category => [category, 0]),
  ) as Record<VisionerScoringCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of VISIONER_SCORING_CATEGORIES) {
    const min = VISIONER_SCORING_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP02B07ToB08Handoff();
  const alternativeCoverage = summarizeVisionerAlternativeContractCoverage(
    getActiveVisionerAlternativeContract(),
  );

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (
    fixture.sourceBlockGate.visionerAlternativeProbeCount !== alternativeCoverage.totalProbes
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.visionerAlternativeProbeCount=${fixture.sourceBlockGate.visionerAlternativeProbeCount} ` +
        `contract=${alternativeCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P02_B07_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P02_B07_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P02_B07_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B07 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P02_B07_SEALED_ATOM_COUNT}`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  const contract = getActiveVisionerScoringContract();
  const expectedFailCount = contract.probes.filter(p => p.expected === "FAIL").length;
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_category",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${expectedFailCount}`,
    });
  }

  const contractAlignment = validateVisionerScoringAgainstContract(
    fixture,
    getActiveVisionerScoringContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeVisionerScoringMatrix(
  results: VisionerScoringProbeResult[],
): VisionerScoringProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as VisionerScoringProbeSummary["byCategory"];
  for (const category of VISIONER_SCORING_CATEGORIES) {
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

export function listVisionerScoringProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerScoringBaseline,
): VisionerScoringFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listVisionerScoringKnownGaps(
  results: VisionerScoringProbeResult[],
): VisionerScoringProbeResult[] {
  return summarizeVisionerScoringMatrix(results).knownGaps;
}

/** Per-probe evidence artifact — disposition, criterion and aligned outcomes (P02-B08-A06). */
export interface VisionerScoringProbeEvidence {
  probeId: string;
  category: VisionerScoringCategory;
  disposition: VisionerScoringProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for visioner scoring runs (P02-B08-A06). */
export interface VisionerScoringProbeTelemetry {
  probeId: string;
  category: VisionerScoringCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P02-B08-A06). */
export interface VisionerScoringProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourceBlockGateVersion: string;
  sourceBlockGateAtom: string;
  /** Slice atom when record covers a subset (e.g. failure/recovery gate). */
  sliceAtom?: string;
  /** Categories included when sliceAtom is set. */
  sliceCategories?: readonly VisionerScoringCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated visioner scoring run record bundling evidence, telemetry and provenance. */
export interface VisionerScoringRunRecord {
  provenance: VisionerScoringProvenance;
  evidence: VisionerScoringProbeEvidence[];
  telemetry: VisionerScoringProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<VisionerScoringCategory, number>;
    byDisposition: Record<VisionerScoringProbeDisposition, number>;
  };
}

export interface VisionerScoringRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface VisionerScoringRunValidationResult {
  valid: boolean;
  issues: VisionerScoringRunValidationIssue[];
}

export function buildVisionerScoringProbeEvidence(
  probeId: string,
  category: VisionerScoringCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: VisionerScoringProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): VisionerScoringProbeEvidence {
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

export function buildVisionerScoringProbeTelemetry(
  probeId: string,
  category: VisionerScoringCategory,
  sequenceIndex: number,
  durationMs: number,
): VisionerScoringProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildVisionerScoringProvenance(
  runId: string,
  fixture: VisionerScoringBaseline,
  contract: VisionerScoringContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly VisionerScoringCategory[];
  },
): VisionerScoringProvenance {
  return {
    runId,
    harnessVersion: FORGE_VISIONER_SCORING_VERSION,
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

export function buildVisionerScoringRunRecord(
  provenance: VisionerScoringProvenance,
  evidence: VisionerScoringProbeEvidence[],
  telemetry: VisionerScoringProbeTelemetry[],
): VisionerScoringRunRecord {
  const byCategory = {} as Record<VisionerScoringCategory, number>;
  const byDisposition: Record<VisionerScoringProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of VISIONER_SCORING_CATEGORIES) {
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

function validateVisionerScoringRunRecordAgainstProbeIds(
  record: VisionerScoringRunRecord,
  expectedProbeIds: string[],
  contract: VisionerScoringContract,
): VisionerScoringRunValidationResult {
  const issues: VisionerScoringRunValidationIssue[] = [];
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

export function validateVisionerScoringRunRecord(
  record: VisionerScoringRunRecord,
  contract: VisionerScoringContract = getActiveVisionerScoringContract(),
): VisionerScoringRunValidationResult {
  return validateVisionerScoringRunRecordAgainstProbeIds(
    record,
    listVisionerScoringContractProbeIds(contract),
    contract,
  );
}

/** Validate failure/recovery slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateVisionerScoringFailureRecoveryRunRecord(
  record: VisionerScoringRunRecord,
  contract: VisionerScoringContract = getActiveVisionerScoringContract(),
): VisionerScoringRunValidationResult {
  const issues: VisionerScoringRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P02-B08-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P02-B08-A06`,
    });
  }

  const expectedCategories = [...VISIONER_SCORING_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateVisionerScoringRunRecordAgainstProbeIds(
    record,
    listVisionerScoringFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

/** Sample vision with explicit alternatives for scoring presence probes. */
export const SAMPLE_VISION_FOR_SCORING = `REASONING: Two viable product directions for trade-off scoring
OUTPUT:
**GOAL**: Dental clinic platform
**ALTERNATIVE VISION A**: Premium concierge booking experience
**ALTERNATIVE VISION B**: Self-serve patient portal
CONFIDENCE: 0.78
NEEDS_RESEARCH: false`;
