/**
 * FOREMAN — Visioner Grounding Probe Harness (P02-B04-A01)
 *
 * Static probes for repo and user context grounding baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import visionerGroundingBaseline from "./fixtures/forge-visioner-grounding-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome, ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import {
  getForgeP02B03ToB04Handoff,
  getActiveVisionerSynthesisContract,
  summarizeVisionerSynthesisContractCoverage,
} from "./forge-p02-visioner-synthesis.js";
import {
  assessVisionerGroundingInputBoundary,
  assessVisionerGroundingPresence,
  recoverVisionerGrounding,
  validateVisionerGroundingBaseline,
  validateVisionerGroundingAgainstContract,
  validateVisionerGroundingProbeMatrix,
  validateVisionerGroundingBoundaryProbeMatrix,
  validateVisionerGroundingFailureRecoveryProbeMatrix,
  VISIONER_GROUNDING_FAILURE_RECOVERY_CATEGORIES,
  listVisionerGroundingFailureRecoveryProbeIds,
  summarizeVisionerGroundingMatrix,
  listVisionerGroundingProbesByExpected,
  listVisionerGroundingKnownGaps,
  getActiveVisionerGroundingContract,
  listVisionerGroundingContractProbesByCategory,
  FORGE_VISIONER_GROUNDING_VERSION,
  VISIONER_GROUNDING_CATEGORIES,
  VISIONER_GROUNDING_CONTEXT_MAX_LENGTH,
  EXPECTED_P02_B03_SEALED_ATOM_COUNT,
  buildVisionerGroundingProbeEvidence,
  buildVisionerGroundingProbeTelemetry,
  buildVisionerGroundingProvenance,
  buildVisionerGroundingRunRecord,
  detectVisionerGroundingProbeRegression,
  runVisionerGroundingPropertyChecks,
  runVisionerGroundingFuzzValidation,
  runVisionerGroundingRunRecordFuzzValidation,
  validateVisionerGroundingRunRecord,
  validateForgeVisionerGroundingGuard,
  summarizeVisionerGroundingContractCoverage,
  listVisionerGroundingProbesByDisposition,
  getForgeP02B04BlockGate,
  getForgeP02B04ToB05Handoff,
  validateVisionerGroundingBlockHandoffContract,
  buildVisionerGroundingBlockGateEvidence,
  type VisionerGroundingBaseline,
  type VisionerGroundingCategory,
  type VisionerGroundingProbeDisposition,
  type VisionerGroundingProbeResult,
  type VisionerGroundingRunRecord,
  type VisionerGroundingProbeRegressionReport,
  type VisionerGroundingPropertyResult,
  type VisionerGroundingFuzzValidationResult,
  type VisionerGroundingGuardCheckResult,
} from "./forge-p02-visioner-grounding.js";

export type { VisionerGroundingBaseline, VisionerGroundingProbeResult } from "./forge-p02-visioner-grounding.js";
export {
  validateVisionerGroundingBaseline,
  validateVisionerGroundingAgainstContract,
  validateVisionerGroundingProbeMatrix,
  validateVisionerGroundingBoundaryProbeMatrix,
  validateVisionerGroundingFailureRecoveryProbeMatrix,
  VISIONER_GROUNDING_FAILURE_RECOVERY_CATEGORIES,
  listVisionerGroundingFailureRecoveryProbeIds,
  recoverVisionerGrounding,
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
  validateVisionerGroundingContractCoverage,
  getVisionerGroundingCategoryContract,
  listVisionerGroundingContractProbeIds,
  listVisionerGroundingContractProbesByCategory,
  listVisionerGroundingProbesByDisposition,
  buildVisionerGroundingProbeEvidence,
  buildVisionerGroundingProbeTelemetry,
  buildVisionerGroundingProvenance,
  buildVisionerGroundingRunRecord,
  validateVisionerGroundingRunRecord,
  validateVisionerGroundingFailureRecoveryRunRecord,
  getForgeP02B04BlockGate,
  getForgeP02B04ToB05Handoff,
  validateVisionerGroundingBlockHandoffContract,
  buildVisionerGroundingBlockGateEvidence,
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
      const contract = getActiveVisionerGroundingContract();
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
      const malformed = '{"project": "foreman", "user": "dev", "session": "prior-work"';
      const recovery = recoverVisionerGrounding(malformed);
      const ok =
        hasProductionExport("recoverVisionerGrounding") &&
        recovery.recovered === true &&
        recovery.presence.hasProjectAnchor &&
        recovery.presence.hasProjectContext &&
        recovery.presence.hasIdentityContext &&
        recovery.presence.hasSessionContext;
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

export interface VisionerGroundingProductionSliceResult {
  atom: "P02-B04-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: VisionerGroundingProbeResult[];
  summary: ReturnType<typeof summarizeVisionerGroundingMatrix>;
  matrixValidation: ReturnType<typeof validateVisionerGroundingProbeMatrix>;
}

/**
 * A03 production vertical slice: recoverVisionerGrounding wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runVisionerGroundingProductionSlice(
  fixture: VisionerGroundingBaseline = loadVisionerGroundingBaseline(),
): VisionerGroundingProductionSliceResult {
  const contract = getActiveVisionerGroundingContract();
  const fixtureValidation = validateVisionerGroundingBaseline(fixture);
  const contractValidation = validateVisionerGroundingAgainstContract(fixture, contract);
  const results = runVisionerGroundingProbes(fixture);
  const summary = summarizeVisionerGroundingMatrix(results);
  const matrixValidation = validateVisionerGroundingProbeMatrix(results, contract);

  return {
    atom: "P02-B04-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface VisionerGroundingBoundarySliceResult {
  atom: "P02-B04-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: VisionerGroundingProbeResult[];
  boundaryResults: VisionerGroundingProbeResult[];
  matrixValidation: ReturnType<typeof validateVisionerGroundingBoundaryProbeMatrix>;
}

/**
 * A04 boundary slice: contract-wired boundary probes (context input edge cases, probe runner,
 * documented gaps) with zero unexpected mismatches.
 */
