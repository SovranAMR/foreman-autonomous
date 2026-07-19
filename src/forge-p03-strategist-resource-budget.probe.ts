/**
 * FOREMAN — Strategist Resource Budget Probe Harness (P03-B06-A10 block gate)
 *
 * Regression gate with guard integration and P03-B06 block gate sealing.
 */

import { execSync } from "node:child_process";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import {
  getActiveStrategistResourceBudgetContract,
  summarizeStrategistResourceBudgetCoverage,
  validateStrategistResourceBudgetBaseline,
  validateStrategistResourceBudgetAgainstContract,
  loadStrategistResourceBudgetBaseline,
  runStrategistResourceBudgetProductionSlice,
  runStrategistResourceBudgetBoundarySlice,
  runStrategistResourceBudgetFailureRecoverySlice,
  runStrategistResourceBudgetEvidenceSlice,
  runStrategistResourceBudgetPropertyChecks,
  runStrategistResourceBudgetFuzzValidation,
  runStrategistResourceBudgetRunRecordFuzzValidation,
  runForgeStrategistResourceBudgetRegressionGate,
  getForgeP03B06BlockGate,
  getForgeP03B06ToB07Handoff,
  validateStrategistResourceBudgetBlockHandoffContract,
  buildStrategistResourceBudgetBlockGateEvidence,
  listStrategistResourceBudgetContractProbesByCategory,
  STRATEGIST_RESOURCE_BUDGET_CATEGORIES,
  type StrategistResourceBudgetBlockGateEvidence,
  type StrategistResourceBudgetBlockHandoffContract,
  type ForgeStrategistResourceBudgetRegressionGateResult,
} from "./forge-p03-strategist-resource-budget.js";

export {
  getForgeP03B06BlockGate,
  getForgeP03B06ToB07Handoff,
  validateStrategistResourceBudgetBlockHandoffContract,
  buildStrategistResourceBudgetBlockGateEvidence,
  runForgeStrategistResourceBudgetRegressionGate,
} from "./forge-p03-strategist-resource-budget.js";

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

export interface ForgeStrategistResourceBudgetBlockGateResult {
  passed: boolean;
  evidence: StrategistResourceBudgetBlockGateEvidence;
  handoff: StrategistResourceBudgetBlockHandoffContract;
  regression: ForgeStrategistResourceBudgetRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealStrategistResourceBudgetBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P03-B06 block gate: validate A01–A09 deliverables, regression, guard, and B07 handoff (P03-B06-A10).
 */
export function sealStrategistResourceBudgetBlockGate(): ForgeStrategistResourceBudgetBlockGateResult {
  const blockGate = getForgeP03B06BlockGate();
  const handoff = getForgeP03B06ToB07Handoff();
  const contract = getActiveStrategistResourceBudgetContract();
  const fixture = loadStrategistResourceBudgetBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateStrategistResourceBudgetBaseline(fixture);
  const contractValidation = validateStrategistResourceBudgetAgainstContract(fixture, contract);
  atomSeals.push(
    sealStrategistResourceBudgetBlockAtom(
      "P03-B06-A01",
      "resource_budget_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeStrategistResourceBudgetCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeStrategistResourceBudgetCoverage(contract);
  atomSeals.push(
    sealStrategistResourceBudgetBlockAtom(
      "P03-B06-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${STRATEGIST_RESOURCE_BUDGET_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runStrategistResourceBudgetProductionSlice(fixture);
  atomSeals.push(
    sealStrategistResourceBudgetBlockAtom(
      "P03-B06-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runStrategistResourceBudgetBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.gap > 0;
  atomSeals.push(
    sealStrategistResourceBudgetBlockAtom(
      "P03-B06-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} gap=${coverage.byDisposition.gap}`,
    ),
  );

  const failureRecoverySlice = runStrategistResourceBudgetFailureRecoverySlice(fixture);
  const nogoPathProbes = listStrategistResourceBudgetContractProbesByCategory("nogo_path", contract);
  atomSeals.push(
    sealStrategistResourceBudgetBlockAtom(
      "P03-B06-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoPathProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoPathProbes.length} NO-GO path probes`,
    ),
  );

  const regression = runForgeStrategistResourceBudgetRegressionGate();
  const evidenceSlice = runStrategistResourceBudgetEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealStrategistResourceBudgetBlockAtom(
      "P03-B06-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const properties = runStrategistResourceBudgetPropertyChecks(contract);
  const contractFuzz = runStrategistResourceBudgetFuzzValidation(fixture, contract);
  const runFuzz = runStrategistResourceBudgetRunRecordFuzzValidation(regression.record, contract);
  const fuzzOk =
    properties.allPassed && contractFuzz.allMutationsRejected && runFuzz.mutationsAccepted === 0;
  atomSeals.push(
    sealStrategistResourceBudgetBlockAtom(
      "P03-B06-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${properties.passed}/${properties.total} contractFuzz rejected=${contractFuzz.rejected}/${contractFuzz.iterations} runFuzz rejected=${runFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealStrategistResourceBudgetBlockAtom(
      "P03-B06-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealStrategistResourceBudgetBlockAtom(
      "P03-B06-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateStrategistResourceBudgetBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealStrategistResourceBudgetBlockAtom(
      "P03-B06-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildStrategistResourceBudgetBlockGateEvidence(
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
export const runStrategistResourceBudgetBlockGate = sealStrategistResourceBudgetBlockGate;
export const runForgeStrategistResourceBudgetBlockGate = sealStrategistResourceBudgetBlockGate;
