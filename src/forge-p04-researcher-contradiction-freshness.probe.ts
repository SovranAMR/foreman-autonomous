/**
 * FOREMAN — Researcher Contradiction Freshness Probe Harness (P04-B06-A08 regression)
 *
 * Forge pipeline regression gate for contradiction freshness probe matrix.
 */

import {
  runResearcherContradictionFreshnessForgeRegression,
  type ResearcherContradictionFreshnessForgeRegressionResult,
  type ResearcherContradictionFreshnessRunRecord,
  detectResearcherContradictionFreshnessProbeRegression,
  runResearcherContradictionFreshnessProbesWithRecord,
} from "./forge-p04-researcher-contradiction-freshness.js";

export {
  detectResearcherContradictionFreshnessProbeRegression,
  runResearcherContradictionFreshnessProbesWithRecord,
} from "./forge-p04-researcher-contradiction-freshness.js";

export type ForgeResearcherContradictionFreshnessRegressionGateResult =
  ResearcherContradictionFreshnessForgeRegressionResult;

/**
 * Contradiction freshness regression gate on canonical probe matrix (P04-B06-A08).
 */
export function runForgeResearcherContradictionFreshnessRegressionGate(
  priorRecord?: ResearcherContradictionFreshnessRunRecord,
): ForgeResearcherContradictionFreshnessRegressionGateResult {
  return runResearcherContradictionFreshnessForgeRegression(priorRecord);
}

/** Alias for forge-pipeline-regression integration seam (P04-B06-A08). */
export const runResearcherContradictionFreshnessRegressionIntegration =
  runForgeResearcherContradictionFreshnessRegressionGate;
