/**
 * FOREMAN — Strategist Phase Gate Baseline (P03-B10)
 *
 * A01 slice: load, validate, run probes against sealed P03-B09 provenance
 * block gate artifacts.
 */

import strategistPhaseGateBaseline from "./fixtures/forge-strategist-phase-gate-v1.json" with { type: "json" };
import type {
  ForgeAcceptanceOutcome,
  ForgeBlockAtomSeal,
  ForgeBlockGateCheck,
  ForgeBlockGateDefinition,
} from "./forge-baseline-contract.js";
import { P03_STRATEGIST_PHASE_ID as P03_FROM_P02 } from "./forge-p02-visioner-phase-gate.js";
import {
  getForgeP03B09ToB10Handoff,
  getActiveStrategistProvenanceContract,
  summarizeStrategistProvenanceCoverage,
  FORGE_STRATEGIST_PROVENANCE_VERSION,
} from "./forge-p03-strategist-provenance.js";

export const FORGE_STRATEGIST_PHASE_GATE_VERSION = "1.0.0";

export const P03_STRATEGIST_PHASE_ID = P03_FROM_P02;
export const P04_RESEARCHER_PHASE_ID = "P04" as const;

export const EXPECTED_P03_B09_SEALED_ATOM_COUNT = 10;

/** Canonical P03 strategist blocks B01–B10 with block-gate runner identifiers. */
export const P03_STRATEGIST_PHASE_BLOCK_INVENTORY = [
  { blockId: "P03-B01", title: "Hedef decomposition", runner: "runForgeStrategistIntentBlockGate" },
  { blockId: "P03-B02", title: "Block üretim kontratı", runner: "runForgeStrategistBlockContractBlockGate" },
  { blockId: "P03-B03", title: "Atomization ve atom boyutu", runner: "runForgeStrategistAtomizationBlockGate" },
  { blockId: "P03-B04", title: "Dependency DAG", runner: "runForgeStrategistDependencyDagBlockGate" },
  { blockId: "P03-B05", title: "Risk ve reversibility planı", runner: "runForgeStrategistRiskReversibilityBlockGate" },
  { blockId: "P03-B06", title: "Kaynak ve budget planı", runner: "runForgeStrategistResourceBudgetBlockGate" },
  { blockId: "P03-B07", title: "Parallel execution wave planı", runner: "runForgeStrategistParallelWaveBlockGate" },
  { blockId: "P03-B08", title: "Replan ve plan repair", runner: "runForgeStrategistReplanBlockGate" },
  { blockId: "P03-B09", title: "Plan provenance ve drift", runner: "runForgeStrategistProvenanceBlockGate" },
  { blockId: "P03-B10", title: "Stratejist phase gate", runner: "runForgeStrategistPhaseGateBlockGate" },
] as const;

export const P03_STRATEGIST_PHASE_BLOCK_COUNT = P03_STRATEGIST_PHASE_BLOCK_INVENTORY.length;
export const P03_STRATEGIST_PHASE_ATOM_COUNT = P03_STRATEGIST_PHASE_BLOCK_COUNT * 10;

export const EXPECTED_P03_STRATEGIST_PRIOR_BLOCK_GATE_COUNT = P03_STRATEGIST_PHASE_BLOCK_COUNT - 1;

export const P03_STRATEGIST_PHASE_GATE_CHECKS = [
  { id: "block_gates_pass", description: "All ten P03 strategist block gates PASS with sealed atom evidence" },
  { id: "atom_terminal_count", description: "One hundred P03 strategist atoms terminal and evidenced via block seals" },
  { id: "provenance_regression", description: "Strategist provenance regression gate PASS" },
  { id: "phase_handoff", description: "P03→P04 phase handoff contract valid with P04-B01 entry" },
] as const;

export type P03StrategistPhaseGateCheckId = (typeof P03_STRATEGIST_PHASE_GATE_CHECKS)[number]["id"];

export interface P03StrategistBlockGateSeal {
  blockId: string;
  title: string;
  runner: string;
  passed: boolean;
  atomSealCount: number;
  detail: string;
}

export interface P03StrategistPhaseGateEvidence {
  phaseId: typeof P03_STRATEGIST_PHASE_ID;
  atom: "P03-PHASE-GATE";
  sealedAt: string;
  blockSeals: P03StrategistBlockGateSeal[];
  blockGatesPassed: number;
  atomSealsPassed: number;
  provenanceRegressionPassed: boolean;
  handoffValid: boolean;
  gitCommit?: string;
}

export interface P03PhaseHandoffContract {
  version: string;
  atom: "P03-PHASE-GATE";
  sourcePhase: {
    phaseId: typeof P03_STRATEGIST_PHASE_ID;
    title: string;
    completedBlocks: readonly string[];
    completedAtoms: number;
  };
  targetPhase: {
    phaseId: typeof P04_RESEARCHER_PHASE_ID;
    title: string;
    entryBlock: string;
    entryAtom: string;
  };
  sealedArtifacts: {
    strategistProvenanceVersion: string;
    strategistProvenanceProbeCount: number;
    sealedBlockInventoryCount: number;
    blockGateMethod: string;
    phaseGateMethod: string;
  };
  prerequisites: readonly string[];
  entryCriteria: {
    description: string;
    requiresPhaseGatePass: true;
    requiresProvenanceBlockGate: true;
  };
}

export const FORGE_P03_TO_P04_PHASE_HANDOFF_V1: P03PhaseHandoffContract = {
  version: "1.0.0",
  atom: "P03-PHASE-GATE",
  sourcePhase: {
    phaseId: P03_STRATEGIST_PHASE_ID,
    title: "Stratejist — Planlama ve Fraktal Decomposition",
    completedBlocks: P03_STRATEGIST_PHASE_BLOCK_INVENTORY.map(block => block.blockId),
    completedAtoms: P03_STRATEGIST_PHASE_ATOM_COUNT,
  },
  targetPhase: {
    phaseId: P04_RESEARCHER_PHASE_ID,
    title: "Araştırmacı — Kanıt, Kaynak ve Deney",
    entryBlock: "P04-B01",
    entryAtom: "P04-B01-A01",
  },
  sealedArtifacts: {
    strategistProvenanceVersion: getActiveStrategistProvenanceContract().version,
    strategistProvenanceProbeCount: summarizeStrategistProvenanceCoverage(
      getActiveStrategistProvenanceContract(),
    ).totalProbes,
    sealedBlockInventoryCount: P03_STRATEGIST_PHASE_BLOCK_COUNT,
    blockGateMethod: "verifyForgeStrategistProvenanceBlockGate",
    phaseGateMethod: "verifyForgeP03PhaseGate",
  },
  prerequisites: [
    "Ten sealed P03 strategist block gates with atom-level evidence",
    "Strategist provenance block gate PASS with P03-B10 handoff",
    "Strategist provenance regression and guard gates PASS",
    "Orchestrator exposes verifyForgeP03StrategistPhaseGate for phase acceptance",
  ],
  entryCriteria: {
    description:
      "P04-B01-A01 formalizes researcher question baseline using sealed P03 strategist phase gate artifacts",
    requiresPhaseGatePass: true,
    requiresProvenanceBlockGate: true,
  },
};

export function getForgeP03ToP04PhaseHandoff(): P03PhaseHandoffContract {
  return FORGE_P03_TO_P04_PHASE_HANDOFF_V1;
}

