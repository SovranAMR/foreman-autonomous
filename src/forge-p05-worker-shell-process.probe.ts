/**
 * FOREMAN — Worker Shell Process Probe Harness (P05-B04-A08 regression, P05-B04-A09 guard, P05-B04-A10 block gate)
 *
 * Forge pipeline regression gate for worker shell process probe matrix.
 */

import {
  runWorkerShellProcessIntegrationSlice,
  runWorkerShellProcessGuardSlice,
  type WorkerShellProcessIntegrationSliceResult,
  type WorkerShellProcessGuardSliceResult,
  type WorkerShellProcessRunRecord,
  detectWorkerShellProcessProbeRegression,
  runWorkerShellProcessProbesWithRecord,
} from "./forge-p05-worker-shell-process.js";

export {
  runWorkerShellProcessProbesWithRecord,
  detectWorkerShellProcessProbeRegression,
  runWorkerShellProcessIntegrationSlice,
  runWorkerShellProcessGuardSlice,
} from "./forge-p05-worker-shell-process.js";

export type ForgeWorkerShellProcessRegressionGateResult = WorkerShellProcessIntegrationSliceResult;
export type ForgeWorkerShellProcessGuardGateResult = WorkerShellProcessGuardSliceResult;

/**
 * Worker shell process regression gate on canonical probe matrix (P05-B04-A08).
 */
export function runForgeWorkerShellProcessRegressionGate(
  priorRecord?: WorkerShellProcessRunRecord,
): ForgeWorkerShellProcessRegressionGateResult {
  return runWorkerShellProcessIntegrationSlice(priorRecord);
}

/**
 * Worker shell process guard gate — adversarial/perf/cost/safety (P05-B04-A09).
 */
export function runForgeWorkerShellProcessGuardGate(): ForgeWorkerShellProcessGuardGateResult {
  return runWorkerShellProcessGuardSlice();
}

/** Alias for forge-pipeline-regression integration seam (P05-B04-A08). */
export const runWorkerShellProcessRegressionIntegration = runForgeWorkerShellProcessRegressionGate;
