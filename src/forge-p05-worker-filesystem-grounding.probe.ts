/**
 * FOREMAN — Worker Filesystem Grounding Probe Harness (P05-B02-A08 regression, P05-B02-A09 guard, P05-B02-A10 block gate)
 *
 * Forge pipeline regression gate for worker filesystem grounding probe matrix.
 */

import { execSync } from "node:child_process";
import {
  runWorkerFilesystemGroundingIntegrationSlice,
  runWorkerFilesystemGroundingGuardSlice,
  type WorkerFilesystemGroundingIntegrationSliceResult,
  type WorkerFilesystemGroundingGuardSliceResult,
  type WorkerFilesystemGroundingRunRecord,
  detectWorkerFilesystemGroundingProbeRegression,
  runWorkerFilesystemGroundingProbesWithRecord,
  loadWorkerFilesystemGroundingBaseline,
  validateWorkerFilesystemGroundingBaseline,
  validateWorkerFilesystemGroundingAgainstContract,
  getActiveWorkerFilesystemGroundingContract,
  summarizeWorkerFilesystemGroundingContractCoverage,
  runWorkerFilesystemGroundingProductionSlice,
  runWorkerFilesystemGroundingBoundarySlice,
  runWorkerFilesystemGroundingFailureRecoverySlice,
  runWorkerFilesystemGroundingEvidenceSlice,
  runWorkerFilesystemGroundingPropertyFuzzSlice,
  listWorkerFilesystemGroundingProbesByDisposition,
  WORKER_FILESYSTEM_GROUNDING_CATEGORIES,
  getForgeP05B02BlockGate,
  getForgeP05B02ToB03Handoff,
  validateWorkerFilesystemGroundingBlockHandoffContract,
  buildWorkerFilesystemGroundingBlockGateEvidence,
  validateForgeWorkerFilesystemGroundingBlockGate,
  type WorkerFilesystemGroundingBlockGateEvidence,
  type WorkerFilesystemGroundingBlockHandoffContract,
} from "./forge-p05-worker-filesystem-grounding.js";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";

export {
  runWorkerFilesystemGroundingProbesWithRecord,
  detectWorkerFilesystemGroundingProbeRegression,
  runWorkerFilesystemGroundingIntegrationSlice,
  runWorkerFilesystemGroundingGuardSlice,
  getForgeP05B02BlockGate,
  getForgeP05B02ToB03Handoff,
  validateWorkerFilesystemGroundingBlockHandoffContract,
  buildWorkerFilesystemGroundingBlockGateEvidence,
  validateForgeWorkerFilesystemGroundingBlockGate,
} from "./forge-p05-worker-filesystem-grounding.js";

export type ForgeWorkerFilesystemGroundingRegressionGateResult =
  WorkerFilesystemGroundingIntegrationSliceResult;
export type ForgeWorkerFilesystemGroundingGuardGateResult =
  WorkerFilesystemGroundingGuardSliceResult;

/**
 * Worker filesystem grounding regression gate on canonical probe matrix (P05-B02-A08).
 */
export function runForgeWorkerFilesystemGroundingRegressionGate(
  priorRecord?: WorkerFilesystemGroundingRunRecord,
): ForgeWorkerFilesystemGroundingRegressionGateResult {
  return runWorkerFilesystemGroundingIntegrationSlice(priorRecord);
}

/**
 * Worker filesystem grounding guard gate — adversarial/perf/cost/safety (P05-B02-A09).
 */
export function runForgeWorkerFilesystemGroundingGuardGate(): ForgeWorkerFilesystemGroundingGuardGateResult {
  return runWorkerFilesystemGroundingGuardSlice();
}

/** Alias for forge-pipeline-regression integration seam (P05-B02-A08). */
export const runWorkerFilesystemGroundingRegressionIntegration =
  runForgeWorkerFilesystemGroundingRegressionGate;

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

