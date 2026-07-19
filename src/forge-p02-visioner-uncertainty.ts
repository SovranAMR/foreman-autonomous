/**
 * FOREMAN — Visioner Uncertainty & Clarification Policy Baseline (P02-B06)
 *
 * Measures CONFIDENCE threshold signals, clarification policy wiring and low-confidence BLOCK
 * on sealed P02-B05 visioner research trigger block gate artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP02B05ToB06Handoff,
  getActiveVisionerResearchTriggerContract,
  summarizeVisionerResearchTriggerContractCoverage,
} from "./forge-p02-visioner-research-trigger.js";

export const FORGE_VISIONER_UNCERTAINTY_VERSION = "1.0.0-a01";

/** Maximum normalized vision length before truncation (P02-B06-A01 boundary). */
export const VISIONER_UNCERTAINTY_VISION_MAX_LENGTH = 32000;

/** Confidence below this threshold signals clarification need (P02-B06-A01). */
export const VISIONER_UNCERTAINTY_CLARIFICATION_THRESHOLD = 0.7;

export const VISIONER_UNCERTAINTY_CATEGORIES = [
  "uncertainty_versioning",
  "uncertainty_signal",
  "clarification_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type VisionerUncertaintyCategory = (typeof VISIONER_UNCERTAINTY_CATEGORIES)[number];

export type VisionerUncertaintyInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface VisionerUncertaintyInputBoundary {
  disposition: VisionerUncertaintyInputDisposition;
  acceptable: boolean;
  normalizedVision: string;
  truncated: boolean;
  detail: string;
}

export interface VisionerUncertaintyPresence {
  hasConfidence: boolean;
  confidence: number;
  needsClarification: boolean;
  clarificationThreshold: number;
  detail: string;
}

export interface VisionerUncertaintyClarificationRecoveryHints {
  confidence?: number;
  reasoning?: string;
  output?: string;
  clarificationRequest?: string;
}

export interface VisionerUncertaintyClarificationRecoveryResult {
  recovered: boolean;
  composedVision: string;
  presence: VisionerUncertaintyPresence;
  clarificationRequest: string;
  parseErrors: string[];
  detail: string;
}

/**
 * Assess vision output boundary conditions — empty, whitespace-only, null bytes, max length (P02-B06-A01).
 */
export function assessVisionerUncertaintyInputBoundary(
  visionOutput: string,
): VisionerUncertaintyInputBoundary {
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
    const disposition: VisionerUncertaintyInputDisposition =
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
  if (normalizedVision.length > VISIONER_UNCERTAINTY_VISION_MAX_LENGTH) {
    normalizedVision = normalizedVision.slice(0, VISIONER_UNCERTAINTY_VISION_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedVision,
    truncated,
    detail: truncated
      ? `vision truncated to ${VISIONER_UNCERTAINTY_VISION_MAX_LENGTH} characters`
      : "valid vision output",
  };
}

/**
 * Assess whether vision output declares CONFIDENCE and triggers clarification need (P02-B06-A01).
 */
export function assessVisionerUncertaintyPresence(
  visionOutput: string,
  threshold: number = VISIONER_UNCERTAINTY_CLARIFICATION_THRESHOLD,
): VisionerUncertaintyPresence {
  const boundary = assessVisionerUncertaintyInputBoundary(visionOutput);
  if (!boundary.acceptable) {
    return {
      hasConfidence: false,
      confidence: 0,
      needsClarification: true,
      clarificationThreshold: threshold,
      detail: boundary.detail,
    };
  }

  const text = boundary.normalizedVision;
  const confidenceMatch = text.match(/CONFIDENCE:\s*([0-9]*\.?[0-9]+)/i);
  const hasConfidence = confidenceMatch !== null;
  const confidence = hasConfidence ? Number.parseFloat(confidenceMatch[1]) : 0.7;
  const needsClarification = hasConfidence ? confidence < threshold : false;

  return {
    hasConfidence,
    confidence,
    needsClarification,
    clarificationThreshold: threshold,
    detail:
      `confidence=${confidence.toFixed(2)}, needsClarification=${needsClarification}` +
      (hasConfidence ? "" : " (defaulted)"),
  };
}

/**
 * Restructure failed clarification parse into actionable request (P02-B06-A03).
 */
export function recoverVisionerUncertaintyClarification(
  failedParse: string,
  hints: VisionerUncertaintyClarificationRecoveryHints = {},
): VisionerUncertaintyClarificationRecoveryResult {
  const parseErrors: string[] = [];
  const boundary = assessVisionerUncertaintyInputBoundary(failedParse);

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
      presence: assessVisionerUncertaintyPresence(""),
      clarificationRequest: "",
      parseErrors: [parseError],
      detail: `cannot recover ${boundary.disposition.replace(/_/g, "-")} vision output`,
    };
  }

  const raw = boundary.acceptable ? boundary.normalizedVision : failedParse.trim();
  const initialPresence = assessVisionerUncertaintyPresence(raw);

  if (
    initialPresence.hasConfidence &&
    initialPresence.needsClarification &&
    /CLARIFICATION REQUEST/i.test(raw)
  ) {
    const clarificationMatch = raw.match(
      /\*\*CLARIFICATION REQUEST\*\*:\s*(.+?)(?:\n(?:CONFIDENCE|NEEDS_RESEARCH)|$)/is,
    );
    return {
      recovered: true,
      composedVision: raw,
      presence: initialPresence,
      clarificationRequest: clarificationMatch?.[1]?.trim() ?? "",
      parseErrors,
      detail: initialPresence.detail,
    };
  }

  let confidence = hints.confidence ?? initialPresence.confidence;
  let reasoning = hints.reasoning;
  let output = hints.output;
  let clarificationRequest = hints.clarificationRequest ?? "";

  const informalConfidenceMatch =
    raw.match(/CONFIDENCE:\s*([0-9]*\.?[0-9]+)/i) ??
    raw.match(/confidence\s*[:=]\s*([0-9]*\.?[0-9]+)/i);
  if (informalConfidenceMatch) {
    confidence = Number.parseFloat(informalConfidenceMatch[1]);
  }

  const reasoningMatch = raw.match(
    /REASONING:\s*(.+?)(?:\n(?:OUTPUT|CONFIDENCE|NEEDS_RESEARCH)|$)/is,
  );
  if (reasoningMatch && !reasoning) {
    reasoning = reasoningMatch[1].trim();
  }

  const outputMatch = raw.match(
    /OUTPUT:\s*(.+?)(?:\n(?:CONFIDENCE|NEEDS_RESEARCH|need clarification|uncertain)|$)/is,
  );
  if (outputMatch && !output) {
    output = outputMatch[1].trim();
  }

  const clarificationMatch =
    raw.match(/\*\*CLARIFICATION REQUEST\*\*:\s*(.+?)(?:\n|$)/is) ??
    raw.match(/clarification[_\s-]?(?:request|needed|question)\s*[:=]\s*(.+?)(?:\n|$)/i) ??
    raw.match(/need(?:s)?\s+clarification\s*[:=]\s*(.+?)(?:\n|$)/i);
  if (clarificationMatch && !clarificationRequest) {
    clarificationRequest = clarificationMatch[1].trim();
  }

  if (!clarificationRequest) {
    const uncertainLines = raw
      .split("\n")
      .map(line => line.trim())
      .filter(
        line =>
          /uncertain|unclear|ambiguous|need(?:s)? clarification|what (?:is|are)|which /i.test(
            line,
          ) &&
          !/REASONING:|OUTPUT:|CONFIDENCE:|NEEDS_RESEARCH:/i.test(line),
      );
    if (uncertainLines.length > 0) {
      clarificationRequest = uncertainLines
        .map(line => line.replace(/^[-*\s]+/, "").trim())
        .join("; ");
    }
  }

  if (confidence >= VISIONER_UNCERTAINTY_CLARIFICATION_THRESHOLD && !clarificationRequest) {
    confidence = VISIONER_UNCERTAINTY_CLARIFICATION_THRESHOLD - 0.05;
    parseErrors.push("missing_clarification_request");
  }

  if (!clarificationRequest) {
    parseErrors.push("missing_clarification_request");
    clarificationRequest = "Specify scope, success metrics, and constraints before vision proceeds";
  }

  if (!reasoning) {
    reasoning = clarificationRequest
      ? "Recovered clarification request from failed parse"
      : "Recovered vision output from failed parse";
  }
  if (!output) {
    output = "**GOAL**: Recovered vision output pending clarification";
  }

  const composedVision = [
    `REASONING: ${reasoning}`,
    `OUTPUT:\n${output}`,
    `**CLARIFICATION REQUEST**: ${clarificationRequest}`,
    `CONFIDENCE: ${confidence}`,
  ].join("\n");

  const presence = assessVisionerUncertaintyPresence(composedVision);
  const recovered =
    presence.hasConfidence &&
    presence.needsClarification &&
    presence.confidence < VISIONER_UNCERTAINTY_CLARIFICATION_THRESHOLD &&
    clarificationRequest.length > 0;

  return {
    recovered,
    composedVision,
    presence,
    clarificationRequest,
    parseErrors,
    detail: presence.detail,
  };
}

