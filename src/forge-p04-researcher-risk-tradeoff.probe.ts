/**
 * FOREMAN — Researcher Risk Trade-off Probe Harness (P04-B07-A08 regression, P04-B07-A10 block gate)
 *
 * Forge pipeline regression gate for risk trade-off probe matrix.
 */

import {
  runResearcherRiskTradeoffForgeRegression,
  type ResearcherRiskTradeoffForgeRegressionResult,
  type ResearcherRiskTradeoffRunRecord,
  detectResearcherRiskTradeoffProbeRegression,
  runResearcherRiskTradeoffProbesWithRecord,
  loadResearcherRiskTradeoffBaseline,
  validateResearcherRiskTradeoffBaseline,
  validateResearcherRiskTradeoffAgainstContract,
  getActiveResearcherRiskTradeoffContract,
  summarizeResearcherRiskTradeoffContractCoverage,
  runResearcherRiskTradeoffProductionSlice,
  runResearcherRiskTradeoffBoundarySlice,
  runResearcherRiskTradeoffFailureRecoverySlice,
  runResearcherRiskTradeoffEvidenceSlice,
  runResearcherRiskTradeoffPropertyFuzzSlice,
  listResearcherRiskTradeoffContractProbesByCategory,
  RESEARCHER_RISK_TRADEOFF_CATEGORIES,
  getForgeP04B07BlockGate,
  getForgeP04B07ToB08Handoff,
  validateResearcherRiskTradeoffBlockHandoffContract,
  buildResearcherRiskTradeoffBlockGateEvidence,
  type ResearcherRiskTradeoffBlockGateEvidence,
  type ResearcherRiskTradeoffBlockHandoffContract,
} from "./forge-p04-researcher-risk-tradeoff.js";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import { execSync } from "node:child_process";

export {
  detectResearcherRiskTradeoffProbeRegression,
  runResearcherRiskTradeoffProbesWithRecord,
  getForgeP04B07BlockGate,
  getForgeP04B07ToB08Handoff,
  validateResearcherRiskTradeoffBlockHandoffContract,
  buildResearcherRiskTradeoffBlockGateEvidence,
} from "./forge-p04-researcher-risk-tradeoff.js";

export type ForgeResearcherRiskTradeoffRegressionGateResult =
  ResearcherRiskTradeoffForgeRegressionResult;

/**
 * Risk trade-off regression gate on canonical probe matrix (P04-B07-A08).
 */
export function runForgeResearcherRiskTradeoffRegressionGate(
  priorRecord?: ResearcherRiskTradeoffRunRecord,
): ForgeResearcherRiskTradeoffRegressionGateResult {
  return runResearcherRiskTradeoffForgeRegression(priorRecord);
}

/** Alias for forge-pipeline-regression integration seam (P04-B07-A08). */
export const runResearcherRiskTradeoffRegressionIntegration =
  runForgeResearcherRiskTradeoffRegressionGate;

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

export interface ForgeResearcherRiskTradeoffBlockGateResult {
  passed: boolean;
  evidence: ResearcherRiskTradeoffBlockGateEvidence;
  handoff: ResearcherRiskTradeoffBlockHandoffContract;
  regression: ForgeResearcherRiskTradeoffRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealResearcherRiskTradeoffBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P04-B07 block gate: validate A01–A09 deliverables, regression, guard, and B08 handoff (P04-B07-A10).
 */
export function runResearcherRiskTradeoffBlockGate(): ForgeResearcherRiskTradeoffBlockGateResult {
  const blockGate = getForgeP04B07BlockGate();
  const handoff = getForgeP04B07ToB08Handoff();
  const contract = getActiveResearcherRiskTradeoffContract();
  const fixture = loadResearcherRiskTradeoffBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateResearcherRiskTradeoffBaseline(fixture);
  const contractValidation = validateResearcherRiskTradeoffAgainstContract(fixture, contract);
  atomSeals.push(
    sealResearcherRiskTradeoffBlockAtom(
      "P04-B07-A01",
      "risk_tradeoff_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeResearcherRiskTradeoffContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeResearcherRiskTradeoffContractCoverage(contract);
  atomSeals.push(
    sealResearcherRiskTradeoffBlockAtom(
      "P04-B07-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${RESEARCHER_RISK_TRADEOFF_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runResearcherRiskTradeoffProductionSlice(fixture);
  atomSeals.push(
    sealResearcherRiskTradeoffBlockAtom(
      "P04-B07-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runResearcherRiskTradeoffBoundarySlice(fixture);
  const nogoPathProbes = listResearcherRiskTradeoffContractProbesByCategory("nogo_path", contract);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    nogoPathProbes.length > 0;
  atomSeals.push(
    sealResearcherRiskTradeoffBlockAtom(
      "P04-B07-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo_path=${nogoPathProbes.length}`,
    ),
  );

  const failureRecoverySlice = runResearcherRiskTradeoffFailureRecoverySlice(fixture);
  atomSeals.push(
    sealResearcherRiskTradeoffBlockAtom(
      "P04-B07-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoPathProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoPathProbes.length} NO-GO path probes`,
    ),
  );

  const regression = runForgeResearcherRiskTradeoffRegressionGate();
  const evidenceSlice = runResearcherRiskTradeoffEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealResearcherRiskTradeoffBlockAtom(
      "P04-B07-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const propertyFuzzSlice = runResearcherRiskTradeoffPropertyFuzzSlice(fixture);
  const fuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;
  atomSeals.push(
    sealResearcherRiskTradeoffBlockAtom(
      "P04-B07-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${propertyFuzzSlice.propertyResult.passed}/${propertyFuzzSlice.propertyResult.total} contractFuzz rejected=${propertyFuzzSlice.contractFuzz.rejected}/${propertyFuzzSlice.contractFuzz.iterations} runFuzz rejected=${propertyFuzzSlice.runRecordFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealResearcherRiskTradeoffBlockAtom(
      "P04-B07-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealResearcherRiskTradeoffBlockAtom(
      "P04-B07-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateResearcherRiskTradeoffBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealResearcherRiskTradeoffBlockAtom(
      "P04-B07-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildResearcherRiskTradeoffBlockGateEvidence(
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
export const runForgeResearcherRiskTradeoffBlockGate = runResearcherRiskTradeoffBlockGate;
