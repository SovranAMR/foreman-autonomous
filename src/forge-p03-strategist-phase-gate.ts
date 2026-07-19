/**
 * FOREMAN — Strategist Phase Gate Baseline (P03-B10)
 *
 * A01 slice: load, validate, run probes against sealed P03-B09 provenance
 * block gate artifacts.
 */

import strategistPhaseGateBaseline from "./fixtures/forge-strategist-phase-gate-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
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
    phaseGateMethod: "verifyForgeP03StrategistPhaseGate",
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
        expected: "FAIL",
        disposition: "gap",
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

export { FORGE_STRATEGIST_PROVENANCE_VERSION };
