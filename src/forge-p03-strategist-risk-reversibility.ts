/**
 * FOREMAN — Strategist Risk & Reversibility Baseline (P03-B05)
 *
 * A01 slice: load, validate, run probes, contract alignment against sealed
 * P03-B04 dependency DAG block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import strategistRiskReversibilityBaseline from "./fixtures/forge-strategist-risk-reversibility-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP03B04ToB05Handoff,
  getActiveStrategistDependencyDagContract,
  summarizeStrategistDependencyDagCoverage,
  FORGE_STRATEGIST_DEPENDENCY_DAG_VERSION,
} from "./forge-p03-strategist-dependency-dag.js";
import {
  recoverStrategistDecompose,
  type StrategistDecomposeRecoveryHints,
} from "./forge-p03-strategist-intent.js";
import { parseDecomposeResponse } from "./parser.js";

export const FORGE_STRATEGIST_RISK_REVERSIBILITY_VERSION = "1.0.0-a03";

export const EXPECTED_P03_B04_SEALED_ATOM_COUNT = 10;

export const STRATEGIST_RISK_REVERSIBILITY_DECOMPOSE_MAX_LENGTH = 64000;

export type StrategistRiskReversibilityInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface StrategistRiskReversibilityInputBoundary {
  disposition: StrategistRiskReversibilityInputDisposition;
  acceptable: boolean;
  normalizedDecompose: string;
  truncated: boolean;
  detail: string;
}

export function assessStrategistRiskReversibilityInputBoundary(
  decomposeOutput: string,
): StrategistRiskReversibilityInputBoundary {
  if (decomposeOutput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedDecompose: "",
      truncated: false,
      detail: "null byte detected in decompose output",
    };
  }

  const trimmed = decomposeOutput.trim();
  if (trimmed.length === 0) {
    const disposition: StrategistRiskReversibilityInputDisposition =
      decomposeOutput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedDecompose: "",
      truncated: false,
      detail: disposition === "empty" ? "empty decompose output" : "whitespace-only decompose output",
    };
  }

  let normalizedDecompose = decomposeOutput;
  let truncated = false;
  if (normalizedDecompose.length > STRATEGIST_RISK_REVERSIBILITY_DECOMPOSE_MAX_LENGTH) {
    normalizedDecompose = normalizedDecompose.slice(0, STRATEGIST_RISK_REVERSIBILITY_DECOMPOSE_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedDecompose,
    truncated,
    detail: truncated
      ? `decompose truncated to ${STRATEGIST_RISK_REVERSIBILITY_DECOMPOSE_MAX_LENGTH} characters`
      : "valid decompose output",
  };
}

export interface StrategistRiskReversibilityRecoveryHints extends StrategistDecomposeRecoveryHints {
  risks?: string;
  rollbackPlan?: string;
}

export interface StrategistRiskReversibilityRecoveryResult {
  recovered: boolean;
  riskReversibilityCompliant: boolean;
  composedDecompose: string;
  blocks: string[];
  blockCount: number;
  hasRisks: boolean;
  hasRollbackPlan: boolean;
  parseErrors: string[];
  detail: string;
}

const DEFAULT_STRATEGIST_RISK_PLAN =
  "Medium: incomplete strategist risk metadata — mitigated by recovery defaults";
const DEFAULT_STRATEGIST_ROLLBACK_PLAN =
  "Revert last atom via RollbackEngine.rollbackLastAtom() on verification failure";

function riskPlanSectionPresence(text: string): { hasRisks: boolean; hasRollbackPlan: boolean } {
  return {
    hasRisks: /RISKS:/i.test(text),
    hasRollbackPlan: /ROLLBACK PLAN:/i.test(text),
  };
}

function injectStrategistRiskPlanSections(
  decompose: string,
  risks: string,
  rollbackPlan: string,
): string {
  const confidenceMatch = decompose.match(/\nCONFIDENCE:\s*[\d.]+/);
  if (confidenceMatch && confidenceMatch.index !== undefined) {
    const before = decompose.slice(0, confidenceMatch.index);
    const after = decompose.slice(confidenceMatch.index);
    return `${before}\nRISKS: ${risks}\nROLLBACK PLAN: ${rollbackPlan}${after}`;
  }
  return `${decompose}\nRISKS: ${risks}\nROLLBACK PLAN: ${rollbackPlan}`;
}

/**
 * Restructure failed decompose parse into risk-reversibility compliant plan (P03-B05-A03).
 */