export interface ForgeWorkerFilesystemGroundingBlockGateResult {
  passed: boolean;
  evidence: WorkerFilesystemGroundingBlockGateEvidence;
  handoff: WorkerFilesystemGroundingBlockHandoffContract;
  regression: ForgeWorkerFilesystemGroundingRegressionGateResult;
  guard: ForgeWorkerFilesystemGroundingGuardGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealWorkerFilesystemGroundingBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P05-B02 block gate: validate A01–A09 deliverables, regression, guard, and B03 handoff (P05-B02-A10).
 */
export function runWorkerFilesystemGroundingBlockGate(): ForgeWorkerFilesystemGroundingBlockGateResult {
  const blockGate = getForgeP05B02BlockGate();
  const handoff = getForgeP05B02ToB03Handoff();
  const contract = getActiveWorkerFilesystemGroundingContract();
  const fixture = loadWorkerFilesystemGroundingBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateWorkerFilesystemGroundingBaseline(fixture);
  const contractValidation = validateWorkerFilesystemGroundingAgainstContract(fixture, contract);
  atomSeals.push(
    sealWorkerFilesystemGroundingBlockAtom(
      "P05-B02-A01",
      "worker_filesystem_grounding_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeWorkerFilesystemGroundingContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeWorkerFilesystemGroundingContractCoverage(contract);
  atomSeals.push(
    sealWorkerFilesystemGroundingBlockAtom(
      "P05-B02-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${WORKER_FILESYSTEM_GROUNDING_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runWorkerFilesystemGroundingProductionSlice(fixture);
  atomSeals.push(
    sealWorkerFilesystemGroundingBlockAtom(
      "P05-B02-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runWorkerFilesystemGroundingBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealWorkerFilesystemGroundingBlockAtom(
      "P05-B02-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const failureRecoverySlice = runWorkerFilesystemGroundingFailureRecoverySlice(fixture);
  const nogoProbes = listWorkerFilesystemGroundingProbesByDisposition("nogo", contract);
  atomSeals.push(
    sealWorkerFilesystemGroundingBlockAtom(
      "P05-B02-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoProbes.length} NO-GO probes`,
    ),
  );

  const evidenceSlice = runWorkerFilesystemGroundingEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealWorkerFilesystemGroundingBlockAtom(
      "P05-B02-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const propertyFuzzSlice = runWorkerFilesystemGroundingPropertyFuzzSlice(fixture);
  const fuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;
  atomSeals.push(
    sealWorkerFilesystemGroundingBlockAtom(
      "P05-B02-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${propertyFuzzSlice.propertyResult.passed}/${propertyFuzzSlice.propertyResult.total} contractFuzz rejected=${propertyFuzzSlice.contractFuzz.rejected}/${propertyFuzzSlice.contractFuzz.iterations} runFuzz rejected=${propertyFuzzSlice.runRecordFuzz.mutationsRejected}/3`,
    ),
  );

  const regression = runForgeWorkerFilesystemGroundingRegressionGate();
  atomSeals.push(
    sealWorkerFilesystemGroundingBlockAtom(
      "P05-B02-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  const guard = runForgeWorkerFilesystemGroundingGuardGate();
  atomSeals.push(
    sealWorkerFilesystemGroundingBlockAtom(
      "P05-B02-A09",
      "guard_controls",
      guard.passed,
      guard.passed
        ? `adversarial=${guard.guard.metrics.adversarialScenariosRejected}/${guard.guard.metrics.adversarialScenariosTotal}`
        : guard.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateWorkerFilesystemGroundingBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealWorkerFilesystemGroundingBlockAtom(
      "P05-B02-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const blockGateValidation = validateForgeWorkerFilesystemGroundingBlockGate(atomSeals, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: guard.passed,
  });

  const evidence = buildWorkerFilesystemGroundingBlockGateEvidence(
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
export const runForgeWorkerFilesystemGroundingBlockGate = runWorkerFilesystemGroundingBlockGate;
