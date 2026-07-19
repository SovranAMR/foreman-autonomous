/**
 * FOREMAN — Visioner Constraint Probe Harness (P02-B02-A01)
 *
 * Static probes for constraint and non-goal baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import visionerConstraintBaseline from "./fixtures/forge-visioner-constraint-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP02B01ToB02Handoff,
  getActiveVisionerIntentContract,
  summarizeVisionerIntentContractCoverage,
} from "./forge-p02-visioner-intent.js";
import {
  assessVisionerConstraintPresence,
  assessVisionerConstraintInputBoundary,
  extractVisionerConstraints,
  validateVisionerConstraintBaseline,
  validateVisionerConstraintAgainstContract,
  validateVisionerConstraintProbeMatrix,
  validateVisionerConstraintBoundaryProbeMatrix,
  validateVisionerConstraintFailureRecoveryProbeMatrix,
  VISIONER_CONSTRAINT_FAILURE_RECOVERY_CATEGORIES,
  summarizeVisionerConstraintMatrix,
  listVisionerConstraintProbesByExpected,
  listVisionerConstraintKnownGaps,
  listVisionerConstraintContractProbesByCategory,
  listVisionerConstraintFailureRecoveryProbeIds,
  getActiveVisionerConstraintContract,
  FORGE_VISIONER_CONSTRAINT_VERSION,
  VISIONER_CONSTRAINT_CATEGORIES,
  VISIONER_CONSTRAINT_VISION_MAX_LENGTH,
  EXPECTED_P02_B01_SEALED_ATOM_COUNT,
  type VisionerConstraintBaseline,
  type VisionerConstraintCategory,
  type VisionerConstraintProbeResult,
} from "./forge-p02-visioner-constraint.js";

export type { VisionerConstraintBaseline, VisionerConstraintProbeResult } from "./forge-p02-visioner-constraint.js";
export {
  validateVisionerConstraintBaseline,
  validateVisionerConstraintAgainstContract,
  validateVisionerConstraintProbeMatrix,
  validateVisionerConstraintBoundaryProbeMatrix,
  validateVisionerConstraintFailureRecoveryProbeMatrix,
  listVisionerConstraintFailureRecoveryProbeIds,
  VISIONER_CONSTRAINT_FAILURE_RECOVERY_CATEGORIES,
  summarizeVisionerConstraintMatrix,
  listVisionerConstraintProbesByExpected,
  listVisionerConstraintKnownGaps,
  getActiveVisionerConstraintContract,
  assessVisionerConstraintPresence,
  assessVisionerConstraintInputBoundary,
  extractVisionerConstraints,
  buildVisionConstraintSummary,
  FORGE_VISIONER_CONSTRAINT_VERSION,
  VISIONER_CONSTRAINT_CATEGORIES,
  VISIONER_CONSTRAINT_VISION_MAX_LENGTH,
} from "./forge-p02-visioner-constraint.js";

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
  category: VisionerConstraintCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): VisionerConstraintProbeResult {
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

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function productionConstraintSource(): string {
  return readSrc("forge-p02-visioner-constraint.ts") + readSrc("forge-p02-visioner-constraint.probe.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionConstraintSource());
}

const SAMPLE_VISION_WITH_CONSTRAINTS = `**GOAL**: Ship feature
**CONSTRAINTS**: TypeScript strict mode only
**FORBIDDEN**: No jQuery`;

function probeConstraintVersioning(
  id: string,
  category: VisionerConstraintCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerConstraintBaseline,
): VisionerConstraintProbeResult {
  switch (id) {
    case "vcon.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "vcon.atom_tagged": {
      const ok = fixture.atom === "P02-B02-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "vcon.harness_version_exported": {
      const ok = FORGE_VISIONER_CONSTRAINT_VERSION.startsWith("1.0.0");
      return probe(id, category, expected, ok, `harnessVersion=${FORGE_VISIONER_CONSTRAINT_VERSION}`);
    }
    default:
      return probe(id, category, expected, false, "unknown constraint_versioning probe");
  }
}

function probeConstraintSignal(
  id: string,
  category: VisionerConstraintCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerConstraintProbeResult {
  const prompts = promptsSource();
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vcon.prompt_constraints_section": {
      const ok = prompts.includes("**CONSTRAINTS**:");
      return probe(id, category, expected, ok, `constraintsSection=${ok}`);
    }
    case "vcon.prompt_forbidden_section": {
      const ok = prompts.includes("**FORBIDDEN**:") || prompts.includes("FORBIDDEN LIST");
      return probe(id, category, expected, ok, `forbiddenSection=${ok}`);
    }
    case "vcon.vision_summary_constraint_extract": {
      const ok = orchestrator.includes("buildVisionConstraintSummary");
      return probe(id, category, expected, ok, `summaryConstraintExtract=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown constraint_signal probe");
  }
}

function probeNonGoalSignal(
  id: string,
  category: VisionerConstraintCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerConstraintProbeResult {
  const prompts = promptsSource();
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vcon.forbidden_list_rules": {
      const ok = prompts.includes("FORBIDDEN LIST Rules");
      return probe(id, category, expected, ok, `forbiddenListRules=${ok}`);
    }
    case "vcon.vision_pinned_constraints": {
      const ok = orchestrator.includes("respect all constraints");
      return probe(id, category, expected, ok, `pinnedConstraints=${ok}`);
    }
    case "vcon.non_goal_forbidden_extract": {
      const extracted = extractVisionerConstraints(SAMPLE_VISION_WITH_CONSTRAINTS);
      const ok =
        hasProductionExport("extractVisionerConstraints") &&
        extracted.hasNonGoals === true &&
        extracted.hasConstraints === true &&
        extracted.nonGoals.length > 0 &&
        extracted.constraints.length > 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `constraints=${extracted.constraints.length}, nonGoals=${extracted.nonGoals.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown non_goal_signal probe");
  }
}

function probeBaselineLink(
  id: string,
  category: VisionerConstraintCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerConstraintProbeResult {
  switch (id) {
    case "vcon.b01_block_handoff_entry": {
      const handoff = getForgeP02B01ToB02Handoff();
      const ok =
        handoff.targetBlock.blockId === "P02-B02" &&
        handoff.targetBlock.entryAtom === "P02-B02-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "vcon.b01_sealed_intent_probes": {
      const handoff = getForgeP02B01ToB02Handoff();
      const coverage = summarizeVisionerIntentContractCoverage(getActiveVisionerIntentContract());
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
  category: VisionerConstraintCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerConstraintBaseline,
): VisionerConstraintProbeResult {
  switch (id) {
    case "vcon.source_block_gate_ref": {
      const handoff = getForgeP02B01ToB02Handoff();
      const coverage = summarizeVisionerIntentContractCoverage(getActiveVisionerIntentContract());
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.visionerIntentProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P02_B01_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.visionerIntentProbeCount}`,
      );
    }
    case "vcon.probe_runner_exported": {
      const ok = readSrc("forge-p02-visioner-constraint.probe.ts").includes(
        "export function runVisionerConstraintProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "vcon.known_gaps_documented": {
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      return probe(id, category, expected, failCount >= 1, `documentedFail=${failCount}`);
    }
    case "vcon.empty_vision_constraint_presence": {
      const result = assessVisionerConstraintInputBoundary("");
      const presence = assessVisionerConstraintPresence("");
      const ok =
        hasProductionExport("assessVisionerConstraintInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false &&
        presence.hasConstraints === false &&
        presence.hasNonGoals === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, hasConstraints=${presence.hasConstraints}`,
      );
    }
    case "vcon.whitespace_vision_boundary": {
      const result = assessVisionerConstraintInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessVisionerConstraintInputBoundary") &&
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
    case "vcon.long_vision_truncation_boundary": {
      const longVision = "x".repeat(VISIONER_CONSTRAINT_VISION_MAX_LENGTH + 500);
      const result = assessVisionerConstraintInputBoundary(longVision);
      const ok =
        hasProductionExport("assessVisionerConstraintInputBoundary") &&
        result.truncated === true &&
        result.normalizedVision.length === VISIONER_CONSTRAINT_VISION_MAX_LENGTH &&
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
  category: VisionerConstraintCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerConstraintBaseline,
): VisionerConstraintProbeResult {
  switch (id) {
    case "vcon.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateVisionerConstraintBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "vcon.malformed_vision_presence_guard": {
      const boundary = assessVisionerConstraintInputBoundary("bad\0vision");
      const result = assessVisionerConstraintPresence("bad\0vision");
      const ok =
        hasProductionExport("assessVisionerConstraintInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false &&
        result.hasConstraints === false &&
        result.hasNonGoals === false;
      return probe(id, category, expected, ok, `detail=${result.detail}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: VisionerConstraintCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerConstraintProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vcon.vision_checkpoint_constraints": {
      const ok =
        orchestrator.includes("priorCheckpoint?.visionOutput") &&
        orchestrator.includes("Restored from pipeline checkpoint");
      return probe(id, category, expected, ok, `checkpointConstraints=${ok}`);
    }
    case "vcon.structured_constraint_recovery": {
      const ok = hasProductionExport("recoverVisionerConstraints");
      return probe(id, category, expected, ok, `recoverVisionerConstraints=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: VisionerConstraintCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerConstraintProbeResult {
  const prompts = promptsSource();

  switch (id) {
    case "vcon.strategist_contradiction_block": {
      const ok =
        prompts.includes("You CAN block the Visioner if the vision contains internal contradictions");
      return probe(id, category, expected, ok, `strategistContradictionBlock=${ok}`);
    }
    case "vcon.worker_constraint_nogo": {
      const ok = prompts.includes("The atom contradicts the vision or established constraints");
      return probe(id, category, expected, ok, `workerConstraintNogo=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: VisionerConstraintCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerConstraintBaseline,
): VisionerConstraintProbeResult {
  switch (category) {
    case "constraint_versioning":
      return probeConstraintVersioning(id, category, expected, fixture);
    case "constraint_signal":
      return probeConstraintSignal(id, category, expected);
    case "non_goal_signal":
      return probeNonGoalSignal(id, category, expected);
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

export function loadVisionerConstraintBaseline(): VisionerConstraintBaseline {
  return visionerConstraintBaseline as VisionerConstraintBaseline;
}

export function runVisionerConstraintProbes(
  fixture: VisionerConstraintBaseline = loadVisionerConstraintBaseline(),
): VisionerConstraintProbeResult[] {
  const contract = getActiveVisionerConstraintContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}

export interface VisionerConstraintProductionSliceResult {
  atom: "P02-B02-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: VisionerConstraintProbeResult[];
  summary: ReturnType<typeof summarizeVisionerConstraintMatrix>;
  matrixValidation: ReturnType<typeof validateVisionerConstraintProbeMatrix>;
}

/**
 * A03 production vertical slice: structured constraint/non-goal extraction wired to
 * contract probe execution and matrix alignment gate (PASS probes + documented FAIL gaps).
 */
