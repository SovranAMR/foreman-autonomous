/**
 * FOREMAN — Worker Tool Dispatch Probe Harness (P05-B01-A08 regression)
 *
 * Forge pipeline regression gate for worker tool dispatch probe matrix.
 */

import {
  runWorkerToolDispatchIntegrationSlice,
  type WorkerToolDispatchIntegrationSliceResult,
  type WorkerToolDispatchRunRecord,
  detectWorkerToolDispatchProbeRegression,
  runWorkerToolDispatchProbesWithRecord,
} from "./forge-p05-worker-tool-dispatch.js";

export {
  runWorkerToolDispatchProbesWithRecord,
  detectWorkerToolDispatchProbeRegression,
  runWorkerToolDispatchIntegrationSlice,
} from "./forge-p05-worker-tool-dispatch.js";

export type ForgeWorkerToolDispatchRegressionGateResult = WorkerToolDispatchIntegrationSliceResult;

/**
 * Worker tool dispatch regression gate on canonical probe matrix (P05-B01-A08).
 */
export function runForgeWorkerToolDispatchRegressionGate(
  priorRecord?: WorkerToolDispatchRunRecord,
): ForgeWorkerToolDispatchRegressionGateResult {
  return runWorkerToolDispatchIntegrationSlice(priorRecord);
}

/** Alias for forge-pipeline-regression integration seam (P05-B01-A08). */
export const runWorkerToolDispatchRegressionIntegration =
  runForgeWorkerToolDispatchRegressionGate;
