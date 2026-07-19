/**
 * FOREMAN — Researcher Question Decomposition Probe Harness (P04-B01-A08 regression)
 *
 * Forge pipeline regression gate for question decomposition probe matrix.
 */

import {
  runResearcherQuestionDecompositionForgeRegression,
  type ResearcherQuestionDecompositionForgeRegressionResult,
  type ResearcherQuestionDecompositionRunRecord,
  loadResearcherQuestionDecompositionBaseline,
  validateResearcherQuestionDecompositionBaseline,
  validateResearcherQuestionDecompositionAgainstContract,
  getActiveResearcherQuestionDecompositionContract,
  summarizeResearcherQuestionDecompositionContractCoverage,
  runResearcherQuestionDecompositionProductionSlice,
  runResearcherQuestionDecompositionBoundarySlice,
  runResearcherQuestionDecompositionFailureRecoverySlice,
  runResearcherQuestionDecompositionEvidenceSlice,
  runResearcherQuestionDecompositionPropertyFuzzSlice,
  listResearcherQuestionDecompositionProbesByDisposition,
  RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES,
  getForgeP04B01BlockGate,
  getForgeP04B01ToB02Handoff,
  validateResearcherQuestionDecompositionBlockHandoffContract,
  buildResearcherQuestionDecompositionBlockGateEvidence,
  type ResearcherQuestionDecompositionBlockGateEvidence,
  type ResearcherQuestionDecompositionBlockHandoffContract,
} from "./forge-p04-researcher-question-decomposition.js";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import { execSync } from "node:child_process";

export {
  runResearcherQuestionDecompositionProbesWithRecord,
  detectResearcherQuestionDecompositionProbeRegression,
  getForgeP04B01BlockGate,
  getForgeP04B01ToB02Handoff,
  validateResearcherQuestionDecompositionBlockHandoffContract,
  buildResearcherQuestionDecompositionBlockGateEvidence,
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

export interface ForgeResearcherQuestionDecompositionBlockGateResult {
  passed: boolean;
  evidence: ResearcherQuestionDecompositionBlockGateEvidence;
  handoff: ResearcherQuestionDecompositionBlockHandoffContract;
  regression: ForgeResearcherQuestionDecompositionRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealResearcherQuestionDecompositionBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P04-B01 block gate: validate A01–A09 deliverables, regression, guard, and B02 handoff (P04-B01-A10).
 */
export function runResearcherQuestionDecompositionBlockGate(): ForgeResearcherQuestionDecompositionBlockGateResult {
  const blockGate = getForgeP04B01BlockGate();
  const handoff = getForgeP04B01ToB02Handoff();
  const contract = getActiveResearcherQuestionDecompositionContract();
  const fixture = loadResearcherQuestionDecompositionBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateResearcherQuestionDecompositionBaseline(fixture);
  const contractValidation = validateResearcherQuestionDecompositionAgainstContract(fixture, contract);
  atomSeals.push(
    sealResearcherQuestionDecompositionBlockAtom(
      "P04-B01-A01",
      "question_decomposition_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeResearcherQuestionDecompositionContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeResearcherQuestionDecompositionContractCoverage(contract);
  atomSeals.push(
    sealResearcherQuestionDecompositionBlockAtom(
      "P04-B01-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runResearcherQuestionDecompositionProductionSlice(fixture);
  atomSeals.push(
    sealResearcherQuestionDecompositionBlockAtom(
      "P04-B01-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runResearcherQuestionDecompositionBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealResearcherQuestionDecompositionBlockAtom(
      "P04-B01-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const failureRecoverySlice = runResearcherQuestionDecompositionFailureRecoverySlice(fixture);
  const nogoProbes = listResearcherQuestionDecompositionProbesByDisposition("nogo", contract);
  atomSeals.push(
    sealResearcherQuestionDecompositionBlockAtom(
      "P04-B01-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoProbes.length} NO-GO probes`,
    ),
  );

  const regression = runForgeResearcherQuestionDecompositionRegressionGate();
  const evidenceSlice = runResearcherQuestionDecompositionEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealResearcherQuestionDecompositionBlockAtom(
      "P04-B01-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const propertyFuzzSlice = runResearcherQuestionDecompositionPropertyFuzzSlice(fixture);
  const fuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;
  atomSeals.push(
    sealResearcherQuestionDecompositionBlockAtom(
      "P04-B01-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${propertyFuzzSlice.propertyResult.passed}/${propertyFuzzSlice.propertyResult.total} contractFuzz rejected=${propertyFuzzSlice.contractFuzz.rejected}/${propertyFuzzSlice.contractFuzz.iterations} runFuzz rejected=${propertyFuzzSlice.runRecordFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealResearcherQuestionDecompositionBlockAtom(
      "P04-B01-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealResearcherQuestionDecompositionBlockAtom(
      "P04-B01-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateResearcherQuestionDecompositionBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealResearcherQuestionDecompositionBlockAtom(
      "P04-B01-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildResearcherQuestionDecompositionBlockGateEvidence(
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
export const runForgeResearcherQuestionDecompositionBlockGate =
  runResearcherQuestionDecompositionBlockGate;