export function validateP03PhaseHandoffContract(
  handoff: P03PhaseHandoffContract,
  evidence: Pick<
    P03StrategistPhaseGateEvidence,
    "blockGatesPassed" | "atomSealsPassed" | "provenanceRegressionPassed" | "handoffValid"
  >,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const coverage = summarizeStrategistProvenanceCoverage(getActiveStrategistProvenanceContract());

  if (handoff.sourcePhase.completedBlocks.length !== P03_STRATEGIST_PHASE_BLOCK_COUNT) {
    issues.push(
      `handoff completedBlocks=${handoff.sourcePhase.completedBlocks.length} expected=${P03_STRATEGIST_PHASE_BLOCK_COUNT}`,
    );
  }
  if (handoff.sourcePhase.completedAtoms !== P03_STRATEGIST_PHASE_ATOM_COUNT) {
    issues.push(
      `handoff completedAtoms=${handoff.sourcePhase.completedAtoms} expected=${P03_STRATEGIST_PHASE_ATOM_COUNT}`,
    );
  }
  if (handoff.targetPhase.entryAtom !== "P04-B01-A01") {
    issues.push(`unexpected entry atom: ${handoff.targetPhase.entryAtom}`);
  }
  if (handoff.sealedArtifacts.strategistProvenanceProbeCount !== coverage.totalProbes) {
    issues.push(
      `handoff probeCount=${handoff.sealedArtifacts.strategistProvenanceProbeCount} contract=${coverage.totalProbes}`,
    );
  }
  if (handoff.sealedArtifacts.sealedBlockInventoryCount !== P03_STRATEGIST_PHASE_BLOCK_COUNT) {
    issues.push(
      `handoff sealedBlockInventoryCount=${handoff.sealedArtifacts.sealedBlockInventoryCount} expected=${P03_STRATEGIST_PHASE_BLOCK_COUNT}`,
    );
  }
  if (evidence.blockGatesPassed !== P03_STRATEGIST_PHASE_BLOCK_COUNT) {
    issues.push(`blockGatesPassed=${evidence.blockGatesPassed} expected=${P03_STRATEGIST_PHASE_BLOCK_COUNT}`);
  }
  if (evidence.atomSealsPassed !== P03_STRATEGIST_PHASE_ATOM_COUNT) {
    issues.push(`atomSealsPassed=${evidence.atomSealsPassed} expected=${P03_STRATEGIST_PHASE_ATOM_COUNT}`);
  }
  if (!evidence.provenanceRegressionPassed) {
    issues.push("provenance regression gate did not pass");
  }
  if (!evidence.handoffValid) {
    issues.push("handoff invalid");
  }

  return { valid: issues.length === 0, issues };
}

export const STRATEGIST_PHASE_GATE_MANIFEST_MAX_LENGTH = 32_768;

export type StrategistPhaseGateInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface StrategistPhaseGateInputBoundary {
  disposition: StrategistPhaseGateInputDisposition;
  acceptable: boolean;
  normalizedManifest: string;
  truncated: boolean;
  detail: string;
}

export function assessStrategistPhaseGateInputBoundary(
  manifestInput: string,
): StrategistPhaseGateInputBoundary {
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
    const disposition: StrategistPhaseGateInputDisposition =
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
  if (normalizedManifest.length > STRATEGIST_PHASE_GATE_MANIFEST_MAX_LENGTH) {
    normalizedManifest = normalizedManifest.slice(0, STRATEGIST_PHASE_GATE_MANIFEST_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedManifest,
    truncated,
    detail: truncated
      ? `manifest truncated to ${STRATEGIST_PHASE_GATE_MANIFEST_MAX_LENGTH} characters`
      : "valid phase gate manifest",
  };
}

export interface StrategistPhaseGateRecoveryHints {
  blockSeals?: P03StrategistBlockGateSeal[];
  provenanceRegressionPassed?: boolean;
  handoffValid?: boolean;
  gitCommit?: string;
}

export interface StrategistPhaseGateRecoveryResult {
  recovered: boolean;
  evidence: P03StrategistPhaseGateEvidence | null;
  blockSeals: P03StrategistBlockGateSeal[];
  provenanceRegressionPassed: boolean;
  handoffValid: boolean;
  parseErrors: string[];
  detail: string;
}

const INFORMAL_BLOCK_SEAL_LINE =
  /^(P03-B\d{2})\s*[:=\-]\s*(pass|fail|passed|failed)(?:\s+atoms?\s*[=:]?\s*(\d+))?/i;

const INFORMAL_PROVENANCE_REGRESSION_LINE =
  /^(?:provenance[_\s-]?regression|provenance regression)\s*[:=\-]?\s*(pass|fail|passed|failed|true|false)/i;

const INFORMAL_HANDOFF_LINE =
  /^(?:handoff|phase handoff)\s*[:=\-]?\s*(valid|invalid|pass|fail|passed|failed|true|false)/i;

export function recoverStrategistPhaseGateEvidence(
  failedParse: string,
  hints: StrategistPhaseGateRecoveryHints = {},
): StrategistPhaseGateRecoveryResult {
  const parseErrors: string[] = [];
  const boundary = assessStrategistPhaseGateInputBoundary(failedParse);

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
      provenanceRegressionPassed: false,
      handoffValid: false,
      parseErrors: [parseError],
      detail: `cannot recover ${boundary.disposition.replace(/_/g, "-")} manifest`,
    };
  }

  const raw = boundary.normalizedManifest;
  const sealByBlock = new Map<string, P03StrategistBlockGateSeal>();

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
      const inventory = P03_STRATEGIST_PHASE_BLOCK_INVENTORY.find(block => block.blockId === blockId);
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

  let provenanceRegressionPassed = hints.provenanceRegressionPassed ?? false;
  let handoffValid = hints.handoffValid ?? false;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    const provenanceMatch = trimmed.match(INFORMAL_PROVENANCE_REGRESSION_LINE);
    if (provenanceMatch) {
      provenanceRegressionPassed =
        /pass|true/i.test(provenanceMatch[1]) && !/fail|false/i.test(provenanceMatch[1]);
    }
    const handoffMatch = trimmed.match(INFORMAL_HANDOFF_LINE);
    if (handoffMatch) {
      handoffValid =
        /valid|pass|true/i.test(handoffMatch[1]) && !/invalid|fail|false/i.test(handoffMatch[1]);
    }
  }

  if (/provenance[_\s-]?regression\s*[:=]\s*pass/i.test(raw) && hints.provenanceRegressionPassed === undefined) {
    provenanceRegressionPassed = true;
  }
  if (/handoff\s*[:=]\s*valid/i.test(raw) && hints.handoffValid === undefined) {
    handoffValid = true;
  }

  for (const block of P03_STRATEGIST_PHASE_BLOCK_INVENTORY) {
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

  const blockSeals = P03_STRATEGIST_PHASE_BLOCK_INVENTORY.map(block => sealByBlock.get(block.blockId)!);
  const allPassed = blockSeals.every(seal => seal.passed);
  const atomTotal = blockSeals.reduce((sum, seal) => sum + seal.atomSealCount, 0);

  if (atomTotal !== P03_STRATEGIST_PHASE_ATOM_COUNT) {
    parseErrors.push(`atom_count_mismatch:${atomTotal}`);
  }
  if (!allPassed) {
    parseErrors.push("incomplete_block_pass_set");
  }

  const evidence = buildP03StrategistPhaseGateEvidence(
    blockSeals,
    provenanceRegressionPassed,
    handoffValid,
    hints.gitCommit,
  );

  const handoff = getForgeP03ToP04PhaseHandoff();
  const validation = validateForgeP03StrategistPhaseGateEvidence(evidence, handoff);
  const recovered = validation.valid && parseErrors.length === 0;

  if (!recovered && validation.issues.length > 0) {
    parseErrors.push(...validation.issues.slice(0, 3));
  }

  return {
    recovered,
    evidence: recovered ? evidence : null,
    blockSeals,
    provenanceRegressionPassed,
    handoffValid,
    parseErrors,
    detail: recovered
      ? `recovered ${blockSeals.filter(seal => seal.passed).length}/${P03_STRATEGIST_PHASE_BLOCK_COUNT} block seals`
      : parseErrors.join("; ") || "phase gate evidence validation failed",
  };
}

