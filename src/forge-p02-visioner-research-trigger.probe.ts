/**
 * FOREMAN — Visioner Research Trigger Probe Harness (P02-B05-A01)
 *
 * Static probes for NEEDS_RESEARCH / RESEARCH_QUERY baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import visionerResearchTriggerBaseline from "./fixtures/forge-visioner-research-trigger-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP02B04ToB05Handoff,
  getActiveVisionerGroundingContract,
  summarizeVisionerGroundingContractCoverage,
} from "./forge-p02-visioner-grounding.js";
import { parseVisionResponse } from "./parser.js";
import {
  assessVisionerResearchTriggerInputBoundary,
  assessVisionerResearchTriggerPresence,
  validateVisionerResearchTriggerBaseline,
  validateVisionerResearchTriggerAgainstContract,
  summarizeVisionerResearchTriggerMatrix,
  listVisionerResearchTriggerProbesByExpected,
  listVisionerResearchTriggerKnownGaps,
  getActiveVisionerResearchTriggerContract,
  FORGE_VISIONER_RESEARCH_TRIGGER_VERSION,
  VISIONER_RESEARCH_TRIGGER_CATEGORIES,
  VISIONER_RESEARCH_TRIGGER_VISION_MAX_LENGTH,
  EXPECTED_P02_B04_SEALED_ATOM_COUNT,
  type VisionerResearchTriggerBaseline,
  type VisionerResearchTriggerCategory,
  type VisionerResearchTriggerProbeResult,
} from "./forge-p02-visioner-research-trigger.js";

export type {
  VisionerResearchTriggerBaseline,
  VisionerResearchTriggerProbeResult,
} from "./forge-p02-visioner-research-trigger.js";
export {
  validateVisionerResearchTriggerBaseline,
  validateVisionerResearchTriggerAgainstContract,
  summarizeVisionerResearchTriggerMatrix,
  listVisionerResearchTriggerProbesByExpected,
  listVisionerResearchTriggerKnownGaps,
  getActiveVisionerResearchTriggerContract,
  assessVisionerResearchTriggerInputBoundary,
  assessVisionerResearchTriggerPresence,
  FORGE_VISIONER_RESEARCH_TRIGGER_VERSION,
  VISIONER_RESEARCH_TRIGGER_CATEGORIES,
  VISIONER_RESEARCH_TRIGGER_VISION_MAX_LENGTH,
  EXPECTED_P02_B04_SEALED_ATOM_COUNT,
} from "./forge-p02-visioner-research-trigger.js";

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
  category: VisionerResearchTriggerCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): VisionerResearchTriggerProbeResult {
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

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function parserSource(): string {
  return readSrc("parser.ts");
}

function engineSource(): string {
  return readSrc("engine.ts");
}

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function productionResearchTriggerSource(): string {
  return readSrc("forge-p02-visioner-research-trigger.ts") + readSrc("forge-p02-visioner-research-trigger.probe.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionResearchTriggerSource());
}

const SAMPLE_VISION_WITH_RESEARCH = `REASONING: Need benchmark data for dental landing pages
OUTPUT: **GOAL**: Premium dental feel
CONFIDENCE: 0.85
NEEDS_RESEARCH: true
RESEARCH_QUERY: dental landing page best practices 2026`;

function probeTriggerVersioning(
  id: string,
  category: VisionerResearchTriggerCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerResearchTriggerBaseline,
): VisionerResearchTriggerProbeResult {
  switch (id) {
    case "vrtr.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "vrtr.atom_tagged": {
      const ok = fixture.atom === "P02-B05-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "vrtr.harness_version_exported": {
      const ok = FORGE_VISIONER_RESEARCH_TRIGGER_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_VISIONER_RESEARCH_TRIGGER_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown trigger_versioning probe");
  }
}

function probeTriggerSignal(
  id: string,
  category: VisionerResearchTriggerCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerResearchTriggerProbeResult {
  const prompts = promptsSource();
  const parser = parserSource();
  const engine = engineSource();

  switch (id) {
    case "vrtr.prompt_needs_research": {
      const ok = prompts.includes("NEEDS_RESEARCH:");
      return probe(id, category, expected, ok, `needsResearchField=${ok}`);
    }
    case "vrtr.parser_needs_research_extract": {
      const ok =
        parser.includes('extractBoolean(text, "NEEDS_RESEARCH")') &&
        parser.includes("needsResearch:");
      return probe(id, category, expected, ok, `parserNeedsResearch=${ok}`);
    }
    case "vrtr.engine_needs_research_parse": {
      const ok = engine.includes(/NEEDS_RESEARCH:\s*(true|false)/i.source);
      return probe(id, category, expected, ok, `engineNeedsResearch=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown trigger_signal probe");
  }
}

function probeQuerySignal(
  id: string,
  category: VisionerResearchTriggerCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerResearchTriggerProbeResult {
  const prompts = promptsSource();
  const parser = parserSource();

  switch (id) {
    case "vrtr.prompt_research_query": {
      const ok = prompts.includes("RESEARCH_QUERY:");
      return probe(id, category, expected, ok, `researchQueryField=${ok}`);
    }
    case "vrtr.parser_research_query_extract": {
      const parsed = parseVisionResponse(SAMPLE_VISION_WITH_RESEARCH);
      const ok =
        parsed.ok === true &&
        parsed.data.needsResearch === true &&
        typeof parsed.data.researchQuery === "string" &&
        parsed.data.researchQuery.includes("dental landing page");
      return probe(
        id,
        category,
        expected,
        ok,
        parsed.ok ? `query=${parsed.data.researchQuery?.slice(0, 40)}` : "parse failed",
      );
    }
    case "vrtr.presence_research_query_detect": {
      const presence = assessVisionerResearchTriggerPresence(SAMPLE_VISION_WITH_RESEARCH);
      const ok =
        hasProductionExport("assessVisionerResearchTriggerPresence") &&
        presence.hasNeedsResearch === true &&
        presence.needsResearch === true &&
        presence.hasResearchQuery === true &&
        presence.researchQuery.length > 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `needsResearch=${presence.needsResearch}, queryLen=${presence.researchQuery.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown query_signal probe");
  }
}

function probeBaselineLink(
  id: string,
  category: VisionerResearchTriggerCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerResearchTriggerProbeResult {
  switch (id) {
    case "vrtr.b04_block_handoff_entry": {
      const handoff = getForgeP02B04ToB05Handoff();
      const ok =
        handoff.targetBlock.blockId === "P02-B05" &&
        handoff.targetBlock.entryAtom === "P02-B05-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "vrtr.b04_sealed_grounding_probes": {
      const handoff = getForgeP02B04ToB05Handoff();
      const coverage = summarizeVisionerGroundingContractCoverage(getActiveVisionerGroundingContract());
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
  category: VisionerResearchTriggerCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerResearchTriggerBaseline,
): VisionerResearchTriggerProbeResult {
  switch (id) {
    case "vrtr.source_block_gate_ref": {
      const handoff = getForgeP02B04ToB05Handoff();
      const coverage = summarizeVisionerGroundingContractCoverage(getActiveVisionerGroundingContract());
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.visionerGroundingProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P02_B04_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.visionerGroundingProbeCount}`,
      );
    }
    case "vrtr.probe_runner_exported": {
      const ok = readSrc("forge-p02-visioner-research-trigger.probe.ts").includes(
        "export function runVisionerResearchTriggerProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "vrtr.known_gaps_documented": {
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      return probe(id, category, expected, failCount >= 1, `documentedFail=${failCount}`);
    }
    case "vrtr.empty_vision_trigger_presence": {
      const result = assessVisionerResearchTriggerInputBoundary("");
      const presence = assessVisionerResearchTriggerPresence("");
      const ok =
        hasProductionExport("assessVisionerResearchTriggerInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false &&
        presence.hasNeedsResearch === false &&
        presence.hasResearchQuery === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, hasNeedsResearch=${presence.hasNeedsResearch}`,
      );
    }
    case "vrtr.whitespace_vision_boundary": {
      const result = assessVisionerResearchTriggerInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessVisionerResearchTriggerInputBoundary") &&
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
    case "vrtr.long_vision_truncation_boundary": {
      const longVision = "x".repeat(VISIONER_RESEARCH_TRIGGER_VISION_MAX_LENGTH + 500);
      const result = assessVisionerResearchTriggerInputBoundary(longVision);
      const ok =
        hasProductionExport("assessVisionerResearchTriggerInputBoundary") &&
        result.truncated === true &&
        result.normalizedVision.length === VISIONER_RESEARCH_TRIGGER_VISION_MAX_LENGTH &&
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
  category: VisionerResearchTriggerCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerResearchTriggerBaseline,
): VisionerResearchTriggerProbeResult {
  switch (id) {
    case "vrtr.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateVisionerResearchTriggerBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "vrtr.malformed_vision_trigger_guard": {
      const boundary = assessVisionerResearchTriggerInputBoundary("bad\0vision");
      const result = assessVisionerResearchTriggerPresence("bad\0vision");
      const ok =
        hasProductionExport("assessVisionerResearchTriggerInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false &&
        result.hasNeedsResearch === false &&
        result.hasResearchQuery === false;
      return probe(id, category, expected, ok, `detail=${result.detail}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: VisionerResearchTriggerCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerResearchTriggerProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vrtr.vision_checkpoint_research_trigger": {
      const ok =
        orchestrator.includes("priorCheckpoint?.visionOutput") &&
        orchestrator.includes("Restored from pipeline checkpoint");
      return probe(id, category, expected, ok, `checkpointResearchTrigger=${ok}`);
    }
    case "vrtr.structured_research_trigger_recovery": {
      const ok = hasProductionExport("recoverVisionerResearchTrigger");
      return probe(id, category, expected, ok, `recoverVisionerResearchTrigger=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: VisionerResearchTriggerCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerResearchTriggerProbeResult {
  const prompts = promptsSource();
  const orchestrator = orchestratorSource();
  const engine = engineSource();

  switch (id) {
    case "vrtr.researcher_skip_memory": {
      const ok = prompts.includes("Do NOT research things already in memory");
      return probe(id, category, expected, ok, `researcherSkipMemory=${ok}`);
    }
    case "vrtr.visioner_research_budget_threshold": {
      const ok =
        orchestrator.includes("research: 0.15") &&
        engine.includes("visioner: { warn: 0.6, block: 0.4 }");
      return probe(id, category, expected, ok, `budgetAndThreshold=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: VisionerResearchTriggerCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerResearchTriggerBaseline,
): VisionerResearchTriggerProbeResult {
  switch (category) {
    case "trigger_versioning":
      return probeTriggerVersioning(id, category, expected, fixture);
    case "trigger_signal":
      return probeTriggerSignal(id, category, expected);
    case "query_signal":
      return probeQuerySignal(id, category, expected);
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

export function loadVisionerResearchTriggerBaseline(): VisionerResearchTriggerBaseline {
  return visionerResearchTriggerBaseline as VisionerResearchTriggerBaseline;
}

export function runVisionerResearchTriggerProbes(
  fixture: VisionerResearchTriggerBaseline = loadVisionerResearchTriggerBaseline(),
): VisionerResearchTriggerProbeResult[] {
  const contract = getActiveVisionerResearchTriggerContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}