export function recoverStrategistRiskReversibility(
  failedParse: string,
  hints: StrategistRiskReversibilityRecoveryHints = {},
): StrategistRiskReversibilityRecoveryResult {
  const boundary = assessStrategistRiskReversibilityInputBoundary(failedParse);
  if (!boundary.acceptable) {
    const parseErrors =
      boundary.disposition === "contains_null_byte"
        ? ["null_byte_in_decompose"]
        : boundary.disposition === "empty"
          ? ["empty_decompose"]
          : ["whitespace_only_decompose"];
    return {
      recovered: false,
      riskReversibilityCompliant: false,
      composedDecompose: "",
      blocks: [],
      blockCount: 0,
      hasRisks: false,
      hasRollbackPlan: false,
      parseErrors,
      detail: boundary.detail,
    };
  }

  const decomposeRecovery = recoverStrategistDecompose(boundary.normalizedDecompose, hints);
  if (!decomposeRecovery.recovered) {
    return {
      recovered: false,
      riskReversibilityCompliant: false,
      composedDecompose: decomposeRecovery.composedDecompose,
      blocks: decomposeRecovery.blocks,
      blockCount: decomposeRecovery.blockCount,
      hasRisks: false,
      hasRollbackPlan: false,
      parseErrors: decomposeRecovery.parseErrors,
      detail: decomposeRecovery.detail,
    };
  }

  let composed = decomposeRecovery.composedDecompose;
  let { hasRisks, hasRollbackPlan } = riskPlanSectionPresence(composed);
  const parseErrors = [...decomposeRecovery.parseErrors];

  if (!hasRisks || !hasRollbackPlan) {
    composed = injectStrategistRiskPlanSections(
      composed,
      hints.risks ?? DEFAULT_STRATEGIST_RISK_PLAN,
      hints.rollbackPlan ?? DEFAULT_STRATEGIST_ROLLBACK_PLAN,
    );
    ({ hasRisks, hasRollbackPlan } = riskPlanSectionPresence(composed));
    if (!riskPlanSectionPresence(decomposeRecovery.composedDecompose).hasRisks) {
      parseErrors.push("risks_injected");
    }
    if (!riskPlanSectionPresence(decomposeRecovery.composedDecompose).hasRollbackPlan) {
      parseErrors.push("rollback_plan_injected");
    }
  }

  const reparsed = parseDecomposeResponse(composed);
  const riskReversibilityCompliant =
    hasRisks &&
    hasRollbackPlan &&
    boundary.acceptable &&
    reparsed.ok === true &&
    reparsed.data.blocks.length >= 1;

  return {
    recovered: decomposeRecovery.recovered,
    riskReversibilityCompliant,
    composedDecompose: riskReversibilityCompliant ? composed : "",
    blocks: reparsed.ok ? reparsed.data.blocks : decomposeRecovery.blocks,
    blockCount: reparsed.ok ? reparsed.data.blocks.length : decomposeRecovery.blockCount,
    hasRisks,
    hasRollbackPlan,
    parseErrors,
    detail: riskReversibilityCompliant
      ? `risk-reversibility compliant decompose with ${reparsed.ok ? reparsed.data.blocks.length : 0} blocks`
      : `recovery incomplete: ${parseErrors.join(", ") || decomposeRecovery.detail}`,
  };
}

