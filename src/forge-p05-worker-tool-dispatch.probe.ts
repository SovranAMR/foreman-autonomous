/**
 * FOREMAN — Worker Tool Dispatch Probe Harness (P05-B01-A08 regression, A09 guard)
 *
 * Forge pipeline regression gate for worker tool dispatch probe matrix.
 */

import {
  runWorkerToolDispatchIntegrationSlice,
  runWorkerToolDispatchGuardSlice,
  type WorkerToolDispatchIntegrationSliceResult,
  type WorkerToolDispatchGuardSliceResult,
  type WorkerToolDispatchRunRecord,
  detectWorkerToolDispatchProbeRegression,
  runWorkerToolDispatchProbesWithRecord,
} from "./forge-p05-worker-tool-dispatch.js";

export {
  runWorkerToolDispatchProbesWithRecord,
  detectWorkerToolDispatchProbeRegression,
  runWorkerToolDispatchIntegrationSlice,
  runWorkerToolDispatchGuardSlice,
} from "./forge-p05-worker-tool-dispatch.js";

export type ForgeWorkerToolDispatchRegressionGateResult = WorkerToolDispatchIntegrationSliceResult;
export type ForgeWorkerToolDispatchGuardGateResult = WorkerToolDispatchGuardSliceResult;

/**
 * Worker tool dispatch regression gate on canonical probe matrix (P05-B01-A08).
 */
export function runForgeWorkerToolDispatchRegressionGate(
  priorRecord?: WorkerToolDispatchRunRecord,
): ForgeWorkerToolDispatchRegressionGateResult {
  return runWorkerToolDispatchIntegrationSlice(priorRecord);
}

/**
 * Worker tool dispatch guard gate — adversarial/perf/cost/safety (P05-B01-A09).
 */
export function runForgeWorkerToolDispatchGuardGate(): ForgeWorkerToolDispatchGuardGateResult {
  return runWorkerToolDispatchGuardSlice();
}

/** Alias for forge-pipeline-regression integration seam (P05-B01-A08). */
export const runWorkerToolDispatchRegressionIntegration =
  runForgeWorkerToolDispatchRegressionGate;