export function runVisionerGroundingBoundarySlice(
  fixture: VisionerGroundingBaseline = loadVisionerGroundingBaseline(),
): VisionerGroundingBoundarySliceResult {
  const contract = getActiveVisionerGroundingContract();
  const results = runVisionerGroundingProbes(fixture);
  const boundaryProbes = listVisionerGroundingContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateVisionerGroundingBoundaryProbeMatrix(results, contract);

  return {
    atom: "P02-B04-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

export interface VisionerGroundingFailureRecoverySliceResult {
  atom: "P02-B04-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: VisionerGroundingProbeResult[];
  failureRecoveryResults: VisionerGroundingProbeResult[];
  matrixValidation: ReturnType<typeof validateVisionerGroundingFailureRecoveryProbeMatrix>;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches; documented FAIL gaps preserved.
 */
export function runVisionerGroundingFailureRecoverySlice(
  fixture: VisionerGroundingBaseline = loadVisionerGroundingBaseline(),
): VisionerGroundingFailureRecoverySliceResult {
  const contract = getActiveVisionerGroundingContract();
  const results = runVisionerGroundingProbes(fixture);
  const failureRecoveryProbes = VISIONER_GROUNDING_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listVisionerGroundingContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateVisionerGroundingFailureRecoveryProbeMatrix(results, contract);

  return {
    atom: "P02-B04-A05",
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

function runVisionerGroundingProbeWithTiming(
  entry: VisionerGroundingBaseline["probes"][number],
  fixture: VisionerGroundingBaseline,
  contractProbe:
    | { criterion: string; disposition: VisionerGroundingProbeDisposition }
    | undefined,
): {
  result: VisionerGroundingProbeResult;
  durationMs: number;
  disposition: VisionerGroundingProbeDisposition;
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

function buildVisionerGroundingRecordFromEntries(
  entries: VisionerGroundingBaseline["probes"],
  fixture: VisionerGroundingBaseline,
  contract: ReturnType<typeof getActiveVisionerGroundingContract>,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly VisionerGroundingCategory[];
  },
): VisionerGroundingRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ReturnType<typeof buildVisionerGroundingProbeEvidence>[] = [];
  const telemetry: ReturnType<typeof buildVisionerGroundingProbeTelemetry>[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runVisionerGroundingProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildVisionerGroundingProbeEvidence(
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
      buildVisionerGroundingProbeTelemetry(result.id, result.category, sequenceIndex, durationMs),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildVisionerGroundingProvenance(
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

  return buildVisionerGroundingRunRecord(provenance, evidence, telemetry);
}

/** Run all visioner grounding probes and emit auditable evidence, telemetry and provenance (P02-B04-A06). */
export function runVisionerGroundingProbesWithRecord(
  fixture: VisionerGroundingBaseline = loadVisionerGroundingBaseline(),
): VisionerGroundingRunRecord {
  const contract = getActiveVisionerGroundingContract();
  return buildVisionerGroundingRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P02-B04-A06). */
export function runVisionerGroundingFailureRecoverySliceWithRecord(
  fixture: VisionerGroundingBaseline = loadVisionerGroundingBaseline(),
): VisionerGroundingRunRecord {
  const contract = getActiveVisionerGroundingContract();
  const failureRecoveryIds = new Set(listVisionerGroundingFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildVisionerGroundingRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P02-B04-A06",
    sliceCategories: VISIONER_GROUNDING_FAILURE_RECOVERY_CATEGORIES,
  });
}

export interface ForgeVisionerGroundingRegressionPropertyFuzzResult {
  passed: boolean;
  properties: VisionerGroundingPropertyResult;
  contractFuzz: VisionerGroundingFuzzValidationResult;
  runFuzz: {
    validBaseline: boolean;
    mutationsRejected: number;
    mutationsAccepted: number;
  };
}

export interface ForgeVisionerGroundingRegressionResult {
  passed: boolean;
  productionSlice: VisionerGroundingProductionSliceResult;
  record: VisionerGroundingRunRecord;
  recordValid: boolean;
  validationIssues: string[];
  probeRegression: VisionerGroundingProbeRegressionReport | null;
  guard: VisionerGroundingGuardCheckResult;
  propertyFuzz: ForgeVisionerGroundingRegressionPropertyFuzzResult;
  detail: string;
}

/**
 * Execute visioner grounding probes, validate production slice + run record, property/fuzz gates,
 * and optionally detect regression vs prior run. Forge pipeline integration gate (P02-B04-A08).
 */
export function runForgeVisionerGroundingRegressionGate(
  priorRecord?: VisionerGroundingRunRecord,
): ForgeVisionerGroundingRegressionResult {
  const fixture = loadVisionerGroundingBaseline();
  const contract = getActiveVisionerGroundingContract();
  const productionSlice = runVisionerGroundingProductionSlice(fixture);
  const record = runVisionerGroundingProbesWithRecord(fixture);
  const validation = validateVisionerGroundingRunRecord(record, contract);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  const probeRegression = priorRecord
    ? detectVisionerGroundingProbeRegression(priorRecord, record)
    : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;
  const guard = validateForgeVisionerGroundingGuard(record, { totalCostUsd: 0, llmCalls: 0, contract });

  const properties = runVisionerGroundingPropertyChecks(contract);
  const contractFuzz = runVisionerGroundingFuzzValidation(fixture, contract);
  const runFuzz = runVisionerGroundingRunRecordFuzzValidation(record, contract);
  const propertyFuzzPassed =
    properties.allPassed &&
    contractFuzz.allMutationsRejected &&
    runFuzz.mutationsAccepted === 0;
  const propertyFuzz: ForgeVisionerGroundingRegressionPropertyFuzzResult = {
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

/** Alias for forge-pipeline-regression integration seam (P02-B04-A08). */
export const runVisionerGroundingRegressionIntegration = runForgeVisionerGroundingRegressionGate;

export interface ForgeVisionerGroundingBlockGateResult {
  passed: boolean;
  evidence: ReturnType<typeof buildVisionerGroundingBlockGateEvidence>;
  handoff: ReturnType<typeof getForgeP02B04ToB05Handoff>;
  regression: ForgeVisionerGroundingRegressionResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealVisionerGroundingBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P02-B04 block gate: validate A01–A09 deliverables, regression, guard, and B05 handoff (P02-B04-A10).
 */
export function runVisionerGroundingBlockGate(): ForgeVisionerGroundingBlockGateResult {
  const blockGate = getForgeP02B04BlockGate();
  const handoff = getForgeP02B04ToB05Handoff();
  const contract = getActiveVisionerGroundingContract();
  const fixture = loadVisionerGroundingBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateVisionerGroundingBaseline(fixture);
  const contractValidation = validateVisionerGroundingAgainstContract(fixture, contract);
  atomSeals.push(
    sealVisionerGroundingBlockAtom(
      "P02-B04-A01",
      "visioner_grounding",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeVisionerGroundingContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeVisionerGroundingContractCoverage(contract);
  atomSeals.push(
    sealVisionerGroundingBlockAtom(
      "P02-B04-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${VISIONER_GROUNDING_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runVisionerGroundingProductionSlice(fixture);
  atomSeals.push(
    sealVisionerGroundingBlockAtom(
      "P02-B04-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runVisionerGroundingBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealVisionerGroundingBlockAtom(
      "P02-B04-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} gap=${coverage.byDisposition.gap} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const failureRecoverySlice = runVisionerGroundingFailureRecoverySlice(fixture);
  const nogoProbes = listVisionerGroundingProbesByDisposition("nogo", contract);
  atomSeals.push(
    sealVisionerGroundingBlockAtom(
      "P02-B04-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoProbes.length} NO-GO probes`,
    ),
  );

  const regression = runForgeVisionerGroundingRegressionGate();
  const recordValidation = validateVisionerGroundingRunRecord(regression.record, contract);
  const evidenceOk =
    regression.record.evidence.length === coverage.totalProbes &&
    regression.record.telemetry.length === coverage.totalProbes &&
    recordValidation.valid;
  atomSeals.push(
    sealVisionerGroundingBlockAtom(
      "P02-B04-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${regression.record.evidence.length} telemetry=${regression.record.telemetry.length}`
        : recordValidation.issues.map(i => i.detail).join("; "),
    ),
  );

  const propertyFuzz = regression.propertyFuzz;
  atomSeals.push(
    sealVisionerGroundingBlockAtom(
      "P02-B04-A07",
      "property_fuzz",
      propertyFuzz.passed,
      `properties=${propertyFuzz.properties.passed}/${propertyFuzz.properties.total} contractFuzz rejected=${propertyFuzz.contractFuzz.rejected}/${propertyFuzz.contractFuzz.iterations} runFuzz rejected=${propertyFuzz.runFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealVisionerGroundingBlockAtom(
      "P02-B04-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealVisionerGroundingBlockAtom(
      "P02-B04-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateVisionerGroundingBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealVisionerGroundingBlockAtom(
      "P02-B04-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildVisionerGroundingBlockGateEvidence(
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
export const runForgeVisionerGroundingBlockGate = runVisionerGroundingBlockGate;
