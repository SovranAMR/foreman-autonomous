/**
 * FOREMAN — P03 Phase Gate Probe Harness
 *
 * Runs all ten P03 strategist block gates, phase gate regression, and seals P03→P04 handoff.
 */

import { execSync } from "node:child_process";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import { runForgeStrategistIntentBlockGate } from "./forge-p03-strategist-intent.probe.js";
import { runForgeStrategistBlockContractBlockGate } from "./forge-p03-strategist-block-contract.probe.js";
import { runForgeStrategistAtomizationBlockGate } from "./forge-p03-strategist-atomization.probe.js";
import { runForgeStrategistDependencyDagBlockGate } from "./forge-p03-strategist-dependency-dag.probe.js";
import { runForgeStrategistRiskReversibilityBlockGate } from "./forge-p03-strategist-risk-reversibility.probe.js";
import { runForgeStrategistResourceBudgetBlockGate } from "./forge-p03-strategist-resource-budget.probe.js";
import { runForgeStrategistParallelWaveBlockGate } from "./forge-p03-strategist-parallel-wave.probe.js";
import { runForgeStrategistReplanBlockGate } from "./forge-p03-strategist-replan.probe.js";
import { runForgeStrategistProvenanceBlockGate } from "./forge-p03-strategist-provenance.probe.js";
import {
  runForgeStrategistPhaseGateBlockGate,
  runForgeStrategistPhaseGateRegressionGate,
} from "./forge-p03-strategist-phase-gate.probe.js";
import {
  P03_STRATEGIST_PHASE_BLOCK_COUNT,
  P03_STRATEGIST_PHASE_ATOM_COUNT,
  buildP03StrategistPhaseGateEvidence,
  getForgeP03ToP04PhaseHandoff,
  validateForgeP03StrategistPhaseGateEvidence,
  validateP03PhaseHandoffContract,
  type P03StrategistBlockGateSeal,
  type P03StrategistPhaseGateEvidence,
  type P03PhaseHandoffContract,
} from "./forge-p03-strategist-phase-gate.js";

export type {
  P03StrategistBlockGateSeal,
  P03StrategistPhaseGateEvidence,
  P03PhaseHandoffContract,
} from "./forge-p03-strategist-phase-gate.js";

export {
  FORGE_STRATEGIST_PHASE_GATE_VERSION,
  P03_STRATEGIST_PHASE_BLOCK_INVENTORY,
  P03_STRATEGIST_PHASE_BLOCK_COUNT,
  P03_STRATEGIST_PHASE_ATOM_COUNT,
  P03_STRATEGIST_PHASE_GATE_CHECKS,
  FORGE_P03_TO_P04_PHASE_HANDOFF_V1,
  getForgeP03ToP04PhaseHandoff,
  buildP03StrategistPhaseGateEvidence,
  validateForgeP03StrategistPhaseGateEvidence,
  validateP03PhaseHandoffContract,
} from "./forge-p03-strategist-phase-gate.js";

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

function countPassedAtomSeals(atomSeals: readonly ForgeBlockAtomSeal[]): number {
  return atomSeals.filter(seal => seal.passed).length;
}

function sealBlockGate(
  blockId: string,
  title: string,
  runner: string,
  passed: boolean,
  atomSeals: readonly ForgeBlockAtomSeal[],
  detail: string,
): P03StrategistBlockGateSeal {
  return {
    blockId,
    title,
    runner,
    passed,
    atomSealCount: countPassedAtomSeals(atomSeals),
    detail,
  };
}

export interface ForgeP03PhaseGateResult {
  passed: boolean;
  evidence: P03StrategistPhaseGateEvidence;
  handoff: P03PhaseHandoffContract;
  detail: string;
}

/**
 * Seal P03 phase gate: all block gates, phase gate regression, and P04 phase handoff.
 */
