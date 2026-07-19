/**
 * FOREMAN — Visioner Intent & Task Understanding Baseline (P02-B01)
 *
 * Measures visioner intent parsing, task depth routing and ambiguity handling
 * on sealed P01 phase gate artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP01ToP02PhaseHandoff,
  P01_PHASE_ATOM_COUNT,
} from "./forge-p01-phase-gate.js";
import {
  EXPECTED_SEALED_BLOCK_COUNT,
  getActiveIntegratedBaselineContract,
  summarizeIntegratedBaselineContractCoverage,
} from "./forge-integrated-baseline.js";

export const FORGE_VISIONER_INTENT_VERSION = "1.0.0-b07";

/** Maximum normalized task length before truncation (P02-B01-A04 boundary). */
export const VISIONER_TASK_MAX_LENGTH = 8000;

/** Default ambiguity threshold for NO-GO gate before vision spend (P02-B01-A04). */
export const VISIONER_INTENT_AMBIGUITY_THRESHOLD = 0.65;

export type VisionerTaskInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "too_short"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface VisionerTaskInputBoundary {
  disposition: VisionerTaskInputDisposition;
  acceptable: boolean;
  normalizedTask: string;
  truncated: boolean;
  detail: string;
}

export interface VisionerIntentAmbiguityCheck {
  shouldBlock: boolean;
  ambiguityScore: number;
  threshold: number;
  reason?: string;
}

export type VisionerTaskDepth = "simple" | "medium" | "complex";

export interface VisionerTaskIntent {
  rawTask: string;
  normalizedTask: string;
  wordCount: number;
  signals: string[];
  goals: string[];
  fileReferences: string[];
  ambiguityScore: number;
  depth: VisionerTaskDepth;
}

const SIMPLE_TASK_SIGNALS = [
  /\b(fix|patch|rename|typo|update\s+\w+\.\w+|delete\s+\w+\.\w+|add\s+\w+\.\w+)\b/i,
  /\b(single\s+file|config\s+change|one\s+line)\b/i,
] as const;

const COMPLEX_TASK_SIGNALS = [
  /\b(architecture|full\s+system|multi-?component|ui\s+design|redesign|platform|end-?to-?end)\b/i,
  /\b(comprehensive|entire\s+codebase|from\s+scratch)\b/i,
] as const;

const FILE_REFERENCE_PATTERN = /(?:[\w.-]+\/)+[\w.-]+\.\w+|\b[\w.-]+\.\w{1,6}\b/g;

/**
 * Assess task input boundary conditions — empty, whitespace-only, null bytes, max length (P02-B01-A04).
 */
export function assessVisionerTaskInputBoundary(rawTask: string): VisionerTaskInputBoundary {
  if (rawTask.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedTask: "",
      truncated: false,
      detail: "null byte detected in task input",
    };
  }

  const collapsed = rawTask.trim().replace(/\s+/g, " ");
  if (collapsed.length === 0) {
    const disposition: VisionerTaskInputDisposition =
      rawTask.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedTask: "",
      truncated: false,
      detail: disposition === "empty" ? "empty task input" : "whitespace-only task input",
    };
  }

  let normalizedTask = collapsed;
  let truncated = false;
  if (normalizedTask.length > VISIONER_TASK_MAX_LENGTH) {
    normalizedTask = normalizedTask.slice(0, VISIONER_TASK_MAX_LENGTH);
    truncated = true;
  }

  if (normalizedTask.length < 2) {
    return {
      disposition: "too_short",
      acceptable: false,
      normalizedTask,
      truncated,
      detail: "task too short after normalization",
    };
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedTask,
    truncated,
    detail: truncated
      ? `task truncated to ${VISIONER_TASK_MAX_LENGTH} characters`
      : "valid task input",
  };
}

/**
 * NO-GO gate: block ambiguous tasks before vision LLM spend (P02-B01-A04).
 */
export function checkVisionerIntentAmbiguity(
  input: string | VisionerTaskIntent,
  threshold: number = VISIONER_INTENT_AMBIGUITY_THRESHOLD,
): VisionerIntentAmbiguityCheck {
  const intent = typeof input === "string" ? parseVisionerTaskIntent(input) : input;
  const shouldBlock = intent.ambiguityScore >= threshold;
  return {
    shouldBlock,
    ambiguityScore: intent.ambiguityScore,
    threshold,
    reason: shouldBlock
      ? `ambiguity score ${intent.ambiguityScore.toFixed(2)} >= ${threshold}`
      : undefined,
  };
}

/**
 * Parse raw user task into structured visioner intent (P02-B01-A03 production slice).
 */