export const STRATEGIST_RISK_REVERSIBILITY_CATEGORIES = [
  "risk_versioning",
  "risk_assessment",
  "reversibility_plan",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type StrategistRiskReversibilityCategory =
  (typeof STRATEGIST_RISK_REVERSIBILITY_CATEGORIES)[number];

export const STRATEGIST_RISK_REVERSIBILITY_A01_MIN_PROBES: Readonly<
  Record<StrategistRiskReversibilityCategory, number>
> = {
  risk_versioning: 3,
  risk_assessment: 3,
  reversibility_plan: 3,
  baseline_link: 2,
  boundary: 3,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

export interface StrategistRiskReversibilityFixtureEntry {
  id: string;
  category: StrategistRiskReversibilityCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface StrategistRiskReversibilityBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    dependencyDagProbeCount: number;
    sealedAtomCount: number;
  };
  probes: StrategistRiskReversibilityFixtureEntry[];
}

export interface StrategistRiskReversibilityProbeResult {
  id: string;
  category: StrategistRiskReversibilityCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface StrategistRiskReversibilityProbeSummary {
  total: number;
  aligned: number;
  mismatches: StrategistRiskReversibilityProbeResult[];
  knownGaps: StrategistRiskReversibilityProbeResult[];
  byCategory: Record<
    StrategistRiskReversibilityCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface StrategistRiskReversibilityValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: StrategistRiskReversibilityCategory;
  detail: string;
}

export interface StrategistRiskReversibilityValidationResult {
  valid: boolean;
  issues: StrategistRiskReversibilityValidationIssue[];
}

export type StrategistRiskReversibilityProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface StrategistRiskReversibilityProbeContract {
  id: string;
  category: StrategistRiskReversibilityCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: StrategistRiskReversibilityProbeDisposition;
  criterion: string;
}

export interface StrategistRiskReversibilityCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface StrategistRiskReversibilityCategoryContract {
  category: StrategistRiskReversibilityCategory;
  acceptance: StrategistRiskReversibilityCategoryAcceptance;
  probes: readonly StrategistRiskReversibilityProbeContract[];
}

export interface StrategistRiskReversibilityContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<StrategistRiskReversibilityCategory, StrategistRiskReversibilityCategoryContract>;
  probes: readonly StrategistRiskReversibilityProbeContract[];
}

function flattenStrategistRiskReversibilityCategoryProbes(
  categories: Record<StrategistRiskReversibilityCategory, StrategistRiskReversibilityCategoryContract>,
): readonly StrategistRiskReversibilityProbeContract[] {
  return STRATEGIST_RISK_REVERSIBILITY_CATEGORIES.flatMap(category => categories[category].probes);
}

const STRATEGIST_RISK_REVERSIBILITY_CATEGORY_CONTRACTS: Record<
  StrategistRiskReversibilityCategory,
  StrategistRiskReversibilityCategoryContract
> = {
  risk_versioning: {
    category: "risk_versioning",
    acceptance: {
      invariant:
        "Strategist risk reversibility baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "srisk.version_tagged",
        category: "risk_versioning",
        description: "Strategist risk reversibility baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist risk reversibility baseline declares semver version field",
      },
      {
        id: "srisk.atom_tagged",
        category: "risk_versioning",
        description: "Strategist risk reversibility baseline declares P03-B05-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist risk reversibility baseline declares P03-B05-A01 atom id",
      },
      {
        id: "srisk.harness_version_exported",
        category: "risk_versioning",
        description: "FORGE_STRATEGIST_RISK_REVERSIBILITY_VERSION exported for risk reversibility harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_STRATEGIST_RISK_REVERSIBILITY_VERSION exported for risk reversibility harness",
      },
    ],
  },
  risk_assessment: {
    category: "risk_assessment",
    acceptance: {
      invariant:
        "Risk assessment infrastructure scores commands and declares strategist risk plan fields in prompt and orchestrator gates.",
      minProbeCount: 3,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "srisk.approval_execution_risk_scoring",
        category: "risk_assessment",
        description: "ApprovalEngine risk scoring wired to ExecutionEngine command approval gate",
        expected: "PASS",
        disposition: "observed",
        criterion: "ApprovalEngine risk scoring wired to ExecutionEngine command approval gate",
      },
      {
        id: "srisk.researcher_interactive_risk_fields",
        category: "risk_assessment",
        description: "Researcher RISKS field and interactive-confirm assessRisk assess command risk",
        expected: "PASS",
        disposition: "observed",
        criterion: "Researcher RISKS field and interactive-confirm assessRisk assess command risk",
      },
      {
        id: "srisk.prompt_decompose_risk_plan",
        category: "risk_assessment",
        description: "STRATEGIST decompose format declares RISKS and ROLLBACK PLAN sections",
        expected: "FAIL",
        disposition: "gap",
        criterion: "STRATEGIST decompose format declares RISKS and ROLLBACK PLAN sections",
      },
      {
        id: "srisk.prompt_atom_blast_radius",
        category: "risk_assessment",
        description: "STRATEGIST atomize format declares blast_radius per atom",
        expected: "FAIL",
        disposition: "gap",
        criterion: "STRATEGIST atomize format declares blast_radius per atom",
      },
      {
        id: "srisk.orchestrator_pre_exec_risk_gate",
        category: "risk_assessment",
        description: "Orchestrator validates strategist risk plan before atom execution",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator validates strategist risk plan before atom execution",
      },
    ],
  },
  reversibility_plan: {
    category: "reversibility_plan",
    acceptance: {
      invariant:
        "Reversibility plan infrastructure declares rollback checkpoints and parses strategist rollback fields.",
      minProbeCount: 3,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "srisk.rollback_engine_exported",
        category: "reversibility_plan",
        description: "RollbackEngine exported for checkpoint-based reversibility",
        expected: "PASS",
        disposition: "observed",
        criterion: "RollbackEngine exported for checkpoint-based reversibility",
      },
      {
        id: "srisk.orchestrator_rollback_seams",
        category: "reversibility_plan",
        description: "Orchestrator wires rollback.createPoint, rollbackLastAtom and rollbackBlock",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator wires rollback.createPoint, rollbackLastAtom and rollbackBlock",
      },
      {
        id: "srisk.messaging_rollback_command",
        category: "reversibility_plan",
        description: "Messaging gateway exposes /rollback command for last-atom rollback",
        expected: "PASS",
        disposition: "observed",
        criterion: "Messaging gateway exposes /rollback command for last-atom rollback",
      },
      {
        id: "srisk.parser_risk_plan_fields",
        category: "reversibility_plan",
        description: "parseDecomposeResponse exports risk plan and rollback plan fields",
        expected: "FAIL",
        disposition: "gap",
        criterion: "parseDecomposeResponse exports risk plan and rollback plan fields",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Risk reversibility baseline links to sealed P03-B04 dependency DAG block gate handoff artifacts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "srisk.b04_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P03_B04_TO_B05_HANDOFF_V1 targets P03-B05-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P03_B04_TO_B05_HANDOFF_V1 targets P03-B05-A01 entry atom",
      },
      {
        id: "srisk.b04_sealed_dependency_dag_probes",
        category: "baseline_link",
        description: "P03-B04→B05 handoff sealed probeCount matches active dependency DAG contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P03-B04→B05 handoff sealed probeCount matches active dependency DAG contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Risk reversibility baseline documents source block gate references and decompose input boundaries.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "srisk.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P03-B04 dependency DAG block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P03-B04 dependency DAG block gate source artifacts",
      },
      {
        id: "srisk.probe_runner_exported",
        category: "boundary",
        description: "runStrategistRiskReversibilityProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runStrategistRiskReversibilityProbes executes contract-wired probe matrix",
      },
      {
        id: "srisk.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL risk reversibility gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL risk reversibility gap",
      },
      {
        id: "srisk.empty_decompose_boundary",
        category: "boundary",
        description: "assessStrategistRiskReversibilityInputBoundary rejects empty decompose output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistRiskReversibilityInputBoundary rejects empty decompose output",
      },
      {
        id: "srisk.whitespace_decompose_boundary",
        category: "boundary",
        description: "assessStrategistRiskReversibilityInputBoundary rejects whitespace-only decompose output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistRiskReversibilityInputBoundary rejects whitespace-only decompose output",
      },
      {
        id: "srisk.long_decompose_truncation_boundary",
        category: "boundary",
        description: "assessStrategistRiskReversibilityInputBoundary truncates decompose exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistRiskReversibilityInputBoundary truncates decompose exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Risk reversibility baseline validation rejects invalid versions and malformed inputs.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "srisk.invalid_version_rejected",
        category: "failure_path",
        description: "validateStrategistRiskReversibilityBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateStrategistRiskReversibilityBaseline rejects unexpected fixture version",
      },
      {
        id: "srisk.malformed_decompose_guard",
        category: "failure_path",
        description: "assessStrategistRiskReversibilityInputBoundary rejects null-byte decompose output safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessStrategistRiskReversibilityInputBoundary rejects null-byte decompose output safely",
      },
      {
        id: "srisk.min_category_probes",
        category: "failure_path",
        description: "validateStrategistRiskReversibilityBaseline enforces per-category minimum probe counts",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateStrategistRiskReversibilityBaseline enforces per-category minimum probe counts",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant: "Pipeline recovery paths roll back failed atoms and vision-violating blocks.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "srisk.recovery_worker_failure_rollback",
        category: "recovery_path",
        description: "Pipeline rolls back last atom when worker execution or verification fails",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Pipeline rolls back last atom when worker execution or verification fails",
      },
      {
        id: "srisk.recovery_vision_violation_rollback_block",
        category: "recovery_path",
        description: "Pipeline rolls back block when reflection detects vision violation",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Pipeline rolls back block when reflection detects vision violation",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "NO-GO gates halt irreversible atoms without rollback checkpoints and wire strategist risk validators.",
      minProbeCount: 2,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "srisk.nogo_irreversible_halt",
        category: "nogo_path",
        description: "Pipeline halts irreversible atom when rollback checkpoint is missing",
        expected: "FAIL",
        disposition: "nogo",
        criterion: "Pipeline halts irreversible atom when rollback checkpoint is missing",
      },
      {
        id: "srisk.exported_orchestrator_risk_validator",
        category: "nogo_path",
        description: "validateStrategistRiskReversibility exported for orchestrator pre-execution checks",
        expected: "FAIL",
        disposition: "nogo",
        criterion: "validateStrategistRiskReversibility exported for orchestrator pre-execution checks",
      },
    ],
  },
};

