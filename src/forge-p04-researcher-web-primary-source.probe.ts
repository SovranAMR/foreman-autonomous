/**
 * FOREMAN — Researcher Web Primary-Source Probe Harness (P04-B03-A08 regression)
 *
 * Forge pipeline regression gate for web and primary-source research probe matrix.
 */

import {
  runResearcherWebPrimarySourceForgeRegression,
  type ResearcherWebPrimarySourceForgeRegressionResult,
  type ResearcherWebPrimarySourceRunRecord,
  detectResearcherWebPrimarySourceProbeRegression,
  runResearcherWebPrimarySourceProbesWithRecord,
} from "./forge-p04-researcher-web-primary-source.js";

export {
  detectResearcherWebPrimarySourceProbeRegression,
  runResearcherWebPrimarySourceProbesWithRecord,
} from "./forge-p04-researcher-web-primary-source.js";

export type ForgeResearcherWebPrimarySourceRegressionGateResult =
  ResearcherWebPrimarySourceForgeRegressionResult;

/**
 * Web primary-source regression gate on canonical probe matrix (P04-B03-A08).
 */
export function runForgeResearcherWebPrimarySourceRegressionGate(
  priorRecord?: ResearcherWebPrimarySourceRunRecord,
): ForgeResearcherWebPrimarySourceRegressionGateResult {
  return runResearcherWebPrimarySourceForgeRegression(priorRecord);
}

/** Alias for forge-pipeline-regression integration seam (P04-B03-A08). */
export const runResearcherWebPrimarySourceRegressionIntegration =
  runForgeResearcherWebPrimarySourceRegressionGate;
