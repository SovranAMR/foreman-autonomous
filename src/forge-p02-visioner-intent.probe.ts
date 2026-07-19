/**
 * FOREMAN — Visioner Intent Probe Harness (P02-B01-A01)
 *
 * Static probes for visioner intent baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import visionerIntentBaseline from "./fixtures/forge-visioner-intent-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome, ForgeBlockAtomSeal } from "./forge-baseline-contract.js";
import {
  getForgeP01ToP02PhaseHandoff,
} from "./forge-p01-phase-gate.js";
import {
  EXPECTED_SEALED_BLOCK_COUNT,
  getForgeP01B10ToP02Handoff,
  getActiveIntegratedBaselineContract,
  summarizeIntegratedBaselineContractCoverage,
} from "./forge-integrated-baseline.js";
import {
  validateVisionerIntentBaseline,
  validateVisionerIntentAgainstContract,
  validateVisionerIntentProbeMatrix,
  validateVisionerIntentBoundaryProbeMatrix,
  validateVisionerIntentFailureRecoveryProbeMatrix,
  VISIONER_INTENT_FAILURE_RECOVERY_CATEGORIES,
  getActiveVisionerIntentContract,
  summarizeVisionerIntentContractCoverage,
  summarizeVisionerIntentMatrix,
  listVisionerIntentProbesByExpected,
  listVisionerIntentKnownGaps,
  listVisionerIntentContractProbesByCategory,
  listVisionerIntentFailureRecoveryProbeIds,
  assessVisionerTaskInputBoundary,
  checkVisionerIntentAmbiguity,
  parseVisionerTaskIntent,
  VISIONER_TASK_MAX_LENGTH,
  FORGE_VISIONER_INTENT_VERSION,
  VISIONER_INTENT_CATEGORIES,
  buildVisionerIntentProbeEvidence,
  buildVisionerIntentProbeTelemetry,
  buildVisionerIntentProvenance,
  buildVisionerIntentRunRecord,
  type VisionerIntentBaseline,
  type VisionerIntentCategory,
  type VisionerIntentProbeDisposition,
  type VisionerIntentProbeResult,
  type VisionerIntentRunRecord,
  validateVisionerIntentRunRecord,
  detectVisionerIntentProbeRegression,
  validateForgeVisionerIntentGuard,
  runVisionerIntentPropertyChecks,
  runVisionerIntentFuzzValidation,
  runVisionerIntentRunRecordFuzzValidation,
  getForgeP02B01BlockGate,
  getForgeP02B01ToB02Handoff,
  validateVisionerIntentBlockHandoffContract,
  buildVisionerIntentBlockGateEvidence,
  listVisionerIntentProbesByDisposition,
  type VisionerIntentProbeRegressionReport,
  type VisionerIntentGuardCheckResult,
  type VisionerIntentPropertyResult,
  type VisionerIntentFuzzValidationResult,
} from "./forge-p02-visioner-intent.js";

export type { VisionerIntentBaseline, VisionerIntentProbeResult } from "./forge-p02-visioner-intent.js";
export {
  validateVisionerIntentBaseline,
  summarizeVisionerIntentMatrix,
  listVisionerIntentProbesByExpected,
  listVisionerIntentKnownGaps,
  getActiveVisionerIntentContract,
  getVisionerIntentCategoryContract,
  listVisionerIntentContractProbeIds,
  listVisionerIntentProbesByDisposition,
  listVisionerIntentContractProbesByCategory,
  summarizeVisionerIntentContractCoverage,
  validateVisionerIntentContractCoverage,
  validateVisionerIntentAgainstContract,
  buildDefaultSourcePhaseGate,
  validateVisionerIntentProbeMatrix,
  validateVisionerIntentBoundaryProbeMatrix,
  validateVisionerIntentFailureRecoveryProbeMatrix,
  listVisionerIntentFailureRecoveryProbeIds,
  VISIONER_INTENT_FAILURE_RECOVERY_CATEGORIES,
  FORGE_VISIONER_INTENT_VERSION,
  VISIONER_INTENT_CATEGORIES,
  buildVisionerIntentProbeEvidence,
  buildVisionerIntentProbeTelemetry,
  buildVisionerIntentProvenance,
  buildVisionerIntentRunRecord,
  validateVisionerIntentFailureRecoveryRunRecord,
  validateVisionerIntentRunRecord,
  getForgeP02B01BlockGate,
  getForgeP02B01ToB02Handoff,
  validateVisionerIntentBlockHandoffContract,
  buildVisionerIntentBlockGateEvidence,
} from "./forge-p02-visioner-intent.js";

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
  category: VisionerIntentCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): VisionerIntentProbeResult {
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

function productionIntentSource(): string {
  return readSrc("forge-p02-visioner-intent.ts") + readSrc("forge-p02-visioner-intent.probe.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionIntentSource());
}

function probeIntentVersioning(
  id: string,
  category: VisionerIntentCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerIntentBaseline,
): VisionerIntentProbeResult {
  switch (id) {
    case "vint.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "vint.atom_tagged": {
      const ok = fixture.atom === "P02-B01-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "vint.harness_version_exported": {
      const ok = FORGE_VISIONER_INTENT_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_VISIONER_INTENT_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown intent_versioning probe");
  }
}

function probeTaskSignal(
  id: string,
  category: VisionerIntentCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerIntentProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vint.raw_task_wired": {
      const ok =
        orchestrator.includes("Project: ${task}") ||
        orchestrator.includes("Resume vision for: ${task}") ||
        orchestrator.includes("Define the vision for: ${task}");
      return probe(id, category, expected, ok, `rawTaskInVisionPrompt=${ok}`);
    }
    case "vint.visioner_layer_invoke": {
      const ok =
        orchestrator.includes('stepWithPhase(') &&
        orchestrator.includes('"visioner"') &&
        orchestrator.includes('"vision"');
      return probe(id, category, expected, ok, `visionerStep=${ok}`);
    }
    case "vint.structured_intent_parse": {
      const ok = hasProductionExport("parseVisionerTaskIntent");
      return probe(id, category, expected, ok, `parseVisionerTaskIntent=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown task_signal probe");
  }
}

function probeIntentDepth(
  id: string,
  category: VisionerIntentCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerIntentProbeResult {
  const prompts = promptsSource();
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vint.prompt_depth_tiers": {
      const ok =
        prompts.includes("Simple Tasks") &&
        prompts.includes("Medium Tasks") &&
        prompts.includes("Complex Tasks");
      return probe(id, category, expected, ok, `depthTiersInPrompt=${ok}`);
    }
    case "vint.programmatic_depth_classifier": {
      const ok = hasProductionExport("classifyVisionerTaskDepth");
      return probe(id, category, expected, ok, `classifyVisionerTaskDepth=${ok}`);
    }
    case "vint.depth_routed_prompt": {
      const ok =
        orchestrator.includes("classifyVisionerTaskDepth") &&
        (orchestrator.includes("buildVisionPromptForDepth") ||
          orchestrator.includes("selectVisionerPromptByDepth") ||
          orchestrator.includes("routeVisionPromptByDepth"));
      return probe(id, category, expected, ok, `depthRoutedPrompt=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown intent_depth probe");
  }
}

function probeBaselineLink(
  id: string,
  category: VisionerIntentCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerIntentProbeResult {
  switch (id) {
    case "vint.p01_phase_handoff_entry": {
      const handoff = getForgeP01ToP02PhaseHandoff();
      const ok =
        handoff.targetPhase.entryBlock === "P02-B01" &&
        handoff.targetPhase.entryAtom === "P02-B01-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetPhase.entryBlock}/${handoff.targetPhase.entryAtom}`,
      );
    }
    case "vint.p01_integrated_sealed_probes": {
      const handoff = getForgeP01B10ToP02Handoff();
      const coverage = summarizeIntegratedBaselineContractCoverage(getActiveIntegratedBaselineContract());
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
  category: VisionerIntentCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerIntentBaseline,
): VisionerIntentProbeResult {
  switch (id) {
    case "vint.source_phase_gate_ref": {
      const handoff = getForgeP01ToP02PhaseHandoff();
      const coverage = summarizeIntegratedBaselineContractCoverage(getActiveIntegratedBaselineContract());
      const ok =
        fixture.sourcePhaseGate.atom === handoff.atom &&
        fixture.sourcePhaseGate.integratedBaselineProbeCount === coverage.totalProbes &&
        fixture.sourcePhaseGate.sealedBlockCount === EXPECTED_SEALED_BLOCK_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourcePhaseGate.atom}, probes=${fixture.sourcePhaseGate.integratedBaselineProbeCount}`,
      );
    }
    case "vint.probe_runner_exported": {
      const ok = readSrc("forge-p02-visioner-intent.probe.ts").includes(
        "export function runVisionerIntentProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "vint.known_gaps_documented": {
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      return probe(id, category, expected, failCount >= 1, `documentedFail=${failCount}`);
    }
    case "vint.empty_task_boundary": {
      const result = assessVisionerTaskInputBoundary("");
      const ok =
        hasProductionExport("assessVisionerTaskInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false;
      return probe(id, category, expected, ok, `disposition=${result.disposition}, acceptable=${result.acceptable}`);
    }
    case "vint.whitespace_task_boundary": {
      const result = assessVisionerTaskInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessVisionerTaskInputBoundary") &&
        result.disposition === "whitespace_only" &&
        result.acceptable === false;
      return probe(id, category, expected, ok, `disposition=${result.disposition}, acceptable=${result.acceptable}`);
    }
    case "vint.long_task_truncation_boundary": {
      const longTask = "word ".repeat(VISIONER_TASK_MAX_LENGTH + 100);
      const result = assessVisionerTaskInputBoundary(longTask);
      const ok =
        hasProductionExport("assessVisionerTaskInputBoundary") &&
        result.truncated === true &&
        result.normalizedTask.length === VISIONER_TASK_MAX_LENGTH &&
        result.acceptable === true;
      return probe(id, category, expected, ok, `truncated=${result.truncated}, len=${result.normalizedTask.length}`);
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: VisionerIntentCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerIntentBaseline,
): VisionerIntentProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vint.empty_vision_guard": {
      const ok =
        orchestrator.includes("vision_empty") &&
        orchestrator.includes("visionOutput.trim().length < 20");
      return probe(id, category, expected, ok, `emptyVisionGuard=${ok}`);
    }
    case "vint.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateVisionerIntentBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: VisionerIntentCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerIntentProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vint.vision_checkpoint_resume": {
      const ok =
        orchestrator.includes("priorCheckpoint?.visionOutput") &&
        orchestrator.includes("Restored from pipeline checkpoint");
      return probe(id, category, expected, ok, `checkpointResume=${ok}`);
    }
    case "vint.structured_intent_recovery": {
      const ok = hasProductionExport("recoverVisionerIntent");
      return probe(id, category, expected, ok, `recoverVisionerIntent=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: VisionerIntentCategory,
  expected: ForgeAcceptanceOutcome,
): VisionerIntentProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "vint.vision_fact_check_block": {
      const ok =
        orchestrator.includes('hooks.run("after_thought"') &&
        orchestrator.includes("vision_fact_check") &&
        orchestrator.includes('layer: "visioner"');
      return probe(id, category, expected, ok, `visionFactCheckBlock=${ok}`);
    }
    case "vint.intent_ambiguity_nogo": {
      const ambiguous = checkVisionerIntentAmbiguity("maybe or whatever");
      const wired =
        hasProductionExport("checkVisionerIntentAmbiguity") ||
        orchestrator.includes("checkVisionerIntentAmbiguity");
      const ok = wired && ambiguous.shouldBlock === true;
      return probe(id, category, expected, ok, `shouldBlock=${ambiguous.shouldBlock}, score=${ambiguous.ambiguityScore}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: VisionerIntentCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: VisionerIntentBaseline,
): VisionerIntentProbeResult {
  switch (category) {
    case "intent_versioning":
      return probeIntentVersioning(id, category, expected, fixture);
    case "task_signal":
      return probeTaskSignal(id, category, expected);
    case "intent_depth":
      return probeIntentDepth(id, category, expected);
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

export function loadVisionerIntentBaseline(): VisionerIntentBaseline {
  return visionerIntentBaseline as VisionerIntentBaseline;
}

export function runVisionerIntentProbes(
  fixture: VisionerIntentBaseline = loadVisionerIntentBaseline(),
): VisionerIntentProbeResult[] {
  const contract = getActiveVisionerIntentContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}

export interface VisionerIntentProductionSliceResult {
  atom: "P02-B01-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: VisionerIntentProbeResult[];
  summary: ReturnType<typeof summarizeVisionerIntentMatrix>;
  matrixValidation: ReturnType<typeof validateVisionerIntentProbeMatrix>;
}

/**
 * A03 production vertical slice: parse/classify/route intent wiring with contract-wired
 * probe execution and matrix alignment gate (PASS probes + documented FAIL gaps).
 */
