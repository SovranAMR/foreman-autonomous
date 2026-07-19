/**
 * FOREMAN — Researcher Citation Provenance Graph Probe Harness (P04-B05-A08 regression, P04-B05-A10 block gate)
 *
 * Forge pipeline regression gate for citation provenance graph probe matrix.
 */

import {
  runResearcherCitationProvenanceGraphForgeRegression,
  type ResearcherCitationProvenanceGraphForgeRegressionResult,
  type ResearcherCitationProvenanceGraphRunRecord,
  detectResearcherCitationProvenanceGraphProbeRegression,
  runResearcherCitationProvenanceGraphProbesWithRecord,
  loadResearcherCitationProvenanceGraphBaseline,
  validateResearcherCitationProvenanceGraphBaseline,
  validateResearcherCitationProvenanceGraphAgainstContract,
  getActiveResearcherCitationProvenanceGraphContract,
  summarizeResearcherCitationProvenanceGraphContractCoverage,
  runResearcherCitationProvenanceGraphProductionSlice,
  runResearcherCitationProvenanceGraphBoundarySlice,
  runResearcherCitationProvenanceGraphFailureRecoverySlice,
  runResearcherCitationProvenanceGraphEvidenceSlice,
  runResearcherCitationProvenanceGraphPropertyFuzzSlice,
  listResearcherCitationProvenanceGraphProbesByDisposition,
  RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES,
  getForgeP04B05BlockGate,
  getForgeP04B05ToB06Handoff,
  validateResearcherCitationProvenanceGraphBlockHandoffContract,
  buildResearcherCitationProvenanceGraphBlockGateEvidence,
  type ResearcherCitationProvenanceGraphBlockGateEvidence,
  type ResearcherCitationProvenanceGraphBlockHandoffContract,
} from "./forge-p04-researcher-citation-provenance-graph.js";
import type { ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import { execSync } from "node:child_process";

export {
  detectResearcherCitationProvenanceGraphProbeRegression,
  runResearcherCitationProvenanceGraphProbesWithRecord,
  getForgeP04B05BlockGate,
  getForgeP04B05ToB06Handoff,
  validateResearcherCitationProvenanceGraphBlockHandoffContract,
  buildResearcherCitationProvenanceGraphBlockGateEvidence,
} from "./forge-p04-researcher-citation-provenance-graph.js";

export type ForgeResearcherCitationProvenanceGraphRegressionGateResult =
  ResearcherCitationProvenanceGraphForgeRegressionResult;

/**
 * Citation provenance graph regression gate on canonical probe matrix (P04-B05-A08).
 */
export function runForgeResearcherCitationProvenanceGraphRegressionGate(
  priorRecord?: ResearcherCitationProvenanceGraphRunRecord,
): ForgeResearcherCitationProvenanceGraphRegressionGateResult {
  return runResearcherCitationProvenanceGraphForgeRegression(priorRecord);
}

/** Alias for forge-pipeline-regression integration seam (P04-B05-A08). */
export const runResearcherCitationProvenanceGraphRegressionIntegration =
  runForgeResearcherCitationProvenanceGraphRegressionGate;

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

export interface ForgeResearcherCitationProvenanceGraphBlockGateResult {
  passed: boolean;
  evidence: ResearcherCitationProvenanceGraphBlockGateEvidence;
  handoff: ResearcherCitationProvenanceGraphBlockHandoffContract;
  regression: ForgeResearcherCitationProvenanceGraphRegressionGateResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealResearcherCitationProvenanceGraphBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P04-B05 block gate: validate A01–A09 deliverables, regression, guard, and B06 handoff (P04-B05-A10).
 */
export function runResearcherCitationProvenanceGraphBlockGate(): ForgeResearcherCitationProvenanceGraphBlockGateResult {
  const blockGate = getForgeP04B05BlockGate();
  const handoff = getForgeP04B05ToB06Handoff();
  const contract = getActiveResearcherCitationProvenanceGraphContract();
  const fixture = loadResearcherCitationProvenanceGraphBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateResearcherCitationProvenanceGraphBaseline(fixture);
  const contractValidation = validateResearcherCitationProvenanceGraphAgainstContract(fixture, contract);
  atomSeals.push(
    sealResearcherCitationProvenanceGraphBlockAtom(
      "P04-B05-A01",
      "citation_provenance_graph_baseline",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeResearcherCitationProvenanceGraphContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeResearcherCitationProvenanceGraphContractCoverage(contract);
  atomSeals.push(
    sealResearcherCitationProvenanceGraphBlockAtom(
      "P04-B05-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runResearcherCitationProvenanceGraphProductionSlice(fixture);
  atomSeals.push(
    sealResearcherCitationProvenanceGraphBlockAtom(
      "P04-B05-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runResearcherCitationProvenanceGraphBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealResearcherCitationProvenanceGraphBlockAtom(
      "P04-B05-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const failureRecoverySlice = runResearcherCitationProvenanceGraphFailureRecoverySlice(fixture);
  const nogoProbes = listResearcherCitationProvenanceGraphProbesByDisposition("nogo", contract);
  atomSeals.push(
    sealResearcherCitationProvenanceGraphBlockAtom(
      "P04-B05-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoProbes.length} NO-GO probes`,
    ),
  );

  const regression = runForgeResearcherCitationProvenanceGraphRegressionGate();
  const evidenceSlice = runResearcherCitationProvenanceGraphEvidenceSlice(fixture);
  const evidenceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.record.evidence.length === evidenceSlice.evidenceProbeCount &&
    evidenceSlice.record.telemetry.length === evidenceSlice.evidenceProbeCount;
  atomSeals.push(
    sealResearcherCitationProvenanceGraphBlockAtom(
      "P04-B05-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${evidenceSlice.record.evidence.length} telemetry=${evidenceSlice.record.telemetry.length}`
        : evidenceSlice.recordValidation.issues.map(i => i.detail).join("; ") || "evidence slice failed",
    ),
  );

  const propertyFuzzSlice = runResearcherCitationProvenanceGraphPropertyFuzzSlice(fixture);
  const fuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;
  atomSeals.push(
    sealResearcherCitationProvenanceGraphBlockAtom(
      "P04-B05-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${propertyFuzzSlice.propertyResult.passed}/${propertyFuzzSlice.propertyResult.total} contractFuzz rejected=${propertyFuzzSlice.contractFuzz.rejected}/${propertyFuzzSlice.contractFuzz.iterations} runFuzz rejected=${propertyFuzzSlice.runRecordFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealResearcherCitationProvenanceGraphBlockAtom(
      "P04-B05-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealResearcherCitationProvenanceGraphBlockAtom(
      "P04-B05-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateResearcherCitationProvenanceGraphBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealResearcherCitationProvenanceGraphBlockAtom(
      "P04-B05-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildResearcherCitationProvenanceGraphBlockGateEvidence(
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
export const runForgeResearcherCitationProvenanceGraphBlockGate =
  runResearcherCitationProvenanceGraphBlockGate;
