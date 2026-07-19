/**
 * FOREMAN — Visioner Uncertainty Probe Harness (P02-B06-A01)
 *
 * Static probes for CONFIDENCE / clarification policy baseline measurement.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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
  recoverVisionerUncertaintyClarification,
  validateVisionerUncertaintyBaseline,
  validateVisionerUncertaintyAgainstContract,
  summarizeVisionerUncertaintyMatrix,
  listVisionerUncertaintyProbesByExpected,
  listVisionerUncertaintyKnownGaps,
  getActiveVisionerUncertaintyContract,
  validateVisionerUncertaintyProbeMatrix,
  validateVisionerUncertaintyBoundaryProbeMatrix,
  validateVisionerUncertaintyFailureRecoveryProbeMatrix,
  listVisionerUncertaintyFailureRecoveryProbeIds,
  VISIONER_UNCERTAINTY_FAILURE_RECOVERY_CATEGORIES,
  listVisionerUncertaintyContractProbesByCategory,
  summarizeVisionerUncertaintyContractCoverage,
  VISIONER_UNCERTAINTY_CATEGORIES,
  VISIONER_UNCERTAINTY_VISION_MAX_LENGTH,
  FORGE_VISIONER_UNCERTAINTY_VERSION,
  EXPECTED_P02_B05_SEALED_ATOM_COUNT,
  buildVisionerUncertaintyProbeEvidence,
  buildVisionerUncertaintyProbeTelemetry,
  buildVisionerUncertaintyProvenance,
  buildVisionerUncertaintyRunRecord,
  validateVisionerUncertaintyRunRecord,
  validateVisionerUncertaintyFailureRecoveryRunRecord,
  detectVisionerUncertaintyProbeRegression,
  runVisionerUncertaintyPropertyChecks,
  runVisionerUncertaintyFuzzValidation,
  runVisionerUncertaintyRunRecordFuzzValidation,
  type VisionerUncertaintyBaseline,
  type VisionerUncertaintyProbeRegressionReport,
  type VisionerUncertaintyPropertyResult,
  type VisionerUncertaintyFuzzValidationResult,
  type VisionerUncertaintyCategory,
  type VisionerUncertaintyProbeDisposition,
  type VisionerUncertaintyProbeResult,
  type VisionerUncertaintyRunRecord,
} from "./forge-p02-visioner-uncertainty.js";
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";

export type {
  VisionerUncertaintyBaseline,
  VisionerUncertaintyProbeResult,
  VisionerUncertaintyRunRecord,
} from "./forge-p02-visioner-uncertainty.js";
export {
  validateVisionerUncertaintyBaseline,
  validateVisionerUncertaintyAgainstContract,
  summarizeVisionerUncertaintyMatrix,
  listVisionerUncertaintyProbesByExpected,
  listVisionerUncertaintyKnownGaps,
  getActiveVisionerUncertaintyContract,
  getVisionerUncertaintyCategoryContract,
  listVisionerUncertaintyContractProbeIds,
  listVisionerUncertaintyContractProbesByCategory,
  listVisionerUncertaintyProbesByDisposition,
  validateVisionerUncertaintyProbeMatrix,
  validateVisionerUncertaintyFailureRecoveryProbeMatrix,
  listVisionerUncertaintyFailureRecoveryProbeIds,
  VISIONER_UNCERTAINTY_FAILURE_RECOVERY_CATEGORIES,
  validateVisionerUncertaintyContractCoverage,
  summarizeVisionerUncertaintyContractCoverage,
  assessVisionerUncertaintyInputBoundary,
  assessVisionerUncertaintyPresence,
  recoverVisionerUncertaintyClarification,
  VISIONER_UNCERTAINTY_CATEGORIES,
  VISIONER_UNCERTAINTY_VISION_MAX_LENGTH,
  FORGE_VISIONER_UNCERTAINTY_VERSION,
  EXPECTED_P02_B05_SEALED_ATOM_COUNT,
  buildVisionerUncertaintyProbeEvidence,
  buildVisionerUncertaintyProbeTelemetry,
  buildVisionerUncertaintyProvenance,
  buildVisionerUncertaintyRunRecord,
  validateVisionerUncertaintyRunRecord,
  validateVisionerUncertaintyFailureRecoveryRunRecord,
  detectVisionerUncertaintyProbeRegression,
  runVisionerUncertaintyPropertyChecks,
  runVisionerUncertaintyFuzzValidation,
  runVisionerUncertaintyRunRecordFuzzValidation,
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
      const ok = failCount === expectedFail;
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
      const malformed = `REASONING: Task scope is unclear for dental product landing page
OUTPUT: **GOAL**: Build premium landing page
confidence: 0.45
need clarification: what conversion metrics and brand tone?
uncertain about target audience demographics`;
      const recovery = recoverVisionerUncertaintyClarification(malformed);
      const ok =
        hasProductionExport("recoverVisionerUncertaintyClarification") &&
        recovery.recovered === true &&
        recovery.presence.hasConfidence &&
        recovery.presence.needsClarification &&
        recovery.presence.confidence < 0.7 &&
        recovery.clarificationRequest.includes("conversion metrics");
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

export interface VisionerUncertaintyProductionSliceResult {
  atom: "P02-B06-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: VisionerUncertaintyProbeResult[];
  summary: ReturnType<typeof summarizeVisionerUncertaintyMatrix>;
  matrixValidation: ReturnType<typeof validateVisionerUncertaintyProbeMatrix>;
}

/**
 * A03 production vertical slice: recoverVisionerUncertaintyClarification wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runVisionerUncertaintyProductionSlice(
  fixture: VisionerUncertaintyBaseline = loadVisionerUncertaintyBaseline(),
): VisionerUncertaintyProductionSliceResult {
  const contract = getActiveVisionerUncertaintyContract();
  const fixtureValidation = validateVisionerUncertaintyBaseline(fixture);
  const contractValidation = validateVisionerUncertaintyAgainstContract(fixture, contract);
  const results = runVisionerUncertaintyProbes(fixture);
  const summary = summarizeVisionerUncertaintyMatrix(results);
  const matrixValidation = validateVisionerUncertaintyProbeMatrix(results, contract);

  return {
    atom: "P02-B06-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface VisionerUncertaintyBoundarySliceResult {
  atom: "P02-B06-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: VisionerUncertaintyProbeResult[];
  boundaryResults: VisionerUncertaintyProbeResult[];
  matrixValidation: ReturnType<typeof validateVisionerUncertaintyBoundaryProbeMatrix>;
}

/**
 * A04 boundary slice: contract-wired boundary probes (vision input edge cases, probe runner,
 * documented gaps) with zero unexpected mismatches.
 */
