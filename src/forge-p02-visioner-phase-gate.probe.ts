/**
 * FOREMAN — Visioner Phase Gate Probe Harness (P02-B10-A01)
 *
 * Static probes for P02 visioner phase gate baseline measurement.
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import visionerPhaseGateBaseline from "./fixtures/forge-visioner-phase-gate-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome, ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
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
  assessVisionerPhaseGateInputBoundary,
  getForgeP02ToP03PhaseHandoff,
  getActiveVisionerPhaseGateContract,
  summarizeVisionerPhaseGateContractCoverage,
  summarizeVisionerPhaseGateMatrix,
  validateVisionerPhaseGateProbeMatrix,
  validateVisionerPhaseGateBoundaryProbeMatrix,
  validateVisionerPhaseGateFailureRecoveryProbeMatrix,
  listVisionerPhaseGateFailureRecoveryProbeIds,
  listVisionerPhaseGateContractProbesByCategory,
  VISIONER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES,
  listVisionerPhaseGateProbesByExpected,
  listVisionerPhaseGateKnownGaps,
  buildVisionerPhaseGateProbeEvidence,
  buildVisionerPhaseGateProbeTelemetry,
  buildVisionerPhaseGateProvenance,
  buildVisionerPhaseGateRunRecord,
  validateVisionerPhaseGateRunRecord,
  detectVisionerPhaseGateProbeRegression,
  validateForgeVisionerPhaseGateGuard,
  runVisionerPhaseGatePropertyChecks,
  runVisionerPhaseGateFuzzValidation,
  runVisionerPhaseGateRunRecordFuzzValidation,
  getForgeP02B10BlockGate,
  getForgeP02B10ToP03Handoff,
  validateVisionerPhaseGateBlockHandoffContract,
  buildVisionerPhaseGateBlockGateEvidence,
  validateForgeP02VisionerPhaseGateBlockGate,
  listVisionerPhaseGateProbesByDisposition,
  FORGE_VISIONER_PHASE_GATE_VERSION,
  VISIONER_PHASE_GATE_MANIFEST_MAX_LENGTH,
  VISIONER_PHASE_GATE_CATEGORIES,
  P02_VISIONER_PHASE_BLOCK_INVENTORY,
  P02_VISIONER_PHASE_BLOCK_COUNT,
  P02_VISIONER_PHASE_ATOM_COUNT,
  P02_VISIONER_PHASE_GATE_CHECKS,
  EXPECTED_P02_B09_SEALED_ATOM_COUNT,
  EXPECTED_P02_VISIONER_PRIOR_BLOCK_GATE_COUNT,
  type VisionerPhaseGateBaseline,
  type VisionerPhaseGateCategory,
  type VisionerPhaseGateProbeDisposition,
  type VisionerPhaseGateProbeResult,
  type VisionerPhaseGateRunRecord,
} from "./forge-p02-visioner-phase-gate.js";

export type { VisionerPhaseGateBaseline, VisionerPhaseGateProbeResult } from "./forge-p02-visioner-phase-gate.js";
export {
  validateVisionerPhaseGateBaseline,
  summarizeVisionerPhaseGateMatrix,
  listVisionerPhaseGateProbesByExpected,
  listVisionerPhaseGateKnownGaps,
  getActiveVisionerPhaseGateContract,
  summarizeVisionerPhaseGateContractCoverage,
  getForgeP02ToP03PhaseHandoff,
  FORGE_VISIONER_PHASE_GATE_VERSION,
  VISIONER_PHASE_GATE_CATEGORIES,
  P02_VISIONER_PHASE_BLOCK_INVENTORY,
  P02_VISIONER_PHASE_BLOCK_COUNT,
  P02_VISIONER_PHASE_ATOM_COUNT,
  P02_VISIONER_PHASE_GATE_CHECKS,
  EXPECTED_P02_B09_SEALED_ATOM_COUNT,
  EXPECTED_P02_VISIONER_PRIOR_BLOCK_GATE_COUNT,
  getForgeP02B10BlockGate,
  getForgeP02B10ToP03Handoff,
  validateVisionerPhaseGateBlockHandoffContract,
  buildVisionerPhaseGateBlockGateEvidence,
  validateForgeP02VisionerPhaseGateBlockGate,
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
    case "vpg.empty_manifest_boundary": {
      const result = assessVisionerPhaseGateInputBoundary("");
      const recovery = recoverVisionerPhaseGateEvidence("");
      const ok =
        hasProductionExport("assessVisionerPhaseGateInputBoundary") &&
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
    case "vpg.whitespace_manifest_boundary": {
      const result = assessVisionerPhaseGateInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessVisionerPhaseGateInputBoundary") &&
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
    case "vpg.long_manifest_truncation_boundary": {
      const longManifest = "x".repeat(VISIONER_PHASE_GATE_MANIFEST_MAX_LENGTH + 500);
      const result = assessVisionerPhaseGateInputBoundary(longManifest);
      const ok =
        hasProductionExport("assessVisionerPhaseGateInputBoundary") &&
        result.truncated === true &&
        result.normalizedManifest.length === VISIONER_PHASE_GATE_MANIFEST_MAX_LENGTH &&
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

export interface VisionerPhaseGateBoundarySliceResult {
  atom: "P02-B10-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: VisionerPhaseGateProbeResult[];
  boundaryResults: VisionerPhaseGateProbeResult[];
  matrixValidation: ReturnType<typeof validateVisionerPhaseGateBoundaryProbeMatrix>;
}

/**
 * A04 boundary slice: contract-wired boundary probes (manifest input edge cases, probe runner,
 * documented gaps) with zero unexpected mismatches.
 */
