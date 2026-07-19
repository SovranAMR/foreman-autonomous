/**
 * FOREMAN — Visioner Research Trigger Baseline (P02-B05)
 *
 * Measures NEEDS_RESEARCH / RESEARCH_QUERY signal extraction and research trigger wiring
 * on sealed P02-B04 visioner grounding block gate artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP02B04ToB05Handoff,
  getActiveVisionerGroundingContract,
  summarizeVisionerGroundingContractCoverage,
} from "./forge-p02-visioner-grounding.js";

export const FORGE_VISIONER_RESEARCH_TRIGGER_VERSION = "1.0.0-a05";

/** Maximum normalized vision length before truncation (P02-B05-A01 boundary). */
export const VISIONER_RESEARCH_TRIGGER_VISION_MAX_LENGTH = 32000;

export const VISIONER_RESEARCH_TRIGGER_CATEGORIES = [
  "trigger_versioning",
  "trigger_signal",
  "query_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type VisionerResearchTriggerCategory = (typeof VISIONER_RESEARCH_TRIGGER_CATEGORIES)[number];

export type VisionerResearchTriggerInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface VisionerResearchTriggerInputBoundary {
  disposition: VisionerResearchTriggerInputDisposition;
  acceptable: boolean;
  normalizedVision: string;
  truncated: boolean;
  detail: string;
}

export interface VisionerResearchTriggerPresence {
  hasNeedsResearch: boolean;
  needsResearch: boolean;
  hasResearchQuery: boolean;
  researchQuery: string;
  detail: string;
}

/**
 * Assess vision output boundary conditions — empty, whitespace-only, null bytes, max length (P02-B05-A01).
 */
export function assessVisionerResearchTriggerInputBoundary(
  visionOutput: string,
): VisionerResearchTriggerInputBoundary {
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
    const disposition: VisionerResearchTriggerInputDisposition =
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
  if (normalizedVision.length > VISIONER_RESEARCH_TRIGGER_VISION_MAX_LENGTH) {
    normalizedVision = normalizedVision.slice(0, VISIONER_RESEARCH_TRIGGER_VISION_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedVision,
    truncated,
    detail: truncated
      ? `vision truncated to ${VISIONER_RESEARCH_TRIGGER_VISION_MAX_LENGTH} characters`
      : "valid vision output",
  };
}

/**
 * Assess whether vision output declares NEEDS_RESEARCH and RESEARCH_QUERY signals (P02-B05-A01).
 */
export function assessVisionerResearchTriggerPresence(
  visionOutput: string,
): VisionerResearchTriggerPresence {
  const boundary = assessVisionerResearchTriggerInputBoundary(visionOutput);
  if (!boundary.acceptable) {
    return {
      hasNeedsResearch: false,
      needsResearch: false,
      hasResearchQuery: false,
      researchQuery: "",
      detail: boundary.detail,
    };
  }

  const text = boundary.normalizedVision;
  const needsResearchMatch = text.match(/NEEDS_RESEARCH:\s*(true|false)/i);
  const hasNeedsResearch = needsResearchMatch !== null;
  const needsResearch = needsResearchMatch?.[1]?.toLowerCase() === "true";

  const queryMatch = text.match(/RESEARCH_QUERY:\s*(.+?)(?:\n|$)/i);
  const researchQuery = queryMatch?.[1]?.trim() ?? "";
  const hasResearchQuery = researchQuery.length > 0;

  return {
    hasNeedsResearch,
    needsResearch,
    hasResearchQuery,
    researchQuery,
    detail:
      `needsResearch=${needsResearch}, hasQuery=${hasResearchQuery}` +
      (researchQuery ? `, query="${researchQuery.slice(0, 40)}"` : ""),
  };
}

export interface VisionerResearchTriggerRecoveryHints {
  researchQuery?: string;
  needsResearch?: boolean;
  reasoning?: string;
  output?: string;
  confidence?: number;
}

export interface VisionerResearchTriggerRecoveryResult {
  recovered: boolean;
  composedVision: string;
  presence: VisionerResearchTriggerPresence;
  parseErrors: string[];
  detail: string;
}

/**
 * Restructure failed research trigger parse into actionable query (P02-B05-A03).
 */
export function recoverVisionerResearchTrigger(
  failedParse: string,
  hints: VisionerResearchTriggerRecoveryHints = {},
): VisionerResearchTriggerRecoveryResult {
  const parseErrors: string[] = [];
  const boundary = assessVisionerResearchTriggerInputBoundary(failedParse);

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
      presence: assessVisionerResearchTriggerPresence(""),
      parseErrors: [parseError],
      detail: `cannot recover ${boundary.disposition.replace(/_/g, "-")} vision output`,
    };
  }

  const raw = boundary.acceptable ? boundary.normalizedVision : failedParse.trim();
  const initialPresence = assessVisionerResearchTriggerPresence(raw);

  if (initialPresence.needsResearch && initialPresence.hasResearchQuery) {
    return {
      recovered: true,
      composedVision: raw,
      presence: initialPresence,
      parseErrors,
      detail: initialPresence.detail,
    };
  }

  let needsResearch = hints.needsResearch ?? initialPresence.needsResearch;
  let researchQuery = hints.researchQuery ?? initialPresence.researchQuery;
  let reasoning = hints.reasoning;
  let output = hints.output;
  const confidence = hints.confidence ?? 0.7;

  const informalNeedsMatch =
    raw.match(/needs[_\s-]?research\s*[:=]\s*(true|false|yes|no)/i) ??
    raw.match(/need(?:s)?\s+research/i);
  if (informalNeedsMatch) {
    const val = informalNeedsMatch[1]?.toLowerCase();
    needsResearch = val ? val === "true" || val === "yes" : true;
  }

  const queryMatch =
    raw.match(/RESEARCH_QUERY:\s*(.+?)(?:\n|$)/i) ??
    raw.match(/research[_\s-]?(?:query|topic)\s*[:=]\s*(.+?)(?:\n|$)/i) ??
    raw.match(/query:\s*(.+?)(?:\n|$)/i);
  if (queryMatch && !researchQuery) {
    researchQuery = queryMatch[1].trim();
  }

  const reasoningMatch = raw.match(
    /REASONING:\s*(.+?)(?:\n(?:OUTPUT|CONFIDENCE|NEEDS_RESEARCH)|$)/is,
  );
  if (reasoningMatch && !reasoning) {
    reasoning = reasoningMatch[1].trim();
  }

  const outputMatch = raw.match(
    /OUTPUT:\s*(.+?)(?:\n(?:CONFIDENCE|NEEDS_RESEARCH|RESEARCH_QUERY)|$)/is,
  );
  if (outputMatch && !output) {
    output = outputMatch[1].trim();
  }

  if (!researchQuery && needsResearch) {
    const topicLine = raw
      .split("\n")
      .find(
        line =>
          /research|benchmark|best practice|compare|investigate/i.test(line) &&
          !/NEEDS_RESEARCH|RESEARCH_QUERY|CONFIDENCE|REASONING|OUTPUT/i.test(line),
      );
    if (topicLine) {
      researchQuery = topicLine.replace(/^[-*\s]+/, "").trim();
    }
  }

  if (!needsResearch && researchQuery) {
    needsResearch = true;
  }

  if (!researchQuery && needsResearch) {
    parseErrors.push("missing_research_query");
    researchQuery = "foreman visioner research recovery default query";
  }

  if (!reasoning) {
    reasoning = needsResearch
      ? "Recovered research trigger from failed parse"
      : "Recovered vision output from failed parse";
  }
  if (!output) {
    output = "**GOAL**: Recovered vision output";
  }

  if (needsResearch === undefined) {
    needsResearch = Boolean(researchQuery);
  }

  const composedVision = [
    `REASONING: ${reasoning}`,
    `OUTPUT: ${output}`,
    `CONFIDENCE: ${confidence}`,
    `NEEDS_RESEARCH: ${needsResearch ? "true" : "false"}`,
    needsResearch ? `RESEARCH_QUERY: ${researchQuery}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const presence = assessVisionerResearchTriggerPresence(composedVision);
  const recovered =
    presence.hasNeedsResearch &&
    presence.needsResearch === needsResearch &&
    (!needsResearch || (presence.hasResearchQuery && presence.researchQuery.length > 0));

  return {
    recovered,
    composedVision,
    presence,
    parseErrors,
    detail: presence.detail,
  };
}

export interface VisionerResearchTriggerProbeMatrixValidationIssue {
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

export interface VisionerResearchTriggerProbeMatrixValidationResult {
  valid: boolean;
  issues: VisionerResearchTriggerProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A01 baseline gate.
 */
export function validateVisionerResearchTriggerProbeMatrix(
  results: VisionerResearchTriggerProbeResult[],
  contract: VisionerResearchTriggerContract = getActiveVisionerResearchTriggerContract(),
): VisionerResearchTriggerProbeMatrixValidationResult {
  const issues: VisionerResearchTriggerProbeMatrixValidationIssue[] = [];
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
export function validateVisionerResearchTriggerBoundaryProbeMatrix(
  results: VisionerResearchTriggerProbeResult[],
  contract: VisionerResearchTriggerContract = getActiveVisionerResearchTriggerContract(),
): VisionerResearchTriggerProbeMatrixValidationResult {
  const boundaryProbes = listVisionerResearchTriggerContractProbesByCategory("boundary", contract);
  const boundaryContract: VisionerResearchTriggerContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateVisionerResearchTriggerProbeMatrix(boundaryResults, boundaryContract);
}

export const VISIONER_RESEARCH_TRIGGER_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly VisionerResearchTriggerCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes and documented FAIL gaps must align; zero unexpected mismatches.
 */
export function validateVisionerResearchTriggerFailureRecoveryProbeMatrix(
  results: VisionerResearchTriggerProbeResult[],
  contract: VisionerResearchTriggerContract = getActiveVisionerResearchTriggerContract(),
): VisionerResearchTriggerProbeMatrixValidationResult {
  const failureRecoveryProbes = VISIONER_RESEARCH_TRIGGER_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listVisionerResearchTriggerContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: VisionerResearchTriggerContract = {
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
  return validateVisionerResearchTriggerProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listVisionerResearchTriggerFailureRecoveryProbeIds(
  contract: VisionerResearchTriggerContract = getActiveVisionerResearchTriggerContract(),
): string[] {
  return VISIONER_RESEARCH_TRIGGER_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listVisionerResearchTriggerContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface VisionerResearchTriggerFixtureEntry {
  id: string;
  category: VisionerResearchTriggerCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface VisionerResearchTriggerBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    visionerGroundingProbeCount: number;
    sealedAtomCount: number;
  };
  probes: VisionerResearchTriggerFixtureEntry[];
}

export interface VisionerResearchTriggerProbeResult {
  id: string;
  category: VisionerResearchTriggerCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface VisionerResearchTriggerProbeSummary {
  total: number;
  aligned: number;
  mismatches: VisionerResearchTriggerProbeResult[];
  knownGaps: VisionerResearchTriggerProbeResult[];
  byCategory: Record<
    VisionerResearchTriggerCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface VisionerResearchTriggerValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: VisionerResearchTriggerCategory;
  detail: string;
}

export interface VisionerResearchTriggerValidationResult {
  valid: boolean;
  issues: VisionerResearchTriggerValidationIssue[];
}

export interface VisionerResearchTriggerContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: VisionerResearchTriggerCategory;
  detail: string;
}

export interface VisionerResearchTriggerContractCoverageResult {
  valid: boolean;
  issues: VisionerResearchTriggerContractCoverageIssue[];
}

export type VisionerResearchTriggerProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface VisionerResearchTriggerProbeContract {
  id: string;
  category: VisionerResearchTriggerCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: VisionerResearchTriggerProbeDisposition;
  criterion: string;
}

export interface VisionerResearchTriggerCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface VisionerResearchTriggerCategoryContract {
  category: VisionerResearchTriggerCategory;
  acceptance: VisionerResearchTriggerCategoryAcceptance;
  probes: readonly VisionerResearchTriggerProbeContract[];
}

export interface VisionerResearchTriggerContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<VisionerResearchTriggerCategory, VisionerResearchTriggerCategoryContract>;
  probes: readonly VisionerResearchTriggerProbeContract[];
}

export const VISIONER_RESEARCH_TRIGGER_A01_MIN_PROBES: Readonly<
  Record<VisionerResearchTriggerCategory, number>
> = {
  trigger_versioning: 3,
  trigger_signal: 3,
  query_signal: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

function flattenVisionerResearchTriggerCategoryProbes(
  categories: Record<VisionerResearchTriggerCategory, VisionerResearchTriggerCategoryContract>,
): readonly VisionerResearchTriggerProbeContract[] {
  return VISIONER_RESEARCH_TRIGGER_CATEGORIES.flatMap(category => categories[category].probes);
}

const VISIONER_RESEARCH_TRIGGER_CATEGORY_CONTRACTS: Record<
  VisionerResearchTriggerCategory,
  VisionerResearchTriggerCategoryContract
> = {
  trigger_versioning: {
    category: "trigger_versioning",
    acceptance: {
      invariant:
        "Visioner research trigger baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vrtr.version_tagged",
        category: "trigger_versioning",
        description: "Visioner research trigger baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner research trigger baseline declares semver version field",
      },
      {
        id: "vrtr.atom_tagged",
        category: "trigger_versioning",
        description: "Visioner research trigger baseline declares P02-B05-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner research trigger baseline declares P02-B05-A01 atom id",
      },
      {
        id: "vrtr.harness_version_exported",
        category: "trigger_versioning",
        description: "FORGE_VISIONER_RESEARCH_TRIGGER_VERSION exported for research trigger harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_VISIONER_RESEARCH_TRIGGER_VERSION exported for research trigger harness",
      },
    ],
  },
  trigger_signal: {
    category: "trigger_signal",
    acceptance: {
      invariant:
        "Visioner prompt, parser and engine expose NEEDS_RESEARCH research trigger signal wiring.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vrtr.prompt_needs_research",
        category: "trigger_signal",
        description: "VISIONER_SYSTEM prompt declares NEEDS_RESEARCH output field",
        expected: "PASS",
        disposition: "observed",
        criterion: "VISIONER_SYSTEM prompt declares NEEDS_RESEARCH output field",
      },
      {
        id: "vrtr.parser_needs_research_extract",
        category: "trigger_signal",
        description: "parseVisionResponse extracts NEEDS_RESEARCH boolean from vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseVisionResponse extracts NEEDS_RESEARCH boolean from vision output",
      },
      {
        id: "vrtr.engine_needs_research_parse",
        category: "trigger_signal",
        description: "Engine vision parse extracts NEEDS_RESEARCH true/false from LLM response",
        expected: "PASS",
        disposition: "observed",
        criterion: "Engine vision parse extracts NEEDS_RESEARCH true/false from LLM response",
      },
    ],
  },
  query_signal: {
    category: "query_signal",
    acceptance: {
      invariant:
        "RESEARCH_QUERY is declared in visioner prompt, parsed by parser and detected by presence assessment.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vrtr.prompt_research_query",
        category: "query_signal",
        description: "VISIONER_SYSTEM prompt declares RESEARCH_QUERY output field",
        expected: "PASS",
        disposition: "observed",
        criterion: "VISIONER_SYSTEM prompt declares RESEARCH_QUERY output field",
      },
      {
        id: "vrtr.parser_research_query_extract",
        category: "query_signal",
        description: "parseVisionResponse extracts RESEARCH_QUERY when NEEDS_RESEARCH is true",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseVisionResponse extracts RESEARCH_QUERY when NEEDS_RESEARCH is true",
      },
      {
        id: "vrtr.presence_research_query_detect",
        category: "query_signal",
        description: "assessVisionerResearchTriggerPresence detects RESEARCH_QUERY in vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerResearchTriggerPresence detects RESEARCH_QUERY in vision output",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Research trigger baseline links to sealed P02-B04 block gate and visioner grounding handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vrtr.b04_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P02_B04_TO_B05_HANDOFF_V1 targets P02-B05-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P02_B04_TO_B05_HANDOFF_V1 targets P02-B05-A01 entry atom",
      },
      {
        id: "vrtr.b04_sealed_grounding_probes",
        category: "baseline_link",
        description: "P02-B04→B05 handoff sealed probeCount matches active visioner grounding contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P02-B04→B05 handoff sealed probeCount matches active visioner grounding contract",
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
        id: "vrtr.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P02-B04 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P02-B04 block gate source artifacts",
      },
      {
        id: "vrtr.probe_runner_exported",
        category: "boundary",
        description: "runVisionerResearchTriggerProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runVisionerResearchTriggerProbes executes contract-wired probe matrix",
      },
      {
        id: "vrtr.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL research trigger gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL research trigger gap",
      },
      {
        id: "vrtr.empty_vision_trigger_presence",
        category: "boundary",
        description: "assessVisionerResearchTriggerInputBoundary rejects empty vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerResearchTriggerInputBoundary rejects empty vision output",
      },
      {
        id: "vrtr.whitespace_vision_boundary",
        category: "boundary",
        description: "assessVisionerResearchTriggerInputBoundary rejects whitespace-only vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerResearchTriggerInputBoundary rejects whitespace-only vision output",
      },
      {
        id: "vrtr.long_vision_truncation_boundary",
        category: "boundary",
        description: "assessVisionerResearchTriggerInputBoundary truncates vision exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerResearchTriggerInputBoundary truncates vision exceeding max length",
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
        id: "vrtr.invalid_version_rejected",
        category: "failure_path",
        description: "validateVisionerResearchTriggerBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateVisionerResearchTriggerBaseline rejects unexpected fixture version",
      },
      {
        id: "vrtr.malformed_vision_trigger_guard",
        category: "failure_path",
        description: "assessVisionerResearchTriggerPresence rejects null-byte vision output safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessVisionerResearchTriggerPresence rejects null-byte vision output safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Checkpoint resume preserves vision research signals; recoverVisionerResearchTrigger restructures failed parse.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vrtr.vision_checkpoint_research_trigger",
        category: "recovery_path",
        description: "Pipeline resume reuses checkpoint vision output while preserving research trigger wiring",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Pipeline resume reuses checkpoint vision output while preserving research trigger wiring",
      },
      {
        id: "vrtr.structured_research_trigger_recovery",
        category: "recovery_path",
        description: "recoverVisionerResearchTrigger restructures failed research trigger parse into actionable query",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverVisionerResearchTrigger restructures failed research trigger parse into actionable query",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Researcher skips memory re-research; visioner research budget and confidence threshold guardrails exist.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vrtr.researcher_skip_memory",
        category: "nogo_path",
        description: "Researcher prompt skips re-researching items already in memory",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Researcher prompt skips re-researching items already in memory",
      },
      {
        id: "vrtr.visioner_research_budget_threshold",
        category: "nogo_path",
        description: "Orchestrator research phase budget and engine visioner confidence thresholds constrain research",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Orchestrator research phase budget and engine visioner confidence thresholds constrain research",
      },
    ],
  },
};

export const FORGE_VISIONER_RESEARCH_TRIGGER_CONTRACT_V1: VisionerResearchTriggerContract = {
  version: "1.0.0",
  atom: "P02-B05-A06",
  purpose:
    "Typed visioner research trigger contract declaring measurable NEEDS_RESEARCH, query signal and guard probes.",
  categories: VISIONER_RESEARCH_TRIGGER_CATEGORY_CONTRACTS,
  probes: flattenVisionerResearchTriggerCategoryProbes(VISIONER_RESEARCH_TRIGGER_CATEGORY_CONTRACTS),
};

export const EXPECTED_P02_B04_SEALED_ATOM_COUNT = 10;

export function getActiveVisionerResearchTriggerContract(): VisionerResearchTriggerContract {
  return FORGE_VISIONER_RESEARCH_TRIGGER_CONTRACT_V1;
}

export function getVisionerResearchTriggerCategoryContract(
  category: VisionerResearchTriggerCategory,
  contract: VisionerResearchTriggerContract = getActiveVisionerResearchTriggerContract(),
): VisionerResearchTriggerCategoryContract {
  return contract.categories[category];
}

export function listVisionerResearchTriggerContractProbeIds(
  contract: VisionerResearchTriggerContract = getActiveVisionerResearchTriggerContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listVisionerResearchTriggerProbesByDisposition(
  disposition: VisionerResearchTriggerProbeDisposition,
  contract: VisionerResearchTriggerContract = getActiveVisionerResearchTriggerContract(),
): VisionerResearchTriggerProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listVisionerResearchTriggerContractProbesByCategory(
  category: VisionerResearchTriggerCategory,
  contract: VisionerResearchTriggerContract = getActiveVisionerResearchTriggerContract(),
): VisionerResearchTriggerProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeVisionerResearchTriggerContractCoverage(
  contract: VisionerResearchTriggerContract = getActiveVisionerResearchTriggerContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<VisionerResearchTriggerCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<VisionerResearchTriggerProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    VisionerResearchTriggerCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<VisionerResearchTriggerProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of VISIONER_RESEARCH_TRIGGER_CATEGORIES) {
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

export function validateVisionerResearchTriggerContractCoverage(
  contract: VisionerResearchTriggerContract = getActiveVisionerResearchTriggerContract(),
): VisionerResearchTriggerContractCoverageResult {
  const issues: VisionerResearchTriggerContractCoverageIssue[] = [];

  for (const category of VISIONER_RESEARCH_TRIGGER_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < VISIONER_RESEARCH_TRIGGER_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${VISIONER_RESEARCH_TRIGGER_A01_MIN_PROBES[category]}`,
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

  const ids = listVisionerResearchTriggerContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeVisionerResearchTriggerContractCoverage(contract);
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
    if (!probe.id.startsWith("vrtr.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing vrtr. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function buildDefaultSourceBlockGate(): VisionerResearchTriggerBaseline["sourceBlockGate"] {
  const handoff = getForgeP02B04ToB05Handoff();
  const groundingCoverage = summarizeVisionerGroundingContractCoverage(getActiveVisionerGroundingContract());
  return {
    version: handoff.version,
    atom: handoff.atom,
    contractVersion: handoff.version,
    visionerGroundingProbeCount: groundingCoverage.totalProbes,
    sealedAtomCount: EXPECTED_P02_B04_SEALED_ATOM_COUNT,
  };
}

export function validateVisionerResearchTriggerAgainstContract(
  fixture: VisionerResearchTriggerBaseline,
  contract: VisionerResearchTriggerContract = getActiveVisionerResearchTriggerContract(),
): VisionerResearchTriggerValidationResult {
  const issues: VisionerResearchTriggerValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of VISIONER_RESEARCH_TRIGGER_CATEGORIES) {
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

export function validateVisionerResearchTriggerBaseline(
  fixture: VisionerResearchTriggerBaseline,
): VisionerResearchTriggerValidationResult {
  const issues: VisionerResearchTriggerValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P02-B05-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    VISIONER_RESEARCH_TRIGGER_CATEGORIES.map(category => [category, 0]),
  ) as Record<VisionerResearchTriggerCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of VISIONER_RESEARCH_TRIGGER_CATEGORIES) {
    const min = VISIONER_RESEARCH_TRIGGER_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP02B04ToB05Handoff();
  const groundingCoverage = summarizeVisionerGroundingContractCoverage(getActiveVisionerGroundingContract());

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (fixture.sourceBlockGate.visionerGroundingProbeCount !== groundingCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.visionerGroundingProbeCount=${fixture.sourceBlockGate.visionerGroundingProbeCount} ` +
        `contract=${groundingCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P02_B04_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P02_B04_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P02_B04_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B04 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P02_B04_SEALED_ATOM_COUNT}`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  const contract = getActiveVisionerResearchTriggerContract();
  const expectedFailCount = contract.probes.filter(p => p.expected === "FAIL").length;
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_category",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${expectedFailCount}`,
    });
  }

  const contractAlignment = validateVisionerResearchTriggerAgainstContract(
    fixture,
    getActiveVisionerResearchTriggerContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeVisionerResearchTriggerMatrix(
  results: VisionerResearchTriggerProbeResult[],
): VisionerResearchTriggerProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as VisionerResearchTriggerProbeSummary["byCategory"];
  for (const category of VISIONER_RESEARCH_TRIGGER_CATEGORIES) {
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

export function listVisionerResearchTriggerProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerResearchTriggerBaseline,
): VisionerResearchTriggerFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listVisionerResearchTriggerKnownGaps(
  results: VisionerResearchTriggerProbeResult[],
): VisionerResearchTriggerProbeResult[] {
  return summarizeVisionerResearchTriggerMatrix(results).knownGaps;
}