export function runVisionerUncertaintyBoundarySlice(
  fixture: VisionerUncertaintyBaseline = loadVisionerUncertaintyBaseline(),
): VisionerUncertaintyBoundarySliceResult {
  const contract = getActiveVisionerUncertaintyContract();
  const results = runVisionerUncertaintyProbes(fixture);
  const boundaryProbes = listVisionerUncertaintyContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateVisionerUncertaintyBoundaryProbeMatrix(results, contract);

  return {
    atom: "P02-B06-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

export interface VisionerUncertaintyFailureRecoverySliceResult {
  atom: "P02-B06-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: VisionerUncertaintyProbeResult[];
  failureRecoveryResults: VisionerUncertaintyProbeResult[];
  matrixValidation: ReturnType<typeof validateVisionerUncertaintyFailureRecoveryProbeMatrix>;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches; documented FAIL gaps preserved.
 */
export function runVisionerUncertaintyFailureRecoverySlice(
  fixture: VisionerUncertaintyBaseline = loadVisionerUncertaintyBaseline(),
): VisionerUncertaintyFailureRecoverySliceResult {
  const contract = getActiveVisionerUncertaintyContract();
  const results = runVisionerUncertaintyProbes(fixture);
  const failureRecoveryProbes = VISIONER_UNCERTAINTY_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listVisionerUncertaintyContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateVisionerUncertaintyFailureRecoveryProbeMatrix(results, contract);

  return {
    atom: "P02-B06-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

function resolveGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}

function runVisionerUncertaintyProbeWithTiming(
  entry: VisionerUncertaintyBaseline["probes"][number],
  fixture: VisionerUncertaintyBaseline,
  contractProbe:
    | { criterion: string; disposition: VisionerUncertaintyProbeDisposition }
    | undefined,
): {
  result: VisionerUncertaintyProbeResult;
  durationMs: number;
  disposition: VisionerUncertaintyProbeDisposition;
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

function buildVisionerUncertaintyRecordFromEntries(
  entries: VisionerUncertaintyBaseline["probes"],
  fixture: VisionerUncertaintyBaseline,
  contract: ReturnType<typeof getActiveVisionerUncertaintyContract>,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly VisionerUncertaintyCategory[];
  },
): VisionerUncertaintyRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ReturnType<typeof buildVisionerUncertaintyProbeEvidence>[] = [];
  const telemetry: ReturnType<typeof buildVisionerUncertaintyProbeTelemetry>[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runVisionerUncertaintyProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildVisionerUncertaintyProbeEvidence(
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
      buildVisionerUncertaintyProbeTelemetry(result.id, result.category, sequenceIndex, durationMs),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildVisionerUncertaintyProvenance(
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

  return buildVisionerUncertaintyRunRecord(provenance, evidence, telemetry);
}

/** Run all visioner uncertainty probes and emit auditable evidence, telemetry and provenance (P02-B06-A06). */
export function runVisionerUncertaintyProbesWithRecord(
  fixture: VisionerUncertaintyBaseline = loadVisionerUncertaintyBaseline(),
): VisionerUncertaintyRunRecord {
  const contract = getActiveVisionerUncertaintyContract();
  return buildVisionerUncertaintyRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P02-B06-A06). */
export function runVisionerUncertaintyFailureRecoverySliceWithRecord(
  fixture: VisionerUncertaintyBaseline = loadVisionerUncertaintyBaseline(),
): VisionerUncertaintyRunRecord {
  const contract = getActiveVisionerUncertaintyContract();
  const failureRecoveryIds = new Set(listVisionerUncertaintyFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildVisionerUncertaintyRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P02-B06-A06",
    sliceCategories: VISIONER_UNCERTAINTY_FAILURE_RECOVERY_CATEGORIES,
  });
}

export interface ForgeVisionerUncertaintyRegressionPropertyFuzzResult {
  passed: boolean;
  properties: VisionerUncertaintyPropertyResult;
  contractFuzz: VisionerUncertaintyFuzzValidationResult;
  runFuzz: {
    validBaseline: boolean;
    mutationsRejected: number;
    mutationsAccepted: number;
  };
}

export interface ForgeVisionerUncertaintyRegressionResult {
  passed: boolean;
  productionSlice: VisionerUncertaintyProductionSliceResult;
  record: VisionerUncertaintyRunRecord;
  recordValid: boolean;
  validationIssues: string[];
  probeRegression: VisionerUncertaintyProbeRegressionReport | null;
  propertyFuzz: ForgeVisionerUncertaintyRegressionPropertyFuzzResult;
  detail: string;
}

/**
 * Execute visioner uncertainty probes, validate production slice + run record, property/fuzz gates,
 * and optionally detect regression vs prior run. Forge pipeline integration gate (P02-B06-A08).
 */
export function runForgeVisionerUncertaintyRegressionGate(
  priorRecord?: VisionerUncertaintyRunRecord,
): ForgeVisionerUncertaintyRegressionResult {
  const fixture = loadVisionerUncertaintyBaseline();
  const contract = getActiveVisionerUncertaintyContract();
  const productionSlice = runVisionerUncertaintyProductionSlice(fixture);
  const record = runVisionerUncertaintyProbesWithRecord(fixture);
  const validation = validateVisionerUncertaintyRunRecord(record, contract);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  const probeRegression = priorRecord
    ? detectVisionerUncertaintyProbeRegression(priorRecord, record)
    : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;

  const properties = runVisionerUncertaintyPropertyChecks(contract);
  const contractFuzz = runVisionerUncertaintyFuzzValidation(fixture, contract);
  const runFuzz = runVisionerUncertaintyRunRecordFuzzValidation(record, contract);
  const propertyFuzzPassed =
    properties.allPassed &&
    contractFuzz.allMutationsRejected &&
    runFuzz.mutationsAccepted === 0;
  const propertyFuzz: ForgeVisionerUncertaintyRegressionPropertyFuzzResult = {
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
  const passed = productionSliceOk && recordValid && !alignmentRegression && propertyFuzzPassed;

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

  return {
    passed,
    productionSlice,
    record,
    recordValid,
    validationIssues,
    probeRegression,
    propertyFuzz,
    detail: detailParts.join(" | "),
  };
}

/** Alias for forge-pipeline-regression integration seam (P02-B06-A08). */
export const runVisionerUncertaintyRegressionIntegration = runForgeVisionerUncertaintyRegressionGate;
