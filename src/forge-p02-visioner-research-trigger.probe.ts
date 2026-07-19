/**
 * FOREMAN — Visioner Research Trigger Probe Harness (P02-B05-A01)
 *
 * Static probes for NEEDS_RESEARCH / RESEARCH_QUERY baseline measurement.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import visionerResearchTriggerBaseline from "./fixtures/forge-visioner-research-trigger-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome, ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import {
  getForgeP02B04ToB05Handoff,
  getActiveVisionerGroundingContract,
  summarizeVisionerGroundingContractCoverage,
} from "./forge-p02-visioner-grounding.js";
import { parseVisionResponse } from "./parser.js";
import {
  assessVisionerResearchTriggerInputBoundary,
  assessVisionerResearchTriggerPresence,
  recoverVisionerResearchTrigger,
  validateVisionerResearchTriggerBaseline,
  validateVisionerResearchTriggerAgainstContract,
  summarizeVisionerResearchTriggerMatrix,
  listVisionerResearchTriggerProbesByExpected,
  listVisionerResearchTriggerKnownGaps,
  listVisionerResearchTriggerContractProbesByCategory,
  getActiveVisionerResearchTriggerContract,
  validateVisionerResearchTriggerProbeMatrix,
  validateVisionerResearchTriggerBoundaryProbeMatrix,
  validateVisionerResearchTriggerFailureRecoveryProbeMatrix,
  listVisionerResearchTriggerFailureRecoveryProbeIds,
  buildVisionerResearchTriggerProbeEvidence,
  buildVisionerResearchTriggerProbeTelemetry,
  buildVisionerResearchTriggerProvenance,
  buildVisionerResearchTriggerRunRecord,
  validateVisionerResearchTriggerRunRecord,
  detectVisionerResearchTriggerProbeRegression,
  runVisionerResearchTriggerPropertyChecks,
  runVisionerResearchTriggerFuzzValidation,
  runVisionerResearchTriggerRunRecordFuzzValidation,
  validateForgeVisionerResearchTriggerGuard,
  summarizeVisionerResearchTriggerContractCoverage,
  listVisionerResearchTriggerProbesByDisposition,
  getForgeP02B05BlockGate,
  getForgeP02B05ToB06Handoff,
  validateVisionerResearchTriggerBlockHandoffContract,
  buildVisionerResearchTriggerBlockGateEvidence,
  VISIONER_RESEARCH_TRIGGER_FAILURE_RECOVERY_CATEGORIES,
  FORGE_VISIONER_RESEARCH_TRIGGER_VERSION,
  VISIONER_RESEARCH_TRIGGER_CATEGORIES,
  VISIONER_RESEARCH_TRIGGER_VISION_MAX_LENGTH,
  EXPECTED_P02_B04_SEALED_ATOM_COUNT,
  type VisionerResearchTriggerBaseline,
  type VisionerResearchTriggerCategory,
  type VisionerResearchTriggerProbeDisposition,
  type VisionerResearchTriggerProbeResult,
  type VisionerResearchTriggerRunRecord,
} from "./forge-p02-visioner-research-trigger.js";

export type {
  VisionerResearchTriggerBaseline,
  VisionerResearchTriggerProbeResult,
  VisionerResearchTriggerRunRecord,
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
  recoverVisionerResearchTrigger,
  validateVisionerResearchTriggerProbeMatrix,
  validateVisionerResearchTriggerBoundaryProbeMatrix,
  validateVisionerResearchTriggerFailureRecoveryProbeMatrix,
  listVisionerResearchTriggerFailureRecoveryProbeIds,
  buildVisionerResearchTriggerProbeEvidence,
  buildVisionerResearchTriggerProbeTelemetry,
  buildVisionerResearchTriggerProvenance,
  buildVisionerResearchTriggerRunRecord,
  validateVisionerResearchTriggerRunRecord,
  validateVisionerResearchTriggerFailureRecoveryRunRecord,
  detectVisionerResearchTriggerProbeRegression,
  runVisionerResearchTriggerPropertyChecks,
  runVisionerResearchTriggerFuzzValidation,
  runVisionerResearchTriggerRunRecordFuzzValidation,
  validateForgeVisionerResearchTriggerGuard,
  summarizeVisionerResearchTriggerContractCoverage,
  listVisionerResearchTriggerProbesByDisposition,
  getForgeP02B05BlockGate,
  getForgeP02B05ToB06Handoff,
  validateVisionerResearchTriggerBlockHandoffContract,
  buildVisionerResearchTriggerBlockGateEvidence,
  VISIONER_RESEARCH_TRIGGER_FAILURE_RECOVERY_CATEGORIES,
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
      const contract = getActiveVisionerResearchTriggerContract();
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
      const malformed = `REASONING: Need benchmark data for dental landing pages
OUTPUT: **GOAL**: Premium dental feel
CONFIDENCE: 0.85
needs_research: yes
research topic: dental landing page best practices 2026`;
      const recovery = recoverVisionerResearchTrigger(malformed);
      const ok =
        hasProductionExport("recoverVisionerResearchTrigger") &&
        recovery.recovered === true &&
        recovery.presence.hasNeedsResearch &&
        recovery.presence.needsResearch === true &&
        recovery.presence.hasResearchQuery &&
        recovery.presence.researchQuery.includes("dental landing page");
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

export interface VisionerResearchTriggerProductionSliceResult {
  atom: "P02-B05-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: VisionerResearchTriggerProbeResult[];
  summary: ReturnType<typeof summarizeVisionerResearchTriggerMatrix>;
  matrixValidation: ReturnType<typeof validateVisionerResearchTriggerProbeMatrix>;
}

/**
 * A03 production vertical slice: recoverVisionerResearchTrigger wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runVisionerResearchTriggerProductionSlice(
  fixture: VisionerResearchTriggerBaseline = loadVisionerResearchTriggerBaseline(),
): VisionerResearchTriggerProductionSliceResult {
  const contract = getActiveVisionerResearchTriggerContract();
  const fixtureValidation = validateVisionerResearchTriggerBaseline(fixture);
  const contractValidation = validateVisionerResearchTriggerAgainstContract(fixture, contract);
  const results = runVisionerResearchTriggerProbes(fixture);
  const summary = summarizeVisionerResearchTriggerMatrix(results);
  const matrixValidation = validateVisionerResearchTriggerProbeMatrix(results, contract);

  return {
    atom: "P02-B05-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface VisionerResearchTriggerBoundarySliceResult {
  atom: "P02-B05-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: VisionerResearchTriggerProbeResult[];
  boundaryResults: VisionerResearchTriggerProbeResult[];
  matrixValidation: ReturnType<typeof validateVisionerResearchTriggerBoundaryProbeMatrix>;
}

/**
 * A04 boundary slice: contract-wired boundary probes (vision input edge cases, probe runner,
 * documented gaps) with zero unexpected mismatches.
 */
