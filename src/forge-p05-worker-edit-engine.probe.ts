/**
 * FOREMAN — Worker Edit Engine Probe Harness (P05-B03-A08 regression)
 *
 * Forge pipeline regression gate for worker edit engine probe matrix.
 */

import {
  runWorkerEditEngineIntegrationSlice,
  runWorkerEditEngineGuardSlice,
  type WorkerEditEngineIntegrationSliceResult,
  type WorkerEditEngineGuardSliceResult,
  type WorkerEditEngineRunRecord,
  detectWorkerEditEngineProbeRegression,
  runWorkerEditEngineProbesWithRecord,
} from "./forge-p05-worker-edit-engine.js";

export {
  runWorkerEditEngineProbesWithRecord,
  detectWorkerEditEngineProbeRegression,
  runWorkerEditEngineIntegrationSlice,
  runWorkerEditEngineGuardSlice,
} from "./forge-p05-worker-edit-engine.js";

export type ForgeWorkerEditEngineRegressionGateResult = WorkerEditEngineIntegrationSliceResult;
export type ForgeWorkerEditEngineGuardGateResult = WorkerEditEngineGuardSliceResult;

/**
 * Worker edit engine regression gate on canonical probe matrix (P05-B03-A08).
 */
export function runForgeWorkerEditEngineRegressionGate(
  priorRecord?: WorkerEditEngineRunRecord,
): ForgeWorkerEditEngineRegressionGateResult {
  return runWorkerEditEngineIntegrationSlice(priorRecord);
}

/**
 * Worker edit engine guard gate — adversarial/perf/cost/safety (P05-B03-A09).
 */
export function runForgeWorkerEditEngineGuardGate(): ForgeWorkerEditEngineGuardGateResult {
  return runWorkerEditEngineGuardSlice();
}

/** Alias for forge-pipeline-regression integration seam (P05-B03-A08). */
export const runWorkerEditEngineRegressionIntegration = runForgeWorkerEditEngineRegressionGate;
