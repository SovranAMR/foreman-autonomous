/**
 * FOREMAN — Researcher Spike Falsification Probe Harness (P04-B08-A08 regression)
 *
 * Forge pipeline regression gate for spike falsification probe matrix.
 */

import {
  runResearcherSpikeFalsificationForgeRegression,
  type ResearcherSpikeFalsificationForgeRegressionResult,
  type ResearcherSpikeFalsificationRunRecord,
  detectResearcherSpikeFalsificationProbeRegression,
  runResearcherSpikeFalsificationProbesWithRecord,
} from "./forge-p04-researcher-spike-falsification.js";

export {
  detectResearcherSpikeFalsificationProbeRegression,
  runResearcherSpikeFalsificationProbesWithRecord,
} from "./forge-p04-researcher-spike-falsification.js";

export type ForgeResearcherSpikeFalsificationRegressionGateResult =
  ResearcherSpikeFalsificationForgeRegressionResult;

/**
 * Spike falsification regression gate on canonical probe matrix (P04-B08-A08).
 */
export function runForgeResearcherSpikeFalsificationRegressionGate(
  priorRecord?: ResearcherSpikeFalsificationRunRecord,
): ForgeResearcherSpikeFalsificationRegressionGateResult {
  return runResearcherSpikeFalsificationForgeRegression(priorRecord);
}

/** Alias for forge-pipeline-regression integration seam (P04-B08-A08). */
export const runResearcherSpikeFalsificationRegressionIntegration =
  runForgeResearcherSpikeFalsificationRegressionGate;