export function parseVisionerTaskIntent(rawTask: string): VisionerTaskIntent {
  const boundary = assessVisionerTaskInputBoundary(rawTask);
  const normalizedTask = boundary.normalizedTask;
  const words = normalizedTask.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const fileReferences = [...new Set(normalizedTask.match(FILE_REFERENCE_PATTERN) ?? [])];

  const signals: string[] = [];
  if (/\b(fix|bug|patch|repair|resolve)\b/i.test(normalizedTask)) signals.push("fix");
  if (/\b(add|create|implement|build|introduce)\b/i.test(normalizedTask)) signals.push("create");
  if (/\b(refactor|restructure|migrate|optimize)\b/i.test(normalizedTask)) signals.push("refactor");
  if (/\b(test|verify|validate|benchmark)\b/i.test(normalizedTask)) signals.push("verify");
  if (/\b(design|ui|ux|layout|theme)\b/i.test(normalizedTask)) signals.push("design");

  const goals = normalizedTask
    .split(/[.!?]\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 8)
    .slice(0, 4);

  let ambiguityScore = 0;
  if (!boundary.acceptable) {
    ambiguityScore = 1;
  } else {
    if (wordCount < 4) ambiguityScore += 0.4;
    if (/\b(maybe|perhaps|something|stuff|etc\.?|whatever)\b/i.test(normalizedTask)) ambiguityScore += 0.3;
    if (/\b(or|either)\b/i.test(normalizedTask)) ambiguityScore += 0.2;
    if (goals.length === 0 && wordCount > 0) ambiguityScore += 0.1;
    ambiguityScore = Math.min(1, ambiguityScore);
  }

  const depth = classifyVisionerTaskDepth(rawTask, {
    rawTask,
    normalizedTask,
    wordCount,
    signals,
    goals,
    fileReferences,
    ambiguityScore,
    depth: "medium",
  });

  return {
    rawTask,
    normalizedTask,
    wordCount,
    signals,
    goals: goals.length > 0 ? goals : [normalizedTask],
    fileReferences,
    ambiguityScore,
    depth,
  };
}

/**
 * Programmatically classify task complexity for vision depth routing (P02-B01-A03).
 */
export function classifyVisionerTaskDepth(
  rawTask: string,
  intent?: Pick<VisionerTaskIntent, "normalizedTask" | "wordCount" | "fileReferences" | "signals">,
): VisionerTaskDepth {
  const task = intent?.normalizedTask ?? rawTask.trim().replace(/\s+/g, " ");
  const wordCount = intent?.wordCount ?? task.split(/\s+/).filter(Boolean).length;
  const fileCount = intent?.fileReferences?.length ?? [...new Set(task.match(FILE_REFERENCE_PATTERN) ?? [])].length;
  const signalCount = intent?.signals?.length ?? 0;

  if (
    COMPLEX_TASK_SIGNALS.some(p => p.test(task)) ||
    wordCount > 80 ||
    fileCount > 5 ||
    signalCount >= 4
  ) {
    return "complex";
  }

  if (
    wordCount <= 18 &&
    fileCount <= 1 &&
    SIMPLE_TASK_SIGNALS.some(p => p.test(task))
  ) {
    return "simple";
  }

  if (wordCount <= 12 && fileCount === 0 && signalCount <= 1) {
    return "simple";
  }

  return "medium";
}

const VISIONER_DEPTH_DIRECTIVES: Record<VisionerTaskDepth, string> = {
  simple:
    "This is a SIMPLE task. Keep vision SHORT and PRACTICAL — goal, acceptance criteria, constraints only.",
  medium:
    "This is a MEDIUM complexity task. Provide moderate vision with clear technical direction and scope boundaries.",
  complex:
    "This is a COMPLEX task. Produce a full creative vision document with design principles and emotional targets.",
};

/**
 * Select depth-routed vision prompt variant for orchestrator vision phase (P02-B01-A03).
 */
export function buildVisionPromptForDepth(
  depth: VisionerTaskDepth,
  task: string,
  projectContext: string,
  identityContext: string,
): string {
  const directive = VISIONER_DEPTH_DIRECTIVES[depth];
  const identitySuffix = identityContext ? `\n\n${identityContext}` : "";
  return `${directive}\n\nDefine the complete vision for this project. What should it feel like? What makes it unique? What are the design principles?\n\nProject: ${task}${projectContext}${identitySuffix}`;
}

