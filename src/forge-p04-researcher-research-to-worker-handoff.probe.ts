/**
 * FOREMAN — Researcher Research-to-Worker Handoff Probe Harness (P04-B09-A08 regression, P04-B09-A10 block gate)
 *
 * Forge pipeline regression gate for research-to-worker handoff probe matrix.
 */

import {
  runResearcherResearchToWorkerHandoffForgeRegression,
  type ResearcherResearchToWorkerHandoffForgeRegressionResult,
  type ResearcherResearchToWorkerHandoffRunRecord,
  detectResearcherResearchToWorkerHandoffProbeRegression,
  runResearcherResearchToWorkerHandoffProbesWithRecord,
  loadResearcherResearchToWorkerHandoffBaseline,
  validateResearcherResearchToWorkerHandoffBaseline,
  validateResearcherResearchToWorkerHandoffAgainstContract,
  getActiveResearcherResearchToWorkerHandoffContract,
  summarizeResearcherResearchToWorkerHandoffContractCoverage,
  runResearcherResearchToWorkerHandoffProductionSlice,
  runResearcherResearchToWorkerHandoffBoundarySlice,
  runResearcherResearchToWorkerHandoffFailureRecoverySlice,
  runResearcherResearchToWorkerHandoffEvidenceSlice,
  runResearcherResearchToWorkerHandoffPropertyFuzzSlice,
  listResearcherResearchToWorkerHandoffContractProbesByCategory,
  RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES,
  getForgeP04B09BlockGate,
  getForgeP04B09ToB10Handoff,
  validateResearcherResearchToWorkerHandoffBlockHandoffContract,
  buildResearcherResearchToWorkerHandoffBlockGateEvidence,
  type ResearcherResearchToWorkerHandoffBlockGateEvidence,
  type ResearcherResearchToWorkerHandoffBlockHandoffContract,
} from "./forge-p04-researcher-research-to-worker-handoff.js";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import { execSync } from "node:child_process";

export {
  detectResearcherResearchToWorkerHandoffProbeRegression,
  runResearcherResearchToWorkerHandoffProbesWithRecord,
  getForgeP04B09BlockGate,
  getForgeP04B09ToB10Handoff,
  validateResearcherResearchToWorkerHandoffBlockHandoffContract,
  buildResearcherResearchToWorkerHandoffBlockGateEvidence,
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

export interface ForgeResearcherResearchToWorkerHandoffBlockGateResult {
  passed: boolean;
  evidence: ResearcherResearchToWorkerHandoffBlockGateEvidence;
  handoff: ResearcherResearchToWorkerHandoffBlockHandoffContract;
  regression: ForgeResearcherResearchToWorkerHandoffRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealResearcherResearchToWorkerHandoffBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P04-B09 block gate: validate A01–A09 deliverables, regression, guard, and B10 handoff (P04-B09-A10).
 */
export function runResearcherResearchToWorkerHandoffBlockGate(): ForgeResearcherResearchToWorkerHandoffBlockGateResult {
  const blockGate = getForgeP04B09BlockGate();
  const handoff = getForgeP04B09ToB10Handoff();
  const contract = getActiveResearcherResearchToWorkerHandoffContract();
  const fixture = loadResearcherResearchToWorkerHandoffBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateResearcherResearchToWorkerHandoffBaseline(fixture);
  const contractValidation = validateResearcherResearchToWorkerHandoffAgainstContract(fixture, contract);
  atomSeals.push(
    sealResearcherResearchToWorkerHandoffBlockAtom(
      "P04-B09-A01",
      "research_to_worker_handoff_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeResearcherResearchToWorkerHandoffContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeResearcherResearchToWorkerHandoffContractCoverage(contract);
  atomSeals.push(
    sealResearcherResearchToWorkerHandoffBlockAtom(
      "P04-B09-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runResearcherResearchToWorkerHandoffProductionSlice(fixture);
  atomSeals.push(
    sealResearcherResearchToWorkerHandoffBlockAtom(
      "P04-B09-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runResearcherResearchToWorkerHandoffBoundarySlice(fixture);
  const nogoPathProbes = listResearcherResearchToWorkerHandoffContractProbesByCategory(
    "nogo_path",
    contract,
  );
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    nogoPathProbes.length > 0;
  atomSeals.push(
    sealResearcherResearchToWorkerHandoffBlockAtom(
      "P04-B09-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo_path=${nogoPathProbes.length}`,
    ),
  );

  const failureRecoverySlice = runResearcherResearchToWorkerHandoffFailureRecoverySlice(fixture);
  atomSeals.push(
    sealResearcherResearchToWorkerHandoffBlockAtom(
      "P04-B09-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoPathProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoPathProbes.length} NO-GO path probes`,
    ),
  );

  const regression = runForgeResearcherResearchToWorkerHandoffRegressionGate();
  const evidenceSlice = runResearcherResearchToWorkerHandoffEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealResearcherResearchToWorkerHandoffBlockAtom(
      "P04-B09-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const propertyFuzzSlice = runResearcherResearchToWorkerHandoffPropertyFuzzSlice(fixture);
  const fuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;
  atomSeals.push(
    sealResearcherResearchToWorkerHandoffBlockAtom(
      "P04-B09-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${propertyFuzzSlice.propertyResult.passed}/${propertyFuzzSlice.propertyResult.total} contractFuzz rejected=${propertyFuzzSlice.contractFuzz.rejected}/${propertyFuzzSlice.contractFuzz.iterations} runFuzz rejected=${propertyFuzzSlice.runRecordFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealResearcherResearchToWorkerHandoffBlockAtom(
      "P04-B09-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealResearcherResearchToWorkerHandoffBlockAtom(
      "P04-B09-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateResearcherResearchToWorkerHandoffBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealResearcherResearchToWorkerHandoffBlockAtom(
      "P04-B09-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildResearcherResearchToWorkerHandoffBlockGateEvidence(
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
export const runForgeResearcherResearchToWorkerHandoffBlockGate =
  runResearcherResearchToWorkerHandoffBlockGate;