export function runForgeP03PhaseGate(): ForgeP03PhaseGateResult {
  const handoff = getForgeP03ToP04PhaseHandoff();
  const blockSeals: P03StrategistBlockGateSeal[] = [];

  const b01 = runForgeStrategistIntentBlockGate();
  blockSeals.push(
    sealBlockGate("P03-B01", "Hedef decomposition", "runForgeStrategistIntentBlockGate", b01.passed, b01.atomSeals, b01.detail),
  );

  const b02 = runForgeStrategistBlockContractBlockGate();
  blockSeals.push(
    sealBlockGate("P03-B02", "Block üretim kontratı", "runForgeStrategistBlockContractBlockGate", b02.passed, b02.atomSeals, b02.detail),
  );

  const b03 = runForgeStrategistAtomizationBlockGate();
  blockSeals.push(
    sealBlockGate("P03-B03", "Atomization ve atom boyutu", "runForgeStrategistAtomizationBlockGate", b03.passed, b03.atomSeals, b03.detail),
  );

  const b04 = runForgeStrategistDependencyDagBlockGate();
  blockSeals.push(
    sealBlockGate("P03-B04", "Dependency DAG", "runForgeStrategistDependencyDagBlockGate", b04.passed, b04.atomSeals, b04.detail),
  );

  const b05 = runForgeStrategistRiskReversibilityBlockGate();
  blockSeals.push(
    sealBlockGate("P03-B05", "Risk ve reversibility planı", "runForgeStrategistRiskReversibilityBlockGate", b05.passed, b05.atomSeals, b05.detail),
  );

  const b06 = runForgeStrategistResourceBudgetBlockGate();
  blockSeals.push(
    sealBlockGate("P03-B06", "Kaynak ve budget planı", "runForgeStrategistResourceBudgetBlockGate", b06.passed, b06.atomSeals, b06.detail),
  );

  const b07 = runForgeStrategistParallelWaveBlockGate();
  blockSeals.push(
    sealBlockGate("P03-B07", "Parallel execution wave planı", "runForgeStrategistParallelWaveBlockGate", b07.passed, b07.atomSeals, b07.detail),
  );

  const b08 = runForgeStrategistReplanBlockGate();
  blockSeals.push(
    sealBlockGate("P03-B08", "Replan ve plan repair", "runForgeStrategistReplanBlockGate", b08.passed, b08.atomSeals, b08.detail),
  );

  const b09 = runForgeStrategistProvenanceBlockGate();
  blockSeals.push(
    sealBlockGate("P03-B09", "Plan provenance ve drift", "runForgeStrategistProvenanceBlockGate", b09.passed, b09.atomSeals, b09.detail),
  );

  const b10 = runForgeStrategistPhaseGateBlockGate();
  blockSeals.push(
    sealBlockGate("P03-B10", "Stratejist phase gate", "runForgeStrategistPhaseGateBlockGate", b10.passed, b10.atomSeals, b10.detail),
  );

  const regression = runForgeStrategistPhaseGateRegressionGate();
  const handoffValid = b10.passed && b10.evidence.handoffValid;

  const evidence = buildP03StrategistPhaseGateEvidence(
    blockSeals,
    regression.passed,
    handoffValid,
    resolveGitCommit(),
  );

  const validation = validateForgeP03StrategistPhaseGateEvidence(evidence, handoff);
  const allBlocksPass = blockSeals.every(seal => seal.passed);
  const atomCountOk = evidence.atomSealsPassed === P03_STRATEGIST_PHASE_ATOM_COUNT;
  const passed = allBlocksPass && atomCountOk && regression.passed && handoffValid && validation.valid;

  const detailParts = [
    `phase=${handoff.sourcePhase.phaseId}`,
    `blocks=${evidence.blockGatesPassed}/${P03_STRATEGIST_PHASE_BLOCK_COUNT}`,
    `atoms=${evidence.atomSealsPassed}/${P03_STRATEGIST_PHASE_ATOM_COUNT}`,
    `regression=${regression.passed ? "PASS" : "FAIL"}`,
    `handoff=${handoffValid ? "PASS" : "FAIL"}→${handoff.targetPhase.entryBlock}`,
    `validation=${validation.valid ? "PASS" : "FAIL"}`,
  ];

  return {
    passed,
    evidence,
    handoff,
    detail: detailParts.join(" | "),
  };
}
