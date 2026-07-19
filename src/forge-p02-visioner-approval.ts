/**
 * FOREMAN — Visioner User Approval & Steering Baseline (P02-B09)
 *
 * Measures user approval gates, steering feedback and vision checkpoint wiring
 * on sealed P02-B08 visioner scoring block gate artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getActiveVisionerScoringContract,
  getForgeP02B08ToB09Handoff,
  summarizeVisionerScoringContractCoverage,
} from "./forge-p02-visioner-scoring.js";

export const FORGE_VISIONER_APPROVAL_VERSION = "1.0.0-a01";

/** Maximum normalized vision length before truncation (P02-B09-A01 boundary). */
export const VISIONER_APPROVAL_VISION_MAX_LENGTH = 32000;

export const EXPECTED_P02_B08_SEALED_ATOM_COUNT = 10;

export const VISIONER_APPROVAL_CATEGORIES = [
  "approval_versioning",
  "approval_signal",
  "steering_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type VisionerApprovalCategory = (typeof VISIONER_APPROVAL_CATEGORIES)[number];

export interface VisionerApprovalPresence {
  hasApproval: boolean;
  hasSteering: boolean;
  approvalLines: string[];
  steeringLines: string[];
  detail: string;
}

export type VisionerApprovalInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface VisionerApprovalInputBoundary {
  disposition: VisionerApprovalInputDisposition;
  acceptable: boolean;
  normalizedVision: string;
  truncated: boolean;
  detail: string;
}

/**
 * Assess vision output boundary conditions — empty, whitespace-only, null bytes, max length (P02-B09-A01).
 */
export function assessVisionerApprovalInputBoundary(
  visionOutput: string,
): VisionerApprovalInputBoundary {
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
    const disposition: VisionerApprovalInputDisposition =
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
  if (normalizedVision.length > VISIONER_APPROVAL_VISION_MAX_LENGTH) {
    normalizedVision = normalizedVision.slice(0, VISIONER_APPROVAL_VISION_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedVision,
    truncated,
    detail: truncated
      ? `vision truncated to ${VISIONER_APPROVAL_VISION_MAX_LENGTH} characters`
      : "valid vision output",
  };
}

/**
 * Assess whether vision output declares APPROVAL and STEERING sections (P02-B09-A01).
 */
export function assessVisionerApprovalPresence(visionOutput: string): VisionerApprovalPresence {
  const boundary = assessVisionerApprovalInputBoundary(visionOutput);
  if (!boundary.acceptable) {
    return {
      hasApproval: false,
      hasSteering: false,
      approvalLines: [],
      steeringLines: [],
      detail: boundary.detail,
    };
  }

  const visionOutputNormalized = boundary.normalizedVision;

  const lines = visionOutputNormalized.split("\n");
  const approvalLines: string[] = [];
  const steeringLines: string[] = [];
  const approvalHeader = /^\*?\*?\s*APPROVAL/i;
  const steeringHeader = /^\*?\*?\s*STEERING/i;
  const sectionHeader = /^\*?\*?\s*[A-Z][A-Z\s-]+/;

  let mode: "approval" | "steering" | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (approvalHeader.test(trimmed)) {
      mode = "approval";
      approvalLines.push(trimmed);
      continue;
    }
    if (steeringHeader.test(trimmed)) {
      mode = "steering";
      steeringLines.push(trimmed);
      continue;
    }
    if (mode === "approval" && trimmed.length > 0) {
      if (sectionHeader.test(trimmed) && !approvalHeader.test(trimmed)) {
        mode = null;
      } else {
        approvalLines.push(trimmed);
      }
      continue;
    }
    if (mode === "steering" && trimmed.length > 0) {
      if (sectionHeader.test(trimmed) && !steeringHeader.test(trimmed)) {
        mode = null;
      } else {
        steeringLines.push(trimmed);
      }
    }
  }

  return {
    hasApproval: approvalLines.length > 0,
    hasSteering: steeringLines.length > 0,
    approvalLines,
    steeringLines,
    detail: `approval=${approvalLines.length}, steering=${steeringLines.length}`,
  };
}

export interface VisionerApprovalProbeMatrixValidationIssue {
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

export interface VisionerApprovalProbeMatrixValidationResult {
  valid: boolean;
  issues: VisionerApprovalProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A01 baseline gate.
 */
export function validateVisionerApprovalProbeMatrix(
  results: VisionerApprovalProbeResult[],
  contract: VisionerApprovalContract = getActiveVisionerApprovalContract(),
): VisionerApprovalProbeMatrixValidationResult {
  const issues: VisionerApprovalProbeMatrixValidationIssue[] = [];
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

export interface VisionerApprovalFixtureEntry {
  id: string;
  category: VisionerApprovalCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface VisionerApprovalBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    visionerScoringProbeCount: number;
    sealedAtomCount: number;
  };
  probes: VisionerApprovalFixtureEntry[];
}

export interface VisionerApprovalProbeResult {
  id: string;
  category: VisionerApprovalCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface VisionerApprovalProbeSummary {
  total: number;
  aligned: number;
  mismatches: VisionerApprovalProbeResult[];
  knownGaps: VisionerApprovalProbeResult[];
  byCategory: Record<
    VisionerApprovalCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface VisionerApprovalValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: VisionerApprovalCategory;
  detail: string;
}

export interface VisionerApprovalValidationResult {
  valid: boolean;
  issues: VisionerApprovalValidationIssue[];
}

export interface VisionerApprovalContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: VisionerApprovalCategory;
  detail: string;
}

export interface VisionerApprovalContractCoverageResult {
  valid: boolean;
  issues: VisionerApprovalContractCoverageIssue[];
}

export type VisionerApprovalProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface VisionerApprovalProbeContract {
  id: string;
  category: VisionerApprovalCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: VisionerApprovalProbeDisposition;
  criterion: string;
}

export interface VisionerApprovalCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface VisionerApprovalCategoryContract {
  category: VisionerApprovalCategory;
  acceptance: VisionerApprovalCategoryAcceptance;
  probes: readonly VisionerApprovalProbeContract[];
}

export interface VisionerApprovalContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<VisionerApprovalCategory, VisionerApprovalCategoryContract>;
  probes: readonly VisionerApprovalProbeContract[];
}

export const VISIONER_APPROVAL_A01_MIN_PROBES: Readonly<
  Record<VisionerApprovalCategory, number>
> = {
  approval_versioning: 3,
  approval_signal: 3,
  steering_signal: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

function flattenVisionerApprovalCategoryProbes(
  categories: Record<VisionerApprovalCategory, VisionerApprovalCategoryContract>,
): readonly VisionerApprovalProbeContract[] {
  return VISIONER_APPROVAL_CATEGORIES.flatMap(category => categories[category].probes);
}

const VISIONER_APPROVAL_CATEGORY_CONTRACTS: Record<
  VisionerApprovalCategory,
  VisionerApprovalCategoryContract
> = {
  approval_versioning: {
    category: "approval_versioning",
    acceptance: {
      invariant:
        "Visioner approval baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vapp.version_tagged",
        category: "approval_versioning",
        description: "Visioner approval baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner approval baseline declares semver version field",
      },
      {
        id: "vapp.atom_tagged",
        category: "approval_versioning",
        description: "Visioner approval baseline declares P02-B09-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner approval baseline declares P02-B09-A01 atom id",
      },
      {
        id: "vapp.harness_version_exported",
        category: "approval_versioning",
        description: "FORGE_VISIONER_APPROVAL_VERSION exported for approval harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_VISIONER_APPROVAL_VERSION exported for approval harness",
      },
    ],
  },
  approval_signal: {
    category: "approval_signal",
    acceptance: {
      invariant:
        "Orchestrator HUMAN_APPROVAL gate and interactive confirm engine wire vision approval checkpoints.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vapp.orchestrator_vision_approval_gate",
        category: "approval_signal",
        description: "Orchestrator HUMAN_APPROVAL gate invokes interactive.confirm on vision document",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator HUMAN_APPROVAL gate invokes interactive.confirm on vision document",
      },
      {
        id: "vapp.interactive_confirm_engine",
        category: "approval_signal",
        description: "Engine exposes InteractiveConfirm for pipeline approval checkpoints",
        expected: "PASS",
        disposition: "observed",
        criterion: "Engine exposes InteractiveConfirm for pipeline approval checkpoints",
      },
      {
        id: "vapp.b08_handoff_prerequisite",
        category: "approval_signal",
        description:
          "FORGE_P02_B08_TO_B09_HANDOFF requires sealed visioner scoring block gate before approval entry",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "FORGE_P02_B08_TO_B09_HANDOFF requires sealed visioner scoring block gate before approval entry",
      },
    ],
  },
  steering_signal: {
    category: "steering_signal",
    acceptance: {
      invariant:
        "Vision modify steering, resume skip and provider steering messages expose steering signal paths.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vapp.vision_modify_steering",
        category: "steering_signal",
        description: "Orchestrator modify approval action re-runs visioner with user steering feedback",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator modify approval action re-runs visioner with user steering feedback",
      },
      {
        id: "vapp.resume_skips_approval",
        category: "steering_signal",
        description: "Pipeline resume skips vision approval gate when checkpoint already approved",
        expected: "PASS",
        disposition: "observed",
        criterion: "Pipeline resume skips vision approval gate when checkpoint already approved",
      },
      {
        id: "vapp.provider_steering_messages",
        category: "steering_signal",
        description:
          "Kimi or Antigravity provider injects steering messages during multi-step tool calling",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Kimi or Antigravity provider injects steering messages during multi-step tool calling",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant: "Approval baseline links to sealed P02-B08 block gate and visioner scoring handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vapp.b08_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P02_B08_TO_B09_HANDOFF_V1 targets P02-B09-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P02_B08_TO_B09_HANDOFF_V1 targets P02-B09-A01 entry atom",
      },
      {
        id: "vapp.b08_sealed_scoring_probes",
        category: "baseline_link",
        description: "P02-B08→B09 handoff sealed probeCount matches active visioner scoring contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P02-B08→B09 handoff sealed probeCount matches active visioner scoring contract",
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
        id: "vapp.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P02-B08 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P02-B08 block gate source artifacts",
      },
      {
        id: "vapp.probe_runner_exported",
        category: "boundary",
        description: "runVisionerApprovalProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runVisionerApprovalProbes executes contract-wired probe matrix",
      },
      {
        id: "vapp.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL approval gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL approval gap",
      },
      {
        id: "vapp.empty_vision_approval_boundary",
        category: "boundary",
        description: "assessVisionerApprovalInputBoundary rejects empty vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerApprovalInputBoundary rejects empty vision output",
      },
      {
        id: "vapp.whitespace_vision_boundary",
        category: "boundary",
        description: "assessVisionerApprovalInputBoundary rejects whitespace-only vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerApprovalInputBoundary rejects whitespace-only vision output",
      },
      {
        id: "vapp.long_vision_truncation_boundary",
        category: "boundary",
        description: "assessVisionerApprovalInputBoundary truncates vision exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerApprovalInputBoundary truncates vision exceeding max length",
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
        id: "vapp.invalid_version_rejected",
        category: "failure_path",
        description: "validateVisionerApprovalBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateVisionerApprovalBaseline rejects unexpected fixture version",
      },
      {
        id: "vapp.malformed_vision_approval_guard",
        category: "failure_path",
        description: "assessVisionerApprovalPresence rejects null-byte vision output safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessVisionerApprovalPresence rejects null-byte vision output safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Checkpoint resume preserves vision approval; structured steering recovery is a documented gap.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vapp.vision_checkpoint_approval_skip",
        category: "recovery_path",
        description: "Pipeline resume reuses checkpoint vision output without re-prompting approval",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Pipeline resume reuses checkpoint vision output without re-prompting approval",
      },
      {
        id: "vapp.structured_steering_recovery",
        category: "recovery_path",
        description:
          "recoverVisionerSteering restructures failed steering parse into actionable approval revision",
        expected: "FAIL",
        disposition: "gap",
        criterion:
          "recoverVisionerSteering restructures failed steering parse into actionable approval revision",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Vision rejection abort and interactive timeout default action guard non-responsive approval gates.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vapp.vision_rejection_abort",
        category: "nogo_path",
        description: "Orchestrator abort or skip approval stops pipeline with vision_rejected outcome",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Orchestrator abort or skip approval stops pipeline with vision_rejected outcome",
      },
      {
        id: "vapp.interactive_timeout_default",
        category: "nogo_path",
        description:
          "InteractiveConfirm declares timeout default action for non-responsive approval gates",
        expected: "PASS",
        disposition: "nogo",
        criterion:
          "InteractiveConfirm declares timeout default action for non-responsive approval gates",
      },
    ],
  },
};

