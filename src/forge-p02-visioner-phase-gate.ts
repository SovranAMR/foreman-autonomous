/**
 * FOREMAN — Visioner Phase Gate Baseline (P02-B10)
 *
 * Measures P02 visioner phase acceptance from sealed P02-B09 block gate artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import { P02_PHASE_ID } from "./forge-p01-phase-gate.js";
import {
  getForgeP02B09ToB10Handoff,
  getActiveVisionerApprovalContract,
  summarizeVisionerApprovalContractCoverage,
} from "./forge-p02-visioner-approval.js";

export const FORGE_VISIONER_PHASE_GATE_VERSION = "1.0.0";

export const P02_VISIONER_PHASE_ID = P02_PHASE_ID;
export const P03_STRATEGIST_PHASE_ID = "P03" as const;

export const EXPECTED_P02_B09_SEALED_ATOM_COUNT = 10;

/** Canonical P02 visioner blocks B01–B10 with block-gate runner identifiers. */
export const P02_VISIONER_PHASE_BLOCK_INVENTORY = [
  { blockId: "P02-B01", title: "Intent ve görev anlamlandırma", runner: "runForgeVisionerIntentBlockGate" },
  { blockId: "P02-B02", title: "Constraint ve non-goal çıkarımı", runner: "runForgeVisionerConstraintBlockGate" },
  { blockId: "P02-B03", title: "Ürün vizyonu sentezi", runner: "runForgeVisionerSynthesisBlockGate" },
  { blockId: "P02-B04", title: "Repo ve kullanıcı bağlamı grounding", runner: "runForgeVisionerGroundingBlockGate" },
  { blockId: "P02-B05", title: "Research trigger belirleme", runner: "runForgeVisionerResearchTriggerBlockGate" },
  { blockId: "P02-B06", title: "Uncertainty ve clarification policy", runner: "runForgeVisionerUncertaintyBlockGate" },
  { blockId: "P02-B07", title: "Alternatif vizyon üretimi", runner: "runForgeVisionerAlternativeBlockGate" },
  { blockId: "P02-B08", title: "Vizyon scoring ve trade-off", runner: "runForgeVisionerScoringBlockGate" },
  { blockId: "P02-B09", title: "Kullanıcı approval ve steering", runner: "runForgeVisionerApprovalBlockGate" },
  { blockId: "P02-B10", title: "Vizyoner phase gate", runner: "runForgeVisionerPhaseGate" },
] as const;

export const P02_VISIONER_PHASE_BLOCK_COUNT = P02_VISIONER_PHASE_BLOCK_INVENTORY.length;
export const P02_VISIONER_PHASE_ATOM_COUNT = P02_VISIONER_PHASE_BLOCK_COUNT * 10;

export const P02_VISIONER_PHASE_GATE_CHECKS = [
  { id: "block_gates_pass", description: "All ten P02 visioner block gates PASS with sealed atom evidence" },
  { id: "atom_terminal_count", description: "One hundred P02 visioner atoms terminal and evidenced via block seals" },
  { id: "approval_regression", description: "Visioner approval regression gate PASS" },
  { id: "phase_handoff", description: "P02→P03 phase handoff contract valid with P03-B01 entry" },
] as const;

export type P02VisionerPhaseGateCheckId = (typeof P02_VISIONER_PHASE_GATE_CHECKS)[number]["id"];

export interface P02VisionerBlockGateSeal {
  blockId: string;
  title: string;
  runner: string;
  passed: boolean;
  atomSealCount: number;
  detail: string;
}

export interface P02VisionerPhaseGateEvidence {
  phaseId: typeof P02_VISIONER_PHASE_ID;
  atom: "P02-PHASE-GATE";
  sealedAt: string;
  blockSeals: P02VisionerBlockGateSeal[];
  blockGatesPassed: number;
  atomSealsPassed: number;
  approvalRegressionPassed: boolean;
  handoffValid: boolean;
  gitCommit?: string;
}

export interface P02PhaseHandoffContract {
  version: string;
  atom: "P02-PHASE-GATE";
  sourcePhase: {
    phaseId: typeof P02_VISIONER_PHASE_ID;
    title: string;
    completedBlocks: readonly string[];
    completedAtoms: number;
  };
  targetPhase: {
    phaseId: typeof P03_STRATEGIST_PHASE_ID;
    title: string;
    entryBlock: string;
    entryAtom: string;
  };
  sealedArtifacts: {
    visionerApprovalVersion: string;
    visionerApprovalProbeCount: number;
    sealedBlockInventoryCount: number;
    blockGateMethod: string;
    phaseGateMethod: string;
  };
  prerequisites: readonly string[];
  entryCriteria: {
    description: string;
    requiresPhaseGatePass: true;
    requiresApprovalBlockGate: true;
  };
}

