/**
 * FOREMAN — Visioner Intent Probe Harness (P02-B01-A01)
 *
 * Static probes for visioner intent baseline measurement.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import visionerIntentBaseline from "./fixtures/forge-visioner-intent-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
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
  getActiveVisionerIntentContract,
  summarizeVisionerIntentMatrix,
  listVisionerIntentProbesByExpected,
  listVisionerIntentKnownGaps,
  listVisionerIntentContractProbesByCategory,
  assessVisionerTaskInputBoundary,
  checkVisionerIntentAmbiguity,
  parseVisionerTaskIntent,
  VISIONER_TASK_MAX_LENGTH,
  FORGE_VISIONER_INTENT_VERSION,
  VISIONER_INTENT_CATEGORIES,
  type VisionerIntentBaseline,
  type VisionerIntentCategory,
  type VisionerIntentProbeResult,
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
  FORGE_VISIONER_INTENT_VERSION,
  VISIONER_INTENT_CATEGORIES,
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
