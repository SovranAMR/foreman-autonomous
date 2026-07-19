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
  loadResearcherInRepoEvidenceBaseline,
  validateResearcherInRepoEvidenceBaseline,
  validateResearcherInRepoEvidenceAgainstContract,
  getActiveResearcherInRepoEvidenceContract,
  summarizeResearcherInRepoEvidenceContractCoverage,
  runResearcherInRepoEvidenceProductionSlice,
  runResearcherInRepoEvidenceBoundarySlice,
  runResearcherInRepoEvidenceFailureRecoverySlice,
  runResearcherInRepoEvidenceEvidenceSlice,
  runResearcherInRepoEvidencePropertyFuzzSlice,
  listResearcherInRepoEvidenceProbesByDisposition,
  RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES,
  getForgeP04B02BlockGate,
  getForgeP04B02ToB03Handoff,
  validateResearcherInRepoEvidenceBlockHandoffContract,
  buildResearcherInRepoEvidenceBlockGateEvidence,
  type ResearcherInRepoEvidenceBlockGateEvidence,
  type ResearcherInRepoEvidenceBlockHandoffContract,
} from "./forge-p04-researcher-in-repo-evidence.js";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import { execSync } from "node:child_process";

export {
  detectResearcherInRepoEvidenceProbeRegression,
  runResearcherInRepoEvidenceProbesWithRecord,
  getForgeP04B02BlockGate,
  getForgeP04B02ToB03Handoff,
  validateResearcherInRepoEvidenceBlockHandoffContract,
  buildResearcherInRepoEvidenceBlockGateEvidence,
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

export interface ForgeResearcherInRepoEvidenceBlockGateResult {
  passed: boolean;
  evidence: ResearcherInRepoEvidenceBlockGateEvidence;
  handoff: ResearcherInRepoEvidenceBlockHandoffContract;
  regression: ForgeResearcherInRepoEvidenceRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealResearcherInRepoEvidenceBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P04-B02 block gate: validate A01–A09 deliverables, regression, guard, and B03 handoff (P04-B02-A10).
 */
export function runResearcherInRepoEvidenceBlockGate(): ForgeResearcherInRepoEvidenceBlockGateResult {
  const blockGate = getForgeP04B02BlockGate();
  const handoff = getForgeP04B02ToB03Handoff();
  const contract = getActiveResearcherInRepoEvidenceContract();
  const fixture = loadResearcherInRepoEvidenceBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateResearcherInRepoEvidenceBaseline(fixture);
  const contractValidation = validateResearcherInRepoEvidenceAgainstContract(fixture, contract);
  atomSeals.push(
    sealResearcherInRepoEvidenceBlockAtom(
      "P04-B02-A01",
      "in_repo_evidence_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeResearcherInRepoEvidenceContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeResearcherInRepoEvidenceContractCoverage(contract);
  atomSeals.push(
    sealResearcherInRepoEvidenceBlockAtom(
      "P04-B02-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runResearcherInRepoEvidenceProductionSlice(fixture);
  atomSeals.push(
    sealResearcherInRepoEvidenceBlockAtom(
      "P04-B02-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runResearcherInRepoEvidenceBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealResearcherInRepoEvidenceBlockAtom(
      "P04-B02-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const failureRecoverySlice = runResearcherInRepoEvidenceFailureRecoverySlice(fixture);
  const nogoProbes = listResearcherInRepoEvidenceProbesByDisposition("nogo", contract);
  atomSeals.push(
    sealResearcherInRepoEvidenceBlockAtom(
      "P04-B02-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoProbes.length} NO-GO probes`,
    ),
  );

  const regression = runForgeResearcherInRepoEvidenceRegressionGate();
  const evidenceSlice = runResearcherInRepoEvidenceEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealResearcherInRepoEvidenceBlockAtom(
      "P04-B02-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const propertyFuzzSlice = runResearcherInRepoEvidencePropertyFuzzSlice(fixture);
  const fuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;
  atomSeals.push(
    sealResearcherInRepoEvidenceBlockAtom(
      "P04-B02-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${propertyFuzzSlice.propertyResult.passed}/${propertyFuzzSlice.propertyResult.total} contractFuzz rejected=${propertyFuzzSlice.contractFuzz.rejected}/${propertyFuzzSlice.contractFuzz.iterations} runFuzz rejected=${propertyFuzzSlice.runRecordFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealResearcherInRepoEvidenceBlockAtom(
      "P04-B02-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealResearcherInRepoEvidenceBlockAtom(
      "P04-B02-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateResearcherInRepoEvidenceBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealResearcherInRepoEvidenceBlockAtom(
      "P04-B02-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildResearcherInRepoEvidenceBlockGateEvidence(
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
export const runForgeResearcherInRepoEvidenceBlockGate = runResearcherInRepoEvidenceBlockGate;