export const FORGE_P02_TO_P03_PHASE_HANDOFF_V1: P02PhaseHandoffContract = {
  version: "1.0.0",
  atom: "P02-PHASE-GATE",
  sourcePhase: {
    phaseId: P02_VISIONER_PHASE_ID,
    title: "Vizyoner — Neden, Amaç ve Ürün Yönü",
    completedBlocks: P02_VISIONER_PHASE_BLOCK_INVENTORY.map(block => block.blockId),
    completedAtoms: P02_VISIONER_PHASE_ATOM_COUNT,
  },
  targetPhase: {
    phaseId: P03_STRATEGIST_PHASE_ID,
    title: "Stratejist — Parçalama ve Organizasyon",
    entryBlock: "P03-B01",
    entryAtom: "P03-B01-A01",
  },
  sealedArtifacts: {
    visionerApprovalVersion: getActiveVisionerApprovalContract().version,
    visionerApprovalProbeCount: summarizeVisionerApprovalContractCoverage(
      getActiveVisionerApprovalContract(),
    ).totalProbes,
    sealedBlockInventoryCount: P02_VISIONER_PHASE_BLOCK_COUNT,
    blockGateMethod: "verifyForgeVisionerApprovalBlockGate",
    phaseGateMethod: "verifyForgeP02VisionerPhaseGate",
  },
  prerequisites: [
    "Ten sealed P02 visioner block gates with atom-level evidence",
    "Visioner approval block gate PASS with P02-B10 handoff",
    "Visioner approval regression and guard gates PASS",
    "Orchestrator exposes verifyForgeP02VisionerPhaseGate for phase acceptance",
  ],
  entryCriteria: {
    description:
      "P03-B01-A01 formalizes strategist intent baseline using sealed P02 visioner phase gate artifacts",
    requiresPhaseGatePass: true,
    requiresApprovalBlockGate: true,
  },
};

export function getForgeP02ToP03PhaseHandoff(): P02PhaseHandoffContract {
  return FORGE_P02_TO_P03_PHASE_HANDOFF_V1;
}

export function validateP02PhaseHandoffContract(
  handoff: P02PhaseHandoffContract,
  evidence: Pick<
    P02VisionerPhaseGateEvidence,
    "blockGatesPassed" | "atomSealsPassed" | "approvalRegressionPassed" | "handoffValid"
  >,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const coverage = summarizeVisionerApprovalContractCoverage(getActiveVisionerApprovalContract());

  if (handoff.sourcePhase.completedBlocks.length !== P02_VISIONER_PHASE_BLOCK_COUNT) {
    issues.push(
      `handoff completedBlocks=${handoff.sourcePhase.completedBlocks.length} expected=${P02_VISIONER_PHASE_BLOCK_COUNT}`,
    );
  }
  if (handoff.sourcePhase.completedAtoms !== P02_VISIONER_PHASE_ATOM_COUNT) {
    issues.push(
      `handoff completedAtoms=${handoff.sourcePhase.completedAtoms} expected=${P02_VISIONER_PHASE_ATOM_COUNT}`,
    );
  }
  if (handoff.targetPhase.entryAtom !== "P03-B01-A01") {
    issues.push(`unexpected entry atom: ${handoff.targetPhase.entryAtom}`);
  }
  if (handoff.sealedArtifacts.visionerApprovalProbeCount !== coverage.totalProbes) {
    issues.push(
      `handoff probeCount=${handoff.sealedArtifacts.visionerApprovalProbeCount} contract=${coverage.totalProbes}`,
    );
  }
  if (handoff.sealedArtifacts.sealedBlockInventoryCount !== P02_VISIONER_PHASE_BLOCK_COUNT) {
    issues.push(
      `handoff sealedBlockInventoryCount=${handoff.sealedArtifacts.sealedBlockInventoryCount} expected=${P02_VISIONER_PHASE_BLOCK_COUNT}`,
    );
  }
  if (evidence.blockGatesPassed !== P02_VISIONER_PHASE_BLOCK_COUNT) {
    issues.push(`blockGatesPassed=${evidence.blockGatesPassed} expected=${P02_VISIONER_PHASE_BLOCK_COUNT}`);
  }
  if (evidence.atomSealsPassed !== P02_VISIONER_PHASE_ATOM_COUNT) {
    issues.push(`atomSealsPassed=${evidence.atomSealsPassed} expected=${P02_VISIONER_PHASE_ATOM_COUNT}`);
  }
  if (!evidence.approvalRegressionPassed) {
    issues.push("approval regression gate did not pass");
  }
  if (!evidence.handoffValid) {
    issues.push("approval block handoff invalid");
  }

  return { valid: issues.length === 0, issues };
}