export const FORGE_STRATEGIST_RISK_REVERSIBILITY_CONTRACT_V1: StrategistRiskReversibilityContract = {
  version: "1.0.0",
  atom: "P03-B05-A06",
  purpose:
    "Typed strategist risk and reversibility contract with measurable probes for assessment, rollback planning, boundary and recovery paths.",
  categories: STRATEGIST_RISK_REVERSIBILITY_CATEGORY_CONTRACTS,
  probes: flattenStrategistRiskReversibilityCategoryProbes(STRATEGIST_RISK_REVERSIBILITY_CATEGORY_CONTRACTS),
};

export function getActiveStrategistRiskReversibilityContract(): StrategistRiskReversibilityContract {
  return FORGE_STRATEGIST_RISK_REVERSIBILITY_CONTRACT_V1;
}

export function summarizeStrategistRiskReversibilityCoverage(
  contract: StrategistRiskReversibilityContract = getActiveStrategistRiskReversibilityContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<StrategistRiskReversibilityCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<StrategistRiskReversibilityProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    StrategistRiskReversibilityCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<StrategistRiskReversibilityProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };

  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of STRATEGIST_RISK_REVERSIBILITY_CATEGORIES) {
    const categoryContract = contract.categories[category];
    byCategory[category] = {
      probeCount: categoryContract.probes.length,
      invariant: categoryContract.acceptance.invariant,
    };
    totalProbes += categoryContract.probes.length;
    for (const probeEntry of categoryContract.probes) {
      if (probeEntry.expected === "PASS") {
        expectedPass++;
      } else {
        expectedFail++;
      }
      byDisposition[probeEntry.disposition]++;
    }
  }

  return { totalProbes, expectedPass, expectedFail, byCategory, byDisposition };
}

