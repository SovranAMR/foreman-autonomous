/**
 * FOREMAN — Researcher Phase Gate Probe Harness (P04-B10-A01)
 *
 * Static probes for P04 researcher phase gate baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP04B09ToB10Handoff,
  getActiveResearcherResearchToWorkerHandoffContract,
  summarizeResearcherResearchToWorkerHandoffContractCoverage,
} from "./forge-p04-researcher-research-to-worker-handoff.js";
import {
  assessResearcherPhaseGateInputBoundary,
  buildP04ResearcherPhaseGateEvidence,
  recoverResearcherPhaseGateEvidence,
  validateForgeP04ResearcherPhaseGateEvidence,
  validateResearcherPhaseGateBaseline,
  getActiveResearcherPhaseGateContract,
  getResearcherPhaseGateCategoryContract,
  listResearcherPhaseGateContractProbeIds,
  listResearcherPhaseGateContractProbesByCategory,
  listResearcherPhaseGateProbesByDisposition,
  summarizeResearcherPhaseGateContractCoverage,
  validateResearcherPhaseGateContract,
  validateResearcherPhaseGateContractCoverage,
  validateResearcherPhaseGateAgainstContract,
  summarizeResearcherPhaseGateMatrix,
  listResearcherPhaseGateProbesByExpected,
  listResearcherPhaseGateKnownGaps,
  validateResearcherPhaseGateProbeMatrix,
  validateResearcherPhaseGateBoundaryProbeMatrix,
  loadResearcherPhaseGateBaseline,
  FORGE_RESEARCHER_PHASE_GATE_VERSION,
  RESEARCHER_PHASE_GATE_MANIFEST_MAX_LENGTH,
  RESEARCHER_PHASE_GATE_CATEGORIES,
  P04_RESEARCHER_PHASE_BLOCK_INVENTORY,
  P04_RESEARCHER_PHASE_BLOCK_COUNT,
  P04_RESEARCHER_PHASE_ATOM_COUNT,
  EXPECTED_P04_B09_SEALED_ATOM_COUNT,
  EXPECTED_P04_RESEARCHER_PRIOR_BLOCK_GATE_COUNT,
  type ResearcherPhaseGateBaseline,
  type ResearcherPhaseGateBoundarySliceResult,
  type ResearcherPhaseGateCategory,
  type ResearcherPhaseGateProbeResult,
} from "./forge-p04-researcher-phase-gate.js";

export type { ResearcherPhaseGateBaseline, ResearcherPhaseGateProbeResult } from "./forge-p04-researcher-phase-gate.js";
export {
  validateResearcherPhaseGateBaseline,
  summarizeResearcherPhaseGateMatrix,
  listResearcherPhaseGateProbesByExpected,
  listResearcherPhaseGateKnownGaps,
  getActiveResearcherPhaseGateContract,
  getResearcherPhaseGateCategoryContract,
  listResearcherPhaseGateContractProbeIds,
  listResearcherPhaseGateContractProbesByCategory,
  listResearcherPhaseGateProbesByDisposition,
  summarizeResearcherPhaseGateContractCoverage,
  validateResearcherPhaseGateContract,
  validateResearcherPhaseGateContractCoverage,
  validateResearcherPhaseGateAgainstContract,
  validateResearcherPhaseGateProbeMatrix,
  validateResearcherPhaseGateBoundaryProbeMatrix,
  loadResearcherPhaseGateBaseline,
  FORGE_RESEARCHER_PHASE_GATE_VERSION,
  RESEARCHER_PHASE_GATE_CATEGORIES,
  P04_RESEARCHER_PHASE_BLOCK_INVENTORY,
  P04_RESEARCHER_PHASE_BLOCK_COUNT,
  P04_RESEARCHER_PHASE_ATOM_COUNT,
  EXPECTED_P04_B09_SEALED_ATOM_COUNT,
  EXPECTED_P04_RESEARCHER_PRIOR_BLOCK_GATE_COUNT,
} from "./forge-p04-researcher-phase-gate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = __dirname;

const ORCHESTRATOR_RESEARCHER_BLOCK_GATE_METHODS = [
  "verifyForgeResearcherQuestionDecompositionBlockGate",
  "verifyForgeResearcherInRepoEvidenceBlockGate",
  "verifyForgeResearcherWebPrimarySourceBlockGate",
  "verifyForgeResearcherBenchmarkPriorArtBlockGate",
  "verifyForgeResearcherCitationProvenanceGraphBlockGate",
  "verifyForgeResearcherContradictionFreshnessBlockGate",
  "verifyForgeResearcherRiskTradeoffBlockGate",
  "verifyForgeResearcherSpikeFalsificationBlockGate",
  "verifyForgeResearcherResearchToWorkerHandoffBlockGate",
] as const;

function readSrc(relativePath: string): string {
  return readFileSync(join(SRC_ROOT, relativePath), "utf8");
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: ResearcherPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): ResearcherPhaseGateProbeResult {
  const actual = outcome(ok);
  return {
    id,
    category,
    expected,
    actual,
    aligned: actual === expected,
    detail,
    criterion,
  };
}

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function productionPhaseGateSource(): string {
  return readSrc("forge-p04-researcher-phase-gate.ts") + readSrc("forge-p04-researcher-phase-gate.probe.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionPhaseGateSource());
}

function probePhaseVersioning(
  id: string,
  category: ResearcherPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherPhaseGateBaseline,
): ResearcherPhaseGateProbeResult {
  switch (id) {
    case "rpg.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "rpg.atom_tagged": {
      const ok = fixture.atom === "P04-B10-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "rpg.harness_version_exported": {
      const ok = FORGE_RESEARCHER_PHASE_GATE_VERSION.startsWith("1.0.0");
      return probe(id, category, expected, ok, `harnessVersion=${FORGE_RESEARCHER_PHASE_GATE_VERSION}`);
    }
    default:
      return probe(id, category, expected, false, "unknown phase_versioning probe");
  }
}

function probeBlockGateSignal(
  id: string,
  category: ResearcherPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
): ResearcherPhaseGateProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "rpg.orchestrator_question_block_gate": {
      const ok = orchestrator.includes("verifyForgeResearcherQuestionDecompositionBlockGate");
      return probe(id, category, expected, ok, `questionBlockGate=${ok}`);
    }
    case "rpg.orchestrator_handoff_block_gate": {
      const ok = orchestrator.includes("verifyForgeResearcherResearchToWorkerHandoffBlockGate");
      return probe(id, category, expected, ok, `handoffBlockGate=${ok}`);
    }
    case "rpg.orchestrator_nine_block_gates": {
      const ok = ORCHESTRATOR_RESEARCHER_BLOCK_GATE_METHODS.every(method => orchestrator.includes(method));
      return probe(
        id,
        category,
        expected,
        ok,
        `methods=${ORCHESTRATOR_RESEARCHER_BLOCK_GATE_METHODS.filter(m => orchestrator.includes(m)).length}/${ORCHESTRATOR_RESEARCHER_BLOCK_GATE_METHODS.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown block_gate_signal probe");
  }
}

function probePhaseInventory(
  id: string,
  category: ResearcherPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
): ResearcherPhaseGateProbeResult {
  switch (id) {
    case "rpg.block_inventory_exported": {
      const ok = P04_RESEARCHER_PHASE_BLOCK_INVENTORY.length === 10;
      return probe(id, category, expected, ok, `inventoryBlocks=${P04_RESEARCHER_PHASE_BLOCK_INVENTORY.length}`);
    }
    case "rpg.block_count_constant": {
      const ok = P04_RESEARCHER_PHASE_BLOCK_COUNT === 10;
      return probe(id, category, expected, ok, `blockCount=${P04_RESEARCHER_PHASE_BLOCK_COUNT}`);
    }
    case "rpg.atom_count_constant": {
      const ok = P04_RESEARCHER_PHASE_ATOM_COUNT === 100;
      return probe(id, category, expected, ok, `atomCount=${P04_RESEARCHER_PHASE_ATOM_COUNT}`);
    }
    default:
      return probe(id, category, expected, false, "unknown phase_inventory probe");
  }
}

function probeBaselineLink(
  id: string,
  category: ResearcherPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
): ResearcherPhaseGateProbeResult {
  switch (id) {
    case "rpg.b09_block_handoff_entry": {
      const handoff = getForgeP04B09ToB10Handoff();
      const ok =
        handoff.targetBlock.blockId === "P04-B10" &&
        handoff.targetBlock.entryAtom === "P04-B10-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "rpg.b09_sealed_handoff_probes": {
      const handoff = getForgeP04B09ToB10Handoff();
      const coverage = summarizeResearcherResearchToWorkerHandoffContractCoverage(
        getActiveResearcherResearchToWorkerHandoffContract(),
      );
      const ok = handoff.sealedArtifacts.probeCount === coverage.totalProbes;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoff_probes=${handoff.sealedArtifacts.probeCount}, contract=${coverage.totalProbes}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown baseline_link probe");
  }
}

function probeBoundary(
  id: string,
  category: ResearcherPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherPhaseGateBaseline,
): ResearcherPhaseGateProbeResult {
  switch (id) {
    case "rpg.source_block_gate_ref": {
      const handoff = getForgeP04B09ToB10Handoff();
      const coverage = summarizeResearcherResearchToWorkerHandoffContractCoverage(
        getActiveResearcherResearchToWorkerHandoffContract(),
      );
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.researchToWorkerHandoffProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P04_B09_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.researchToWorkerHandoffProbeCount}`,
      );
    }
    case "rpg.probe_runner_exported": {
      const ok = readSrc("forge-p04-researcher-phase-gate.probe.ts").includes(
        "export function runResearcherPhaseGateProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "rpg.known_gaps_documented": {
      const contract = getActiveResearcherPhaseGateContract();
      const expectedFail = contract.probes.filter(p => p.expected === "FAIL").length;
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount === expectedFail;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, contractExpectedFail=${expectedFail}`,
      );
    }
    case "rpg.empty_manifest_boundary": {
      const result = assessResearcherPhaseGateInputBoundary("");
      const recovery = recoverResearcherPhaseGateEvidence("");
      const ok =
        hasProductionExport("assessResearcherPhaseGateInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false &&
        recovery.recovered === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, recovered=${recovery.recovered}`,
      );
    }
    case "rpg.whitespace_manifest_boundary": {
      const result = assessResearcherPhaseGateInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessResearcherPhaseGateInputBoundary") &&
        result.disposition === "whitespace_only" &&
        result.acceptable === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, acceptable=${result.acceptable}`,
      );
    }
    case "rpg.long_manifest_truncation_boundary": {
      const longManifest = "x".repeat(RESEARCHER_PHASE_GATE_MANIFEST_MAX_LENGTH + 500);
      const result = assessResearcherPhaseGateInputBoundary(longManifest);
      const ok =
        hasProductionExport("assessResearcherPhaseGateInputBoundary") &&
        result.truncated === true &&
        result.normalizedManifest.length === RESEARCHER_PHASE_GATE_MANIFEST_MAX_LENGTH &&
        result.acceptable === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `truncated=${result.truncated}, len=${result.normalizedManifest.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: ResearcherPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherPhaseGateBaseline,
): ResearcherPhaseGateProbeResult {
  switch (id) {
    case "rpg.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateResearcherPhaseGateBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "rpg.incomplete_block_inventory_rejected": {
      const evidence = buildP04ResearcherPhaseGateEvidence(
        P04_RESEARCHER_PHASE_BLOCK_INVENTORY.slice(0, 9).map(block => ({
          blockId: block.blockId,
          title: block.title,
          runner: block.runner,
          passed: true,
          atomSealCount: 10,
          detail: "mock seal",
        })),
        true,
        true,
      );
      const ok = validateForgeP04ResearcherPhaseGateEvidence(evidence).valid === false;
      return probe(id, category, expected, ok, `rejectsIncomplete=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: ResearcherPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
): ResearcherPhaseGateProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "rpg.research_block_non_fatal": {
      const ok =
        orchestrator.includes("Research BLOCK is non-fatal") ||
        orchestrator.includes("Research BLOCK for block");
      return probe(id, category, expected, ok, `researchBlockNonFatal=${ok}`);
    }
    case "rpg.structured_phase_gate_recovery": {
      const malformed = `block gates incomplete
P04-B01: PASS atoms=10
P04-B02: pass atoms=10
handoff regression: pass
handoff: valid`;
      const recovery = recoverResearcherPhaseGateEvidence(malformed, {
        handoffRegressionPassed: true,
        handoffValid: true,
      });
      const ok =
        hasProductionExport("recoverResearcherPhaseGateEvidence") &&
        recovery.recovered === true &&
        recovery.evidence !== null &&
        recovery.blockSeals.length === P04_RESEARCHER_PHASE_BLOCK_COUNT &&
        recovery.handoffRegressionPassed &&
        recovery.handoffValid &&
        validateForgeP04ResearcherPhaseGateEvidence(recovery.evidence).valid;
      return probe(
        id,
        category,
        expected,
        ok,
        `recovered=${recovery.recovered}, ${recovery.detail}`,
      );
    }
    case "rpg.orchestrator_phase_gate_runner": {
      const ok = orchestrator.includes("verifyForgeP04ResearcherPhaseGate");
      return probe(id, category, expected, ok, `phaseGateRunner=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: ResearcherPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
): ResearcherPhaseGateProbeResult {
  switch (id) {
    case "rpg.phase_gate_evidence_nogo": {
      const evidence = buildP04ResearcherPhaseGateEvidence(
        P04_RESEARCHER_PHASE_BLOCK_INVENTORY.map((block, index) => ({
          blockId: block.blockId,
          title: block.title,
          runner: block.runner,
          passed: index !== 0,
          atomSealCount: 10,
          detail: index === 0 ? "failed seal" : "mock seal",
        })),
        true,
        true,
      );
      const ok = validateForgeP04ResearcherPhaseGateEvidence(evidence).valid === false;
      return probe(id, category, expected, ok, `rejectsFailedSeals=${ok}`);
    }
    case "rpg.p04_to_p05_phase_handoff": {
      const ok = hasProductionExport("getForgeP04ToP05PhaseHandoff");
      return probe(id, category, expected, ok, `p04ToP05Handoff=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: ResearcherPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherPhaseGateBaseline,
): ResearcherPhaseGateProbeResult {
  switch (category) {
    case "phase_versioning":
      return probePhaseVersioning(id, category, expected, fixture);
    case "block_gate_signal":
      return probeBlockGateSignal(id, category, expected);
    case "phase_inventory":
      return probePhaseInventory(id, category, expected);
    case "baseline_link":
      return probeBaselineLink(id, category, expected);
    case "boundary":
      return probeBoundary(id, category, expected, fixture);
    case "failure_path":
      return probeFailurePath(id, category, expected, fixture);
    case "recovery_path":
      return probeRecoveryPath(id, category, expected);
    case "nogo_path":
      return probeNogoPath(id, category, expected);
    default:
      return probe(id, category, expected, false, `unknown category: ${category}`);
  }
}

export function runResearcherPhaseGateProbes(
  fixture: ResearcherPhaseGateBaseline = loadResearcherPhaseGateBaseline(),
): ResearcherPhaseGateProbeResult[] {
  const contract = getActiveResearcherPhaseGateContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}

export const runForgeResearcherPhaseGateProbes = runResearcherPhaseGateProbes;

export interface ResearcherPhaseGateProductionSliceResult {
  atom: "P04-B10-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: ResearcherPhaseGateProbeResult[];
  summary: ReturnType<typeof summarizeResearcherPhaseGateMatrix>;
  matrixValidation: ReturnType<typeof validateResearcherPhaseGateProbeMatrix>;
}

/**
 * A03 production vertical slice: contract-wired probe execution and matrix alignment
 * gate with zero unexpected mismatches after orchestrator phase gate runner wiring.
 */