export function buildP02VisionerPhaseGateEvidence(
  blockSeals: P02VisionerBlockGateSeal[],
  approvalRegressionPassed: boolean,
  handoffValid: boolean,
  gitCommit?: string,
): P02VisionerPhaseGateEvidence {
  const blockGatesPassed = blockSeals.filter(seal => seal.passed).length;
  const atomSealsPassed = blockSeals.reduce((sum, seal) => sum + seal.atomSealCount, 0);

  return {
    phaseId: P02_VISIONER_PHASE_ID,
    atom: "P02-PHASE-GATE",
    sealedAt: new Date().toISOString(),
    blockSeals,
    blockGatesPassed,
    atomSealsPassed,
    approvalRegressionPassed,
    handoffValid,
    ...(gitCommit ? { gitCommit } : {}),
  };
}

export function validateForgeP02VisionerPhaseGateEvidence(
  evidence: P02VisionerPhaseGateEvidence,
  handoff: P02PhaseHandoffContract = getForgeP02ToP03PhaseHandoff(),
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (evidence.phaseId !== handoff.sourcePhase.phaseId) {
    issues.push(`evidence phaseId=${evidence.phaseId} handoff=${handoff.sourcePhase.phaseId}`);
  }
  if (evidence.blockSeals.length !== P02_VISIONER_PHASE_BLOCK_COUNT) {
    issues.push(`block seal count=${evidence.blockSeals.length} expected=${P02_VISIONER_PHASE_BLOCK_COUNT}`);
  }
  if (!evidence.blockSeals.every(seal => seal.passed)) {
    issues.push("one or more block gates failed");
  }
  if (evidence.atomSealsPassed !== P02_VISIONER_PHASE_ATOM_COUNT) {
    issues.push(`atomSealsPassed=${evidence.atomSealsPassed} expected=${P02_VISIONER_PHASE_ATOM_COUNT}`);
  }
  if (!evidence.approvalRegressionPassed) {
    issues.push("approvalRegressionPassed=false");
  }
  if (!evidence.handoffValid) {
    issues.push("handoffValid=false");
  }

  const handoffValidation = validateP02PhaseHandoffContract(handoff, evidence);
  issues.push(...handoffValidation.issues);

  return { valid: issues.length === 0, issues };
}

export const VISIONER_PHASE_GATE_CATEGORIES = [
  "phase_versioning",
  "block_gate_signal",
  "phase_inventory",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type VisionerPhaseGateCategory = (typeof VISIONER_PHASE_GATE_CATEGORIES)[number];

export interface VisionerPhaseGateFixtureEntry {
  id: string;
  category: VisionerPhaseGateCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface VisionerPhaseGateBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    visionerApprovalProbeCount: number;
    sealedAtomCount: number;
  };
  probes: VisionerPhaseGateFixtureEntry[];
}

export interface VisionerPhaseGateProbeResult {
  id: string;
  category: VisionerPhaseGateCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface VisionerPhaseGateProbeSummary {
  total: number;
  aligned: number;
  mismatches: VisionerPhaseGateProbeResult[];
  knownGaps: VisionerPhaseGateProbeResult[];
  byCategory: Record<
    VisionerPhaseGateCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface VisionerPhaseGateValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: VisionerPhaseGateCategory;
  detail: string;
}

export interface VisionerPhaseGateValidationResult {
  valid: boolean;
  issues: VisionerPhaseGateValidationIssue[];
}

export interface VisionerPhaseGateContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: VisionerPhaseGateCategory;
  detail: string;
}

export interface VisionerPhaseGateContractCoverageResult {
  valid: boolean;
  issues: VisionerPhaseGateContractCoverageIssue[];
}

export type VisionerPhaseGateProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface VisionerPhaseGateProbeContract {
  id: string;
  category: VisionerPhaseGateCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: VisionerPhaseGateProbeDisposition;
  criterion: string;
}

