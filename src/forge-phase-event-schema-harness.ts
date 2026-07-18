/**
 * FOREMAN — Phase/Event Schema Harness (P01-B04)
 *
 * Probe seam: measures live orchestrator phase/event typing without
 * running a full LLM pipeline.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import phaseEventSchemaFixture from "./fixtures/forge-phase-event-schema-v1.json" with { type: "json" };
import { FORGE_PIPELINE_CORE_PHASES } from "./forge-pipeline-behavior-map.js";
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP01B03ToB04Handoff,
  getActiveFormalStateMachineContract,
  summarizeFormalStateMachineContractCoverage,
} from "./forge-formal-state-machine.js";
import {
  validatePhaseEventSchemaFixture,
  validatePhaseEventSchemaFixtureAgainstContract,
  validatePhaseEventSchemaProbeMatrix,
  validatePhaseEventSchemaBoundaryProbeMatrix,
  summarizePhaseEventSchemaMatrix,
  getActivePhaseEventSchemaContract,
  listPhaseEventSchemaProbesByCategory,
  listPhaseEventSchemaProbesByExpected,
  type PhaseEventSchemaCategory,
  type PhaseEventSchemaFixture,
  type PhaseEventSchemaProbeResult,
  type PhaseEventSchemaProbeMatrixValidationResult,
} from "./forge-phase-event-schema.js";

export type {
  PhaseEventSchemaFixture,
  PhaseEventSchemaProbeResult,
  PhaseEventSchemaContract,
  PhaseEventSchemaProbeContract,
} from "./forge-phase-event-schema.js";

export {
  validatePhaseEventSchemaFixture,
  validatePhaseEventSchemaFixtureAgainstContract,
  validatePhaseEventSchemaProbeMatrix,
  validatePhaseEventSchemaBoundaryProbeMatrix,
  summarizePhaseEventSchemaMatrix,
  getActivePhaseEventSchemaContract,
  getPhaseEventSchemaCategoryContract,
  listPhaseEventSchemaContractProbeIds,
  listPhaseEventSchemaProbesByDisposition,
  listPhaseEventSchemaProbesByCategory,
  listPhaseEventSchemaProbesByExpected,
  summarizePhaseEventSchemaContractCoverage,
  FORGE_PHASE_EVENT_SCHEMA_CONTRACT_V1,
  PHASE_EVENT_SCHEMA_CATEGORIES,
  buildDefaultPhaseEventSchemaSourceFormalStateMachine,
} from "./forge-phase-event-schema.js";

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
  category: PhaseEventSchemaCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): PhaseEventSchemaProbeResult {
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

function streamingSource(): string {
  return readSrc("streaming-pipeline.ts");
}

function extractQuotedPhaseLiterals(src: string): Set<string> {
  const phases = new Set<string>();
  const re = /phase:\s*"([^"]+)"/g;
  for (const match of src.matchAll(re)) {
    phases.add(match[1]);
  }
  return phases;
}

function countOrchestratorEventVariants(src: string): number {
  const start = src.indexOf("export type OrchestratorEvent");
  if (start === -1) return 0;
  const end = src.indexOf("export type EventListener", start);
  const block = end === -1 ? src.slice(start) : src.slice(start, end);
  return (block.match(/type:\s*"[^"]+"/g) ?? []).length;
}

function hasPhaseStart(src: string, phase: string): boolean {
  return src.includes(`type: "phase_start", phase: "${phase}"`);
}

function hasPhaseEnd(src: string, phase: string): boolean {
  return src.includes(`type: "phase_end", phase: "${phase}"`);
}

function probeEventTypeUnion(
  id: string,
  category: PhaseEventSchemaCategory,
  expected: ForgeAcceptanceOutcome,
): PhaseEventSchemaProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "schema.orch_event_union_defined": {
      const ok = src.includes("export type OrchestratorEvent");
      return probe(
        id,
        category,
        expected,
        ok,
        `defined=${ok}`,
        "orchestrator.ts exports type OrchestratorEvent",
      );
    }
    case "schema.orch_event_types_minimum": {
      const count = countOrchestratorEventVariants(src);
      const ok = count >= 10;
      return probe(
        id,
        category,
        expected,
        ok,
        `variants=${count}`,
        "OrchestratorEvent union has ≥10 type variants",
      );
    }
    case "schema.orch_pipeline_complete_event": {
      const ok = src.includes('type: "pipeline_complete"');
      return probe(
        id,
        category,
        expected,
        ok,
        `present=${ok}`,
        'OrchestratorEvent includes type "pipeline_complete"',
      );
    }
    case "schema.orch_verification_event": {
      const ok = src.includes('type: "verification"');
      return probe(
        id,
        category,
        expected,
        ok,
        `present=${ok}`,
        'OrchestratorEvent includes type "verification"',
      );
    }
    default:
      return probe(id, category, expected, false, "unknown event_type_union probe");
  }
}

function probePhaseTyping(
  id: string,
  category: PhaseEventSchemaCategory,
  expected: ForgeAcceptanceOutcome,
): PhaseEventSchemaProbeResult {
  const orch = orchestratorSource();
  const stream = streamingSource();

  switch (id) {
    case "schema.orch_phase_field_typed": {
      const usesString =
        orch.includes('{ type: "phase_start"; phase: string; detail: string }') ||
        orch.includes("phase: string; detail: string");
      const ok = !usesString;
      return probe(
        id,
        category,
        expected,
        ok,
        `usesString=${usesString}`,
        "OrchestratorEvent phase is ForgePipelinePhase not string",
      );
    }
    case "schema.stream_phase_field_typed": {
      const usesString =
        stream.includes("phase?: string") || stream.includes("phase: string");
      const ok = !usesString;
      return probe(
        id,
        category,
        expected,
        ok,
        `usesString=${usesString}`,
        "StreamEvent phase is ForgePipelinePhase not string",
      );
    }
    case "schema.phase_start_end_same_shape": {
      const startUsesString = orch.includes('{ type: "phase_start"; phase: string');
      const endUsesString = orch.includes('{ type: "phase_end"; phase: string');
      const ok = startUsesString === endUsesString;
      return probe(
        id,
        category,
        expected,
        ok,
        `startString=${startUsesString}, endString=${endUsesString}`,
        "phase_start/phase_end use identical phase field declarations",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown phase_typing probe");
  }
}

function probePhaseRegistry(
  id: string,
  category: PhaseEventSchemaCategory,
  expected: ForgeAcceptanceOutcome,
): PhaseEventSchemaProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "schema.pipeline_phases_export": {
      const ok = src.includes("export const FORGE_PIPELINE_PHASES");
      return probe(
        id,
        category,
        expected,
        ok,
        `exported=${ok}`,
        "orchestrator.ts exports FORGE_PIPELINE_PHASES",
      );
    }
    case "schema.core_phases_count": {
      const ok = FORGE_PIPELINE_CORE_PHASES.length === 7;
      return probe(
        id,
        category,
        expected,
        ok,
        `count=${FORGE_PIPELINE_CORE_PHASES.length}`,
        "FORGE_PIPELINE_CORE_PHASES length === 7",
      );
    }
    case "schema.unregistered_phase_literals": {
      const registry = new Set<string>(FORGE_PIPELINE_CORE_PHASES);
      const emitted = extractQuotedPhaseLiterals(src);
      const unregistered = [...emitted].filter(phase => !registry.has(phase)).sort();
      const ok = unregistered.length === 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `unregistered=${unregistered.length} sample=${unregistered.slice(0, 5).join(",")}`,
        "All orchestrator phase literals appear in FORGE_PIPELINE_CORE_PHASES",
      );
    }
    case "schema.registry_covers_core": {
      const missing = FORGE_PIPELINE_CORE_PHASES.filter(phase => !hasPhaseStart(src, phase));
      const ok = missing.length === 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `missing=${missing.join(",") || "none"}`,
        "Each FORGE_PIPELINE_CORE_PHASE has phase_start in orchestrator.ts",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown phase_registry probe");
  }
}

function probeEventPairing(
  id: string,
  category: PhaseEventSchemaCategory,
  expected: ForgeAcceptanceOutcome,
): PhaseEventSchemaProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "schema.vision_start_end_pair": {
      const ok = hasPhaseStart(src, "vision") && hasPhaseEnd(src, "vision");
      return probe(
        id,
        category,
        expected,
        ok,
        `start=${hasPhaseStart(src, "vision")}, end=${hasPhaseEnd(src, "vision")}`,
        'orchestrator.ts emits phase_start and phase_end for "vision"',
      );
    }
    case "schema.decompose_start_end_pair": {
      const ok = hasPhaseStart(src, "decompose") && hasPhaseEnd(src, "decompose");
      return probe(
        id,
        category,
        expected,
        ok,
        `start=${hasPhaseStart(src, "decompose")}, end=${hasPhaseEnd(src, "decompose")}`,
        'orchestrator.ts emits phase_start and phase_end for "decompose"',
      );
    }
    case "schema.execute_start_end_pair": {
      const ok = hasPhaseStart(src, "execute") && hasPhaseEnd(src, "execute");
      return probe(
        id,
        category,
        expected,
        ok,
        `start=${hasPhaseStart(src, "execute")}, end=${hasPhaseEnd(src, "execute")}`,
        'orchestrator.ts emits phase_start and phase_end for "execute"',
      );
    }
    case "schema.recovery_assess_unpaired": {
      const hasEnd = hasPhaseEnd(src, "recovery_assess");
      const hasStart = hasPhaseStart(src, "recovery_assess");
      const ok = !hasEnd || hasStart;
      return probe(
        id,
        category,
        expected,
        ok,
        `start=${hasStart}, end=${hasEnd}`,
        "recovery_assess has balanced phase_start/phase_end emissions",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown event_pairing probe");
  }
}

function probeStreamSeam(
  id: string,
  category: PhaseEventSchemaCategory,
  expected: ForgeAcceptanceOutcome,
): PhaseEventSchemaProbeResult {
  const stream = streamingSource();
  const orch = orchestratorSource();

  switch (id) {
    case "schema.stream_event_types_export": {
      const ok = stream.includes("export type StreamEventType");
      return probe(
        id,
        category,
        expected,
        ok,
        `exported=${ok}`,
        "streaming-pipeline.ts exports type StreamEventType",
      );
    }
    case "schema.stream_phase_start_end_methods": {
      const ok = stream.includes("phaseStart(") && stream.includes("phaseEnd(");
      return probe(
        id,
        category,
        expected,
        ok,
        `methods=${ok}`,
        "StreamingPipeline has phaseStart() and phaseEnd()",
      );
    }
    case "schema.stream_core_phase_overlap": {
      const phases = ["vision", "decompose", "research"] as const;
      const missing = phases.filter(
        phase => !orch.includes(`.phaseStart("${phase}"`) && !orch.includes(`.phaseStart('${phase}'`),
      );
      const ok = missing.length === 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `missing=${missing.join(",") || "none"}`,
        "orchestrator.ts calls streaming.phaseStart for vision/decompose/research",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown stream_seam probe");
  }
}

function probeBaselineLink(
  id: string,
  category: PhaseEventSchemaCategory,
  expected: ForgeAcceptanceOutcome,
): PhaseEventSchemaProbeResult {
  switch (id) {
    case "schema.b03_handoff_target": {
      const handoff = getForgeP01B03ToB04Handoff();
      const ok =
        handoff.targetBlock.blockId === "P01-B04" &&
        handoff.targetBlock.entryAtom === "P01-B04-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
        "B03→B04 handoff entry atom is P01-B04-A01",
      );
    }
    case "schema.b03_fsm_sealed": {
      const handoff = getForgeP01B03ToB04Handoff();
      const coverage = summarizeFormalStateMachineContractCoverage(getActiveFormalStateMachineContract());
      const ok =
        handoff.sealedArtifacts.probeCount === coverage.totalProbes &&
        handoff.sealedArtifacts.contractVersion === getActiveFormalStateMachineContract().version;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoff_probes=${handoff.sealedArtifacts.probeCount}, contract_probes=${coverage.totalProbes}`,
        "Sealed B03 handoff probe count matches active FSM contract",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown baseline_link probe");
  }
}

function probeBoundary(
  id: string,
  category: PhaseEventSchemaCategory,
  expected: ForgeAcceptanceOutcome,
): PhaseEventSchemaProbeResult {
  const src = orchestratorSource();

  switch (id) {
    case "schema.block_detected_event": {
      const ok = src.includes('type: "block_detected"');
      return probe(
        id,
        category,
        expected,
        ok,
        `present=${ok}`,
        'OrchestratorEvent includes type "block_detected"',
      );
    }
    case "schema.error_event": {
      const ok = src.includes('type: "error"');
      return probe(
        id,
        category,
        expected,
        ok,
        `present=${ok}`,
        'OrchestratorEvent includes type "error"',
      );
    }
    case "schema.format_retry_event": {
      const ok = src.includes('type: "format_retry"');
      return probe(
        id,
        category,
        expected,
        ok,
        `present=${ok}`,
        'OrchestratorEvent includes type "format_retry"',
      );
    }
    case "schema.hallucination_event": {
      const ok = src.includes('type: "hallucination"');
      return probe(
        id,
        category,
        expected,
        ok,
        `present=${ok}`,
        'OrchestratorEvent includes type "hallucination"',
      );
    }
    case "schema.block_detected_payload": {
      const ok = src.includes('{ type: "block_detected"; thought: Thought; reason: string }');
      return probe(
        id,
        category,
        expected,
        ok,
        `typedPayload=${ok}`,
        "OrchestratorEvent block_detected includes thought: Thought and reason: string",
      );
    }
    case "schema.hallucination_unused_variant": {
      const emitMatches = src.match(/type:\s*"hallucination"/g) ?? [];
      const ok = emitMatches.length > 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `hallucinationRefs=${emitMatches.length}`,
        "orchestrator.ts emits at least one type: hallucination event",
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function runSingleProbe(
  id: string,
  category: PhaseEventSchemaCategory,
  expected: ForgeAcceptanceOutcome,
): PhaseEventSchemaProbeResult {
  switch (category) {
    case "event_type_union":
      return probeEventTypeUnion(id, category, expected);
    case "phase_typing":
      return probePhaseTyping(id, category, expected);
    case "phase_registry":
      return probePhaseRegistry(id, category, expected);
    case "event_pairing":
      return probeEventPairing(id, category, expected);
    case "stream_seam":
      return probeStreamSeam(id, category, expected);
    case "baseline_link":
      return probeBaselineLink(id, category, expected);
    case "boundary":
      return probeBoundary(id, category, expected);
    default:
      return probe(id, category, expected, false, `unknown category: ${category}`);
  }
}

export function loadPhaseEventSchemaFixture(): PhaseEventSchemaFixture {
  return phaseEventSchemaFixture as PhaseEventSchemaFixture;
}

export function runPhaseEventSchemaProbes(
  fixture: PhaseEventSchemaFixture = loadPhaseEventSchemaFixture(),
): PhaseEventSchemaProbeResult[] {
  const contract = getActivePhaseEventSchemaContract();
  return fixture.probes.map(entry => {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const result = runSingleProbe(entry.id, entry.category, entry.expected);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}

export function listPhaseEventSchemaKnownGaps(
  results: PhaseEventSchemaProbeResult[] = runPhaseEventSchemaProbes(),
): PhaseEventSchemaProbeResult[] {
  return summarizePhaseEventSchemaMatrix(results).knownGaps;
}

export interface PhaseEventSchemaProductionSliceResult {
  atom: "P01-B04-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: PhaseEventSchemaProbeResult[];
  summary: ReturnType<typeof summarizePhaseEventSchemaMatrix>;
  matrixValidation: PhaseEventSchemaProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: fixture ↔ contract validation, contract-wired probe
 * execution, and matrix alignment gate (PASS probes + documented FAIL gaps).
 */
