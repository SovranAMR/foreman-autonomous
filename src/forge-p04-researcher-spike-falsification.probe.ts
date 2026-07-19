/**
 * FOREMAN — Researcher Spike Falsification Probe Harness (P04-B08-A08 regression, P04-B08-A10 block gate)
 *
 * Forge pipeline regression gate for spike falsification probe matrix.
 */

import {
  runResearcherSpikeFalsificationForgeRegression,
  type ResearcherSpikeFalsificationForgeRegressionResult,
  type ResearcherSpikeFalsificationRunRecord,
  detectResearcherSpikeFalsificationProbeRegression,
  runResearcherSpikeFalsificationProbesWithRecord,
  loadResearcherSpikeFalsificationBaseline,
  validateResearcherSpikeFalsificationBaseline,
  validateResearcherSpikeFalsificationAgainstContract,
  getActiveResearcherSpikeFalsificationContract,
  summarizeResearcherSpikeFalsificationContractCoverage,
  runResearcherSpikeFalsificationProductionSlice,
  runResearcherSpikeFalsificationBoundarySlice,
  runResearcherSpikeFalsificationFailureRecoverySlice,
  runResearcherSpikeFalsificationEvidenceSlice,
  runResearcherSpikeFalsificationPropertyFuzzSlice,
  listResearcherSpikeFalsificationContractProbesByCategory,
  RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES,
  getForgeP04B08BlockGate,
  getForgeP04B08ToB09Handoff,
  validateResearcherSpikeFalsificationBlockHandoffContract,
  buildResearcherSpikeFalsificationBlockGateEvidence,
  type ResearcherSpikeFalsificationBlockGateEvidence,
  type ResearcherSpikeFalsificationBlockHandoffContract,
} from "./forge-p04-researcher-spike-falsification.js";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import { execSync } from "node:child_process";

export {
  detectResearcherSpikeFalsificationProbeRegression,
  runResearcherSpikeFalsificationProbesWithRecord,
  getForgeP04B08BlockGate,
  getForgeP04B08ToB09Handoff,
  validateResearcherSpikeFalsificationBlockHandoffContract,
  buildResearcherSpikeFalsificationBlockGateEvidence,
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

export interface ForgeResearcherSpikeFalsificationBlockGateResult {
  passed: boolean;
  evidence: ResearcherSpikeFalsificationBlockGateEvidence;
  handoff: ResearcherSpikeFalsificationBlockHandoffContract;
  regression: ForgeResearcherSpikeFalsificationRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealResearcherSpikeFalsificationBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P04-B08 block gate: validate A01–A09 deliverables, regression, guard, and B09 handoff (P04-B08-A10).
 */
export function runResearcherSpikeFalsificationBlockGate(): ForgeResearcherSpikeFalsificationBlockGateResult {
  const blockGate = getForgeP04B08BlockGate();
  const handoff = getForgeP04B08ToB09Handoff();
  const contract = getActiveResearcherSpikeFalsificationContract();
  const fixture = loadResearcherSpikeFalsificationBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateResearcherSpikeFalsificationBaseline(fixture);
  const contractValidation = validateResearcherSpikeFalsificationAgainstContract(fixture, contract);
  atomSeals.push(
    sealResearcherSpikeFalsificationBlockAtom(
      "P04-B08-A01",
      "spike_falsification_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeResearcherSpikeFalsificationContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeResearcherSpikeFalsificationContractCoverage(contract);
  atomSeals.push(
    sealResearcherSpikeFalsificationBlockAtom(
      "P04-B08-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runResearcherSpikeFalsificationProductionSlice(fixture);
  atomSeals.push(
    sealResearcherSpikeFalsificationBlockAtom(
      "P04-B08-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runResearcherSpikeFalsificationBoundarySlice(fixture);
  const nogoPathProbes = listResearcherSpikeFalsificationContractProbesByCategory(
    "nogo_path",
    contract,
  );
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    nogoPathProbes.length > 0;
  atomSeals.push(
    sealResearcherSpikeFalsificationBlockAtom(
      "P04-B08-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo_path=${nogoPathProbes.length}`,
    ),
  );

  const failureRecoverySlice = runResearcherSpikeFalsificationFailureRecoverySlice(fixture);
  atomSeals.push(
    sealResearcherSpikeFalsificationBlockAtom(
      "P04-B08-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoPathProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoPathProbes.length} NO-GO path probes`,
    ),
  );

  const regression = runForgeResearcherSpikeFalsificationRegressionGate();
  const evidenceSlice = runResearcherSpikeFalsificationEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealResearcherSpikeFalsificationBlockAtom(
      "P04-B08-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const propertyFuzzSlice = runResearcherSpikeFalsificationPropertyFuzzSlice(fixture);
  const fuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;
  atomSeals.push(
    sealResearcherSpikeFalsificationBlockAtom(
      "P04-B08-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${propertyFuzzSlice.propertyResult.passed}/${propertyFuzzSlice.propertyResult.total} contractFuzz rejected=${propertyFuzzSlice.contractFuzz.rejected}/${propertyFuzzSlice.contractFuzz.iterations} runFuzz rejected=${propertyFuzzSlice.runRecordFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealResearcherSpikeFalsificationBlockAtom(
      "P04-B08-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealResearcherSpikeFalsificationBlockAtom(
      "P04-B08-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateResearcherSpikeFalsificationBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealResearcherSpikeFalsificationBlockAtom(
      "P04-B08-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildResearcherSpikeFalsificationBlockGateEvidence(
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
export const runForgeResearcherSpikeFalsificationBlockGate = runResearcherSpikeFalsificationBlockGate;
