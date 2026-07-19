/**
 * FOREMAN — Worker Edit Engine Probe Harness (P05-B03-A08 regression, P05-B03-A09 guard, P05-B03-A10 block gate)
 *
 * Forge pipeline regression gate for worker edit engine probe matrix.
 */

import { execSync } from "node:child_process";
import {
  runWorkerEditEngineIntegrationSlice,
  runWorkerEditEngineGuardSlice,
  type WorkerEditEngineIntegrationSliceResult,
  type WorkerEditEngineGuardSliceResult,
  type WorkerEditEngineRunRecord,
  detectWorkerEditEngineProbeRegression,
  runWorkerEditEngineProbesWithRecord,
  loadWorkerEditEngineBaseline,
  validateWorkerEditEngineBaseline,
  validateWorkerEditEngineAgainstContract,
  getActiveWorkerEditEngineContract,
  summarizeWorkerEditEngineContractCoverage,
  runWorkerEditEngineProductionSlice,
  runWorkerEditEngineBoundarySlice,
  runWorkerEditEngineFailureRecoverySlice,
  runWorkerEditEngineEvidenceSlice,
  runWorkerEditEnginePropertyFuzzSlice,
  listWorkerEditEngineProbesByDisposition,
  listWorkerEditEngineContractProbesByCategory,
  getForgeP05B03BlockGate,
  getForgeP05B03ToB04Handoff,
  validateWorkerEditEngineBlockHandoffContract,
  buildWorkerEditEngineBlockGateEvidence,
  validateForgeWorkerEditEngineBlockGate,
  type WorkerEditEngineBlockGateEvidence,
  type WorkerEditEngineBlockHandoffContract,
  WORKER_EDIT_ENGINE_CATEGORIES,
} from "./forge-p05-worker-edit-engine.js";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";

export {
  runWorkerEditEngineProbesWithRecord,
  detectWorkerEditEngineProbeRegression,
  runWorkerEditEngineIntegrationSlice,
  runWorkerEditEngineGuardSlice,
  getForgeP05B03BlockGate,
  getForgeP05B03ToB04Handoff,
  validateWorkerEditEngineBlockHandoffContract,
  buildWorkerEditEngineBlockGateEvidence,
  validateForgeWorkerEditEngineBlockGate,
} from "./forge-p05-worker-edit-engine.js";

export type ForgeWorkerEditEngineRegressionGateResult = WorkerEditEngineIntegrationSliceResult;
export type ForgeWorkerEditEngineGuardGateResult = WorkerEditEngineGuardSliceResult;

/**
 * Worker edit engine regression gate on canonical probe matrix (P05-B03-A08).
 */
export function runForgeWorkerEditEngineRegressionGate(
  priorRecord?: WorkerEditEngineRunRecord,
): ForgeWorkerEditEngineRegressionGateResult {
  return runWorkerEditEngineIntegrationSlice(priorRecord);
}

/**
 * Worker edit engine guard gate — adversarial/perf/cost/safety (P05-B03-A09).
 */
export function runForgeWorkerEditEngineGuardGate(): ForgeWorkerEditEngineGuardGateResult {
  return runWorkerEditEngineGuardSlice();
}

/** Alias for forge-pipeline-regression integration seam (P05-B03-A08). */
export const runWorkerEditEngineRegressionIntegration = runForgeWorkerEditEngineRegressionGate;

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

