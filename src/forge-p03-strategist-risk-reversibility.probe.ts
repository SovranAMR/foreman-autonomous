/**
 * FOREMAN — Strategist Risk Reversibility Probe Harness (P03-B05-A10 block gate)
 *
 * Regression gate with guard integration and P03-B05 block gate sealing.
 */

import { execSync } from "node:child_process";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import {
  getActiveStrategistRiskReversibilityContract,
  summarizeStrategistRiskReversibilityCoverage,
  validateStrategistRiskReversibilityBaseline,
  validateStrategistRiskReversibilityAgainstContract,
  loadStrategistRiskReversibilityBaseline,
  runStrategistRiskReversibilityProductionSlice,
  runStrategistRiskReversibilityBoundarySlice,
  runStrategistRiskReversibilityFailureRecoverySlice,
  runStrategistRiskReversibilityEvidenceSlice,
  runStrategistRiskReversibilityPropertyChecks,
  runStrategistRiskReversibilityFuzzValidation,
  runStrategistRiskReversibilityRunRecordFuzzValidation,
  runStrategistRiskReversibilityForgeRegression,
  validateForgeStrategistRiskReversibilityGuard,
  listStrategistRiskReversibilityContractProbesByCategory,
  STRATEGIST_RISK_REVERSIBILITY_CATEGORIES,
  getForgeP03B05BlockGate,
  getForgeP03B05ToB06Handoff,
  validateStrategistRiskReversibilityBlockHandoffContract,
  buildStrategistRiskReversibilityBlockGateEvidence,
  type StrategistRiskReversibilityBlockGateEvidence,
  type StrategistRiskReversibilityBlockHandoffContract,
  type StrategistRiskReversibilityForgeRegressionResult,
  type StrategistRiskReversibilityGuardCheckResult,
  type StrategistRiskReversibilityRunRecord,
} from "./forge-p03-strategist-risk-reversibility.js";

export {
  getForgeP03B05BlockGate,
  getForgeP03B05ToB06Handoff,
  validateStrategistRiskReversibilityBlockHandoffContract,
  buildStrategistRiskReversibilityBlockGateEvidence,
} from "./forge-p03-strategist-risk-reversibility.js";

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

export interface ForgeStrategistRiskReversibilityRegressionGateResult
  extends StrategistRiskReversibilityForgeRegressionResult {
  guard: StrategistRiskReversibilityGuardCheckResult;
}

/**
 * Risk reversibility regression gate with guard controls (P03-B05-A08 + A09 integration).
 */
export function runForgeStrategistRiskReversibilityRegressionGate(
  priorRecord?: StrategistRiskReversibilityRunRecord,
): ForgeStrategistRiskReversibilityRegressionGateResult {
  const contract = getActiveStrategistRiskReversibilityContract();
  const regression = runStrategistRiskReversibilityForgeRegression(priorRecord);
  const guard = validateForgeStrategistRiskReversibilityGuard(regression.record, {
    totalCostUsd: 0,
    llmCalls: 0,
    contract,
  });

  const passed = regression.passed && guard.passed;
  const detailParts = [regression.detail];
  if (!guard.passed) {
    detailParts.push(
      `guard: ${guard.issues.map(issue => `${issue.domain}/${issue.code}`).join(", ") || "failed"}`,
    );
  } else {
    detailParts.push(
      `guard: perf=${guard.metrics.suiteDurationMs.toFixed(1)}ms cost=$${guard.metrics.totalCostUsd} adversarial=${guard.metrics.adversarialScenariosRejected}/${guard.metrics.adversarialScenariosTotal}`,
    );
  }

  return {
    ...regression,
    passed,
    guard,
    detail: detailParts.join(" | "),
  };
}

export interface ForgeStrategistRiskReversibilityBlockGateResult {
  passed: boolean;
  evidence: StrategistRiskReversibilityBlockGateEvidence;
  handoff: StrategistRiskReversibilityBlockHandoffContract;
  regression: ForgeStrategistRiskReversibilityRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealStrategistRiskReversibilityBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P03-B05 block gate: validate A01–A09 deliverables, regression, guard, and B06 handoff (P03-B05-A10).
 */
export function sealStrategistRiskReversibilityBlockGate(): ForgeStrategistRiskReversibilityBlockGateResult {
  const blockGate = getForgeP03B05BlockGate();
  const handoff = getForgeP03B05ToB06Handoff();
  const contract = getActiveStrategistRiskReversibilityContract();
  const fixture = loadStrategistRiskReversibilityBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateStrategistRiskReversibilityBaseline(fixture);
  const contractValidation = validateStrategistRiskReversibilityAgainstContract(fixture, contract);
  atomSeals.push(
    sealStrategistRiskReversibilityBlockAtom(
      "P03-B05-A01",
      "risk_reversibility_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeStrategistRiskReversibilityCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeStrategistRiskReversibilityCoverage(contract);
  atomSeals.push(
    sealStrategistRiskReversibilityBlockAtom(
      "P03-B05-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${STRATEGIST_RISK_REVERSIBILITY_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runStrategistRiskReversibilityProductionSlice(fixture);
  atomSeals.push(
    sealStrategistRiskReversibilityBlockAtom(
      "P03-B05-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runStrategistRiskReversibilityBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.gap > 0;
  atomSeals.push(
    sealStrategistRiskReversibilityBlockAtom(
      "P03-B05-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} gap=${coverage.byDisposition.gap}`,
    ),
  );

  const failureRecoverySlice = runStrategistRiskReversibilityFailureRecoverySlice(fixture);
  const nogoPathProbes = listStrategistRiskReversibilityContractProbesByCategory("nogo_path", contract);
  atomSeals.push(
    sealStrategistRiskReversibilityBlockAtom(
      "P03-B05-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoPathProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoPathProbes.length} NO-GO path probes`,
    ),
  );

  const regression = runForgeStrategistRiskReversibilityRegressionGate();
  const evidenceSlice = runStrategistRiskReversibilityEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealStrategistRiskReversibilityBlockAtom(
      "P03-B05-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const properties = runStrategistRiskReversibilityPropertyChecks(contract);
  const contractFuzz = runStrategistRiskReversibilityFuzzValidation(fixture, contract);
  const runFuzz = runStrategistRiskReversibilityRunRecordFuzzValidation(regression.record, contract);
  const fuzzOk =
    properties.allPassed && contractFuzz.allMutationsRejected && runFuzz.mutationsAccepted === 0;
  atomSeals.push(
    sealStrategistRiskReversibilityBlockAtom(
      "P03-B05-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${properties.passed}/${properties.total} contractFuzz rejected=${contractFuzz.rejected}/${contractFuzz.iterations} runFuzz rejected=${runFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealStrategistRiskReversibilityBlockAtom(
      "P03-B05-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealStrategistRiskReversibilityBlockAtom(
      "P03-B05-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateStrategistRiskReversibilityBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealStrategistRiskReversibilityBlockAtom(
      "P03-B05-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildStrategistRiskReversibilityBlockGateEvidence(
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
export const runStrategistRiskReversibilityBlockGate = sealStrategistRiskReversibilityBlockGate;
export const runForgeStrategistRiskReversibilityBlockGate = sealStrategistRiskReversibilityBlockGate;
