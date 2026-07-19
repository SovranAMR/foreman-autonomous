/**
 * FOREMAN — Worker Shell Process Probe Harness (P05-B04-A08 regression, P05-B04-A09 guard, P05-B04-A10 block gate)
 *
 * Forge pipeline regression gate for worker shell process probe matrix.
 */

import { execSync } from "node:child_process";
import {
  runWorkerShellProcessIntegrationSlice,
  runWorkerShellProcessGuardSlice,
  type WorkerShellProcessIntegrationSliceResult,
  type WorkerShellProcessGuardSliceResult,
  type WorkerShellProcessRunRecord,
  detectWorkerShellProcessProbeRegression,
  runWorkerShellProcessProbesWithRecord,
  loadWorkerShellProcessBaseline,
  validateWorkerShellProcessBaseline,
  validateWorkerShellProcessAgainstContract,
  getActiveWorkerShellProcessContract,
  summarizeWorkerShellProcessContractCoverage,
  runWorkerShellProcessProductionSlice,
  runWorkerShellProcessBoundarySlice,
  runWorkerShellProcessFailureRecoverySlice,
  runWorkerShellProcessEvidenceSlice,
  runWorkerShellProcessPropertyFuzzSlice,
  listWorkerShellProcessProbesByDisposition,
  listWorkerShellProcessContractProbesByCategory,
  getForgeP05B04BlockGate,
  getForgeP05B04ToB05Handoff,
  validateWorkerShellProcessBlockHandoffContract,
  buildWorkerShellProcessBlockGateEvidence,
  validateForgeWorkerShellProcessBlockGate,
  type WorkerShellProcessBlockGateEvidence,
  type WorkerShellProcessBlockHandoffContract,
  WORKER_SHELL_PROCESS_CATEGORIES,
} from "./forge-p05-worker-shell-process.js";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";

export {
  runWorkerShellProcessProbesWithRecord,
  detectWorkerShellProcessProbeRegression,
  runWorkerShellProcessIntegrationSlice,
  runWorkerShellProcessGuardSlice,
  getForgeP05B04BlockGate,
  getForgeP05B04ToB05Handoff,
  validateWorkerShellProcessBlockHandoffContract,
  buildWorkerShellProcessBlockGateEvidence,
  validateForgeWorkerShellProcessBlockGate,
} from "./forge-p05-worker-shell-process.js";

export type ForgeWorkerShellProcessRegressionGateResult = WorkerShellProcessIntegrationSliceResult;
export type ForgeWorkerShellProcessGuardGateResult = WorkerShellProcessGuardSliceResult;

/**
 * Worker shell process regression gate on canonical probe matrix (P05-B04-A08).
 */
export function runForgeWorkerShellProcessRegressionGate(
  priorRecord?: WorkerShellProcessRunRecord,
): ForgeWorkerShellProcessRegressionGateResult {
  return runWorkerShellProcessIntegrationSlice(priorRecord);
}

/**
 * Worker shell process guard gate — adversarial/perf/cost/safety (P05-B04-A09).
 */
export function runForgeWorkerShellProcessGuardGate(): ForgeWorkerShellProcessGuardGateResult {
  return runWorkerShellProcessGuardSlice();
}

/** Alias for forge-pipeline-regression integration seam (P05-B04-A08). */
export const runWorkerShellProcessRegressionIntegration = runForgeWorkerShellProcessRegressionGate;

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

export interface ForgeWorkerShellProcessBlockGateResult {
  passed: boolean;
  evidence: WorkerShellProcessBlockGateEvidence;
  handoff: WorkerShellProcessBlockHandoffContract;
  regression: ForgeWorkerShellProcessRegressionGateResult;
  guard: ForgeWorkerShellProcessGuardGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealWorkerShellProcessBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P05-B04 block gate: validate A01–A09 deliverables, regression, guard, and B05 handoff (P05-B04-A10).
 */
export function runWorkerShellProcessBlockGate(): ForgeWorkerShellProcessBlockGateResult {
  const blockGate = getForgeP05B04BlockGate();
  const handoff = getForgeP05B04ToB05Handoff();
  const contract = getActiveWorkerShellProcessContract();
  const fixture = loadWorkerShellProcessBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateWorkerShellProcessBaseline(fixture);
  const contractValidation = validateWorkerShellProcessAgainstContract(fixture, contract);
  atomSeals.push(
    sealWorkerShellProcessBlockAtom(
      "P05-B04-A01",
      "worker_shell_process_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeWorkerShellProcessContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeWorkerShellProcessContractCoverage(contract);
  atomSeals.push(
    sealWorkerShellProcessBlockAtom(
      "P05-B04-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${WORKER_SHELL_PROCESS_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runWorkerShellProcessProductionSlice(fixture);
  atomSeals.push(
    sealWorkerShellProcessBlockAtom(
      "P05-B04-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runWorkerShellProcessBoundarySlice(fixture);
  const nogoCategoryProbes = listWorkerShellProcessContractProbesByCategory("nogo_path", contract);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    nogoCategoryProbes.length > 0;
  atomSeals.push(
    sealWorkerShellProcessBlockAtom(
      "P05-B04-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo_path=${nogoCategoryProbes.length}`,
    ),
  );

  const failureRecoverySlice = runWorkerShellProcessFailureRecoverySlice(fixture);
  const nogoProbes = listWorkerShellProcessContractProbesByCategory("nogo_path", contract);
  atomSeals.push(
    sealWorkerShellProcessBlockAtom(
      "P05-B04-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoProbes.length} NO-GO probes`,
    ),
  );

  const evidenceSlice = runWorkerShellProcessEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealWorkerShellProcessBlockAtom(
      "P05-B04-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const propertyFuzzSlice = runWorkerShellProcessPropertyFuzzSlice(fixture);
  const fuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;
  atomSeals.push(
    sealWorkerShellProcessBlockAtom(
      "P05-B04-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${propertyFuzzSlice.propertyResult.passed}/${propertyFuzzSlice.propertyResult.total} contractFuzz rejected=${propertyFuzzSlice.contractFuzz.rejected}/${propertyFuzzSlice.contractFuzz.iterations} runFuzz rejected=${propertyFuzzSlice.runRecordFuzz.mutationsRejected}/3`,
    ),
  );

  const regression = runForgeWorkerShellProcessRegressionGate();
  atomSeals.push(
    sealWorkerShellProcessBlockAtom(
      "P05-B04-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  const guard = runForgeWorkerShellProcessGuardGate();
  atomSeals.push(
    sealWorkerShellProcessBlockAtom(
      "P05-B04-A09",
      "guard_controls",
      guard.passed,
      guard.passed
        ? `adversarial=${guard.guard.metrics.adversarialScenariosRejected}/${guard.guard.metrics.adversarialScenariosTotal}`
        : guard.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateWorkerShellProcessBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealWorkerShellProcessBlockAtom(
      "P05-B04-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const blockGateValidation = validateForgeWorkerShellProcessBlockGate(atomSeals, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: guard.passed,
  });

  const evidence = buildWorkerShellProcessBlockGateEvidence(
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
export const runForgeWorkerShellProcessBlockGate = runWorkerShellProcessBlockGate;
