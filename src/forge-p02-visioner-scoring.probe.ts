/**
 * FOREMAN — Visioner Scoring Probe Harness (P02-B08-A01)
 *
 * Static probes for vision scoring and trade-off baseline measurement.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import visionerScoringBaseline from "./fixtures/forge-visioner-scoring-v1.json" with { type: "json" };
import { parseVisionResponse } from "./parser.js";
import { assessVisionerUncertaintyPresence } from "./forge-p02-visioner-uncertainty.js";
import {
  assessVisionerAlternativePresence,
  getActiveVisionerAlternativeContract,
  getForgeP02B07ToB08Handoff,
  summarizeVisionerAlternativeContractCoverage,
  SAMPLE_LOW_CONFIDENCE_VISION,
  SAMPLE_VISION_WITH_ALTERNATIVES,
} from "./forge-p02-visioner-alternative.js";
import {
  assessVisionerScoringInputBoundary,
  assessVisionerScoringPresence,
  checkVisionerScoringTieBreak,
  recoverVisionerTradeoff,
  validateVisionerScoringBaseline,
  validateVisionerScoringAgainstContract,
  validateVisionerScoringBoundaryProbeMatrix,
  validateVisionerScoringFailureRecoveryProbeMatrix,
  validateVisionerScoringProbeMatrix,
  VISIONER_SCORING_FAILURE_RECOVERY_CATEGORIES,
  listVisionerScoringContractProbesByCategory,
  listVisionerScoringFailureRecoveryProbeIds,
  summarizeVisionerScoringMatrix,
  listVisionerScoringProbesByExpected,
  listVisionerScoringKnownGaps,
  getActiveVisionerScoringContract,
  summarizeVisionerScoringContractCoverage,
  buildVisionerScoringProbeEvidence,
  buildVisionerScoringProbeTelemetry,
  buildVisionerScoringProvenance,
  buildVisionerScoringRunRecord,
  FORGE_VISIONER_SCORING_VERSION,
  VISIONER_SCORING_CATEGORIES,
  VISIONER_SCORING_VISION_MAX_LENGTH,
  EXPECTED_P02_B07_SEALED_ATOM_COUNT,
  SAMPLE_VISION_FOR_SCORING,
  type VisionerScoringBaseline,
  type VisionerScoringCategory,
  type VisionerScoringProbeDisposition,
  type VisionerScoringProbeResult,
  type VisionerScoringRunRecord,
} from "./forge-p02-visioner-scoring.js";
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";

export type {
  VisionerScoringBaseline,
  VisionerScoringProbeResult,
  VisionerScoringRunRecord,
} from "./forge-p02-visioner-scoring.js";
export {
  validateVisionerScoringBaseline,
  validateVisionerScoringRunRecord,
  validateVisionerScoringFailureRecoveryRunRecord,
  summarizeVisionerScoringMatrix,
  listVisionerScoringProbesByExpected,
  listVisionerScoringKnownGaps,
  getActiveVisionerScoringContract,
  summarizeVisionerScoringContractCoverage,
  buildVisionerScoringProbeEvidence,
  buildVisionerScoringProbeTelemetry,
  buildVisionerScoringProvenance,
  buildVisionerScoringRunRecord,
  FORGE_VISIONER_SCORING_VERSION,
  VISIONER_SCORING_CATEGORIES,
  VISIONER_SCORING_VISION_MAX_LENGTH,
  EXPECTED_P02_B07_SEALED_ATOM_COUNT,
  assessVisionerScoringInputBoundary,
  assessVisionerScoringPresence,
  checkVisionerScoringTieBreak,
} from "./forge-p02-visioner-scoring.js";

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
  category: VisionerScoringCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): VisionerScoringProbeResult {
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

function productionScoringSource(): string {
  return readSrc("forge-p02-visioner-scoring.ts") + readSrc("forge-p02-visioner-scoring.probe.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionScoringSource());
}

function probeScoringVersioning(
  id: string,
  category: VisionerScoringCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerScoringBaseline,
): VisionerScoringProbeResult {
  switch (id) {
    case "vsco.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "vsco.atom_tagged": {
      const ok = fixture.atom === "P02-B08-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "vsco.harness_version_exported": {
      const ok = FORGE_VISIONER_SCORING_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_VISIONER_SCORING_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown scoring_versioning probe");
  }
}

function probeScoringSignal(
  id: string,
  category: VisionerScoringCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerScoringProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vsco.alternative_presence_wired": {
      const presence = assessVisionerScoringPresence(SAMPLE_VISION_FOR_SCORING);
      const ok =
        hasProductionExport("assessVisionerScoringPresence") &&
        presence.hasAlternatives &&
        presence.scoreable;
      return probe(
        id,
        category,
        expected,
        ok,
        `alternatives=${presence.alternativeCount}, scoreable=${presence.scoreable}`,
      );
    }
    case "vsco.orchestrator_vision_before_decompose": {
      const ok =
        orchestrator.includes("let visionOutput: string") &&
        orchestrator.includes('updatePhase("decompose", { visionOutput })');
      return probe(id, category, expected, ok, `visionBeforeDecompose=${ok}`);
    }
    case "vsco.b07_handoff_prerequisite": {
      const handoff = getForgeP02B07ToB08Handoff();
      const ok =
        handoff.entryCriteria.requiresBlockGatePass === true &&
        handoff.entryCriteria.visionerAlternativeRecordRequired === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `requiresBlockGatePass=${handoff.entryCriteria.requiresBlockGatePass}, alternativeRecord=${handoff.entryCriteria.visionerAlternativeRecordRequired}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown scoring_signal probe");
  }
}

function probeTradeoffSignal(
  id: string,
  category: VisionerScoringCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerScoringProbeResult {
  const prompts = promptsSource();
  const parserSource = readSrc("parser.ts");

  switch (id) {
    case "vsco.prompt_tradeoff_language": {
      const ok =
        prompts.includes("VISIONER_SYSTEM") &&
        /trade-?offs?/i.test(prompts);
      return probe(id, category, expected, ok, `tradeoffLanguage=${ok}`);
    }
    case "vsco.assess_scoring_presence": {
      const ok = hasProductionExport("assessVisionerScoringPresence");
      const presence = assessVisionerScoringPresence(SAMPLE_VISION_WITH_ALTERNATIVES);
      return probe(
        id,
        category,
        expected,
        ok && typeof presence.scoreable === "boolean",
        `exported=${ok}, scoreable=${presence.scoreable}`,
      );
    }
    case "vsco.parse_vision_without_scores": {
      const parsed = parseVisionResponse(SAMPLE_VISION_FOR_SCORING);
      const ok =
        parserSource.includes("export interface VisionParseResult") &&
        parsed.ok === true &&
        !("scores" in parsed.data);
      return probe(id, category, expected, ok, `parsed=${parsed.ok}, scoresField=false`);
    }
    default:
      return probe(id, category, expected, false, "unknown tradeoff_signal probe");
  }
}

function probeBaselineLink(
  id: string,
  category: VisionerScoringCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerScoringProbeResult {
  switch (id) {
    case "vsco.b07_block_handoff_entry": {
      const handoff = getForgeP02B07ToB08Handoff();
      const ok =
        handoff.targetBlock.blockId === "P02-B08" &&
        handoff.targetBlock.entryAtom === "P02-B08-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "vsco.b07_sealed_alternative_probes": {
      const handoff = getForgeP02B07ToB08Handoff();
      const coverage = summarizeVisionerAlternativeContractCoverage(
        getActiveVisionerAlternativeContract(),
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
  category: VisionerScoringCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerScoringBaseline,
): VisionerScoringProbeResult {
  switch (id) {
    case "vsco.source_block_gate_ref": {
      const handoff = getForgeP02B07ToB08Handoff();
      const coverage = summarizeVisionerAlternativeContractCoverage(
        getActiveVisionerAlternativeContract(),
      );
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.visionerAlternativeProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P02_B07_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.visionerAlternativeProbeCount}`,
      );
    }
    case "vsco.probe_runner_exported": {
      const ok = readSrc("forge-p02-visioner-scoring.probe.ts").includes(
        "export function runVisionerScoringProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "vsco.known_gaps_documented": {
      const contract = getActiveVisionerScoringContract();
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
    case "vsco.empty_vision_scoring_boundary": {
      const result = assessVisionerScoringInputBoundary("");
      const presence = assessVisionerScoringPresence("");
      const ok =
        hasProductionExport("assessVisionerScoringInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false &&
        presence.scoreable === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, scoreable=${presence.scoreable}`,
      );
    }
    case "vsco.whitespace_vision_boundary": {
      const result = assessVisionerScoringInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessVisionerScoringInputBoundary") &&
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
    case "vsco.long_vision_truncation_boundary": {
      const longVision = "x".repeat(VISIONER_SCORING_VISION_MAX_LENGTH + 500);
      const result = assessVisionerScoringInputBoundary(longVision);
      const ok =
        hasProductionExport("assessVisionerScoringInputBoundary") &&
        result.truncated === true &&
        result.normalizedVision.length === VISIONER_SCORING_VISION_MAX_LENGTH &&
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
  category: VisionerScoringCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerScoringBaseline,
): VisionerScoringProbeResult {
  switch (id) {
    case "vsco.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateVisionerScoringBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "vsco.malformed_vision_scoring_guard": {
      const boundary = assessVisionerScoringInputBoundary("bad\0vision");
      const result = assessVisionerScoringPresence("bad\0vision");
      const ok =
        hasProductionExport("assessVisionerScoringInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false &&
        result.scoreable === false;
      return probe(id, category, expected, ok, `detail=${result.detail}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: VisionerScoringCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerScoringProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vsco.vision_checkpoint_scoring": {
      const ok =
        orchestrator.includes("priorCheckpoint?.visionOutput") &&
        orchestrator.includes("Restored from pipeline checkpoint");
      return probe(id, category, expected, ok, `checkpointScoring=${ok}`);
    }
    case "vsco.structured_tradeoff_recovery": {
      const malformed = `REASONING: Two product directions with trade-off analysis needed
OUTPUT: **GOAL**: Dental clinic platform
option A (speed): Rapid MVP launch
option B (cost): Lean self-serve portal
tradeoff: speed vs implementation cost
CONFIDENCE: 0.78`;
      const recovery = recoverVisionerTradeoff(malformed);
      const ok =
        hasProductionExport("recoverVisionerTradeoff") &&
        recovery.recovered === true &&
        recovery.presence.scoreable &&
        recovery.presence.alternativeCount >= 2 &&
        recovery.tradeoffs.some(t => t.includes("speed")) &&
        recovery.alternatives.some(alt => alt.includes("MVP launch")) &&
        recovery.alternatives.some(alt => alt.includes("self-serve portal"));
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
  category: VisionerScoringCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerScoringProbeResult {
  switch (id) {
    case "vsco.scoring_tiebreak_nogo": {
      const tieBreak = checkVisionerScoringTieBreak(SAMPLE_VISION_FOR_SCORING);
      const ok =
        hasProductionExport("checkVisionerScoringTieBreak") &&
        tieBreak.shouldBlock === true &&
        tieBreak.tiedAlternatives >= 2;
      return probe(
        id,
        category,
        expected,
        ok,
        `shouldBlock=${tieBreak.shouldBlock}, tied=${tieBreak.tiedAlternatives}`,
      );
    }
    case "vsco.alternative_clarification_nogo": {
      const uncertainty = assessVisionerUncertaintyPresence(SAMPLE_LOW_CONFIDENCE_VISION);
      const alternative = assessVisionerAlternativePresence(SAMPLE_LOW_CONFIDENCE_VISION);
      const ok =
        hasProductionExport("assessVisionerScoringPresence") &&
        uncertainty.needsClarification === true &&
        alternative.hasAlternatives === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `needsClarification=${uncertainty.needsClarification}, alternatives=${alternative.alternativeCount}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: VisionerScoringCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerScoringBaseline,
): VisionerScoringProbeResult {
  switch (category) {
    case "scoring_versioning":
      return probeScoringVersioning(id, category, expected, fixture);
    case "scoring_signal":
      return probeScoringSignal(id, category, expected);
    case "tradeoff_signal":
      return probeTradeoffSignal(id, category, expected);
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

export function loadVisionerScoringBaseline(): VisionerScoringBaseline {
  return visionerScoringBaseline as VisionerScoringBaseline;
}

export function runVisionerScoringProbes(
  fixture: VisionerScoringBaseline = loadVisionerScoringBaseline(),
): VisionerScoringProbeResult[] {
  const contract = getActiveVisionerScoringContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}

export interface VisionerScoringProductionSliceResult {
  atom: "P02-B08-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: VisionerScoringProbeResult[];
  summary: ReturnType<typeof summarizeVisionerScoringMatrix>;
  matrixValidation: ReturnType<typeof validateVisionerScoringProbeMatrix>;
}

/**
 * A03 production vertical slice: recoverVisionerTradeoff wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runVisionerScoringProductionSlice(
  fixture: VisionerScoringBaseline = loadVisionerScoringBaseline(),
): VisionerScoringProductionSliceResult {
  const contract = getActiveVisionerScoringContract();
  const fixtureValidation = validateVisionerScoringBaseline(fixture);
  const contractValidation = validateVisionerScoringAgainstContract(fixture, contract);
  const results = runVisionerScoringProbes(fixture);
  const summary = summarizeVisionerScoringMatrix(results);
  const matrixValidation = validateVisionerScoringProbeMatrix(results, contract);

  return {
    atom: "P02-B08-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid,
    results,
    summary,
    matrixValidation,
  };
}

export interface VisionerScoringBoundarySliceResult {
  atom: "P02-B08-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: VisionerScoringProbeResult[];
  boundaryResults: VisionerScoringProbeResult[];
  matrixValidation: ReturnType<typeof validateVisionerScoringBoundaryProbeMatrix>;
}

/**
 * A04 boundary slice: contract-wired boundary probes (scoring input edge cases, probe runner,
 * documented gaps) with zero unexpected mismatches.
 */
