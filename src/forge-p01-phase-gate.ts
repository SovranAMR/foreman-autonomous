/**
 * FOREMAN — P01 Phase Gate (Forge Contract, Baseline & Formal Core)
 *
 * Seals P01 after all ten block gates pass and prepares P02 visioner entry baseline.
 */

import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import {
  EXPECTED_SEALED_BLOCK_COUNT,
  FORGE_INTEGRATED_BASELINE_VERSION,
  getActiveIntegratedBaselineContract,
  summarizeIntegratedBaselineContractCoverage,
} from "./forge-integrated-baseline.js";

export const FORGE_P01_PHASE_GATE_VERSION = "1.0.0";

export const P01_PHASE_ID = "P01" as const;
export const P02_PHASE_ID = "P02" as const;

/** Canonical P01 blocks B01–B10 with block-gate runner identifiers. */
export const P01_PHASE_BLOCK_INVENTORY = [
  { blockId: "P01-B01", title: "Mission ve acceptance contract", runner: "runForgeBaselineBlockGate" },
  { blockId: "P01-B02", title: "Mevcut pipeline davranış haritası", runner: "runForgeBehaviorMapBlockGate" },
  { blockId: "P01-B03", title: "Formal state machine", runner: "runForgeFormalStateMachineBlockGate" },
  { blockId: "P01-B04", title: "Typed phase/event schema", runner: "runForgePhaseEventSchemaBlockGate" },
  { blockId: "P01-B05", title: "Pipeline invariant engine", runner: "runForgePipelineInvariantEngineBlockGate" },
  { blockId: "P01-B06", title: "Benchmark ve eval harness", runner: "runForgeBenchmarkEvalBlockGate" },
  { blockId: "P01-B07", title: "Reproducible fixture sistemi", runner: "runReproducibleFixtureBlockGate" },
  { blockId: "P01-B08", title: "Evidence ve artifact şeması", runner: "runEvidenceArtifactBlockGate" },
  { blockId: "P01-B09", title: "Orchestrator seam ve modülerleşme", runner: "runOrchestratorSeamBlockGate" },
  { blockId: "P01-B10", title: "Entegre Forge baseline gate", runner: "runIntegratedBaselineBlockGate" },
] as const;

export const P01_PHASE_BLOCK_COUNT = P01_PHASE_BLOCK_INVENTORY.length;
export const P01_PHASE_ATOM_COUNT = P01_PHASE_BLOCK_COUNT * 10;

export const P01_PHASE_GATE_CHECKS = [
  { id: "block_gates_pass", description: "All ten P01 block gates PASS with sealed atom evidence" },
  { id: "atom_terminal_count", description: "One hundred P01 atoms terminal and evidenced via block seals" },
  { id: "integrated_regression", description: "Integrated baseline regression gate PASS" },
  { id: "phase_handoff", description: "P01→P02 phase handoff contract valid with P02-B01 entry" },
] as const;

export type P01PhaseGateCheckId = (typeof P01_PHASE_GATE_CHECKS)[number]["id"];

export interface P01BlockGateSeal {
  blockId: string;
  title: string;
  runner: string;
  passed: boolean;
  atomSealCount: number;
  detail: string;
}

export interface P01PhaseGateEvidence {
  phaseId: typeof P01_PHASE_ID;
  atom: "P01-PHASE-GATE";
  sealedAt: string;
  blockSeals: P01BlockGateSeal[];
  blockGatesPassed: number;
  atomSealsPassed: number;
  integratedRegressionPassed: boolean;
  handoffValid: boolean;
  gitCommit?: string;
}

export interface P01PhaseHandoffContract {
  version: string;
  atom: "P01-PHASE-GATE";
  sourcePhase: {
    phaseId: typeof P01_PHASE_ID;
    title: string;
    completedBlocks: readonly string[];
    completedAtoms: number;
  };
  targetPhase: {
    phaseId: typeof P02_PHASE_ID;
    title: string;
    entryBlock: string;
    entryAtom: string;
  };
  sealedArtifacts: {
    integratedBaselineVersion: string;
    integratedBaselineProbeCount: number;
    sealedBlockInventoryCount: number;
    blockGateMethod: string;
    phaseGateMethod: string;
  };
  prerequisites: readonly string[];
  entryCriteria: {
    description: string;
    requiresPhaseGatePass: true;
    requiresIntegratedBaselineBlockGate: true;
  };
}

export const FORGE_P01_TO_P02_PHASE_HANDOFF_V1: P01PhaseHandoffContract = {
  version: "1.0.0",
  atom: "P01-PHASE-GATE",
  sourcePhase: {
    phaseId: P01_PHASE_ID,
    title: "Forge Contract, Baseline ve Formal Çekirdek",
    completedBlocks: P01_PHASE_BLOCK_INVENTORY.map(block => block.blockId),
    completedAtoms: P01_PHASE_ATOM_COUNT,
  },
  targetPhase: {
    phaseId: P02_PHASE_ID,
    title: "Vizyoner — Neden, Amaç ve Ürün Yönü",
    entryBlock: "P02-B01",
    entryAtom: "P02-B01-A01",
  },
  sealedArtifacts: {
    integratedBaselineVersion: FORGE_INTEGRATED_BASELINE_VERSION,
    integratedBaselineProbeCount: summarizeIntegratedBaselineContractCoverage(
      getActiveIntegratedBaselineContract(),
    ).totalProbes,
    sealedBlockInventoryCount: EXPECTED_SEALED_BLOCK_COUNT,
    blockGateMethod: "verifyForgeIntegratedBlockGate",
    phaseGateMethod: "verifyForgeP01PhaseGate",
  },
  prerequisites: [
    "Ten sealed P01 block gates with atom-level evidence",
    "Integrated baseline block gate PASS with P02-B01 handoff",
    "Integrated baseline regression and guard gates PASS",
    "Orchestrator exposes verifyForgeP01PhaseGate for phase acceptance",
  ],
  entryCriteria: {
    description:
      "P02-B01-A01 formalizes visioner intent baseline using sealed P01 phase gate artifacts",
    requiresPhaseGatePass: true,
    requiresIntegratedBaselineBlockGate: true,
  },
};

