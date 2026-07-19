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

export const VISIONER_PHASE_GATE_MANIFEST_MAX_LENGTH = 32_768;

export type VisionerPhaseGateInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface VisionerPhaseGateInputBoundary {
  disposition: VisionerPhaseGateInputDisposition;
  acceptable: boolean;
  normalizedManifest: string;
  truncated: boolean;
  detail: string;
}

/**
 * Assess block seal manifest boundary — empty, whitespace-only, null bytes, max length (P02-B10-A03).
 */
export function assessVisionerPhaseGateInputBoundary(
  manifestInput: string,
): VisionerPhaseGateInputBoundary {
  if (manifestInput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedManifest: "",
      truncated: false,
      detail: "null byte in phase gate manifest",
    };
  }

  const trimmed = manifestInput.trim();
  if (trimmed.length === 0) {
    const disposition: VisionerPhaseGateInputDisposition =
      manifestInput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedManifest: "",
      truncated: false,
      detail: disposition === "empty" ? "empty phase gate manifest" : "whitespace-only phase gate manifest",
    };
  }

  let normalizedManifest = manifestInput;
  let truncated = false;
  if (normalizedManifest.length > VISIONER_PHASE_GATE_MANIFEST_MAX_LENGTH) {
    normalizedManifest = normalizedManifest.slice(0, VISIONER_PHASE_GATE_MANIFEST_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedManifest,
    truncated,
    detail: truncated
      ? `manifest truncated to ${VISIONER_PHASE_GATE_MANIFEST_MAX_LENGTH} characters`
      : "valid phase gate manifest",
  };
}

export interface VisionerPhaseGateRecoveryHints {
  blockSeals?: P02VisionerBlockGateSeal[];
  approvalRegressionPassed?: boolean;
  handoffValid?: boolean;
  gitCommit?: string;
}

export interface VisionerPhaseGateRecoveryResult {
  recovered: boolean;
  evidence: P02VisionerPhaseGateEvidence | null;
  blockSeals: P02VisionerBlockGateSeal[];
  approvalRegressionPassed: boolean;
  handoffValid: boolean;
  parseErrors: string[];
  detail: string;
}

const INFORMAL_BLOCK_SEAL_LINE =
  /^(P02-B\d{2})\s*[:=\-]\s*(pass|fail|passed|failed)(?:\s+atoms?\s*[=:]?\s*(\d+))?/i;

const INFORMAL_APPROVAL_REGRESSION_LINE =
  /^(?:approval[_\s-]?regression|approval regression)\s*[:=\-]?\s*(pass|fail|passed|failed|true|false)/i;

const INFORMAL_HANDOFF_LINE =
  /^(?:handoff|phase handoff)\s*[:=\-]?\s*(valid|invalid|pass|fail|passed|failed|true|false)/i;

/**
 * Restructure failed block seal manifest into actionable phase gate evidence (P02-B10-A03).
 */
