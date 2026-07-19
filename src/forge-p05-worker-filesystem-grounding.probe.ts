/**
 * FOREMAN — Worker Filesystem Grounding Probe Harness (P05-B02-A08 regression, P05-B02-A09 guard)
 *
 * Forge pipeline regression gate for worker filesystem grounding probe matrix.
 */

import {
  runWorkerFilesystemGroundingIntegrationSlice,
  runWorkerFilesystemGroundingGuardSlice,
  type WorkerFilesystemGroundingIntegrationSliceResult,
  type WorkerFilesystemGroundingGuardSliceResult,
  type WorkerFilesystemGroundingRunRecord,
  detectWorkerFilesystemGroundingProbeRegression,
  runWorkerFilesystemGroundingProbesWithRecord,
} from "./forge-p05-worker-filesystem-grounding.js";

export {
  runWorkerFilesystemGroundingProbesWithRecord,
  detectWorkerFilesystemGroundingProbeRegression,
  runWorkerFilesystemGroundingIntegrationSlice,
  runWorkerFilesystemGroundingGuardSlice,
} from "./forge-p05-worker-filesystem-grounding.js";

export type ForgeWorkerFilesystemGroundingRegressionGateResult =
  WorkerFilesystemGroundingIntegrationSliceResult;
export type ForgeWorkerFilesystemGroundingGuardGateResult =
  WorkerFilesystemGroundingGuardSliceResult;

/**
 * Worker filesystem grounding regression gate on canonical probe matrix (P05-B02-A08).
 */
export function runForgeWorkerFilesystemGroundingRegressionGate(
  priorRecord?: WorkerFilesystemGroundingRunRecord,
): ForgeWorkerFilesystemGroundingRegressionGateResult {
  return runWorkerFilesystemGroundingIntegrationSlice(priorRecord);
}

/**
 * Worker filesystem grounding guard gate — adversarial/perf/cost/safety (P05-B02-A09).
 */
export function runForgeWorkerFilesystemGroundingGuardGate(): ForgeWorkerFilesystemGroundingGuardGateResult {
  return runWorkerFilesystemGroundingGuardSlice();
}

/** Alias for forge-pipeline-regression integration seam (P05-B02-A08). */
export const runWorkerFilesystemGroundingRegressionIntegration =
  runForgeWorkerFilesystemGroundingRegressionGate;
