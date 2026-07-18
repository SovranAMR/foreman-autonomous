/**
 * FOREMAN — Pipeline Invariant Engine Harness (P01-B05)
 *
 * Probe seam: measures live orchestrator cross-cutting invariants without
 * running a full LLM pipeline.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pipelineInvariantEngineFixture from "./fixtures/forge-pipeline-invariant-engine-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP01B04ToB05Handoff,
  getActivePhaseEventSchemaContract,
  summarizePhaseEventSchemaContractCoverage,
} from "./forge-phase-event-schema.js";
import {
  validatePipelineInvariantEngineFixture,
  validatePipelineInvariantEngineFixtureAgainstContract,
  validatePipelineInvariantEngineProbeMatrix,
  summarizePipelineInvariantEngineMatrix,
  getActivePipelineInvariantEngineContract,
  listPipelineInvariantEngineProbesByExpected,
  type PipelineInvariantEngineCategory,
  type PipelineInvariantEngineFixture,
  type PipelineInvariantEngineProbeResult,
  type PipelineInvariantEngineProbeMatrixValidationResult,
} from "./forge-pipeline-invariant-engine.js";

export type {
  PipelineInvariantEngineFixture,
  PipelineInvariantEngineProbeResult,
} from "./forge-pipeline-invariant-engine.js";

export {
  validatePipelineInvariantEngineFixture,
  validatePipelineInvariantEngineFixtureAgainstContract,
  validatePipelineInvariantEngineProbeMatrix,
  summarizePipelineInvariantEngineMatrix,
  getActivePipelineInvariantEngineContract,
  getPipelineInvariantEngineCategoryContract,
  listPipelineInvariantEngineContractProbeIds,
  listPipelineInvariantEngineProbesByDisposition,
  listPipelineInvariantEngineProbesByExpected,
  summarizePipelineInvariantEngineContractCoverage,
  FORGE_PIPELINE_INVARIANT_ENGINE_CONTRACT_V1,
  PIPELINE_INVARIANT_ENGINE_CATEGORIES,
  PIPELINE_INVARIANT_ENGINE_A01_MIN_PROBES,
  buildDefaultPipelineInvariantEngineSourcePhaseEventSchema,
} from "./forge-pipeline-invariant-engine.js";

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
  category: PipelineInvariantEngineCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): PipelineInvariantEngineProbeResult {
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

function hasPhaseStart(src: string, phase: string): boolean {
  return src.includes(`type: "phase_start", phase: "${phase}"`);
}

function hasPhaseEnd(src: string, phase: string): boolean {
  return src.includes(`type: "phase_end", phase: "${phase}"`);
}

function probePhaseLifecycle(
  id: string,
  category: PipelineInvariantEngineCategory,
  expected: ForgeAcceptanceOutcome,
): PipelineInvariantEngineProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "inv.phase_start_end_present": {
      const ok =
        src.includes('type: "phase_start"') && src.includes('type: "phase_end"');
      return probe(
        id,
        category,
        expected,
        ok,
        `start=${src.includes('type: "phase_start"')}, end=${src.includes('type: "phase_end"')}`,
        "orchestrator.ts emits phase_start and phase_end",
      );
    }
    case "inv.core_phases_paired": {
      const phases = ["vision", "decompose", "execute"] as const;
      const unpaired = phases.filter(p => !hasPhaseStart(src, p) || !hasPhaseEnd(src, p));
      const ok = unpaired.length === 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `unpaired=${unpaired.join(",") || "none"}`,
        "vision/decompose/execute have balanced phase_start/phase_end",
      );
    }
    case "inv.runtime_phase_balance_checker": {
      const emitBlock = src.slice(
        src.indexOf("private emit(event: OrchestratorEvent)"),
        src.indexOf("private emit(event: OrchestratorEvent)") + 800,
      );
      const ok =
        emitBlock.includes("phaseStack") ||
        emitBlock.includes("activePhases") ||
        emitBlock.includes("validatePhaseBalance") ||
        emitBlock.includes("invariantEngine");
      return probe(
        id,
        category,
        expected,
        ok,
        `runtimeChecker=${ok}`,
        "emit() validates phase_start/phase_end balance at runtime",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown phase_lifecycle probe");
  }
}

function probeEventOrdering(
  id: string,
  category: PipelineInvariantEngineCategory,
  expected: ForgeAcceptanceOutcome,
): PipelineInvariantEngineProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "inv.pipeline_complete_emitted": {
      const ok = src.includes('type: "pipeline_complete"');
      return probe(
        id,
        category,
        expected,
        ok,
        `present=${ok}`,
        'orchestrator emits type: "pipeline_complete"',
      );
    }
    case "inv.verification_events_wired": {
      const ok =
        src.includes('type: "verification"') &&
        src.includes("verifyForgeBaselineRegression") &&
        src.includes("verifyForgePhaseEventSchemaRegression");
      return probe(
        id,
        category,
        expected,
        ok,
        `verificationEvents=${ok}`,
        "Forge verification gates emit typed verification events",
      );
    }
    case "inv.event_order_validator": {
      const emitBlock = src.slice(
        src.indexOf("private emit(event: OrchestratorEvent)"),
        src.indexOf("private emit(event: OrchestratorEvent)") + 800,
      );
      const ok =
        emitBlock.includes("validateEventOrder") ||
        emitBlock.includes("eventSequence") ||
        emitBlock.includes("invariantEngine");
      return probe(
        id,
        category,
        expected,
        ok,
        `orderValidator=${ok}`,
        "Runtime event sequence validator hooked to emit()",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown event_ordering probe");
  }
}

function probeReflectionCadence(
  id: string,
  category: PipelineInvariantEngineCategory,
  expected: ForgeAcceptanceOutcome,
): PipelineInvariantEngineProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "inv.reflect_phase_emitted": {
      const ok = hasPhaseStart(src, "reflect");
      return probe(
        id,
        category,
        expected,
        ok,
        `reflectStart=${ok}`,
        'orchestrator emits phase_start phase: "reflect"',
      );
    }
    case "inv.reflect_interval_logic": {
      const ok =
        src.includes("reflectInterval") &&
        src.includes("isReflectionPoint") &&
        src.includes("atomCount % reflectInterval");
      return probe(
        id,
        category,
        expected,
        ok,
        `intervalLogic=${ok}`,
        "Dynamic reflectInterval cadence logic in execute loop",
      );
    }
    case "inv.reflection_cadence_invariant": {
      const ok =
        src.includes("forge-pipeline-invariant-engine") &&
        (src.includes("validateReflectionCadence") || src.includes("invariantEngine"));
      return probe(
        id,
        category,
        expected,
        ok,
        `cadenceInvariant=${ok}`,
        "Pipeline invariant engine enforces reflection cadence at runtime",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown reflection_cadence probe");
  }
}

function probeStateCoherence(
  id: string,
  category: PipelineInvariantEngineCategory,
  expected: ForgeAcceptanceOutcome,
): PipelineInvariantEngineProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "inv.state_transition_visioning": {
      const ok =
        src.includes('transition("visioning"') || src.includes(".transition(\"visioning\"");
      return probe(
        id,
        category,
        expected,
        ok,
        `visioningTransition=${ok}`,
        "Orchestrator transitions SystemState to visioning at pipeline start",
      );
    }
    case "inv.state_transition_complete": {
      const ok =
        src.includes('transition("complete"') || src.includes(".transition(\"complete\"");
      return probe(
        id,
        category,
        expected,
        ok,
        `completeTransition=${ok}`,
        "Orchestrator transitions SystemState to complete at pipeline end",
      );
    }
    case "inv.state_phase_coherence_checker": {
      const ok =
        src.includes("validateStatePhaseCoherence") ||
        (src.includes("forge-pipeline-invariant-engine") && src.includes("statePhaseCoherence"));
      return probe(
        id,
        category,
        expected,
        ok,
        `coherenceChecker=${ok}`,
        "Runtime checker validates SystemState matches active pipeline phase",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown state_coherence probe");
  }
}

function probeBlockHalt(
  id: string,
  category: PipelineInvariantEngineCategory,
  expected: ForgeAcceptanceOutcome,
): PipelineInvariantEngineProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "inv.block_detected_event": {
      const ok =
        src.includes('type: "block_detected"') &&
        src.includes("{ type: \"block_detected\"; thought: Thought; reason: string }");
      return probe(
        id,
        category,
        expected,
        ok,
        `typedBlockEvent=${ok}`,
        "Orchestrator emits block_detected with typed payload",
      );
    }
    case "inv.block_halts_forward": {
      const ok =
        /type:\s*"block_detected"[\s\S]{0,500}return this\.buildResult/.test(src) ||
        /type:\s*"block_detected"[\s\S]{0,300}return \{ success: false/.test(src);
      return probe(
        id,
        category,
        expected,
        ok,
        `haltsForward=${ok}`,
        "block_detected emission halts forward pipeline progress",
      );
    }
    case "inv.block_invariant_module": {
      const emitBlock = src.slice(
        src.indexOf("private emit(event: OrchestratorEvent)"),
        src.indexOf("private emit(event: OrchestratorEvent)") + 800,
      );
      const ok =
        emitBlock.includes("validateBlockHalt") ||
        (src.includes("forge-pipeline-invariant-engine") && src.includes("blockHaltInvariant"));
      return probe(
        id,
        category,
        expected,
        ok,
        `blockInvariant=${ok}`,
        "Dedicated block-halt invariant module wired into emit()",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown block_halt probe");
  }
}

function probeVerificationGate(
  id: string,
  category: PipelineInvariantEngineCategory,
  expected: ForgeAcceptanceOutcome,
): PipelineInvariantEngineProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "inv.verify_regression_exports": {
      const ok =
        src.includes("verifyForgeBaselineRegression") &&
        src.includes("verifyForgeBehaviorMapRegression") &&
        src.includes("verifyForgeFormalStateMachineRegression") &&
        src.includes("verifyForgePhaseEventSchemaRegression");
      return probe(
        id,
        category,
        expected,
        ok,
        `regressionExports=${ok}`,
        "Orchestrator exports verifyForge*Regression gate methods",
      );
    }
    case "inv.verify_block_gate_exports": {
      const ok =
        src.includes("verifyForgeBaselineBlockGate") &&
        src.includes("verifyForgeBehaviorMapBlockGate") &&
        src.includes("verifyForgeFormalStateMachineBlockGate") &&
        src.includes("verifyForgePhaseEventSchemaBlockGate");
      return probe(
        id,
        category,
        expected,
        ok,
        `blockGateExports=${ok}`,
        "Orchestrator exports verifyForge*BlockGate gate methods",
      );
    }
    case "inv.verification_gate_invariant": {
      const ok =
        src.includes("validateVerificationGateOrder") ||
        (src.includes("forge-pipeline-invariant-engine") && src.includes("verificationGateInvariant"));
      return probe(
        id,
        category,
        expected,
        ok,
        `gateInvariant=${ok}`,
        "Invariant engine validates verification gate ordering before pipeline_complete",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown verification_gate probe");
  }
}

function probeBaselineLink(
  id: string,
  category: PipelineInvariantEngineCategory,
  expected: ForgeAcceptanceOutcome,
): PipelineInvariantEngineProbeResult {
  switch (id) {
    case "inv.b04_handoff_target": {
      const handoff = getForgeP01B04ToB05Handoff();
      const ok =
        handoff.targetBlock.blockId === "P01-B05" &&
        handoff.targetBlock.entryAtom === "P01-B05-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
        "B04→B05 handoff entry atom is P01-B05-A01",
      );
    }
    case "inv.b04_schema_sealed": {
      const handoff = getForgeP01B04ToB05Handoff();
      const coverage = summarizePhaseEventSchemaContractCoverage(getActivePhaseEventSchemaContract());
      const ok =
        handoff.sealedArtifacts.probeCount === coverage.totalProbes &&
        handoff.sealedArtifacts.contractVersion === getActivePhaseEventSchemaContract().version;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoff_probes=${handoff.sealedArtifacts.probeCount}, contract_probes=${coverage.totalProbes}`,
        "Sealed B04 handoff probe count matches active phase/event schema contract",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown baseline_link probe");
  }
}

function probeBoundary(
  id: string,
  category: PipelineInvariantEngineCategory,
  expected: ForgeAcceptanceOutcome,
): PipelineInvariantEngineProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "inv.error_on_empty_vision": {
      const ok =
        src.includes("Vision phase returned empty/trivial output") &&
        src.includes('type: "error"');
      return probe(
        id,
        category,
        expected,
        ok,
        `emptyVisionError=${ok}`,
        "Orchestrator emits error when vision phase returns empty output",
      );
    }
    case "inv.format_retry_handling": {
      const ok =
        src.includes('type: "format_retry"') &&
        (src.includes("format_retry") || src.includes("formatRetry"));
      return probe(
        id,
        category,
        expected,
        ok,
        `formatRetry=${ok}`,
        "Orchestrator handles format_retry as validation NO-GO gate",
      );
    }
    case "inv.invariant_engine_orchestrator_wired": {
      const ok = src.includes("forge-pipeline-invariant-engine");
      return probe(
        id,
        category,
        expected,
        ok,
        `orchestratorWired=${ok}`,
        "Orchestrator imports and wires pipeline invariant engine for live validation",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function runSingleProbe(
  id: string,
  category: PipelineInvariantEngineCategory,
  expected: ForgeAcceptanceOutcome,
): PipelineInvariantEngineProbeResult {
  switch (category) {
    case "phase_lifecycle":
      return probePhaseLifecycle(id, category, expected);
    case "event_ordering":
      return probeEventOrdering(id, category, expected);
    case "reflection_cadence":
      return probeReflectionCadence(id, category, expected);
    case "state_coherence":
      return probeStateCoherence(id, category, expected);
    case "block_halt":
      return probeBlockHalt(id, category, expected);
    case "verification_gate":
      return probeVerificationGate(id, category, expected);
    case "baseline_link":
      return probeBaselineLink(id, category, expected);
    case "boundary":
      return probeBoundary(id, category, expected);
    default:
      return probe(id, category, expected, false, `unknown category: ${category}`);
  }
}

export function loadPipelineInvariantEngineFixture(): PipelineInvariantEngineFixture {
  return pipelineInvariantEngineFixture as PipelineInvariantEngineFixture;
}

export function runPipelineInvariantEngineProbes(
  fixture: PipelineInvariantEngineFixture = loadPipelineInvariantEngineFixture(),
): PipelineInvariantEngineProbeResult[] {
  const contract = getActivePipelineInvariantEngineContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}

export function listPipelineInvariantEngineKnownGaps(
  results: PipelineInvariantEngineProbeResult[] = runPipelineInvariantEngineProbes(),
): PipelineInvariantEngineProbeResult[] {
  return summarizePipelineInvariantEngineMatrix(results).knownGaps;
}

export interface PipelineInvariantEngineProductionSliceResult {
  atom: "P01-B05-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: PipelineInvariantEngineProbeResult[];
  summary: ReturnType<typeof summarizePipelineInvariantEngineMatrix>;
  matrixValidation: PipelineInvariantEngineProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: fixture ↔ contract validation, contract-wired probe
 * execution, and matrix alignment gate (PASS probes + documented FAIL gaps).
 */
export function runPipelineInvariantEngineProductionSlice(
  fixture: PipelineInvariantEngineFixture = loadPipelineInvariantEngineFixture(),
): PipelineInvariantEngineProductionSliceResult {
  const contract = getActivePipelineInvariantEngineContract();
  const fixtureValidation = validatePipelineInvariantEngineFixture(fixture);
  const contractValidation = validatePipelineInvariantEngineFixtureAgainstContract(fixture, contract);
  const results = runPipelineInvariantEngineProbes(fixture);
  const summary = summarizePipelineInvariantEngineMatrix(results);
  const matrixValidation = validatePipelineInvariantEngineProbeMatrix(results, contract);

  return {
    atom: "P01-B05-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}
