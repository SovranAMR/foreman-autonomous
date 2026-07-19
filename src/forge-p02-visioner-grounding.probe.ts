/**
 * FOREMAN — Visioner Grounding Probe Harness (P02-B04-A01)
 *
 * Static probes for repo and user context grounding baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import visionerGroundingBaseline from "./fixtures/forge-visioner-grounding-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP02B03ToB04Handoff,
  getActiveVisionerSynthesisContract,
  summarizeVisionerSynthesisContractCoverage,
} from "./forge-p02-visioner-synthesis.js";
import {
  assessVisionerGroundingInputBoundary,
  assessVisionerGroundingPresence,
  validateVisionerGroundingBaseline,
  validateVisionerGroundingAgainstContract,
  summarizeVisionerGroundingMatrix,
  listVisionerGroundingProbesByExpected,
  listVisionerGroundingKnownGaps,
  getActiveVisionerGroundingContract,
  FORGE_VISIONER_GROUNDING_VERSION,
  VISIONER_GROUNDING_CATEGORIES,
  VISIONER_GROUNDING_CONTEXT_MAX_LENGTH,
  EXPECTED_P02_B03_SEALED_ATOM_COUNT,
  type VisionerGroundingBaseline,
  type VisionerGroundingCategory,
  type VisionerGroundingProbeResult,
} from "./forge-p02-visioner-grounding.js";

export type { VisionerGroundingBaseline, VisionerGroundingProbeResult } from "./forge-p02-visioner-grounding.js";
export {
  validateVisionerGroundingBaseline,
  validateVisionerGroundingAgainstContract,
  summarizeVisionerGroundingMatrix,
  listVisionerGroundingProbesByExpected,
  listVisionerGroundingKnownGaps,
  getActiveVisionerGroundingContract,
  assessVisionerGroundingInputBoundary,
  assessVisionerGroundingPresence,
  FORGE_VISIONER_GROUNDING_VERSION,
  VISIONER_GROUNDING_CATEGORIES,
  VISIONER_GROUNDING_CONTEXT_MAX_LENGTH,
  EXPECTED_P02_B03_SEALED_ATOM_COUNT,
  summarizeVisionerGroundingContractCoverage,
} from "./forge-p02-visioner-grounding.js";

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
  category: VisionerGroundingCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): VisionerGroundingProbeResult {
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

function projectDetectorSource(): string {
  return readSrc("project-detector.ts");
}

function productionGroundingSource(): string {
  return readSrc("forge-p02-visioner-grounding.ts") + readSrc("forge-p02-visioner-grounding.probe.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionGroundingSource());
}

function probeGroundingVersioning(
  id: string,
  category: VisionerGroundingCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerGroundingBaseline,
): VisionerGroundingProbeResult {
  switch (id) {
    case "vgrd.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "vgrd.atom_tagged": {
      const ok = fixture.atom === "P02-B04-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "vgrd.harness_version_exported": {
      const ok = FORGE_VISIONER_GROUNDING_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_VISIONER_GROUNDING_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown grounding_versioning probe");
  }
}

function probeRepoSignal(
  id: string,
  category: VisionerGroundingCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerGroundingProbeResult {
  const orchestrator = orchestratorSource();
  const detector = projectDetectorSource();

  switch (id) {
    case "vgrd.orchestrator_project_context": {
      const ok =
        orchestrator.includes("formatProjectContext") &&
        orchestrator.includes("Project Context:") &&
        orchestrator.includes("projectContext");
      return probe(id, category, expected, ok, `projectContextInjected=${ok}`);
    }
    case "vgrd.project_detector_exported": {
      const ok =
        detector.includes("export function detectProject") &&
        detector.includes("export function formatProjectContext");
      return probe(id, category, expected, ok, `detectorExports=${ok}`);
    }
    case "vgrd.vision_prompt_project_wiring": {
      const ok =
        orchestrator.includes("buildVisionPromptForDepth") &&
        orchestrator.includes("projectContext,");
      return probe(id, category, expected, ok, `projectContextWired=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown repo_signal probe");
  }
}

function probeUserSignal(
  id: string,
  category: VisionerGroundingCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerGroundingProbeResult {
  const orchestrator = orchestratorSource();
  const prompts = promptsSource();

  switch (id) {
    case "vgrd.identity_context_injection": {
      const ok =
        orchestrator.includes("buildContextInjection") &&
        orchestrator.includes("identityContext");
      return probe(id, category, expected, ok, `identityContextInjected=${ok}`);
    }
    case "vgrd.prompt_context_sections": {
      const ok =
        prompts.includes("PROJECT MEMORY") &&
        prompts.includes("SESSION CONTEXT") &&
        prompts.includes("IDENTITY CONTEXT");
      return probe(id, category, expected, ok, `contextSections=${ok}`);
    }
    case "vgrd.build_context_text_session": {
      const ok =
        prompts.includes("export function buildContextText") &&
        prompts.includes("sessionContext") &&
        prompts.includes("if (sessionContext && sessionContext.length > 0)");
      return probe(id, category, expected, ok, `sessionContextWired=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown user_signal probe");
  }
}

function probeBaselineLink(
  id: string,
  category: VisionerGroundingCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerGroundingProbeResult {
  switch (id) {
    case "vgrd.b03_block_handoff_entry": {
      const handoff = getForgeP02B03ToB04Handoff();
      const ok =
        handoff.targetBlock.blockId === "P02-B04" &&
        handoff.targetBlock.entryAtom === "P02-B04-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "vgrd.b03_sealed_synthesis_probes": {
      const handoff = getForgeP02B03ToB04Handoff();
      const coverage = summarizeVisionerSynthesisContractCoverage(getActiveVisionerSynthesisContract());
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
  category: VisionerGroundingCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerGroundingBaseline,
): VisionerGroundingProbeResult {
  switch (id) {
    case "vgrd.source_block_gate_ref": {
      const handoff = getForgeP02B03ToB04Handoff();
      const coverage = summarizeVisionerSynthesisContractCoverage(getActiveVisionerSynthesisContract());
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.visionerSynthesisProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P02_B03_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.visionerSynthesisProbeCount}`,
      );
    }
    case "vgrd.probe_runner_exported": {
      const ok = readSrc("forge-p02-visioner-grounding.probe.ts").includes(
        "export function runVisionerGroundingProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "vgrd.known_gaps_documented": {
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      return probe(id, category, expected, failCount >= 1, `documentedFail=${failCount}`);
    }
    case "vgrd.empty_context_boundary": {
      const result = assessVisionerGroundingInputBoundary("");
      const presence = assessVisionerGroundingPresence("");
      const ok =
        hasProductionExport("assessVisionerGroundingInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false &&
        presence.hasProjectAnchor === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, projectAnchor=${presence.hasProjectAnchor}`,
      );
    }
    case "vgrd.whitespace_context_boundary": {
      const result = assessVisionerGroundingInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessVisionerGroundingInputBoundary") &&
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
    case "vgrd.long_context_truncation_boundary": {
      const longContext = "x".repeat(VISIONER_GROUNDING_CONTEXT_MAX_LENGTH + 500);
      const result = assessVisionerGroundingInputBoundary(longContext);
      const ok =
        hasProductionExport("assessVisionerGroundingInputBoundary") &&
        result.truncated === true &&
        result.normalizedContext.length === VISIONER_GROUNDING_CONTEXT_MAX_LENGTH &&
        result.acceptable === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `truncated=${result.truncated}, len=${result.normalizedContext.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: VisionerGroundingCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerGroundingBaseline,
): VisionerGroundingProbeResult {
  switch (id) {
    case "vgrd.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateVisionerGroundingBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "vgrd.malformed_context_guard": {
      const boundary = assessVisionerGroundingInputBoundary("bad\0context");
      const result = assessVisionerGroundingPresence("bad\0context");
      const ok =
        hasProductionExport("assessVisionerGroundingInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false &&
        result.hasProjectAnchor === false;
      return probe(id, category, expected, ok, `detail=${result.detail}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: VisionerGroundingCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerGroundingProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vgrd.vision_checkpoint_grounding": {
      const ok =
        orchestrator.includes("priorCheckpoint?.visionOutput") &&
        orchestrator.includes("Restored from pipeline checkpoint") &&
        orchestrator.includes("formatProjectContext");
      return probe(id, category, expected, ok, `checkpointGrounding=${ok}`);
    }
    case "vgrd.structured_grounding_recovery": {
      const ok = hasProductionExport("recoverVisionerGrounding");
      return probe(id, category, expected, ok, `recoverVisionerGrounding=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: VisionerGroundingCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerGroundingProbeResult {
  const orchestrator = orchestratorSource();
  const prompts = promptsSource();

  switch (id) {
    case "vgrd.intent_ambiguity_nogo": {
      const ok =
        orchestrator.includes("checkVisionerIntentAmbiguity") &&
        orchestrator.includes("intent_ambiguity_nogo");
      return probe(id, category, expected, ok, `ambiguityNogo=${ok}`);
    }
    case "vgrd.reflection_memory_context": {
      const ok = prompts.includes("MEMORY: Accumulated project knowledge");
      return probe(id, category, expected, ok, `reflectionMemoryContext=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: VisionerGroundingCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerGroundingBaseline,
): VisionerGroundingProbeResult {
  switch (category) {
    case "grounding_versioning":
      return probeGroundingVersioning(id, category, expected, fixture);
    case "repo_signal":
      return probeRepoSignal(id, category, expected);
    case "user_signal":
      return probeUserSignal(id, category, expected);
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

export function loadVisionerGroundingBaseline(): VisionerGroundingBaseline {
  return visionerGroundingBaseline as VisionerGroundingBaseline;
}

export function runVisionerGroundingProbes(
  fixture: VisionerGroundingBaseline = loadVisionerGroundingBaseline(),
): VisionerGroundingProbeResult[] {
  const contract = getActiveVisionerGroundingContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}
