/**
 * FOREMAN — Strategist Intent Probe Harness (P03-B01-A10 block gate)
 *
 * Regression gate with guard integration and P03-B01 block gate sealing.
 */

import { execSync } from "node:child_process";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import {
  getActiveStrategistIntentContract,
  summarizeStrategistIntentContractCoverage,
  validateStrategistIntentBaseline,
  validateStrategistIntentAgainstContract,
  loadStrategistIntentBaseline,
  runStrategistIntentProductionSlice,
  runStrategistIntentBoundarySlice,
  runStrategistIntentFailureRecoverySlice,
  runStrategistIntentPropertyChecks,
  runStrategistIntentFuzzValidation,
  runStrategistIntentRunRecordFuzzValidation,
  runStrategistIntentForgeRegression,
  validateStrategistIntentRunRecord,
  validateForgeStrategistIntentGuard,
  listStrategistIntentProbesByDisposition,
  listStrategistIntentFailureRecoveryProbeIds,
  STRATEGIST_INTENT_CATEGORIES,
  getForgeP03B01BlockGate,
  getForgeP03B01ToB02Handoff,
  validateStrategistIntentBlockHandoffContract,
  buildStrategistIntentBlockGateEvidence,
  type StrategistIntentBlockGateEvidence,
  type StrategistIntentBlockHandoffContract,
  type StrategistIntentForgeRegressionResult,
  type StrategistIntentGuardCheckResult,
  type StrategistIntentRunRecord,
} from "./forge-p03-strategist-intent.js";

export {
  getForgeP03B01BlockGate,
  getForgeP03B01ToB02Handoff,
  validateStrategistIntentBlockHandoffContract,
  buildStrategistIntentBlockGateEvidence,
} from "./forge-p03-strategist-intent.js";

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

export interface ForgeStrategistIntentRegressionGateResult extends StrategistIntentForgeRegressionResult {
  guard: StrategistIntentGuardCheckResult;
}

/**
 * Strategist intent regression gate with guard controls (P03-B01-A08 + A09 integration).
 */
export function runForgeStrategistIntentRegressionGate(
  priorRecord?: StrategistIntentRunRecord,
): ForgeStrategistIntentRegressionGateResult {
  const contract = getActiveStrategistIntentContract();
  const regression = runStrategistIntentForgeRegression(priorRecord);
  const guard = validateForgeStrategistIntentGuard(regression.record, {
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

export interface ForgeStrategistIntentBlockGateResult {
  passed: boolean;
  evidence: StrategistIntentBlockGateEvidence;
  handoff: StrategistIntentBlockHandoffContract;
  regression: ForgeStrategistIntentRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealStrategistIntentBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P03-B01 block gate: validate A01–A09 deliverables, regression, guard, and B02 handoff (P03-B01-A10).
 */
export function runStrategistIntentBlockGate(): ForgeStrategistIntentBlockGateResult {
  const blockGate = getForgeP03B01BlockGate();
  const handoff = getForgeP03B01ToB02Handoff();
  const contract = getActiveStrategistIntentContract();
  const fixture = loadStrategistIntentBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateStrategistIntentBaseline(fixture);
  const contractValidation = validateStrategistIntentAgainstContract(fixture, contract);
  atomSeals.push(
    sealStrategistIntentBlockAtom(
      "P03-B01-A01",
      "strategist_intent",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeStrategistIntentContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeStrategistIntentContractCoverage(contract);
  atomSeals.push(
    sealStrategistIntentBlockAtom(
      "P03-B01-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${STRATEGIST_INTENT_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runStrategistIntentProductionSlice(fixture);
  atomSeals.push(
    sealStrategistIntentBlockAtom(
      "P03-B01-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runStrategistIntentBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealStrategistIntentBlockAtom(
      "P03-B01-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const failureRecoverySlice = runStrategistIntentFailureRecoverySlice(fixture);
  const nogoProbes = listStrategistIntentProbesByDisposition("nogo", contract);
  atomSeals.push(
    sealStrategistIntentBlockAtom(
      "P03-B01-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoProbes.length} NO-GO probes`,
    ),
  );

  const regression = runForgeStrategistIntentRegressionGate();
  const recordValidation = validateStrategistIntentRunRecord(regression.record, contract);
  const evidenceOk =
    regression.record.evidence.length === coverage.totalProbes &&
    regression.record.telemetry.length === coverage.totalProbes &&
    recordValidation.valid;
  atomSeals.push(
    sealStrategistIntentBlockAtom(
      "P03-B01-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${regression.record.evidence.length} telemetry=${regression.record.telemetry.length}`
        : recordValidation.issues.map(i => i.detail).join("; "),
    ),
  );

  const properties = runStrategistIntentPropertyChecks(contract);
  const contractFuzz = runStrategistIntentFuzzValidation(fixture, contract);
  const runFuzz = runStrategistIntentRunRecordFuzzValidation(regression.record, contract);
  const fuzzOk =
    properties.allPassed && contractFuzz.allMutationsRejected && runFuzz.mutationsAccepted === 0;
  atomSeals.push(
    sealStrategistIntentBlockAtom(
      "P03-B01-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${properties.passed}/${properties.total} contractFuzz rejected=${contractFuzz.rejected}/${contractFuzz.iterations} runFuzz rejected=${runFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealStrategistIntentBlockAtom(
      "P03-B01-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealStrategistIntentBlockAtom(
      "P03-B01-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateStrategistIntentBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealStrategistIntentBlockAtom(
      "P03-B01-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildStrategistIntentBlockGateEvidence(
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
export const runForgeStrategistIntentBlockGate = runStrategistIntentBlockGate;