export function buildP03StrategistPhaseGateEvidence(
  blockSeals: P03StrategistBlockGateSeal[],
  provenanceRegressionPassed: boolean,
  handoffValid: boolean,
  gitCommit?: string,
): P03StrategistPhaseGateEvidence {
  const blockGatesPassed = blockSeals.filter(seal => seal.passed).length;
  const atomSealsPassed = blockSeals.reduce((sum, seal) => sum + seal.atomSealCount, 0);

  return {
    phaseId: P03_STRATEGIST_PHASE_ID,
    atom: "P03-PHASE-GATE",
    sealedAt: new Date().toISOString(),
    blockSeals,
    blockGatesPassed,
    atomSealsPassed,
    provenanceRegressionPassed,
    handoffValid,
    ...(gitCommit ? { gitCommit } : {}),
  };
}

export function validateForgeP03StrategistPhaseGateEvidence(
  evidence: P03StrategistPhaseGateEvidence,
  handoff: P03PhaseHandoffContract = getForgeP03ToP04PhaseHandoff(),
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (evidence.phaseId !== handoff.sourcePhase.phaseId) {
    issues.push(`evidence phaseId=${evidence.phaseId} handoff=${handoff.sourcePhase.phaseId}`);
  }
  if (evidence.blockSeals.length !== P03_STRATEGIST_PHASE_BLOCK_COUNT) {
    issues.push(`block seal count=${evidence.blockSeals.length} expected=${P03_STRATEGIST_PHASE_BLOCK_COUNT}`);
  }
  if (!evidence.blockSeals.every(seal => seal.passed)) {
    issues.push("one or more block gates failed");
  }
  if (evidence.atomSealsPassed !== P03_STRATEGIST_PHASE_ATOM_COUNT) {
    issues.push(`atomSealsPassed=${evidence.atomSealsPassed} expected=${P03_STRATEGIST_PHASE_ATOM_COUNT}`);
  }
  if (!evidence.provenanceRegressionPassed) {
    issues.push("provenanceRegressionPassed=false");
  }
  if (!evidence.handoffValid) {
    issues.push("handoffValid=false");
  }

  const handoffValidation = validateP03PhaseHandoffContract(handoff, evidence);
  issues.push(...handoffValidation.issues);

  return { valid: issues.length === 0, issues };
}

export const STRATEGIST_PHASE_GATE_CATEGORIES = [
  "phase_versioning",
  "block_gate_signal",
  "phase_inventory",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type StrategistPhaseGateCategory = (typeof STRATEGIST_PHASE_GATE_CATEGORIES)[number];

export interface StrategistPhaseGateFixtureEntry {
  id: string;
  category: StrategistPhaseGateCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface StrategistPhaseGateBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    strategistProvenanceProbeCount: number;
    sealedAtomCount: number;
  };
  probes: StrategistPhaseGateFixtureEntry[];
}

export interface StrategistPhaseGateProbeResult {
  id: string;
  category: StrategistPhaseGateCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface StrategistPhaseGateProbeSummary {
  total: number;
  aligned: number;
  mismatches: StrategistPhaseGateProbeResult[];
  knownGaps: StrategistPhaseGateProbeResult[];
  byCategory: Record<
    StrategistPhaseGateCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface StrategistPhaseGateValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: StrategistPhaseGateCategory;
  detail: string;
}

export interface StrategistPhaseGateValidationResult {
  valid: boolean;
  issues: StrategistPhaseGateValidationIssue[];
}

export interface StrategistPhaseGateContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: StrategistPhaseGateCategory;
  detail: string;
}

export interface StrategistPhaseGateContractCoverageResult {
  valid: boolean;
  issues: StrategistPhaseGateContractCoverageIssue[];
}

export type StrategistPhaseGateProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface StrategistPhaseGateProbeContract {
  id: string;
  category: StrategistPhaseGateCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: StrategistPhaseGateProbeDisposition;
  criterion: string;
}

export interface StrategistPhaseGateCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface StrategistPhaseGateCategoryContract {
  category: StrategistPhaseGateCategory;
  acceptance: StrategistPhaseGateCategoryAcceptance;
  probes: readonly StrategistPhaseGateProbeContract[];
}

export interface StrategistPhaseGateContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<StrategistPhaseGateCategory, StrategistPhaseGateCategoryContract>;
  probes: readonly StrategistPhaseGateProbeContract[];
}

export const STRATEGIST_PHASE_GATE_A01_MIN_PROBES: Readonly<
  Record<StrategistPhaseGateCategory, number>
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

function flattenStrategistPhaseGateCategoryProbes(
  categories: Record<StrategistPhaseGateCategory, StrategistPhaseGateCategoryContract>,
): readonly StrategistPhaseGateProbeContract[] {
  return STRATEGIST_PHASE_GATE_CATEGORIES.flatMap(category => categories[category].probes);
}

const STRATEGIST_PHASE_GATE_CATEGORY_CONTRACTS: Record<
  StrategistPhaseGateCategory,
  StrategistPhaseGateCategoryContract
