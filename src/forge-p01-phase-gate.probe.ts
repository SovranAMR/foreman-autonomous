/**
 * FOREMAN — P01 Phase Gate Probe Harness
 *
 * Runs all ten P01 block gates, integrated regression, and seals P01→P02 phase handoff.
 */

import { execSync } from "node:child_process";
import { runForgeBaselineBlockGate } from "./forge-baseline-harness.js";
import { runForgeBehaviorMapBlockGate } from "./forge-pipeline-behavior-map-harness.js";
import { runForgeFormalStateMachineBlockGate } from "./forge-formal-state-machine-harness.js";
import { runForgePhaseEventSchemaBlockGate } from "./forge-phase-event-schema-harness.js";
import { runForgePipelineInvariantEngineBlockGate } from "./forge-pipeline-invariant-engine-harness.js";
import { runForgeBenchmarkEvalBlockGate } from "./forge-benchmark-eval-harness.probe.js";
import { runReproducibleFixtureBlockGate } from "./forge-reproducible-fixture.probe.js";
import { runEvidenceArtifactBlockGate } from "./forge-evidence-artifact.probe.js";
import { runOrchestratorSeamBlockGate } from "./forge-orchestrator-seam.probe.js";
import {
  runIntegratedBaselineBlockGate,
  runForgeIntegratedBaselineRegressionGate,
} from "./forge-integrated-baseline.probe.js";
import {
  P01_PHASE_BLOCK_COUNT,
  P01_PHASE_ATOM_COUNT,
  buildP01PhaseGateEvidence,
  countPassedAtomSeals,
  getForgeP01ToP02PhaseHandoff,
  validateForgeP01PhaseGateEvidence,
  type P01BlockGateSeal,
  type P01PhaseGateEvidence,
  type P01PhaseHandoffContract,
} from "./forge-p01-phase-gate.js";

export type {
  P01BlockGateSeal,
  P01PhaseGateEvidence,
  P01PhaseHandoffContract,
} from "./forge-p01-phase-gate.js";

export {
  FORGE_P01_PHASE_GATE_VERSION,
  P01_PHASE_BLOCK_INVENTORY,
  P01_PHASE_BLOCK_COUNT,
  P01_PHASE_ATOM_COUNT,
  P01_PHASE_GATE_CHECKS,
  FORGE_P01_TO_P02_PHASE_HANDOFF_V1,
  getForgeP01ToP02PhaseHandoff,
  buildP01PhaseGateEvidence,
  validateForgeP01PhaseGateEvidence,
  validateP01PhaseHandoffContract,
} from "./forge-p01-phase-gate.js";

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

function sealBlockGate(
  blockId: string,
  title: string,
  runner: string,
  passed: boolean,
  atomSeals: readonly { passed: boolean }[],
  detail: string,
): P01BlockGateSeal {
  return {
    blockId,
    title,
    runner,
    passed,
    atomSealCount: countPassedAtomSeals(atomSeals),
    detail,
  };
}

export interface ForgeP01PhaseGateResult {
  passed: boolean;
  evidence: P01PhaseGateEvidence;
  handoff: P01PhaseHandoffContract;
  detail: string;
}

/**
 * Seal P01 phase gate: all block gates, integrated regression, and P02 phase handoff.
 */
export async function runForgeP01PhaseGate(): Promise<ForgeP01PhaseGateResult> {
  const handoff = getForgeP01ToP02PhaseHandoff();
  const blockSeals: P01BlockGateSeal[] = [];

  const b01 = await runForgeBaselineBlockGate();
  blockSeals.push(
    sealBlockGate("P01-B01", "Mission ve acceptance contract", "runForgeBaselineBlockGate", b01.passed, b01.atomSeals, b01.detail),
  );

  const b02 = runForgeBehaviorMapBlockGate();
  blockSeals.push(
    sealBlockGate("P01-B02", "Mevcut pipeline davranış haritası", "runForgeBehaviorMapBlockGate", b02.passed, b02.atomSeals, b02.detail),
  );

  const b03 = runForgeFormalStateMachineBlockGate();
  blockSeals.push(
    sealBlockGate("P01-B03", "Formal state machine", "runForgeFormalStateMachineBlockGate", b03.passed, b03.atomSeals, b03.detail),
  );

  const b04 = runForgePhaseEventSchemaBlockGate();
  blockSeals.push(
    sealBlockGate("P01-B04", "Typed phase/event schema", "runForgePhaseEventSchemaBlockGate", b04.passed, b04.atomSeals, b04.detail),
  );

  const b05 = runForgePipelineInvariantEngineBlockGate();
  blockSeals.push(
    sealBlockGate("P01-B05", "Pipeline invariant engine", "runForgePipelineInvariantEngineBlockGate", b05.passed, b05.atomSeals, b05.detail),
  );

  const b06 = runForgeBenchmarkEvalBlockGate();
  blockSeals.push(
    sealBlockGate("P01-B06", "Benchmark ve eval harness", "runForgeBenchmarkEvalBlockGate", b06.passed, b06.atomSeals, b06.detail),
  );

  const b07 = runReproducibleFixtureBlockGate();
  blockSeals.push(
    sealBlockGate("P01-B07", "Reproducible fixture sistemi", "runReproducibleFixtureBlockGate", b07.passed, b07.atomSeals, b07.detail),
  );

  const b08 = runEvidenceArtifactBlockGate();
  blockSeals.push(
    sealBlockGate("P01-B08", "Evidence ve artifact şeması", "runEvidenceArtifactBlockGate", b08.passed, b08.atomSeals, b08.detail),
  );

  const b09 = runOrchestratorSeamBlockGate();
  blockSeals.push(
    sealBlockGate("P01-B09", "Orchestrator seam ve modülerleşme", "runOrchestratorSeamBlockGate", b09.passed, b09.atomSeals, b09.detail),
  );

  const b10 = runIntegratedBaselineBlockGate();
  blockSeals.push(
    sealBlockGate("P01-B10", "Entegre Forge baseline gate", "runIntegratedBaselineBlockGate", b10.passed, b10.atomSeals, b10.detail),
  );

  const regression = runForgeIntegratedBaselineRegressionGate();
  const handoffValid = b10.passed && b10.evidence.handoffValid;

  const evidence = buildP01PhaseGateEvidence(
    blockSeals,
    regression.passed,
    handoffValid,
    resolveGitCommit(),
  );

  const validation = validateForgeP01PhaseGateEvidence(evidence, handoff);
  const allBlocksPass = blockSeals.every(seal => seal.passed);
  const atomCountOk = evidence.atomSealsPassed === P01_PHASE_ATOM_COUNT;
  const passed = allBlocksPass && atomCountOk && regression.passed && handoffValid && validation.valid;

  const detailParts = [
    `phase=${handoff.sourcePhase.phaseId}`,
    `blocks=${evidence.blockGatesPassed}/${P01_PHASE_BLOCK_COUNT}`,
    `atoms=${evidence.atomSealsPassed}/${P01_PHASE_ATOM_COUNT}`,
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