export function runVisionerResearchTriggerBoundarySlice(
  fixture: VisionerResearchTriggerBaseline = loadVisionerResearchTriggerBaseline(),
): VisionerResearchTriggerBoundarySliceResult {
  const contract = getActiveVisionerResearchTriggerContract();
  const results = runVisionerResearchTriggerProbes(fixture);
  const boundaryProbes = listVisionerResearchTriggerContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateVisionerResearchTriggerBoundaryProbeMatrix(results, contract);

  return {
    atom: "P02-B05-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

export interface VisionerResearchTriggerFailureRecoverySliceResult {
  atom: "P02-B05-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: VisionerResearchTriggerProbeResult[];
  failureRecoveryResults: VisionerResearchTriggerProbeResult[];
  matrixValidation: ReturnType<typeof validateVisionerResearchTriggerFailureRecoveryProbeMatrix>;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches; documented FAIL gaps preserved.
 */
export function runVisionerResearchTriggerFailureRecoverySlice(
  fixture: VisionerResearchTriggerBaseline = loadVisionerResearchTriggerBaseline(),
): VisionerResearchTriggerFailureRecoverySliceResult {
  const contract = getActiveVisionerResearchTriggerContract();
  const results = runVisionerResearchTriggerProbes(fixture);
  const failureRecoveryProbes = VISIONER_RESEARCH_TRIGGER_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listVisionerResearchTriggerContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateVisionerResearchTriggerFailureRecoveryProbeMatrix(results, contract);

  return {
    atom: "P02-B05-A05",
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

function runVisionerResearchTriggerProbeWithTiming(
  entry: VisionerResearchTriggerBaseline["probes"][number],
  fixture: VisionerResearchTriggerBaseline,
  contractProbe:
    | { criterion: string; disposition: VisionerResearchTriggerProbeDisposition }
    | undefined,
): {
  result: VisionerResearchTriggerProbeResult;
  durationMs: number;
  disposition: VisionerResearchTriggerProbeDisposition;
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

function buildVisionerResearchTriggerRecordFromEntries(
  entries: VisionerResearchTriggerBaseline["probes"],
  fixture: VisionerResearchTriggerBaseline,
  contract: ReturnType<typeof getActiveVisionerResearchTriggerContract>,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly VisionerResearchTriggerCategory[];
  },
): VisionerResearchTriggerRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ReturnType<typeof buildVisionerResearchTriggerProbeEvidence>[] = [];
  const telemetry: ReturnType<typeof buildVisionerResearchTriggerProbeTelemetry>[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runVisionerResearchTriggerProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildVisionerResearchTriggerProbeEvidence(
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
      buildVisionerResearchTriggerProbeTelemetry(result.id, result.category, sequenceIndex, durationMs),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildVisionerResearchTriggerProvenance(
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

  return buildVisionerResearchTriggerRunRecord(provenance, evidence, telemetry);
}

/** Run all visioner research trigger probes and emit auditable evidence, telemetry and provenance (P02-B05-A06). */
export function runVisionerResearchTriggerProbesWithRecord(
  fixture: VisionerResearchTriggerBaseline = loadVisionerResearchTriggerBaseline(),
): VisionerResearchTriggerRunRecord {
  const contract = getActiveVisionerResearchTriggerContract();
  return buildVisionerResearchTriggerRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P02-B05-A06). */
export function runVisionerResearchTriggerFailureRecoverySliceWithRecord(
  fixture: VisionerResearchTriggerBaseline = loadVisionerResearchTriggerBaseline(),
): VisionerResearchTriggerRunRecord {
  const contract = getActiveVisionerResearchTriggerContract();
  const failureRecoveryIds = new Set(listVisionerResearchTriggerFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildVisionerResearchTriggerRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P02-B05-A06",
    sliceCategories: VISIONER_RESEARCH_TRIGGER_FAILURE_RECOVERY_CATEGORIES,
  });
}

export interface ForgeVisionerResearchTriggerRegressionPropertyFuzzResult {
  passed: boolean;
  properties: ReturnType<typeof runVisionerResearchTriggerPropertyChecks>;
  contractFuzz: ReturnType<typeof runVisionerResearchTriggerFuzzValidation>;
  runFuzz: {
    validBaseline: boolean;
    mutationsRejected: number;
    mutationsAccepted: number;
  };
}

export interface ForgeVisionerResearchTriggerRegressionResult {
  passed: boolean;
  productionSlice: VisionerResearchTriggerProductionSliceResult;
  record: VisionerResearchTriggerRunRecord;
  recordValid: boolean;
  validationIssues: string[];
  probeRegression: ReturnType<typeof detectVisionerResearchTriggerProbeRegression> | null;
  guard: ReturnType<typeof validateForgeVisionerResearchTriggerGuard>;
  propertyFuzz: ForgeVisionerResearchTriggerRegressionPropertyFuzzResult;
  detail: string;
}

/**
 * Execute visioner research trigger probes, validate production slice + run record, property/fuzz gates,
 * and optionally detect regression vs prior run. Forge pipeline integration gate (P02-B05-A08).
 */
export function runForgeVisionerResearchTriggerRegressionGate(
  priorRecord?: VisionerResearchTriggerRunRecord,
): ForgeVisionerResearchTriggerRegressionResult {
  const fixture = loadVisionerResearchTriggerBaseline();
  const contract = getActiveVisionerResearchTriggerContract();
  const productionSlice = runVisionerResearchTriggerProductionSlice(fixture);
  const record = runVisionerResearchTriggerProbesWithRecord(fixture);
  const validation = validateVisionerResearchTriggerRunRecord(record, contract);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  const probeRegression = priorRecord
    ? detectVisionerResearchTriggerProbeRegression(priorRecord, record)
    : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;
  const guard = validateForgeVisionerResearchTriggerGuard(record, { totalCostUsd: 0, llmCalls: 0, contract });

  const properties = runVisionerResearchTriggerPropertyChecks(contract);
  const contractFuzz = runVisionerResearchTriggerFuzzValidation(fixture, contract);
  const runFuzz = runVisionerResearchTriggerRunRecordFuzzValidation(record, contract);
  const propertyFuzzPassed =
    properties.allPassed &&
    contractFuzz.allMutationsRejected &&
    runFuzz.mutationsAccepted === 0;
  const propertyFuzz: ForgeVisionerResearchTriggerRegressionPropertyFuzzResult = {
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
  const passed =
    productionSliceOk && recordValid && !alignmentRegression && guard.passed && propertyFuzzPassed;

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
  if (!guard.passed) {
    detailParts.push(
      `guard: ${guard.issues.map(issue => `${issue.domain}/${issue.code}`).join(", ") || "failed"}`,
    );
  } else {
    detailParts.push(
      `guard: perf=${guard.metrics.suiteDurationMs.toFixed(1)}ms cost=$${guard.metrics.totalCostUsd} adversarial=${guard.metrics.adversarialScenariosRejected}/${guard.metrics.adversarialScenariosTotal}`,
    );
  }

  return {
    passed,
    productionSlice,
    record,
    recordValid,
    validationIssues,
    probeRegression,
    guard,
    propertyFuzz,
    detail: detailParts.join(" | "),
  };
}

/** Alias for forge-pipeline-regression integration seam (P02-B05-A08). */
export const runVisionerResearchTriggerRegressionIntegration = runForgeVisionerResearchTriggerRegressionGate;

export interface ForgeVisionerResearchTriggerBlockGateResult {
  passed: boolean;
  evidence: ReturnType<typeof buildVisionerResearchTriggerBlockGateEvidence>;
  handoff: ReturnType<typeof getForgeP02B05ToB06Handoff>;
  regression: ForgeVisionerResearchTriggerRegressionResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealVisionerResearchTriggerBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P02-B05 block gate: validate A01–A09 deliverables, regression, guard, and B06 handoff (P02-B05-A10).
 */
export function runVisionerResearchTriggerBlockGate(): ForgeVisionerResearchTriggerBlockGateResult {
  const blockGate = getForgeP02B05BlockGate();
  const handoff = getForgeP02B05ToB06Handoff();
  const contract = getActiveVisionerResearchTriggerContract();
  const fixture = loadVisionerResearchTriggerBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateVisionerResearchTriggerBaseline(fixture);
  const contractValidation = validateVisionerResearchTriggerAgainstContract(fixture, contract);
  atomSeals.push(
    sealVisionerResearchTriggerBlockAtom(
      "P02-B05-A01",
      "visioner_research_trigger",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeVisionerResearchTriggerContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeVisionerResearchTriggerContractCoverage(contract);
  atomSeals.push(
    sealVisionerResearchTriggerBlockAtom(
      "P02-B05-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${VISIONER_RESEARCH_TRIGGER_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runVisionerResearchTriggerProductionSlice(fixture);
  atomSeals.push(
    sealVisionerResearchTriggerBlockAtom(
      "P02-B05-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runVisionerResearchTriggerBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealVisionerResearchTriggerBlockAtom(
      "P02-B05-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} gap=${coverage.byDisposition.gap} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const failureRecoverySlice = runVisionerResearchTriggerFailureRecoverySlice(fixture);
  const nogoProbes = listVisionerResearchTriggerProbesByDisposition("nogo", contract);
  atomSeals.push(
    sealVisionerResearchTriggerBlockAtom(
      "P02-B05-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoProbes.length} NO-GO probes`,
    ),
  );

  const regression = runForgeVisionerResearchTriggerRegressionGate();
  const recordValidation = validateVisionerResearchTriggerRunRecord(regression.record, contract);
  const evidenceOk =
    regression.record.evidence.length === coverage.totalProbes &&
    regression.record.telemetry.length === coverage.totalProbes &&
    recordValidation.valid;
  atomSeals.push(
    sealVisionerResearchTriggerBlockAtom(
      "P02-B05-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${regression.record.evidence.length} telemetry=${regression.record.telemetry.length}`
        : recordValidation.issues.map(i => i.detail).join("; "),
    ),
  );

  const propertyFuzz = regression.propertyFuzz;
  atomSeals.push(
    sealVisionerResearchTriggerBlockAtom(
      "P02-B05-A07",
      "property_fuzz",
      propertyFuzz.passed,
      `properties=${propertyFuzz.properties.passed}/${propertyFuzz.properties.total} contractFuzz rejected=${propertyFuzz.contractFuzz.rejected}/${propertyFuzz.contractFuzz.iterations} runFuzz rejected=${propertyFuzz.runFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealVisionerResearchTriggerBlockAtom(
      "P02-B05-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealVisionerResearchTriggerBlockAtom(
      "P02-B05-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateVisionerResearchTriggerBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealVisionerResearchTriggerBlockAtom(
      "P02-B05-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildVisionerResearchTriggerBlockGateEvidence(
    atomSeals,
    regression.passed,
    regression.guard.passed,
    regression.record.summary.total,
    resolveGitCommit(),
  );

  const detailParts = [
    `block=${blockGate.blockId} seals=${atomSeals.filter(s => s.passed).length}/${atomSeals.length}`,
    `regression=${regression.passed ? "PASS" : "FAIL"}`,
    `guard=${regression.guard.passed ? "PASS" : "FAIL"}`,
    `handoff=${evidence.handoffValid ? "PASS" : "FAIL"}→${handoff.targetBlock.blockId}`,
  ];

  return {
    passed: blockGatePass && evidence.handoffValid,
    evidence,
    handoff,
    regression,
    atomSeals,
    detail: detailParts.join(" | "),
  };
}

/** Alias matching ACTIVE_FRONT target name. */
export const runForgeVisionerResearchTriggerBlockGate = runVisionerResearchTriggerBlockGate;
