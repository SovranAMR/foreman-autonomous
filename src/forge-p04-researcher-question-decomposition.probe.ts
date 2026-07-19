/**
 * FOREMAN — Researcher Question Decomposition Probe Harness (P04-B01-A08 regression)
 *
 * Forge pipeline regression gate for question decomposition probe matrix.
 */

import {
  runResearcherQuestionDecompositionForgeRegression,
  type ResearcherQuestionDecompositionForgeRegressionResult,
  type ResearcherQuestionDecompositionRunRecord,
} from "./forge-p04-researcher-question-decomposition.js";

export {
  runResearcherQuestionDecompositionProbesWithRecord,
  detectResearcherQuestionDecompositionProbeRegression,
} from "./forge-p04-researcher-question-decomposition.js";

export type ForgeResearcherQuestionDecompositionRegressionGateResult =
  ResearcherQuestionDecompositionForgeRegressionResult;

/**
 * Question decomposition regression gate on canonical probe matrix (P04-B01-A08).
 */
export function runForgeResearcherQuestionDecompositionRegressionGate(
  priorRecord?: ResearcherQuestionDecompositionRunRecord,
): ForgeResearcherQuestionDecompositionRegressionGateResult {
  return runResearcherQuestionDecompositionForgeRegression(priorRecord);
}

/** Alias for forge-pipeline-regression integration seam (P04-B01-A08). */
export const runResearcherQuestionDecompositionRegressionIntegration =
  runForgeResearcherQuestionDecompositionRegressionGate;
