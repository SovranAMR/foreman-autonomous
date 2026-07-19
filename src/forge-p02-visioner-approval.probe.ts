/**
 * FOREMAN — Visioner Approval Probe Harness (P02-B09-A01)
 *
 * Static probes for user approval and steering baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import visionerApprovalBaseline from "./fixtures/forge-visioner-approval-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP02B08ToB09Handoff,
  getActiveVisionerScoringContract,
  summarizeVisionerScoringContractCoverage,
} from "./forge-p02-visioner-scoring.js";
import {
  assessVisionerApprovalInputBoundary,
  assessVisionerApprovalPresence,
  recoverVisionerSteering,
  validateVisionerApprovalBaseline,
  validateVisionerApprovalAgainstContract,
  validateVisionerApprovalProbeMatrix,
  validateVisionerApprovalBoundaryProbeMatrix,
  summarizeVisionerApprovalMatrix,
  listVisionerApprovalProbesByExpected,
  listVisionerApprovalKnownGaps,
  listVisionerApprovalContractProbesByCategory,
  getActiveVisionerApprovalContract,
  FORGE_VISIONER_APPROVAL_VERSION,
  VISIONER_APPROVAL_CATEGORIES,
  VISIONER_APPROVAL_VISION_MAX_LENGTH,
  EXPECTED_P02_B08_SEALED_ATOM_COUNT,
  type VisionerApprovalBaseline,
  type VisionerApprovalCategory,
  type VisionerApprovalProbeResult,
} from "./forge-p02-visioner-approval.js";

export type { VisionerApprovalBaseline, VisionerApprovalProbeResult } from "./forge-p02-visioner-approval.js";
export {
  validateVisionerApprovalBaseline,
  summarizeVisionerApprovalMatrix,
  listVisionerApprovalProbesByExpected,
  listVisionerApprovalKnownGaps,
  getActiveVisionerApprovalContract,
  assessVisionerApprovalInputBoundary,
  assessVisionerApprovalPresence,
  recoverVisionerSteering,
  FORGE_VISIONER_APPROVAL_VERSION,
  VISIONER_APPROVAL_CATEGORIES,
  VISIONER_APPROVAL_VISION_MAX_LENGTH,
  EXPECTED_P02_B08_SEALED_ATOM_COUNT,
} from "./forge-p02-visioner-approval.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(__dirname);

function readSrc(relativePath: string): string {
  return readFileSync(join(SRC_ROOT, relativePath), "utf8");
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: VisionerApprovalCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): VisionerApprovalProbeResult {
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

function engineSource(): string {
  return readSrc("engine.ts");
}

function interactiveSource(): string {
  return readSrc("interactive-confirm.ts");
}

function productionApprovalSource(): string {
  return readSrc("forge-p02-visioner-approval.ts") + readSrc("forge-p02-visioner-approval.probe.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionApprovalSource());
}

function probeApprovalVersioning(
  id: string,
  category: VisionerApprovalCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerApprovalBaseline,
): VisionerApprovalProbeResult {
  switch (id) {
    case "vapp.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "vapp.atom_tagged": {
      const ok = fixture.atom === "P02-B09-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "vapp.harness_version_exported": {
      const ok = FORGE_VISIONER_APPROVAL_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_VISIONER_APPROVAL_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown approval_versioning probe");
  }
}

function probeApprovalSignal(
  id: string,
  category: VisionerApprovalCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerApprovalProbeResult {
  const orchestrator = orchestratorSource();
  const engine = engineSource();

  switch (id) {
    case "vapp.orchestrator_vision_approval_gate": {
      const ok =
        orchestrator.includes("HUMAN_APPROVAL") &&
        orchestrator.includes("interactive.confirm") &&
        orchestrator.includes("vision_document");
      return probe(id, category, expected, ok, `approvalGate=${ok}`);
    }
    case "vapp.interactive_confirm_engine": {
      const ok =
        engine.includes("InteractiveConfirm") &&
        engine.includes("readonly interactive: InteractiveConfirm");
      return probe(id, category, expected, ok, `interactiveEngine=${ok}`);
    }
    case "vapp.b08_handoff_prerequisite": {
      const handoff = getForgeP02B08ToB09Handoff();
      const ok =
        handoff.entryCriteria.requiresBlockGatePass === true &&
        handoff.entryCriteria.visionerScoringRecordRequired === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `requiresBlockGatePass=${handoff.entryCriteria.requiresBlockGatePass}, scoringRecord=${handoff.entryCriteria.visionerScoringRecordRequired}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown approval_signal probe");
  }
}

function probeSteeringSignal(
  id: string,
  category: VisionerApprovalCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerApprovalProbeResult {
  const orchestrator = orchestratorSource();
  const kimi = readSrc("kimi-provider.ts");
  const antigravity = readSrc("antigravity-provider.ts");

  switch (id) {
    case "vapp.vision_modify_steering": {
      const ok =
        orchestrator.includes('approvalResult.action === "modify"') &&
        orchestrator.includes("The user reviewed your vision and wants changes");
      return probe(id, category, expected, ok, `modifySteering=${ok}`);
    }
    case "vapp.resume_skips_approval": {
      const ok =
        orchestrator.includes("!isResuming && this.engine.interactive.isEnabled()") &&
        orchestrator.includes("On resume, skip approval");
      return probe(id, category, expected, ok, `resumeSkipsApproval=${ok}`);
    }
    case "vapp.provider_steering_messages": {
      const ok =
        (kimi.includes("steering messages") || kimi.includes("steering message")) &&
        (antigravity.includes("steering messages") || antigravity.includes("steering message"));
      return probe(id, category, expected, ok, `providerSteering=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown steering_signal probe");
  }
}

function probeBaselineLink(
  id: string,
  category: VisionerApprovalCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerApprovalProbeResult {
  switch (id) {
    case "vapp.b08_block_handoff_entry": {
      const handoff = getForgeP02B08ToB09Handoff();
      const ok =
        handoff.targetBlock.blockId === "P02-B09" &&
        handoff.targetBlock.entryAtom === "P02-B09-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "vapp.b08_sealed_scoring_probes": {
      const handoff = getForgeP02B08ToB09Handoff();
      const coverage = summarizeVisionerScoringContractCoverage(getActiveVisionerScoringContract());
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
  category: VisionerApprovalCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerApprovalBaseline,
): VisionerApprovalProbeResult {
  switch (id) {
    case "vapp.source_block_gate_ref": {
      const handoff = getForgeP02B08ToB09Handoff();
      const coverage = summarizeVisionerScoringContractCoverage(getActiveVisionerScoringContract());
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.visionerScoringProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P02_B08_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.visionerScoringProbeCount}`,
      );
    }
    case "vapp.probe_runner_exported": {
      const ok = readSrc("forge-p02-visioner-approval.probe.ts").includes(
        "export function runVisionerApprovalProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "vapp.known_gaps_documented": {
      const contract = getActiveVisionerApprovalContract();
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
    case "vapp.empty_vision_approval_boundary": {
      const result = assessVisionerApprovalInputBoundary("");
      const presence = assessVisionerApprovalPresence("");
      const ok =
        hasProductionExport("assessVisionerApprovalInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false &&
        presence.hasApproval === false &&
        presence.hasSteering === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, hasApproval=${presence.hasApproval}`,
      );
    }
    case "vapp.whitespace_vision_boundary": {
      const result = assessVisionerApprovalInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessVisionerApprovalInputBoundary") &&
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
    case "vapp.long_vision_truncation_boundary": {
      const longVision = "x".repeat(VISIONER_APPROVAL_VISION_MAX_LENGTH + 500);
      const result = assessVisionerApprovalInputBoundary(longVision);
      const ok =
        hasProductionExport("assessVisionerApprovalInputBoundary") &&
        result.truncated === true &&
        result.normalizedVision.length === VISIONER_APPROVAL_VISION_MAX_LENGTH &&
        result.acceptable === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `truncated=${result.truncated}, len=${result.normalizedVision.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: VisionerApprovalCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerApprovalBaseline,
): VisionerApprovalProbeResult {
  switch (id) {
    case "vapp.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateVisionerApprovalBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "vapp.malformed_vision_approval_guard": {
      const boundary = assessVisionerApprovalInputBoundary("bad\0vision");
      const result = assessVisionerApprovalPresence("bad\0vision");
      const ok =
        hasProductionExport("assessVisionerApprovalInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false &&
        result.hasApproval === false &&
        result.hasSteering === false;
      return probe(id, category, expected, ok, `detail=${result.detail}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: VisionerApprovalCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerApprovalProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vapp.vision_checkpoint_approval_skip": {
      const ok =
        orchestrator.includes("On resume, skip approval") &&
        orchestrator.includes("priorCheckpoint?.visionOutput");
      return probe(id, category, expected, ok, `checkpointApprovalSkip=${ok}`);
    }
    case "vapp.structured_steering_recovery": {
      const malformed = `REASONING: Vision document pending user review before decomposition
OUTPUT: **GOAL**: Dental clinic booking platform
user feedback: emphasize mobile-first UX and simplify onboarding flow
modify vision: focus on speed-to-value messaging over feature breadth
approval needed: pending user review
steering: prioritize conversion metrics and reduce scope to MVP landing page`;
      const recovery = recoverVisionerSteering(malformed);
      const ok =
        hasProductionExport("recoverVisionerSteering") &&
        recovery.recovered === true &&
        recovery.presence.hasApproval &&
        recovery.presence.hasSteering &&
        recovery.approvalRevision.includes("pending") &&
        recovery.steeringPoints.some(point => point.includes("mobile-first")) &&
        recovery.steeringPoints.some(point => point.includes("conversion metrics"));
      return probe(
        id,
        category,
        expected,
        ok,
        `recovered=${recovery.recovered}, ${recovery.detail}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: VisionerApprovalCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerApprovalProbeResult {
  const orchestrator = orchestratorSource();
  const interactive = interactiveSource();

  switch (id) {
    case "vapp.vision_rejection_abort": {
      const ok =
        orchestrator.includes('approvalResult.action === "abort"') &&
        orchestrator.includes('approvalResult.action === "skip"') &&
        orchestrator.includes("vision_rejected");
      return probe(id, category, expected, ok, `visionRejectionAbort=${ok}`);
    }
    case "vapp.interactive_timeout_default": {
      const ok =
        interactive.includes("timeoutAction") &&
        interactive.includes("DEFAULT_CONFIG") &&
        interactive.includes("timeoutMs");
      return probe(id, category, expected, ok, `timeoutDefault=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: VisionerApprovalCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerApprovalBaseline,
): VisionerApprovalProbeResult {
  switch (category) {
    case "approval_versioning":
      return probeApprovalVersioning(id, category, expected, fixture);
    case "approval_signal":
      return probeApprovalSignal(id, category, expected);
    case "steering_signal":
      return probeSteeringSignal(id, category, expected);
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

export function loadVisionerApprovalBaseline(): VisionerApprovalBaseline {
  return visionerApprovalBaseline as VisionerApprovalBaseline;
}

export function runVisionerApprovalProbes(
  fixture: VisionerApprovalBaseline = loadVisionerApprovalBaseline(),
): VisionerApprovalProbeResult[] {
  const contract = getActiveVisionerApprovalContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}

export interface VisionerApprovalProductionSliceResult {
  atom: "P02-B09-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: VisionerApprovalProbeResult[];
  summary: ReturnType<typeof summarizeVisionerApprovalMatrix>;
  matrixValidation: ReturnType<typeof validateVisionerApprovalProbeMatrix>;
}

/**
 * A03 production vertical slice: recoverVisionerSteering wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runVisionerApprovalProductionSlice(
  fixture: VisionerApprovalBaseline = loadVisionerApprovalBaseline(),
): VisionerApprovalProductionSliceResult {
  const contract = getActiveVisionerApprovalContract();
  const fixtureValidation = validateVisionerApprovalBaseline(fixture);
  const contractValidation = validateVisionerApprovalAgainstContract(fixture, contract);
  const results = runVisionerApprovalProbes(fixture);
  const summary = summarizeVisionerApprovalMatrix(results);
  const matrixValidation = validateVisionerApprovalProbeMatrix(results, contract);

  return {
    atom: "P02-B09-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid,
    results,
    summary,
    matrixValidation,
  };
}

export interface VisionerApprovalBoundarySliceResult {
  atom: "P02-B09-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: VisionerApprovalProbeResult[];
  boundaryResults: VisionerApprovalProbeResult[];
  matrixValidation: ReturnType<typeof validateVisionerApprovalBoundaryProbeMatrix>;
}

/**
 * A04 boundary slice: contract-wired boundary probes (approval input edge cases, probe runner,
 * documented gaps) with zero unexpected mismatches.
 */
export function runVisionerApprovalBoundarySlice(
  fixture: VisionerApprovalBaseline = loadVisionerApprovalBaseline(),
): VisionerApprovalBoundarySliceResult {
  const contract = getActiveVisionerApprovalContract();
  const results = runVisionerApprovalProbes(fixture);
  const boundaryProbes = listVisionerApprovalContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateVisionerApprovalBoundaryProbeMatrix(results, contract);

  return {
    atom: "P02-B09-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}
