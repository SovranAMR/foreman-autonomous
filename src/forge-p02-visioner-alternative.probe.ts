/**
 * FOREMAN — Visioner Alternative Probe Harness (P02-B07-A01)
 *
 * Static probes for alternative vision generation baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import visionerAlternativeBaseline from "./fixtures/forge-visioner-alternative-v1.json" with { type: "json" };
import { parseVisionResponse } from "./parser.js";
import {
  assessVisionerUncertaintyPresence,
  getActiveVisionerUncertaintyContract,
  getForgeP02B06ToB07Handoff,
  summarizeVisionerUncertaintyContractCoverage,
} from "./forge-p02-visioner-uncertainty.js";
import {
  assessVisionerAlternativeInputBoundary,
  assessVisionerAlternativePresence,
  validateVisionerAlternativeBaseline,
  validateVisionerAlternativeAgainstContract,
  summarizeVisionerAlternativeMatrix,
  listVisionerAlternativeProbesByExpected,
  listVisionerAlternativeKnownGaps,
  getActiveVisionerAlternativeContract,
  summarizeVisionerAlternativeContractCoverage,
  FORGE_VISIONER_ALTERNATIVE_VERSION,
  VISIONER_ALTERNATIVE_CATEGORIES,
  VISIONER_ALTERNATIVE_VISION_MAX_LENGTH,
  EXPECTED_P02_B06_SEALED_ATOM_COUNT,
  SAMPLE_LOW_CONFIDENCE_VISION,
  type VisionerAlternativeBaseline,
  type VisionerAlternativeCategory,
  type VisionerAlternativeProbeResult,
} from "./forge-p02-visioner-alternative.js";
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";

export type { VisionerAlternativeBaseline, VisionerAlternativeProbeResult } from "./forge-p02-visioner-alternative.js";
export {
  validateVisionerAlternativeBaseline,
  summarizeVisionerAlternativeMatrix,
  listVisionerAlternativeProbesByExpected,
  listVisionerAlternativeKnownGaps,
  getActiveVisionerAlternativeContract,
  summarizeVisionerAlternativeContractCoverage,
  FORGE_VISIONER_ALTERNATIVE_VERSION,
  VISIONER_ALTERNATIVE_CATEGORIES,
  VISIONER_ALTERNATIVE_VISION_MAX_LENGTH,
  EXPECTED_P02_B06_SEALED_ATOM_COUNT,
  assessVisionerAlternativeInputBoundary,
  assessVisionerAlternativePresence,
} from "./forge-p02-visioner-alternative.js";

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
  category: VisionerAlternativeCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): VisionerAlternativeProbeResult {
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

function productionAlternativeSource(): string {
  return readSrc("forge-p02-visioner-alternative.ts") + readSrc("forge-p02-visioner-alternative.probe.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionAlternativeSource());
}

function probeAlternativeVersioning(
  id: string,
  category: VisionerAlternativeCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerAlternativeBaseline,
): VisionerAlternativeProbeResult {
  switch (id) {
    case "valt.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "valt.atom_tagged": {
      const ok = fixture.atom === "P02-B07-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "valt.harness_version_exported": {
      const ok = FORGE_VISIONER_ALTERNATIVE_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_VISIONER_ALTERNATIVE_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown alternative_versioning probe");
  }
}

function probeAlternativeSignal(
  id: string,
  category: VisionerAlternativeCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerAlternativeProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "valt.uncertainty_confidence_wired": {
      const presence = assessVisionerUncertaintyPresence(SAMPLE_LOW_CONFIDENCE_VISION);
      const ok =
        hasProductionExport("assessVisionerAlternativePresence") &&
        presence.hasConfidence === true &&
        presence.confidence < 0.7;
      return probe(
        id,
        category,
        expected,
        ok,
        `confidence=${presence.confidence}, hasConfidence=${presence.hasConfidence}`,
      );
    }
    case "valt.orchestrator_low_confidence_block": {
      const ok =
        orchestrator.includes("checkBlock") &&
        orchestrator.includes("Confidence too low");
      return probe(id, category, expected, ok, `lowConfidenceBlock=${ok}`);
    }
    case "valt.b06_handoff_prerequisite": {
      const handoff = getForgeP02B06ToB07Handoff();
      const ok =
        handoff.entryCriteria.requiresBlockGatePass === true &&
        handoff.entryCriteria.visionerUncertaintyRecordRequired === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `requiresBlockGatePass=${handoff.entryCriteria.requiresBlockGatePass}, uncertaintyRecord=${handoff.entryCriteria.visionerUncertaintyRecordRequired}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown alternative_signal probe");
  }
}

function probeDivergenceSignal(
  id: string,
  category: VisionerAlternativeCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerAlternativeProbeResult {
  const orchestrator = orchestratorSource();
  const parserSource = readSrc("parser.ts");

  switch (id) {
    case "valt.single_vision_output_store": {
      const ok =
        orchestrator.includes("let visionOutput: string") &&
        orchestrator.includes("updatePhase(\"decompose\", { visionOutput })");
      return probe(id, category, expected, ok, `singleVisionStore=${ok}`);
    }
    case "valt.assess_alternative_presence": {
      const ok = hasProductionExport("assessVisionerAlternativePresence");
      const presence = assessVisionerAlternativePresence(SAMPLE_LOW_CONFIDENCE_VISION);
      return probe(
        id,
        category,
        expected,
        ok && typeof presence.alternativeCount === "number",
        `exported=${ok}, alternatives=${presence.alternativeCount}`,
      );
    }
    case "valt.parse_primary_vision_only": {
      const parsed = parseVisionResponse(SAMPLE_LOW_CONFIDENCE_VISION);
      const ok =
        parserSource.includes("export interface VisionParseResult") &&
        parsed.ok === true &&
        !("alternatives" in parsed.data);
      return probe(id, category, expected, ok, `parsed=${parsed.ok}, alternativesField=false`);
    }
    default:
      return probe(id, category, expected, false, "unknown divergence_signal probe");
  }
}

function probeBaselineLink(
  id: string,
  category: VisionerAlternativeCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerAlternativeProbeResult {
  switch (id) {
    case "valt.b06_block_handoff_entry": {
      const handoff = getForgeP02B06ToB07Handoff();
      const ok =
        handoff.targetBlock.blockId === "P02-B07" &&
        handoff.targetBlock.entryAtom === "P02-B07-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "valt.b06_sealed_uncertainty_probes": {
      const handoff = getForgeP02B06ToB07Handoff();
      const coverage = summarizeVisionerUncertaintyContractCoverage(
        getActiveVisionerUncertaintyContract(),
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
  category: VisionerAlternativeCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerAlternativeBaseline,
): VisionerAlternativeProbeResult {
  switch (id) {
    case "valt.source_block_gate_ref": {
      const handoff = getForgeP02B06ToB07Handoff();
      const coverage = summarizeVisionerUncertaintyContractCoverage(
        getActiveVisionerUncertaintyContract(),
      );
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.visionerUncertaintyProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P02_B06_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.visionerUncertaintyProbeCount}`,
      );
    }
    case "valt.probe_runner_exported": {
      const ok = readSrc("forge-p02-visioner-alternative.probe.ts").includes(
        "export function runVisionerAlternativeProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "valt.known_gaps_documented": {
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      return probe(id, category, expected, failCount >= 1, `documentedFail=${failCount}`);
    }
    case "valt.empty_vision_alternative_presence": {
      const result = assessVisionerAlternativeInputBoundary("");
      const presence = assessVisionerAlternativePresence("");
      const ok =
        hasProductionExport("assessVisionerAlternativeInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false &&
        presence.hasAlternatives === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, hasAlternatives=${presence.hasAlternatives}`,
      );
    }
    case "valt.whitespace_vision_boundary": {
      const result = assessVisionerAlternativeInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessVisionerAlternativeInputBoundary") &&
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
    case "valt.long_vision_truncation_boundary": {
      const longVision = "x".repeat(VISIONER_ALTERNATIVE_VISION_MAX_LENGTH + 500);
      const result = assessVisionerAlternativeInputBoundary(longVision);
      const ok =
        hasProductionExport("assessVisionerAlternativeInputBoundary") &&
        result.truncated === true &&
        result.normalizedVision.length === VISIONER_ALTERNATIVE_VISION_MAX_LENGTH &&
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
  category: VisionerAlternativeCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerAlternativeBaseline,
): VisionerAlternativeProbeResult {
  switch (id) {
    case "valt.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateVisionerAlternativeBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "valt.malformed_vision_presence_guard": {
      const boundary = assessVisionerAlternativeInputBoundary("bad\0vision");
      const result = assessVisionerAlternativePresence("bad\0vision");
      const ok =
        hasProductionExport("assessVisionerAlternativeInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false &&
        result.hasAlternatives === false;
      return probe(id, category, expected, ok, `detail=${result.detail}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: VisionerAlternativeCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerAlternativeProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "valt.vision_checkpoint_primary": {
      const ok =
        orchestrator.includes("priorCheckpoint?.visionOutput") &&
        orchestrator.includes("Restored from pipeline checkpoint");
      return probe(id, category, expected, ok, `checkpointPrimary=${ok}`);
    }
    case "valt.structured_alternative_recovery": {
      const ok = hasProductionExport("recoverVisionerAlternatives");
      return probe(id, category, expected, ok, `recoverVisionerAlternatives=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: VisionerAlternativeCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerAlternativeProbeResult {
  const orchestrator = orchestratorSource();
  const engine = engineSource();

  switch (id) {
    case "valt.visioner_confidence_block_gate": {
      const ok =
        orchestrator.includes("checkBlock") &&
        orchestrator.includes("evaluateConfidence") &&
        engine.includes("visioner: { warn: 0.6, block: 0.4 }");
      return probe(id, category, expected, ok, `confidenceBlockGate=${ok}`);
    }
    case "valt.uncertainty_clarification_nogo": {
      const presence = assessVisionerUncertaintyPresence(SAMPLE_LOW_CONFIDENCE_VISION);
      const ok =
        hasProductionExport("assessVisionerAlternativePresence") &&
        presence.needsClarification === true &&
        presence.confidence < 0.7;
      return probe(
        id,
        category,
        expected,
        ok,
        `needsClarification=${presence.needsClarification}, confidence=${presence.confidence}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: VisionerAlternativeCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerAlternativeBaseline,
): VisionerAlternativeProbeResult {
  switch (category) {
    case "alternative_versioning":
      return probeAlternativeVersioning(id, category, expected, fixture);
    case "alternative_signal":
      return probeAlternativeSignal(id, category, expected);
    case "divergence_signal":
      return probeDivergenceSignal(id, category, expected);
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

export function loadVisionerAlternativeBaseline(): VisionerAlternativeBaseline {
  return visionerAlternativeBaseline as VisionerAlternativeBaseline;
}

export function runVisionerAlternativeProbes(
  fixture: VisionerAlternativeBaseline = loadVisionerAlternativeBaseline(),
): VisionerAlternativeProbeResult[] {
  const contract = getActiveVisionerAlternativeContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}

export {
  validateVisionerAlternativeAgainstContract,
};
