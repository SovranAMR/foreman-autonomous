/**
 * FOREMAN — Visioner Uncertainty Probe Harness (P02-B06-A01)
 *
 * Static probes for CONFIDENCE / clarification policy baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import visionerUncertaintyBaseline from "./fixtures/forge-visioner-uncertainty-v1.json" with { type: "json" };
import { parseVisionResponse } from "./parser.js";
import { checkVisionerIntentAmbiguity } from "./forge-p02-visioner-intent.js";
import {
  getForgeP02B05ToB06Handoff,
  getActiveVisionerResearchTriggerContract,
  summarizeVisionerResearchTriggerContractCoverage,
} from "./forge-p02-visioner-research-trigger.js";
import {
  assessVisionerUncertaintyInputBoundary,
  assessVisionerUncertaintyPresence,
  validateVisionerUncertaintyBaseline,
  validateVisionerUncertaintyAgainstContract,
  summarizeVisionerUncertaintyMatrix,
  listVisionerUncertaintyProbesByExpected,
  listVisionerUncertaintyKnownGaps,
  getActiveVisionerUncertaintyContract,
  validateVisionerUncertaintyProbeMatrix,
  summarizeVisionerUncertaintyContractCoverage,
  VISIONER_UNCERTAINTY_CATEGORIES,
  VISIONER_UNCERTAINTY_VISION_MAX_LENGTH,
  FORGE_VISIONER_UNCERTAINTY_VERSION,
  EXPECTED_P02_B05_SEALED_ATOM_COUNT,
  type VisionerUncertaintyBaseline,
  type VisionerUncertaintyCategory,
  type VisionerUncertaintyProbeResult,
} from "./forge-p02-visioner-uncertainty.js";
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";

export type {
  VisionerUncertaintyBaseline,
  VisionerUncertaintyProbeResult,
} from "./forge-p02-visioner-uncertainty.js";
export {
  validateVisionerUncertaintyBaseline,
  validateVisionerUncertaintyAgainstContract,
  summarizeVisionerUncertaintyMatrix,
  listVisionerUncertaintyProbesByExpected,
  listVisionerUncertaintyKnownGaps,
  getActiveVisionerUncertaintyContract,
  validateVisionerUncertaintyProbeMatrix,
  summarizeVisionerUncertaintyContractCoverage,
  assessVisionerUncertaintyInputBoundary,
  assessVisionerUncertaintyPresence,
  VISIONER_UNCERTAINTY_CATEGORIES,
  VISIONER_UNCERTAINTY_VISION_MAX_LENGTH,
  FORGE_VISIONER_UNCERTAINTY_VERSION,
  EXPECTED_P02_B05_SEALED_ATOM_COUNT,
} from "./forge-p02-visioner-uncertainty.js";

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
  category: VisionerUncertaintyCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): VisionerUncertaintyProbeResult {
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

function productionUncertaintySource(): string {
  return readSrc("forge-p02-visioner-uncertainty.ts") + readSrc("forge-p02-visioner-uncertainty.probe.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionUncertaintySource());
}

const SAMPLE_VISION_WITH_CONFIDENCE = `REASONING: Clear dental landing page direction
OUTPUT: **GOAL**: Premium dental feel
CONFIDENCE: 0.85
NEEDS_RESEARCH: false`;

const SAMPLE_LOW_CONFIDENCE_VISION = `REASONING: Unclear scope — user may want admin or public site
OUTPUT: **GOAL**: Website refresh
CONFIDENCE: 0.55
NEEDS_RESEARCH: false`;

function probeUncertaintyVersioning(
  id: string,
  category: VisionerUncertaintyCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerUncertaintyBaseline,
): VisionerUncertaintyProbeResult {
  switch (id) {
    case "vunc.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "vunc.atom_tagged": {
      const ok = fixture.atom === "P02-B06-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "vunc.harness_version_exported": {
      const ok = FORGE_VISIONER_UNCERTAINTY_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_VISIONER_UNCERTAINTY_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown uncertainty_versioning probe");
  }
}

function probeUncertaintySignal(
  id: string,
  category: VisionerUncertaintyCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerUncertaintyProbeResult {
  const prompts = promptsSource();
  const parser = parserSource();
  const engine = engineSource();

  switch (id) {
    case "vunc.prompt_confidence_field": {
      const ok = prompts.includes("CONFIDENCE: [0.0-1.0]");
      return probe(id, category, expected, ok, `confidenceField=${ok}`);
    }
    case "vunc.parser_confidence_extract": {
      const parsed = parseVisionResponse(SAMPLE_VISION_WITH_CONFIDENCE);
      const ok =
        parser.includes('extractNumber(text, "CONFIDENCE")') &&
        parsed.ok === true &&
        parsed.data.confidence === 0.85;
      return probe(id, category, expected, ok, `confidence=${parsed.data?.confidence}`);
    }
    case "vunc.engine_visioner_confidence_threshold": {
      const ok = engine.includes("visioner: { warn: 0.6, block: 0.4 }");
      return probe(id, category, expected, ok, `visionerThreshold=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown uncertainty_signal probe");
  }
}

function probeClarificationSignal(
  id: string,
  category: VisionerUncertaintyCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerUncertaintyProbeResult {
  const prompts = promptsSource();
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vunc.visioner_uncertainty_guidance": {
      const ok = prompts.includes("Confidence below 0.7 means you're uncertain");
      return probe(id, category, expected, ok, `uncertaintyGuidance=${ok}`);
    }
    case "vunc.assess_uncertainty_presence": {
      const high = assessVisionerUncertaintyPresence(SAMPLE_VISION_WITH_CONFIDENCE);
      const low = assessVisionerUncertaintyPresence(SAMPLE_LOW_CONFIDENCE_VISION);
      const ok =
        hasProductionExport("assessVisionerUncertaintyPresence") &&
        high.hasConfidence === true &&
        high.needsClarification === false &&
        low.needsClarification === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `highNeedsClarification=${high.needsClarification}, lowNeedsClarification=${low.needsClarification}`,
      );
    }
    case "vunc.orchestrator_low_confidence_block": {
      const ok =
        orchestrator.includes("evaluateConfidence(result.thought.layer, result.thought.confidence)") &&
        orchestrator.includes('reason: `Confidence too low for ${result.thought.layer}');
      return probe(id, category, expected, ok, `lowConfidenceBlock=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown clarification_signal probe");
  }
}

function probeBaselineLink(
  id: string,
  category: VisionerUncertaintyCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerUncertaintyProbeResult {
  switch (id) {
    case "vunc.b05_block_handoff_entry": {
      const handoff = getForgeP02B05ToB06Handoff();
      const ok =
        handoff.targetBlock.blockId === "P02-B06" &&
        handoff.targetBlock.entryAtom === "P02-B06-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "vunc.b05_sealed_research_trigger_probes": {
      const handoff = getForgeP02B05ToB06Handoff();
      const coverage = summarizeVisionerResearchTriggerContractCoverage(
        getActiveVisionerResearchTriggerContract(),
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
  category: VisionerUncertaintyCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerUncertaintyBaseline,
): VisionerUncertaintyProbeResult {
  switch (id) {
    case "vunc.source_block_gate_ref": {
      const handoff = getForgeP02B05ToB06Handoff();
      const coverage = summarizeVisionerResearchTriggerContractCoverage(
        getActiveVisionerResearchTriggerContract(),
      );
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.visionerResearchTriggerProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P02_B05_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.visionerResearchTriggerProbeCount}`,
      );
    }
    case "vunc.probe_runner_exported": {
      const ok = readSrc("forge-p02-visioner-uncertainty.probe.ts").includes(
        "export function runVisionerUncertaintyProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "vunc.known_gaps_documented": {
      const contract = getActiveVisionerUncertaintyContract();
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
    case "vunc.empty_vision_uncertainty_presence": {
      const result = assessVisionerUncertaintyInputBoundary("");
      const presence = assessVisionerUncertaintyPresence("");
      const ok =
        hasProductionExport("assessVisionerUncertaintyInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false &&
        presence.hasConfidence === false &&
        presence.needsClarification === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, needsClarification=${presence.needsClarification}`,
      );
    }
    case "vunc.whitespace_vision_boundary": {
      const result = assessVisionerUncertaintyInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessVisionerUncertaintyInputBoundary") &&
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
    case "vunc.long_vision_truncation_boundary": {
      const longVision = "x".repeat(VISIONER_UNCERTAINTY_VISION_MAX_LENGTH + 500);
      const result = assessVisionerUncertaintyInputBoundary(longVision);
      const ok =
        hasProductionExport("assessVisionerUncertaintyInputBoundary") &&
        result.truncated === true &&
        result.normalizedVision.length === VISIONER_UNCERTAINTY_VISION_MAX_LENGTH &&
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
  category: VisionerUncertaintyCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerUncertaintyBaseline,
): VisionerUncertaintyProbeResult {
  switch (id) {
    case "vunc.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateVisionerUncertaintyBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "vunc.malformed_vision_uncertainty_guard": {
      const boundary = assessVisionerUncertaintyInputBoundary("bad\0vision");
      const result = assessVisionerUncertaintyPresence("bad\0vision");
      const ok =
        hasProductionExport("assessVisionerUncertaintyInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false &&
        result.hasConfidence === false &&
        result.needsClarification === true;
      return probe(id, category, expected, ok, `detail=${result.detail}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: VisionerUncertaintyCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerUncertaintyProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vunc.vision_checkpoint_uncertainty_wiring": {
      const ok =
        orchestrator.includes("priorCheckpoint?.visionOutput") &&
        orchestrator.includes("Restored from pipeline checkpoint");
      return probe(id, category, expected, ok, `checkpointUncertainty=${ok}`);
    }
    case "vunc.structured_clarification_recovery": {
      const ok = hasProductionExport("recoverVisionerUncertaintyClarification");
      return probe(id, category, expected, ok, `recoverVisionerUncertaintyClarification=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: VisionerUncertaintyCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerUncertaintyProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vunc.visioner_confidence_block_gate": {
      const ok =
        orchestrator.includes("checkBlock(visionResult, \"vision\")") &&
        orchestrator.includes('if (confLevel === "block")');
      return probe(id, category, expected, ok, `visionerConfidenceBlock=${ok}`);
    }
    case "vunc.intent_ambiguity_nogo": {
      const ambiguous = checkVisionerIntentAmbiguity("maybe or whatever");
      const wired =
        hasProductionExport("checkVisionerIntentAmbiguity") ||
        orchestrator.includes("checkVisionerIntentAmbiguity");
      const ok = wired && ambiguous.shouldBlock === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `shouldBlock=${ambiguous.shouldBlock}, score=${ambiguous.ambiguityScore.toFixed(2)}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: VisionerUncertaintyCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerUncertaintyBaseline,
): VisionerUncertaintyProbeResult {
  switch (category) {
    case "uncertainty_versioning":
      return probeUncertaintyVersioning(id, category, expected, fixture);
    case "uncertainty_signal":
      return probeUncertaintySignal(id, category, expected);
    case "clarification_signal":
      return probeClarificationSignal(id, category, expected);
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

export function loadVisionerUncertaintyBaseline(): VisionerUncertaintyBaseline {
  return visionerUncertaintyBaseline as VisionerUncertaintyBaseline;
}

export function runVisionerUncertaintyProbes(
  fixture: VisionerUncertaintyBaseline = loadVisionerUncertaintyBaseline(),
): VisionerUncertaintyProbeResult[] {
  const contract = getActiveVisionerUncertaintyContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}
