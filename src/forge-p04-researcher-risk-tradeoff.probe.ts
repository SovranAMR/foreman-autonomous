/**
 * FOREMAN — Researcher Risk Trade-off Probe Harness (P04-B07-A08 regression)
 *
 * Forge pipeline regression gate for risk and trade-off research probe matrix.
 */

import {
  runResearcherRiskTradeoffForgeRegression,
  type ResearcherRiskTradeoffForgeRegressionResult,
  type ResearcherRiskTradeoffRunRecord,
  detectResearcherRiskTradeoffProbeRegression,
  runResearcherRiskTradeoffProbesWithRecord,
} from "./forge-p04-researcher-risk-tradeoff.js";

export {
  detectResearcherRiskTradeoffProbeRegression,
  runResearcherRiskTradeoffProbesWithRecord,
} from "./forge-p04-researcher-risk-tradeoff.js";

export type ForgeResearcherRiskTradeoffRegressionGateResult =
  ResearcherRiskTradeoffForgeRegressionResult;

/**
 * Risk trade-off regression gate on canonical probe matrix (P04-B07-A08).
 */
export function runForgeResearcherRiskTradeoffRegressionGate(
  priorRecord?: ResearcherRiskTradeoffRunRecord,
): ForgeResearcherRiskTradeoffRegressionGateResult {
  return runResearcherRiskTradeoffForgeRegression(priorRecord);
}

/** Alias for forge-pipeline-regression integration seam (P04-B07-A08). */
export const runResearcherRiskTradeoffRegressionIntegration =
  runForgeResearcherRiskTradeoffRegressionGate;
