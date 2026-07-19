/**
 * FOREMAN — Researcher Research-to-Worker Handoff Probe Harness (P04-B09-A08 regression)
 *
 * Forge pipeline regression gate for research-to-worker handoff probe matrix.
 */

import {
  runResearcherResearchToWorkerHandoffForgeRegression,
  type ResearcherResearchToWorkerHandoffForgeRegressionResult,
  type ResearcherResearchToWorkerHandoffRunRecord,
  detectResearcherResearchToWorkerHandoffProbeRegression,
  runResearcherResearchToWorkerHandoffProbesWithRecord,
} from "./forge-p04-researcher-research-to-worker-handoff.js";

export {
  detectResearcherResearchToWorkerHandoffProbeRegression,
  runResearcherResearchToWorkerHandoffProbesWithRecord,
} from "./forge-p04-researcher-research-to-worker-handoff.js";

export type ForgeResearcherResearchToWorkerHandoffRegressionGateResult =
  ResearcherResearchToWorkerHandoffForgeRegressionResult;

/**
 * Research-to-worker handoff regression gate on canonical probe matrix (P04-B09-A08).
 */
export function runForgeResearcherResearchToWorkerHandoffRegressionGate(
  priorRecord?: ResearcherResearchToWorkerHandoffRunRecord,
): ForgeResearcherResearchToWorkerHandoffRegressionGateResult {
  return runResearcherResearchToWorkerHandoffForgeRegression(priorRecord);
}

/** Alias for forge-pipeline-regression integration seam (P04-B09-A08). */
export const runResearcherResearchToWorkerHandoffRegressionIntegration =
  runForgeResearcherResearchToWorkerHandoffRegressionGate;
