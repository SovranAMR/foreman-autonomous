/**
 * FOREMAN — Researcher Web Primary-Source Probe Harness (P04-B03-A08 regression, P04-B03-A10 block gate)
 *
 * Forge pipeline regression gate for web and primary-source research probe matrix.
 */

import {
  runResearcherWebPrimarySourceForgeRegression,
  type ResearcherWebPrimarySourceForgeRegressionResult,
  type ResearcherWebPrimarySourceRunRecord,
  detectResearcherWebPrimarySourceProbeRegression,
  runResearcherWebPrimarySourceProbesWithRecord,
  loadResearcherWebPrimarySourceBaseline,
  validateResearcherWebPrimarySourceBaseline,
  validateResearcherWebPrimarySourceAgainstContract,
  getActiveResearcherWebPrimarySourceContract,
  summarizeResearcherWebPrimarySourceContractCoverage,
  runResearcherWebPrimarySourceProductionSlice,
  runResearcherWebPrimarySourceBoundarySlice,
  runResearcherWebPrimarySourceFailureRecoverySlice,
  runResearcherWebPrimarySourceEvidenceSlice,
  runResearcherWebPrimarySourcePropertyFuzzSlice,
  listResearcherWebPrimarySourceProbesByDisposition,
  RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORIES,
  getForgeP04B03BlockGate,
  getForgeP04B03ToB04Handoff,
  validateResearcherWebPrimarySourceBlockHandoffContract,
  buildResearcherWebPrimarySourceBlockGateEvidence,
  type ResearcherWebPrimarySourceBlockGateEvidence,
  type ResearcherWebPrimarySourceBlockHandoffContract,
} from "./forge-p04-researcher-web-primary-source.js";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import { execSync } from "node:child_process";

export {
  detectResearcherWebPrimarySourceProbeRegression,
  runResearcherWebPrimarySourceProbesWithRecord,
  getForgeP04B03BlockGate,
  getForgeP04B03ToB04Handoff,
  validateResearcherWebPrimarySourceBlockHandoffContract,
  buildResearcherWebPrimarySourceBlockGateEvidence,
} from "./forge-p04-researcher-web-primary-source.js";

export type ForgeResearcherWebPrimarySourceRegressionGateResult =
  ResearcherWebPrimarySourceForgeRegressionResult;

/**
 * Web primary-source regression gate on canonical probe matrix (P04-B03-A08).
 */
export function runForgeResearcherWebPrimarySourceRegressionGate(
  priorRecord?: ResearcherWebPrimarySourceRunRecord,
): ForgeResearcherWebPrimarySourceRegressionGateResult {
  return runResearcherWebPrimarySourceForgeRegression(priorRecord);
}

/** Alias for forge-pipeline-regression integration seam (P04-B03-A08). */
export const runResearcherWebPrimarySourceRegressionIntegration =
  runForgeResearcherWebPrimarySourceRegressionGate;

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

export interface ForgeResearcherWebPrimarySourceBlockGateResult {
  passed: boolean;
  evidence: ResearcherWebPrimarySourceBlockGateEvidence;
  handoff: ResearcherWebPrimarySourceBlockHandoffContract;
  regression: ForgeResearcherWebPrimarySourceRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealResearcherWebPrimarySourceBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P04-B03 block gate: validate A01–A09 deliverables, regression, guard, and B04 handoff (P04-B03-A10).
 */
export function runResearcherWebPrimarySourceBlockGate(): ForgeResearcherWebPrimarySourceBlockGateResult {
  const blockGate = getForgeP04B03BlockGate();
  const handoff = getForgeP04B03ToB04Handoff();
  const contract = getActiveResearcherWebPrimarySourceContract();
  const fixture = loadResearcherWebPrimarySourceBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateResearcherWebPrimarySourceBaseline(fixture);
  const contractValidation = validateResearcherWebPrimarySourceAgainstContract(fixture, contract);
  atomSeals.push(
    sealResearcherWebPrimarySourceBlockAtom(
      "P04-B03-A01",
      "web_primary_source_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeResearcherWebPrimarySourceContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeResearcherWebPrimarySourceContractCoverage(contract);
  atomSeals.push(
    sealResearcherWebPrimarySourceBlockAtom(
      "P04-B03-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runResearcherWebPrimarySourceProductionSlice(fixture);
  atomSeals.push(
    sealResearcherWebPrimarySourceBlockAtom(
      "P04-B03-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runResearcherWebPrimarySourceBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealResearcherWebPrimarySourceBlockAtom(
      "P04-B03-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const failureRecoverySlice = runResearcherWebPrimarySourceFailureRecoverySlice(fixture);
  const nogoProbes = listResearcherWebPrimarySourceProbesByDisposition("nogo", contract);
  atomSeals.push(
    sealResearcherWebPrimarySourceBlockAtom(
      "P04-B03-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoProbes.length} NO-GO probes`,
    ),
  );

  const regression = runForgeResearcherWebPrimarySourceRegressionGate();
  const evidenceSlice = runResearcherWebPrimarySourceEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealResearcherWebPrimarySourceBlockAtom(
      "P04-B03-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const propertyFuzzSlice = runResearcherWebPrimarySourcePropertyFuzzSlice(fixture);
  const fuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;
  atomSeals.push(
    sealResearcherWebPrimarySourceBlockAtom(
      "P04-B03-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${propertyFuzzSlice.propertyResult.passed}/${propertyFuzzSlice.propertyResult.total} contractFuzz rejected=${propertyFuzzSlice.contractFuzz.rejected}/${propertyFuzzSlice.contractFuzz.iterations} runFuzz rejected=${propertyFuzzSlice.runRecordFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealResearcherWebPrimarySourceBlockAtom(
      "P04-B03-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealResearcherWebPrimarySourceBlockAtom(
      "P04-B03-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateResearcherWebPrimarySourceBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealResearcherWebPrimarySourceBlockAtom(
      "P04-B03-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildResearcherWebPrimarySourceBlockGateEvidence(
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
export const runForgeResearcherWebPrimarySourceBlockGate = runResearcherWebPrimarySourceBlockGate;
