/**
 * FOREMAN — Visioner Constraint & Non-Goal Baseline (P02-B02)
 *
 * Measures constraint extraction, non-goal detection and vision constraint wiring
 * on sealed P02-B01 visioner intent block gate artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP02B01ToB02Handoff,
  getActiveVisionerIntentContract,
  summarizeVisionerIntentContractCoverage,
} from "./forge-p02-visioner-intent.js";

export const FORGE_VISIONER_CONSTRAINT_VERSION = "1.0.0-a06";

/** Maximum normalized vision length before truncation (P02-B02-A04 boundary). */
export const VISIONER_CONSTRAINT_VISION_MAX_LENGTH = 32000;

export const VISIONER_CONSTRAINT_CATEGORIES = [
  "constraint_versioning",
  "constraint_signal",
  "non_goal_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type VisionerConstraintCategory = (typeof VISIONER_CONSTRAINT_CATEGORIES)[number];

export interface VisionerConstraintPresence {
  hasConstraints: boolean;
  hasNonGoals: boolean;
  constraintLines: string[];
  nonGoalLines: string[];
  detail: string;
}

export type VisionerConstraintInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface VisionerConstraintInputBoundary {
  disposition: VisionerConstraintInputDisposition;
  acceptable: boolean;
  normalizedVision: string;
  truncated: boolean;
  detail: string;
}

/**
 * Assess vision output boundary conditions — empty, whitespace-only, null bytes, max length (P02-B02-A04).
 */
export function assessVisionerConstraintInputBoundary(
  visionOutput: string,
): VisionerConstraintInputBoundary {
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
    const disposition: VisionerConstraintInputDisposition =
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
  if (normalizedVision.length > VISIONER_CONSTRAINT_VISION_MAX_LENGTH) {
    normalizedVision = normalizedVision.slice(0, VISIONER_CONSTRAINT_VISION_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedVision,
    truncated,
    detail: truncated
      ? `vision truncated to ${VISIONER_CONSTRAINT_VISION_MAX_LENGTH} characters`
      : "valid vision output",
  };
}

/**
 * Assess whether vision output declares CONSTRAINT and FORBIDDEN (non-goal) sections (P02-B02-A01).
 */
export function assessVisionerConstraintPresence(visionOutput: string): VisionerConstraintPresence {
  const boundary = assessVisionerConstraintInputBoundary(visionOutput);
  if (!boundary.acceptable) {
    return {
      hasConstraints: false,
      hasNonGoals: false,
      constraintLines: [],
      nonGoalLines: [],
      detail: boundary.detail,
    };
  }

  const visionOutputNormalized = boundary.normalizedVision;

  const lines = visionOutputNormalized.split("\n");
  const constraintLines: string[] = [];
  const nonGoalLines: string[] = [];
  const constraintHeader = /^\*?\*?\s*CONSTRAINT/i;
  const forbiddenHeader = /^\*?\*?\s*FORBIDDEN/i;
  const sectionHeader = /^\*?\*?\s*[A-Z][A-Z\s-]+/;

  let mode: "constraint" | "forbidden" | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (constraintHeader.test(trimmed)) {
      mode = "constraint";
      constraintLines.push(trimmed);
      continue;
    }
    if (forbiddenHeader.test(trimmed)) {
      mode = "forbidden";
      nonGoalLines.push(trimmed);
      continue;
    }
    if (mode === "constraint" && trimmed.length > 0) {
      if (sectionHeader.test(trimmed) && !constraintHeader.test(trimmed)) {
        mode = null;
      } else {
        constraintLines.push(trimmed);
      }
      continue;
    }
    if (mode === "forbidden" && trimmed.length > 0) {
      if (sectionHeader.test(trimmed) && !forbiddenHeader.test(trimmed)) {
        mode = null;
      } else {
        nonGoalLines.push(trimmed);
      }
    }
  }

  return {
    hasConstraints: constraintLines.length > 0,
    hasNonGoals: nonGoalLines.length > 0,
    constraintLines,
    nonGoalLines,
    detail: `constraints=${constraintLines.length}, nonGoals=${nonGoalLines.length}`,
  };
}

export interface VisionerConstraintExtract {
  constraints: string[];
  nonGoals: string[];
  hasConstraints: boolean;
  hasNonGoals: boolean;
  presence: VisionerConstraintPresence;
  detail: string;
}

/**
 * Parse vision output into structured constraints and non-goals (P02-B02-A03 production slice).
 */
export function extractVisionerConstraints(visionOutput: string): VisionerConstraintExtract {
  const presence = assessVisionerConstraintPresence(visionOutput);
  const constraintHeader = /^\*?\*?\s*CONSTRAINTS?:?\s*/i;
  const forbiddenHeader = /^\*?\*?\s*FORBIDDEN:?\s*/i;

  const constraints: string[] = [];
  for (const line of presence.constraintLines) {
    const trimmed = line.trim();
    const inline = trimmed.replace(constraintHeader, "").trim();
    if (constraintHeader.test(trimmed) && inline.length > 0) {
      constraints.push(inline);
    } else if (!constraintHeader.test(trimmed)) {
      constraints.push(trimmed.replace(/^[-*]\s*/, "").trim());
    }
  }

  const nonGoals: string[] = [];
  for (const line of presence.nonGoalLines) {
    const trimmed = line.trim();
    const inline = trimmed.replace(forbiddenHeader, "").trim();
    if (forbiddenHeader.test(trimmed) && inline.length > 0) {
      nonGoals.push(inline);
    } else if (!forbiddenHeader.test(trimmed)) {
      nonGoals.push(trimmed.replace(/^[-*]\s*/, "").trim());
    }
  }

  return {
    constraints: constraints.filter(Boolean),
    nonGoals: nonGoals.filter(Boolean),
    hasConstraints: presence.hasConstraints,
    hasNonGoals: presence.hasNonGoals,
    presence,
    detail: presence.detail,
  };
}

const VISION_SUMMARY_KEEP_HEADERS =
  /^\*?\*?\s*(?:GOAL|ACCEPTANCE|FORBIDDEN|CONSTRAINT|COLOR|TYPOGRAPHY|FONT|FOCAL|EMOTION|MOTION\s*BUDGET|SPACE|APPROACH)/i;
const VISION_SUMMARY_STOP_HEADERS =
  /^\*?\*?\s*(?:REFERENCE|BENCHMARK|RESEARCH|INSPIRATION|EXAMPLE|CONTEXT|NOTE)/i;

/**
 * Build compact vision summary for atom-level constraint injection (P02-B02-A03).
 */
export function buildVisionConstraintSummary(visionOutput: string): string {
  const extracted = extractVisionerConstraints(visionOutput);
  const lines = visionOutput.split("\n");
  const sections: string[] = [];
  let currentSection = "";
  let capturing = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (VISION_SUMMARY_KEEP_HEADERS.test(trimmed)) {
      if (currentSection) sections.push(currentSection.trim());
      currentSection = `${trimmed}\n`;
      capturing = true;
    } else if (
      VISION_SUMMARY_STOP_HEADERS.test(trimmed) ||
      (capturing && /^#{1,3}\s/.test(trimmed) && !VISION_SUMMARY_KEEP_HEADERS.test(trimmed))
    ) {
      if (currentSection) sections.push(currentSection.trim());
      currentSection = "";
      capturing = false;
    } else if (capturing) {
      currentSection += `${trimmed}\n`;
    }
  }
  if (currentSection) sections.push(currentSection.trim());

  if (sections.length === 0 && (extracted.hasConstraints || extracted.hasNonGoals)) {
    const fallbackSections: string[] = [];
    if (extracted.constraints.length > 0) {
      fallbackSections.push(`**CONSTRAINTS**:\n${extracted.constraints.map(c => `- ${c}`).join("\n")}`);
    }
    if (extracted.nonGoals.length > 0) {
      fallbackSections.push(`**FORBIDDEN**:\n${extracted.nonGoals.map(g => `- ${g}`).join("\n")}`);
    }
    if (fallbackSections.length > 0) {
      return `VISION SUMMARY (key constraints — full doc pinned at pipeline level):\n${fallbackSections.join("\n\n")}`;
    }
  }

  if (sections.length > 0) {
    const summary = sections.join("\n\n");
    if (summary.length > 100 && summary.length < visionOutput.length * 0.8) {
      return `VISION SUMMARY (key constraints — full doc pinned at pipeline level):\n${summary}`;
    }
  }

  if (visionOutput.length > 1000) {
    return `VISION SUMMARY (truncated — full doc pinned at pipeline level):\n${visionOutput.slice(0, 600)}\n...\n${visionOutput.slice(-200)}`;
  }

  return `VISION DOCUMENT:\n${visionOutput}`;
}

export interface VisionerConstraintProbeMatrixValidationIssue {
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

export interface VisionerConstraintProbeMatrixValidationResult {
  valid: boolean;
  issues: VisionerConstraintProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 */
export function validateVisionerConstraintProbeMatrix(
  results: VisionerConstraintProbeResult[],
  contract: VisionerConstraintContract = getActiveVisionerConstraintContract(),
): VisionerConstraintProbeMatrixValidationResult {
  const issues: VisionerConstraintProbeMatrixValidationIssue[] = [];
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
export function validateVisionerConstraintBoundaryProbeMatrix(
  results: VisionerConstraintProbeResult[],
  contract: VisionerConstraintContract = getActiveVisionerConstraintContract(),
): VisionerConstraintProbeMatrixValidationResult {
  const boundaryProbes = listVisionerConstraintContractProbesByCategory("boundary", contract);
  const boundaryContract: VisionerConstraintContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateVisionerConstraintProbeMatrix(boundaryResults, boundaryContract);
}

export const VISIONER_CONSTRAINT_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly VisionerConstraintCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes and documented FAIL gaps must align; zero unexpected mismatches.
 */
export function validateVisionerConstraintFailureRecoveryProbeMatrix(
  results: VisionerConstraintProbeResult[],
  contract: VisionerConstraintContract = getActiveVisionerConstraintContract(),
): VisionerConstraintProbeMatrixValidationResult {
  const failureRecoveryProbes = VISIONER_CONSTRAINT_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listVisionerConstraintContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: VisionerConstraintContract = {
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
  return validateVisionerConstraintProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listVisionerConstraintFailureRecoveryProbeIds(
  contract: VisionerConstraintContract = getActiveVisionerConstraintContract(),
): string[] {
  return VISIONER_CONSTRAINT_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listVisionerConstraintContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface VisionerConstraintFixtureEntry {
  id: string;
  category: VisionerConstraintCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface VisionerConstraintBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    visionerIntentProbeCount: number;
    sealedAtomCount: number;
  };
  probes: VisionerConstraintFixtureEntry[];
}

export interface VisionerConstraintProbeResult {
  id: string;
  category: VisionerConstraintCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface VisionerConstraintProbeSummary {
  total: number;
  aligned: number;
  mismatches: VisionerConstraintProbeResult[];
  knownGaps: VisionerConstraintProbeResult[];
  byCategory: Record<
    VisionerConstraintCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface VisionerConstraintValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: VisionerConstraintCategory;
  detail: string;
}

export interface VisionerConstraintValidationResult {
  valid: boolean;
  issues: VisionerConstraintValidationIssue[];
}

export interface VisionerConstraintContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: VisionerConstraintCategory;
  detail: string;
}

export interface VisionerConstraintContractCoverageResult {
  valid: boolean;
  issues: VisionerConstraintContractCoverageIssue[];
}

export type VisionerConstraintProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface VisionerConstraintProbeContract {
  id: string;
  category: VisionerConstraintCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: VisionerConstraintProbeDisposition;
  criterion: string;
}

export interface VisionerConstraintCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface VisionerConstraintCategoryContract {
  category: VisionerConstraintCategory;
  acceptance: VisionerConstraintCategoryAcceptance;
  probes: readonly VisionerConstraintProbeContract[];
}

export interface VisionerConstraintContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<VisionerConstraintCategory, VisionerConstraintCategoryContract>;
  probes: readonly VisionerConstraintProbeContract[];
}

export const VISIONER_CONSTRAINT_A01_MIN_PROBES: Readonly<
  Record<VisionerConstraintCategory, number>
> = {
  constraint_versioning: 3,
  constraint_signal: 3,
  non_goal_signal: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

function flattenVisionerConstraintCategoryProbes(
  categories: Record<VisionerConstraintCategory, VisionerConstraintCategoryContract>,
): readonly VisionerConstraintProbeContract[] {
  return VISIONER_CONSTRAINT_CATEGORIES.flatMap(category => categories[category].probes);
}

const VISIONER_CONSTRAINT_CATEGORY_CONTRACTS: Record<
  VisionerConstraintCategory,
  VisionerConstraintCategoryContract
> = {
  constraint_versioning: {
    category: "constraint_versioning",
    acceptance: {
      invariant:
        "Visioner constraint baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vcon.version_tagged",
        category: "constraint_versioning",
        description: "Visioner constraint baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner constraint baseline declares semver version field",
      },
      {
        id: "vcon.atom_tagged",
        category: "constraint_versioning",
        description: "Visioner constraint baseline declares P02-B02-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner constraint baseline declares P02-B02-A01 atom id",
      },
      {
        id: "vcon.harness_version_exported",
        category: "constraint_versioning",
        description: "FORGE_VISIONER_CONSTRAINT_VERSION exported for constraint harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_VISIONER_CONSTRAINT_VERSION exported for constraint harness",
      },
    ],
  },
  constraint_signal: {
    category: "constraint_signal",
    acceptance: {
      invariant:
        "Visioner prompt and orchestrator vision summary wiring expose CONSTRAINT sections.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vcon.prompt_constraints_section",
        category: "constraint_signal",
        description: "VISIONER_SYSTEM prompt declares CONSTRAINTS output section",
        expected: "PASS",
        disposition: "observed",
        criterion: "VISIONER_SYSTEM prompt declares CONSTRAINTS output section",
      },
      {
        id: "vcon.prompt_forbidden_section",
        category: "constraint_signal",
        description: "VISIONER_SYSTEM prompt declares FORBIDDEN output section",
        expected: "PASS",
        disposition: "observed",
        criterion: "VISIONER_SYSTEM prompt declares FORBIDDEN output section",
      },
      {
        id: "vcon.vision_summary_constraint_extract",
        category: "constraint_signal",
        description: "Orchestrator buildVisionSummary extracts CONSTRAINT headers from vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator buildVisionSummary extracts CONSTRAINT headers from vision output",
      },
    ],
  },
  non_goal_signal: {
    category: "non_goal_signal",
    acceptance: {
      invariant:
        "Non-goal (FORBIDDEN) rules are declared in visioner prompt and pinned through pipeline context.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vcon.forbidden_list_rules",
        category: "non_goal_signal",
        description: "VISIONER_SYSTEM prompt declares FORBIDDEN LIST rules for non-goals",
        expected: "PASS",
        disposition: "observed",
        criterion: "VISIONER_SYSTEM prompt declares FORBIDDEN LIST rules for non-goals",
      },
      {
        id: "vcon.vision_pinned_constraints",
        category: "non_goal_signal",
        description: "Orchestrator pins vision document with respect-all-constraints directive",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator pins vision document with respect-all-constraints directive",
      },
      {
        id: "vcon.non_goal_forbidden_extract",
        category: "non_goal_signal",
        description: "assessVisionerConstraintPresence detects FORBIDDEN non-goal sections",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerConstraintPresence detects FORBIDDEN non-goal sections",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Constraint baseline links to sealed P02-B01 block gate and visioner intent handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vcon.b01_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P02_B01_TO_B02_HANDOFF_V1 targets P02-B02-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P02_B01_TO_B02_HANDOFF_V1 targets P02-B02-A01 entry atom",
      },
      {
        id: "vcon.b01_sealed_intent_probes",
        category: "baseline_link",
        description: "P02-B01→B02 handoff sealed probeCount matches active visioner intent contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P02-B01→B02 handoff sealed probeCount matches active visioner intent contract",
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
        id: "vcon.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P02-B01 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P02-B01 block gate source artifacts",
      },
      {
        id: "vcon.probe_runner_exported",
        category: "boundary",
        description: "runVisionerConstraintProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runVisionerConstraintProbes executes contract-wired probe matrix",
      },
      {
        id: "vcon.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL constraint gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL constraint gap",
      },
      {
        id: "vcon.empty_vision_constraint_presence",
        category: "boundary",
        description: "assessVisionerConstraintInputBoundary rejects empty vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerConstraintInputBoundary rejects empty vision output",
      },
      {
        id: "vcon.whitespace_vision_boundary",
        category: "boundary",
        description: "assessVisionerConstraintInputBoundary rejects whitespace-only vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerConstraintInputBoundary rejects whitespace-only vision output",
      },
      {
        id: "vcon.long_vision_truncation_boundary",
        category: "boundary",
        description: "assessVisionerConstraintInputBoundary truncates vision exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerConstraintInputBoundary truncates vision exceeding max length",
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
        id: "vcon.invalid_version_rejected",
        category: "failure_path",
        description: "validateVisionerConstraintBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateVisionerConstraintBaseline rejects unexpected fixture version",
      },
      {
        id: "vcon.malformed_vision_presence_guard",
        category: "failure_path",
        description: "assessVisionerConstraintPresence rejects null-byte vision output safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessVisionerConstraintPresence rejects null-byte vision output safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Checkpoint resume preserves vision constraints; structured constraint recovery is a documented gap.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vcon.vision_checkpoint_constraints",
        category: "recovery_path",
        description: "Pipeline resume reuses checkpoint vision output containing constraint sections",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Pipeline resume reuses checkpoint vision output containing constraint sections",
      },
      {
        id: "vcon.structured_constraint_recovery",
        category: "recovery_path",
        description: "recoverVisionerConstraints restructures failed constraint parse into actionable guardrails",
        expected: "FAIL",
        disposition: "gap",
        criterion: "recoverVisionerConstraints restructures failed constraint parse into actionable guardrails",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Strategist can block contradictory vision; worker can BLOCK when atom violates constraints.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vcon.strategist_contradiction_block",
        category: "nogo_path",
        description: "Strategist prompt can BLOCK visioner on internal contradictions",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Strategist prompt can BLOCK visioner on internal contradictions",
      },
      {
        id: "vcon.worker_constraint_nogo",
        category: "nogo_path",
        description: "Worker prompt can BLOCK when atom contradicts vision constraints",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Worker prompt can BLOCK when atom contradicts vision constraints",
      },
    ],
  },
};

export const FORGE_VISIONER_CONSTRAINT_CONTRACT_V1: VisionerConstraintContract = {
  version: "1.0.0",
  atom: "P02-B02-A05",
  purpose:
    "Typed visioner constraint contract declaring measurable constraint signal, non-goal and guard probes.",
  categories: VISIONER_CONSTRAINT_CATEGORY_CONTRACTS,
  probes: flattenVisionerConstraintCategoryProbes(VISIONER_CONSTRAINT_CATEGORY_CONTRACTS),
};

export const EXPECTED_P02_B01_SEALED_ATOM_COUNT = 10;

export function getActiveVisionerConstraintContract(): VisionerConstraintContract {
  return FORGE_VISIONER_CONSTRAINT_CONTRACT_V1;
}

export function getVisionerConstraintCategoryContract(
  category: VisionerConstraintCategory,
  contract: VisionerConstraintContract = getActiveVisionerConstraintContract(),
): VisionerConstraintCategoryContract {
  return contract.categories[category];
}

export function listVisionerConstraintContractProbeIds(
  contract: VisionerConstraintContract = getActiveVisionerConstraintContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listVisionerConstraintProbesByDisposition(
  disposition: VisionerConstraintProbeDisposition,
  contract: VisionerConstraintContract = getActiveVisionerConstraintContract(),
): VisionerConstraintProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listVisionerConstraintContractProbesByCategory(
  category: VisionerConstraintCategory,
  contract: VisionerConstraintContract = getActiveVisionerConstraintContract(),
): VisionerConstraintProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeVisionerConstraintContractCoverage(
  contract: VisionerConstraintContract = getActiveVisionerConstraintContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<VisionerConstraintCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<VisionerConstraintProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    VisionerConstraintCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<VisionerConstraintProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of VISIONER_CONSTRAINT_CATEGORIES) {
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

export function validateVisionerConstraintContractCoverage(
  contract: VisionerConstraintContract = getActiveVisionerConstraintContract(),
): VisionerConstraintContractCoverageResult {
  const issues: VisionerConstraintContractCoverageIssue[] = [];

  for (const category of VISIONER_CONSTRAINT_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < VISIONER_CONSTRAINT_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${VISIONER_CONSTRAINT_A01_MIN_PROBES[category]}`,
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

  const ids = listVisionerConstraintContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeVisionerConstraintContractCoverage(contract);
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
    if (!probe.id.startsWith("vcon.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing vcon. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function buildDefaultSourceBlockGate(): VisionerConstraintBaseline["sourceBlockGate"] {
  const handoff = getForgeP02B01ToB02Handoff();
  const intentCoverage = summarizeVisionerIntentContractCoverage(getActiveVisionerIntentContract());
  return {
    version: handoff.version,
    atom: handoff.atom,
    contractVersion: handoff.version,
    visionerIntentProbeCount: intentCoverage.totalProbes,
    sealedAtomCount: EXPECTED_P02_B01_SEALED_ATOM_COUNT,
  };
}

export function validateVisionerConstraintAgainstContract(
  fixture: VisionerConstraintBaseline,
  contract: VisionerConstraintContract = getActiveVisionerConstraintContract(),
): VisionerConstraintValidationResult {
  const issues: VisionerConstraintValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of VISIONER_CONSTRAINT_CATEGORIES) {
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

export function validateVisionerConstraintBaseline(
  fixture: VisionerConstraintBaseline,
): VisionerConstraintValidationResult {
  const issues: VisionerConstraintValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P02-B02-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    VISIONER_CONSTRAINT_CATEGORIES.map(category => [category, 0]),
  ) as Record<VisionerConstraintCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of VISIONER_CONSTRAINT_CATEGORIES) {
    const min = VISIONER_CONSTRAINT_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP02B01ToB02Handoff();
  const intentCoverage = summarizeVisionerIntentContractCoverage(getActiveVisionerIntentContract());

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (fixture.sourceBlockGate.visionerIntentProbeCount !== intentCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.visionerIntentProbeCount=${fixture.sourceBlockGate.visionerIntentProbeCount} contract=${intentCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P02_B01_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} expected=${EXPECTED_P02_B01_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P02_B01_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail: `B01 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} expected=${EXPECTED_P02_B01_SEALED_ATOM_COUNT}`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length < 1) {
    issues.push({
      kind: "missing_category",
      detail: "A01 fixture must document at least one known FAIL gap",
    });
  }

  const contractAlignment = validateVisionerConstraintAgainstContract(fixture, getActiveVisionerConstraintContract());
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeVisionerConstraintMatrix(
  results: VisionerConstraintProbeResult[],
): VisionerConstraintProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as VisionerConstraintProbeSummary["byCategory"];
  for (const category of VISIONER_CONSTRAINT_CATEGORIES) {
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

export function listVisionerConstraintProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerConstraintBaseline,
): VisionerConstraintFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listVisionerConstraintKnownGaps(
  results: VisionerConstraintProbeResult[],
): VisionerConstraintProbeResult[] {
  return summarizeVisionerConstraintMatrix(results).knownGaps;
}

/** Per-probe evidence artifact — disposition, criterion and aligned outcomes (P02-B02-A06). */
export interface VisionerConstraintProbeEvidence {
  probeId: string;
  category: VisionerConstraintCategory;
  disposition: VisionerConstraintProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for visioner constraint runs (P02-B02-A06). */
export interface VisionerConstraintProbeTelemetry {
  probeId: string;
  category: VisionerConstraintCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P02-B02-A06). */
export interface VisionerConstraintProvenance {
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
  sliceCategories?: readonly VisionerConstraintCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated visioner constraint run record bundling evidence, telemetry and provenance. */
export interface VisionerConstraintRunRecord {
  provenance: VisionerConstraintProvenance;
  evidence: VisionerConstraintProbeEvidence[];
  telemetry: VisionerConstraintProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<VisionerConstraintCategory, number>;
    byDisposition: Record<VisionerConstraintProbeDisposition, number>;
  };
}

export interface VisionerConstraintRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface VisionerConstraintRunValidationResult {
  valid: boolean;
  issues: VisionerConstraintRunValidationIssue[];
}

export function buildVisionerConstraintProbeEvidence(
  probeId: string,
  category: VisionerConstraintCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: VisionerConstraintProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): VisionerConstraintProbeEvidence {
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

export function buildVisionerConstraintProbeTelemetry(
  probeId: string,
  category: VisionerConstraintCategory,
  sequenceIndex: number,
  durationMs: number,
): VisionerConstraintProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildVisionerConstraintProvenance(
  runId: string,
  fixture: VisionerConstraintBaseline,
  contract: VisionerConstraintContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly VisionerConstraintCategory[];
  },
): VisionerConstraintProvenance {
  return {
    runId,
    harnessVersion: FORGE_VISIONER_CONSTRAINT_VERSION,
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

export function buildVisionerConstraintRunRecord(
  provenance: VisionerConstraintProvenance,
  evidence: VisionerConstraintProbeEvidence[],
  telemetry: VisionerConstraintProbeTelemetry[],
): VisionerConstraintRunRecord {
  const byCategory = {} as Record<VisionerConstraintCategory, number>;
  const byDisposition: Record<VisionerConstraintProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of VISIONER_CONSTRAINT_CATEGORIES) {
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

function validateVisionerConstraintRunRecordAgainstProbeIds(
  record: VisionerConstraintRunRecord,
  expectedProbeIds: string[],
  contract: VisionerConstraintContract,
): VisionerConstraintRunValidationResult {
  const issues: VisionerConstraintRunValidationIssue[] = [];
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

export function validateVisionerConstraintRunRecord(
  record: VisionerConstraintRunRecord,
  contract: VisionerConstraintContract = getActiveVisionerConstraintContract(),
): VisionerConstraintRunValidationResult {
  return validateVisionerConstraintRunRecordAgainstProbeIds(
    record,
    listVisionerConstraintContractProbeIds(contract),
    contract,
  );
}

/** Validate failure/recovery slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateVisionerConstraintFailureRecoveryRunRecord(
  record: VisionerConstraintRunRecord,
  contract: VisionerConstraintContract = getActiveVisionerConstraintContract(),
): VisionerConstraintRunValidationResult {
  const issues: VisionerConstraintRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P02-B02-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P02-B02-A06`,
    });
  }

  const expectedCategories = [...VISIONER_CONSTRAINT_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateVisionerConstraintRunRecordAgainstProbeIds(
    record,
    listVisionerConstraintFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}
