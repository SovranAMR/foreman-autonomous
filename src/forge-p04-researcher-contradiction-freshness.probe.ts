/**
 * FOREMAN — Researcher Contradiction Freshness Probe Harness (P04-B06-A08 regression, P04-B06-A10 block gate)
 *
 * Forge pipeline regression gate for contradiction freshness probe matrix.
 */

import {
  runResearcherContradictionFreshnessForgeRegression,
  type ResearcherContradictionFreshnessForgeRegressionResult,
  type ResearcherContradictionFreshnessRunRecord,
  detectResearcherContradictionFreshnessProbeRegression,
  runResearcherContradictionFreshnessProbesWithRecord,
  loadResearcherContradictionFreshnessBaseline,
  validateResearcherContradictionFreshnessBaseline,
  validateResearcherContradictionFreshnessAgainstContract,
  getActiveResearcherContradictionFreshnessContract,
  summarizeResearcherContradictionFreshnessContractCoverage,
  runResearcherContradictionFreshnessProductionSlice,
  runResearcherContradictionFreshnessBoundarySlice,
  runResearcherContradictionFreshnessFailureRecoverySlice,
  runResearcherContradictionFreshnessEvidenceSlice,
  runResearcherContradictionFreshnessPropertyFuzzSlice,
  listResearcherContradictionFreshnessProbesByDisposition,
  RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES,
  getForgeP04B06BlockGate,
  getForgeP04B06ToB07Handoff,
  validateResearcherContradictionFreshnessBlockHandoffContract,
  buildResearcherContradictionFreshnessBlockGateEvidence,
  type ResearcherContradictionFreshnessBlockGateEvidence,
  type ResearcherContradictionFreshnessBlockHandoffContract,
} from "./forge-p04-researcher-contradiction-freshness.js";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import { execSync } from "node:child_process";

export {
  detectResearcherContradictionFreshnessProbeRegression,
  runResearcherContradictionFreshnessProbesWithRecord,
  getForgeP04B06BlockGate,
  getForgeP04B06ToB07Handoff,
  validateResearcherContradictionFreshnessBlockHandoffContract,
  buildResearcherContradictionFreshnessBlockGateEvidence,
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

export interface ForgeResearcherContradictionFreshnessBlockGateResult {
  passed: boolean;
  evidence: ResearcherContradictionFreshnessBlockGateEvidence;
  handoff: ResearcherContradictionFreshnessBlockHandoffContract;
  regression: ForgeResearcherContradictionFreshnessRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealResearcherContradictionFreshnessBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P04-B06 block gate: validate A01–A09 deliverables, regression, guard, and B07 handoff (P04-B06-A10).
 */
export function runResearcherContradictionFreshnessBlockGate(): ForgeResearcherContradictionFreshnessBlockGateResult {
  const blockGate = getForgeP04B06BlockGate();
  const handoff = getForgeP04B06ToB07Handoff();
  const contract = getActiveResearcherContradictionFreshnessContract();
  const fixture = loadResearcherContradictionFreshnessBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateResearcherContradictionFreshnessBaseline(fixture);
  const contractValidation = validateResearcherContradictionFreshnessAgainstContract(fixture, contract);
  atomSeals.push(
    sealResearcherContradictionFreshnessBlockAtom(
      "P04-B06-A01",
      "contradiction_freshness_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeResearcherContradictionFreshnessContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeResearcherContradictionFreshnessContractCoverage(contract);
  atomSeals.push(
    sealResearcherContradictionFreshnessBlockAtom(
      "P04-B06-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runResearcherContradictionFreshnessProductionSlice(fixture);
  atomSeals.push(
    sealResearcherContradictionFreshnessBlockAtom(
      "P04-B06-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runResearcherContradictionFreshnessBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealResearcherContradictionFreshnessBlockAtom(
      "P04-B06-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const failureRecoverySlice = runResearcherContradictionFreshnessFailureRecoverySlice(fixture);
  const nogoProbes = listResearcherContradictionFreshnessProbesByDisposition("nogo", contract);
  atomSeals.push(
    sealResearcherContradictionFreshnessBlockAtom(
      "P04-B06-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoProbes.length} NO-GO probes`,
    ),
  );

  const regression = runForgeResearcherContradictionFreshnessRegressionGate();
  const evidenceSlice = runResearcherContradictionFreshnessEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealResearcherContradictionFreshnessBlockAtom(
      "P04-B06-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const propertyFuzzSlice = runResearcherContradictionFreshnessPropertyFuzzSlice(fixture);
  const fuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;
  atomSeals.push(
    sealResearcherContradictionFreshnessBlockAtom(
      "P04-B06-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${propertyFuzzSlice.propertyResult.passed}/${propertyFuzzSlice.propertyResult.total} contractFuzz rejected=${propertyFuzzSlice.contractFuzz.rejected}/${propertyFuzzSlice.contractFuzz.iterations} runFuzz rejected=${propertyFuzzSlice.runRecordFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealResearcherContradictionFreshnessBlockAtom(
      "P04-B06-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealResearcherContradictionFreshnessBlockAtom(
      "P04-B06-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateResearcherContradictionFreshnessBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealResearcherContradictionFreshnessBlockAtom(
      "P04-B06-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildResearcherContradictionFreshnessBlockGateEvidence(
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
export const runForgeResearcherContradictionFreshnessBlockGate =
  runResearcherContradictionFreshnessBlockGate;