export function validateStrategistRiskReversibilityAgainstContract(
  fixture: StrategistRiskReversibilityBaseline,
  contract: StrategistRiskReversibilityContract = getActiveStrategistRiskReversibilityContract(),
): StrategistRiskReversibilityValidationResult {
  const issues: StrategistRiskReversibilityValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  for (const category of STRATEGIST_RISK_REVERSIBILITY_CATEGORIES) {
    const categoryContract = contract.categories[category];
    const categoryProbes = fixture.probes.filter(p => p.category === category);
    if (categoryProbes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} has ${categoryProbes.length} probes; ` +
          `contract requires >= ${categoryContract.acceptance.minProbeCount}`,
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

export interface StrategistRiskReversibilityCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: StrategistRiskReversibilityCategory;
  detail: string;
}

export interface StrategistRiskReversibilityCoverageResult {
  valid: boolean;
  issues: StrategistRiskReversibilityCoverageIssue[];
}

export function getStrategistRiskReversibilityCategoryContract(
  category: StrategistRiskReversibilityCategory,
  contract: StrategistRiskReversibilityContract = getActiveStrategistRiskReversibilityContract(),
): StrategistRiskReversibilityCategoryContract {
  return contract.categories[category];
}

export function listStrategistRiskReversibilityContractProbeIds(
  contract: StrategistRiskReversibilityContract = getActiveStrategistRiskReversibilityContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listStrategistRiskReversibilityProbesByDisposition(
  disposition: StrategistRiskReversibilityProbeDisposition,
  contract: StrategistRiskReversibilityContract = getActiveStrategistRiskReversibilityContract(),
): StrategistRiskReversibilityProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listStrategistRiskReversibilityContractProbesByCategory(
  category: StrategistRiskReversibilityCategory,
  contract: StrategistRiskReversibilityContract = getActiveStrategistRiskReversibilityContract(),
): StrategistRiskReversibilityProbeContract[] {
  return contract.categories[category].probes;
}

export function validateStrategistRiskReversibilityCoverage(
  contract: StrategistRiskReversibilityContract = getActiveStrategistRiskReversibilityContract(),
): StrategistRiskReversibilityCoverageResult {
  const issues: StrategistRiskReversibilityCoverageIssue[] = [];

  for (const category of STRATEGIST_RISK_REVERSIBILITY_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < STRATEGIST_RISK_REVERSIBILITY_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${STRATEGIST_RISK_REVERSIBILITY_A01_MIN_PROBES[category]}`,
      });
    }
    if (categoryContract.probes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} has ${categoryContract.probes.length} probes; ` +
          `contract requires >= ${categoryContract.acceptance.minProbeCount}`,
      });
    }
    if (categoryContract.acceptance.invariant.trim().length <= 20) {
      issues.push({
        kind: "missing_criterion",
        category,
        detail: `${category} invariant too short`,
      });
    }
    for (const probeEntry of categoryContract.probes) {
      if (probeEntry.criterion.trim().length <= 10) {
        issues.push({
          kind: "missing_criterion",
          probeId: probeEntry.id,
          detail: `${probeEntry.id} criterion too short`,
        });
      }
    }
  }

  const ids = listStrategistRiskReversibilityContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeStrategistRiskReversibilityCoverage(contract);
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

  for (const probeEntry of contract.probes) {
    if (!probeEntry.id.startsWith("srisk.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probeEntry.id,
        detail: `${probeEntry.id} missing srisk. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export const FORGE_STRATEGIST_RISK_REVERSIBILITY_A01_PROBE_MATRIX: readonly StrategistRiskReversibilityFixtureEntry[] =
  strategistRiskReversibilityBaseline.probes as StrategistRiskReversibilityFixtureEntry[];

export function loadStrategistRiskReversibilityBaseline(): StrategistRiskReversibilityBaseline {
  return strategistRiskReversibilityBaseline as StrategistRiskReversibilityBaseline;
}