export interface VisionerPhaseGateCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface VisionerPhaseGateCategoryContract {
  category: VisionerPhaseGateCategory;
  acceptance: VisionerPhaseGateCategoryAcceptance;
  probes: readonly VisionerPhaseGateProbeContract[];
}

export interface VisionerPhaseGateContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<VisionerPhaseGateCategory, VisionerPhaseGateCategoryContract>;
  probes: readonly VisionerPhaseGateProbeContract[];
}

export const VISIONER_PHASE_GATE_A01_MIN_PROBES: Readonly<
  Record<VisionerPhaseGateCategory, number>
> = {
  phase_versioning: 3,
  block_gate_signal: 3,
  phase_inventory: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

function flattenVisionerPhaseGateCategoryProbes(
  categories: Record<VisionerPhaseGateCategory, VisionerPhaseGateCategoryContract>,
): readonly VisionerPhaseGateProbeContract[] {
  return VISIONER_PHASE_GATE_CATEGORIES.flatMap(category => categories[category].probes);
}

const VISIONER_PHASE_GATE_CATEGORY_CONTRACTS: Record<
  VisionerPhaseGateCategory,
  VisionerPhaseGateCategoryContract
> = {
  phase_versioning: {
    category: "phase_versioning",
    acceptance: {
      invariant:
        "Visioner phase gate baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vpg.version_tagged",
        category: "phase_versioning",
        description: "Visioner phase gate baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner phase gate baseline declares semver version field",
      },
      {
        id: "vpg.atom_tagged",
        category: "phase_versioning",
        description: "Visioner phase gate baseline declares P02-B10-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Visioner phase gate baseline declares P02-B10-A01 atom id",
      },
      {
        id: "vpg.harness_version_exported",
        category: "phase_versioning",
        description: "FORGE_VISIONER_PHASE_GATE_VERSION exported for phase gate harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_VISIONER_PHASE_GATE_VERSION exported for phase gate harness",
      },
    ],
  },
  block_gate_signal: {
    category: "block_gate_signal",
    acceptance: {
      invariant:
        "Orchestrator exposes verifyForgeVisioner*BlockGate methods for sealed P02 visioner blocks.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vpg.orchestrator_intent_block_gate",
        category: "block_gate_signal",
        description: "Orchestrator exposes verifyForgeVisionerIntentBlockGate for P02-B01 seal",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator exposes verifyForgeVisionerIntentBlockGate for P02-B01 seal",
      },
      {
        id: "vpg.orchestrator_approval_block_gate",
        category: "block_gate_signal",
        description: "Orchestrator exposes verifyForgeVisionerApprovalBlockGate for P02-B09 seal",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator exposes verifyForgeVisionerApprovalBlockGate for P02-B09 seal",
      },
      {
        id: "vpg.orchestrator_ten_block_gates",
        category: "block_gate_signal",
        description: "Orchestrator exposes verifyForgeVisioner*BlockGate for all ten P02 visioner blocks",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator exposes verifyForgeVisioner*BlockGate for all ten P02 visioner blocks",
      },
    ],
  },
  phase_inventory: {
    category: "phase_inventory",
    acceptance: {
      invariant:
        "P02 visioner phase inventory declares ten blocks and one hundred atoms with canonical runners.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vpg.block_inventory_exported",
        category: "phase_inventory",
        description: "P02_VISIONER_PHASE_BLOCK_INVENTORY exports canonical ten-block visioner inventory",
        expected: "PASS",
        disposition: "observed",
        criterion: "P02_VISIONER_PHASE_BLOCK_INVENTORY exports canonical ten-block visioner inventory",
      },
      {
        id: "vpg.block_count_constant",
        category: "phase_inventory",
        description: "P02_VISIONER_PHASE_BLOCK_COUNT equals ten sealed visioner blocks",
        expected: "PASS",
        disposition: "observed",
        criterion: "P02_VISIONER_PHASE_BLOCK_COUNT equals ten sealed visioner blocks",
      },
      {
        id: "vpg.atom_count_constant",
        category: "phase_inventory",
        description: "P02_VISIONER_PHASE_ATOM_COUNT equals one hundred visioner atoms",
        expected: "PASS",
        disposition: "observed",
        criterion: "P02_VISIONER_PHASE_ATOM_COUNT equals one hundred visioner atoms",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Phase gate baseline links to sealed P02-B09 block gate and visioner approval handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vpg.b09_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P02_B09_TO_B10_HANDOFF_V1 targets P02-B10-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P02_B09_TO_B10_HANDOFF_V1 targets P02-B10-A01 entry atom",
      },
      {
        id: "vpg.b09_sealed_approval_probes",
        category: "baseline_link",
        description: "P02-B09→B10 handoff sealed probeCount matches active visioner approval contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P02-B09→B10 handoff sealed probeCount matches active visioner approval contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Phase gate baseline references sealed B09 artifacts, probe runner, inventory runners and P03 handoff.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vpg.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P02-B09 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P02-B09 block gate source artifacts",
      },
      {
        id: "vpg.probe_runner_exported",
        category: "boundary",
        description: "runVisionerPhaseGateProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runVisionerPhaseGateProbes executes contract-wired probe matrix",
      },
      {
        id: "vpg.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL phase gate gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL phase gate gap",
      },
      {
        id: "vpg.block_inventory_runners",
        category: "boundary",
        description: "Each P02 visioner block inventory entry references an exported block gate runner",
        expected: "PASS",
        disposition: "observed",
        criterion: "Each P02 visioner block inventory entry references an exported block gate runner",
      },
      {
        id: "vpg.phase_gate_checks_defined",
        category: "boundary",
        description: "P02_VISIONER_PHASE_GATE_CHECKS declares measurable phase acceptance checks",
        expected: "PASS",
        disposition: "observed",
        criterion: "P02_VISIONER_PHASE_GATE_CHECKS declares measurable phase acceptance checks",
      },
      {
        id: "vpg.p03_handoff_contract_exported",
        category: "boundary",
        description: "getForgeP02ToP03PhaseHandoff exports P02→P03 strategist phase entry contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "getForgeP02ToP03PhaseHandoff exports P02→P03 strategist phase entry contract",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Fixture validation rejects invalid versions; handoff rejects incomplete block evidence.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vpg.invalid_version_rejected",
        category: "failure_path",
        description: "validateVisionerPhaseGateBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateVisionerPhaseGateBaseline rejects unexpected fixture version",
      },
      {
        id: "vpg.incomplete_block_inventory_rejected",
        category: "failure_path",
        description: "validateP02PhaseHandoffContract rejects incomplete block gate evidence",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateP02PhaseHandoffContract rejects incomplete block gate evidence",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Checkpoint resume preserves approval; orchestrator phase gate runner remains documented gap until A03.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vpg.approval_checkpoint_resume",
        category: "recovery_path",
        description: "Pipeline resume skips vision approval gate when checkpoint already approved",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Pipeline resume skips vision approval gate when checkpoint already approved",
      },
      {
        id: "vpg.orchestrator_phase_gate_runner",
        category: "recovery_path",
        description: "Orchestrator exposes verifyForgeP02VisionerPhaseGate for P02 phase acceptance",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator exposes verifyForgeP02VisionerPhaseGate for P02 phase acceptance",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant: "Fact-check BLOCK and phase gate evidence validation reject failed block seals.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "vpg.vision_fact_check_block",
        category: "nogo_path",
        description: "Vision after_thought hook can BLOCK pipeline on fact-check failure",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Vision after_thought hook can BLOCK pipeline on fact-check failure",
      },
      {
        id: "vpg.phase_gate_evidence_nogo",
        category: "nogo_path",
        description: "validateForgeP02VisionerPhaseGateEvidence rejects failed block gate seals",
        expected: "PASS",
        disposition: "nogo",
        criterion: "validateForgeP02VisionerPhaseGateEvidence rejects failed block gate seals",
      },
    ],
  },
};