export const FORGE_VISIONER_APPROVAL_CONTRACT_V1: VisionerApprovalContract = {
  version: "1.0.0",
  atom: "P02-B09-A06",
  purpose:
    "Typed visioner approval contract declaring measurable approval signal, steering and guard probes.",
  categories: VISIONER_APPROVAL_CATEGORY_CONTRACTS,
  probes: flattenVisionerApprovalCategoryProbes(VISIONER_APPROVAL_CATEGORY_CONTRACTS),
};

export function getActiveVisionerApprovalContract(): VisionerApprovalContract {
  return FORGE_VISIONER_APPROVAL_CONTRACT_V1;
}

export function listVisionerApprovalContractProbesByCategory(
  category: VisionerApprovalCategory,
  contract: VisionerApprovalContract = getActiveVisionerApprovalContract(),
): readonly VisionerApprovalProbeContract[] {
  return contract.categories[category].probes;
}

export function getVisionerApprovalCategoryContract(
  category: VisionerApprovalCategory,
  contract: VisionerApprovalContract = getActiveVisionerApprovalContract(),
): VisionerApprovalCategoryContract {
  return contract.categories[category];
}

export function listVisionerApprovalContractProbeIds(
  contract: VisionerApprovalContract = getActiveVisionerApprovalContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listVisionerApprovalProbesByDisposition(
  disposition: VisionerApprovalProbeDisposition,
  contract: VisionerApprovalContract = getActiveVisionerApprovalContract(),
): VisionerApprovalProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function summarizeVisionerApprovalContractCoverage(
  contract: VisionerApprovalContract = getActiveVisionerApprovalContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<VisionerApprovalCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<VisionerApprovalProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    VisionerApprovalCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<VisionerApprovalProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of VISIONER_APPROVAL_CATEGORIES) {
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

export function validateVisionerApprovalContractCoverage(
  contract: VisionerApprovalContract = getActiveVisionerApprovalContract(),
): VisionerApprovalContractCoverageResult {
  const issues: VisionerApprovalContractCoverageIssue[] = [];

  for (const category of VISIONER_APPROVAL_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < VISIONER_APPROVAL_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${VISIONER_APPROVAL_A01_MIN_PROBES[category]}`,
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

  const ids = listVisionerApprovalContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeVisionerApprovalContractCoverage(contract);
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
    if (!probe.id.startsWith("vapp.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing vapp. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateVisionerApprovalAgainstContract(
  fixture: VisionerApprovalBaseline,
  contract: VisionerApprovalContract = getActiveVisionerApprovalContract(),
): VisionerApprovalValidationResult {
  const issues: VisionerApprovalValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of VISIONER_APPROVAL_CATEGORIES) {
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

export function validateVisionerApprovalBaseline(
  fixture: VisionerApprovalBaseline,
): VisionerApprovalValidationResult {
  const issues: VisionerApprovalValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P02-B09-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    VISIONER_APPROVAL_CATEGORIES.map(category => [category, 0]),
  ) as Record<VisionerApprovalCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of VISIONER_APPROVAL_CATEGORIES) {
    const min = VISIONER_APPROVAL_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP02B08ToB09Handoff();
  const scoringCoverage = summarizeVisionerScoringContractCoverage(getActiveVisionerScoringContract());

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (fixture.sourceBlockGate.visionerScoringProbeCount !== scoringCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.visionerScoringProbeCount=${fixture.sourceBlockGate.visionerScoringProbeCount} ` +
        `contract=${scoringCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P02_B08_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P02_B08_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P02_B08_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B08 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P02_B08_SEALED_ATOM_COUNT}`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length < 1) {
    issues.push({
      kind: "missing_category",
      detail: "A01 fixture must document at least one known FAIL gap",
    });
  }

  const contractAlignment = validateVisionerApprovalAgainstContract(
    fixture,
    getActiveVisionerApprovalContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeVisionerApprovalMatrix(
  results: VisionerApprovalProbeResult[],
): VisionerApprovalProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as VisionerApprovalProbeSummary["byCategory"];
  for (const category of VISIONER_APPROVAL_CATEGORIES) {
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

export function listVisionerApprovalProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerApprovalBaseline,
): VisionerApprovalFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listVisionerApprovalKnownGaps(
  results: VisionerApprovalProbeResult[],
): VisionerApprovalProbeResult[] {
  return summarizeVisionerApprovalMatrix(results).knownGaps;
}
