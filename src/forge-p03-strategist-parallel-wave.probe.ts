/**
 * FOREMAN — Strategist Parallel Wave Probe Harness (P03-B07-A10 block gate)
 *
 * Regression gate with guard integration and P03-B07 block gate sealing.
 */

import { execSync } from "node:child_process";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import {
  getActiveStrategistParallelWaveContract,
  summarizeStrategistParallelWaveCoverage,
  validateStrategistParallelWaveBaseline,
  validateStrategistParallelWaveAgainstContract,
  loadStrategistParallelWaveBaseline,
  runStrategistParallelWaveProductionSlice,
  runStrategistParallelWaveBoundarySlice,
  runStrategistParallelWaveFailureRecoverySlice,
  runStrategistParallelWaveEvidenceSlice,
  runStrategistParallelWavePropertyChecks,
  runStrategistParallelWaveFuzzValidation,
  runStrategistParallelWaveRunRecordFuzzValidation,
  runForgeStrategistParallelWaveRegressionGate,
  listStrategistParallelWaveContractProbesByCategory,
  STRATEGIST_PARALLEL_WAVE_CATEGORIES,
  getForgeP03B07BlockGate,
  getForgeP03B07ToB08Handoff,
  validateStrategistParallelWaveBlockHandoffContract,
  buildStrategistParallelWaveBlockGateEvidence,
  type StrategistParallelWaveBlockGateEvidence,
  type StrategistParallelWaveBlockHandoffContract,
  type ForgeStrategistParallelWaveRegressionGateResult,
} from "./forge-p03-strategist-parallel-wave.js";

export {
  getForgeP03B07BlockGate,
  getForgeP03B07ToB08Handoff,
  validateStrategistParallelWaveBlockHandoffContract,
  validateStrategistParallelWaveBlockHandoff,
  buildStrategistParallelWaveBlockGateEvidence,
  runForgeStrategistParallelWaveRegressionGate,
} from "./forge-p03-strategist-parallel-wave.js";

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

export interface ForgeStrategistParallelWaveBlockGateResult {
  passed: boolean;
  evidence: StrategistParallelWaveBlockGateEvidence;
  handoff: StrategistParallelWaveBlockHandoffContract;
  regression: ForgeStrategistParallelWaveRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealStrategistParallelWaveBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P03-B07 block gate: validate A01–A09 deliverables, regression, guard, and B08 handoff (P03-B07-A10).
 */
export function sealStrategistParallelWaveBlockGate(): ForgeStrategistParallelWaveBlockGateResult {
  const blockGate = getForgeP03B07BlockGate();
  const handoff = getForgeP03B07ToB08Handoff();
  const contract = getActiveStrategistParallelWaveContract();
  const fixture = loadStrategistParallelWaveBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateStrategistParallelWaveBaseline(fixture);
  const contractValidation = validateStrategistParallelWaveAgainstContract(fixture, contract);
  atomSeals.push(
    sealStrategistParallelWaveBlockAtom(
      "P03-B07-A01",
      "parallel_wave_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeStrategistParallelWaveCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeStrategistParallelWaveCoverage(contract);
  atomSeals.push(
    sealStrategistParallelWaveBlockAtom(
      "P03-B07-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${STRATEGIST_PARALLEL_WAVE_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runStrategistParallelWaveProductionSlice(fixture);
  atomSeals.push(
    sealStrategistParallelWaveBlockAtom(
      "P03-B07-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runStrategistParallelWaveBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.gap > 0;
  atomSeals.push(
    sealStrategistParallelWaveBlockAtom(
      "P03-B07-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} gap=${coverage.byDisposition.gap}`,
    ),
  );

  const failureRecoverySlice = runStrategistParallelWaveFailureRecoverySlice(fixture);
  const nogoPathProbes = listStrategistParallelWaveContractProbesByCategory("nogo_path", contract);
  atomSeals.push(
    sealStrategistParallelWaveBlockAtom(
      "P03-B07-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoPathProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoPathProbes.length} NO-GO path probes`,
    ),
  );

  const regression = runForgeStrategistParallelWaveRegressionGate();
  const evidenceSlice = runStrategistParallelWaveEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealStrategistParallelWaveBlockAtom(
      "P03-B07-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const properties = runStrategistParallelWavePropertyChecks(contract);
  const contractFuzz = runStrategistParallelWaveFuzzValidation(fixture, contract);
  const runFuzz = runStrategistParallelWaveRunRecordFuzzValidation(regression.record, contract);
  const fuzzOk =
    properties.allPassed && contractFuzz.allMutationsRejected && runFuzz.mutationsAccepted === 0;
  atomSeals.push(
    sealStrategistParallelWaveBlockAtom(
      "P03-B07-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${properties.passed}/${properties.total} contractFuzz rejected=${contractFuzz.rejected}/${contractFuzz.iterations} runFuzz rejected=${runFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealStrategistParallelWaveBlockAtom(
      "P03-B07-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealStrategistParallelWaveBlockAtom(
      "P03-B07-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateStrategistParallelWaveBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealStrategistParallelWaveBlockAtom(
      "P03-B07-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildStrategistParallelWaveBlockGateEvidence(
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
export const runStrategistParallelWaveBlockGate = sealStrategistParallelWaveBlockGate;
export const runForgeStrategistParallelWaveBlockGate = sealStrategistParallelWaveBlockGate;