export const FORGE_VISIONER_PHASE_GATE_CONTRACT_V1: VisionerPhaseGateContract = {
  version: "1.0.0",
  atom: "P02-B10-A02",
  purpose: "Visioner phase gate typed contract with measurable acceptance probes.",
  categories: VISIONER_PHASE_GATE_CATEGORY_CONTRACTS,
  probes: flattenVisionerPhaseGateCategoryProbes(VISIONER_PHASE_GATE_CATEGORY_CONTRACTS),
};

export function getActiveVisionerPhaseGateContract(): VisionerPhaseGateContract {
  return FORGE_VISIONER_PHASE_GATE_CONTRACT_V1;
}

export function getVisionerPhaseGateCategoryContract(
  category: VisionerPhaseGateCategory,
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
): VisionerPhaseGateCategoryContract {
  return contract.categories[category];
}

export function listVisionerPhaseGateContractProbeIds(
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listVisionerPhaseGateProbesByDisposition(
  disposition: VisionerPhaseGateProbeDisposition,
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
): VisionerPhaseGateProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function summarizeVisionerPhaseGateContractCoverage(
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<VisionerPhaseGateCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<VisionerPhaseGateProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    VisionerPhaseGateCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<VisionerPhaseGateProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of VISIONER_PHASE_GATE_CATEGORIES) {
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

export function validateVisionerPhaseGateContractCoverage(
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
): VisionerPhaseGateContractCoverageResult {
  const issues: VisionerPhaseGateContractCoverageIssue[] = [];

  for (const category of VISIONER_PHASE_GATE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < VISIONER_PHASE_GATE_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${VISIONER_PHASE_GATE_A01_MIN_PROBES[category]}`,
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

  const ids = listVisionerPhaseGateContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeVisionerPhaseGateContractCoverage(contract);
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
    if (!probe.id.startsWith("vpg.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing vpg. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function listVisionerPhaseGateContractProbesByCategory(
  category: VisionerPhaseGateCategory,
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
): readonly VisionerPhaseGateProbeContract[] {
  return contract.categories[category].probes;
}

export function validateVisionerPhaseGateAgainstContract(
  fixture: VisionerPhaseGateBaseline,
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
): VisionerPhaseGateValidationResult {
  const issues: VisionerPhaseGateValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of VISIONER_PHASE_GATE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    const categoryProbes = listVisionerPhaseGateContractProbesByCategory(category, contract);
    if (categoryProbes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${categoryProbes.length} probes; contract requires >= ${categoryContract.acceptance.minProbeCount}`,
      });
    }
    if (categoryContract.acceptance.minProbeCount < VISIONER_PHASE_GATE_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${VISIONER_PHASE_GATE_A01_MIN_PROBES[category]}`,
      });
    }
  }

  for (const probeEntry of contract.probes) {
    if (!fixtureIds.has(probeEntry.id)) {
      issues.push({ kind: "missing_probe", probeId: probeEntry.id, detail: `fixture missing ${probeEntry.id}` });
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

export function buildDefaultSourceBlockGate(): VisionerPhaseGateBaseline["sourceBlockGate"] {
  const handoff = getForgeP02B09ToB10Handoff();
  const coverage = summarizeVisionerApprovalContractCoverage(getActiveVisionerApprovalContract());
  return {
    version: handoff.version,
    atom: handoff.atom,
    contractVersion: handoff.sealedArtifacts.contractVersion,
    visionerApprovalProbeCount: coverage.totalProbes,
    sealedAtomCount: EXPECTED_P02_B09_SEALED_ATOM_COUNT,
  };
}

export function validateVisionerPhaseGateBaseline(
  fixture: VisionerPhaseGateBaseline,
): VisionerPhaseGateValidationResult {
  const issues: VisionerPhaseGateValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P02-B10-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    VISIONER_PHASE_GATE_CATEGORIES.map(category => [category, 0]),
  ) as Record<VisionerPhaseGateCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of VISIONER_PHASE_GATE_CATEGORIES) {
    const min = VISIONER_PHASE_GATE_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP02B09ToB10Handoff();
  const approvalCoverage = summarizeVisionerApprovalContractCoverage(getActiveVisionerApprovalContract());

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (fixture.sourceBlockGate.visionerApprovalProbeCount !== approvalCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.visionerApprovalProbeCount=${fixture.sourceBlockGate.visionerApprovalProbeCount} ` +
        `contract=${approvalCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P02_B09_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P02_B09_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P02_B09_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B09 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P02_B09_SEALED_ATOM_COUNT}`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length < 1) {
    issues.push({
      kind: "missing_category",
      detail: "A01 fixture must document at least one known FAIL gap",
    });
  }

  const contractAlignment = validateVisionerPhaseGateAgainstContract(
    fixture,
    getActiveVisionerPhaseGateContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeVisionerPhaseGateMatrix(
  results: VisionerPhaseGateProbeResult[],
): VisionerPhaseGateProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as VisionerPhaseGateProbeSummary["byCategory"];
  for (const category of VISIONER_PHASE_GATE_CATEGORIES) {
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

export function listVisionerPhaseGateProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerPhaseGateBaseline,
): VisionerPhaseGateFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listVisionerPhaseGateKnownGaps(
  results: VisionerPhaseGateProbeResult[],
): VisionerPhaseGateProbeResult[] {
  return summarizeVisionerPhaseGateMatrix(results).knownGaps;
}
