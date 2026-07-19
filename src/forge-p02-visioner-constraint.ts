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

export const FORGE_VISIONER_CONSTRAINT_VERSION = "1.0.0-a01";

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

/**
 * Assess whether vision output declares CONSTRAINT and FORBIDDEN (non-goal) sections (P02-B02-A01).
 */
export function assessVisionerConstraintPresence(visionOutput: string): VisionerConstraintPresence {
  if (visionOutput.includes("\0")) {
    return {
      hasConstraints: false,
      hasNonGoals: false,
      constraintLines: [],
      nonGoalLines: [],
      detail: "null byte in vision output",
    };
  }

  const lines = visionOutput.split("\n");
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
        "Constraint baseline references sealed B01 block gate; probe runner and documented gaps wired.",
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
        description: "assessVisionerConstraintPresence reports no constraints for empty vision output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerConstraintPresence reports no constraints for empty vision output",
      },
      {
        id: "vcon.memory_constraint_category",
        category: "boundary",
        description: "Memory category type includes constraint for project guardrails",
        expected: "PASS",
        disposition: "observed",
        criterion: "Memory category type includes constraint for project guardrails",
      },
      {
        id: "vcon.worker_vision_summary_wired",
        category: "boundary",
        description: "Orchestrator injects buildVisionSummary constraint slice into worker context",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator injects buildVisionSummary constraint slice into worker context",
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
