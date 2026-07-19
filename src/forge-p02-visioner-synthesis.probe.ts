/**
 * FOREMAN — Visioner Product Synthesis Probe Harness (P02-B03-A01)
 *
 * Static probes for product vision synthesis baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import visionerSynthesisBaseline from "./fixtures/forge-visioner-synthesis-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP02B02ToB03Handoff,
  getActiveVisionerConstraintContract,
  summarizeVisionerConstraintContractCoverage,
} from "./forge-p02-visioner-constraint.js";
import {
  assessVisionerSynthesisPresence,
  assessVisionerSynthesisInputBoundary,
  validateVisionerSynthesisBaseline,
  validateVisionerSynthesisAgainstContract,
  summarizeVisionerSynthesisMatrix,
  listVisionerSynthesisProbesByExpected,
  listVisionerSynthesisKnownGaps,
  validateVisionerSynthesisProbeMatrix,
  getActiveVisionerSynthesisContract,
  FORGE_VISIONER_SYNTHESIS_VERSION,
  VISIONER_SYNTHESIS_CATEGORIES,
  VISIONER_SYNTHESIS_VISION_MAX_LENGTH,
  EXPECTED_P02_B02_SEALED_ATOM_COUNT,
  buildVisionSynthesisSummary,
  type VisionerSynthesisBaseline,
  type VisionerSynthesisCategory,
  type VisionerSynthesisProbeResult,
} from "./forge-p02-visioner-synthesis.js";

export type { VisionerSynthesisBaseline, VisionerSynthesisProbeResult } from "./forge-p02-visioner-synthesis.js";
export {
  validateVisionerSynthesisBaseline,
  validateVisionerSynthesisAgainstContract,
  summarizeVisionerSynthesisMatrix,
  listVisionerSynthesisProbesByExpected,
  listVisionerSynthesisKnownGaps,
  validateVisionerSynthesisProbeMatrix,
  getActiveVisionerSynthesisContract,
  assessVisionerSynthesisPresence,
  assessVisionerSynthesisInputBoundary,
  extractVisionerSynthesis,
  buildVisionSynthesisSummary,
  FORGE_VISIONER_SYNTHESIS_VERSION,
  VISIONER_SYNTHESIS_CATEGORIES,
  VISIONER_SYNTHESIS_VISION_MAX_LENGTH,
} from "./forge-p02-visioner-synthesis.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(__dirname);

const SAMPLE_VISION_WITH_SYNTHESIS = `**EMOTION TARGET**: Quiet confidence
**FOCAL POINT**: Hero CTA button
**COLOR PHILOSOPHY**: Gold accent on dark canvas, max 3 colors
**TYPOGRAPHY HIERARCHY**: Display 48px / body 16px
**GOAL**: Ship dashboard UI`;

function readSrc(relativePath: string): string {
  return readFileSync(join(SRC_ROOT, relativePath), "utf8");
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: VisionerSynthesisCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): VisionerSynthesisProbeResult {
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

function reviewerSource(): string {
  return readSrc("reviewer-gate.ts");
}

function productionSynthesisSource(): string {
  return readSrc("forge-p02-visioner-synthesis.ts") + readSrc("forge-p02-visioner-synthesis.probe.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionSynthesisSource());
}

function probeSynthesisVersioning(
  id: string,
  category: VisionerSynthesisCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerSynthesisBaseline,
): VisionerSynthesisProbeResult {
  switch (id) {
    case "vsyn.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "vsyn.atom_tagged": {
      const ok = fixture.atom === "P02-B03-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "vsyn.harness_version_exported": {
      const ok = FORGE_VISIONER_SYNTHESIS_VERSION.startsWith("1.0.0");
      return probe(id, category, expected, ok, `harnessVersion=${FORGE_VISIONER_SYNTHESIS_VERSION}`);
    }
    default:
      return probe(id, category, expected, false, "unknown synthesis_versioning probe");
  }
}

function probeSynthesisSignal(
  id: string,
  category: VisionerSynthesisCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerSynthesisProbeResult {
  const prompts = promptsSource();

  switch (id) {
    case "vsyn.prompt_emotion_target": {
      const ok = prompts.includes("**EMOTION TARGET**:");
      return probe(id, category, expected, ok, `emotionTargetSection=${ok}`);
    }
    case "vsyn.prompt_focal_point": {
      const ok = prompts.includes("**FOCAL POINT**:");
      return probe(id, category, expected, ok, `focalPointSection=${ok}`);
    }
    case "vsyn.prompt_synthesize_directive": {
      const ok = prompts.includes("SYNTHESIZE:");
      return probe(id, category, expected, ok, `synthesizeDirective=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown synthesis_signal probe");
  }
}

function probeAestheticSignal(
  id: string,
  category: VisionerSynthesisCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerSynthesisProbeResult {
  const prompts = promptsSource();
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vsyn.prompt_color_philosophy": {
      const ok = prompts.includes("**COLOR PHILOSOPHY**:");
      return probe(id, category, expected, ok, `colorPhilosophySection=${ok}`);
    }
    case "vsyn.prompt_typography_hierarchy": {
      const ok = prompts.includes("**TYPOGRAPHY HIERARCHY**:");
      return probe(id, category, expected, ok, `typographyHierarchySection=${ok}`);
    }
    case "vsyn.vision_summary_aesthetic_extract": {
      const summary = buildVisionSynthesisSummary(SAMPLE_VISION_WITH_SYNTHESIS);
      const ok =
        orchestrator.includes("buildVisionSummary") &&
        summary.includes("EMOTION TARGET") &&
        summary.includes("FOCAL POINT") &&
        summary.includes("COLOR PHILOSOPHY");
      return probe(
        id,
        category,
        expected,
        ok,
        `summaryHasAestheticHeaders=${ok}, len=${summary.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown aesthetic_signal probe");
  }
}

function probeBaselineLink(
  id: string,
  category: VisionerSynthesisCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerSynthesisProbeResult {
  switch (id) {
    case "vsyn.b02_block_handoff_entry": {
      const handoff = getForgeP02B02ToB03Handoff();
      const ok =
        handoff.targetBlock.blockId === "P02-B03" &&
        handoff.targetBlock.entryAtom === "P02-B03-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "vsyn.b02_sealed_constraint_probes": {
      const handoff = getForgeP02B02ToB03Handoff();
      const coverage = summarizeVisionerConstraintContractCoverage(getActiveVisionerConstraintContract());
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
  category: VisionerSynthesisCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerSynthesisBaseline,
): VisionerSynthesisProbeResult {
  switch (id) {
    case "vsyn.source_block_gate_ref": {
      const handoff = getForgeP02B02ToB03Handoff();
      const coverage = summarizeVisionerConstraintContractCoverage(getActiveVisionerConstraintContract());
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.visionerConstraintProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P02_B02_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.visionerConstraintProbeCount}`,
      );
    }
    case "vsyn.probe_runner_exported": {
      const ok = readSrc("forge-p02-visioner-synthesis.probe.ts").includes(
        "export function runVisionerSynthesisProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "vsyn.known_gaps_documented": {
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      return probe(id, category, expected, failCount >= 1, `documentedFail=${failCount}`);
    }
    case "vsyn.empty_vision_synthesis_presence": {
      const result = assessVisionerSynthesisInputBoundary("");
      const presence = assessVisionerSynthesisPresence("");
      const ok =
        hasProductionExport("assessVisionerSynthesisInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false &&
        presence.hasEmotionTarget === false &&
        presence.hasFocalPoint === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, hasEmotion=${presence.hasEmotionTarget}`,
      );
    }
    case "vsyn.whitespace_vision_boundary": {
      const result = assessVisionerSynthesisInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessVisionerSynthesisInputBoundary") &&
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
    case "vsyn.long_vision_truncation_boundary": {
      const longVision = "x".repeat(VISIONER_SYNTHESIS_VISION_MAX_LENGTH + 500);
      const result = assessVisionerSynthesisInputBoundary(longVision);
      const ok =
        hasProductionExport("assessVisionerSynthesisInputBoundary") &&
        result.truncated === true &&
        result.normalizedVision.length === VISIONER_SYNTHESIS_VISION_MAX_LENGTH &&
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
  category: VisionerSynthesisCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerSynthesisBaseline,
): VisionerSynthesisProbeResult {
  switch (id) {
    case "vsyn.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateVisionerSynthesisBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "vsyn.malformed_vision_presence_guard": {
      const boundary = assessVisionerSynthesisInputBoundary("bad\0vision");
      const result = assessVisionerSynthesisPresence("bad\0vision");
      const ok =
        hasProductionExport("assessVisionerSynthesisInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false &&
        result.hasEmotionTarget === false &&
        result.hasFocalPoint === false;
      return probe(id, category, expected, ok, `detail=${result.detail}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: VisionerSynthesisCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerSynthesisProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vsyn.vision_checkpoint_synthesis": {
      const ok =
        orchestrator.includes("priorCheckpoint?.visionOutput") &&
        orchestrator.includes("Restored from pipeline checkpoint");
      return probe(id, category, expected, ok, `checkpointSynthesis=${ok}`);
    }
    case "vsyn.structured_synthesis_recovery": {
      const ok = hasProductionExport("recoverVisionerSynthesis");
      return probe(id, category, expected, ok, `recoverVisionerSynthesis=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: VisionerSynthesisCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerSynthesisProbeResult {
  const prompts = promptsSource();
  const reviewer = reviewerSource();

  switch (id) {
    case "vsyn.reviewer_focal_dilution": {
      const ok = reviewer.includes("FOCAL POINT") && reviewer.includes("dilute");
      return probe(id, category, expected, ok, `reviewerFocalDilution=${ok}`);
    }
    case "vsyn.reflection_aesthetic_alignment": {
      const ok =
        prompts.includes("EMOTION TARGET") &&
        prompts.includes("COLOR PHILOSOPHY") &&
        prompts.includes("Is the FOCAL POINT being diluted");
      return probe(id, category, expected, ok, `reflectionAestheticAlignment=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: VisionerSynthesisCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerSynthesisBaseline,
): VisionerSynthesisProbeResult {
  switch (category) {
    case "synthesis_versioning":
      return probeSynthesisVersioning(id, category, expected, fixture);
    case "synthesis_signal":
      return probeSynthesisSignal(id, category, expected);
    case "aesthetic_signal":
      return probeAestheticSignal(id, category, expected);
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

export function loadVisionerSynthesisBaseline(): VisionerSynthesisBaseline {
  return visionerSynthesisBaseline as VisionerSynthesisBaseline;
}

export function runVisionerSynthesisProbes(
  fixture: VisionerSynthesisBaseline = loadVisionerSynthesisBaseline(),
): VisionerSynthesisProbeResult[] {
  const contract = getActiveVisionerSynthesisContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}

export interface VisionerSynthesisProductionSliceResult {
  atom: "P02-B03-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: VisionerSynthesisProbeResult[];
  summary: ReturnType<typeof summarizeVisionerSynthesisMatrix>;
  matrixValidation: ReturnType<typeof validateVisionerSynthesisProbeMatrix>;
}

/**
 * A03 production vertical slice: structured product synthesis extraction wired to
 * contract probe execution and matrix alignment gate (PASS probes + documented FAIL gaps).
 */
export function runVisionerSynthesisProductionSlice(
  fixture: VisionerSynthesisBaseline = loadVisionerSynthesisBaseline(),
): VisionerSynthesisProductionSliceResult {
  const contract = getActiveVisionerSynthesisContract();
  const fixtureValidation = validateVisionerSynthesisBaseline(fixture);
  const contractValidation = validateVisionerSynthesisAgainstContract(fixture, contract);
  const results = runVisionerSynthesisProbes(fixture);
  const summary = summarizeVisionerSynthesisMatrix(results);
  const matrixValidation = validateVisionerSynthesisProbeMatrix(results, contract);

  return {
    atom: "P02-B03-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}