export interface ForgeWorkerEditEngineBlockGateResult {
  passed: boolean;
  evidence: WorkerEditEngineBlockGateEvidence;
  handoff: WorkerEditEngineBlockHandoffContract;
  regression: ForgeWorkerEditEngineRegressionGateResult;
  guard: ForgeWorkerEditEngineGuardGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealWorkerEditEngineBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P05-B03 block gate: validate A01–A09 deliverables, regression, guard, and B04 handoff (P05-B03-A10).
 */
export function runWorkerEditEngineBlockGate(): ForgeWorkerEditEngineBlockGateResult {
  const blockGate = getForgeP05B03BlockGate();
  const handoff = getForgeP05B03ToB04Handoff();
  const contract = getActiveWorkerEditEngineContract();
  const fixture = loadWorkerEditEngineBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateWorkerEditEngineBaseline(fixture);
  const contractValidation = validateWorkerEditEngineAgainstContract(fixture, contract);
  atomSeals.push(
    sealWorkerEditEngineBlockAtom(
      "P05-B03-A01",
      "worker_edit_engine_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeWorkerEditEngineContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeWorkerEditEngineContractCoverage(contract);
  atomSeals.push(
    sealWorkerEditEngineBlockAtom(
      "P05-B03-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${WORKER_EDIT_ENGINE_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runWorkerEditEngineProductionSlice(fixture);
  atomSeals.push(
    sealWorkerEditEngineBlockAtom(
      "P05-B03-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runWorkerEditEngineBoundarySlice(fixture);
  const nogoCategoryProbes = listWorkerEditEngineContractProbesByCategory("nogo_path", contract);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    nogoCategoryProbes.length > 0;
  atomSeals.push(
    sealWorkerEditEngineBlockAtom(
      "P05-B03-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo_path=${nogoCategoryProbes.length}`,
    ),
  );

  const failureRecoverySlice = runWorkerEditEngineFailureRecoverySlice(fixture);
  const nogoProbes = listWorkerEditEngineContractProbesByCategory("nogo_path", contract);
  atomSeals.push(
    sealWorkerEditEngineBlockAtom(
      "P05-B03-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoProbes.length} NO-GO probes`,
    ),
  );

  const evidenceSlice = runWorkerEditEngineEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealWorkerEditEngineBlockAtom(
      "P05-B03-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const propertyFuzzSlice = runWorkerEditEnginePropertyFuzzSlice(fixture);
  const fuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;
  atomSeals.push(
    sealWorkerEditEngineBlockAtom(
      "P05-B03-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${propertyFuzzSlice.propertyResult.passed}/${propertyFuzzSlice.propertyResult.total} contractFuzz rejected=${propertyFuzzSlice.contractFuzz.rejected}/${propertyFuzzSlice.contractFuzz.iterations} runFuzz rejected=${propertyFuzzSlice.runRecordFuzz.mutationsRejected}/3`,
    ),
  );

  const regression = runForgeWorkerEditEngineRegressionGate();
  atomSeals.push(
    sealWorkerEditEngineBlockAtom(
      "P05-B03-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  const guard = runForgeWorkerEditEngineGuardGate();
  atomSeals.push(
    sealWorkerEditEngineBlockAtom(
      "P05-B03-A09",
      "guard_controls",
      guard.passed,
      guard.passed
        ? `adversarial=${guard.guard.metrics.adversarialScenariosRejected}/${guard.guard.metrics.adversarialScenariosTotal}`
        : guard.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateWorkerEditEngineBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealWorkerEditEngineBlockAtom(
      "P05-B03-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const blockGateValidation = validateForgeWorkerEditEngineBlockGate(atomSeals, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: guard.passed,
  });

  const evidence = buildWorkerEditEngineBlockGateEvidence(
    atomSeals,
    regression.passed,
    guard.passed,
    regression.record.summary.total,
    resolveGitCommit(),
  );

  const detailParts = [
    `block=${blockGate.blockId} seals=${atomSeals.filter(s => s.passed).length}/${atomSeals.length}`,
    `regression=${regression.passed ? "PASS" : "FAIL"}`,
    `guard=${guard.passed ? "PASS" : "FAIL"}`,
    `handoff=${evidence.handoffValid ? "PASS" : "FAIL"}→${handoff.targetBlock.blockId}`,
  ];

  return {
    passed: blockGatePass && evidence.handoffValid && blockGateValidation.valid,
    evidence,
    handoff,
    regression,
    guard,
    atomSeals,
    detail: detailParts.join(" | "),
  };
}

/** Alias matching ACTIVE_FRONT target name. */
export const runForgeWorkerEditEngineBlockGate = runWorkerEditEngineBlockGate;
