/**
 * FOREMAN — Strategist Dependency DAG Probe Harness (P03-B04-A10 block gate)
 *
 * Regression gate with guard integration and P03-B04 block gate sealing.
 */

import { execSync } from "node:child_process";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import {
  getActiveStrategistDependencyDagContract,
  summarizeStrategistDependencyDagCoverage,
  validateStrategistDependencyDagBaseline,
  validateStrategistDependencyDagAgainstContract,
  loadStrategistDependencyDagBaseline,
  runStrategistDependencyDagProductionSlice,
  runStrategistDependencyDagBoundarySlice,
  runStrategistDependencyDagFailureRecoverySlice,
  runStrategistDependencyDagEvidenceSlice,
  runStrategistDependencyDagPropertyChecks,
  runStrategistDependencyDagFuzzValidation,
  runStrategistDependencyDagRunRecordFuzzValidation,
  runStrategistDependencyDagForgeRegression,
  validateStrategistDependencyDagRunRecord,
  validateForgeStrategistDependencyDagGuard,
  listStrategistDependencyDagContractProbesByCategory,
  STRATEGIST_DEPENDENCY_DAG_CATEGORIES,
  getForgeP03B04BlockGate,
  getForgeP03B04ToB05Handoff,
  validateStrategistDependencyDagBlockHandoffContract,
  buildStrategistDependencyDagBlockGateEvidence,
  type StrategistDependencyDagBlockGateEvidence,
  type StrategistDependencyDagBlockHandoffContract,
  type StrategistDependencyDagForgeRegressionResult,
  type StrategistDependencyDagGuardCheckResult,
  type StrategistDependencyDagRunRecord,
} from "./forge-p03-strategist-dependency-dag.js";

export {
  getForgeP03B04BlockGate,
  getForgeP03B04ToB05Handoff,
  validateStrategistDependencyDagBlockHandoffContract,
  buildStrategistDependencyDagBlockGateEvidence,
} from "./forge-p03-strategist-dependency-dag.js";

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

export interface ForgeStrategistDependencyDagRegressionGateResult
  extends StrategistDependencyDagForgeRegressionResult {
  guard: StrategistDependencyDagGuardCheckResult;
}

/**
 * Dependency DAG regression gate with guard controls (P03-B04-A08 + A09 integration).
 */
export function runForgeStrategistDependencyDagRegressionGate(
  priorRecord?: StrategistDependencyDagRunRecord,
): ForgeStrategistDependencyDagRegressionGateResult {
  const contract = getActiveStrategistDependencyDagContract();
  const regression = runStrategistDependencyDagForgeRegression(priorRecord);
  const guard = validateForgeStrategistDependencyDagGuard(regression.record, {
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

export interface ForgeStrategistDependencyDagBlockGateResult {
  passed: boolean;
  evidence: StrategistDependencyDagBlockGateEvidence;
  handoff: StrategistDependencyDagBlockHandoffContract;
  regression: ForgeStrategistDependencyDagRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealStrategistDependencyDagBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P03-B04 block gate: validate A01–A09 deliverables, regression, guard, and B05 handoff (P03-B04-A10).
 */
export function sealStrategistDependencyDagBlockGate(): ForgeStrategistDependencyDagBlockGateResult {
  const blockGate = getForgeP03B04BlockGate();
  const handoff = getForgeP03B04ToB05Handoff();
  const contract = getActiveStrategistDependencyDagContract();
  const fixture = loadStrategistDependencyDagBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateStrategistDependencyDagBaseline(fixture);
  const contractValidation = validateStrategistDependencyDagAgainstContract(fixture, contract);
  atomSeals.push(
    sealStrategistDependencyDagBlockAtom(
      "P03-B04-A01",
      "dependency_dag_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeStrategistDependencyDagCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeStrategistDependencyDagCoverage(contract);
  atomSeals.push(
    sealStrategistDependencyDagBlockAtom(
      "P03-B04-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${STRATEGIST_DEPENDENCY_DAG_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runStrategistDependencyDagProductionSlice(fixture);
  atomSeals.push(
    sealStrategistDependencyDagBlockAtom(
      "P03-B04-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runStrategistDependencyDagBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.gap > 0;
  atomSeals.push(
    sealStrategistDependencyDagBlockAtom(
      "P03-B04-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} gap=${coverage.byDisposition.gap}`,
    ),
  );

  const failureRecoverySlice = runStrategistDependencyDagFailureRecoverySlice(fixture);
  const nogoPathProbes = listStrategistDependencyDagContractProbesByCategory("nogo_path", contract);
  atomSeals.push(
    sealStrategistDependencyDagBlockAtom(
      "P03-B04-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoPathProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoPathProbes.length} NO-GO path probes`,
    ),
  );

  const regression = runForgeStrategistDependencyDagRegressionGate();
  const evidenceSlice = runStrategistDependencyDagEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealStrategistDependencyDagBlockAtom(
      "P03-B04-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const properties = runStrategistDependencyDagPropertyChecks(contract);
  const contractFuzz = runStrategistDependencyDagFuzzValidation(fixture, contract);
  const runFuzz = runStrategistDependencyDagRunRecordFuzzValidation(regression.record, contract);
  const fuzzOk =
    properties.allPassed && contractFuzz.allMutationsRejected && runFuzz.mutationsAccepted === 0;
  atomSeals.push(
    sealStrategistDependencyDagBlockAtom(
      "P03-B04-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${properties.passed}/${properties.total} contractFuzz rejected=${contractFuzz.rejected}/${contractFuzz.iterations} runFuzz rejected=${runFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealStrategistDependencyDagBlockAtom(
      "P03-B04-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealStrategistDependencyDagBlockAtom(
      "P03-B04-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateStrategistDependencyDagBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealStrategistDependencyDagBlockAtom(
      "P03-B04-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildStrategistDependencyDagBlockGateEvidence(
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
export const runStrategistDependencyDagBlockGate = sealStrategistDependencyDagBlockGate;
export const runForgeStrategistDependencyDagBlockGate = sealStrategistDependencyDagBlockGate;
