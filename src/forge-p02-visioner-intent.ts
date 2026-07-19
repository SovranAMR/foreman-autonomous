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

export const FORGE_VISIONER_INTENT_VERSION = "1.0.0-b04";

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