export interface VisionerIntentProbeMatrixValidationIssue {
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

export interface VisionerIntentProbeMatrixValidationResult {
  valid: boolean;
  issues: VisionerIntentProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 * PASS probes must align; documented FAIL gaps must remain aligned (actual === FAIL).
 */
export function validateVisionerIntentProbeMatrix(
  results: VisionerIntentProbeResult[],
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
): VisionerIntentProbeMatrixValidationResult {
  const issues: VisionerIntentProbeMatrixValidationIssue[] = [];
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
export function validateVisionerIntentBoundaryProbeMatrix(
  results: VisionerIntentProbeResult[],
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
): VisionerIntentProbeMatrixValidationResult {
  const boundaryProbes = listVisionerIntentContractProbesByCategory("boundary", contract);
  const boundaryContract: VisionerIntentContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateVisionerIntentProbeMatrix(boundaryResults, boundaryContract);
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const VISIONER_INTENT_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly VisionerIntentCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes and documented FAIL gaps must align; zero unexpected mismatches.
 */
export function validateVisionerIntentFailureRecoveryProbeMatrix(
  results: VisionerIntentProbeResult[],
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
): VisionerIntentProbeMatrixValidationResult {
  const failureRecoveryProbes = VISIONER_INTENT_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listVisionerIntentContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: VisionerIntentContract = {
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
  return validateVisionerIntentProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listVisionerIntentFailureRecoveryProbeIds(
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
): string[] {
  return VISIONER_INTENT_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listVisionerIntentContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export const VISIONER_INTENT_CATEGORIES = [
  "intent_versioning",
  "task_signal",
  "intent_depth",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type VisionerIntentCategory = (typeof VISIONER_INTENT_CATEGORIES)[number];

export interface VisionerIntentFixtureEntry {
  id: string;
  category: VisionerIntentCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface VisionerIntentBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourcePhaseGate: {
    version: string;
    atom: string;
    contractVersion: string;
    integratedBaselineProbeCount: number;
    sealedBlockCount: number;
  };
  probes: VisionerIntentFixtureEntry[];
}

export interface VisionerIntentProbeResult {
  id: string;
  category: VisionerIntentCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface VisionerIntentProbeSummary {
  total: number;
  aligned: number;
  mismatches: VisionerIntentProbeResult[];
  knownGaps: VisionerIntentProbeResult[];
  byCategory: Record<
    VisionerIntentCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface VisionerIntentValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: VisionerIntentCategory;
  detail: string;
}

export interface VisionerIntentValidationResult {
  valid: boolean;
  issues: VisionerIntentValidationIssue[];
}

export interface VisionerIntentContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: VisionerIntentCategory;
  detail: string;
}

export interface VisionerIntentContractCoverageResult {
  valid: boolean;
  issues: VisionerIntentContractCoverageIssue[];
}

/** Minimum probes per category for A01 baseline slice. */
export const VISIONER_INTENT_A01_MIN_PROBES: Readonly<
  Record<VisionerIntentCategory, number>
> = {
  intent_versioning: 3,
  task_signal: 3,
  intent_depth: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

export type VisionerIntentProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface VisionerIntentProbeContract {
  id: string;
  category: VisionerIntentCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: VisionerIntentProbeDisposition;
  criterion: string;
}

export interface VisionerIntentCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface VisionerIntentCategoryContract {
  category: VisionerIntentCategory;
  acceptance: VisionerIntentCategoryAcceptance;
  probes: readonly VisionerIntentProbeContract[];
}

export interface VisionerIntentContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<VisionerIntentCategory, VisionerIntentCategoryContract>;
  probes: readonly VisionerIntentProbeContract[];
}

function flattenVisionerIntentCategoryProbes(
  categories: Record<VisionerIntentCategory, VisionerIntentCategoryContract>,
): readonly VisionerIntentProbeContract[] {
  return VISIONER_INTENT_CATEGORIES.flatMap(category => categories[category].probes);
}

const VISIONER_INTENT_CATEGORY_CONTRACTS: Record<
  VisionerIntentCategory,
  VisionerIntentCategoryContract
> = {
  intent_versioning: {
    category: "intent_versioning",
    acceptance: {
      invariant:
        "Visioner intent baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vint.version_tagged",
        category: "intent_versioning",
        description: "Visioner intent baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner intent baseline declares semver version field",
      },
      {
        id: "vint.atom_tagged",
        category: "intent_versioning",
        description: "Visioner intent baseline declares P02-B01-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner intent baseline declares P02-B01-A01 atom id",
      },
      {
        id: "vint.harness_version_exported",
        category: "intent_versioning",
        description: "FORGE_VISIONER_INTENT_VERSION exported for visioner intent harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_VISIONER_INTENT_VERSION exported for visioner intent harness",
      },
    ],
  },
  task_signal: {
    category: "task_signal",
    acceptance: {
      invariant:
        "Raw user task signal reaches visioner layer; parseVisionerTaskIntent exports typed structured intent.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vint.raw_task_wired",
        category: "task_signal",
        description: "Orchestrator passes raw user task into visioner step input",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator passes raw user task into visioner step input",
      },
      {
        id: "vint.visioner_layer_invoke",
        category: "task_signal",
        description: "Vision phase invokes engine.stepWithPhase with visioner layer",
        expected: "PASS",
        disposition: "observed",
        criterion: "Vision phase invokes engine.stepWithPhase with visioner layer",
      },
      {
        id: "vint.structured_intent_parse",
        category: "task_signal",
        description: "Typed parseVisionerTaskIntent exports structured intent from raw task",
        expected: "PASS",
        disposition: "observed",
        criterion: "Typed parseVisionerTaskIntent exports structured intent from raw task",
      },
    ],
  },
  intent_depth: {
    category: "intent_depth",
    acceptance: {
      invariant:
        "Programmatic depth classifier and depth-routed vision prompts wired in orchestrator.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vint.prompt_depth_tiers",
        category: "intent_depth",
        description: "VISIONER_SYSTEM prompt declares simple, medium and complex task depth tiers",
        expected: "PASS",
        disposition: "observed",
        criterion: "VISIONER_SYSTEM prompt declares simple, medium and complex task depth tiers",
      },
      {
        id: "vint.programmatic_depth_classifier",
        category: "intent_depth",
        description: "classifyVisionerTaskDepth programmatically classifies task complexity",
        expected: "PASS",
        disposition: "observed",
        criterion: "classifyVisionerTaskDepth programmatically classifies task complexity",
      },
      {
        id: "vint.depth_routed_prompt",
        category: "intent_depth",
        description: "Orchestrator routes vision prompt variant by classified task depth",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator routes vision prompt variant by classified task depth",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant: "Visioner intent baseline links to sealed P01 phase gate and integrated baseline handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vint.p01_phase_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P01_TO_P02_PHASE_HANDOFF_V1 targets P02-B01-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P01_TO_P02_PHASE_HANDOFF_V1 targets P02-B01-A01 entry atom",
      },
      {
        id: "vint.p01_integrated_sealed_probes",
        category: "baseline_link",
        description: "P01-B10→P02 handoff sealed probeCount matches active integrated baseline contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P01-B10→P02 handoff sealed probeCount matches active integrated baseline contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Task input boundary assessment handles empty, whitespace-only and oversized inputs; probe runner and documented gaps wired.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vint.source_phase_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P01 phase gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P01 phase gate source artifacts",
      },
      {
        id: "vint.probe_runner_exported",
        category: "boundary",
        description: "runVisionerIntentProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runVisionerIntentProbes executes contract-wired probe matrix",
      },
      {
        id: "vint.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL intent gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL intent gap",
      },
      {
        id: "vint.empty_task_boundary",
        category: "boundary",
        description: "assessVisionerTaskInputBoundary rejects empty task input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerTaskInputBoundary rejects empty task input",
      },
      {
        id: "vint.whitespace_task_boundary",
        category: "boundary",
        description: "assessVisionerTaskInputBoundary rejects whitespace-only task input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerTaskInputBoundary rejects whitespace-only task input",
      },
      {
        id: "vint.long_task_truncation_boundary",
        category: "boundary",
        description: "assessVisionerTaskInputBoundary truncates tasks exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerTaskInputBoundary truncates tasks exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Empty vision guard exists; fixture validation rejects invalid versions.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vint.empty_vision_guard",
        category: "failure_path",
        description: "Orchestrator rejects empty or trivially short vision output",
        expected: "PASS",
        disposition: "failure",
        criterion: "Orchestrator rejects empty or trivially short vision output",
      },
      {
        id: "vint.invalid_version_rejected",
        category: "failure_path",
        description: "validateVisionerIntentBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateVisionerIntentBaseline rejects unexpected fixture version",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant: "Checkpoint resume reuses vision; structured intent recovery is a documented gap.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vint.vision_checkpoint_resume",
        category: "recovery_path",
        description: "Pipeline resume reuses prior checkpoint vision output without re-invoking LLM",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Pipeline resume reuses prior checkpoint vision output without re-invoking LLM",
      },
      {
        id: "vint.structured_intent_recovery",
        category: "recovery_path",
        description: "recoverVisionerIntent restructures failed intent parse into actionable vision input",
        expected: "FAIL",
        disposition: "gap",
        criterion: "recoverVisionerIntent restructures failed intent parse into actionable vision input",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant: "Vision fact-check BLOCK exists; intent ambiguity NO-GO gate blocks before vision spend.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vint.vision_fact_check_block",
        category: "nogo_path",
        description: "Vision after_thought hook can BLOCK pipeline on fact-check failure",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Vision after_thought hook can BLOCK pipeline on fact-check failure",
      },
      {
        id: "vint.intent_ambiguity_nogo",
        category: "nogo_path",
        description: "checkVisionerIntentAmbiguity NO-GO gate blocks ambiguous tasks before vision spend",
        expected: "PASS",
        disposition: "nogo",
        criterion: "checkVisionerIntentAmbiguity NO-GO gate blocks ambiguous tasks before vision spend",
      },
    ],
  },
};

export const FORGE_VISIONER_INTENT_CONTRACT_V1: VisionerIntentContract = {
  version: "1.0.0",
  atom: "P02-B01-A05",
  purpose:
    "Typed visioner intent contract declaring measurable task signal, depth routing and ambiguity probes.",
  categories: VISIONER_INTENT_CATEGORY_CONTRACTS,
  probes: flattenVisionerIntentCategoryProbes(VISIONER_INTENT_CATEGORY_CONTRACTS),
};

export function getActiveVisionerIntentContract(): VisionerIntentContract {
  return FORGE_VISIONER_INTENT_CONTRACT_V1;
}

export function getVisionerIntentCategoryContract(
  category: VisionerIntentCategory,
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
): VisionerIntentCategoryContract {
  return contract.categories[category];
}

export function listVisionerIntentContractProbeIds(
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listVisionerIntentProbesByDisposition(
  disposition: VisionerIntentProbeDisposition,
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
): VisionerIntentProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listVisionerIntentContractProbesByCategory(
  category: VisionerIntentCategory,
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
): VisionerIntentProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeVisionerIntentContractCoverage(
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<VisionerIntentCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<VisionerIntentProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    VisionerIntentCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<VisionerIntentProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of VISIONER_INTENT_CATEGORIES) {
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

export function validateVisionerIntentContractCoverage(
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
): VisionerIntentContractCoverageResult {
  const issues: VisionerIntentContractCoverageIssue[] = [];

  for (const category of VISIONER_INTENT_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < VISIONER_INTENT_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${VISIONER_INTENT_A01_MIN_PROBES[category]}`,
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

  const ids = listVisionerIntentContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeVisionerIntentContractCoverage(contract);
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
    if (!probe.id.startsWith("vint.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing vint. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateVisionerIntentAgainstContract(
  fixture: VisionerIntentBaseline,
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
): VisionerIntentValidationResult {
  const issues: VisionerIntentValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of VISIONER_INTENT_CATEGORIES) {
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

export function buildDefaultSourcePhaseGate(): VisionerIntentBaseline["sourcePhaseGate"] {
  const handoff = getForgeP01ToP02PhaseHandoff();
  const coverage = summarizeIntegratedBaselineContractCoverage(getActiveIntegratedBaselineContract());
  return {
    version: handoff.version,
    atom: handoff.atom,
    contractVersion: handoff.version,
    integratedBaselineProbeCount: coverage.totalProbes,
    sealedBlockCount: EXPECTED_SEALED_BLOCK_COUNT,
  };
}

export function validateVisionerIntentBaseline(
  fixture: VisionerIntentBaseline,
): VisionerIntentValidationResult {
  const issues: VisionerIntentValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P02-B01-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    VISIONER_INTENT_CATEGORIES.map(category => [category, 0]),
  ) as Record<VisionerIntentCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of VISIONER_INTENT_CATEGORIES) {
    const min = VISIONER_INTENT_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP01ToP02PhaseHandoff();
  const coverage = summarizeIntegratedBaselineContractCoverage(getActiveIntegratedBaselineContract());

  if (fixture.sourcePhaseGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourcePhaseGate.atom=${fixture.sourcePhaseGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (fixture.sourcePhaseGate.integratedBaselineProbeCount !== coverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail: `sourcePhaseGate.integratedBaselineProbeCount=${fixture.sourcePhaseGate.integratedBaselineProbeCount} contract=${coverage.totalProbes}`,
    });
  }
  if (fixture.sourcePhaseGate.sealedBlockCount !== EXPECTED_SEALED_BLOCK_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail: `sourcePhaseGate.sealedBlockCount=${fixture.sourcePhaseGate.sealedBlockCount} expected=${EXPECTED_SEALED_BLOCK_COUNT}`,
    });
  }
  if (handoff.sourcePhase.completedAtoms !== P01_PHASE_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail: `P01 handoff completedAtoms=${handoff.sourcePhase.completedAtoms} expected=${P01_PHASE_ATOM_COUNT}`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length < 1) {
    issues.push({
      kind: "missing_category",
      detail: "A01 fixture must document at least one known FAIL gap",
    });
  }

  const contractAlignment = validateVisionerIntentAgainstContract(fixture, getActiveVisionerIntentContract());
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeVisionerIntentMatrix(
  results: VisionerIntentProbeResult[],
): VisionerIntentProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as VisionerIntentProbeSummary["byCategory"];
  for (const category of VISIONER_INTENT_CATEGORIES) {
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

export function listVisionerIntentProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerIntentBaseline,
): VisionerIntentFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listVisionerIntentKnownGaps(
  results: VisionerIntentProbeResult[],
): VisionerIntentProbeResult[] {
  return summarizeVisionerIntentMatrix(results).knownGaps;
}

/** Per-probe evidence artifact — disposition, criterion and aligned outcomes (P02-B01-A06). */
export interface VisionerIntentProbeEvidence {
  probeId: string;
  category: VisionerIntentCategory;
  disposition: VisionerIntentProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for visioner intent runs (P02-B01-A06). */
export interface VisionerIntentProbeTelemetry {
  probeId: string;
  category: VisionerIntentCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P02-B01-A06). */
export interface VisionerIntentProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourcePhaseGateVersion: string;
  sourcePhaseGateAtom: string;
  /** Slice atom when record covers a subset (e.g. failure/recovery gate). */
  sliceAtom?: string;
  /** Categories included when sliceAtom is set. */
  sliceCategories?: readonly VisionerIntentCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated visioner intent run record bundling evidence, telemetry and provenance. */
export interface VisionerIntentRunRecord {
  provenance: VisionerIntentProvenance;
  evidence: VisionerIntentProbeEvidence[];
  telemetry: VisionerIntentProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<VisionerIntentCategory, number>;
    byDisposition: Record<VisionerIntentProbeDisposition, number>;
  };
}

export interface VisionerIntentRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface VisionerIntentRunValidationResult {
  valid: boolean;
  issues: VisionerIntentRunValidationIssue[];
}

export function buildVisionerIntentProbeEvidence(
  probeId: string,
  category: VisionerIntentCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: VisionerIntentProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): VisionerIntentProbeEvidence {
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

export function buildVisionerIntentProbeTelemetry(
  probeId: string,
  category: VisionerIntentCategory,
  sequenceIndex: number,
  durationMs: number,
): VisionerIntentProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildVisionerIntentProvenance(
  runId: string,
  fixture: VisionerIntentBaseline,
  contract: VisionerIntentContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly VisionerIntentCategory[];
  },
): VisionerIntentProvenance {
  return {
    runId,
    harnessVersion: FORGE_VISIONER_INTENT_VERSION,
    contractVersion: contract.version,
    contractAtom: contract.atom,
    fixtureVersion: fixture.version,
    fixtureAtom: fixture.atom,
    sourcePhaseGateVersion: fixture.sourcePhaseGate.version,
    sourcePhaseGateAtom: fixture.sourcePhaseGate.atom,
    startedAt,
    completedAt,
    totalProbes,
    ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
    ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    ...(options?.gitCommit ? { gitCommit: options.gitCommit } : {}),
  };
}

export function buildVisionerIntentRunRecord(
  provenance: VisionerIntentProvenance,
  evidence: VisionerIntentProbeEvidence[],
  telemetry: VisionerIntentProbeTelemetry[],
): VisionerIntentRunRecord {
  const byCategory = {} as Record<VisionerIntentCategory, number>;
  const byDisposition: Record<VisionerIntentProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of VISIONER_INTENT_CATEGORIES) {
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

function validateVisionerIntentRunRecordAgainstProbeIds(
  record: VisionerIntentRunRecord,
  expectedProbeIds: string[],
  contract: VisionerIntentContract,
): VisionerIntentRunValidationResult {
  const issues: VisionerIntentRunValidationIssue[] = [];
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

export function validateVisionerIntentRunRecord(
  record: VisionerIntentRunRecord,
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
): VisionerIntentRunValidationResult {
  return validateVisionerIntentRunRecordAgainstProbeIds(
    record,
    listVisionerIntentContractProbeIds(contract),
    contract,
  );
}

/** Validate failure/recovery slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateVisionerIntentFailureRecoveryRunRecord(
  record: VisionerIntentRunRecord,
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
): VisionerIntentRunValidationResult {
  const issues: VisionerIntentRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P02-B01-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P02-B01-A06`,
    });
  }

  const expectedCategories = [...VISIONER_INTENT_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateVisionerIntentRunRecordAgainstProbeIds(
    record,
    listVisionerIntentFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

// ─── Property and fuzz validation (P02-B01-A07) ─────────────────────────────

export interface VisionerIntentPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface VisionerIntentPropertyResult {
  passed: number;
  failed: VisionerIntentPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type VisionerIntentPropertyCheck = {
  id: string;
  description: string;
  check: (contract: VisionerIntentContract) => string | null;
};

const VISIONER_INTENT_STRUCTURAL_PROPERTIES: readonly VisionerIntentPropertyCheck[] = [
  {
    id: "categories_complete",
    description: "All eight visioner intent categories are declared",
    check: contract => {
      for (const category of VISIONER_INTENT_CATEGORIES) {
        if (!contract.categories[category]) return `missing category: ${category}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listVisionerIntentContractProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each category meets contract minProbeCount",
    check: contract => {
      for (const category of VISIONER_INTENT_CATEGORIES) {
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
    description: "summarizeVisionerIntentContractCoverage totals match listVisionerIntentContractProbeIds",
    check: contract => {
      const summary = summarizeVisionerIntentContractCoverage(contract);
      const ids = listVisionerIntentContractProbeIds(contract);
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
    description: "Probe ids are namespaced with vint. prefix",
    check: contract => {
      for (const probe of contract.probes) {
        if (!probe.id.startsWith("vint.")) {
          return `${probe.id} missing vint. prefix`;
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const probeIds = listVisionerIntentContractProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildVisionerIntentProbeEvidence(
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
        return buildVisionerIntentProbeTelemetry(id, probe.category, index, index);
      });
      const record = buildVisionerIntentRunRecord(
        buildVisionerIntentProvenance(
          "property-check",
          {
            version: "0",
            atom: "x",
            purpose: "x",
            sourcePhaseGate: buildDefaultSourcePhaseGate(),
            probes: [],
          },
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
    description: "Synthetic failure/recovery slice record passes validateVisionerIntentFailureRecoveryRunRecord",
    check: contract => {
      const probeIds = listVisionerIntentFailureRecoveryProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildVisionerIntentProbeEvidence(
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
        return buildVisionerIntentProbeTelemetry(id, probe.category, index, index * 0.5);
      });
      const record = buildVisionerIntentRunRecord(
        buildVisionerIntentProvenance(
          "property-check-failure-recovery",
          {
            version: "0",
            atom: "x",
            purpose: "x",
            sourcePhaseGate: buildDefaultSourcePhaseGate(),
            probes: [],
          },
          contract,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:01.000Z",
          probeIds.length,
          {
            sliceAtom: "P02-B01-A06",
            sliceCategories: VISIONER_INTENT_FAILURE_RECOVERY_CATEGORIES,
          },
        ),
        evidence,
        telemetry,
      );
      const validation = validateVisionerIntentFailureRecoveryRunRecord(record, contract);
      if (!validation.valid) {
        return validation.issues.map(i => i.detail).join("; ");
      }
      return null;
    },
  },
] as const;

export function runVisionerIntentPropertyChecks(
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
): VisionerIntentPropertyResult {
  const failed: VisionerIntentPropertyViolation[] = [];
  for (const property of VISIONER_INTENT_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = VISIONER_INTENT_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type VisionerIntentFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface VisionerIntentFuzzMutationCase {
  seed: number;
  kind: VisionerIntentFuzzMutationKind;
  probeId?: string;
  category?: VisionerIntentCategory;
}

export interface VisionerIntentFuzzValidationCaseResult {
  mutation: VisionerIntentFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface VisionerIntentFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: VisionerIntentFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createVisionerIntentFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneVisionerIntentBaseline(fixture: VisionerIntentBaseline): VisionerIntentBaseline {
  return {
    ...fixture,
    sourcePhaseGate: { ...fixture.sourcePhaseGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickVisionerIntentFuzzTarget(
  fixture: VisionerIntentBaseline,
  rng: () => number,
): { category: VisionerIntentCategory; index: number; entry: VisionerIntentFixtureEntry } {
  const category = VISIONER_INTENT_CATEGORIES[Math.floor(rng() * VISIONER_INTENT_CATEGORIES.length)]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyVisionerIntentFuzzMutation(
  fixture: VisionerIntentBaseline,
  mutation: VisionerIntentFuzzMutationCase,
): VisionerIntentBaseline {
  const mutated = cloneVisionerIntentBaseline(fixture);
  const targetCategory = mutation.category ?? VISIONER_INTENT_CATEGORIES[0]!;
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
          id: `vint.fuzz.extra.${mutation.seed}`,
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
      const other = VISIONER_INTENT_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateVisionerIntentFuzzMutationCases(
  fixture: VisionerIntentBaseline,
  seed: number,
  iterations: number,
): VisionerIntentFuzzMutationCase[] {
  const rng = createVisionerIntentFuzzRng(seed);
  const kinds: VisionerIntentFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: VisionerIntentFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickVisionerIntentFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P02-B01-A07). */
export function runVisionerIntentFuzzValidation(
  fixture: VisionerIntentBaseline,
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
  seed = 42,
  iterations = 24,
): VisionerIntentFuzzValidationResult {
  const cases = generateVisionerIntentFuzzMutationCases(fixture, seed, iterations);
  const results: VisionerIntentFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyVisionerIntentFuzzMutation(fixture, mutation);
    const validation = validateVisionerIntentAgainstContract(mutated, contract);
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

export type VisionerIntentRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface VisionerIntentRunRecordFuzzCase {
  kind: VisionerIntentRunRecordFuzzKind;
  probeId?: string;
}

export function applyVisionerIntentRunRecordFuzzMutation(
  record: VisionerIntentRunRecord,
  mutation: VisionerIntentRunRecordFuzzCase,
): VisionerIntentRunRecord {
  const cloned: VisionerIntentRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P02-B01-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["intent_versioning"],
      };
      break;
  }

  cloned.summary = buildVisionerIntentRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveVisionerIntentRunRecordValidator(
  record: VisionerIntentRunRecord,
): (
  record: VisionerIntentRunRecord,
  contract: VisionerIntentContract,
) => VisionerIntentRunValidationResult {
  return record.provenance.sliceAtom === "P02-B01-A06"
    ? validateVisionerIntentFailureRecoveryRunRecord
    : validateVisionerIntentRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P02-B01-A07). */
export function runVisionerIntentRunRecordFuzzValidation(
  record: VisionerIntentRunRecord,
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveVisionerIntentRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: VisionerIntentRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P02-B01-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyVisionerIntentRunRecordFuzzMutation(record, mutation);
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

// ─── Probe regression detection (P02-B01-A08) ────────────────────────────────

export interface VisionerIntentProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare visioner intent run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectVisionerIntentProbeRegression(
  prior: VisionerIntentRunRecord,
  current: VisionerIntentRunRecord,
): VisionerIntentProbeRegressionReport {
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

// ─── Guard controls (P02-B01-A09 foundation, used by A08 regression gate) ───

export interface ForgeVisionerIntentGuardControls {
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

export interface VisionerIntentGuardCheckIssue {
  domain: "adversarial" | "performance" | "cost" | "safety";
  code: string;
  detail: string;
}

export interface VisionerIntentGuardCheckResult {
  passed: boolean;
  issues: VisionerIntentGuardCheckIssue[];
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

export interface VisionerIntentAdversarialGuardScenario {
  id: string;
  description: string;
  build: (record: VisionerIntentRunRecord) => VisionerIntentRunRecord;
  expectRejected: true;
}

export const FORGE_VISIONER_INTENT_GUARD_CONTROLS_V1: ForgeVisionerIntentGuardControls = {
  atom: "P02-B01-A09",
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

export function getForgeVisionerIntentGuardControls(): ForgeVisionerIntentGuardControls {
  return FORGE_VISIONER_INTENT_GUARD_CONTROLS_V1;
}

function parseVisionerIntentIsoDurationMs(startedAt: string, completedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function summarizeVisionerIntentTelemetry(telemetry: VisionerIntentProbeTelemetry[]): {
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

export function detectVisionerIntentEvidenceSummaryMismatch(
  record: VisionerIntentRunRecord,
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

export function detectVisionerIntentFalseAlignment(record: VisionerIntentRunRecord): string[] {
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

export function validateVisionerIntentSafety(
  record: VisionerIntentRunRecord,
  controls: ForgeVisionerIntentGuardControls = getForgeVisionerIntentGuardControls(),
): VisionerIntentGuardCheckIssue[] {
  const issues: VisionerIntentGuardCheckIssue[] = [];
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

export function validateVisionerIntentPerformance(
  record: VisionerIntentRunRecord,
  controls: ForgeVisionerIntentGuardControls = getForgeVisionerIntentGuardControls(),
): VisionerIntentGuardCheckIssue[] {
  const issues: VisionerIntentGuardCheckIssue[] = [];
  const { suiteDurationMs, maxProbeDurationMs } = summarizeVisionerIntentTelemetry(record.telemetry);
  const wallClockMs = parseVisionerIntentIsoDurationMs(
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

export function validateVisionerIntentCost(
  totalCostUsd: number,
  llmCalls: number,
  controls: ForgeVisionerIntentGuardControls = getForgeVisionerIntentGuardControls(),
): VisionerIntentGuardCheckIssue[] {
  const issues: VisionerIntentGuardCheckIssue[] = [];
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

export function buildVisionerIntentAdversarialGuardScenarios(): VisionerIntentAdversarialGuardScenario[] {
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

export function runVisionerIntentAdversarialGuardChecks(
  fixtureRecord: VisionerIntentRunRecord,
  contract: VisionerIntentContract = getActiveVisionerIntentContract(),
): { rejected: number; total: number; failures: string[] } {
  const scenarios = buildVisionerIntentAdversarialGuardScenarios();
  const failures: string[] = [];
  let rejected = 0;

  for (const scenario of scenarios) {
    const tampered = scenario.build(fixtureRecord);
    const validation = validateVisionerIntentRunRecord(tampered, contract);
    const falseAlignment = detectVisionerIntentFalseAlignment(tampered);
    const summaryMismatch = detectVisionerIntentEvidenceSummaryMismatch(tampered);
    const rejectedByGuard =
      !validation.valid || falseAlignment.length > 0 || summaryMismatch !== null;

    if (rejectedByGuard) rejected++;
    else failures.push(`${scenario.id}: tampered record was not rejected`);
  }

  return { rejected, total: scenarios.length, failures };
}

export function validateForgeVisionerIntentGuard(
  record: VisionerIntentRunRecord,
  options: {
    totalCostUsd?: number;
    llmCalls?: number;
    contract?: VisionerIntentContract;
    controls?: ForgeVisionerIntentGuardControls;
  } = {},
): VisionerIntentGuardCheckResult {
  const controls = options.controls ?? getForgeVisionerIntentGuardControls();
  const contract = options.contract ?? getActiveVisionerIntentContract();
  const totalCostUsd = options.totalCostUsd ?? 0;
  const llmCalls = options.llmCalls ?? 0;
  const issues: VisionerIntentGuardCheckIssue[] = [];

  issues.push(...validateVisionerIntentPerformance(record, controls));
  issues.push(...validateVisionerIntentCost(totalCostUsd, llmCalls, controls));
  issues.push(...validateVisionerIntentSafety(record, controls));

  const falseAlignment = detectVisionerIntentFalseAlignment(record);
  if (falseAlignment.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "false_alignment",
      detail: falseAlignment.join("; "),
    });
  }
  const summaryMismatch = detectVisionerIntentEvidenceSummaryMismatch(record);
  if (summaryMismatch) {
    issues.push({
      domain: "adversarial",
      code: "summary_evidence_mismatch",
      detail: summaryMismatch,
    });
  }

  const adversarial = runVisionerIntentAdversarialGuardChecks(record, contract);
  if (adversarial.failures.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "scenario_not_rejected",
      detail: adversarial.failures.join("; "),
    });
  }

  const telemetrySummary = summarizeVisionerIntentTelemetry(record.telemetry);
  const wallClockMs = parseVisionerIntentIsoDurationMs(
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
