/**
 * FOREMAN — Visioner Repo & User Context Grounding Baseline (P02-B04)
 *
 * Measures repo and user context grounding — project detection, identity injection,
 * session/memory wiring — on sealed P02-B03 visioner synthesis block gate artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP02B03ToB04Handoff,
  getActiveVisionerSynthesisContract,
  summarizeVisionerSynthesisContractCoverage,
} from "./forge-p02-visioner-synthesis.js";

export const FORGE_VISIONER_GROUNDING_VERSION = "1.0.0-a04";

/** Maximum normalized context length before truncation (P02-B04-A01 boundary). */
export const VISIONER_GROUNDING_CONTEXT_MAX_LENGTH = 32000;

export const VISIONER_GROUNDING_CATEGORIES = [
  "grounding_versioning",
  "repo_signal",
  "user_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type VisionerGroundingCategory = (typeof VISIONER_GROUNDING_CATEGORIES)[number];

export type VisionerGroundingInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface VisionerGroundingInputBoundary {
  disposition: VisionerGroundingInputDisposition;
  acceptable: boolean;
  normalizedContext: string;
  truncated: boolean;
  detail: string;
}

export interface VisionerGroundingPresence {
  hasProjectAnchor: boolean;
  hasProjectContext: boolean;
  hasIdentityContext: boolean;
  hasSessionContext: boolean;
  detail: string;
}

/**
 * Assess context input boundary conditions — empty, whitespace-only, null bytes, max length (P02-B04-A01).
 */
export function assessVisionerGroundingInputBoundary(
  contextInput: string,
): VisionerGroundingInputBoundary {
  if (contextInput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedContext: "",
      truncated: false,
      detail: "null byte in context input",
    };
  }

  const trimmed = contextInput.trim();
  if (trimmed.length === 0) {
    const disposition: VisionerGroundingInputDisposition =
      contextInput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedContext: "",
      truncated: false,
      detail: disposition === "empty" ? "empty context input" : "whitespace-only context input",
    };
  }

  let normalizedContext = contextInput;
  let truncated = false;
  if (normalizedContext.length > VISIONER_GROUNDING_CONTEXT_MAX_LENGTH) {
    normalizedContext = normalizedContext.slice(0, VISIONER_GROUNDING_CONTEXT_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedContext,
    truncated,
    detail: truncated
      ? `context truncated to ${VISIONER_GROUNDING_CONTEXT_MAX_LENGTH} characters`
      : "valid context input",
  };
}

/**
 * Assess whether a composed vision prompt declares repo/user grounding signals (P02-B04-A01).
 */
export function assessVisionerGroundingPresence(composedPrompt: string): VisionerGroundingPresence {
  const boundary = assessVisionerGroundingInputBoundary(composedPrompt);
  if (!boundary.acceptable) {
    return {
      hasProjectAnchor: false,
      hasProjectContext: false,
      hasIdentityContext: false,
      hasSessionContext: false,
      detail: boundary.detail,
    };
  }

  const text = boundary.normalizedContext;
  const hasProjectAnchor = /\bProject:\s*/.test(text);
  const hasProjectContext =
    text.includes("Project Context:") ||
    (text.includes("Language:") && text.includes("Health:"));
  const hasIdentityContext =
    text.includes("Agent Identity") ||
    text.includes("User Profile") ||
    text.includes("IDENTITY CONTEXT");
  const hasSessionContext =
    text.includes("SESSION CONTEXT") ||
    text.includes("Previous Context:") ||
    text.includes("Previous sessions");

  return {
    hasProjectAnchor,
    hasProjectContext,
    hasIdentityContext,
    hasSessionContext,
    detail:
      `projectAnchor=${hasProjectAnchor}, projectContext=${hasProjectContext}, ` +
      `identity=${hasIdentityContext}, session=${hasSessionContext}`,
  };
}

export interface VisionerGroundingRecoveryHints {
  projectName?: string;
  language?: string;
  sessionContext?: string;
  identityHint?: string;
}

export interface VisionerGroundingRecoveryResult {
  recovered: boolean;
  composedPrompt: string;
  presence: VisionerGroundingPresence;
  parseErrors: string[];
  detail: string;
}