export function runVisionerConstraintProductionSlice(
  fixture: VisionerConstraintBaseline = loadVisionerConstraintBaseline(),
): VisionerConstraintProductionSliceResult {
  const contract = getActiveVisionerConstraintContract();
  const fixtureValidation = validateVisionerConstraintBaseline(fixture);
  const contractValidation = validateVisionerConstraintAgainstContract(fixture, contract);
  const results = runVisionerConstraintProbes(fixture);
  const summary = summarizeVisionerConstraintMatrix(results);
  const matrixValidation = validateVisionerConstraintProbeMatrix(results, contract);

  return {
    atom: "P02-B02-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface VisionerConstraintBoundarySliceResult {
  atom: "P02-B02-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: VisionerConstraintProbeResult[];
  boundaryResults: VisionerConstraintProbeResult[];
  matrixValidation: ReturnType<typeof validateVisionerConstraintBoundaryProbeMatrix>;
}

/**
 * A04 boundary slice: contract-wired boundary probes (vision output edge cases, probe runner,
 * documented gaps) with zero unexpected mismatches; remaining documented FAIL gaps preserved.
 */
export function runVisionerConstraintBoundarySlice(
  fixture: VisionerConstraintBaseline = loadVisionerConstraintBaseline(),
): VisionerConstraintBoundarySliceResult {
  const contract = getActiveVisionerConstraintContract();
  const results = runVisionerConstraintProbes(fixture);
  const boundaryProbes = listVisionerConstraintContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateVisionerConstraintBoundaryProbeMatrix(results, contract);

  return {
    atom: "P02-B02-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

export interface VisionerConstraintFailureRecoverySliceResult {
  atom: "P02-B02-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: VisionerConstraintProbeResult[];
  failureRecoveryResults: VisionerConstraintProbeResult[];
  matrixValidation: ReturnType<typeof validateVisionerConstraintFailureRecoveryProbeMatrix>;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches; documented FAIL gaps preserved.
 */
export function runVisionerConstraintFailureRecoverySlice(
  fixture: VisionerConstraintBaseline = loadVisionerConstraintBaseline(),
): VisionerConstraintFailureRecoverySliceResult {
  const contract = getActiveVisionerConstraintContract();
  const results = runVisionerConstraintProbes(fixture);
  const failureRecoveryProbes = VISIONER_CONSTRAINT_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listVisionerConstraintContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateVisionerConstraintFailureRecoveryProbeMatrix(results, contract);

  return {
    atom: "P02-B02-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}