export interface VisionerUncertaintyProbeMatrixValidationIssue {
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

export interface VisionerUncertaintyProbeMatrixValidationResult {
  valid: boolean;
  issues: VisionerUncertaintyProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

export function validateVisionerUncertaintyProbeMatrix(
  results: VisionerUncertaintyProbeResult[],
  contract: VisionerUncertaintyContract = getActiveVisionerUncertaintyContract(),
): VisionerUncertaintyProbeMatrixValidationResult {
  const issues: VisionerUncertaintyProbeMatrixValidationIssue[] = [];
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
export function validateVisionerUncertaintyBoundaryProbeMatrix(
  results: VisionerUncertaintyProbeResult[],
  contract: VisionerUncertaintyContract = getActiveVisionerUncertaintyContract(),
): VisionerUncertaintyProbeMatrixValidationResult {
  const boundaryProbes = listVisionerUncertaintyContractProbesByCategory("boundary", contract);
  const boundaryContract: VisionerUncertaintyContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateVisionerUncertaintyProbeMatrix(boundaryResults, boundaryContract);
}

export interface VisionerUncertaintyFixtureEntry {
  id: string;
  category: VisionerUncertaintyCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface VisionerUncertaintyBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    visionerResearchTriggerProbeCount: number;
    sealedAtomCount: number;
  };
  probes: VisionerUncertaintyFixtureEntry[];
}

export interface VisionerUncertaintyProbeResult {
  id: string;
  category: VisionerUncertaintyCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface VisionerUncertaintyProbeSummary {
  total: number;
  aligned: number;
  mismatches: VisionerUncertaintyProbeResult[];
  knownGaps: VisionerUncertaintyProbeResult[];
  byCategory: Record<
    VisionerUncertaintyCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface VisionerUncertaintyValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: VisionerUncertaintyCategory;
  detail: string;
}

export interface VisionerUncertaintyValidationResult {
  valid: boolean;
  issues: VisionerUncertaintyValidationIssue[];
}

export interface VisionerUncertaintyContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: VisionerUncertaintyCategory;
  detail: string;
}

export interface VisionerUncertaintyContractCoverageResult {
  valid: boolean;
  issues: VisionerUncertaintyContractCoverageIssue[];
}

export type VisionerUncertaintyProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface VisionerUncertaintyProbeContract {
  id: string;
  category: VisionerUncertaintyCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: VisionerUncertaintyProbeDisposition;
  criterion: string;
}

export interface VisionerUncertaintyCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface VisionerUncertaintyCategoryContract {
  category: VisionerUncertaintyCategory;
  acceptance: VisionerUncertaintyCategoryAcceptance;
  probes: readonly VisionerUncertaintyProbeContract[];
}

export interface VisionerUncertaintyContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<VisionerUncertaintyCategory, VisionerUncertaintyCategoryContract>;
  probes: readonly VisionerUncertaintyProbeContract[];
}

export const VISIONER_UNCERTAINTY_A01_MIN_PROBES: Readonly<
  Record<VisionerUncertaintyCategory, number>
> = {
  uncertainty_versioning: 3,
  uncertainty_signal: 3,
  clarification_signal: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

function flattenVisionerUncertaintyCategoryProbes(
  categories: Record<VisionerUncertaintyCategory, VisionerUncertaintyCategoryContract>,
): readonly VisionerUncertaintyProbeContract[] {
  return VISIONER_UNCERTAINTY_CATEGORIES.flatMap(category => categories[category].probes);
}

const VISIONER_UNCERTAINTY_CATEGORY_CONTRACTS: Record<
  VisionerUncertaintyCategory,
  VisionerUncertaintyCategoryContract
> = {
  uncertainty_versioning: {
    category: "uncertainty_versioning",
    acceptance: {
      invariant:
        "Visioner uncertainty baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vunc.version_tagged",
        category: "uncertainty_versioning",
        description: "Visioner uncertainty baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner uncertainty baseline declares semver version field",
      },
      {
        id: "vunc.atom_tagged",
        category: "uncertainty_versioning",
        description: "Visioner uncertainty baseline declares P02-B06-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner uncertainty baseline declares P02-B06-A01 atom id",
      },
      {
        id: "vunc.harness_version_exported",
        category: "uncertainty_versioning",
        description: "FORGE_VISIONER_UNCERTAINTY_VERSION exported for uncertainty harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_VISIONER_UNCERTAINTY_VERSION exported for uncertainty harness",
      },
    ],
  },
  uncertainty_signal: {
    category: "uncertainty_signal",
    acceptance: {
      invariant:
        "Visioner prompt, parser and engine expose CONFIDENCE uncertainty signal wiring.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vunc.prompt_confidence_field",
        category: "uncertainty_signal",
        description: "VISIONER_SYSTEM prompt declares CONFIDENCE output field",
        expected: "PASS",
        disposition: "observed",
        criterion: "VISIONER_SYSTEM prompt declares CONFIDENCE output field",
      },
      {
        id: "vunc.parser_confidence_extract",
        category: "uncertainty_signal",
        description: "parseVisionResponse extracts CONFIDENCE numeric score from vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseVisionResponse extracts CONFIDENCE numeric score from vision output",
      },
      {
        id: "vunc.engine_visioner_confidence_threshold",
        category: "uncertainty_signal",
        description: "Engine declares visioner warn/block confidence thresholds",
        expected: "PASS",
        disposition: "observed",
        criterion: "Engine declares visioner warn/block confidence thresholds",
      },
    ],
  },
  clarification_signal: {
    category: "clarification_signal",
    acceptance: {
      invariant:
        "Visioner uncertainty guidance, presence assessment and orchestrator low-confidence block wired.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vunc.visioner_uncertainty_guidance",
        category: "clarification_signal",
        description: "VISIONER_SYSTEM prompt instructs visioner to explain uncertainty below 0.7 confidence",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "VISIONER_SYSTEM prompt instructs visioner to explain uncertainty below 0.7 confidence",
      },
      {
        id: "vunc.assess_uncertainty_presence",
        category: "clarification_signal",
        description:
          "assessVisionerUncertaintyPresence detects confidence and clarification need in vision output",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessVisionerUncertaintyPresence detects confidence and clarification need in vision output",
      },
      {
        id: "vunc.orchestrator_low_confidence_block",
        category: "clarification_signal",
        description:
          "Orchestrator checkBlock emits block_detected when engine confidence level is block",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Orchestrator checkBlock emits block_detected when engine confidence level is block",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Uncertainty baseline links to sealed P02-B05 block gate and visioner research trigger handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vunc.b05_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P02_B05_TO_B06_HANDOFF_V1 targets P02-B06-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P02_B05_TO_B06_HANDOFF_V1 targets P02-B06-A01 entry atom",
      },
      {
        id: "vunc.b05_sealed_research_trigger_probes",
        category: "baseline_link",
        description:
          "P02-B05→B06 handoff sealed probeCount matches active visioner research trigger contract",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "P02-B05→B06 handoff sealed probeCount matches active visioner research trigger contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Vision output boundary assessment handles empty, whitespace-only and oversized inputs; probe runner and documented gaps wired.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vunc.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P02-B05 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P02-B05 block gate source artifacts",
      },
      {
        id: "vunc.probe_runner_exported",
        category: "boundary",
        description: "runVisionerUncertaintyProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runVisionerUncertaintyProbes executes contract-wired probe matrix",
      },
      {
        id: "vunc.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL uncertainty gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL uncertainty gap",
      },
      {
        id: "vunc.empty_vision_uncertainty_presence",
        category: "boundary",
        description: "assessVisionerUncertaintyInputBoundary rejects empty vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerUncertaintyInputBoundary rejects empty vision output",
      },
      {
        id: "vunc.whitespace_vision_boundary",
        category: "boundary",
        description: "assessVisionerUncertaintyInputBoundary rejects whitespace-only vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerUncertaintyInputBoundary rejects whitespace-only vision output",
      },
      {
        id: "vunc.long_vision_truncation_boundary",
        category: "boundary",
        description: "assessVisionerUncertaintyInputBoundary truncates vision exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerUncertaintyInputBoundary truncates vision exceeding max length",
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
        id: "vunc.invalid_version_rejected",
        category: "failure_path",
        description: "validateVisionerUncertaintyBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateVisionerUncertaintyBaseline rejects unexpected fixture version",
      },
      {
        id: "vunc.malformed_vision_uncertainty_guard",
        category: "failure_path",
        description: "assessVisionerUncertaintyPresence rejects null-byte vision output safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessVisionerUncertaintyPresence rejects null-byte vision output safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Checkpoint resume preserves confidence wiring; recoverVisionerUncertaintyClarification restructures failed parse.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vunc.vision_checkpoint_uncertainty_wiring",
        category: "recovery_path",
        description:
          "Pipeline resume reuses checkpoint vision output while preserving confidence wiring",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "Pipeline resume reuses checkpoint vision output while preserving confidence wiring",
      },
      {
        id: "vunc.structured_clarification_recovery",
        category: "recovery_path",
        description:
          "recoverVisionerUncertaintyClarification restructures failed clarification parse into actionable request",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "recoverVisionerUncertaintyClarification restructures failed clarification parse into actionable request",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Orchestrator blocks low-confidence vision; intent ambiguity NO-GO gate blocks before vision spend.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vunc.visioner_confidence_block_gate",
        category: "nogo_path",
        description:
          "Orchestrator checkBlock blocks vision phase when confidence evaluateConfidence returns block",
        expected: "PASS",
        disposition: "nogo",
        criterion:
          "Orchestrator checkBlock blocks vision phase when confidence evaluateConfidence returns block",
      },
      {
        id: "vunc.intent_ambiguity_nogo",
        category: "nogo_path",
        description:
          "checkVisionerIntentAmbiguity NO-GO gate blocks ambiguous tasks before vision spend",
        expected: "PASS",
        disposition: "nogo",
        criterion:
          "checkVisionerIntentAmbiguity NO-GO gate blocks ambiguous tasks before vision spend",
      },
    ],
  },
};