/**
 * Restructure failed context parse into actionable repo/user grounding (P02-B04-A03).
 */
export function recoverVisionerGrounding(
  failedParse: string,
  hints: VisionerGroundingRecoveryHints = {},
): VisionerGroundingRecoveryResult {
  const parseErrors: string[] = [];
  const boundary = assessVisionerGroundingInputBoundary(failedParse);

  if (boundary.disposition === "contains_null_byte") {
    return {
      recovered: false,
      composedPrompt: "",
      presence: assessVisionerGroundingPresence(""),
      parseErrors: ["null_byte_in_context"],
      detail: "cannot recover null-byte context",
    };
  }

  const raw = boundary.acceptable ? boundary.normalizedContext : failedParse.trim();
  let projectName = hints.projectName;
  let language = hints.language ?? "unknown";
  let sessionContext = hints.sessionContext;
  let identityHint = hints.identityHint;

  const projectMatch =
    raw.match(/"project"\s*:\s*"([^"]+)"/i) ??
    raw.match(/project[=:\s]+["']?([^\s"',}\]]+)/i);
  if (projectMatch && !projectName) {
    projectName = projectMatch[1];
  }

  const userMatch =
    raw.match(/"user"\s*:\s*"([^"]+)"/i) ?? raw.match(/user[=:\s]+["']?([^\s"',}\]]+)/i);
  if (userMatch && !identityHint) {
    identityHint = userMatch[1];
  }

  const langMatch =
    raw.match(/"language"\s*:\s*"([^"]+)"/i) ?? raw.match(/Language:\s*(\w+)/i);
  if (langMatch) {
    language = langMatch[1];
  }

  const sessionMatch =
    raw.match(/"session"\s*:\s*"([^"]+)"/i) ??
    raw.match(/session[=:\s]+["']?([^\s"',}\]]+)/i);
  if (sessionMatch && !sessionContext) {
    sessionContext = sessionMatch[1];
  }

  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      JSON.parse(raw);
    } catch {
      parseErrors.push("json_parse_failed");
    }
  }

  if (!projectName && raw.length > 0) {
    const firstLine = raw.split("\n").find(line => line.trim().length > 0)?.trim();
    if (firstLine && firstLine.length < 80) {
      projectName = firstLine
        .replace(/^[{[\s"]+|["}\]\s]+$/g, "")
        .split(/[,:]/)[0]
        ?.trim();
    }
  }

  projectName = projectName ?? "unknown-project";

  const parts: string[] = [
    `Project: ${projectName}`,
    "",
    "Project Context:",
    `Language: ${language}`,
    "Health: recovered",
    "",
    "IDENTITY CONTEXT",
    identityHint ? `User Profile: ${identityHint}` : "Agent Identity: Foreman recovery slice",
    "",
    "SESSION CONTEXT",
    sessionContext
      ? `Previous Context: ${sessionContext}`
      : `Previous Context: recovered from failed parse (${parseErrors.length} errors)`,
  ];

  const composedPrompt = parts.join("\n");
  const presence = assessVisionerGroundingPresence(composedPrompt);
  const recovered =
    presence.hasProjectAnchor &&
    presence.hasProjectContext &&
    presence.hasIdentityContext &&
    presence.hasSessionContext;

  return {
    recovered,
    composedPrompt,
    presence,
    parseErrors,
    detail: presence.detail,
  };
}

