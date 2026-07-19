/**
 * FOREMAN — Strategist Provenance Probe Harness (P03-B09-A10 block gate)
 *
 * Regression gate with guard integration and P03-B09 block gate sealing.
 */

import { execSync } from "node:child_process";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import {
  getActiveStrategistProvenanceContract,
  summarizeStrategistProvenanceCoverage,
  validateStrategistProvenanceBaseline,
  validateStrategistProvenanceAgainstContract,
  loadStrategistProvenanceBaseline,
  runStrategistProvenanceProductionSlice,
  runStrategistProvenanceBoundarySlice,
  runStrategistProvenanceFailureRecoverySlice,
  runStrategistProvenanceEvidenceSlice,
  runStrategistProvenancePropertyChecks,
  runStrategistProvenanceFuzzValidation,
  runStrategistProvenanceRunRecordFuzzValidation,
  runForgeStrategistProvenanceRegressionGate,
  listStrategistProvenanceContractProbesByCategory,
  STRATEGIST_PROVENANCE_CATEGORIES,
  getForgeP03B09BlockGate,
  getForgeP03B09ToB10Handoff,
  validateStrategistProvenanceBlockHandoffContract,
  buildStrategistProvenanceBlockGateEvidence,
  type StrategistProvenanceBlockGateEvidence,
  type StrategistProvenanceBlockHandoffContract,
  type ForgeStrategistProvenanceRegressionGateResult,
} from "./forge-p03-strategist-provenance.js";

export {
  getForgeP03B09BlockGate,
  getForgeP03B09ToB10Handoff,
  validateStrategistProvenanceBlockHandoffContract,
  validateStrategistProvenanceBlockHandoff,
  buildStrategistProvenanceBlockGateEvidence,
  runForgeStrategistProvenanceRegressionGate,
} from "./forge-p03-strategist-provenance.js";

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

export interface ForgeStrategistProvenanceBlockGateResult {
  passed: boolean;
  evidence: StrategistProvenanceBlockGateEvidence;
  handoff: StrategistProvenanceBlockHandoffContract;
  regression: ForgeStrategistProvenanceRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealStrategistProvenanceBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P03-B09 block gate: validate A01–A09 deliverables, regression, guard, and B10 handoff (P03-B09-A10).
 */
export function sealStrategistProvenanceBlockGate(): ForgeStrategistProvenanceBlockGateResult {
  const blockGate = getForgeP03B09BlockGate();
  const handoff = getForgeP03B09ToB10Handoff();
  const contract = getActiveStrategistProvenanceContract();
  const fixture = loadStrategistProvenanceBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateStrategistProvenanceBaseline(fixture);
  const contractValidation = validateStrategistProvenanceAgainstContract(fixture, contract);
  atomSeals.push(
    sealStrategistProvenanceBlockAtom(
      "P03-B09-A01",
      "provenance_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeStrategistProvenanceCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeStrategistProvenanceCoverage(contract);
  atomSeals.push(
    sealStrategistProvenanceBlockAtom(
      "P03-B09-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${STRATEGIST_PROVENANCE_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runStrategistProvenanceProductionSlice(fixture);
  atomSeals.push(
    sealStrategistProvenanceBlockAtom(
      "P03-B09-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runStrategistProvenanceBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealStrategistProvenanceBlockAtom(
      "P03-B09-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const failureRecoverySlice = runStrategistProvenanceFailureRecoverySlice(fixture);
  const nogoPathProbes = listStrategistProvenanceContractProbesByCategory("nogo_path", contract);
  atomSeals.push(
    sealStrategistProvenanceBlockAtom(
      "P03-B09-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoPathProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoPathProbes.length} NO-GO path probes`,
    ),
  );

  const regression = runForgeStrategistProvenanceRegressionGate();
  const evidenceSlice = runStrategistProvenanceEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealStrategistProvenanceBlockAtom(
      "P03-B09-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const properties = runStrategistProvenancePropertyChecks(contract);
  const contractFuzz = runStrategistProvenanceFuzzValidation(fixture, contract);
  const runFuzz = runStrategistProvenanceRunRecordFuzzValidation(regression.record, contract);
  const fuzzOk =
    properties.allPassed && contractFuzz.allMutationsRejected && runFuzz.mutationsAccepted === 0;
  atomSeals.push(
    sealStrategistProvenanceBlockAtom(
      "P03-B09-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${properties.passed}/${properties.total} contractFuzz rejected=${contractFuzz.rejected}/${contractFuzz.iterations} runFuzz rejected=${runFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealStrategistProvenanceBlockAtom(
      "P03-B09-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealStrategistProvenanceBlockAtom(
      "P03-B09-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateStrategistProvenanceBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealStrategistProvenanceBlockAtom(
      "P03-B09-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildStrategistProvenanceBlockGateEvidence(
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
export const runStrategistProvenanceBlockGate = sealStrategistProvenanceBlockGate;
export const runForgeStrategistProvenanceBlockGate = sealStrategistProvenanceBlockGate;