export function getForgeP01ToP02PhaseHandoff(): P01PhaseHandoffContract {
  return FORGE_P01_TO_P02_PHASE_HANDOFF_V1;
}

export function countPassedAtomSeals(atomSeals: readonly ForgeBlockAtomSeal[]): number {
  return atomSeals.filter(seal => seal.passed).length;
}

export function validateP01PhaseHandoffContract(
  handoff: P01PhaseHandoffContract,
  evidence: Pick<
    P01PhaseGateEvidence,
    "blockGatesPassed" | "atomSealsPassed" | "integratedRegressionPassed" | "handoffValid"
  >,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const coverage = summarizeIntegratedBaselineContractCoverage();

  if (handoff.sourcePhase.completedBlocks.length !== P01_PHASE_BLOCK_COUNT) {
    issues.push(
      `handoff completedBlocks=${handoff.sourcePhase.completedBlocks.length} expected=${P01_PHASE_BLOCK_COUNT}`,
    );
  }
  if (handoff.sourcePhase.completedAtoms !== P01_PHASE_ATOM_COUNT) {
    issues.push(
      `handoff completedAtoms=${handoff.sourcePhase.completedAtoms} expected=${P01_PHASE_ATOM_COUNT}`,
    );
  }
  if (handoff.targetPhase.entryAtom !== "P02-B01-A01") {
    issues.push(`unexpected entry atom: ${handoff.targetPhase.entryAtom}`);
  }
  if (handoff.sealedArtifacts.integratedBaselineProbeCount !== coverage.totalProbes) {
    issues.push(
      `handoff probeCount=${handoff.sealedArtifacts.integratedBaselineProbeCount} contract=${coverage.totalProbes}`,
    );
  }
  if (handoff.sealedArtifacts.sealedBlockInventoryCount !== EXPECTED_SEALED_BLOCK_COUNT) {
    issues.push(
      `handoff sealedBlockInventoryCount=${handoff.sealedArtifacts.sealedBlockInventoryCount} expected=${EXPECTED_SEALED_BLOCK_COUNT}`,
    );
  }
  if (evidence.blockGatesPassed !== P01_PHASE_BLOCK_COUNT) {
    issues.push(`blockGatesPassed=${evidence.blockGatesPassed} expected=${P01_PHASE_BLOCK_COUNT}`);
  }
  if (evidence.atomSealsPassed !== P01_PHASE_ATOM_COUNT) {
    issues.push(`atomSealsPassed=${evidence.atomSealsPassed} expected=${P01_PHASE_ATOM_COUNT}`);
  }
  if (!evidence.integratedRegressionPassed) {
    issues.push("integrated regression gate did not pass");
  }
  if (!evidence.handoffValid) {
    issues.push("integrated baseline block handoff invalid");
  }

  return { valid: issues.length === 0, issues };
}

export function buildP01PhaseGateEvidence(
  blockSeals: P01BlockGateSeal[],
  integratedRegressionPassed: boolean,
  handoffValid: boolean,
  gitCommit?: string,
): P01PhaseGateEvidence {
  const blockGatesPassed = blockSeals.filter(seal => seal.passed).length;
  const atomSealsPassed = blockSeals.reduce((sum, seal) => sum + seal.atomSealCount, 0);

  return {
    phaseId: P01_PHASE_ID,
    atom: "P01-PHASE-GATE",
    sealedAt: new Date().toISOString(),
    blockSeals,
    blockGatesPassed,
    atomSealsPassed,
    integratedRegressionPassed,
    handoffValid,
    ...(gitCommit ? { gitCommit } : {}),
  };
}

export function validateForgeP01PhaseGateEvidence(
  evidence: P01PhaseGateEvidence,
  handoff: P01PhaseHandoffContract = getForgeP01ToP02PhaseHandoff(),
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (evidence.phaseId !== handoff.sourcePhase.phaseId) {
    issues.push(`evidence phaseId=${evidence.phaseId} handoff=${handoff.sourcePhase.phaseId}`);
  }
  if (evidence.blockSeals.length !== P01_PHASE_BLOCK_COUNT) {
    issues.push(`block seal count=${evidence.blockSeals.length} expected=${P01_PHASE_BLOCK_COUNT}`);
  }
  if (!evidence.blockSeals.every(seal => seal.passed)) {
    issues.push("one or more block gates failed");
  }
  if (evidence.atomSealsPassed !== P01_PHASE_ATOM_COUNT) {
    issues.push(`atomSealsPassed=${evidence.atomSealsPassed} expected=${P01_PHASE_ATOM_COUNT}`);
  }
  if (!evidence.integratedRegressionPassed) {
    issues.push("integratedRegressionPassed=false");
  }
  if (!evidence.handoffValid) {
    issues.push("handoffValid=false");
  }

  const handoffValidation = validateP01PhaseHandoffContract(handoff, evidence);
  issues.push(...handoffValidation.issues);

  return { valid: issues.length === 0, issues };
}