export interface VisionerGroundingProbeMatrixValidationIssue {
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

export interface VisionerGroundingProbeMatrixValidationResult {
  valid: boolean;
  issues: VisionerGroundingProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 */
export function validateVisionerGroundingProbeMatrix(
  results: VisionerGroundingProbeResult[],
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
): VisionerGroundingProbeMatrixValidationResult {
  const issues: VisionerGroundingProbeMatrixValidationIssue[] = [];
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
export function validateVisionerGroundingBoundaryProbeMatrix(
  results: VisionerGroundingProbeResult[],
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
): VisionerGroundingProbeMatrixValidationResult {
  const boundaryProbes = listVisionerGroundingContractProbesByCategory("boundary", contract);
  const boundaryContract: VisionerGroundingContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateVisionerGroundingProbeMatrix(boundaryResults, boundaryContract);
}

export interface VisionerGroundingFixtureEntry {
  id: string;
  category: VisionerGroundingCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface VisionerGroundingBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    visionerSynthesisProbeCount: number;
    sealedAtomCount: number;
  };
  probes: VisionerGroundingFixtureEntry[];
}

export interface VisionerGroundingProbeResult {
  id: string;
  category: VisionerGroundingCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface VisionerGroundingProbeSummary {
  total: number;
  aligned: number;
  mismatches: VisionerGroundingProbeResult[];
  knownGaps: VisionerGroundingProbeResult[];
  byCategory: Record<
    VisionerGroundingCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface VisionerGroundingValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: VisionerGroundingCategory;
  detail: string;
}

export interface VisionerGroundingValidationResult {
  valid: boolean;
  issues: VisionerGroundingValidationIssue[];
}

export type VisionerGroundingProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface VisionerGroundingProbeContract {
  id: string;
  category: VisionerGroundingCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: VisionerGroundingProbeDisposition;
  criterion: string;
}

export interface VisionerGroundingCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface VisionerGroundingCategoryContract {
  category: VisionerGroundingCategory;
  acceptance: VisionerGroundingCategoryAcceptance;
  probes: readonly VisionerGroundingProbeContract[];
}

export interface VisionerGroundingContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<VisionerGroundingCategory, VisionerGroundingCategoryContract>;
  probes: readonly VisionerGroundingProbeContract[];
}

export interface VisionerGroundingContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: VisionerGroundingCategory;
  detail: string;
}

export interface VisionerGroundingContractCoverageResult {
  valid: boolean;
  issues: VisionerGroundingContractCoverageIssue[];
}

export const VISIONER_GROUNDING_A01_MIN_PROBES: Readonly<
  Record<VisionerGroundingCategory, number>
> = {
  grounding_versioning: 3,
  repo_signal: 3,
  user_signal: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

function flattenVisionerGroundingCategoryProbes(
  categories: Record<VisionerGroundingCategory, VisionerGroundingCategoryContract>,
): readonly VisionerGroundingProbeContract[] {
  return VISIONER_GROUNDING_CATEGORIES.flatMap(category => categories[category].probes);
}

const VISIONER_GROUNDING_CATEGORY_CONTRACTS: Record<
  VisionerGroundingCategory,
  VisionerGroundingCategoryContract
> = {
  grounding_versioning: {
    category: "grounding_versioning",
    acceptance: {
      invariant:
        "Visioner grounding baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vgrd.version_tagged",
        category: "grounding_versioning",
        description: "Visioner grounding baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner grounding baseline declares semver version field",
      },
      {
        id: "vgrd.atom_tagged",
        category: "grounding_versioning",
        description: "Visioner grounding baseline declares P02-B04-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner grounding baseline declares P02-B04-A01 atom id",
      },
      {
        id: "vgrd.harness_version_exported",
        category: "grounding_versioning",
        description: "FORGE_VISIONER_GROUNDING_VERSION exported for grounding harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_VISIONER_GROUNDING_VERSION exported for grounding harness",
      },
    ],
  },
  repo_signal: {
    category: "repo_signal",
    acceptance: {
      invariant:
        "Repo grounding wires project detection and project context injection into the vision phase.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vgrd.orchestrator_project_context",
        category: "repo_signal",
        description: "Orchestrator vision phase injects formatProjectContext into vision prompt",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator vision phase injects formatProjectContext into vision prompt",
      },
      {
        id: "vgrd.project_detector_exported",
        category: "repo_signal",
        description: "project-detector exports detectProject and formatProjectContext for repo grounding",
        expected: "PASS",
        disposition: "observed",
        criterion: "project-detector exports detectProject and formatProjectContext for repo grounding",
      },
      {
        id: "vgrd.vision_prompt_project_wiring",
        category: "repo_signal",
        description: "buildVisionPromptForDepth receives projectContext from orchestrator vision phase",
        expected: "PASS",
        disposition: "observed",
        criterion: "buildVisionPromptForDepth receives projectContext from orchestrator vision phase",
      },
    ],
  },
  user_signal: {
    category: "user_signal",
    acceptance: {
      invariant:
        "User grounding wires identity injection, session context and prompt context sections.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vgrd.identity_context_injection",
        category: "user_signal",
        description: "Orchestrator vision phase injects identity buildContextInjection into vision prompt",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator vision phase injects identity buildContextInjection into vision prompt",
      },
      {
        id: "vgrd.prompt_context_sections",
        category: "user_signal",
        description: "VISIONER_SYSTEM prompt declares PROJECT MEMORY, SESSION CONTEXT and IDENTITY CONTEXT sections",
        expected: "PASS",
        disposition: "observed",
        criterion: "VISIONER_SYSTEM prompt declares PROJECT MEMORY, SESSION CONTEXT and IDENTITY CONTEXT sections",
      },
      {
        id: "vgrd.build_context_text_session",
        category: "user_signal",
        description: "buildContextText injects sessionContext into thought prompts",
        expected: "PASS",
        disposition: "observed",
        criterion: "buildContextText injects sessionContext into thought prompts",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Grounding baseline links to sealed P02-B03 block gate and visioner synthesis handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vgrd.b03_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P02_B03_TO_B04_HANDOFF_V1 targets P02-B04-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P02_B03_TO_B04_HANDOFF_V1 targets P02-B04-A01 entry atom",
      },
      {
        id: "vgrd.b03_sealed_synthesis_probes",
        category: "baseline_link",
        description: "P02-B03→B04 handoff sealed probeCount matches active visioner synthesis contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P02-B03→B04 handoff sealed probeCount matches active visioner synthesis contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Context boundary assessment handles empty, whitespace-only and oversized inputs; probe runner and documented gaps wired.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vgrd.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P02-B03 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P02-B03 block gate source artifacts",
      },
      {
        id: "vgrd.probe_runner_exported",
        category: "boundary",
        description: "runVisionerGroundingProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runVisionerGroundingProbes executes contract-wired probe matrix",
      },
      {
        id: "vgrd.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture grounding probe expectations align with contract FAIL gap count",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture grounding probe expectations align with contract FAIL gap count",
      },
      {
        id: "vgrd.empty_context_boundary",
        category: "boundary",
        description: "assessVisionerGroundingInputBoundary rejects empty context input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerGroundingInputBoundary rejects empty context input",
      },
      {
        id: "vgrd.whitespace_context_boundary",
        category: "boundary",
        description: "assessVisionerGroundingInputBoundary rejects whitespace-only context input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerGroundingInputBoundary rejects whitespace-only context input",
      },
      {
        id: "vgrd.long_context_truncation_boundary",
        category: "boundary",
        description: "assessVisionerGroundingInputBoundary truncates context exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerGroundingInputBoundary truncates context exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Malformed context guard exists; fixture validation rejects invalid versions.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vgrd.invalid_version_rejected",
        category: "failure_path",
        description: "validateVisionerGroundingBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateVisionerGroundingBaseline rejects unexpected fixture version",
      },
      {
        id: "vgrd.malformed_context_guard",
        category: "failure_path",
        description: "assessVisionerGroundingPresence rejects null-byte context input safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessVisionerGroundingPresence rejects null-byte context input safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Checkpoint resume preserves grounding wiring; recoverVisionerGrounding restructures failed context parse.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vgrd.vision_checkpoint_grounding",
        category: "recovery_path",
        description: "Pipeline resume reuses checkpoint vision output while preserving grounding wiring",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Pipeline resume reuses checkpoint vision output while preserving grounding wiring",
      },
      {
        id: "vgrd.structured_grounding_recovery",
        category: "recovery_path",
        description: "recoverVisionerGrounding restructures failed context parse into actionable repo/user grounding",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverVisionerGrounding restructures failed context parse into actionable repo/user grounding",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Ambiguity NO-GO and reflection memory context guard grounding before and during pipeline execution.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vgrd.intent_ambiguity_nogo",
        category: "nogo_path",
        description: "Orchestrator blocks ambiguous tasks before vision when grounding signals are insufficient",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Orchestrator blocks ambiguous tasks before vision when grounding signals are insufficient",
      },
      {
        id: "vgrd.reflection_memory_context",
        category: "nogo_path",
        description: "Reflection prompt declares MEMORY context for vision-aware grounding checks",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Reflection prompt declares MEMORY context for vision-aware grounding checks",
      },
    ],
  },
};