export function runVisionerScoringBoundarySlice(
  fixture: VisionerScoringBaseline = loadVisionerScoringBaseline(),
): VisionerScoringBoundarySliceResult {
  const contract = getActiveVisionerScoringContract();
  const results = runVisionerScoringProbes(fixture);
  const boundaryProbes = listVisionerScoringContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateVisionerScoringBoundaryProbeMatrix(results, contract);

  return {
    atom: "P02-B08-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

export interface VisionerScoringFailureRecoverySliceResult {
  atom: "P02-B08-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: VisionerScoringProbeResult[];
  failureRecoveryResults: VisionerScoringProbeResult[];
  matrixValidation: ReturnType<typeof validateVisionerScoringFailureRecoveryProbeMatrix>;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches; documented FAIL gaps preserved.
 */
export function runVisionerScoringFailureRecoverySlice(
  fixture: VisionerScoringBaseline = loadVisionerScoringBaseline(),
): VisionerScoringFailureRecoverySliceResult {
  const contract = getActiveVisionerScoringContract();
  const results = runVisionerScoringProbes(fixture);
  const failureRecoveryProbes = VISIONER_SCORING_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listVisionerScoringContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateVisionerScoringFailureRecoveryProbeMatrix(results, contract);

  return {
    atom: "P02-B08-A05",
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

function runVisionerScoringProbeWithTiming(
  entry: VisionerScoringBaseline["probes"][number],
  fixture: VisionerScoringBaseline,
  contractProbe:
    | { criterion: string; disposition: VisionerScoringProbeDisposition }
    | undefined,
): {
  result: VisionerScoringProbeResult;
  durationMs: number;
  disposition: VisionerScoringProbeDisposition;
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

function buildVisionerScoringRecordFromEntries(
  entries: VisionerScoringBaseline["probes"],
  fixture: VisionerScoringBaseline,
  contract: ReturnType<typeof getActiveVisionerScoringContract>,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly VisionerScoringCategory[];
  },
): VisionerScoringRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ReturnType<typeof buildVisionerScoringProbeEvidence>[] = [];
  const telemetry: ReturnType<typeof buildVisionerScoringProbeTelemetry>[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runVisionerScoringProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildVisionerScoringProbeEvidence(
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
      buildVisionerScoringProbeTelemetry(result.id, result.category, sequenceIndex, durationMs),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildVisionerScoringProvenance(
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

  return buildVisionerScoringRunRecord(provenance, evidence, telemetry);
}

/** Run all visioner scoring probes and emit auditable evidence, telemetry and provenance (P02-B08-A06). */
export function runVisionerScoringProbesWithRecord(
  fixture: VisionerScoringBaseline = loadVisionerScoringBaseline(),
): VisionerScoringRunRecord {
  const contract = getActiveVisionerScoringContract();
  return buildVisionerScoringRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P02-B08-A06). */
export function runVisionerScoringFailureRecoverySliceWithRecord(
  fixture: VisionerScoringBaseline = loadVisionerScoringBaseline(),
): VisionerScoringRunRecord {
  const contract = getActiveVisionerScoringContract();
  const failureRecoveryIds = new Set(listVisionerScoringFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildVisionerScoringRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P02-B08-A06",
    sliceCategories: VISIONER_SCORING_FAILURE_RECOVERY_CATEGORIES,
  });
}
