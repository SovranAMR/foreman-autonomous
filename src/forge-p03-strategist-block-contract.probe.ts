/**
 * FOREMAN — Strategist Block Contract Probe Harness (P03-B02-A10 block gate)
 *
 * Regression gate with guard integration and P03-B02 block gate sealing.
 */

import { execSync } from "node:child_process";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import {
  getActiveStrategistBlockContract,
  summarizeStrategistBlockContractCoverage,
  validateStrategistBlockContractBaseline,
  validateStrategistBlockContractAgainstContract,
  loadStrategistBlockContractBaseline,
  runStrategistBlockContractProductionSlice,
  runStrategistBlockContractBoundarySlice,
  runStrategistBlockContractFailureRecoverySlice,
  runStrategistBlockContractPropertyChecks,
  runStrategistBlockContractFuzzValidation,
  runStrategistBlockContractRunRecordFuzzValidation,
  runStrategistBlockContractForgeRegression,
  validateStrategistBlockContractRunRecord,
  validateForgeStrategistBlockContractGuard,
  listStrategistBlockContractProbesByDisposition,
  listStrategistBlockContractFailureRecoveryProbeIds,
  STRATEGIST_BLOCK_CONTRACT_CATEGORIES,
  getForgeP03B02BlockGate,
  getForgeP03B02ToB03Handoff,
  validateStrategistBlockContractBlockHandoffContract,
  buildStrategistBlockContractBlockGateEvidence,
  type StrategistBlockContractBlockGateEvidence,
  type StrategistBlockContractBlockHandoffContract,
  type StrategistBlockContractForgeRegressionResult,
  type StrategistBlockContractGuardCheckResult,
  type StrategistBlockContractRunRecord,
} from "./forge-p03-strategist-block-contract.js";

export {
  getForgeP03B02BlockGate,
  getForgeP03B02ToB03Handoff,
  validateStrategistBlockContractBlockHandoffContract,
  buildStrategistBlockContractBlockGateEvidence,
} from "./forge-p03-strategist-block-contract.js";

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

export interface ForgeStrategistBlockContractRegressionGateResult
  extends StrategistBlockContractForgeRegressionResult {
  guard: StrategistBlockContractGuardCheckResult;
}

/**
 * Block contract regression gate with guard controls (P03-B02-A08 + A09 integration).
 */
export function runForgeStrategistBlockContractRegressionGate(
  priorRecord?: StrategistBlockContractRunRecord,
): ForgeStrategistBlockContractRegressionGateResult {
  const contract = getActiveStrategistBlockContract();
  const regression = runStrategistBlockContractForgeRegression(priorRecord);
  const guard = validateForgeStrategistBlockContractGuard(regression.record, {
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

export interface ForgeStrategistBlockContractBlockGateResult {
  passed: boolean;
  evidence: StrategistBlockContractBlockGateEvidence;
  handoff: StrategistBlockContractBlockHandoffContract;
  regression: ForgeStrategistBlockContractRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealStrategistBlockContractBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P03-B02 block gate: validate A01–A09 deliverables, regression, guard, and B03 handoff (P03-B02-A10).
 */
export function runStrategistBlockContractBlockGate(): ForgeStrategistBlockContractBlockGateResult {
  const blockGate = getForgeP03B02BlockGate();
  const handoff = getForgeP03B02ToB03Handoff();
  const contract = getActiveStrategistBlockContract();
  const fixture = loadStrategistBlockContractBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateStrategistBlockContractBaseline(fixture);
  const contractValidation = validateStrategistBlockContractAgainstContract(fixture, contract);
  atomSeals.push(
    sealStrategistBlockContractBlockAtom(
      "P03-B02-A01",
      "block_contract_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeStrategistBlockContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeStrategistBlockContractCoverage(contract);
  atomSeals.push(
    sealStrategistBlockContractBlockAtom(
      "P03-B02-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${STRATEGIST_BLOCK_CONTRACT_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runStrategistBlockContractProductionSlice(fixture);
  atomSeals.push(
    sealStrategistBlockContractBlockAtom(
      "P03-B02-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runStrategistBlockContractBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealStrategistBlockContractBlockAtom(
      "P03-B02-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const failureRecoverySlice = runStrategistBlockContractFailureRecoverySlice(fixture);
  const nogoProbes = listStrategistBlockContractProbesByDisposition("nogo", contract);
  atomSeals.push(
    sealStrategistBlockContractBlockAtom(
      "P03-B02-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoProbes.length} NO-GO probes`,
    ),
  );

  const regression = runForgeStrategistBlockContractRegressionGate();
  const recordValidation = validateStrategistBlockContractRunRecord(regression.record, contract);
  const evidenceOk =
    regression.record.evidence.length === coverage.totalProbes &&
    regression.record.telemetry.length === coverage.totalProbes &&
    recordValidation.valid;
  atomSeals.push(
    sealStrategistBlockContractBlockAtom(
      "P03-B02-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${regression.record.evidence.length} telemetry=${regression.record.telemetry.length}`
        : recordValidation.issues.map(i => i.detail).join("; "),
    ),
  );

  const properties = runStrategistBlockContractPropertyChecks(contract);
  const contractFuzz = runStrategistBlockContractFuzzValidation(fixture, contract);
  const runFuzz = runStrategistBlockContractRunRecordFuzzValidation(regression.record, contract);
  const fuzzOk =
    properties.allPassed && contractFuzz.allMutationsRejected && runFuzz.mutationsAccepted === 0;
  atomSeals.push(
    sealStrategistBlockContractBlockAtom(
      "P03-B02-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${properties.passed}/${properties.total} contractFuzz rejected=${contractFuzz.rejected}/${contractFuzz.iterations} runFuzz rejected=${runFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealStrategistBlockContractBlockAtom(
      "P03-B02-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealStrategistBlockContractBlockAtom(
      "P03-B02-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateStrategistBlockContractBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealStrategistBlockContractBlockAtom(
      "P03-B02-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildStrategistBlockContractBlockGateEvidence(
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
export const runForgeStrategistBlockContractBlockGate = runStrategistBlockContractBlockGate;
