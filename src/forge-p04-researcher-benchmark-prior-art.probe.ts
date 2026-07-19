/**
 * FOREMAN — Researcher Benchmark Prior-Art Probe Harness (P04-B04-A08 regression)
 *
 * Forge pipeline regression gate for benchmark prior-art analysis probe matrix.
 */

import {
  runResearcherBenchmarkPriorArtForgeRegression,
  type ResearcherBenchmarkPriorArtForgeRegressionResult,
  type ResearcherBenchmarkPriorArtRunRecord,
  detectResearcherBenchmarkPriorArtProbeRegression,
  runResearcherBenchmarkPriorArtProbesWithRecord,
} from "./forge-p04-researcher-benchmark-prior-art.js";

export {
  detectResearcherBenchmarkPriorArtProbeRegression,
  runResearcherBenchmarkPriorArtProbesWithRecord,
} from "./forge-p04-researcher-benchmark-prior-art.js";

export type ForgeResearcherBenchmarkPriorArtRegressionGateResult =
  ResearcherBenchmarkPriorArtForgeRegressionResult;

/**
 * Benchmark prior-art regression gate on canonical probe matrix (P04-B04-A08).
 */
export function runForgeResearcherBenchmarkPriorArtRegressionGate(
  priorRecord?: ResearcherBenchmarkPriorArtRunRecord,
): ForgeResearcherBenchmarkPriorArtRegressionGateResult {
  return runResearcherBenchmarkPriorArtForgeRegression(priorRecord);
}

/** Alias for forge-pipeline-regression integration seam (P04-B04-A08). */
export const runResearcherBenchmarkPriorArtRegressionIntegration =
  runForgeResearcherBenchmarkPriorArtRegressionGate;