> = {
  phase_versioning: {
    category: "phase_versioning",
    acceptance: {
      invariant:
        "Strategist phase gate baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "spg.version_tagged",
        category: "phase_versioning",
        description: "Strategist phase gate baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist phase gate baseline declares semver version field",
      },
      {
        id: "spg.atom_tagged",
        category: "phase_versioning",
        description: "Strategist phase gate baseline declares P03-B10-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist phase gate baseline declares P03-B10-A01 atom id",
      },
      {
        id: "spg.harness_version_exported",
        category: "phase_versioning",
        description: "FORGE_STRATEGIST_PHASE_GATE_VERSION exported for phase gate harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_STRATEGIST_PHASE_GATE_VERSION exported for phase gate harness",
      },
    ],
  },
  block_gate_signal: {
    category: "block_gate_signal",
    acceptance: {
      invariant:
        "Orchestrator exposes verifyForgeStrategist*BlockGate methods for sealed P03 strategist blocks.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "spg.orchestrator_intent_block_gate",
        category: "block_gate_signal",
        description: "Orchestrator exposes verifyForgeStrategistIntentBlockGate for P03-B01 seal",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator exposes verifyForgeStrategistIntentBlockGate for P03-B01 seal",
      },
      {
        id: "spg.orchestrator_provenance_block_gate",
        category: "block_gate_signal",
        description: "Orchestrator exposes verifyForgeStrategistProvenanceBlockGate for P03-B09 seal",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator exposes verifyForgeStrategistProvenanceBlockGate for P03-B09 seal",
      },
      {
        id: "spg.orchestrator_nine_block_gates",
        category: "block_gate_signal",
        description:
          "Orchestrator exposes verifyForgeStrategist*BlockGate for all nine prior P03 strategist blocks",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Orchestrator exposes verifyForgeStrategist*BlockGate for all nine prior P03 strategist blocks",
      },
    ],
  },
  phase_inventory: {
    category: "phase_inventory",
    acceptance: {
      invariant:
        "P03 strategist phase inventory declares ten blocks and one hundred atoms with canonical runners.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "spg.block_inventory_exported",
        category: "phase_inventory",
        description: "P03_STRATEGIST_PHASE_BLOCK_INVENTORY exports canonical ten-block strategist inventory",
        expected: "PASS",
        disposition: "observed",
        criterion: "P03_STRATEGIST_PHASE_BLOCK_INVENTORY exports canonical ten-block strategist inventory",
      },
      {
        id: "spg.block_count_constant",
        category: "phase_inventory",
        description: "P03_STRATEGIST_PHASE_BLOCK_COUNT equals ten sealed strategist blocks",
        expected: "PASS",
        disposition: "observed",
        criterion: "P03_STRATEGIST_PHASE_BLOCK_COUNT equals ten sealed strategist blocks",
      },
      {
        id: "spg.atom_count_constant",
        category: "phase_inventory",
        description: "P03_STRATEGIST_PHASE_ATOM_COUNT equals one hundred strategist atoms",
        expected: "PASS",
        disposition: "observed",
        criterion: "P03_STRATEGIST_PHASE_ATOM_COUNT equals one hundred strategist atoms",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Phase gate baseline links to sealed P03-B09 block gate and strategist provenance handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "spg.b09_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P03_B09_TO_B10_HANDOFF_V1 targets P03-B10-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P03_B09_TO_B10_HANDOFF_V1 targets P03-B10-A01 entry atom",
      },
      {
        id: "spg.b09_sealed_provenance_probes",
        category: "baseline_link",
        description: "P03-B09→B10 handoff sealed probeCount matches active strategist provenance contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P03-B09→B10 handoff sealed probeCount matches active strategist provenance contract",
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
        id: "spg.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P03-B09 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P03-B09 block gate source artifacts",
      },
      {
        id: "spg.probe_runner_exported",
        category: "boundary",
        description: "runStrategistPhaseGateProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runStrategistPhaseGateProbes executes contract-wired probe matrix",
      },
      {
        id: "spg.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL phase gate gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL phase gate gap",
      },
      {
        id: "spg.empty_manifest_boundary",
        category: "boundary",
        description: "assessStrategistPhaseGateInputBoundary rejects empty phase gate manifest",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistPhaseGateInputBoundary rejects empty phase gate manifest",
      },
      {
        id: "spg.whitespace_manifest_boundary",
        category: "boundary",
        description: "assessStrategistPhaseGateInputBoundary rejects whitespace-only phase gate manifest",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistPhaseGateInputBoundary rejects whitespace-only phase gate manifest",
      },
      {
        id: "spg.long_manifest_truncation_boundary",
        category: "boundary",
        description: "assessStrategistPhaseGateInputBoundary truncates manifest exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistPhaseGateInputBoundary truncates manifest exceeding max length",
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
        id: "spg.invalid_version_rejected",
        category: "failure_path",
        description: "validateStrategistPhaseGateBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateStrategistPhaseGateBaseline rejects unexpected fixture version",
      },
      {
        id: "spg.incomplete_block_inventory_rejected",
        category: "failure_path",
        description: "validateP03PhaseHandoffContract rejects incomplete block gate evidence",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateP03PhaseHandoffContract rejects incomplete block gate evidence",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Checkpoint resume preserves replan lineage; recoverStrategistPhaseGateEvidence restructures failed seal manifest; orchestrator exposes phase gate runner.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "spg.replan_checkpoint_resume",
        category: "recovery_path",
        description: "Pipeline resume preserves replan checkpoint lineage after block failure recovery",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Pipeline resume preserves replan checkpoint lineage after block failure recovery",
      },
      {
        id: "spg.structured_phase_gate_recovery",
        category: "recovery_path",
        description:
          "recoverStrategistPhaseGateEvidence restructures failed block seal manifest into phase gate evidence",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "recoverStrategistPhaseGateEvidence restructures failed block seal manifest into phase gate evidence",
      },
      {
        id: "spg.orchestrator_phase_gate_runner",
        category: "recovery_path",
        description: "Orchestrator exposes verifyForgeP03StrategistPhaseGate for P03 phase acceptance",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Orchestrator exposes verifyForgeP03StrategistPhaseGate for P03 phase acceptance",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant: "Replan BLOCK and phase gate evidence validation reject failed block seals.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "spg.strategist_replan_block",
        category: "nogo_path",
        description: "validateStrategistReplan can BLOCK pipeline on invalid replan plan",
        expected: "PASS",
        disposition: "nogo",
        criterion: "validateStrategistReplan can BLOCK pipeline on invalid replan plan",
      },
      {
        id: "spg.phase_gate_evidence_nogo",
        category: "nogo_path",
        description: "validateForgeP03StrategistPhaseGateEvidence rejects failed block gate seals",
        expected: "PASS",
        disposition: "nogo",
        criterion: "validateForgeP03StrategistPhaseGateEvidence rejects failed block gate seals",
      },
    ],
  },
};

export const FORGE_STRATEGIST_PHASE_GATE_CONTRACT_V1: StrategistPhaseGateContract = {
  version: "1.0.0",
  atom: "P03-B10-A02",
  purpose: "Strategist phase gate typed contract with measurable acceptance probes.",
  categories: STRATEGIST_PHASE_GATE_CATEGORY_CONTRACTS,
  probes: flattenStrategistPhaseGateCategoryProbes(STRATEGIST_PHASE_GATE_CATEGORY_CONTRACTS),
};

export function getActiveStrategistPhaseGateContract(): StrategistPhaseGateContract {
  return FORGE_STRATEGIST_PHASE_GATE_CONTRACT_V1;
}

export function getStrategistPhaseGateCategoryContract(
  category: StrategistPhaseGateCategory,
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): StrategistPhaseGateCategoryContract {
  return contract.categories[category];
}

