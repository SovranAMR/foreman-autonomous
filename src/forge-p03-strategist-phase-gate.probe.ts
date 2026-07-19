/**
 * FOREMAN — Strategist Phase Gate Probe Harness (P03-B10-A01)
 *
 * Static probes for P03 strategist phase gate baseline measurement.
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { performance } from "node:perf_hooks";
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
  validateStrategistPhaseGateProbeMatrix,
  validateStrategistPhaseGateBoundaryProbeMatrix,
  validateStrategistPhaseGateFailureRecoveryProbeMatrix,
  listStrategistPhaseGateContractProbesByCategory,
  STRATEGIST_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES,
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
  listStrategistPhaseGateFailureRecoveryProbeIds,
  loadStrategistPhaseGateBaseline,
  buildStrategistPhaseGateProbeEvidence,
  buildStrategistPhaseGateProbeTelemetry,
  buildStrategistPhaseGateProvenance,
  buildStrategistPhaseGateRunRecord,
  validateStrategistPhaseGateFailureRecoveryRunRecord,
  validateStrategistPhaseGateRunRecord,
  runStrategistPhaseGatePropertyChecks,
  runStrategistPhaseGateFuzzValidation,
  runStrategistPhaseGateRunRecordFuzzValidation,
  FORGE_STRATEGIST_PHASE_GATE_VERSION,
  STRATEGIST_PHASE_GATE_MANIFEST_MAX_LENGTH,
  STRATEGIST_PHASE_GATE_CATEGORIES,
  P03_STRATEGIST_PHASE_BLOCK_INVENTORY,
  P03_STRATEGIST_PHASE_BLOCK_COUNT,
  P03_STRATEGIST_PHASE_ATOM_COUNT,
  EXPECTED_P03_B09_SEALED_ATOM_COUNT,
  type StrategistPhaseGateBaseline,
  type StrategistPhaseGateCategory,
  type StrategistPhaseGateProbeDisposition,
  type StrategistPhaseGateProbeResult,
  type StrategistPhaseGateRunRecord,
  type StrategistPhaseGateEvidenceSliceResult,
  type StrategistPhaseGatePropertyResult,
  type StrategistPhaseGateFuzzValidationResult,
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
      const ok = failCount === expectedFail;
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

export interface StrategistPhaseGateProductionSliceResult {
  atom: "P03-B10-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: StrategistPhaseGateProbeResult[];
  summary: ReturnType<typeof summarizeStrategistPhaseGateMatrix>;
  matrixValidation: ReturnType<typeof validateStrategistPhaseGateProbeMatrix>;
}

/**
 * A03 production vertical slice: contract-wired probe execution and matrix alignment
 * gate with zero unexpected mismatches after orchestrator phase gate runner wiring.
 */
