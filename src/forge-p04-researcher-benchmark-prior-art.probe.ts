/**
 * FOREMAN — Researcher Benchmark Prior-Art Probe Harness (P04-B04-A08 regression, P04-B04-A10 block gate)
 *
 * Forge pipeline regression gate for benchmark prior-art analysis probe matrix.
 */

import {
  runResearcherBenchmarkPriorArtForgeRegression,
  type ResearcherBenchmarkPriorArtForgeRegressionResult,
  type ResearcherBenchmarkPriorArtRunRecord,
  detectResearcherBenchmarkPriorArtProbeRegression,
  runResearcherBenchmarkPriorArtProbesWithRecord,
  loadResearcherBenchmarkPriorArtBaseline,
  validateResearcherBenchmarkPriorArtBaseline,
  validateResearcherBenchmarkPriorArtAgainstContract,
  getActiveResearcherBenchmarkPriorArtContract,
  summarizeResearcherBenchmarkPriorArtContractCoverage,
  runResearcherBenchmarkPriorArtProductionSlice,
  runResearcherBenchmarkPriorArtBoundarySlice,
  runResearcherBenchmarkPriorArtFailureRecoverySlice,
  runResearcherBenchmarkPriorArtEvidenceSlice,
  runResearcherBenchmarkPriorArtPropertyFuzzSlice,
  listResearcherBenchmarkPriorArtProbesByDisposition,
  RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES,
  getForgeP04B04BlockGate,
  getForgeP04B04ToB05Handoff,
  validateResearcherBenchmarkPriorArtBlockHandoffContract,
  buildResearcherBenchmarkPriorArtBlockGateEvidence,
  type ResearcherBenchmarkPriorArtBlockGateEvidence,
  type ResearcherBenchmarkPriorArtBlockHandoffContract,
} from "./forge-p04-researcher-benchmark-prior-art.js";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import { execSync } from "node:child_process";

export {
  detectResearcherBenchmarkPriorArtProbeRegression,
  runResearcherBenchmarkPriorArtProbesWithRecord,
  getForgeP04B04BlockGate,
  getForgeP04B04ToB05Handoff,
  validateResearcherBenchmarkPriorArtBlockHandoffContract,
  buildResearcherBenchmarkPriorArtBlockGateEvidence,
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

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

export interface ForgeResearcherBenchmarkPriorArtBlockGateResult {
  passed: boolean;
  evidence: ResearcherBenchmarkPriorArtBlockGateEvidence;
  handoff: ResearcherBenchmarkPriorArtBlockHandoffContract;
  regression: ForgeResearcherBenchmarkPriorArtRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealResearcherBenchmarkPriorArtBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P04-B04 block gate: validate A01–A09 deliverables, regression, guard, and B05 handoff (P04-B04-A10).
 */
export function runResearcherBenchmarkPriorArtBlockGate(): ForgeResearcherBenchmarkPriorArtBlockGateResult {
  const blockGate = getForgeP04B04BlockGate();
  const handoff = getForgeP04B04ToB05Handoff();
  const contract = getActiveResearcherBenchmarkPriorArtContract();
  const fixture = loadResearcherBenchmarkPriorArtBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateResearcherBenchmarkPriorArtBaseline(fixture);
  const contractValidation = validateResearcherBenchmarkPriorArtAgainstContract(fixture, contract);
  atomSeals.push(
    sealResearcherBenchmarkPriorArtBlockAtom(
      "P04-B04-A01",
      "benchmark_prior_art_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeResearcherBenchmarkPriorArtContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeResearcherBenchmarkPriorArtContractCoverage(contract);
  atomSeals.push(
    sealResearcherBenchmarkPriorArtBlockAtom(
      "P04-B04-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runResearcherBenchmarkPriorArtProductionSlice(fixture);
  atomSeals.push(
    sealResearcherBenchmarkPriorArtBlockAtom(
      "P04-B04-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runResearcherBenchmarkPriorArtBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealResearcherBenchmarkPriorArtBlockAtom(
      "P04-B04-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const failureRecoverySlice = runResearcherBenchmarkPriorArtFailureRecoverySlice(fixture);
  const nogoProbes = listResearcherBenchmarkPriorArtProbesByDisposition("nogo", contract);
  atomSeals.push(
    sealResearcherBenchmarkPriorArtBlockAtom(
      "P04-B04-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoProbes.length} NO-GO probes`,
    ),
  );

  const regression = runForgeResearcherBenchmarkPriorArtRegressionGate();
  const evidenceSlice = runResearcherBenchmarkPriorArtEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealResearcherBenchmarkPriorArtBlockAtom(
      "P04-B04-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const propertyFuzzSlice = runResearcherBenchmarkPriorArtPropertyFuzzSlice(fixture);
  const fuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;
  atomSeals.push(
    sealResearcherBenchmarkPriorArtBlockAtom(
      "P04-B04-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${propertyFuzzSlice.propertyResult.passed}/${propertyFuzzSlice.propertyResult.total} contractFuzz rejected=${propertyFuzzSlice.contractFuzz.rejected}/${propertyFuzzSlice.contractFuzz.iterations} runFuzz rejected=${propertyFuzzSlice.runRecordFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealResearcherBenchmarkPriorArtBlockAtom(
      "P04-B04-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealResearcherBenchmarkPriorArtBlockAtom(
      "P04-B04-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateResearcherBenchmarkPriorArtBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealResearcherBenchmarkPriorArtBlockAtom(
      "P04-B04-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildResearcherBenchmarkPriorArtBlockGateEvidence(
    atomSeals,
    regression.passed,
    regression.guard.passed,
    regression.record.summary.total,
    resolveGitCommit(),
  );

  const detailParts = [
    `block=${blockGate.blockId} seals=${atomSeals.filter(s => s.passed).length}/${atomSeals.length}`,
    `regression=${regression.passed ? "PASS" : "FAIL"}`,
    `guard=${regression.guard.passed ? "PASS" : "FAIL"}`,
    `handoff=${evidence.handoffValid ? "PASS" : "FAIL"}→${handoff.targetBlock.blockId}`,
  ];

  return {
    passed: blockGatePass && evidence.handoffValid,
    evidence,
    handoff,
    regression,
    atomSeals,
    detail: detailParts.join(" | "),
  };
}

/** Alias matching ACTIVE_FRONT target name. */
export const runForgeResearcherBenchmarkPriorArtBlockGate = runResearcherBenchmarkPriorArtBlockGate;