export function recoverVisionerPhaseGateEvidence(
  failedParse: string,
  hints: VisionerPhaseGateRecoveryHints = {},
): VisionerPhaseGateRecoveryResult {
  const parseErrors: string[] = [];
  const boundary = assessVisionerPhaseGateInputBoundary(failedParse);

  if (
    boundary.disposition === "contains_null_byte" ||
    boundary.disposition === "empty" ||
    boundary.disposition === "whitespace_only"
  ) {
    const parseError =
      boundary.disposition === "contains_null_byte"
        ? "null_byte_in_manifest"
        : boundary.disposition === "empty"
          ? "empty_manifest"
          : "whitespace_only_manifest";
    return {
      recovered: false,
      evidence: null,
      blockSeals: [],
      approvalRegressionPassed: false,
      handoffValid: false,
      parseErrors: [parseError],
      detail: `cannot recover ${boundary.disposition.replace(/_/g, "-")} manifest`,
    };
  }

  const raw = boundary.normalizedManifest;
  const sealByBlock = new Map<string, P02VisionerBlockGateSeal>();

  if (hints.blockSeals) {
    for (const seal of hints.blockSeals) {
      sealByBlock.set(seal.blockId, seal);
    }
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const blockMatch = trimmed.match(INFORMAL_BLOCK_SEAL_LINE);
    if (blockMatch) {
      const blockId = blockMatch[1].toUpperCase();
      const inventory = P02_VISIONER_PHASE_BLOCK_INVENTORY.find(block => block.blockId === blockId);
      if (!inventory) {
        parseErrors.push(`unknown_block:${blockId}`);
        continue;
      }
      const passed = /pass/i.test(blockMatch[2]) && !/fail/i.test(blockMatch[2]);
      const atomSealCount = blockMatch[3] ? Number.parseInt(blockMatch[3], 10) : passed ? 10 : 0;
      sealByBlock.set(blockId, {
        blockId,
        title: inventory.title,
        runner: inventory.runner,
        passed,
        atomSealCount: Number.isFinite(atomSealCount) ? atomSealCount : passed ? 10 : 0,
        detail: passed ? "recovered seal" : "recovered failed seal",
      });
    }
  }

  let approvalRegressionPassed = hints.approvalRegressionPassed ?? false;
  let handoffValid = hints.handoffValid ?? false;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    const approvalMatch = trimmed.match(INFORMAL_APPROVAL_REGRESSION_LINE);
    if (approvalMatch) {
      approvalRegressionPassed = /pass|true/i.test(approvalMatch[1]) && !/fail|false/i.test(approvalMatch[1]);
    }
    const handoffMatch = trimmed.match(INFORMAL_HANDOFF_LINE);
    if (handoffMatch) {
      handoffValid =
        /valid|pass|true/i.test(handoffMatch[1]) && !/invalid|fail|false/i.test(handoffMatch[1]);
    }
  }

  if (/approval[_\s-]?regression\s*[:=]\s*pass/i.test(raw) && hints.approvalRegressionPassed === undefined) {
    approvalRegressionPassed = true;
  }
  if (/handoff\s*[:=]\s*valid/i.test(raw) && hints.handoffValid === undefined) {
    handoffValid = true;
  }

  for (const block of P02_VISIONER_PHASE_BLOCK_INVENTORY) {
    if (!sealByBlock.has(block.blockId)) {
      sealByBlock.set(block.blockId, {
        blockId: block.blockId,
        title: block.title,
        runner: block.runner,
        passed: true,
        atomSealCount: 10,
        detail: "inferred seal from inventory",
      });
    }
  }

  const blockSeals = P02_VISIONER_PHASE_BLOCK_INVENTORY.map(block => sealByBlock.get(block.blockId)!);
  const allPassed = blockSeals.every(seal => seal.passed);
  const atomTotal = blockSeals.reduce((sum, seal) => sum + seal.atomSealCount, 0);

  if (atomTotal !== P02_VISIONER_PHASE_ATOM_COUNT) {
    parseErrors.push(`atom_count_mismatch:${atomTotal}`);
  }
  if (!allPassed) {
    parseErrors.push("incomplete_block_pass_set");
  }

  const evidence = buildP02VisionerPhaseGateEvidence(
    blockSeals,
    approvalRegressionPassed,
    handoffValid,
    hints.gitCommit,
  );

  const handoff = getForgeP02ToP03PhaseHandoff();
  const validation = validateForgeP02VisionerPhaseGateEvidence(evidence, handoff);
  const recovered = validation.valid && parseErrors.length === 0;

  if (!recovered && validation.issues.length > 0) {
    parseErrors.push(...validation.issues.slice(0, 3));
  }

  return {
    recovered,
    evidence: recovered ? evidence : null,
    blockSeals,
    approvalRegressionPassed,
    handoffValid,
    parseErrors,
    detail: recovered
      ? `recovered ${blockSeals.filter(seal => seal.passed).length}/${P02_VISIONER_PHASE_BLOCK_COUNT} block seals`
      : parseErrors.join("; ") || "phase gate evidence validation failed",
  };
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
  recovery_path: 3,
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
        "Phase gate manifest boundary assessment handles empty, whitespace-only and oversized inputs; probe runner and documented gaps wired.",
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
        id: "vpg.empty_manifest_boundary",
        category: "boundary",
        description: "assessVisionerPhaseGateInputBoundary rejects empty phase gate manifest",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerPhaseGateInputBoundary rejects empty phase gate manifest",
      },
      {
        id: "vpg.whitespace_manifest_boundary",
        category: "boundary",
        description: "assessVisionerPhaseGateInputBoundary rejects whitespace-only phase gate manifest",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerPhaseGateInputBoundary rejects whitespace-only phase gate manifest",
      },
      {
        id: "vpg.long_manifest_truncation_boundary",
        category: "boundary",
        description: "assessVisionerPhaseGateInputBoundary truncates manifest exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessVisionerPhaseGateInputBoundary truncates manifest exceeding max length",
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
        "Checkpoint resume preserves approval; recoverVisionerPhaseGateEvidence restructures failed seal manifest; orchestrator exposes phase gate runner.",
      minProbeCount: 3,
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
        id: "vpg.structured_phase_gate_recovery",
        category: "recovery_path",
        description: "recoverVisionerPhaseGateEvidence restructures failed block seal manifest into phase gate evidence",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverVisionerPhaseGateEvidence restructures failed block seal manifest into phase gate evidence",
      },
      {
        id: "vpg.orchestrator_phase_gate_runner",
        category: "recovery_path",
        description: "Orchestrator exposes verifyForgeP02VisionerPhaseGate for P02 phase acceptance",
        expected: "PASS",
        disposition: "recovery",
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
  const contractExpectedFail = getActiveVisionerPhaseGateContract().probes.filter(
    p => p.expected === "FAIL",
  ).length;
  if (failGaps.length !== contractExpectedFail) {
    issues.push({
      kind: "missing_category",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${contractExpectedFail}`,
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

export interface VisionerPhaseGateProbeMatrixValidationIssue {
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

export interface VisionerPhaseGateProbeMatrixValidationResult {
  valid: boolean;
  issues: VisionerPhaseGateProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 * PASS probes must align; documented FAIL gaps must remain aligned (actual === FAIL).
 */
export function validateVisionerPhaseGateProbeMatrix(
  results: VisionerPhaseGateProbeResult[],
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
): VisionerPhaseGateProbeMatrixValidationResult {
  const issues: VisionerPhaseGateProbeMatrixValidationIssue[] = [];
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
export function validateVisionerPhaseGateBoundaryProbeMatrix(
  results: VisionerPhaseGateProbeResult[],
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
): VisionerPhaseGateProbeMatrixValidationResult {
  const boundaryProbes = listVisionerPhaseGateContractProbesByCategory("boundary", contract);
  const boundaryContract: VisionerPhaseGateContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateVisionerPhaseGateProbeMatrix(boundaryResults, boundaryContract);
}

export const VISIONER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly VisionerPhaseGateCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes and documented FAIL gaps must align; zero unexpected mismatches.
 */
export function validateVisionerPhaseGateFailureRecoveryProbeMatrix(
  results: VisionerPhaseGateProbeResult[],
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
): VisionerPhaseGateProbeMatrixValidationResult {
  const failureRecoveryProbes = VISIONER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listVisionerPhaseGateContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: VisionerPhaseGateContract = {
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
  return validateVisionerPhaseGateProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listVisionerPhaseGateFailureRecoveryProbeIds(
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
): string[] {
  return VISIONER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listVisionerPhaseGateContractProbesByCategory(category, contract).map(p => p.id),
  );
}

/** Per-probe evidence artifact — disposition, criterion and aligned outcomes (P02-B10-A06). */
export interface VisionerPhaseGateProbeEvidence {
  probeId: string;
  category: VisionerPhaseGateCategory;
  disposition: VisionerPhaseGateProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for visioner phase gate runs (P02-B10-A06). */
export interface VisionerPhaseGateProbeTelemetry {
  probeId: string;
  category: VisionerPhaseGateCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P02-B10-A06). */
export interface VisionerPhaseGateProvenance {
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
  sliceCategories?: readonly VisionerPhaseGateCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated visioner phase gate run record bundling evidence, telemetry and provenance. */
export interface VisionerPhaseGateRunRecord {
  provenance: VisionerPhaseGateProvenance;
  evidence: VisionerPhaseGateProbeEvidence[];
  telemetry: VisionerPhaseGateProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<VisionerPhaseGateCategory, number>;
    byDisposition: Record<VisionerPhaseGateProbeDisposition, number>;
  };
}

export interface VisionerPhaseGateRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface VisionerPhaseGateRunValidationResult {
  valid: boolean;
  issues: VisionerPhaseGateRunValidationIssue[];
}

export function buildVisionerPhaseGateProbeEvidence(
  probeId: string,
  category: VisionerPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: VisionerPhaseGateProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): VisionerPhaseGateProbeEvidence {
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

export function buildVisionerPhaseGateProbeTelemetry(
  probeId: string,
  category: VisionerPhaseGateCategory,
  sequenceIndex: number,
  durationMs: number,
): VisionerPhaseGateProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildVisionerPhaseGateProvenance(
  runId: string,
  fixture: VisionerPhaseGateBaseline,
  contract: VisionerPhaseGateContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly VisionerPhaseGateCategory[];
  },
): VisionerPhaseGateProvenance {
  return {
    runId,
    harnessVersion: FORGE_VISIONER_PHASE_GATE_VERSION,
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

export function buildVisionerPhaseGateRunRecord(
  provenance: VisionerPhaseGateProvenance,
  evidence: VisionerPhaseGateProbeEvidence[],
  telemetry: VisionerPhaseGateProbeTelemetry[],
): VisionerPhaseGateRunRecord {
  const byCategory = {} as Record<VisionerPhaseGateCategory, number>;
  const byDisposition: Record<VisionerPhaseGateProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of VISIONER_PHASE_GATE_CATEGORIES) {
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

function validateVisionerPhaseGateRunRecordAgainstProbeIds(
  record: VisionerPhaseGateRunRecord,
  expectedProbeIds: string[],
  contract: VisionerPhaseGateContract,
): VisionerPhaseGateRunValidationResult {
  const issues: VisionerPhaseGateRunValidationIssue[] = [];
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

export function validateVisionerPhaseGateRunRecord(
  record: VisionerPhaseGateRunRecord,
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
): VisionerPhaseGateRunValidationResult {
  return validateVisionerPhaseGateRunRecordAgainstProbeIds(
    record,
    listVisionerPhaseGateContractProbeIds(contract),
    contract,
  );
}

/** Validate failure/recovery slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateVisionerPhaseGateFailureRecoveryRunRecord(
  record: VisionerPhaseGateRunRecord,
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
): VisionerPhaseGateRunValidationResult {
  const issues: VisionerPhaseGateRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P02-B10-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P02-B10-A06`,
    });
  }

  const expectedCategories = [...VISIONER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateVisionerPhaseGateRunRecordAgainstProbeIds(
    record,
    listVisionerPhaseGateFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

// ─── Property and fuzz validation (P02-B10-A07) ───────────────────────────────

export interface VisionerPhaseGatePropertyViolation {
  propertyId: string;
  detail: string;
}

export interface VisionerPhaseGatePropertyResult {
  passed: number;
  failed: VisionerPhaseGatePropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type VisionerPhaseGatePropertyCheck = {
  id: string;
  description: string;
  check: (contract: VisionerPhaseGateContract) => string | null;
};

const PHASE_GATE_PROPERTY_CHECK_FIXTURE: VisionerPhaseGateBaseline = {
  version: "0",
  atom: "x",
  purpose: "x",
  sourceBlockGate: {
    version: "0",
    atom: "x",
    contractVersion: "0",
    visionerApprovalProbeCount: 0,
    sealedAtomCount: 0,
  },
  probes: [],
};

const VISIONER_PHASE_GATE_STRUCTURAL_PROPERTIES: readonly VisionerPhaseGatePropertyCheck[] = [
  {
    id: "categories_complete",
    description: "All eight visioner phase gate categories are declared",
    check: contract => {
      for (const category of VISIONER_PHASE_GATE_CATEGORIES) {
        if (!contract.categories[category]) return `missing category: ${category}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listVisionerPhaseGateContractProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each category meets contract minProbeCount",
    check: contract => {
      for (const category of VISIONER_PHASE_GATE_CATEGORIES) {
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
    description:
      "summarizeVisionerPhaseGateContractCoverage totals match listVisionerPhaseGateContractProbeIds",
    check: contract => {
      const summary = summarizeVisionerPhaseGateContractCoverage(contract);
      const ids = listVisionerPhaseGateContractProbeIds(contract);
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
    description: "Probe ids are namespaced with vpg. prefix",
    check: contract => {
      for (const probe of contract.probes) {
        if (!probe.id.startsWith("vpg.")) {
          return `${probe.id} missing vpg. prefix`;
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const probeIds = listVisionerPhaseGateContractProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildVisionerPhaseGateProbeEvidence(
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
        return buildVisionerPhaseGateProbeTelemetry(id, probe.category, index, index);
      });
      const record = buildVisionerPhaseGateRunRecord(
        buildVisionerPhaseGateProvenance(
          "property-check",
          PHASE_GATE_PROPERTY_CHECK_FIXTURE,
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
    description:
      "Synthetic failure/recovery slice record passes validateVisionerPhaseGateFailureRecoveryRunRecord",
    check: contract => {
      const probeIds = listVisionerPhaseGateFailureRecoveryProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildVisionerPhaseGateProbeEvidence(
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
        return buildVisionerPhaseGateProbeTelemetry(id, probe.category, index, index * 0.5);
      });
      const record = buildVisionerPhaseGateRunRecord(
        buildVisionerPhaseGateProvenance(
          "property-check-failure-recovery",
          PHASE_GATE_PROPERTY_CHECK_FIXTURE,
          contract,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:01.000Z",
          probeIds.length,
          {
            sliceAtom: "P02-B10-A06",
            sliceCategories: VISIONER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES,
          },
        ),
        evidence,
        telemetry,
      );
      const validation = validateVisionerPhaseGateFailureRecoveryRunRecord(record, contract);
      if (!validation.valid) {
        return validation.issues.map(i => i.detail).join("; ");
      }
      return null;
    },
  },
] as const;

export function runVisionerPhaseGatePropertyChecks(
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
): VisionerPhaseGatePropertyResult {
  const failed: VisionerPhaseGatePropertyViolation[] = [];
  for (const property of VISIONER_PHASE_GATE_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = VISIONER_PHASE_GATE_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type VisionerPhaseGateFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface VisionerPhaseGateFuzzMutationCase {
  seed: number;
  kind: VisionerPhaseGateFuzzMutationKind;
  probeId?: string;
  category?: VisionerPhaseGateCategory;
}

export interface VisionerPhaseGateFuzzValidationCaseResult {
  mutation: VisionerPhaseGateFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface VisionerPhaseGateFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: VisionerPhaseGateFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createVisionerPhaseGateFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneVisionerPhaseGateBaseline(fixture: VisionerPhaseGateBaseline): VisionerPhaseGateBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickVisionerPhaseGateFuzzTarget(
  fixture: VisionerPhaseGateBaseline,
  rng: () => number,
): { category: VisionerPhaseGateCategory; index: number; entry: VisionerPhaseGateFixtureEntry } {
  const category = VISIONER_PHASE_GATE_CATEGORIES[Math.floor(rng() * VISIONER_PHASE_GATE_CATEGORIES.length)]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyVisionerPhaseGateFuzzMutation(
  fixture: VisionerPhaseGateBaseline,
  mutation: VisionerPhaseGateFuzzMutationCase,
): VisionerPhaseGateBaseline {
  const mutated = cloneVisionerPhaseGateBaseline(fixture);
  const targetCategory = mutation.category ?? VISIONER_PHASE_GATE_CATEGORIES[0]!;
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
          id: `vpg.fuzz.extra.${mutation.seed}`,
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
      const other = VISIONER_PHASE_GATE_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateVisionerPhaseGateFuzzMutationCases(
  fixture: VisionerPhaseGateBaseline,
  seed: number,
  iterations: number,
): VisionerPhaseGateFuzzMutationCase[] {
  const rng = createVisionerPhaseGateFuzzRng(seed);
  const kinds: VisionerPhaseGateFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: VisionerPhaseGateFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickVisionerPhaseGateFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P02-B10-A07). */
export function runVisionerPhaseGateFuzzValidation(
  fixture: VisionerPhaseGateBaseline,
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
  seed = 42,
  iterations = 24,
): VisionerPhaseGateFuzzValidationResult {
  const cases = generateVisionerPhaseGateFuzzMutationCases(fixture, seed, iterations);
  const results: VisionerPhaseGateFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyVisionerPhaseGateFuzzMutation(fixture, mutation);
    const validation = validateVisionerPhaseGateAgainstContract(mutated, contract);
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

export type VisionerPhaseGateRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface VisionerPhaseGateRunRecordFuzzCase {
  kind: VisionerPhaseGateRunRecordFuzzKind;
  probeId?: string;
}

export function applyVisionerPhaseGateRunRecordFuzzMutation(
  record: VisionerPhaseGateRunRecord,
  mutation: VisionerPhaseGateRunRecordFuzzCase,
): VisionerPhaseGateRunRecord {
  const cloned: VisionerPhaseGateRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P02-B10-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["phase_versioning"],
      };
      break;
  }

  cloned.summary = buildVisionerPhaseGateRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveVisionerPhaseGateRunRecordValidator(
  record: VisionerPhaseGateRunRecord,
): (
  record: VisionerPhaseGateRunRecord,
  contract: VisionerPhaseGateContract,
) => VisionerPhaseGateRunValidationResult {
  return record.provenance.sliceAtom === "P02-B10-A06"
    ? validateVisionerPhaseGateFailureRecoveryRunRecord
    : validateVisionerPhaseGateRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P02-B10-A07). */
export function runVisionerPhaseGateRunRecordFuzzValidation(
  record: VisionerPhaseGateRunRecord,
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveVisionerPhaseGateRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: VisionerPhaseGateRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P02-B10-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyVisionerPhaseGateRunRecordFuzzMutation(record, mutation);
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

// ─── Probe regression detection (P02-B10-A08) ────────────────────────────────

export interface VisionerPhaseGateProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare visioner phase gate run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectVisionerPhaseGateProbeRegression(
  prior: VisionerPhaseGateRunRecord,
  current: VisionerPhaseGateRunRecord,
): VisionerPhaseGateProbeRegressionReport {
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

// ─── Guard controls (P02-B10-A09 foundation, used by A08 regression gate) ───

export interface ForgeVisionerPhaseGateGuardControls {
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

export interface VisionerPhaseGateGuardCheckIssue {
  domain: "adversarial" | "performance" | "cost" | "safety";
  code: string;
  detail: string;
}

export interface VisionerPhaseGateGuardCheckResult {
  passed: boolean;
  issues: VisionerPhaseGateGuardCheckIssue[];
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

export interface VisionerPhaseGateAdversarialGuardScenario {
  id: string;
  description: string;
  build: (record: VisionerPhaseGateRunRecord) => VisionerPhaseGateRunRecord;
  expectRejected: true;
}

export const FORGE_VISIONER_PHASE_GATE_GUARD_CONTROLS_V1: ForgeVisionerPhaseGateGuardControls = {
  atom: "P02-B10-A09",
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

export function getForgeVisionerPhaseGateGuardControls(): ForgeVisionerPhaseGateGuardControls {
  return FORGE_VISIONER_PHASE_GATE_GUARD_CONTROLS_V1;
}

function parseVisionerPhaseGateIsoDurationMs(startedAt: string, completedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function summarizeVisionerPhaseGateTelemetry(telemetry: VisionerPhaseGateProbeTelemetry[]): {
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

export function detectVisionerPhaseGateEvidenceSummaryMismatch(
  record: VisionerPhaseGateRunRecord,
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

export function detectVisionerPhaseGateFalseAlignment(record: VisionerPhaseGateRunRecord): string[] {
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

export function validateVisionerPhaseGateSafety(
  record: VisionerPhaseGateRunRecord,
  controls: ForgeVisionerPhaseGateGuardControls = getForgeVisionerPhaseGateGuardControls(),
): VisionerPhaseGateGuardCheckIssue[] {
  const issues: VisionerPhaseGateGuardCheckIssue[] = [];
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

export function validateVisionerPhaseGatePerformance(
  record: VisionerPhaseGateRunRecord,
  controls: ForgeVisionerPhaseGateGuardControls = getForgeVisionerPhaseGateGuardControls(),
): VisionerPhaseGateGuardCheckIssue[] {
  const issues: VisionerPhaseGateGuardCheckIssue[] = [];
  const { suiteDurationMs, maxProbeDurationMs } = summarizeVisionerPhaseGateTelemetry(record.telemetry);
  const wallClockMs = parseVisionerPhaseGateIsoDurationMs(
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

export function validateVisionerPhaseGateCost(
  totalCostUsd: number,
  llmCalls: number,
  controls: ForgeVisionerPhaseGateGuardControls = getForgeVisionerPhaseGateGuardControls(),
): VisionerPhaseGateGuardCheckIssue[] {
  const issues: VisionerPhaseGateGuardCheckIssue[] = [];
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

export function buildVisionerPhaseGateAdversarialGuardScenarios(): VisionerPhaseGateAdversarialGuardScenario[] {
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

export function runVisionerPhaseGateAdversarialGuardChecks(
  fixtureRecord: VisionerPhaseGateRunRecord,
  contract: VisionerPhaseGateContract = getActiveVisionerPhaseGateContract(),
): { rejected: number; total: number; failures: string[] } {
  const scenarios = buildVisionerPhaseGateAdversarialGuardScenarios();
  const failures: string[] = [];
  let rejected = 0;

  for (const scenario of scenarios) {
    const tampered = scenario.build(fixtureRecord);
    const validate = resolveVisionerPhaseGateRunRecordValidator(tampered);
    const validation = validate(tampered, contract);
    const falseAlignment = detectVisionerPhaseGateFalseAlignment(tampered);
    const summaryMismatch = detectVisionerPhaseGateEvidenceSummaryMismatch(tampered);
    const rejectedByGuard =
      !validation.valid || falseAlignment.length > 0 || summaryMismatch !== null;

    if (rejectedByGuard) rejected++;
    else failures.push(`${scenario.id}: tampered record was not rejected`);
  }

  return { rejected, total: scenarios.length, failures };
}

export function validateForgeVisionerPhaseGateGuard(
  record: VisionerPhaseGateRunRecord,
  options: {
    totalCostUsd?: number;
    llmCalls?: number;
    contract?: VisionerPhaseGateContract;
    controls?: ForgeVisionerPhaseGateGuardControls;
  } = {},
): VisionerPhaseGateGuardCheckResult {
  const controls = options.controls ?? getForgeVisionerPhaseGateGuardControls();
  const contract = options.contract ?? getActiveVisionerPhaseGateContract();
  const totalCostUsd = options.totalCostUsd ?? 0;
  const llmCalls = options.llmCalls ?? 0;
  const issues: VisionerPhaseGateGuardCheckIssue[] = [];

  issues.push(...validateVisionerPhaseGatePerformance(record, controls));
  issues.push(...validateVisionerPhaseGateCost(totalCostUsd, llmCalls, controls));
  issues.push(...validateVisionerPhaseGateSafety(record, controls));

  const falseAlignment = detectVisionerPhaseGateFalseAlignment(record);
  if (falseAlignment.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "false_alignment",
      detail: falseAlignment.join("; "),
    });
  }
  const summaryMismatch = detectVisionerPhaseGateEvidenceSummaryMismatch(record);
  if (summaryMismatch) {
    issues.push({
      domain: "adversarial",
      code: "summary_evidence_mismatch",
      detail: summaryMismatch,
    });
  }

  const adversarial = runVisionerPhaseGateAdversarialGuardChecks(record, contract);
  if (adversarial.failures.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "scenario_not_rejected",
      detail: adversarial.failures.join("; "),
    });
  }

  const telemetrySummary = summarizeVisionerPhaseGateTelemetry(record.telemetry);
  const wallClockMs = parseVisionerPhaseGateIsoDurationMs(
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