export const FORGE_VISIONER_UNCERTAINTY_CONTRACT_V1: VisionerUncertaintyContract = {
  version: "1.0.0",
  atom: "P02-B06-A06",
  purpose:
    "Typed visioner uncertainty and clarification contract declaring measurable confidence, clarification and guard probes.",
  categories: VISIONER_UNCERTAINTY_CATEGORY_CONTRACTS,
  probes: flattenVisionerUncertaintyCategoryProbes(VISIONER_UNCERTAINTY_CATEGORY_CONTRACTS),
};

export const EXPECTED_P02_B05_SEALED_ATOM_COUNT = 10;

export function getActiveVisionerUncertaintyContract(): VisionerUncertaintyContract {
  return FORGE_VISIONER_UNCERTAINTY_CONTRACT_V1;
}

export function getVisionerUncertaintyCategoryContract(
  category: VisionerUncertaintyCategory,
  contract: VisionerUncertaintyContract = getActiveVisionerUncertaintyContract(),
): VisionerUncertaintyCategoryContract {
  return contract.categories[category];
}

export function listVisionerUncertaintyContractProbeIds(
  contract: VisionerUncertaintyContract = getActiveVisionerUncertaintyContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listVisionerUncertaintyProbesByDisposition(
  disposition: VisionerUncertaintyProbeDisposition,
  contract: VisionerUncertaintyContract = getActiveVisionerUncertaintyContract(),
): VisionerUncertaintyProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listVisionerUncertaintyContractProbesByCategory(
  category: VisionerUncertaintyCategory,
  contract: VisionerUncertaintyContract = getActiveVisionerUncertaintyContract(),
): readonly VisionerUncertaintyProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeVisionerUncertaintyContractCoverage(
  contract: VisionerUncertaintyContract = getActiveVisionerUncertaintyContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<VisionerUncertaintyCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<VisionerUncertaintyProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    VisionerUncertaintyCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<VisionerUncertaintyProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of VISIONER_UNCERTAINTY_CATEGORIES) {
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

export function validateVisionerUncertaintyContractCoverage(
  contract: VisionerUncertaintyContract = getActiveVisionerUncertaintyContract(),
): VisionerUncertaintyContractCoverageResult {
  const issues: VisionerUncertaintyContractCoverageIssue[] = [];

  for (const category of VISIONER_UNCERTAINTY_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < VISIONER_UNCERTAINTY_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${VISIONER_UNCERTAINTY_A01_MIN_PROBES[category]}`,
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

  const ids = listVisionerUncertaintyContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeVisionerUncertaintyContractCoverage(contract);
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
    if (!probe.id.startsWith("vunc.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing vunc. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateVisionerUncertaintyAgainstContract(
  fixture: VisionerUncertaintyBaseline,
  contract: VisionerUncertaintyContract = getActiveVisionerUncertaintyContract(),
): VisionerUncertaintyValidationResult {
  const issues: VisionerUncertaintyValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of VISIONER_UNCERTAINTY_CATEGORIES) {
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

export function validateVisionerUncertaintyBaseline(
  fixture: VisionerUncertaintyBaseline,
): VisionerUncertaintyValidationResult {
  const issues: VisionerUncertaintyValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P02-B06-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    VISIONER_UNCERTAINTY_CATEGORIES.map(category => [category, 0]),
  ) as Record<VisionerUncertaintyCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of VISIONER_UNCERTAINTY_CATEGORIES) {
    const min = VISIONER_UNCERTAINTY_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP02B05ToB06Handoff();
  const researchTriggerCoverage = summarizeVisionerResearchTriggerContractCoverage(
    getActiveVisionerResearchTriggerContract(),
  );

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (
    fixture.sourceBlockGate.visionerResearchTriggerProbeCount !== researchTriggerCoverage.totalProbes
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.visionerResearchTriggerProbeCount=${fixture.sourceBlockGate.visionerResearchTriggerProbeCount} ` +
        `contract=${researchTriggerCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P02_B05_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P02_B05_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P02_B05_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B05 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P02_B05_SEALED_ATOM_COUNT}`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  const contract = getActiveVisionerUncertaintyContract();
  const expectedFailCount = contract.probes.filter(p => p.expected === "FAIL").length;
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_category",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${expectedFailCount}`,
    });
  }

  const contractAlignment = validateVisionerUncertaintyAgainstContract(
    fixture,
    getActiveVisionerUncertaintyContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeVisionerUncertaintyMatrix(
  results: VisionerUncertaintyProbeResult[],
): VisionerUncertaintyProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as VisionerUncertaintyProbeSummary["byCategory"];
  for (const category of VISIONER_UNCERTAINTY_CATEGORIES) {
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

export function listVisionerUncertaintyProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerUncertaintyBaseline,
): VisionerUncertaintyFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listVisionerUncertaintyKnownGaps(
  results: VisionerUncertaintyProbeResult[],
): VisionerUncertaintyProbeResult[] {
  return summarizeVisionerUncertaintyMatrix(results).knownGaps;
}