export function validateStrategistRiskReversibilityBaseline(
  fixture: StrategistRiskReversibilityBaseline,
): StrategistRiskReversibilityValidationResult {
  const issues: StrategistRiskReversibilityValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P03-B05-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    STRATEGIST_RISK_REVERSIBILITY_CATEGORIES.map(category => [category, 0]),
  ) as Record<StrategistRiskReversibilityCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of STRATEGIST_RISK_REVERSIBILITY_CATEGORIES) {
    const min = STRATEGIST_RISK_REVERSIBILITY_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_STRATEGIST_RISK_REVERSIBILITY_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_STRATEGIST_RISK_REVERSIBILITY_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_STRATEGIST_RISK_REVERSIBILITY_A01_PROBE_MATRIX) {
    const entry = fixture.probes.find(p => p.id === expected.id);
    if (!entry) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `missing probe ${expected.id}`,
      });
      continue;
    }
    if (entry.category !== expected.category) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `category mismatch for ${expected.id}`,
      });
    }
    if (entry.expected !== expected.expected) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `expected mismatch for ${expected.id}`,
      });
    }
  }

  const handoff = getForgeP03B04ToB05Handoff();
  const dependencyDagCoverage = summarizeStrategistDependencyDagCoverage(
    getActiveStrategistDependencyDagContract(),
  );

  if (fixture.sourceBlockGate.atom !== "P03-B04-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P03-B04-A10`,
    });
  }
  if (fixture.sourceBlockGate.contractVersion !== FORGE_STRATEGIST_DEPENDENCY_DAG_VERSION) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.contractVersion=${fixture.sourceBlockGate.contractVersion} ` +
        `expected=${FORGE_STRATEGIST_DEPENDENCY_DAG_VERSION}`,
    });
  }
  if (fixture.sourceBlockGate.dependencyDagProbeCount !== dependencyDagCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.dependencyDagProbeCount=${fixture.sourceBlockGate.dependencyDagProbeCount} ` +
        `contract=${dependencyDagCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P03_B04_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P03_B04_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P03_B04_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B04 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P03_B04_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P03-B05-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `B04 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P03-B05-A01`,
    });
  }

  const contractAlignment = validateStrategistRiskReversibilityAgainstContract(
    fixture,
    getActiveStrategistRiskReversibilityContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeStrategistRiskReversibilityMatrix(
  results: StrategistRiskReversibilityProbeResult[],
): StrategistRiskReversibilityProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as StrategistRiskReversibilityProbeSummary["byCategory"];
  for (const category of STRATEGIST_RISK_REVERSIBILITY_CATEGORIES) {
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

export function listStrategistRiskReversibilityProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistRiskReversibilityBaseline = loadStrategistRiskReversibilityBaseline(),
): StrategistRiskReversibilityFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listStrategistRiskReversibilityKnownGaps(
  results: StrategistRiskReversibilityProbeResult[],
): StrategistRiskReversibilityProbeResult[] {
  return summarizeStrategistRiskReversibilityMatrix(results).knownGaps;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = __dirname;

function readSrc(relativePath: string): string {
  return readFileSync(join(SRC_ROOT, relativePath), "utf8");
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: StrategistRiskReversibilityCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): StrategistRiskReversibilityProbeResult {
  const actual = outcome(ok);
  return {
    id,
    category,
    expected,
    actual,
    aligned: actual === expected,
    detail,
    criterion,
  };
}

function productionRiskReversibilitySource(): string {
  return readSrc("forge-p03-strategist-risk-reversibility.ts");
}

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionRiskReversibilitySource());
}

const SAMPLE_DECOMPOSE_OUTPUT = `REASONING: Risk-aware decomposition
OUTPUT:
Block 1: Setup risk baseline types
Block 2: Wire rollback checkpoint seam
Block 3: Add risk reversibility tests
DEPENDENCIES: 2→1, 3→1,2
CONFIDENCE: 0.85`;

function decomposeFormatSection(): string {
  const prompts = promptsSource();
  const decomposeStart = prompts.indexOf("## Output Format — DECOMPOSE");
  const atomizeStart = prompts.indexOf("## Output Format — ATOMIZE");
  if (decomposeStart === -1 || atomizeStart === -1 || atomizeStart <= decomposeStart) {
    return prompts;
  }
  return prompts.slice(decomposeStart, atomizeStart);
}

function atomizeFormatSection(): string {
  const prompts = promptsSource();
  const atomizeStart = prompts.indexOf("## Output Format — ATOMIZE");
  const checklistStart = prompts.indexOf("## Atomize Quality Checklist");
  if (atomizeStart === -1) {
    return prompts;
  }
  const end = checklistStart === -1 ? prompts.length : checklistStart;
  return prompts.slice(atomizeStart, end);
}

function probeRiskVersioning(
  id: string,
  category: StrategistRiskReversibilityCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistRiskReversibilityBaseline,
): StrategistRiskReversibilityProbeResult {
  switch (id) {
    case "srisk.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "srisk.atom_tagged": {
      const ok = fixture.atom === "P03-B05-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "srisk.harness_version_exported": {
      const ok = FORGE_STRATEGIST_RISK_REVERSIBILITY_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_STRATEGIST_RISK_REVERSIBILITY_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown risk_versioning probe");
  }
}

function probeRiskAssessment(
  id: string,
  category: StrategistRiskReversibilityCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistRiskReversibilityProbeResult {
  const approvalEngine = readSrc("approval-engine.ts");
  const executionEngine = readSrc("execution-engine.ts");
  const prompts = promptsSource();
  const parser = readSrc("parser.ts");
  const interactiveConfirm = readSrc("interactive-confirm.ts");
  const orchestrator = orchestratorSource();
  const decomposeFormat = decomposeFormatSection();

  switch (id) {
    case "srisk.approval_execution_risk_scoring": {
      const ok =
        approvalEngine.includes("calculateRiskScore(") &&
        approvalEngine.includes("assess(") &&
        executionEngine.includes("connectApproval(") &&
        executionEngine.includes("approvalEngine.assess(");
      return probe(id, category, expected, ok, `approvalExecutionGate=${ok}`);
    }
    case "srisk.researcher_interactive_risk_fields": {
      const ok =
        prompts.includes("RISKS: [specific risks with severity and mitigation") &&
        parser.includes("risks: string") &&
        parser.includes('extractField(text, "RISKS"') &&
        interactiveConfirm.includes("export function assessRisk(");
      return probe(id, category, expected, ok, `researcherInteractiveRisk=${ok}`);
    }
    case "srisk.prompt_decompose_risk_plan": {
      const hasRisks = /RISKS:/i.test(decomposeFormat);
      const hasRollbackPlan = /ROLLBACK PLAN:/i.test(decomposeFormat);
      const ok = hasRisks && hasRollbackPlan;
      return probe(
        id,
        category,
        expected,
        ok,
        `decomposeRisks=${hasRisks}, rollbackPlan=${hasRollbackPlan}`,
      );
    }
    case "srisk.prompt_atom_blast_radius": {
      const atomizeFormat = atomizeFormatSection();
      const ok = /blast_radius/i.test(atomizeFormat);
      return probe(id, category, expected, ok, `atomBlastRadius=${ok}`);
    }
    case "srisk.orchestrator_pre_exec_risk_gate": {
      const ok =
        orchestrator.includes("validateStrategistRiskReversibility(") ||
        (orchestrator.includes("risk plan") && orchestrator.includes("before atom"));
      return probe(id, category, expected, ok, `preExecRiskGate=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown risk_assessment probe");
  }
}