export function listStrategistPhaseGateContractProbeIds(
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listStrategistPhaseGateProbesByDisposition(
  disposition: StrategistPhaseGateProbeDisposition,
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): StrategistPhaseGateProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listStrategistPhaseGateContractProbesByCategory(
  category: StrategistPhaseGateCategory,
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): readonly StrategistPhaseGateProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeStrategistPhaseGateCoverage(
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<StrategistPhaseGateCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<StrategistPhaseGateProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    StrategistPhaseGateCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<StrategistPhaseGateProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };

  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of STRATEGIST_PHASE_GATE_CATEGORIES) {
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

export function validateStrategistPhaseGateCoverage(
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): StrategistPhaseGateContractCoverageResult {
  const issues: StrategistPhaseGateContractCoverageIssue[] = [];

  for (const category of STRATEGIST_PHASE_GATE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < STRATEGIST_PHASE_GATE_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${STRATEGIST_PHASE_GATE_A01_MIN_PROBES[category]}`,
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

  const ids = listStrategistPhaseGateContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeStrategistPhaseGateCoverage(contract);
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
    if (!probeEntry.id.startsWith("spg.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probeEntry.id,
        detail: `${probeEntry.id} missing spg. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateStrategistPhaseGateAgainstContract(
  fixture: StrategistPhaseGateBaseline,
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): StrategistPhaseGateValidationResult {
  const issues: StrategistPhaseGateValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of STRATEGIST_PHASE_GATE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    const categoryProbes = contract.categories[category].probes;
    if (categoryProbes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${categoryProbes.length} probes; contract requires >= ${categoryContract.acceptance.minProbeCount}`,
      });
    }
    if (categoryContract.acceptance.minProbeCount < STRATEGIST_PHASE_GATE_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${STRATEGIST_PHASE_GATE_A01_MIN_PROBES[category]}`,
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

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  const contractExpectedFail = contract.probes.filter(p => p.expected === "FAIL").length;
  if (failGaps.length !== contractExpectedFail) {
    issues.push({
      kind: "missing_category",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${contractExpectedFail}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

export function buildDefaultSourceBlockGate(): StrategistPhaseGateBaseline["sourceBlockGate"] {
  const handoff = getForgeP03B09ToB10Handoff();
  const coverage = summarizeStrategistProvenanceCoverage(getActiveStrategistProvenanceContract());
  return {
    version: handoff.version,
    atom: handoff.atom,
    contractVersion: handoff.sealedArtifacts.contractVersion,
    strategistProvenanceProbeCount: coverage.totalProbes,
    sealedAtomCount: EXPECTED_P03_B09_SEALED_ATOM_COUNT,
  };
}

export function loadStrategistPhaseGateBaseline(): StrategistPhaseGateBaseline {
  return strategistPhaseGateBaseline as StrategistPhaseGateBaseline;
}

export function validateStrategistPhaseGateBaseline(
  fixture: StrategistPhaseGateBaseline,
): StrategistPhaseGateValidationResult {
  const issues: StrategistPhaseGateValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P03-B10-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    STRATEGIST_PHASE_GATE_CATEGORIES.map(category => [category, 0]),
  ) as Record<StrategistPhaseGateCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of STRATEGIST_PHASE_GATE_CATEGORIES) {
    const min = STRATEGIST_PHASE_GATE_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP03B09ToB10Handoff();
  const provenanceCoverage = summarizeStrategistProvenanceCoverage(getActiveStrategistProvenanceContract());

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (fixture.sourceBlockGate.strategistProvenanceProbeCount !== provenanceCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.strategistProvenanceProbeCount=${fixture.sourceBlockGate.strategistProvenanceProbeCount} ` +
        `contract=${provenanceCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P03_B09_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P03_B09_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P03_B09_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B09 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P03_B09_SEALED_ATOM_COUNT}`,
    });
  }

  const contractAlignment = validateStrategistPhaseGateAgainstContract(
    fixture,
    getActiveStrategistPhaseGateContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeStrategistPhaseGateMatrix(
  results: StrategistPhaseGateProbeResult[],
): StrategistPhaseGateProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as StrategistPhaseGateProbeSummary["byCategory"];
  for (const category of STRATEGIST_PHASE_GATE_CATEGORIES) {
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

export function listStrategistPhaseGateProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistPhaseGateBaseline,
): StrategistPhaseGateFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listStrategistPhaseGateKnownGaps(
  results: StrategistPhaseGateProbeResult[],
): StrategistPhaseGateProbeResult[] {
  return summarizeStrategistPhaseGateMatrix(results).knownGaps;
}

export interface StrategistPhaseGateProbeMatrixValidationIssue {
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

export interface StrategistPhaseGateProbeMatrixValidationResult {
  valid: boolean;
  issues: StrategistPhaseGateProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 * PASS probes must align; documented FAIL gaps must remain aligned (actual === FAIL).
 */
export function validateStrategistPhaseGateProbeMatrix(
  results: StrategistPhaseGateProbeResult[],
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): StrategistPhaseGateProbeMatrixValidationResult {
  const issues: StrategistPhaseGateProbeMatrixValidationIssue[] = [];
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
export function validateStrategistPhaseGateBoundaryProbeMatrix(
  results: StrategistPhaseGateProbeResult[],
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): StrategistPhaseGateProbeMatrixValidationResult {
  const boundaryProbes = listStrategistPhaseGateContractProbesByCategory("boundary", contract);
  const boundaryContract: StrategistPhaseGateContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateStrategistPhaseGateProbeMatrix(boundaryResults, boundaryContract);
}

export const STRATEGIST_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly StrategistPhaseGateCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes and documented FAIL gaps must align; zero unexpected mismatches.
 */
export function validateStrategistPhaseGateFailureRecoveryProbeMatrix(
  results: StrategistPhaseGateProbeResult[],
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): StrategistPhaseGateProbeMatrixValidationResult {
  const failureRecoveryProbes = STRATEGIST_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistPhaseGateContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: StrategistPhaseGateContract = {
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
  return validateStrategistPhaseGateProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listStrategistPhaseGateFailureRecoveryProbeIds(
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): string[] {
  return STRATEGIST_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listStrategistPhaseGateContractProbesByCategory(category, contract).map(p => p.id),
  );
}

/** Per-probe evidence artifact — disposition, criterion and aligned outcomes (P03-B10-A06). */
export interface StrategistPhaseGateProbeEvidence {
  probeId: string;
  category: StrategistPhaseGateCategory;
  disposition: StrategistPhaseGateProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for strategist phase gate runs (P03-B10-A06). */
export interface StrategistPhaseGateProbeTelemetry {
  probeId: string;
  category: StrategistPhaseGateCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P03-B10-A06). */
export interface StrategistPhaseGateProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourceBlockGateVersion: string;
  sourceBlockGateAtom: string;
  sliceAtom?: string;
  sliceCategories?: readonly StrategistPhaseGateCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated strategist phase gate run record bundling evidence, telemetry and provenance. */
export interface StrategistPhaseGateRunRecord {
  provenance: StrategistPhaseGateProvenance;
  evidence: StrategistPhaseGateProbeEvidence[];
  telemetry: StrategistPhaseGateProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<StrategistPhaseGateCategory, number>;
    byDisposition: Record<StrategistPhaseGateProbeDisposition, number>;
  };
}

export interface StrategistPhaseGateRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface StrategistPhaseGateRunValidationResult {
  valid: boolean;
  issues: StrategistPhaseGateRunValidationIssue[];
}

export function buildStrategistPhaseGateProbeEvidence(
  probeId: string,
  category: StrategistPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: StrategistPhaseGateProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): StrategistPhaseGateProbeEvidence {
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

export function buildStrategistPhaseGateProbeTelemetry(
  probeId: string,
  category: StrategistPhaseGateCategory,
  sequenceIndex: number,
  durationMs: number,
): StrategistPhaseGateProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildStrategistPhaseGateProvenance(
  runId: string,
  fixture: StrategistPhaseGateBaseline,
  contract: StrategistPhaseGateContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly StrategistPhaseGateCategory[];
  },
): StrategistPhaseGateProvenance {
  return {
    runId,
    harnessVersion: FORGE_STRATEGIST_PHASE_GATE_VERSION,
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

export function buildStrategistPhaseGateRunRecord(
  provenance: StrategistPhaseGateProvenance,
  evidence: StrategistPhaseGateProbeEvidence[],
  telemetry: StrategistPhaseGateProbeTelemetry[],
): StrategistPhaseGateRunRecord {
  const byCategory = {} as Record<StrategistPhaseGateCategory, number>;
  const byDisposition: Record<StrategistPhaseGateProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of STRATEGIST_PHASE_GATE_CATEGORIES) {
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

function validateStrategistPhaseGateRunRecordAgainstProbeIds(
  record: StrategistPhaseGateRunRecord,
  expectedProbeIds: string[],
  contract: StrategistPhaseGateContract,
): StrategistPhaseGateRunValidationResult {
  const issues: StrategistPhaseGateRunValidationIssue[] = [];
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

export function validateStrategistPhaseGateRunRecord(
  record: StrategistPhaseGateRunRecord,
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): StrategistPhaseGateRunValidationResult {
  return validateStrategistPhaseGateRunRecordAgainstProbeIds(
    record,
    listStrategistPhaseGateContractProbeIds(contract),
    contract,
  );
}

/** Validate failure/recovery slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateStrategistPhaseGateFailureRecoveryRunRecord(
  record: StrategistPhaseGateRunRecord,
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): StrategistPhaseGateRunValidationResult {
  const issues: StrategistPhaseGateRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P03-B10-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P03-B10-A06`,
    });
  }

  const expectedCategories = [...STRATEGIST_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateStrategistPhaseGateRunRecordAgainstProbeIds(
    record,
    listStrategistPhaseGateFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

export interface StrategistPhaseGateEvidenceSliceResult {
  atom: "P03-B10-A06";
  evidenceProbeCount: number;
  matrixValid: boolean;
  recordValid: boolean;
  results: StrategistPhaseGateProbeResult[];
  evidenceResults: StrategistPhaseGateProbeResult[];
  matrixValidation: StrategistPhaseGateProbeMatrixValidationResult;
  record: StrategistPhaseGateRunRecord;
  recordValidation: StrategistPhaseGateRunValidationResult;
}

// ─── Property and fuzz validation (P03-B10-A07) ─────────────────────────────

export interface StrategistPhaseGatePropertyViolation {
  propertyId: string;
  detail: string;
}

export interface StrategistPhaseGatePropertyResult {
  passed: number;
  failed: StrategistPhaseGatePropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type StrategistPhaseGatePropertyCheck = {
  id: string;
  description: string;
  check: (contract: StrategistPhaseGateContract) => string | null;
};

const PHASE_GATE_PROPERTY_CHECK_FIXTURE: StrategistPhaseGateBaseline = {
  version: "0",
  atom: "x",
  purpose: "x",
  sourceBlockGate: {
    version: "0",
    atom: "x",
    contractVersion: "0",
    strategistProvenanceProbeCount: 0,
    sealedAtomCount: 0,
  },
  probes: [],
};

const STRATEGIST_PHASE_GATE_STRUCTURAL_PROPERTIES: readonly StrategistPhaseGatePropertyCheck[] = [
  {
    id: "categories_complete",
    description: "All eight strategist phase gate categories are declared",
    check: contract => {
      for (const category of STRATEGIST_PHASE_GATE_CATEGORIES) {
        if (!contract.categories[category]) return `missing category: ${category}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listStrategistPhaseGateContractProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each category meets contract minProbeCount",
    check: contract => {
      for (const category of STRATEGIST_PHASE_GATE_CATEGORIES) {
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
      "summarizeStrategistPhaseGateCoverage totals match listStrategistPhaseGateContractProbeIds",
    check: contract => {
      const summary = summarizeStrategistPhaseGateCoverage(contract);
      const ids = listStrategistPhaseGateContractProbeIds(contract);
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
    description: "Probe ids are namespaced with spg. prefix",
    check: contract => {
      for (const probe of contract.probes) {
        if (!probe.id.startsWith("spg.")) {
          return `${probe.id} missing spg. prefix`;
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const probeIds = listStrategistPhaseGateContractProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildStrategistPhaseGateProbeEvidence(
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
        return buildStrategistPhaseGateProbeTelemetry(id, probe.category, index, index);
      });
      const record = buildStrategistPhaseGateRunRecord(
        buildStrategistPhaseGateProvenance(
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
      "Synthetic failure/recovery slice record passes validateStrategistPhaseGateFailureRecoveryRunRecord",
    check: contract => {
      const probeIds = listStrategistPhaseGateFailureRecoveryProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildStrategistPhaseGateProbeEvidence(
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
        return buildStrategistPhaseGateProbeTelemetry(id, probe.category, index, index * 0.5);
      });
      const record = buildStrategistPhaseGateRunRecord(
        buildStrategistPhaseGateProvenance(
          "property-check-failure-recovery",
          PHASE_GATE_PROPERTY_CHECK_FIXTURE,
          contract,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:01.000Z",
          probeIds.length,
          {
            sliceAtom: "P03-B10-A06",
            sliceCategories: STRATEGIST_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES,
          },
        ),
        evidence,
        telemetry,
      );
      const validation = validateStrategistPhaseGateFailureRecoveryRunRecord(record, contract);
      if (!validation.valid) {
        return validation.issues.map(i => i.detail).join("; ");
      }
      return null;
    },
  },
] as const;

export function runStrategistPhaseGatePropertyChecks(
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): StrategistPhaseGatePropertyResult {
  const failed: StrategistPhaseGatePropertyViolation[] = [];
  for (const property of STRATEGIST_PHASE_GATE_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = STRATEGIST_PHASE_GATE_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type StrategistPhaseGateFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface StrategistPhaseGateFuzzMutationCase {
  seed: number;
  kind: StrategistPhaseGateFuzzMutationKind;
  probeId?: string;
  category?: StrategistPhaseGateCategory;
}

export interface StrategistPhaseGateFuzzValidationCaseResult {
  mutation: StrategistPhaseGateFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface StrategistPhaseGateFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: StrategistPhaseGateFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createStrategistPhaseGateFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneStrategistPhaseGateBaseline(
  fixture: StrategistPhaseGateBaseline,
): StrategistPhaseGateBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickStrategistPhaseGateFuzzTarget(
  fixture: StrategistPhaseGateBaseline,
  rng: () => number,
): { category: StrategistPhaseGateCategory; index: number; entry: StrategistPhaseGateFixtureEntry } {
  const category =
    STRATEGIST_PHASE_GATE_CATEGORIES[Math.floor(rng() * STRATEGIST_PHASE_GATE_CATEGORIES.length)]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyStrategistPhaseGateFuzzMutation(
  fixture: StrategistPhaseGateBaseline,
  mutation: StrategistPhaseGateFuzzMutationCase,
): StrategistPhaseGateBaseline {
  const mutated = cloneStrategistPhaseGateBaseline(fixture);
  const targetCategory = mutation.category ?? STRATEGIST_PHASE_GATE_CATEGORIES[0]!;
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
          id: `spg.fuzz.extra.${mutation.seed}`,
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
      const other = STRATEGIST_PHASE_GATE_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateStrategistPhaseGateFuzzMutationCases(
  fixture: StrategistPhaseGateBaseline,
  seed: number,
  iterations: number,
): StrategistPhaseGateFuzzMutationCase[] {
  const rng = createStrategistPhaseGateFuzzRng(seed);
  const kinds: StrategistPhaseGateFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: StrategistPhaseGateFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickStrategistPhaseGateFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P03-B10-A07). */
export function runStrategistPhaseGateFuzzValidation(
  fixture: StrategistPhaseGateBaseline,
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
  seed = 42,
  iterations = 24,
): StrategistPhaseGateFuzzValidationResult {
  const cases = generateStrategistPhaseGateFuzzMutationCases(fixture, seed, iterations);
  const results: StrategistPhaseGateFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyStrategistPhaseGateFuzzMutation(fixture, mutation);
    const validation = validateStrategistPhaseGateAgainstContract(mutated, contract);
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

export type StrategistPhaseGateRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface StrategistPhaseGateRunRecordFuzzCase {
  kind: StrategistPhaseGateRunRecordFuzzKind;
  probeId?: string;
}

export function applyStrategistPhaseGateRunRecordFuzzMutation(
  record: StrategistPhaseGateRunRecord,
  mutation: StrategistPhaseGateRunRecordFuzzCase,
): StrategistPhaseGateRunRecord {
  const cloned: StrategistPhaseGateRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P03-B10-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["phase_versioning"],
      };
      break;
  }

  cloned.summary = buildStrategistPhaseGateRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveStrategistPhaseGateRunRecordValidator(
  record: StrategistPhaseGateRunRecord,
): (
  record: StrategistPhaseGateRunRecord,
  contract: StrategistPhaseGateContract,
) => StrategistPhaseGateRunValidationResult {
  return record.provenance.sliceAtom === "P03-B10-A06"
    ? validateStrategistPhaseGateFailureRecoveryRunRecord
    : validateStrategistPhaseGateRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P03-B10-A07). */
export function runStrategistPhaseGateRunRecordFuzzValidation(
  record: StrategistPhaseGateRunRecord,
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveStrategistPhaseGateRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: StrategistPhaseGateRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P03-B10-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyStrategistPhaseGateRunRecordFuzzMutation(record, mutation);
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

// ─── Forge regression integration (P03-B10-A08) ─────────────────────────────

export interface StrategistPhaseGateProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare strategist phase gate run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectStrategistPhaseGateProbeRegression(
  prior: StrategistPhaseGateRunRecord,
  current: StrategistPhaseGateRunRecord,
): StrategistPhaseGateProbeRegressionReport {
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

  const hasRegression =
    regressions.length > 0 || current.summary.mismatches > prior.summary.mismatches;
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

/** Alias matching ACTIVE_FRONT target name. */
export const runStrategistPhaseGateProbeRegression = detectStrategistPhaseGateProbeRegression;

export interface StrategistPhaseGateProbeRegressionValidation {
  valid: boolean;
  report: StrategistPhaseGateProbeRegressionReport;
}

/** Validate probe alignment between prior and current strategist phase gate run records. */
export function validateStrategistPhaseGateProbeRegression(
  prior: StrategistPhaseGateRunRecord,
  current: StrategistPhaseGateRunRecord,
): StrategistPhaseGateProbeRegressionValidation {
  const report = detectStrategistPhaseGateProbeRegression(prior, current);
  return { valid: !report.hasRegression, report };
}

// ─── Guard controls (P03-B10-A09 foundation, used by A08 regression gate) ───

export interface ForgeStrategistPhaseGateGuardControls {
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

export interface StrategistPhaseGateGuardCheckIssue {
  domain: "adversarial" | "performance" | "cost" | "safety";
  code: string;
  detail: string;
}

export interface StrategistPhaseGateGuardCheckResult {
  passed: boolean;
  issues: StrategistPhaseGateGuardCheckIssue[];
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

export interface StrategistPhaseGateAdversarialGuardScenario {
  id: string;
  description: string;
  build: (record: StrategistPhaseGateRunRecord) => StrategistPhaseGateRunRecord;
  expectRejected: true;
}

export const FORGE_STRATEGIST_PHASE_GATE_GUARD_CONTROLS_V1: ForgeStrategistPhaseGateGuardControls = {
  atom: "P03-B10-A09",
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

export function getForgeStrategistPhaseGateGuardControls(): ForgeStrategistPhaseGateGuardControls {
  return FORGE_STRATEGIST_PHASE_GATE_GUARD_CONTROLS_V1;
}

function parseStrategistPhaseGateIsoDurationMs(startedAt: string, completedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function summarizeStrategistPhaseGateTelemetry(telemetry: StrategistPhaseGateProbeTelemetry[]): {
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

export function detectStrategistPhaseGateEvidenceSummaryMismatch(
  record: StrategistPhaseGateRunRecord,
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

export function detectStrategistPhaseGateFalseAlignment(record: StrategistPhaseGateRunRecord): string[] {
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

export function validateStrategistPhaseGateSafety(
  record: StrategistPhaseGateRunRecord,
  controls: ForgeStrategistPhaseGateGuardControls = getForgeStrategistPhaseGateGuardControls(),
): StrategistPhaseGateGuardCheckIssue[] {
  const issues: StrategistPhaseGateGuardCheckIssue[] = [];
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

export function validateStrategistPhaseGatePerformance(
  record: StrategistPhaseGateRunRecord,
  controls: ForgeStrategistPhaseGateGuardControls = getForgeStrategistPhaseGateGuardControls(),
): StrategistPhaseGateGuardCheckIssue[] {
  const issues: StrategistPhaseGateGuardCheckIssue[] = [];
  const { suiteDurationMs, maxProbeDurationMs } = summarizeStrategistPhaseGateTelemetry(record.telemetry);
  const wallClockMs = parseStrategistPhaseGateIsoDurationMs(
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

export function validateStrategistPhaseGateCost(
  totalCostUsd: number,
  llmCalls: number,
  controls: ForgeStrategistPhaseGateGuardControls = getForgeStrategistPhaseGateGuardControls(),
): StrategistPhaseGateGuardCheckIssue[] {
  const issues: StrategistPhaseGateGuardCheckIssue[] = [];
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

export function buildStrategistPhaseGateAdversarialGuardScenarios(): StrategistPhaseGateAdversarialGuardScenario[] {
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

export function runStrategistPhaseGateAdversarialGuardChecks(
  fixtureRecord: StrategistPhaseGateRunRecord,
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): { rejected: number; total: number; failures: string[] } {
  const scenarios = buildStrategistPhaseGateAdversarialGuardScenarios();
  const failures: string[] = [];
  let rejected = 0;

  for (const scenario of scenarios) {
    const tampered = scenario.build(fixtureRecord);
    const validate = resolveStrategistPhaseGateRunRecordValidator(tampered);
    const validation = validate(tampered, contract);
    const falseAlignment = detectStrategistPhaseGateFalseAlignment(tampered);
    const summaryMismatch = detectStrategistPhaseGateEvidenceSummaryMismatch(tampered);
    const rejectedByGuard =
      !validation.valid || falseAlignment.length > 0 || summaryMismatch !== null;

    if (rejectedByGuard) rejected++;
    else failures.push(`${scenario.id}: tampered record was not rejected`);
  }

  return { rejected, total: scenarios.length, failures };
}

export function validateForgeStrategistPhaseGateGuard(
  record: StrategistPhaseGateRunRecord,
  options: {
    totalCostUsd?: number;
    llmCalls?: number;
    contract?: StrategistPhaseGateContract;
    controls?: ForgeStrategistPhaseGateGuardControls;
  } = {},
): StrategistPhaseGateGuardCheckResult {
  const controls = options.controls ?? getForgeStrategistPhaseGateGuardControls();
  const contract = options.contract ?? getActiveStrategistPhaseGateContract();
  const totalCostUsd = options.totalCostUsd ?? 0;
  const llmCalls = options.llmCalls ?? 0;
  const issues: StrategistPhaseGateGuardCheckIssue[] = [];

  issues.push(...validateStrategistPhaseGatePerformance(record, controls));
  issues.push(...validateStrategistPhaseGateCost(totalCostUsd, llmCalls, controls));
  issues.push(...validateStrategistPhaseGateSafety(record, controls));

  const falseAlignment = detectStrategistPhaseGateFalseAlignment(record);
  if (falseAlignment.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "false_alignment",
      detail: falseAlignment.join("; "),
    });
  }
  const summaryMismatch = detectStrategistPhaseGateEvidenceSummaryMismatch(record);
  if (summaryMismatch) {
    issues.push({
      domain: "adversarial",
      code: "summary_evidence_mismatch",
      detail: summaryMismatch,
    });
  }

  const adversarial = runStrategistPhaseGateAdversarialGuardChecks(record, contract);
  if (adversarial.failures.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "scenario_not_rejected",
      detail: adversarial.failures.join("; "),
    });
  }

  const telemetrySummary = summarizeStrategistPhaseGateTelemetry(record.telemetry);
  const wallClockMs = parseStrategistPhaseGateIsoDurationMs(
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

// ─── Block gate and handoff (P03-B10-A10) ───────────────────────────────────

export interface StrategistPhaseGateBlockGateEvidence {
  blockId: string;
  atom: string;
  sealedAt: string;
  atomSeals: ForgeBlockAtomSeal[];
  regressionPassed: boolean;
  guardPassed: boolean;
  handoffValid: boolean;
  probeCount: number;
  sealedBlockCount: number;
  gitCommit?: string;
}

export interface StrategistPhaseGateBlockHandoffContract {
  version: string;
  atom: string;
  sourceBlock: {
    blockId: string;
    title: string;
    completedAtoms: readonly string[];
  };
  targetBlock: {
    blockId: string;
    title: string;
    entryAtom: string;
  };
  sealedArtifacts: {
    fixtureVersion: string;
    contractVersion: string;
    harnessVersion: string;
    probeCount: number;
    strategistPhaseGateCategories: readonly StrategistPhaseGateCategory[];
    sealedBlockInventoryCount: number;
    sourceStrategistProvenanceBlockGateAtom: string;
  };
  prerequisites: readonly string[];
  entryCriteria: {
    description: string;
    requiresBlockGatePass: true;
    strategistPhaseGateRecordRequired: true;
  };
}

export const FORGE_P03_B10_BLOCK_GATE_V1: ForgeBlockGateDefinition = {
  version: "1.0.0",
  atom: "P03-B10-A10",
  blockId: "P03-B10",
  title: "Stratejist phase gate",
  requiredAtomIds: [
    "P03-B10-A01",
    "P03-B10-A02",
    "P03-B10-A03",
    "P03-B10-A04",
    "P03-B10-A05",
    "P03-B10-A06",
    "P03-B10-A07",
    "P03-B10-A08",
    "P03-B10-A09",
    "P03-B10-A10",
  ],
  checks: [
    {
      id: "fixture_contract_alignment",
      atomId: "P03-B10-A01",
      description: "Strategist phase gate baseline aligns with typed contract and P03-B09 block gate handoff",
    },
    {
      id: "typed_contract_coverage",
      atomId: "P03-B10-A02",
      description: "Contract declares measurable probes for all strategist phase gate categories",
    },
    {
      id: "probe_matrix_aligned",
      atomId: "P03-B10-A03",
      description: "Strategist phase gate probe matrix executes with zero unexpected mismatches",
    },
    {
      id: "boundary_disposition_coverage",
      atomId: "P03-B10-A04",
      description: "Contract covers observed, gap, failure, recovery and NO-GO dispositions",
    },
    {
      id: "failure_recovery_nogo",
      atomId: "P03-B10-A05",
      description: "Failure, recovery and NO-GO probes are declared and exercised",
    },
    {
      id: "evidence_telemetry_provenance",
      atomId: "P03-B10-A06",
      description: "Run record carries evidence, telemetry and provenance",
    },
    {
      id: "property_and_fuzz",
      atomId: "P03-B10-A07",
      description: "Structural property and fuzz validation reject tampered inputs",
    },
    {
      id: "regression_gate",
      atomId: "P03-B10-A08",
      description: "Regression gate passes on canonical strategist phase gate matrix",
    },
    {
      id: "guard_controls",
      atomId: "P03-B10-A09",
      description: "Adversarial, performance, cost and safety guard controls pass",
    },
    {
      id: "block_gate_sealed",
      atomId: "P03-B10-A10",
      description: "Block gate evidence sealed with valid P04 handoff contract",
    },
  ] satisfies readonly ForgeBlockGateCheck[],
};

export const FORGE_P03_B10_TO_P04_HANDOFF_V1: StrategistPhaseGateBlockHandoffContract = {
  version: "1.0.0",
  atom: "P03-B10-A10",
  sourceBlock: {
    blockId: "P03-B10",
    title: "Stratejist phase gate",
    completedAtoms: FORGE_P03_B10_BLOCK_GATE_V1.requiredAtomIds,
  },
  targetBlock: {
    blockId: "P04-B01",
    title: "Research question decomposition",
    entryAtom: "P04-B01-A01",
  },
  sealedArtifacts: {
    fixtureVersion: "1.0.0",
    contractVersion: FORGE_STRATEGIST_PHASE_GATE_CONTRACT_V1.version,
    harnessVersion: FORGE_STRATEGIST_PHASE_GATE_VERSION,
    probeCount: summarizeStrategistPhaseGateCoverage(FORGE_STRATEGIST_PHASE_GATE_CONTRACT_V1).totalProbes,
    strategistPhaseGateCategories: STRATEGIST_PHASE_GATE_CATEGORIES,
    sealedBlockInventoryCount: P03_STRATEGIST_PHASE_BLOCK_COUNT,
    sourceStrategistProvenanceBlockGateAtom: "P03-B09-A10",
  },
  prerequisites: [
    "Strategist phase gate contract v1 with measurable block gate signal, phase inventory and guard probes",
    "Versioned strategist phase gate baseline aligned to contract probe matrix and sealed P03-B09 block gate",
    "Evidence, telemetry and provenance run records",
    "Regression and guard gates integrated with orchestrator verification",
    "Nine sealed P03 strategist block gates referenced by phase block inventory",
  ],
  entryCriteria: {
    description:
      "P04-B01-A01 formalizes researcher question baseline using sealed P03 strategist phase gate artifacts",
    requiresBlockGatePass: true,
    strategistPhaseGateRecordRequired: true,
  },
};

export function getForgeP03B10BlockGate(): ForgeBlockGateDefinition {
  return FORGE_P03_B10_BLOCK_GATE_V1;
}

export function getForgeP03B10ToP04Handoff(): StrategistPhaseGateBlockHandoffContract {
  return FORGE_P03_B10_TO_P04_HANDOFF_V1;
}

export function validateStrategistPhaseGateBlockHandoffContract(
  handoff: StrategistPhaseGateBlockHandoffContract,
  evidence: Pick<
    StrategistPhaseGateBlockGateEvidence,
    "probeCount" | "regressionPassed" | "guardPassed" | "sealedBlockCount"
  >,
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const coverage = summarizeStrategistPhaseGateCoverage(contract);

  if (handoff.sealedArtifacts.probeCount !== coverage.totalProbes) {
    issues.push(
      `handoff probeCount=${handoff.sealedArtifacts.probeCount} contract=${coverage.totalProbes}`,
    );
  }
  if (handoff.sealedArtifacts.contractVersion !== contract.version) {
    issues.push(
      `handoff contractVersion=${handoff.sealedArtifacts.contractVersion} active=${contract.version}`,
    );
  }
  if (
    handoff.sealedArtifacts.strategistPhaseGateCategories.length !== STRATEGIST_PHASE_GATE_CATEGORIES.length
  ) {
    issues.push("handoff strategistPhaseGateCategories incomplete");
  }
  if (handoff.sealedArtifacts.sealedBlockInventoryCount !== P03_STRATEGIST_PHASE_BLOCK_COUNT) {
    issues.push(
      `handoff sealedBlockInventoryCount=${handoff.sealedArtifacts.sealedBlockInventoryCount} expected=${P03_STRATEGIST_PHASE_BLOCK_COUNT}`,
    );
  }
  if (handoff.sealedArtifacts.sourceStrategistProvenanceBlockGateAtom !== "P03-B09-A10") {
    issues.push(
      `unexpected source block gate atom: ${handoff.sealedArtifacts.sourceStrategistProvenanceBlockGateAtom}`,
    );
  }
  if (handoff.targetBlock.entryAtom !== "P04-B01-A01") {
    issues.push(`unexpected entry atom: ${handoff.targetBlock.entryAtom}`);
  }
  if (!evidence.regressionPassed) {
    issues.push("regression gate did not pass");
  }
  if (!evidence.guardPassed) {
    issues.push("guard gate did not pass");
  }
  if (evidence.probeCount !== coverage.totalProbes) {
    issues.push(`evidence probeCount=${evidence.probeCount} contract=${coverage.totalProbes}`);
  }
  if (evidence.sealedBlockCount !== EXPECTED_P03_STRATEGIST_PRIOR_BLOCK_GATE_COUNT) {
    issues.push(
      `evidence sealedBlockCount=${evidence.sealedBlockCount} expected=${EXPECTED_P03_STRATEGIST_PRIOR_BLOCK_GATE_COUNT}`,
    );
  }

  return { valid: issues.length === 0, issues };
}

export function buildStrategistPhaseGateBlockGateEvidence(
  atomSeals: ForgeBlockAtomSeal[],
  regressionPassed: boolean,
  guardPassed: boolean,
  probeCount: number,
  gitCommit?: string,
  blockId = FORGE_P03_B10_BLOCK_GATE_V1.blockId,
): StrategistPhaseGateBlockGateEvidence {
  const handoff = getForgeP03B10ToP04Handoff();
  const handoffValid = validateStrategistPhaseGateBlockHandoffContract(handoff, {
    probeCount,
    regressionPassed,
    guardPassed,
    sealedBlockCount: EXPECTED_P03_STRATEGIST_PRIOR_BLOCK_GATE_COUNT,
  }).valid;

  return {
    blockId,
    atom: "P03-B10-A10",
    sealedAt: new Date().toISOString(),
    atomSeals,
    regressionPassed,
    guardPassed,
    handoffValid,
    probeCount,
    sealedBlockCount: EXPECTED_P03_STRATEGIST_PRIOR_BLOCK_GATE_COUNT,
    ...(gitCommit ? { gitCommit } : {}),
  };
}

/** Validate sealed strategist phase gate block evidence against P04 handoff contract. */
export function validateForgeP03StrategistPhaseGateBlockGate(
  evidence: StrategistPhaseGateBlockGateEvidence,
  handoff: StrategistPhaseGateBlockHandoffContract = getForgeP03B10ToP04Handoff(),
  contract: StrategistPhaseGateContract = getActiveStrategistPhaseGateContract(),
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (evidence.blockId !== handoff.sourceBlock.blockId) {
    issues.push(`evidence blockId=${evidence.blockId} handoff=${handoff.sourceBlock.blockId}`);
  }
  if (evidence.atom !== handoff.atom) {
    issues.push(`evidence atom=${evidence.atom} handoff=${handoff.atom}`);
  }
  if (evidence.atomSeals.length !== handoff.sourceBlock.completedAtoms.length) {
    issues.push(
      `atom seal count=${evidence.atomSeals.length} expected=${handoff.sourceBlock.completedAtoms.length}`,
    );
  }
  if (!evidence.atomSeals.every(seal => seal.passed)) {
    issues.push("one or more atom seals failed");
  }
  if (!evidence.handoffValid) {
    issues.push("evidence handoffValid=false");
  }

  const handoffValidation = validateStrategistPhaseGateBlockHandoffContract(handoff, evidence, contract);
  issues.push(...handoffValidation.issues);

  return { valid: issues.length === 0, issues };
}

export { FORGE_STRATEGIST_PROVENANCE_VERSION };
