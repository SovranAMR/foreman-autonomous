/**
 * FOREMAN — Strategist Replan Probe Harness (P03-B08-A10 block gate)
 *
 * Regression gate with guard integration and P03-B08 block gate sealing.
 */

import { execSync } from "node:child_process";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import {
  getActiveStrategistReplanContract,
  summarizeStrategistReplanCoverage,
  validateStrategistReplanBaseline,
  validateStrategistReplanAgainstContract,
  loadStrategistReplanBaseline,
  runStrategistReplanProductionSlice,
  runStrategistReplanBoundarySlice,
  runStrategistReplanFailureRecoverySlice,
  runStrategistReplanEvidenceSlice,
  runStrategistReplanPropertyChecks,
  runStrategistReplanFuzzValidation,
  runStrategistReplanRunRecordFuzzValidation,
  runForgeStrategistReplanRegressionGate,
  listStrategistReplanContractProbesByCategory,
  STRATEGIST_REPLAN_CATEGORIES,
  getForgeP03B08BlockGate,
  getForgeP03B08ToB09Handoff,
  validateStrategistReplanBlockHandoffContract,
  buildStrategistReplanBlockGateEvidence,
  type StrategistReplanBlockGateEvidence,
  type StrategistReplanBlockHandoffContract,
  type ForgeStrategistReplanRegressionGateResult,
} from "./forge-p03-strategist-replan.js";

export {
  getForgeP03B08BlockGate,
  getForgeP03B08ToB09Handoff,
  validateStrategistReplanBlockHandoffContract,
  validateStrategistReplanBlockHandoff,
  buildStrategistReplanBlockGateEvidence,
  runForgeStrategistReplanRegressionGate,
} from "./forge-p03-strategist-replan.js";

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

export interface ForgeStrategistReplanBlockGateResult {
  passed: boolean;
  evidence: StrategistReplanBlockGateEvidence;
  handoff: StrategistReplanBlockHandoffContract;
  regression: ForgeStrategistReplanRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealStrategistReplanBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P03-B08 block gate: validate A01–A09 deliverables, regression, guard, and B09 handoff (P03-B08-A10).
 */
export function sealStrategistReplanBlockGate(): ForgeStrategistReplanBlockGateResult {
  const blockGate = getForgeP03B08BlockGate();
  const handoff = getForgeP03B08ToB09Handoff();
  const contract = getActiveStrategistReplanContract();
  const fixture = loadStrategistReplanBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateStrategistReplanBaseline(fixture);
  const contractValidation = validateStrategistReplanAgainstContract(fixture, contract);
  atomSeals.push(
    sealStrategistReplanBlockAtom(
      "P03-B08-A01",
      "replan_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeStrategistReplanCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeStrategistReplanCoverage(contract);
  atomSeals.push(
    sealStrategistReplanBlockAtom(
      "P03-B08-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${STRATEGIST_REPLAN_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runStrategistReplanProductionSlice(fixture);
  atomSeals.push(
    sealStrategistReplanBlockAtom(
      "P03-B08-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runStrategistReplanBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealStrategistReplanBlockAtom(
      "P03-B08-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const failureRecoverySlice = runStrategistReplanFailureRecoverySlice(fixture);
  const nogoPathProbes = listStrategistReplanContractProbesByCategory("nogo_path", contract);
  atomSeals.push(
    sealStrategistReplanBlockAtom(
      "P03-B08-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoPathProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoPathProbes.length} NO-GO path probes`,
    ),
  );

  const regression = runForgeStrategistReplanRegressionGate();
  const evidenceSlice = runStrategistReplanEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealStrategistReplanBlockAtom(
      "P03-B08-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const properties = runStrategistReplanPropertyChecks(contract);
  const contractFuzz = runStrategistReplanFuzzValidation(fixture, contract);
  const runFuzz = runStrategistReplanRunRecordFuzzValidation(regression.record, contract);
  const fuzzOk =
    properties.allPassed && contractFuzz.allMutationsRejected && runFuzz.mutationsAccepted === 0;
  atomSeals.push(
    sealStrategistReplanBlockAtom(
      "P03-B08-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${properties.passed}/${properties.total} contractFuzz rejected=${contractFuzz.rejected}/${contractFuzz.iterations} runFuzz rejected=${runFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealStrategistReplanBlockAtom(
      "P03-B08-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealStrategistReplanBlockAtom(
      "P03-B08-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateStrategistReplanBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealStrategistReplanBlockAtom(
      "P03-B08-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildStrategistReplanBlockGateEvidence(
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
export const runStrategistReplanBlockGate = sealStrategistReplanBlockGate;
export const runForgeStrategistReplanBlockGate = sealStrategistReplanBlockGate;
