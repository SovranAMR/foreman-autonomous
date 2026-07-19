/**
 * FOREMAN — Worker Filesystem Grounding Probe Harness (P05-B02-A08 regression)
 *
 * Forge pipeline regression gate for worker filesystem grounding probe matrix.
 */

import {
  runWorkerFilesystemGroundingIntegrationSlice,
  type WorkerFilesystemGroundingIntegrationSliceResult,
  type WorkerFilesystemGroundingRunRecord,
  detectWorkerFilesystemGroundingProbeRegression,
  runWorkerFilesystemGroundingProbesWithRecord,
} from "./forge-p05-worker-filesystem-grounding.js";

export {
  runWorkerFilesystemGroundingProbesWithRecord,
  detectWorkerFilesystemGroundingProbeRegression,
  runWorkerFilesystemGroundingIntegrationSlice,
} from "./forge-p05-worker-filesystem-grounding.js";

export type ForgeWorkerFilesystemGroundingRegressionGateResult =
  WorkerFilesystemGroundingIntegrationSliceResult;

/**
 * Worker filesystem grounding regression gate on canonical probe matrix (P05-B02-A08).
 */
export function runForgeWorkerFilesystemGroundingRegressionGate(
  priorRecord?: WorkerFilesystemGroundingRunRecord,
): ForgeWorkerFilesystemGroundingRegressionGateResult {
  return runWorkerFilesystemGroundingIntegrationSlice(priorRecord);
}

/** Alias for forge-pipeline-regression integration seam (P05-B02-A08). */
export const runWorkerFilesystemGroundingRegressionIntegration =
  runForgeWorkerFilesystemGroundingRegressionGate;