export function runResearcherPhaseGateProductionSlice(
  fixture: ResearcherPhaseGateBaseline = loadResearcherPhaseGateBaseline(),
): ResearcherPhaseGateProductionSliceResult {
  const contract = getActiveResearcherPhaseGateContract();
  const fixtureValidation = validateResearcherPhaseGateBaseline(fixture);
  const contractValidation = validateResearcherPhaseGateAgainstContract(fixture, contract);
  const results = runResearcherPhaseGateProbes(fixture);
  const summary = summarizeResearcherPhaseGateMatrix(results);
  const matrixValidation = validateResearcherPhaseGateProbeMatrix(results, contract);

  return {
    atom: "P04-B10-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export const runForgeResearcherPhaseGateProductionSlice = runResearcherPhaseGateProductionSlice;

/**
 * A04 boundary slice: contract-wired boundary probes (manifest input edge cases,
 * probe runner, documented gaps) with zero unexpected mismatches.
 */
export function runResearcherPhaseGateBoundarySlice(
  fixture: ResearcherPhaseGateBaseline = loadResearcherPhaseGateBaseline(),
): ResearcherPhaseGateBoundarySliceResult {
  const contract = getActiveResearcherPhaseGateContract();
  const results = runResearcherPhaseGateProbes(fixture);
  const boundaryProbes = listResearcherPhaseGateContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateResearcherPhaseGateBoundaryProbeMatrix(results, contract);

  return {
    atom: "P04-B10-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

export const runForgeResearcherPhaseGateBoundarySlice = runResearcherPhaseGateBoundarySlice;