function probeReversibilityPlan(
  id: string,
  category: StrategistRiskReversibilityCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistRiskReversibilityProbeResult {
  const rollbackEngine = readSrc("rollback-engine.ts");
  const orchestrator = orchestratorSource();
  const gateway = readSrc("forge-gateway.ts");

  switch (id) {
    case "srisk.rollback_engine_exported": {
      const ok =
        rollbackEngine.includes("export class RollbackEngine") &&
        rollbackEngine.includes("createPoint(") &&
        rollbackEngine.includes("rollbackLastAtom(");
      return probe(id, category, expected, ok, `rollbackEngine=${ok}`);
    }
    case "srisk.orchestrator_rollback_seams": {
      const ok =
        orchestrator.includes("rollback.createPoint(") &&
        orchestrator.includes("rollback.rollbackLastAtom(") &&
        orchestrator.includes("rollback.rollbackBlock(");
      return probe(id, category, expected, ok, `rollbackSeams=${ok}`);
    }
    case "srisk.messaging_rollback_command": {
      const ok =
        gateway.includes('trimmed === "/rollback"') &&
        gateway.includes("rollback.rollbackLastAtom(");
      return probe(id, category, expected, ok, `messagingRollback=${ok}`);
    }
    case "srisk.parser_risk_plan_fields": {
      const parsed = parseDecomposeResponse(SAMPLE_DECOMPOSE_OUTPUT);
      const data = parsed.ok ? parsed.data : null;
      const ok =
        parsed.ok === true &&
        data !== null &&
        ("riskPlan" in data || "risks" in data || "rollbackPlan" in data);
      return probe(id, category, expected, ok, `riskPlanFields=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown reversibility_plan probe");
  }
}

function probeBaselineLink(
  id: string,
  category: StrategistRiskReversibilityCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistRiskReversibilityProbeResult {
  switch (id) {
    case "srisk.b04_block_handoff_entry": {
      const handoff = getForgeP03B04ToB05Handoff();
      const ok =
        handoff.targetBlock.blockId === "P03-B05" &&
        handoff.targetBlock.entryAtom === "P03-B05-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "srisk.b04_sealed_dependency_dag_probes": {
      const handoff = getForgeP03B04ToB05Handoff();
      const coverage = summarizeStrategistDependencyDagCoverage(getActiveStrategistDependencyDagContract());
      const ok = handoff.sealedArtifacts.probeCount === coverage.totalProbes;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoff_probes=${handoff.sealedArtifacts.probeCount}, contract=${coverage.totalProbes}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown baseline_link probe");
  }
}

function probeBoundary(
  id: string,
  category: StrategistRiskReversibilityCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistRiskReversibilityBaseline,
): StrategistRiskReversibilityProbeResult {
  switch (id) {
    case "srisk.source_block_gate_ref": {
      const handoff = getForgeP03B04ToB05Handoff();
      const coverage = summarizeStrategistDependencyDagCoverage(getActiveStrategistDependencyDagContract());
      const ok =
        fixture.sourceBlockGate.atom === "P03-B04-A10" &&
        fixture.sourceBlockGate.contractVersion === FORGE_STRATEGIST_DEPENDENCY_DAG_VERSION &&
        fixture.sourceBlockGate.dependencyDagProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P03_B04_SEALED_ATOM_COUNT &&
        handoff.atom === "P03-B04-A10";
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.dependencyDagProbeCount}`,
      );
    }
    case "srisk.probe_runner_exported": {
      const ok = productionRiskReversibilitySource().includes(
        "export function runStrategistRiskReversibilityProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "srisk.known_gaps_documented": {
      const contract = getActiveStrategistRiskReversibilityContract();
      const expectedFail = contract.probes.filter(p => p.expected === "FAIL").length;
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount === expectedFail && failCount >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, contractExpectedFail=${expectedFail}`,
      );
    }
    case "srisk.empty_decompose_boundary": {
      const result = assessStrategistRiskReversibilityInputBoundary("");
      const ok =
        hasProductionExport("assessStrategistRiskReversibilityInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, acceptable=${result.acceptable}`,
      );
    }
    case "srisk.whitespace_decompose_boundary": {
      const result = assessStrategistRiskReversibilityInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessStrategistRiskReversibilityInputBoundary") &&
        result.disposition === "whitespace_only" &&
        result.acceptable === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, acceptable=${result.acceptable}`,
      );
    }
    case "srisk.long_decompose_truncation_boundary": {
      const longDecompose = "x".repeat(STRATEGIST_RISK_REVERSIBILITY_DECOMPOSE_MAX_LENGTH + 500);
      const result = assessStrategistRiskReversibilityInputBoundary(longDecompose);
      const ok =
        hasProductionExport("assessStrategistRiskReversibilityInputBoundary") &&
        result.disposition === "exceeds_max_length" &&
        result.truncated === true &&
        result.normalizedDecompose.length === STRATEGIST_RISK_REVERSIBILITY_DECOMPOSE_MAX_LENGTH &&
        result.acceptable === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, truncated=${result.truncated}, len=${result.normalizedDecompose.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: StrategistRiskReversibilityCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistRiskReversibilityBaseline,
): StrategistRiskReversibilityProbeResult {
  switch (id) {
    case "srisk.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateStrategistRiskReversibilityBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "srisk.malformed_decompose_guard": {
      const boundary = assessStrategistRiskReversibilityInputBoundary("bad\0decompose");
      const ok =
        hasProductionExport("assessStrategistRiskReversibilityInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false;
      return probe(id, category, expected, ok, `detail=${boundary.detail}`);
    }
    case "srisk.min_category_probes": {
      const underflow = { ...fixture, probes: fixture.probes.filter(p => p.category !== "nogo_path") };
      const ok = validateStrategistRiskReversibilityBaseline(underflow).valid === false;
      return probe(id, category, expected, ok, `rejectsUnderflow=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: StrategistRiskReversibilityCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistRiskReversibilityProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "srisk.recovery_worker_failure_rollback": {
      const ok =
        orchestrator.includes("rollback.rollbackLastAtom(") &&
        (orchestrator.includes("Worker wrote broken code") ||
          orchestrator.includes('phase: "rollback"'));
      return probe(id, category, expected, ok, `workerFailureRollback=${ok}`);
    }
    case "srisk.recovery_vision_violation_rollback_block": {
      const ok =
        orchestrator.includes("rollback.rollbackBlock(") &&
        orchestrator.includes("Vision violation");
      return probe(id, category, expected, ok, `visionViolationRollback=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: StrategistRiskReversibilityCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistRiskReversibilityProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "srisk.nogo_irreversible_halt": {
      const checksIrreversible =
        orchestrator.includes("irreversible") &&
        (orchestrator.includes("halt") || orchestrator.includes("return this.buildResult(false"));
      const requiresCheckpoint =
        orchestrator.includes("rollback checkpoint") ||
        orchestrator.includes("missing rollback checkpoint");
      const ok = checksIrreversible && requiresCheckpoint;
      return probe(id, category, expected, ok, `irreversibleHalt=${ok}`);
    }
    case "srisk.exported_orchestrator_risk_validator": {
      const ok =
        hasProductionExport("validateStrategistRiskReversibility") &&
        orchestrator.includes("validateStrategistRiskReversibility(");
      return probe(id, category, expected, ok, `riskValidator=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: StrategistRiskReversibilityCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistRiskReversibilityBaseline,
): StrategistRiskReversibilityProbeResult {
  switch (category) {
    case "risk_versioning":
      return probeRiskVersioning(id, category, expected, fixture);
    case "risk_assessment":
      return probeRiskAssessment(id, category, expected);
    case "reversibility_plan":
      return probeReversibilityPlan(id, category, expected);
    case "baseline_link":
      return probeBaselineLink(id, category, expected);
    case "boundary":
      return probeBoundary(id, category, expected, fixture);
    case "failure_path":
      return probeFailurePath(id, category, expected, fixture);
    case "recovery_path":
      return probeRecoveryPath(id, category, expected);
    case "nogo_path":
      return probeNogoPath(id, category, expected);
    default:
      return probe(id, category, expected, false, "unknown category");
  }
}

export interface StrategistRiskReversibilityProbeMatrixValidationIssue {
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

export interface StrategistRiskReversibilityProbeMatrixValidationResult {
  valid: boolean;
  issues: StrategistRiskReversibilityProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 */
export function validateStrategistRiskReversibilityProbeMatrix(
  results: StrategistRiskReversibilityProbeResult[],
  contract: StrategistRiskReversibilityContract = getActiveStrategistRiskReversibilityContract(),
): StrategistRiskReversibilityProbeMatrixValidationResult {
  const issues: StrategistRiskReversibilityProbeMatrixValidationIssue[] = [];
  const resultById = new Map(results.map(result => [result.id, result]));
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

export interface StrategistRiskReversibilityProductionSliceResult {
  atom: "P03-B05-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: StrategistRiskReversibilityProbeResult[];
  summary: StrategistRiskReversibilityProbeSummary;
  matrixValidation: StrategistRiskReversibilityProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: recoverStrategistRiskReversibility wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runStrategistRiskReversibilityProductionSlice(
  fixture: StrategistRiskReversibilityBaseline = loadStrategistRiskReversibilityBaseline(),
): StrategistRiskReversibilityProductionSliceResult {
  const contract = getActiveStrategistRiskReversibilityContract();
  const fixtureValidation = validateStrategistRiskReversibilityBaseline(fixture);
  const contractValidation = validateStrategistRiskReversibilityAgainstContract(fixture, contract);
  const results = runStrategistRiskReversibilityProbes(fixture);
  const summary = summarizeStrategistRiskReversibilityMatrix(results);
  const matrixValidation = validateStrategistRiskReversibilityProbeMatrix(results, contract);

  return {
    atom: "P03-B05-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export function runStrategistRiskReversibilityProbes(
  fixture: StrategistRiskReversibilityBaseline = loadStrategistRiskReversibilityBaseline(),
): StrategistRiskReversibilityProbeResult[] {
  const contract = getActiveStrategistRiskReversibilityContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion ? { ...result, criterion: contractProbe.criterion } : result;
  });
}