export const FORGE_VISIONER_GROUNDING_CONTRACT_V1: VisionerGroundingContract = {
  version: "1.0.0",
  atom: "P02-B04-A05",
  purpose:
    "Typed visioner grounding contract declaring measurable repo, user and guard probes.",
  categories: VISIONER_GROUNDING_CATEGORY_CONTRACTS,
  probes: flattenVisionerGroundingCategoryProbes(VISIONER_GROUNDING_CATEGORY_CONTRACTS),
};

export const EXPECTED_P02_B03_SEALED_ATOM_COUNT = 10;

export function getActiveVisionerGroundingContract(): VisionerGroundingContract {
  return FORGE_VISIONER_GROUNDING_CONTRACT_V1;
}

export function getVisionerGroundingCategoryContract(
  category: VisionerGroundingCategory,
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
): VisionerGroundingCategoryContract {
  return contract.categories[category];
}

export function listVisionerGroundingContractProbeIds(
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listVisionerGroundingProbesByDisposition(
  disposition: VisionerGroundingProbeDisposition,
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
): VisionerGroundingProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listVisionerGroundingContractProbesByCategory(
  category: VisionerGroundingCategory,
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
): VisionerGroundingProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeVisionerGroundingContractCoverage(
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<VisionerGroundingCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<VisionerGroundingProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    VisionerGroundingCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<VisionerGroundingProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of VISIONER_GROUNDING_CATEGORIES) {
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

export function validateVisionerGroundingContractCoverage(
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
): VisionerGroundingContractCoverageResult {
  const issues: VisionerGroundingContractCoverageIssue[] = [];

  for (const category of VISIONER_GROUNDING_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < VISIONER_GROUNDING_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${VISIONER_GROUNDING_A01_MIN_PROBES[category]}`,
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

  const ids = listVisionerGroundingContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeVisionerGroundingContractCoverage(contract);
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
    if (!probe.id.startsWith("vgrd.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing vgrd. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateVisionerGroundingAgainstContract(
  fixture: VisionerGroundingBaseline,
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
): VisionerGroundingValidationResult {
  const issues: VisionerGroundingValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of VISIONER_GROUNDING_CATEGORIES) {
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

export function validateVisionerGroundingBaseline(
  fixture: VisionerGroundingBaseline,
): VisionerGroundingValidationResult {
  const issues: VisionerGroundingValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P02-B04-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    VISIONER_GROUNDING_CATEGORIES.map(category => [category, 0]),
  ) as Record<VisionerGroundingCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of VISIONER_GROUNDING_CATEGORIES) {
    const min = VISIONER_GROUNDING_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP02B03ToB04Handoff();
  const synthesisCoverage = summarizeVisionerSynthesisContractCoverage(
    getActiveVisionerSynthesisContract(),
  );

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (fixture.sourceBlockGate.visionerSynthesisProbeCount !== synthesisCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.visionerSynthesisProbeCount=${fixture.sourceBlockGate.visionerSynthesisProbeCount} ` +
        `contract=${synthesisCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P02_B03_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P02_B03_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P02_B03_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B03 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P02_B03_SEALED_ATOM_COUNT}`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  const contract = getActiveVisionerGroundingContract();
  const expectedFailCount = contract.probes.filter(p => p.expected === "FAIL").length;
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_category",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${expectedFailCount}`,
    });
  }

  const contractAlignment = validateVisionerGroundingAgainstContract(
    fixture,
    getActiveVisionerGroundingContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeVisionerGroundingMatrix(
  results: VisionerGroundingProbeResult[],
): VisionerGroundingProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as VisionerGroundingProbeSummary["byCategory"];
  for (const category of VISIONER_GROUNDING_CATEGORIES) {
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

export function listVisionerGroundingProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerGroundingBaseline,
): VisionerGroundingFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listVisionerGroundingKnownGaps(
  results: VisionerGroundingProbeResult[],
): VisionerGroundingProbeResult[] {
  return summarizeVisionerGroundingMatrix(results).knownGaps;
}