export function runVisionerPhaseGateBoundarySlice(
  fixture: VisionerPhaseGateBaseline = loadVisionerPhaseGateBaseline(),
): VisionerPhaseGateBoundarySliceResult {
  const contract = getActiveVisionerPhaseGateContract();
  const results = runVisionerPhaseGateProbes(fixture);
  const boundaryProbes = listVisionerPhaseGateContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateVisionerPhaseGateBoundaryProbeMatrix(results, contract);

  return {
    atom: "P02-B10-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

export const runForgeVisionerPhaseGateBoundarySlice = runVisionerPhaseGateBoundarySlice;

export interface VisionerPhaseGateFailureRecoverySliceResult {
  atom: "P02-B10-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: VisionerPhaseGateProbeResult[];
  failureRecoveryResults: VisionerPhaseGateProbeResult[];
  matrixValidation: ReturnType<typeof validateVisionerPhaseGateFailureRecoveryProbeMatrix>;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches; documented FAIL gaps preserved.
 */
export function runVisionerPhaseGateFailureRecoverySlice(
  fixture: VisionerPhaseGateBaseline = loadVisionerPhaseGateBaseline(),
): VisionerPhaseGateFailureRecoverySliceResult {
  const contract = getActiveVisionerPhaseGateContract();
  const results = runVisionerPhaseGateProbes(fixture);
  const failureRecoveryProbes = VISIONER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listVisionerPhaseGateContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateVisionerPhaseGateFailureRecoveryProbeMatrix(results, contract);

  return {
    atom: "P02-B10-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

export const runForgeVisionerPhaseGateFailureRecoverySlice = runVisionerPhaseGateFailureRecoverySlice;

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

function runVisionerPhaseGateProbeWithTiming(
  entry: VisionerPhaseGateBaseline["probes"][number],
  fixture: VisionerPhaseGateBaseline,
  contractProbe:
    | { criterion: string; disposition: VisionerPhaseGateProbeDisposition }
    | undefined,
): {
  result: VisionerPhaseGateProbeResult;
  durationMs: number;
  disposition: VisionerPhaseGateProbeDisposition;
} {
  const start = performance.now();
  const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
  const enriched = contractProbe?.criterion ? { ...result, criterion: contractProbe.criterion } : result;
  const durationMs = performance.now() - start;
  return {
    result: enriched,
    durationMs,
    disposition: contractProbe?.disposition ?? "observed",
  };
}

function buildVisionerPhaseGateRecordFromEntries(
  entries: VisionerPhaseGateBaseline["probes"],
  fixture: VisionerPhaseGateBaseline,
  contract: ReturnType<typeof getActiveVisionerPhaseGateContract>,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly VisionerPhaseGateCategory[];
  },
): VisionerPhaseGateRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ReturnType<typeof buildVisionerPhaseGateProbeEvidence>[] = [];
  const telemetry: ReturnType<typeof buildVisionerPhaseGateProbeTelemetry>[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runVisionerPhaseGateProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildVisionerPhaseGateProbeEvidence(
        result.id,
        result.category,
        result.expected,
        result.actual,
        result.aligned,
        criterion,
        result.detail,
        disposition,
      ),
    );
    telemetry.push(
      buildVisionerPhaseGateProbeTelemetry(result.id, result.category, sequenceIndex, durationMs),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildVisionerPhaseGateProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildVisionerPhaseGateRunRecord(provenance, evidence, telemetry);
}

/** Run all visioner phase gate probes and emit auditable evidence, telemetry and provenance (P02-B10-A06). */
export function runVisionerPhaseGateProbesWithRecord(
  fixture: VisionerPhaseGateBaseline = loadVisionerPhaseGateBaseline(),
): VisionerPhaseGateRunRecord {
  const contract = getActiveVisionerPhaseGateContract();
  return buildVisionerPhaseGateRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P02-B10-A06). */
export function runVisionerPhaseGateFailureRecoverySliceWithRecord(
  fixture: VisionerPhaseGateBaseline = loadVisionerPhaseGateBaseline(),
): VisionerPhaseGateRunRecord {
  const contract = getActiveVisionerPhaseGateContract();
  const failureRecoveryIds = new Set(listVisionerPhaseGateFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildVisionerPhaseGateRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P02-B10-A06",
    sliceCategories: VISIONER_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES,
  });
}

export const runForgeVisionerPhaseGateProbesWithRecord = runVisionerPhaseGateProbesWithRecord;
export const runForgeVisionerPhaseGateFailureRecoverySliceWithRecord =
  runVisionerPhaseGateFailureRecoverySliceWithRecord;

export interface ForgeVisionerPhaseGateRegressionPropertyFuzzResult {
  passed: boolean;
  properties: ReturnType<typeof runVisionerPhaseGatePropertyChecks>;
  contractFuzz: ReturnType<typeof runVisionerPhaseGateFuzzValidation>;
  runFuzz: {
    validBaseline: boolean;
    mutationsRejected: number;
    mutationsAccepted: number;
  };
}

export interface ForgeVisionerPhaseGateRegressionResult {
  passed: boolean;
  productionSlice: VisionerPhaseGateProductionSliceResult;
  record: VisionerPhaseGateRunRecord;
  recordValid: boolean;
  validationIssues: string[];
  probeRegression: ReturnType<typeof detectVisionerPhaseGateProbeRegression> | null;
  guard: ReturnType<typeof validateForgeVisionerPhaseGateGuard>;
  propertyFuzz: ForgeVisionerPhaseGateRegressionPropertyFuzzResult;
  detail: string;
}

/**
 * Execute visioner phase gate probes, validate production slice + run record, property/fuzz gates,
 * and optionally detect regression vs prior run. Forge pipeline integration gate (P02-B10-A08).
 */
export function runForgeVisionerPhaseGateRegressionGate(
  priorRecord?: VisionerPhaseGateRunRecord,
): ForgeVisionerPhaseGateRegressionResult {
  const fixture = loadVisionerPhaseGateBaseline();
  const contract = getActiveVisionerPhaseGateContract();
  const productionSlice = runVisionerPhaseGateProductionSlice(fixture);
  const record = runVisionerPhaseGateProbesWithRecord(fixture);
  const validation = validateVisionerPhaseGateRunRecord(record, contract);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  const probeRegression = priorRecord
    ? detectVisionerPhaseGateProbeRegression(priorRecord, record)
    : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;
  const guard = validateForgeVisionerPhaseGateGuard(record, { totalCostUsd: 0, llmCalls: 0, contract });

  const properties = runVisionerPhaseGatePropertyChecks(contract);
  const contractFuzz = runVisionerPhaseGateFuzzValidation(fixture, contract);
  const runFuzz = runVisionerPhaseGateRunRecordFuzzValidation(record, contract);
  const propertyFuzzPassed =
    properties.allPassed &&
    contractFuzz.allMutationsRejected &&
    runFuzz.mutationsAccepted === 0;
  const propertyFuzz: ForgeVisionerPhaseGateRegressionPropertyFuzzResult = {
    passed: propertyFuzzPassed,
    properties,
    contractFuzz,
    runFuzz: {
      validBaseline: runFuzz.validBaseline,
      mutationsRejected: runFuzz.mutationsRejected,
      mutationsAccepted: runFuzz.mutationsAccepted,
    },
  };

  const productionSliceOk =
    productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0;
  const passed =
    productionSliceOk && recordValid && !alignmentRegression && guard.passed && propertyFuzzPassed;

  const detailParts: string[] = [];
  detailParts.push(`${record.summary.aligned}/${record.summary.total} probes aligned`);
  detailParts.push(
    `productionSlice: unexpected=${productionSlice.matrixValidation.unexpectedMismatches}`,
  );
  if (!recordValid) {
    detailParts.push(`validation: ${validationIssues.join("; ") || "mismatches present"}`);
  }
  if (probeRegression) detailParts.push(`regression: ${probeRegression.summary}`);
  detailParts.push(
    `propertyFuzz: properties=${properties.passed}/${properties.total} contractFuzz rejected=${contractFuzz.rejected}/${contractFuzz.iterations} runFuzz rejected=${runFuzz.mutationsRejected}/3`,
  );
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
    passed,
    productionSlice,
    record,
    recordValid,
    validationIssues,
    probeRegression,
    guard,
    propertyFuzz,
    detail: detailParts.join(" | "),
  };
}

/** Alias for forge-pipeline-regression integration seam (P02-B10-A08). */
export const runVisionerPhaseGateRegressionIntegration = runForgeVisionerPhaseGateRegressionGate;

export interface ForgeVisionerPhaseGateBlockGateResult {
  passed: boolean;
  evidence: ReturnType<typeof buildVisionerPhaseGateBlockGateEvidence>;
  handoff: ReturnType<typeof getForgeP02B10ToP03Handoff>;
  regression: ForgeVisionerPhaseGateRegressionResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealVisionerPhaseGateBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P02-B10 block gate: validate A01–A09 deliverables, regression, guard, and P03 handoff (P02-B10-A10).
 */
export function runVisionerPhaseGateBlockGate(): ForgeVisionerPhaseGateBlockGateResult {
  const blockGate = getForgeP02B10BlockGate();
  const handoff = getForgeP02B10ToP03Handoff();
  const contract = getActiveVisionerPhaseGateContract();
  const fixture = loadVisionerPhaseGateBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateVisionerPhaseGateBaseline(fixture);
  const contractValidation = validateVisionerPhaseGateAgainstContract(fixture, contract);
  const coverage = summarizeVisionerPhaseGateContractCoverage(contract);
  const b09Handoff = getForgeP02B09ToB10Handoff();
  atomSeals.push(
    sealVisionerPhaseGateBlockAtom(
      "P02-B10-A01",
      "visioner_phase_gate",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion &&
        fixture.sourceBlockGate.atom === b09Handoff.atom,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${coverage.totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  atomSeals.push(
    sealVisionerPhaseGateBlockAtom(
      "P02-B10-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${VISIONER_PHASE_GATE_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runVisionerPhaseGateProductionSlice(fixture);
  atomSeals.push(
    sealVisionerPhaseGateBlockAtom(
      "P02-B10-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runVisionerPhaseGateBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealVisionerPhaseGateBlockAtom(
      "P02-B10-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} gap=${coverage.byDisposition.gap} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const failureRecoverySlice = runVisionerPhaseGateFailureRecoverySlice(fixture);
  const nogoProbes = listVisionerPhaseGateProbesByDisposition("nogo", contract);
  atomSeals.push(
    sealVisionerPhaseGateBlockAtom(
      "P02-B10-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoProbes.length} NO-GO probes`,
    ),
  );

  const regression = runForgeVisionerPhaseGateRegressionGate();
  const recordValidation = validateVisionerPhaseGateRunRecord(regression.record, contract);
  const evidenceOk =
    regression.record.evidence.length === coverage.totalProbes &&
    regression.record.telemetry.length === coverage.totalProbes &&
    recordValidation.valid;
  atomSeals.push(
    sealVisionerPhaseGateBlockAtom(
      "P02-B10-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${regression.record.evidence.length} telemetry=${regression.record.telemetry.length}`
        : recordValidation.issues.map(i => i.detail).join("; "),
    ),
  );

  const propertyFuzz = regression.propertyFuzz;
  atomSeals.push(
    sealVisionerPhaseGateBlockAtom(
      "P02-B10-A07",
      "property_fuzz",
      propertyFuzz.passed,
      `properties=${propertyFuzz.properties.passed}/${propertyFuzz.properties.total} contractFuzz rejected=${propertyFuzz.contractFuzz.rejected}/${propertyFuzz.contractFuzz.iterations} runFuzz rejected=${propertyFuzz.runFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealVisionerPhaseGateBlockAtom(
      "P02-B10-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealVisionerPhaseGateBlockAtom(
      "P02-B10-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const orchestratorSrc = readSrc("orchestrator.ts");
  const inventoryOk =
    ORCHESTRATOR_BLOCK_GATE_METHODS.every(method => orchestratorSrc.includes(method)) &&
    orchestratorSrc.includes("verifyForgeP02VisionerPhaseGateBlockGate");
  const handoffValidation = validateVisionerPhaseGateBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
    sealedBlockCount: EXPECTED_P02_VISIONER_PRIOR_BLOCK_GATE_COUNT,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid && inventoryOk;
  atomSeals.push(
    sealVisionerPhaseGateBlockAtom(
      "P02-B10-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom} inventory=${EXPECTED_P02_VISIONER_PRIOR_BLOCK_GATE_COUNT}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildVisionerPhaseGateBlockGateEvidence(
    atomSeals,
    regression.passed,
    regression.guard.passed,
    regression.record.summary.total,
    resolveGitCommit(),
  );
  validateForgeP02VisionerPhaseGateBlockGate(evidence, handoff, contract);

  const detailParts = [
    `block=${blockGate.blockId} seals=${atomSeals.filter(s => s.passed).length}/${atomSeals.length}`,
    `regression=${regression.passed ? "PASS" : "FAIL"}`,
    `guard=${regression.guard.passed ? "PASS" : "FAIL"}`,
    `inventory=${inventoryOk ? "PASS" : "FAIL"}:${EXPECTED_P02_VISIONER_PRIOR_BLOCK_GATE_COUNT}`,
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
export const runForgeVisionerPhaseGateBlockGate = runVisionerPhaseGateBlockGate;
