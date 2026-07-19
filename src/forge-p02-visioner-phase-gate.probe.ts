/**
 * FOREMAN — Visioner Phase Gate Probe Harness (P02-B10-A01)
 *
 * Static probes for P02 visioner phase gate baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import visionerPhaseGateBaseline from "./fixtures/forge-visioner-phase-gate-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP02B09ToB10Handoff,
  getActiveVisionerApprovalContract,
  summarizeVisionerApprovalContractCoverage,
} from "./forge-p02-visioner-approval.js";
import {
  validateVisionerPhaseGateBaseline,
  validateVisionerPhaseGateAgainstContract,
  validateP02PhaseHandoffContract,
  validateForgeP02VisionerPhaseGateEvidence,
  buildP02VisionerPhaseGateEvidence,
  recoverVisionerPhaseGateEvidence,
  getForgeP02ToP03PhaseHandoff,
  getActiveVisionerPhaseGateContract,
  summarizeVisionerPhaseGateMatrix,
  validateVisionerPhaseGateProbeMatrix,
  listVisionerPhaseGateProbesByExpected,
  listVisionerPhaseGateKnownGaps,
  FORGE_VISIONER_PHASE_GATE_VERSION,
  VISIONER_PHASE_GATE_CATEGORIES,
  P02_VISIONER_PHASE_BLOCK_INVENTORY,
  P02_VISIONER_PHASE_BLOCK_COUNT,
  P02_VISIONER_PHASE_ATOM_COUNT,
  P02_VISIONER_PHASE_GATE_CHECKS,
  EXPECTED_P02_B09_SEALED_ATOM_COUNT,
  type VisionerPhaseGateBaseline,
  type VisionerPhaseGateCategory,
  type VisionerPhaseGateProbeResult,
} from "./forge-p02-visioner-phase-gate.js";

export type { VisionerPhaseGateBaseline, VisionerPhaseGateProbeResult } from "./forge-p02-visioner-phase-gate.js";
export {
  validateVisionerPhaseGateBaseline,
  summarizeVisionerPhaseGateMatrix,
  listVisionerPhaseGateProbesByExpected,
  listVisionerPhaseGateKnownGaps,
  getActiveVisionerPhaseGateContract,
  getForgeP02ToP03PhaseHandoff,
  FORGE_VISIONER_PHASE_GATE_VERSION,
  VISIONER_PHASE_GATE_CATEGORIES,
  P02_VISIONER_PHASE_BLOCK_INVENTORY,
  P02_VISIONER_PHASE_BLOCK_COUNT,
  P02_VISIONER_PHASE_ATOM_COUNT,
  P02_VISIONER_PHASE_GATE_CHECKS,
  EXPECTED_P02_B09_SEALED_ATOM_COUNT,
} from "./forge-p02-visioner-phase-gate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(__dirname);

const ORCHESTRATOR_BLOCK_GATE_METHODS = [
  "verifyForgeVisionerIntentBlockGate",
  "verifyForgeVisionerConstraintBlockGate",
  "verifyForgeVisionerSynthesisBlockGate",
  "verifyForgeVisionerGroundingBlockGate",
  "verifyForgeVisionerResearchTriggerBlockGate",
  "verifyForgeVisionerUncertaintyBlockGate",
  "verifyForgeVisionerAlternativeBlockGate",
  "verifyForgeVisionerScoringBlockGate",
  "verifyForgeVisionerApprovalBlockGate",
] as const;

function readSrc(relativePath: string): string {
  return readFileSync(join(SRC_ROOT, relativePath), "utf8");
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: VisionerPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): VisionerPhaseGateProbeResult {
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
  return readSrc("forge-p02-visioner-phase-gate.ts") + readSrc("forge-p02-visioner-phase-gate.probe.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionPhaseGateSource());
}

function probePhaseVersioning(
  id: string,
  category: VisionerPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerPhaseGateBaseline,
): VisionerPhaseGateProbeResult {
  switch (id) {
    case "vpg.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "vpg.atom_tagged": {
      const ok = fixture.atom === "P02-B10-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "vpg.harness_version_exported": {
      const ok = FORGE_VISIONER_PHASE_GATE_VERSION.startsWith("1.0.0");
      return probe(id, category, expected, ok, `harnessVersion=${FORGE_VISIONER_PHASE_GATE_VERSION}`);
    }
    default:
      return probe(id, category, expected, false, "unknown phase_versioning probe");
  }
}

function probeBlockGateSignal(
  id: string,
  category: VisionerPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerPhaseGateProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vpg.orchestrator_intent_block_gate": {
      const ok = orchestrator.includes("verifyForgeVisionerIntentBlockGate");
      return probe(id, category, expected, ok, `intentBlockGate=${ok}`);
    }
    case "vpg.orchestrator_approval_block_gate": {
      const ok = orchestrator.includes("verifyForgeVisionerApprovalBlockGate");
      return probe(id, category, expected, ok, `approvalBlockGate=${ok}`);
    }
    case "vpg.orchestrator_ten_block_gates": {
      const ok = ORCHESTRATOR_BLOCK_GATE_METHODS.every(method => orchestrator.includes(method));
      return probe(
        id,
        category,
        expected,
        ok,
        `methods=${ORCHESTRATOR_BLOCK_GATE_METHODS.filter(m => orchestrator.includes(m)).length}/${ORCHESTRATOR_BLOCK_GATE_METHODS.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown block_gate_signal probe");
  }
}

function probePhaseInventory(
  id: string,
  category: VisionerPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerPhaseGateProbeResult {
  switch (id) {
    case "vpg.block_inventory_exported": {
      const ok = P02_VISIONER_PHASE_BLOCK_INVENTORY.length === 10;
      return probe(id, category, expected, ok, `inventoryBlocks=${P02_VISIONER_PHASE_BLOCK_INVENTORY.length}`);
    }
    case "vpg.block_count_constant": {
      const ok = P02_VISIONER_PHASE_BLOCK_COUNT === 10;
      return probe(id, category, expected, ok, `blockCount=${P02_VISIONER_PHASE_BLOCK_COUNT}`);
    }
    case "vpg.atom_count_constant": {
      const ok = P02_VISIONER_PHASE_ATOM_COUNT === 100;
      return probe(id, category, expected, ok, `atomCount=${P02_VISIONER_PHASE_ATOM_COUNT}`);
    }
    default:
      return probe(id, category, expected, false, "unknown phase_inventory probe");
  }
}

function probeBaselineLink(
  id: string,
  category: VisionerPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerPhaseGateProbeResult {
  switch (id) {
    case "vpg.b09_block_handoff_entry": {
      const handoff = getForgeP02B09ToB10Handoff();
      const ok =
        handoff.targetBlock.blockId === "P02-B10" &&
        handoff.targetBlock.entryAtom === "P02-B10-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "vpg.b09_sealed_approval_probes": {
      const handoff = getForgeP02B09ToB10Handoff();
      const coverage = summarizeVisionerApprovalContractCoverage(getActiveVisionerApprovalContract());
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
  category: VisionerPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerPhaseGateBaseline,
): VisionerPhaseGateProbeResult {
  switch (id) {
    case "vpg.source_block_gate_ref": {
      const handoff = getForgeP02B09ToB10Handoff();
      const coverage = summarizeVisionerApprovalContractCoverage(getActiveVisionerApprovalContract());
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.visionerApprovalProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P02_B09_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.visionerApprovalProbeCount}`,
      );
    }
    case "vpg.probe_runner_exported": {
      const ok = readSrc("forge-p02-visioner-phase-gate.probe.ts").includes(
        "export function runVisionerPhaseGateProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "vpg.known_gaps_documented": {
      const contract = getActiveVisionerPhaseGateContract();
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
    case "vpg.block_inventory_runners": {
      const src = productionPhaseGateSource() + readSrc("orchestrator.ts");
      const missing = P02_VISIONER_PHASE_BLOCK_INVENTORY.filter(
        block => block.blockId !== "P02-B10" && !src.includes(block.runner),
      );
      const ok = missing.length === 0;
      return probe(
        id,
        category,
        expected,
        ok,
        ok ? "allRunnersPresent=true" : `missing=${missing.map(b => b.runner).join(",")}`,
      );
    }
    case "vpg.phase_gate_checks_defined": {
      const ok = P02_VISIONER_PHASE_GATE_CHECKS.length >= 4;
      return probe(id, category, expected, ok, `checks=${P02_VISIONER_PHASE_GATE_CHECKS.length}`);
    }
    case "vpg.p03_handoff_contract_exported": {
      const handoff = getForgeP02ToP03PhaseHandoff();
      const ok =
        hasProductionExport("getForgeP02ToP03PhaseHandoff") &&
        handoff.targetPhase.entryAtom === "P03-B01-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `entry=${handoff.targetPhase.entryBlock}/${handoff.targetPhase.entryAtom}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: VisionerPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerPhaseGateBaseline,
): VisionerPhaseGateProbeResult {
  switch (id) {
    case "vpg.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateVisionerPhaseGateBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "vpg.incomplete_block_inventory_rejected": {
      const handoff = getForgeP02ToP03PhaseHandoff();
      const evidence = buildP02VisionerPhaseGateEvidence(
        P02_VISIONER_PHASE_BLOCK_INVENTORY.slice(0, 9).map(block => ({
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
      const ok = validateP02PhaseHandoffContract(handoff, evidence).valid === false;
      return probe(id, category, expected, ok, `rejectsIncomplete=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: VisionerPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerPhaseGateProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vpg.approval_checkpoint_resume": {
      const ok =
        orchestrator.includes("!isResuming && this.engine.interactive.isEnabled()") &&
        orchestrator.includes("On resume, skip approval");
      return probe(id, category, expected, ok, `resumeSkipsApproval=${ok}`);
    }
    case "vpg.structured_phase_gate_recovery": {
      const malformed = `block gates incomplete
P02-B01: PASS atoms=10
P02-B02: pass atoms=10
approval regression: pass
handoff: valid`;
      const recovery = recoverVisionerPhaseGateEvidence(malformed, {
        approvalRegressionPassed: true,
        handoffValid: true,
      });
      const handoff = getForgeP02ToP03PhaseHandoff();
      const ok =
        hasProductionExport("recoverVisionerPhaseGateEvidence") &&
        recovery.recovered === true &&
        recovery.evidence !== null &&
        recovery.blockSeals.length === P02_VISIONER_PHASE_BLOCK_COUNT &&
        recovery.approvalRegressionPassed &&
        recovery.handoffValid &&
        validateForgeP02VisionerPhaseGateEvidence(recovery.evidence, handoff).valid;
      return probe(
        id,
        category,
        expected,
        ok,
        `recovered=${recovery.recovered}, ${recovery.detail}`,
      );
    }
    case "vpg.orchestrator_phase_gate_runner": {
      const ok = orchestrator.includes("verifyForgeP02VisionerPhaseGate");
      return probe(id, category, expected, ok, `phaseGateRunner=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: VisionerPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerPhaseGateProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vpg.vision_fact_check_block": {
      const ok =
        orchestrator.includes("after_thought") &&
        orchestrator.includes("fact_check") &&
        orchestrator.includes("BLOCK");
      return probe(id, category, expected, ok, `factCheckBlock=${ok}`);
    }
    case "vpg.phase_gate_evidence_nogo": {
      const handoff = getForgeP02ToP03PhaseHandoff();
      const evidence = buildP02VisionerPhaseGateEvidence(
        P02_VISIONER_PHASE_BLOCK_INVENTORY.map((block, index) => ({
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
      const ok = validateForgeP02VisionerPhaseGateEvidence(evidence, handoff).valid === false;
      return probe(id, category, expected, ok, `rejectsFailedSeals=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: VisionerPhaseGateCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerPhaseGateBaseline,
): VisionerPhaseGateProbeResult {
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

export function loadVisionerPhaseGateBaseline(): VisionerPhaseGateBaseline {
  return visionerPhaseGateBaseline as VisionerPhaseGateBaseline;
}

export function runVisionerPhaseGateProbes(
  fixture: VisionerPhaseGateBaseline = loadVisionerPhaseGateBaseline(),
): VisionerPhaseGateProbeResult[] {
  const contract = getActiveVisionerPhaseGateContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}

export const runForgeVisionerPhaseGateProbes = runVisionerPhaseGateProbes;

export interface VisionerPhaseGateProductionSliceResult {
  atom: "P02-B10-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: VisionerPhaseGateProbeResult[];
  summary: ReturnType<typeof summarizeVisionerPhaseGateMatrix>;
  matrixValidation: ReturnType<typeof validateVisionerPhaseGateProbeMatrix>;
}

/**
 * A03 production vertical slice: recoverVisionerPhaseGateEvidence wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runVisionerPhaseGateProductionSlice(
  fixture: VisionerPhaseGateBaseline = loadVisionerPhaseGateBaseline(),
): VisionerPhaseGateProductionSliceResult {
  const contract = getActiveVisionerPhaseGateContract();
  const fixtureValidation = validateVisionerPhaseGateBaseline(fixture);
  const contractValidation = validateVisionerPhaseGateAgainstContract(fixture, contract);
  const results = runVisionerPhaseGateProbes(fixture);
  const summary = summarizeVisionerPhaseGateMatrix(results);
  const matrixValidation = validateVisionerPhaseGateProbeMatrix(results, contract);

  return {
    atom: "P02-B10-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export const runForgeVisionerPhaseGateProductionSlice = runVisionerPhaseGateProductionSlice;
