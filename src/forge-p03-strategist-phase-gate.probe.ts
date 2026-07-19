/**
 * FOREMAN — Strategist Phase Gate Probe Harness (P03-B10-A01)
 *
 * Static probes for P03 strategist phase gate baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP03B09ToB10Handoff,
  getActiveStrategistProvenanceContract,
  summarizeStrategistProvenanceCoverage,
} from "./forge-p03-strategist-provenance.js";
import {
  validateStrategistPhaseGateBaseline,
  validateStrategistPhaseGateAgainstContract,
  validateP03PhaseHandoffContract,
  validateForgeP03StrategistPhaseGateEvidence,
  buildP03StrategistPhaseGateEvidence,
  recoverStrategistPhaseGateEvidence,
  assessStrategistPhaseGateInputBoundary,
  getForgeP03ToP04PhaseHandoff,
  getActiveStrategistPhaseGateContract,
  summarizeStrategistPhaseGateMatrix,
  listStrategistPhaseGateProbesByExpected,
  listStrategistPhaseGateKnownGaps,
  loadStrategistPhaseGateBaseline,
  FORGE_STRATEGIST_PHASE_GATE_VERSION,
  STRATEGIST_PHASE_GATE_MANIFEST_MAX_LENGTH,
  STRATEGIST_PHASE_GATE_CATEGORIES,
  P03_STRATEGIST_PHASE_BLOCK_INVENTORY,
  P03_STRATEGIST_PHASE_BLOCK_COUNT,
  P03_STRATEGIST_PHASE_ATOM_COUNT,
  EXPECTED_P03_B09_SEALED_ATOM_COUNT,
  type StrategistPhaseGateBaseline,
  type StrategistPhaseGateCategory,
  type StrategistPhaseGateProbeResult,
} from "./forge-p03-strategist-phase-gate.js";

export type { StrategistPhaseGateBaseline, StrategistPhaseGateProbeResult } from "./forge-p03-strategist-phase-gate.js";
export {
  validateStrategistPhaseGateBaseline,
  summarizeStrategistPhaseGateMatrix,
  listStrategistPhaseGateProbesByExpected,
  listStrategistPhaseGateKnownGaps,
  getActiveStrategistPhaseGateContract,
  getForgeP03ToP04PhaseHandoff,
  loadStrategistPhaseGateBaseline,
  FORGE_STRATEGIST_PHASE_GATE_VERSION,
  STRATEGIST_PHASE_GATE_CATEGORIES,
  P03_STRATEGIST_PHASE_BLOCK_INVENTORY,
  P03_STRATEGIST_PHASE_BLOCK_COUNT,
  P03_STRATEGIST_PHASE_ATOM_COUNT,
  EXPECTED_P03_B09_SEALED_ATOM_COUNT,
} from "./forge-p03-strategist-phase-gate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(__dirname);

const ORCHESTRATOR_STRATEGIST_BLOCK_GATE_METHODS = [
  "verifyForgeStrategistIntentBlockGate",
  "verifyForgeStrategistBlockContractBlockGate",
  "verifyForgeStrategistAtomizationBlockGate",
  "verifyForgeStrategistDependencyDagBlockGate",
  "verifyForgeStrategistRiskReversibilityBlockGate",
  "verifyForgeStrategistResourceBudgetBlockGate",
  "verifyForgeStrategistParallelWaveBlockGate",
  "verifyForgeStrategistReplanBlockGate",
  "verifyForgeStrategistProvenanceBlockGate",
] as const;

function readSrc(relativePath: string): string {
  return readFileSync(join(SRC_ROOT, relativePath), "utf8");
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: StrategistPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): StrategistPhaseGateProbeResult {
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
  return readSrc("forge-p03-strategist-phase-gate.ts") + readSrc("forge-p03-strategist-phase-gate.probe.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionPhaseGateSource());
}

function probePhaseVersioning(
  id: string,
  category: StrategistPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistPhaseGateBaseline,
): StrategistPhaseGateProbeResult {
  switch (id) {
    case "spg.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "spg.atom_tagged": {
      const ok = fixture.atom === "P03-B10-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "spg.harness_version_exported": {
      const ok = FORGE_STRATEGIST_PHASE_GATE_VERSION.startsWith("1.0.0");
      return probe(id, category, expected, ok, `harnessVersion=${FORGE_STRATEGIST_PHASE_GATE_VERSION}`);
    }
    default:
      return probe(id, category, expected, false, "unknown phase_versioning probe");
  }
}

function probeBlockGateSignal(
  id: string,
  category: StrategistPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistPhaseGateProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "spg.orchestrator_intent_block_gate": {
      const ok = orchestrator.includes("verifyForgeStrategistIntentBlockGate");
      return probe(id, category, expected, ok, `intentBlockGate=${ok}`);
    }
    case "spg.orchestrator_provenance_block_gate": {
      const ok = orchestrator.includes("verifyForgeStrategistProvenanceBlockGate");
      return probe(id, category, expected, ok, `provenanceBlockGate=${ok}`);
    }
    case "spg.orchestrator_nine_block_gates": {
      const ok = ORCHESTRATOR_STRATEGIST_BLOCK_GATE_METHODS.every(method => orchestrator.includes(method));
      return probe(
        id,
        category,
        expected,
        ok,
        `methods=${ORCHESTRATOR_STRATEGIST_BLOCK_GATE_METHODS.filter(m => orchestrator.includes(m)).length}/${ORCHESTRATOR_STRATEGIST_BLOCK_GATE_METHODS.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown block_gate_signal probe");
  }
}

function probePhaseInventory(
  id: string,
  category: StrategistPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistPhaseGateProbeResult {
  switch (id) {
    case "spg.block_inventory_exported": {
      const ok = P03_STRATEGIST_PHASE_BLOCK_INVENTORY.length === 10;
      return probe(id, category, expected, ok, `inventoryBlocks=${P03_STRATEGIST_PHASE_BLOCK_INVENTORY.length}`);
    }
    case "spg.block_count_constant": {
      const ok = P03_STRATEGIST_PHASE_BLOCK_COUNT === 10;
      return probe(id, category, expected, ok, `blockCount=${P03_STRATEGIST_PHASE_BLOCK_COUNT}`);
    }
    case "spg.atom_count_constant": {
      const ok = P03_STRATEGIST_PHASE_ATOM_COUNT === 100;
      return probe(id, category, expected, ok, `atomCount=${P03_STRATEGIST_PHASE_ATOM_COUNT}`);
    }
    default:
      return probe(id, category, expected, false, "unknown phase_inventory probe");
  }
}

function probeBaselineLink(
  id: string,
  category: StrategistPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistPhaseGateProbeResult {
  switch (id) {
    case "spg.b09_block_handoff_entry": {
      const handoff = getForgeP03B09ToB10Handoff();
      const ok =
        handoff.targetBlock.blockId === "P03-B10" &&
        handoff.targetBlock.entryAtom === "P03-B10-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "spg.b09_sealed_provenance_probes": {
      const handoff = getForgeP03B09ToB10Handoff();
      const coverage = summarizeStrategistProvenanceCoverage(getActiveStrategistProvenanceContract());
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
  category: StrategistPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistPhaseGateBaseline,
): StrategistPhaseGateProbeResult {
  switch (id) {
    case "spg.source_block_gate_ref": {
      const handoff = getForgeP03B09ToB10Handoff();
      const coverage = summarizeStrategistProvenanceCoverage(getActiveStrategistProvenanceContract());
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.strategistProvenanceProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P03_B09_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.strategistProvenanceProbeCount}`,
      );
    }
    case "spg.probe_runner_exported": {
      const ok = readSrc("forge-p03-strategist-phase-gate.probe.ts").includes(
        "export function runStrategistPhaseGateProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "spg.known_gaps_documented": {
      const contract = getActiveStrategistPhaseGateContract();
      const expectedFail = contract.probes.filter(p => p.expected === "FAIL").length;
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount === expectedFail && failCount >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, contractExpectedFail=${expectedFail}`,
      );
    }
    case "spg.empty_manifest_boundary": {
      const result = assessStrategistPhaseGateInputBoundary("");
      const recovery = recoverStrategistPhaseGateEvidence("");
      const ok =
        hasProductionExport("assessStrategistPhaseGateInputBoundary") &&
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
    case "spg.whitespace_manifest_boundary": {
      const result = assessStrategistPhaseGateInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessStrategistPhaseGateInputBoundary") &&
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
    case "spg.long_manifest_truncation_boundary": {
      const longManifest = "x".repeat(STRATEGIST_PHASE_GATE_MANIFEST_MAX_LENGTH + 500);
      const result = assessStrategistPhaseGateInputBoundary(longManifest);
      const ok =
        hasProductionExport("assessStrategistPhaseGateInputBoundary") &&
        result.truncated === true &&
        result.normalizedManifest.length === STRATEGIST_PHASE_GATE_MANIFEST_MAX_LENGTH &&
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
  category: StrategistPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistPhaseGateBaseline,
): StrategistPhaseGateProbeResult {
  switch (id) {
    case "spg.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateStrategistPhaseGateBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "spg.incomplete_block_inventory_rejected": {
      const handoff = getForgeP03ToP04PhaseHandoff();
      const evidence = buildP03StrategistPhaseGateEvidence(
        P03_STRATEGIST_PHASE_BLOCK_INVENTORY.slice(0, 9).map(block => ({
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
      const ok = validateP03PhaseHandoffContract(handoff, evidence).valid === false;
      return probe(id, category, expected, ok, `rejectsIncomplete=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: StrategistPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistPhaseGateProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "spg.replan_checkpoint_resume": {
      const ok =
        orchestrator.includes("replanCheckpoint") &&
        orchestrator.includes("Resume block execution from replan checkpoint");
      return probe(id, category, expected, ok, `replanCheckpoint=${ok}`);
    }
    case "spg.structured_phase_gate_recovery": {
      const malformed = `block gates incomplete
P03-B01: PASS atoms=10
P03-B02: pass atoms=10
provenance regression: pass
handoff: valid`;
      const recovery = recoverStrategistPhaseGateEvidence(malformed, {
        provenanceRegressionPassed: true,
        handoffValid: true,
      });
      const handoff = getForgeP03ToP04PhaseHandoff();
      const ok =
        hasProductionExport("recoverStrategistPhaseGateEvidence") &&
        recovery.recovered === true &&
        recovery.evidence !== null &&
        recovery.blockSeals.length === P03_STRATEGIST_PHASE_BLOCK_COUNT &&
        recovery.provenanceRegressionPassed &&
        recovery.handoffValid &&
        validateForgeP03StrategistPhaseGateEvidence(recovery.evidence, handoff).valid;
      return probe(
        id,
        category,
        expected,
        ok,
        `recovered=${recovery.recovered}, ${recovery.detail}`,
      );
    }
    case "spg.orchestrator_phase_gate_runner": {
      const ok = orchestrator.includes("verifyForgeP03StrategistPhaseGate");
      return probe(id, category, expected, ok, `phaseGateRunner=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: StrategistPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistPhaseGateProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "spg.strategist_replan_block": {
      const ok =
        orchestrator.includes("validateStrategistReplan(") &&
        (orchestrator.includes("invalid replan plan") || orchestrator.includes("replan plan rejected"));
      return probe(id, category, expected, ok, `invalidReplanGate=${ok}`);
    }
    case "spg.phase_gate_evidence_nogo": {
      const handoff = getForgeP03ToP04PhaseHandoff();
      const evidence = buildP03StrategistPhaseGateEvidence(
        P03_STRATEGIST_PHASE_BLOCK_INVENTORY.map((block, index) => ({
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
      const ok = validateForgeP03StrategistPhaseGateEvidence(evidence, handoff).valid === false;
      return probe(id, category, expected, ok, `rejectsFailedSeals=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: StrategistPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistPhaseGateBaseline,
): StrategistPhaseGateProbeResult {
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

export function runStrategistPhaseGateProbes(
  fixture: StrategistPhaseGateBaseline = loadStrategistPhaseGateBaseline(),
): StrategistPhaseGateProbeResult[] {
  const contract = getActiveStrategistPhaseGateContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}

export const runForgeStrategistPhaseGateProbes = runStrategistPhaseGateProbes;