export function runPhaseEventSchemaProductionSlice(
  fixture: PhaseEventSchemaFixture = loadPhaseEventSchemaFixture(),
): PhaseEventSchemaProductionSliceResult {
  const contract = getActivePhaseEventSchemaContract();
  const fixtureValidation = validatePhaseEventSchemaFixture(fixture);
  const contractValidation = validatePhaseEventSchemaFixtureAgainstContract(fixture, contract);
  const results = runPhaseEventSchemaProbes(fixture);
  const summary = summarizePhaseEventSchemaMatrix(results);
  const matrixValidation = validatePhaseEventSchemaProbeMatrix(results, contract);

  return {
    atom: "P01-B04-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface PhaseEventSchemaBoundarySliceResult {
  atom: "P01-B04-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: PhaseEventSchemaProbeResult[];
  boundaryResults: PhaseEventSchemaProbeResult[];
  matrixValidation: PhaseEventSchemaProbeMatrixValidationResult;
}

/**
 * A04 boundary slice: contract-wired boundary event type and payload edge probes
 * with zero unexpected mismatches; documented FAIL gaps preserved.
 */
export function runPhaseEventSchemaBoundarySlice(
  fixture: PhaseEventSchemaFixture = loadPhaseEventSchemaFixture(),
): PhaseEventSchemaBoundarySliceResult {
  const contract = getActivePhaseEventSchemaContract();
  const results = runPhaseEventSchemaProbes(fixture);
  const boundaryProbes = listPhaseEventSchemaProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validatePhaseEventSchemaBoundaryProbeMatrix(results, contract);

  return {
    atom: "P01-B04-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}