export function runStrategistPhaseGateProductionSlice(
  fixture: StrategistPhaseGateBaseline = loadStrategistPhaseGateBaseline(),
): StrategistPhaseGateProductionSliceResult {
  const contract = getActiveStrategistPhaseGateContract();
  const fixtureValidation = validateStrategistPhaseGateBaseline(fixture);
  const contractValidation = validateStrategistPhaseGateAgainstContract(fixture, contract);
  const results = runStrategistPhaseGateProbes(fixture);
  const summary = summarizeStrategistPhaseGateMatrix(results);
  const matrixValidation = validateStrategistPhaseGateProbeMatrix(results, contract);

  return {
    atom: "P03-B10-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export const runForgeStrategistPhaseGateProductionSlice = runStrategistPhaseGateProductionSlice;

export interface StrategistPhaseGateBoundarySliceResult {
  atom: "P03-B10-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: StrategistPhaseGateProbeResult[];
  boundaryResults: StrategistPhaseGateProbeResult[];
  matrixValidation: ReturnType<typeof validateStrategistPhaseGateBoundaryProbeMatrix>;
}

/**
 * A04 boundary slice: contract-wired boundary probes (manifest input edge cases, probe runner,
 * documented gaps) with zero unexpected mismatches.
 */
export function runStrategistPhaseGateBoundarySlice(
  fixture: StrategistPhaseGateBaseline = loadStrategistPhaseGateBaseline(),
): StrategistPhaseGateBoundarySliceResult {
  const contract = getActiveStrategistPhaseGateContract();
  const results = runStrategistPhaseGateProbes(fixture);
  const boundaryProbes = contract.probes.filter(p => p.category === "boundary");
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateStrategistPhaseGateBoundaryProbeMatrix(results, contract);

  return {
    atom: "P03-B10-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

export const runForgeStrategistPhaseGateBoundarySlice = runStrategistPhaseGateBoundarySlice;

export interface StrategistPhaseGateFailureRecoverySliceResult {
  atom: "P03-B10-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: StrategistPhaseGateProbeResult[];
  failureRecoveryResults: StrategistPhaseGateProbeResult[];
  matrixValidation: ReturnType<typeof validateStrategistPhaseGateFailureRecoveryProbeMatrix>;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches; documented FAIL gaps preserved.
 */
export function runStrategistPhaseGateFailureRecoverySlice(
  fixture: StrategistPhaseGateBaseline = loadStrategistPhaseGateBaseline(),
): StrategistPhaseGateFailureRecoverySliceResult {
  const contract = getActiveStrategistPhaseGateContract();
  const results = runStrategistPhaseGateProbes(fixture);
  const failureRecoveryProbes = STRATEGIST_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistPhaseGateContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateStrategistPhaseGateFailureRecoveryProbeMatrix(results, contract);

  return {
    atom: "P03-B10-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

export const runForgeStrategistPhaseGateFailureRecoverySlice =
  runStrategistPhaseGateFailureRecoverySlice;

function resolveStrategistPhaseGateGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function runStrategistPhaseGateProbeWithTiming(
  entry: StrategistPhaseGateBaseline["probes"][number],
  fixture: StrategistPhaseGateBaseline,
  contractProbe:
    | { criterion: string; disposition: StrategistPhaseGateProbeDisposition }
    | undefined,
): {
  result: StrategistPhaseGateProbeResult;
  durationMs: number;
  disposition: StrategistPhaseGateProbeDisposition;
} {
  const start = performance.now();
  const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
  const enriched = contractProbe?.criterion
    ? { ...result, criterion: contractProbe.criterion }
    : result;
  const durationMs = performance.now() - start;
  return {
    result: enriched,
    durationMs,
    disposition: contractProbe?.disposition ?? "observed",
  };
}

function buildStrategistPhaseGateRecordFromEntries(
  entries: StrategistPhaseGateBaseline["probes"],
  fixture: StrategistPhaseGateBaseline,
  contract: ReturnType<typeof getActiveStrategistPhaseGateContract>,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly StrategistPhaseGateCategory[];
  },
): StrategistPhaseGateRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ReturnType<typeof buildStrategistPhaseGateProbeEvidence>[] = [];
  const telemetry: ReturnType<typeof buildStrategistPhaseGateProbeTelemetry>[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runStrategistPhaseGateProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildStrategistPhaseGateProbeEvidence(
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
      buildStrategistPhaseGateProbeTelemetry(result.id, result.category, sequenceIndex, durationMs),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildStrategistPhaseGateProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveStrategistPhaseGateGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildStrategistPhaseGateRunRecord(provenance, evidence, telemetry);
}

/** Run all strategist phase gate probes and emit auditable evidence, telemetry and provenance (P03-B10-A06). */
export function runStrategistPhaseGateProbesWithRecord(
  fixture: StrategistPhaseGateBaseline = loadStrategistPhaseGateBaseline(),
): StrategistPhaseGateRunRecord {
  const contract = getActiveStrategistPhaseGateContract();
  return buildStrategistPhaseGateRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P03-B10-A06). */
export function runStrategistPhaseGateFailureRecoverySliceWithRecord(
  fixture: StrategistPhaseGateBaseline = loadStrategistPhaseGateBaseline(),
): StrategistPhaseGateRunRecord {
  const contract = getActiveStrategistPhaseGateContract();
  const failureRecoveryIds = new Set(listStrategistPhaseGateFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildStrategistPhaseGateRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P03-B10-A06",
    sliceCategories: STRATEGIST_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES,
  });
}

export const runForgeStrategistPhaseGateProbesWithRecord = runStrategistPhaseGateProbesWithRecord;
export const runForgeStrategistPhaseGateFailureRecoverySliceWithRecord =
  runStrategistPhaseGateFailureRecoverySliceWithRecord;

/**
 * A06 evidence slice: contract-wired failure_path, recovery_path, and nogo_path probes
 * with auditable evidence, telemetry and provenance — zero unexpected mismatches.
 */
export function runStrategistPhaseGateEvidenceSlice(
  fixture: StrategistPhaseGateBaseline = loadStrategistPhaseGateBaseline(),
): StrategistPhaseGateEvidenceSliceResult {
  const contract = getActiveStrategistPhaseGateContract();
  const results = runStrategistPhaseGateProbes(fixture);
  const failureRecoveryProbes = STRATEGIST_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistPhaseGateContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const evidenceResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateStrategistPhaseGateFailureRecoveryProbeMatrix(
    results,
    contract,
  );
  const record = runStrategistPhaseGateFailureRecoverySliceWithRecord(fixture);
  const recordValidation = validateStrategistPhaseGateFailureRecoveryRunRecord(
    record,
    contract,
  );

  return {
    atom: "P03-B10-A06",
    evidenceProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    recordValid: recordValidation.valid && record.summary.mismatches === 0,
    results,
    evidenceResults,
    matrixValidation,
    record,
    recordValidation,
  };
}

export const runForgeStrategistPhaseGateEvidenceSlice = runStrategistPhaseGateEvidenceSlice;

export interface StrategistPhaseGatePropertyFuzzSliceResult {
  atom: "P03-B10-A07";
  propertyChecksPassed: boolean;
  contractFuzzRejected: boolean;
  runRecordFuzzRejected: boolean;
  propertyResult: StrategistPhaseGatePropertyResult;
  contractFuzz: StrategistPhaseGateFuzzValidationResult;
  runRecordFuzz: {
    validBaseline: boolean;
    mutationsRejected: number;
    mutationsAccepted: number;
  };
}

/**
 * A07 property/fuzz slice: structural property checks and contract/run-record fuzz gates
 * with zero accepted mutations.
 */
export function runStrategistPhaseGatePropertyFuzzSlice(
  fixture: StrategistPhaseGateBaseline = loadStrategistPhaseGateBaseline(),
): StrategistPhaseGatePropertyFuzzSliceResult {
  const contract = getActiveStrategistPhaseGateContract();
  const propertyResult = runStrategistPhaseGatePropertyChecks(contract);
  const contractFuzz = runStrategistPhaseGateFuzzValidation(fixture, contract);
  const record = runStrategistPhaseGateFailureRecoverySliceWithRecord(fixture);
  const runRecordFuzz = runStrategistPhaseGateRunRecordFuzzValidation(record, contract);

  return {
    atom: "P03-B10-A07",
    propertyChecksPassed: propertyResult.allPassed,
    contractFuzzRejected: contractFuzz.allMutationsRejected,
    runRecordFuzzRejected: runRecordFuzz.mutationsAccepted === 0,
    propertyResult,
    contractFuzz,
    runRecordFuzz,
  };
}

export const runForgeStrategistPhaseGatePropertyFuzzSlice = runStrategistPhaseGatePropertyFuzzSlice;

export {
  buildStrategistPhaseGateProbeEvidence,
  buildStrategistPhaseGateProbeTelemetry,
  buildStrategistPhaseGateProvenance,
  buildStrategistPhaseGateRunRecord,
  validateStrategistPhaseGateFailureRecoveryRunRecord,
  validateStrategistPhaseGateRunRecord,
  runStrategistPhaseGatePropertyChecks,
  runStrategistPhaseGateFuzzValidation,
  runStrategistPhaseGateRunRecordFuzzValidation,
  createStrategistPhaseGateFuzzRng,
  type StrategistPhaseGatePropertyResult,
  type StrategistPhaseGateFuzzValidationResult,
} from "./forge-p03-strategist-phase-gate.js";