export function runVisionerIntentProductionSlice(
  fixture: VisionerIntentBaseline = loadVisionerIntentBaseline(),
): VisionerIntentProductionSliceResult {
  const contract = getActiveVisionerIntentContract();
  const fixtureValidation = validateVisionerIntentBaseline(fixture);
  const contractValidation = validateVisionerIntentAgainstContract(fixture, contract);
  const results = runVisionerIntentProbes(fixture);
  const summary = summarizeVisionerIntentMatrix(results);
  const matrixValidation = validateVisionerIntentProbeMatrix(results, contract);

  return {
    atom: "P02-B01-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface VisionerIntentBoundarySliceResult {
  atom: "P02-B01-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: VisionerIntentProbeResult[];
  boundaryResults: VisionerIntentProbeResult[];
  matrixValidation: ReturnType<typeof validateVisionerIntentBoundaryProbeMatrix>;
}

/**
 * A04 boundary slice: contract-wired boundary probes (input edge cases, probe runner,
 * documented gaps) with zero unexpected mismatches; remaining documented FAIL gaps preserved.
 */
export function runVisionerIntentBoundarySlice(
  fixture: VisionerIntentBaseline = loadVisionerIntentBaseline(),
): VisionerIntentBoundarySliceResult {
  const contract = getActiveVisionerIntentContract();
  const results = runVisionerIntentProbes(fixture);
  const boundaryProbes = listVisionerIntentContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateVisionerIntentBoundaryProbeMatrix(results, contract);

  return {
    atom: "P02-B01-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

export interface VisionerIntentFailureRecoverySliceResult {
  atom: "P02-B01-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: VisionerIntentProbeResult[];
  failureRecoveryResults: VisionerIntentProbeResult[];
  matrixValidation: ReturnType<typeof validateVisionerIntentFailureRecoveryProbeMatrix>;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches; documented FAIL gaps preserved.
 */
export function runVisionerIntentFailureRecoverySlice(
  fixture: VisionerIntentBaseline = loadVisionerIntentBaseline(),
): VisionerIntentFailureRecoverySliceResult {
  const contract = getActiveVisionerIntentContract();
  const results = runVisionerIntentProbes(fixture);
  const failureRecoveryProbes = VISIONER_INTENT_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listVisionerIntentContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateVisionerIntentFailureRecoveryProbeMatrix(results, contract);

  return {
    atom: "P02-B01-A05",
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

function runVisionerIntentProbeWithTiming(
  entry: VisionerIntentBaseline["probes"][number],
  fixture: VisionerIntentBaseline,
  contractProbe:
    | { criterion: string; disposition: VisionerIntentProbeDisposition }
    | undefined,
): {
  result: VisionerIntentProbeResult;
  durationMs: number;
  disposition: VisionerIntentProbeDisposition;
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

function buildVisionerIntentRecordFromEntries(
  entries: VisionerIntentBaseline["probes"],
  fixture: VisionerIntentBaseline,
  contract: ReturnType<typeof getActiveVisionerIntentContract>,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly VisionerIntentCategory[];
  },
): VisionerIntentRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ReturnType<typeof buildVisionerIntentProbeEvidence>[] = [];
  const telemetry: ReturnType<typeof buildVisionerIntentProbeTelemetry>[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runVisionerIntentProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildVisionerIntentProbeEvidence(
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
      buildVisionerIntentProbeTelemetry(result.id, result.category, sequenceIndex, durationMs),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildVisionerIntentProvenance(
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

  return buildVisionerIntentRunRecord(provenance, evidence, telemetry);
}

/** Run all visioner intent probes and emit auditable evidence, telemetry and provenance (P02-B01-A06). */
export function runVisionerIntentProbesWithRecord(
  fixture: VisionerIntentBaseline = loadVisionerIntentBaseline(),
): VisionerIntentRunRecord {
  const contract = getActiveVisionerIntentContract();
  return buildVisionerIntentRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P02-B01-A06). */
export function runVisionerIntentFailureRecoverySliceWithRecord(
  fixture: VisionerIntentBaseline = loadVisionerIntentBaseline(),
): VisionerIntentRunRecord {
  const contract = getActiveVisionerIntentContract();
  const failureRecoveryIds = new Set(listVisionerIntentFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildVisionerIntentRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P02-B01-A06",
    sliceCategories: VISIONER_INTENT_FAILURE_RECOVERY_CATEGORIES,
  });
}

export interface ForgeVisionerIntentRegressionPropertyFuzzResult {
  passed: boolean;
  properties: VisionerIntentPropertyResult;
  contractFuzz: VisionerIntentFuzzValidationResult;
  runFuzz: {
    validBaseline: boolean;
    mutationsRejected: number;
    mutationsAccepted: number;
  };
}

export interface ForgeVisionerIntentRegressionResult {
  passed: boolean;
  productionSlice: VisionerIntentProductionSliceResult;
  record: VisionerIntentRunRecord;
  recordValid: boolean;
  validationIssues: string[];
  probeRegression: VisionerIntentProbeRegressionReport | null;
  guard: VisionerIntentGuardCheckResult;
  propertyFuzz: ForgeVisionerIntentRegressionPropertyFuzzResult;
  detail: string;
}

/**
 * Execute visioner intent probes, validate production slice + run record, property/fuzz gates,
 * and optionally detect regression vs prior run. Forge pipeline integration gate (P02-B01-A08).
 */
export function runForgeVisionerIntentRegressionGate(
  priorRecord?: VisionerIntentRunRecord,
): ForgeVisionerIntentRegressionResult {
  const fixture = loadVisionerIntentBaseline();
  const contract = getActiveVisionerIntentContract();
  const productionSlice = runVisionerIntentProductionSlice(fixture);
  const record = runVisionerIntentProbesWithRecord(fixture);
  const validation = validateVisionerIntentRunRecord(record, contract);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  const probeRegression = priorRecord ? detectVisionerIntentProbeRegression(priorRecord, record) : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;
  const guard = validateForgeVisionerIntentGuard(record, { totalCostUsd: 0, llmCalls: 0, contract });

  const properties = runVisionerIntentPropertyChecks(contract);
  const contractFuzz = runVisionerIntentFuzzValidation(fixture, contract);
  const runFuzz = runVisionerIntentRunRecordFuzzValidation(record, contract);
  const propertyFuzzPassed =
    properties.allPassed &&
    contractFuzz.allMutationsRejected &&
    runFuzz.mutationsAccepted === 0;
  const propertyFuzz: ForgeVisionerIntentRegressionPropertyFuzzResult = {
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

/** Alias for forge-pipeline-regression integration seam (P02-B01-A08). */
export const runVisionerIntentRegressionIntegration = runForgeVisionerIntentRegressionGate;

export interface ForgeVisionerIntentBlockGateResult {
  passed: boolean;
  evidence: import("./forge-p02-visioner-intent.js").VisionerIntentBlockGateEvidence;
  handoff: import("./forge-p02-visioner-intent.js").VisionerIntentBlockHandoffContract;
  regression: ForgeVisionerIntentRegressionResult;
  atomSeals: ForgeBlockAtomSeal[];
  detail: string;
}

function sealVisionerIntentBlockAtom(
  atomId: string,
  capability: string,
  passed: boolean,
  detail: string,
): ForgeBlockAtomSeal {
  return { atomId, capability, passed, detail };
}

/**
 * Seal P02-B01 block gate: validate A01–A09 deliverables, regression, guard, and B02 handoff (P02-B01-A10).
 */
export function runVisionerIntentBlockGate(): ForgeVisionerIntentBlockGateResult {
  const blockGate = getForgeP02B01BlockGate();
  const handoff = getForgeP02B01ToB02Handoff();
  const contract = getActiveVisionerIntentContract();
  const fixture = loadVisionerIntentBaseline();
  const atomSeals: ForgeBlockAtomSeal[] = [];

  const fixtureValidation = validateVisionerIntentBaseline(fixture);
  const contractValidation = validateVisionerIntentAgainstContract(fixture, contract);
  atomSeals.push(
    sealVisionerIntentBlockAtom(
      "P02-B01-A01",
      "visioner_intent",
      fixtureValidation.valid &&
        contractValidation.valid &&
        fixture.version === handoff.sealedArtifacts.fixtureVersion,
      fixtureValidation.valid && contractValidation.valid
        ? `fixture v${fixture.version} aligned (${summarizeVisionerIntentContractCoverage(contract).totalProbes} probes)`
        : [...fixtureValidation.issues, ...contractValidation.issues].map(i => i.detail).join("; "),
    ),
  );

  const coverage = summarizeVisionerIntentContractCoverage(contract);
  atomSeals.push(
    sealVisionerIntentBlockAtom(
      "P02-B01-A02",
      "typed_contract",
      contract.version === handoff.sealedArtifacts.contractVersion && coverage.totalProbes > 0,
      `${coverage.totalProbes} probes across ${VISIONER_INTENT_CATEGORIES.length} categories`,
    ),
  );

  const productionSlice = runVisionerIntentProductionSlice(fixture);
  atomSeals.push(
    sealVisionerIntentBlockAtom(
      "P02-B01-A03",
      "probe_matrix",
      productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0,
      `${productionSlice.summary.aligned}/${productionSlice.summary.total} probes aligned`,
    ),
  );

  const boundarySlice = runVisionerIntentBoundarySlice(fixture);
  const dispositionOk =
    coverage.byDisposition.observed > 0 &&
    coverage.byDisposition.gap > 0 &&
    coverage.byDisposition.failure > 0 &&
    coverage.byDisposition.recovery > 0 &&
    coverage.byDisposition.nogo > 0;
  atomSeals.push(
    sealVisionerIntentBlockAtom(
      "P02-B01-A04",
      "boundary_dispositions",
      boundarySlice.matrixValid && dispositionOk,
      `boundary=${boundarySlice.boundaryProbeCount} observed=${coverage.byDisposition.observed} gap=${coverage.byDisposition.gap} failure=${coverage.byDisposition.failure} recovery=${coverage.byDisposition.recovery} nogo=${coverage.byDisposition.nogo}`,
    ),
  );

  const failureRecoverySlice = runVisionerIntentFailureRecoverySlice(fixture);
  const nogoProbes = listVisionerIntentProbesByDisposition("nogo", contract);
  atomSeals.push(
    sealVisionerIntentBlockAtom(
      "P02-B01-A05",
      "failure_recovery_nogo",
      failureRecoverySlice.matrixValid && nogoProbes.length > 0,
      `${failureRecoverySlice.failureRecoveryProbeCount} failure/recovery probes; ${nogoProbes.length} NO-GO probes`,
    ),
  );

  const regression = runForgeVisionerIntentRegressionGate();
  const recordValidation = validateVisionerIntentRunRecord(regression.record, contract);
  const evidenceOk =
    regression.record.evidence.length === coverage.totalProbes &&
    regression.record.telemetry.length === coverage.totalProbes &&
    recordValidation.valid;
  atomSeals.push(
    sealVisionerIntentBlockAtom(
      "P02-B01-A06",
      "evidence_provenance",
      evidenceOk,
      evidenceOk
        ? `evidence=${regression.record.evidence.length} telemetry=${regression.record.telemetry.length}`
        : recordValidation.issues.map(i => i.detail).join("; "),
    ),
  );

  const properties = runVisionerIntentPropertyChecks(contract);
  const contractFuzz = runVisionerIntentFuzzValidation(fixture, contract);
  const runFuzz = runVisionerIntentRunRecordFuzzValidation(regression.record, contract);
  const fuzzOk = properties.allPassed && contractFuzz.allMutationsRejected && runFuzz.mutationsAccepted === 0;
  atomSeals.push(
    sealVisionerIntentBlockAtom(
      "P02-B01-A07",
      "property_fuzz",
      fuzzOk,
      `properties=${properties.passed}/${properties.total} contractFuzz rejected=${contractFuzz.rejected}/${contractFuzz.iterations} runFuzz rejected=${runFuzz.mutationsRejected}/3`,
    ),
  );

  atomSeals.push(
    sealVisionerIntentBlockAtom(
      "P02-B01-A08",
      "regression_gate",
      regression.passed,
      regression.detail,
    ),
  );

  atomSeals.push(
    sealVisionerIntentBlockAtom(
      "P02-B01-A09",
      "guard_controls",
      regression.guard.passed,
      regression.guard.passed
        ? `adversarial=${regression.guard.metrics.adversarialScenariosRejected}/${regression.guard.metrics.adversarialScenariosTotal}`
        : regression.guard.issues.map(i => i.code).join(", "),
    ),
  );

  const handoffValidation = validateVisionerIntentBlockHandoffContract(handoff, {
    probeCount: regression.record.summary.total,
    regressionPassed: regression.passed,
    guardPassed: regression.guard.passed,
  });
  const priorSealsPass = atomSeals.every(seal => seal.passed);
  const blockGatePass = priorSealsPass && handoffValidation.valid;
  atomSeals.push(
    sealVisionerIntentBlockAtom(
      "P02-B01-A10",
      "block_gate_handoff",
      blockGatePass,
      blockGatePass
        ? `handoff→${handoff.targetBlock.blockId} entry=${handoff.targetBlock.entryAtom}`
        : handoffValidation.issues.join("; ") || "prior atom seals failed",
    ),
  );

  const evidence = buildVisionerIntentBlockGateEvidence(
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
export const runForgeVisionerIntentBlockGate = runVisionerIntentBlockGate;
