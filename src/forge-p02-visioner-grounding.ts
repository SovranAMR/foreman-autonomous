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

export const FORGE_VISIONER_GROUNDING_VERSION = "1.0.0-a07";

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

export const VISIONER_GROUNDING_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly VisionerGroundingCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes and documented FAIL gaps must align; zero unexpected mismatches.
 */
export function validateVisionerGroundingFailureRecoveryProbeMatrix(
  results: VisionerGroundingProbeResult[],
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
): VisionerGroundingProbeMatrixValidationResult {
  const failureRecoveryProbes = VISIONER_GROUNDING_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listVisionerGroundingContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: VisionerGroundingContract = {
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
  return validateVisionerGroundingProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listVisionerGroundingFailureRecoveryProbeIds(
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
): string[] {
  return VISIONER_GROUNDING_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listVisionerGroundingContractProbesByCategory(category, contract).map(p => p.id),
  );
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
  atom: "P02-B04-A06",
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

/** Per-probe evidence artifact — disposition, criterion and aligned outcomes (P02-B04-A06). */
export interface VisionerGroundingProbeEvidence {
  probeId: string;
  category: VisionerGroundingCategory;
  disposition: VisionerGroundingProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for visioner grounding runs (P02-B04-A06). */
export interface VisionerGroundingProbeTelemetry {
  probeId: string;
  category: VisionerGroundingCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P02-B04-A06). */
export interface VisionerGroundingProvenance {
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
  sliceCategories?: readonly VisionerGroundingCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated visioner grounding run record bundling evidence, telemetry and provenance. */
export interface VisionerGroundingRunRecord {
  provenance: VisionerGroundingProvenance;
  evidence: VisionerGroundingProbeEvidence[];
  telemetry: VisionerGroundingProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<VisionerGroundingCategory, number>;
    byDisposition: Record<VisionerGroundingProbeDisposition, number>;
  };
}

export interface VisionerGroundingRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface VisionerGroundingRunValidationResult {
  valid: boolean;
  issues: VisionerGroundingRunValidationIssue[];
}

export function buildVisionerGroundingProbeEvidence(
  probeId: string,
  category: VisionerGroundingCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: VisionerGroundingProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): VisionerGroundingProbeEvidence {
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

export function buildVisionerGroundingProbeTelemetry(
  probeId: string,
  category: VisionerGroundingCategory,
  sequenceIndex: number,
  durationMs: number,
): VisionerGroundingProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildVisionerGroundingProvenance(
  runId: string,
  fixture: VisionerGroundingBaseline,
  contract: VisionerGroundingContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly VisionerGroundingCategory[];
  },
): VisionerGroundingProvenance {
  return {
    runId,
    harnessVersion: FORGE_VISIONER_GROUNDING_VERSION,
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

export function buildVisionerGroundingRunRecord(
  provenance: VisionerGroundingProvenance,
  evidence: VisionerGroundingProbeEvidence[],
  telemetry: VisionerGroundingProbeTelemetry[],
): VisionerGroundingRunRecord {
  const byCategory = {} as Record<VisionerGroundingCategory, number>;
  const byDisposition: Record<VisionerGroundingProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of VISIONER_GROUNDING_CATEGORIES) {
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

function validateVisionerGroundingRunRecordAgainstProbeIds(
  record: VisionerGroundingRunRecord,
  expectedProbeIds: string[],
  contract: VisionerGroundingContract,
): VisionerGroundingRunValidationResult {
  const issues: VisionerGroundingRunValidationIssue[] = [];
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

export function validateVisionerGroundingRunRecord(
  record: VisionerGroundingRunRecord,
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
): VisionerGroundingRunValidationResult {
  return validateVisionerGroundingRunRecordAgainstProbeIds(
    record,
    listVisionerGroundingContractProbeIds(contract),
    contract,
  );
}

/** Validate failure/recovery slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateVisionerGroundingFailureRecoveryRunRecord(
  record: VisionerGroundingRunRecord,
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
): VisionerGroundingRunValidationResult {
  const issues: VisionerGroundingRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P02-B04-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P02-B04-A06`,
    });
  }

  const expectedCategories = [...VISIONER_GROUNDING_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateVisionerGroundingRunRecordAgainstProbeIds(
    record,
    listVisionerGroundingFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

// ─── Property and fuzz validation (P02-B04-A07) ─────────────────────────────

export interface VisionerGroundingPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface VisionerGroundingPropertyResult {
  passed: number;
  failed: VisionerGroundingPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type VisionerGroundingPropertyCheck = {
  id: string;
  description: string;
  check: (contract: VisionerGroundingContract) => string | null;
};

const GROUNDING_PROPERTY_CHECK_FIXTURE: VisionerGroundingBaseline = {
  version: "0",
  atom: "x",
  purpose: "x",
  sourceBlockGate: {
    version: "0",
    atom: "x",
    contractVersion: "0",
    visionerSynthesisProbeCount: 0,
    sealedAtomCount: 0,
  },
  probes: [],
};

const VISIONER_GROUNDING_STRUCTURAL_PROPERTIES: readonly VisionerGroundingPropertyCheck[] = [
  {
    id: "categories_complete",
    description: "All eight visioner grounding categories are declared",
    check: contract => {
      for (const category of VISIONER_GROUNDING_CATEGORIES) {
        if (!contract.categories[category]) return `missing category: ${category}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listVisionerGroundingContractProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each category meets contract minProbeCount",
    check: contract => {
      for (const category of VISIONER_GROUNDING_CATEGORIES) {
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
    description: "summarizeVisionerGroundingContractCoverage totals match listVisionerGroundingContractProbeIds",
    check: contract => {
      const summary = summarizeVisionerGroundingContractCoverage(contract);
      const ids = listVisionerGroundingContractProbeIds(contract);
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
    description: "Probe ids are namespaced with vgrd. prefix",
    check: contract => {
      for (const probe of contract.probes) {
        if (!probe.id.startsWith("vgrd.")) {
          return `${probe.id} missing vgrd. prefix`;
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const probeIds = listVisionerGroundingContractProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildVisionerGroundingProbeEvidence(
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
        return buildVisionerGroundingProbeTelemetry(id, probe.category, index, index);
      });
      const record = buildVisionerGroundingRunRecord(
        buildVisionerGroundingProvenance(
          "property-check",
          GROUNDING_PROPERTY_CHECK_FIXTURE,
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
    description: "Synthetic failure/recovery slice record passes validateVisionerGroundingFailureRecoveryRunRecord",
    check: contract => {
      const probeIds = listVisionerGroundingFailureRecoveryProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildVisionerGroundingProbeEvidence(
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
        return buildVisionerGroundingProbeTelemetry(id, probe.category, index, index * 0.5);
      });
      const record = buildVisionerGroundingRunRecord(
        buildVisionerGroundingProvenance(
          "property-check-failure-recovery",
          GROUNDING_PROPERTY_CHECK_FIXTURE,
          contract,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:01.000Z",
          probeIds.length,
          {
            sliceAtom: "P02-B04-A06",
            sliceCategories: VISIONER_GROUNDING_FAILURE_RECOVERY_CATEGORIES,
          },
        ),
        evidence,
        telemetry,
      );
      const validation = validateVisionerGroundingFailureRecoveryRunRecord(record, contract);
      if (!validation.valid) {
        return validation.issues.map(i => i.detail).join("; ");
      }
      return null;
    },
  },
] as const;

export function runVisionerGroundingPropertyChecks(
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
): VisionerGroundingPropertyResult {
  const failed: VisionerGroundingPropertyViolation[] = [];
  for (const property of VISIONER_GROUNDING_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = VISIONER_GROUNDING_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type VisionerGroundingFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface VisionerGroundingFuzzMutationCase {
  seed: number;
  kind: VisionerGroundingFuzzMutationKind;
  probeId?: string;
  category?: VisionerGroundingCategory;
}

export interface VisionerGroundingFuzzValidationCaseResult {
  mutation: VisionerGroundingFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface VisionerGroundingFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: VisionerGroundingFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createVisionerGroundingFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneVisionerGroundingBaseline(fixture: VisionerGroundingBaseline): VisionerGroundingBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickVisionerGroundingFuzzTarget(
  fixture: VisionerGroundingBaseline,
  rng: () => number,
): { category: VisionerGroundingCategory; index: number; entry: VisionerGroundingFixtureEntry } {
  const category = VISIONER_GROUNDING_CATEGORIES[Math.floor(rng() * VISIONER_GROUNDING_CATEGORIES.length)]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyVisionerGroundingFuzzMutation(
  fixture: VisionerGroundingBaseline,
  mutation: VisionerGroundingFuzzMutationCase,
): VisionerGroundingBaseline {
  const mutated = cloneVisionerGroundingBaseline(fixture);
  const targetCategory = mutation.category ?? VISIONER_GROUNDING_CATEGORIES[0]!;
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
          id: `vgrd.fuzz.extra.${mutation.seed}`,
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
      const other = VISIONER_GROUNDING_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateVisionerGroundingFuzzMutationCases(
  fixture: VisionerGroundingBaseline,
  seed: number,
  iterations: number,
): VisionerGroundingFuzzMutationCase[] {
  const rng = createVisionerGroundingFuzzRng(seed);
  const kinds: VisionerGroundingFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: VisionerGroundingFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickVisionerGroundingFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P02-B04-A07). */
export function runVisionerGroundingFuzzValidation(
  fixture: VisionerGroundingBaseline,
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
  seed = 42,
  iterations = 24,
): VisionerGroundingFuzzValidationResult {
  const cases = generateVisionerGroundingFuzzMutationCases(fixture, seed, iterations);
  const results: VisionerGroundingFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyVisionerGroundingFuzzMutation(fixture, mutation);
    const validation = validateVisionerGroundingAgainstContract(mutated, contract);
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

export type VisionerGroundingRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface VisionerGroundingRunRecordFuzzCase {
  kind: VisionerGroundingRunRecordFuzzKind;
  probeId?: string;
}

export function applyVisionerGroundingRunRecordFuzzMutation(
  record: VisionerGroundingRunRecord,
  mutation: VisionerGroundingRunRecordFuzzCase,
): VisionerGroundingRunRecord {
  const cloned: VisionerGroundingRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P02-B04-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["grounding_versioning"],
      };
      break;
  }

  cloned.summary = buildVisionerGroundingRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveVisionerGroundingRunRecordValidator(
  record: VisionerGroundingRunRecord,
): (
  record: VisionerGroundingRunRecord,
  contract: VisionerGroundingContract,
) => VisionerGroundingRunValidationResult {
  return record.provenance.sliceAtom === "P02-B04-A06"
    ? validateVisionerGroundingFailureRecoveryRunRecord
    : validateVisionerGroundingRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P02-B04-A07). */
export function runVisionerGroundingRunRecordFuzzValidation(
  record: VisionerGroundingRunRecord,
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveVisionerGroundingRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: VisionerGroundingRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P02-B04-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyVisionerGroundingRunRecordFuzzMutation(record, mutation);
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

// ─── Probe regression detection (P02-B04-A08) ────────────────────────────────

export interface VisionerGroundingProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare visioner grounding run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectVisionerGroundingProbeRegression(
  prior: VisionerGroundingRunRecord,
  current: VisionerGroundingRunRecord,
): VisionerGroundingProbeRegressionReport {
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

  const hasRegression = regressions.length > 0 || current.summary.mismatches > prior.summary.mismatches;
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

// ─── Guard controls (P02-B04-A09 foundation, used by A08 regression gate) ───

export interface ForgeVisionerGroundingGuardControls {
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

export interface VisionerGroundingGuardCheckIssue {
  domain: "adversarial" | "performance" | "cost" | "safety";
  code: string;
  detail: string;
}

export interface VisionerGroundingGuardCheckResult {
  passed: boolean;
  issues: VisionerGroundingGuardCheckIssue[];
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

export interface VisionerGroundingAdversarialGuardScenario {
  id: string;
  description: string;
  build: (record: VisionerGroundingRunRecord) => VisionerGroundingRunRecord;
  expectRejected: true;
}

export const FORGE_VISIONER_GROUNDING_GUARD_CONTROLS_V1: ForgeVisionerGroundingGuardControls = {
  atom: "P02-B04-A09",
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

export function getForgeVisionerGroundingGuardControls(): ForgeVisionerGroundingGuardControls {
  return FORGE_VISIONER_GROUNDING_GUARD_CONTROLS_V1;
}

function parseVisionerGroundingIsoDurationMs(startedAt: string, completedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function summarizeVisionerGroundingTelemetry(telemetry: VisionerGroundingProbeTelemetry[]): {
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

export function detectVisionerGroundingEvidenceSummaryMismatch(
  record: VisionerGroundingRunRecord,
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

export function detectVisionerGroundingFalseAlignment(record: VisionerGroundingRunRecord): string[] {
  const violations: string[] = [];
  for (const item of record.evidence) {
    const shouldAlign = item.actual === item.expected;
    if (item.aligned !== shouldAlign) {
      violations.push(`${item.probeId}: aligned=${item.aligned} actual=${item.actual} expected=${item.expected}`);
    }
    if (item.aligned && item.actual !== item.expected) {
      violations.push(`${item.probeId}: false PASS claim`);
    }
  }
  return violations;
}

export function validateVisionerGroundingSafety(
  record: VisionerGroundingRunRecord,
  controls: ForgeVisionerGroundingGuardControls = getForgeVisionerGroundingGuardControls(),
): VisionerGroundingGuardCheckIssue[] {
  const issues: VisionerGroundingGuardCheckIssue[] = [];
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

export function validateVisionerGroundingPerformance(
  record: VisionerGroundingRunRecord,
  controls: ForgeVisionerGroundingGuardControls = getForgeVisionerGroundingGuardControls(),
): VisionerGroundingGuardCheckIssue[] {
  const issues: VisionerGroundingGuardCheckIssue[] = [];
  const { suiteDurationMs, maxProbeDurationMs } = summarizeVisionerGroundingTelemetry(record.telemetry);
  const wallClockMs = parseVisionerGroundingIsoDurationMs(
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

export function validateVisionerGroundingCost(
  totalCostUsd: number,
  llmCalls: number,
  controls: ForgeVisionerGroundingGuardControls = getForgeVisionerGroundingGuardControls(),
): VisionerGroundingGuardCheckIssue[] {
  const issues: VisionerGroundingGuardCheckIssue[] = [];
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

export function buildVisionerGroundingAdversarialGuardScenarios(): VisionerGroundingAdversarialGuardScenario[] {
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

export function runVisionerGroundingAdversarialGuardChecks(
  fixtureRecord: VisionerGroundingRunRecord,
  contract: VisionerGroundingContract = getActiveVisionerGroundingContract(),
): { rejected: number; total: number; failures: string[] } {
  const scenarios = buildVisionerGroundingAdversarialGuardScenarios();
  const failures: string[] = [];
  let rejected = 0;

  for (const scenario of scenarios) {
    const tampered = scenario.build(fixtureRecord);
    const validation = validateVisionerGroundingRunRecord(tampered, contract);
    const falseAlignment = detectVisionerGroundingFalseAlignment(tampered);
    const summaryMismatch = detectVisionerGroundingEvidenceSummaryMismatch(tampered);
    const rejectedByGuard =
      !validation.valid || falseAlignment.length > 0 || summaryMismatch !== null;

    if (rejectedByGuard) rejected++;
    else failures.push(`${scenario.id}: tampered record was not rejected`);
  }

  return { rejected, total: scenarios.length, failures };
}

export function validateForgeVisionerGroundingGuard(
  record: VisionerGroundingRunRecord,
  options: {
    totalCostUsd?: number;
    llmCalls?: number;
    contract?: VisionerGroundingContract;
    controls?: ForgeVisionerGroundingGuardControls;
  } = {},
): VisionerGroundingGuardCheckResult {
  const controls = options.controls ?? getForgeVisionerGroundingGuardControls();
  const contract = options.contract ?? getActiveVisionerGroundingContract();
  const totalCostUsd = options.totalCostUsd ?? 0;
  const llmCalls = options.llmCalls ?? 0;
  const issues: VisionerGroundingGuardCheckIssue[] = [];

  issues.push(...validateVisionerGroundingPerformance(record, controls));
  issues.push(...validateVisionerGroundingCost(totalCostUsd, llmCalls, controls));
  issues.push(...validateVisionerGroundingSafety(record, controls));

  const falseAlignment = detectVisionerGroundingFalseAlignment(record);
  if (falseAlignment.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "false_alignment",
      detail: falseAlignment.join("; "),
    });
  }
  const summaryMismatch = detectVisionerGroundingEvidenceSummaryMismatch(record);
  if (summaryMismatch) {
    issues.push({
      domain: "adversarial",
      code: "summary_evidence_mismatch",
      detail: summaryMismatch,
    });
  }

  const adversarial = runVisionerGroundingAdversarialGuardChecks(record, contract);
  if (adversarial.failures.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "scenario_not_rejected",
      detail: adversarial.failures.join("; "),
    });
  }

  const telemetrySummary = summarizeVisionerGroundingTelemetry(record.telemetry);
  const wallClockMs = parseVisionerGroundingIsoDurationMs(
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
