/**
 * FOREMAN — Researcher In-Repo Evidence Probe Harness (P04-B02-A08 regression)
 *
 * Forge pipeline regression gate for in-repo evidence collection probe matrix.
 */

import {
  runResearcherInRepoEvidenceForgeRegression,
  type ResearcherInRepoEvidenceForgeRegressionResult,
  type ResearcherInRepoEvidenceRunRecord,
  detectResearcherInRepoEvidenceProbeRegression,
  runResearcherInRepoEvidenceProbesWithRecord,
} from "./forge-p04-researcher-in-repo-evidence.js";

export {
  detectResearcherInRepoEvidenceProbeRegression,
  runResearcherInRepoEvidenceProbesWithRecord,
} from "./forge-p04-researcher-in-repo-evidence.js";

export type ForgeResearcherInRepoEvidenceRegressionGateResult =
  ResearcherInRepoEvidenceForgeRegressionResult;

/**
 * In-repo evidence regression gate on canonical probe matrix (P04-B02-A08).
 */
export function runForgeResearcherInRepoEvidenceRegressionGate(
  priorRecord?: ResearcherInRepoEvidenceRunRecord,
): ForgeResearcherInRepoEvidenceRegressionGateResult {
  return runResearcherInRepoEvidenceForgeRegression(priorRecord);
}

/** Alias for forge-pipeline-regression integration seam (P04-B02-A08). */
export const runResearcherInRepoEvidenceRegressionIntegration =
  runForgeResearcherInRepoEvidenceRegressionGate;
