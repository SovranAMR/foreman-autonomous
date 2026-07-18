/**
 * FOREMAN — Typed Phase/Event Schema Baseline (P01-B04)
 *
 * Measures orchestrator phase/event typing and registry alignment.
 * Built on sealed P01-B03 formal state machine artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  FORGE_FORMAL_STATE_MACHINE_CONTRACT_V1,
  FORMAL_STATE_MACHINE_CATEGORIES,
  getForgeP01B03ToB04Handoff,
  summarizeFormalStateMachineContractCoverage,
} from "./forge-formal-state-machine.js";
import { FORGE_PIPELINE_CORE_PHASES } from "./forge-pipeline-behavior-map.js";

export const FORGE_PHASE_EVENT_SCHEMA_HARNESS_VERSION = "1.0.0-a06";

export type PhaseEventSchemaProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export const PHASE_EVENT_SCHEMA_CATEGORIES = [
  "event_type_union",
  "phase_typing",
  "phase_registry",
  "event_pairing",
  "stream_seam",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type PhaseEventSchemaCategory = (typeof PHASE_EVENT_SCHEMA_CATEGORIES)[number];

export interface PhaseEventSchemaFixtureEntry {
  id: string;
  category: PhaseEventSchemaCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface PhaseEventSchemaFixture {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceFormalStateMachine: {
    version: string;
    atom: string;
    contractVersion: string;
    probeCount: number;
    fsmCategories: number;
  };
  probes: PhaseEventSchemaFixtureEntry[];
}

export interface PhaseEventSchemaProbeContract {
  id: string;
  category: PhaseEventSchemaCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: PhaseEventSchemaProbeDisposition;
  criterion: string;
}

export interface PhaseEventSchemaCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface PhaseEventSchemaCategoryContract {
  category: PhaseEventSchemaCategory;
  acceptance: PhaseEventSchemaCategoryAcceptance;
  probes: readonly PhaseEventSchemaProbeContract[];
}

export interface PhaseEventSchemaContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<PhaseEventSchemaCategory, PhaseEventSchemaCategoryContract>;
  probes: readonly PhaseEventSchemaProbeContract[];
}

export interface PhaseEventSchemaProbeResult {
  id: string;
  category: PhaseEventSchemaCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface PhaseEventSchemaProbeSummary {
  total: number;
  aligned: number;
  mismatches: PhaseEventSchemaProbeResult[];
  knownGaps: PhaseEventSchemaProbeResult[];
  byCategory: Record<
    PhaseEventSchemaCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface PhaseEventSchemaFixtureValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: PhaseEventSchemaCategory;
  detail: string;
}

export interface PhaseEventSchemaFixtureValidationResult {
  valid: boolean;
  issues: PhaseEventSchemaFixtureValidationIssue[];
}

/** Minimum probes per category for A01 baseline slice. */
export const PHASE_EVENT_SCHEMA_A01_MIN_PROBES: Readonly<
  Record<PhaseEventSchemaCategory, number>
> = {
  event_type_union: 4,
  phase_typing: 3,
  phase_registry: 4,
  event_pairing: 4,
  stream_seam: 3,
  baseline_link: 2,
  boundary: 4,
  failure_path: 3,
  recovery_path: 3,
  nogo_path: 3,
};

function flattenPhaseEventSchemaCategoryProbes(
  categories: Record<PhaseEventSchemaCategory, PhaseEventSchemaCategoryContract>,
): readonly PhaseEventSchemaProbeContract[] {
  return PHASE_EVENT_SCHEMA_CATEGORIES.flatMap(category => categories[category].probes);
}

const PHASE_EVENT_SCHEMA_CATEGORY_CONTRACTS: Record<
  PhaseEventSchemaCategory,
  PhaseEventSchemaCategoryContract
> = {
  event_type_union: {
    category: "event_type_union",
    acceptance: {
      invariant:
        "OrchestratorEvent is a discriminated union covering pipeline lifecycle, verification, and error events.",
      minProbeCount: 4,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "schema.orch_event_union_defined",
        category: "event_type_union",
        description: "Orchestrator exports OrchestratorEvent discriminated union",
        expected: "PASS",
        disposition: "observed",
        criterion: "orchestrator.ts exports type OrchestratorEvent",
      },
      {
        id: "schema.orch_event_types_minimum",
        category: "event_type_union",
        description: "OrchestratorEvent covers at least ten event type variants",
        expected: "PASS",
        disposition: "observed",
        criterion: "OrchestratorEvent union has ≥10 type variants",
      },
      {
        id: "schema.orch_pipeline_complete_event",
        category: "event_type_union",
        description: "OrchestratorEvent includes pipeline_complete variant",
        expected: "PASS",
        disposition: "observed",
        criterion: 'OrchestratorEvent includes type "pipeline_complete"',
      },
      {
        id: "schema.orch_verification_event",
        category: "event_type_union",
        description: "OrchestratorEvent includes verification variant",
        expected: "PASS",
        disposition: "observed",
        criterion: 'OrchestratorEvent includes type "verification"',
      },
    ],
  },
  phase_typing: {
    category: "phase_typing",
    acceptance: {
      invariant:
        "Phase fields on phase-bearing events use a typed literal union aligned to the canonical phase registry.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "schema.orch_phase_field_typed",
        category: "phase_typing",
        description: "OrchestratorEvent phase field uses typed union instead of string",
        expected: "FAIL",
        disposition: "gap",
        criterion: "OrchestratorEvent phase is ForgePipelinePhase not string",
      },
      {
        id: "schema.stream_phase_field_typed",
        category: "phase_typing",
        description: "StreamEvent phase field uses typed union instead of string",
        expected: "FAIL",
        disposition: "gap",
        criterion: "StreamEvent phase is ForgePipelinePhase not string",
      },
      {
        id: "schema.phase_start_end_same_shape",
        category: "phase_typing",
        description: "phase_start and phase_end share the same phase field type",
        expected: "PASS",
        disposition: "observed",
        criterion: "phase_start/phase_end use identical phase field declarations",
      },
    ],
  },
  phase_registry: {
    category: "phase_registry",
    acceptance: {
      invariant:
        "Canonical FORGE_PIPELINE_PHASES registry covers all orchestrator-emitted phase literals.",
      minProbeCount: 4,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "schema.pipeline_phases_export",
        category: "phase_registry",
        description: "Orchestrator exports FORGE_PIPELINE_PHASES registry",
        expected: "PASS",
        disposition: "observed",
        criterion: "orchestrator.ts exports FORGE_PIPELINE_PHASES",
      },
      {
        id: "schema.core_phases_count",
        category: "phase_registry",
        description: "FORGE_PIPELINE_CORE_PHASES defines seven canonical pipeline phases",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_PIPELINE_CORE_PHASES length === 7",
      },
      {
        id: "schema.unregistered_phase_literals",
        category: "phase_registry",
        description: "Orchestrator emits phase literals absent from canonical registry",
        expected: "FAIL",
        disposition: "gap",
        criterion: "All orchestrator phase literals appear in FORGE_PIPELINE_CORE_PHASES",
      },
      {
        id: "schema.registry_covers_core",
        category: "phase_registry",
        description: "verify core phase missing orchestrator phase_start emission",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Each FORGE_PIPELINE_CORE_PHASE has phase_start in orchestrator.ts",
      },
    ],
  },
  event_pairing: {
    category: "event_pairing",
    acceptance: {
      invariant:
        "Core pipeline phases emit matching phase_start/phase_end pairs; auxiliary phases remain explicitly paired or documented.",
      minProbeCount: 4,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "schema.vision_start_end_pair",
        category: "event_pairing",
        description: "vision emits both phase_start and phase_end",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts emits phase_start and phase_end for "vision"',
      },
      {
        id: "schema.decompose_start_end_pair",
        category: "event_pairing",
        description: "decompose emits both phase_start and phase_end",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts emits phase_start and phase_end for "decompose"',
      },
      {
        id: "schema.execute_start_end_pair",
        category: "event_pairing",
        description: "execute emits both phase_start and phase_end",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts emits phase_start and phase_end for "execute"',
      },
      {
        id: "schema.recovery_assess_unpaired",
        category: "event_pairing",
        description: "recovery_assess emits phase_end without matching phase_start",
        expected: "FAIL",
        disposition: "gap",
        criterion: "recovery_assess has balanced phase_start/phase_end emissions",
      },
    ],
  },
  stream_seam: {
    category: "stream_seam",
    acceptance: {
      invariant:
        "Streaming pipeline exports typed StreamEventType union and phaseStart/phaseEnd seam aligned to orchestrator phases.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "schema.stream_event_types_export",
        category: "stream_seam",
        description: "streaming-pipeline.ts exports StreamEventType union",
        expected: "PASS",
        disposition: "observed",
        criterion: "streaming-pipeline.ts exports type StreamEventType",
      },
      {
        id: "schema.stream_phase_start_end_methods",
        category: "stream_seam",
        description: "StreamingPipeline exposes phaseStart and phaseEnd methods",
        expected: "PASS",
        disposition: "observed",
        criterion: "StreamingPipeline has phaseStart() and phaseEnd()",
      },
      {
        id: "schema.stream_core_phase_overlap",
        category: "stream_seam",
        description: "Core pipeline phases appear in orchestrator streaming calls",
        expected: "PASS",
        disposition: "observed",
        criterion: "orchestrator.ts calls streaming.phaseStart for vision/decompose/research",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Phase/event schema baseline links to sealed P01-B03 formal state machine handoff artifacts and probe counts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "schema.b03_handoff_target",
        category: "baseline_link",
        description: "FORGE_P01_B03_TO_B04_HANDOFF_V1 targets P01-B04-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "B03→B04 handoff entry atom is P01-B04-A01",
      },
      {
        id: "schema.b03_fsm_sealed",
        category: "baseline_link",
        description: "Sealed B03 formal state machine probe count matches handoff artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Sealed B03 handoff probe count matches active FSM contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "OrchestratorEvent covers block, error, format retry, and hallucination boundary events with typed payloads.",
      minProbeCount: 4,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "schema.block_detected_event",
        category: "boundary",
        description: "OrchestratorEvent includes block_detected variant",
        expected: "PASS",
        disposition: "observed",
        criterion: 'OrchestratorEvent includes type "block_detected"',
      },
      {
        id: "schema.error_event",
        category: "boundary",
        description: "OrchestratorEvent includes error variant",
        expected: "PASS",
        disposition: "observed",
        criterion: 'OrchestratorEvent includes type "error"',
      },
      {
        id: "schema.format_retry_event",
        category: "boundary",
        description: "OrchestratorEvent includes format_retry variant",
        expected: "PASS",
        disposition: "observed",
        criterion: 'OrchestratorEvent includes type "format_retry"',
      },
      {
        id: "schema.hallucination_event",
        category: "boundary",
        description: "OrchestratorEvent includes hallucination variant",
        expected: "PASS",
        disposition: "observed",
        criterion: 'OrchestratorEvent includes type "hallucination"',
      },
      {
        id: "schema.block_detected_payload",
        category: "boundary",
        description: "block_detected variant declares typed thought and reason payload fields",
        expected: "PASS",
        disposition: "observed",
        criterion:
          'OrchestratorEvent block_detected includes thought: Thought and reason: string',
      },
      {
        id: "schema.hallucination_unused_variant",
        category: "boundary",
        description: "hallucination variant defined but orchestrator never emits it",
        expected: "FAIL",
        disposition: "gap",
        criterion: "orchestrator.ts emits at least one type: hallucination event",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant:
        "Orchestrator emits typed failure events (block_detected, error, format_retry) on worker blocks, atom exhaustion, and validation retries.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "schema.failure_block_detected_on_worker",
        category: "failure_path",
        description: "Orchestrator emits block_detected when worker thought.status is blocked",
        expected: "PASS",
        disposition: "failure",
        criterion:
          'orchestrator emits type: "block_detected" when execResult?.thought.status === "blocked"',
      },
      {
        id: "schema.failure_error_on_atom_exhaust",
        category: "failure_path",
        description: "Orchestrator emits error when atom exhausts MAX_ATOM_RETRIES",
        expected: "PASS",
        disposition: "failure",
        criterion:
          'orchestrator emits type: "error" after atom fails MAX_ATOM_RETRIES and queues recovery',
      },
      {
        id: "schema.failure_format_retry_validation",
        category: "failure_path",
        description: "Orchestrator emits format_retry on atom validation retry path",
        expected: "PASS",
        disposition: "failure",
        criterion: 'orchestrator emits type: "format_retry" on validation failure retry',
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Orchestrator emits recovery phase events for re_decompose, runRecoveryPhase, and recovery_assess rebatching.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "schema.recovery_re_decompose_events",
        category: "recovery_path",
        description: "Orchestrator emits re_decompose phase streaming events on block failure",
        expected: "PASS",
        disposition: "recovery",
        criterion: 'orchestrator calls phaseStart("re_decompose") after block failure threshold',
      },
      {
        id: "schema.recovery_phase_runner",
        category: "recovery_path",
        description: "runRecoveryPhase emits recovery phase_start and phase_end events",
        expected: "PASS",
        disposition: "recovery",
        criterion: 'runRecoveryPhase emits phaseStart/phaseEnd for "recovery" phase',
      },
      {
        id: "schema.recovery_assess_phase_end",
        category: "recovery_path",
        description: "Recovery assess emits recovery_assess phase_end after rebatching",
        expected: "PASS",
        disposition: "recovery",
        criterion: 'orchestrator emits phase_end with phase "recovery_assess"',
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Orchestrator enforces NO-GO gates via reviewer REJECT handling, rollback-on-reject, and format_retry validation gates.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "schema.nogo_reviewer_reject_branch",
        category: "nogo_path",
        description: "Orchestrator handles reviewer REJECT verdict as NO-GO with event emission",
        expected: "PASS",
        disposition: "nogo",
        criterion: 'reviewResult.verdict === "REJECT" branch emits error or block events',
      },
      {
        id: "schema.nogo_rollback_on_reject",
        category: "nogo_path",
        description: "Orchestrator rolls back atom on reviewer REJECT verdict",
        expected: "PASS",
        disposition: "nogo",
        criterion: 'REJECT verdict triggers rollbackLastAtom before retry',
      },
      {
        id: "schema.nogo_format_retry_gate",
        category: "nogo_path",
        description: "format_retry event acts as validation NO-GO gate before re-execution",
        expected: "PASS",
        disposition: "nogo",
        criterion: "format_retry emitted with attempt and missing fields before atom retry",
      },
    ],
  },
};

/** Typed phase/event schema contract v1 — source of truth for schema probe acceptance. */
export const FORGE_PHASE_EVENT_SCHEMA_CONTRACT_V1: PhaseEventSchemaContract = {
  version: "1.0.0",
  atom: "P01-B04-A05",
  purpose:
    "Measurable acceptance criteria for orchestrator typed phase/event schema (event union, phase typing, registry, pairing, stream seam, B03 link).",
  categories: PHASE_EVENT_SCHEMA_CATEGORY_CONTRACTS,
  probes: flattenPhaseEventSchemaCategoryProbes(PHASE_EVENT_SCHEMA_CATEGORY_CONTRACTS),
};

export function getActivePhaseEventSchemaContract(): PhaseEventSchemaContract {
  return FORGE_PHASE_EVENT_SCHEMA_CONTRACT_V1;
}

export function getPhaseEventSchemaCategoryContract(
  category: PhaseEventSchemaCategory,
  contract: PhaseEventSchemaContract = getActivePhaseEventSchemaContract(),
): PhaseEventSchemaCategoryContract {
  return contract.categories[category];
}

export function listPhaseEventSchemaContractProbeIds(
  contract: PhaseEventSchemaContract = getActivePhaseEventSchemaContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listPhaseEventSchemaProbesByDisposition(
  disposition: PhaseEventSchemaProbeDisposition,
  contract: PhaseEventSchemaContract = getActivePhaseEventSchemaContract(),
): PhaseEventSchemaProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listPhaseEventSchemaProbesByCategory(
  category: PhaseEventSchemaCategory,
  contract: PhaseEventSchemaContract = getActivePhaseEventSchemaContract(),
): PhaseEventSchemaProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizePhaseEventSchemaContractCoverage(
  contract: PhaseEventSchemaContract = getActivePhaseEventSchemaContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<PhaseEventSchemaCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<PhaseEventSchemaProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    PhaseEventSchemaCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<PhaseEventSchemaProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of PHASE_EVENT_SCHEMA_CATEGORIES) {
    const categoryContract = contract.categories[category];
    byCategory[category] = {
      probeCount: categoryContract.probes.length,
      invariant: categoryContract.acceptance.invariant,
    };
    for (const probe of categoryContract.probes) {
      totalProbes++;
      byDisposition[probe.disposition]++;
      if (probe.expected === "PASS") expectedPass++;
      else expectedFail++;
    }
  }

  return { totalProbes, expectedPass, expectedFail, byCategory, byDisposition };
}

export function buildDefaultPhaseEventSchemaSourceFormalStateMachine(): PhaseEventSchemaFixture["sourceFormalStateMachine"] {
  const coverage = summarizeFormalStateMachineContractCoverage(FORGE_FORMAL_STATE_MACHINE_CONTRACT_V1);
  return {
    version: "1.0.0",
    atom: "P01-B03-A10",
    contractVersion: FORGE_FORMAL_STATE_MACHINE_CONTRACT_V1.version,
    probeCount: coverage.totalProbes,
    fsmCategories: FORMAL_STATE_MACHINE_CATEGORIES.length,
  };
}

export function validatePhaseEventSchemaFixture(
  fixture: PhaseEventSchemaFixture,
): PhaseEventSchemaFixtureValidationResult {
  const issues: PhaseEventSchemaFixtureValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P01-B04-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory: Record<PhaseEventSchemaCategory, number> = {
    event_type_union: 0,
    phase_typing: 0,
    phase_registry: 0,
    event_pairing: 0,
    stream_seam: 0,
    baseline_link: 0,
    boundary: 0,
    failure_path: 0,
    recovery_path: 0,
    nogo_path: 0,
  };

  for (const probe of fixture.probes) {
    if (ids.has(probe.id)) {
      issues.push({ kind: "extra_probe", probeId: probe.id, detail: "duplicate probe id" });
    }
    ids.add(probe.id);
    byCategory[probe.category]++;
  }

  for (const category of PHASE_EVENT_SCHEMA_CATEGORIES) {
    const min = PHASE_EVENT_SCHEMA_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP01B03ToB04Handoff();
  if (fixture.sourceFormalStateMachine.probeCount !== handoff.sealedArtifacts.probeCount) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceFormalStateMachine.probeCount=${fixture.sourceFormalStateMachine.probeCount} handoff=${handoff.sealedArtifacts.probeCount}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

export function validatePhaseEventSchemaFixtureAgainstContract(
  fixture: PhaseEventSchemaFixture,
  contract: PhaseEventSchemaContract = getActivePhaseEventSchemaContract(),
): PhaseEventSchemaFixtureValidationResult {
  const issues: PhaseEventSchemaFixtureValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of PHASE_EVENT_SCHEMA_CATEGORIES) {
    const categoryContract = contract.categories[category];
    const categoryProbes = fixture.probes.filter(p => p.category === category);
    if (categoryProbes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${categoryProbes.length} probes; contract requires >= ${categoryContract.acceptance.minProbeCount}`,
      });
    }
  }

  for (const probe of contract.probes) {
    if (!fixtureIds.has(probe.id)) {
      issues.push({ kind: "missing_probe", probeId: probe.id, detail: `fixture missing ${probe.id}` });
    }
  }

  for (const entry of fixture.probes) {
    if (!contractIds.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: `fixture extra ${entry.id}` });
      continue;
    }
    const expected = contract.probes.find(p => p.id === entry.id)!;
    if (entry.expected !== expected.expected) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `expected mismatch fixture=${entry.expected} contract=${expected.expected}`,
      });
    }
    if (entry.description !== expected.description) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `description mismatch for ${entry.id}`,
      });
    }
    if (entry.category !== expected.category) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `category mismatch fixture=${entry.category} contract=${expected.category}`,
      });
    }
  }

  const expectedFailCount = contract.probes.filter(p => p.expected === "FAIL").length;
  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (expectedFailCount > 0 && failGaps.length === 0) {
    issues.push({ kind: "missing_category", detail: "fixture must document known FAIL gaps matching contract" });
  }
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_probe",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${expectedFailCount}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

export interface PhaseEventSchemaProbeMatrixValidationIssue {
  kind:
    | "missing_result"
    | "unexpected_mismatch"
    | "pass_mismatch"
    | "gap_misaligned"
    | "criterion_mismatch"
    | "extra_result";
  probeId?: string;
  detail: string;
}

export interface PhaseEventSchemaProbeMatrixValidationResult {
  valid: boolean;
  issues: PhaseEventSchemaProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 * PASS probes must align; documented FAIL gaps must remain aligned (actual === FAIL).
 */
export function validatePhaseEventSchemaProbeMatrix(
  results: PhaseEventSchemaProbeResult[],
  contract: PhaseEventSchemaContract = getActivePhaseEventSchemaContract(),
): PhaseEventSchemaProbeMatrixValidationResult {
  const issues: PhaseEventSchemaProbeMatrixValidationIssue[] = [];
  const resultById = new Map(results.map(r => [r.id, r]));
  let passAligned = 0;
  let gapAligned = 0;
  let unexpectedMismatches = 0;

  for (const contractProbe of contract.probes) {
    const result = resultById.get(contractProbe.id);
    if (!result) {
      issues.push({
        kind: "missing_result",
        probeId: contractProbe.id,
        detail: `probe matrix missing ${contractProbe.id}`,
      });
      unexpectedMismatches++;
      continue;
    }

    if (result.criterion && result.criterion !== contractProbe.criterion) {
      issues.push({
        kind: "criterion_mismatch",
        probeId: contractProbe.id,
        detail: `criterion mismatch result=${result.criterion} contract=${contractProbe.criterion}`,
      });
      unexpectedMismatches++;
    }

    if (contractProbe.expected === "PASS") {
      if (result.aligned) {
        passAligned++;
      } else {
        issues.push({
          kind: "pass_mismatch",
          probeId: contractProbe.id,
          detail: `PASS probe misaligned: expected=${result.expected} actual=${result.actual} (${result.detail})`,
        });
        unexpectedMismatches++;
      }
    } else if (contractProbe.expected === "FAIL") {
      if (result.aligned && result.actual === "FAIL") {
        gapAligned++;
      } else {
        issues.push({
          kind: "gap_misaligned",
          probeId: contractProbe.id,
          detail: `documented FAIL gap misaligned: expected=${result.expected} actual=${result.actual} (${result.detail})`,
        });
        unexpectedMismatches++;
      }
    } else if (!result.aligned) {
      issues.push({
        kind: "unexpected_mismatch",
        probeId: contractProbe.id,
        detail: `unexpected mismatch: expected=${result.expected} actual=${result.actual}`,
      });
      unexpectedMismatches++;
    }
  }

  for (const result of results) {
    if (!contract.probes.some(p => p.id === result.id)) {
      issues.push({
        kind: "extra_result",
        probeId: result.id,
        detail: `probe matrix extra ${result.id}`,
      });
      unexpectedMismatches++;
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    passAligned,
    gapAligned,
    unexpectedMismatches,
  };
}

/**
 * Validate boundary-category probe matrix — A04 slice gate.
 * Only boundary probes are evaluated; zero unexpected mismatches required.
 */
export function validatePhaseEventSchemaBoundaryProbeMatrix(
  results: PhaseEventSchemaProbeResult[],
  contract: PhaseEventSchemaContract = getActivePhaseEventSchemaContract(),
): PhaseEventSchemaProbeMatrixValidationResult {
  const boundaryProbes = listPhaseEventSchemaProbesByCategory("boundary", contract);
  const boundaryContract: PhaseEventSchemaContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validatePhaseEventSchemaProbeMatrix(boundaryResults, boundaryContract);
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const PHASE_EVENT_SCHEMA_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly PhaseEventSchemaCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes and documented FAIL gaps must align; zero unexpected mismatches.
 */
export function validatePhaseEventSchemaFailureRecoveryProbeMatrix(
  results: PhaseEventSchemaProbeResult[],
  contract: PhaseEventSchemaContract = getActivePhaseEventSchemaContract(),
): PhaseEventSchemaProbeMatrixValidationResult {
  const failureRecoveryProbes = PHASE_EVENT_SCHEMA_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listPhaseEventSchemaProbesByCategory(category, contract),
  );
  const failureRecoveryContract: PhaseEventSchemaContract = {
    ...contract,
    probes: failureRecoveryProbes,
    categories: {
      ...contract.categories,
      failure_path: contract.categories.failure_path,
      recovery_path: contract.categories.recovery_path,
      nogo_path: contract.categories.nogo_path,
    },
  };
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  return validatePhaseEventSchemaProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listPhaseEventSchemaFailureRecoveryProbeIds(
  contract: PhaseEventSchemaContract = getActivePhaseEventSchemaContract(),
): string[] {
  return PHASE_EVENT_SCHEMA_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listPhaseEventSchemaProbesByCategory(category, contract).map(p => p.id),
  );
}

export function summarizePhaseEventSchemaMatrix(
  results: PhaseEventSchemaProbeResult[],
): PhaseEventSchemaProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as PhaseEventSchemaProbeSummary["byCategory"];
  for (const cat of PHASE_EVENT_SCHEMA_CATEGORIES) {
    byCategory[cat] = { total: 0, aligned: 0, expectedFail: 0 };
  }

  for (const result of results) {
    const bucket = byCategory[result.category];
    bucket.total++;
    if (result.aligned) bucket.aligned++;
    if (result.expected === "FAIL") bucket.expectedFail++;
  }

  return {
    total: results.length,
    aligned: results.length - mismatches.length,
    mismatches,
    knownGaps,
    byCategory,
  };
}

export function listPhaseEventSchemaProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  contract: PhaseEventSchemaContract = getActivePhaseEventSchemaContract(),
): PhaseEventSchemaProbeContract[] {
  return contract.probes.filter(p => p.expected === expected);
}

/** Per-probe evidence artifact — auditable proof of phase/event schema probe outcome (P01-B04-A06). */
export interface PhaseEventSchemaProbeEvidence {
  probeId: string;
  category: PhaseEventSchemaCategory;
  disposition: PhaseEventSchemaProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for phase/event schema runs (P01-B04-A06). */
export interface PhaseEventSchemaProbeTelemetry {
  probeId: string;
  category: PhaseEventSchemaCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P01-B04-A06). */
export interface PhaseEventSchemaProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourceFormalStateMachineVersion: string;
  sourceFormalStateMachineAtom: string;
  /** Slice atom when record covers a subset (e.g. failure/recovery gate). */
  sliceAtom?: string;
  /** Categories included when sliceAtom is set. */
  sliceCategories?: readonly PhaseEventSchemaCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated phase/event schema run record bundling evidence, telemetry and provenance. */
export interface PhaseEventSchemaRunRecord {
  provenance: PhaseEventSchemaProvenance;
  evidence: PhaseEventSchemaProbeEvidence[];
  telemetry: PhaseEventSchemaProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<PhaseEventSchemaCategory, number>;
    byDisposition: Record<PhaseEventSchemaProbeDisposition, number>;
  };
}

export interface PhaseEventSchemaRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface PhaseEventSchemaRunValidationResult {
  valid: boolean;
  issues: PhaseEventSchemaRunValidationIssue[];
}

export function buildPhaseEventSchemaProbeEvidence(
  probeId: string,
  category: PhaseEventSchemaCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: PhaseEventSchemaProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): PhaseEventSchemaProbeEvidence {
  return {
    probeId,
    category,
    disposition,
    expected,
    actual,
    aligned,
    criterion,
    detail,
    recordedAt,
  };
}

export function buildPhaseEventSchemaProbeTelemetry(
  probeId: string,
  category: PhaseEventSchemaCategory,
  sequenceIndex: number,
  durationMs: number,
): PhaseEventSchemaProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildPhaseEventSchemaProvenance(
  runId: string,
  fixture: PhaseEventSchemaFixture,
  contract: PhaseEventSchemaContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly PhaseEventSchemaCategory[];
  },
): PhaseEventSchemaProvenance {
  return {
    runId,
    harnessVersion: FORGE_PHASE_EVENT_SCHEMA_HARNESS_VERSION,
    contractVersion: contract.version,
    contractAtom: contract.atom,
    fixtureVersion: fixture.version,
    fixtureAtom: fixture.atom,
    sourceFormalStateMachineVersion: fixture.sourceFormalStateMachine.version,
    sourceFormalStateMachineAtom: fixture.sourceFormalStateMachine.atom,
    startedAt,
    completedAt,
    totalProbes,
    ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
    ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    ...(options?.gitCommit ? { gitCommit: options.gitCommit } : {}),
  };
}

export function buildPhaseEventSchemaRunRecord(
  provenance: PhaseEventSchemaProvenance,
  evidence: PhaseEventSchemaProbeEvidence[],
  telemetry: PhaseEventSchemaProbeTelemetry[],
): PhaseEventSchemaRunRecord {
  const byCategory = {} as Record<PhaseEventSchemaCategory, number>;
  const byDisposition: Record<PhaseEventSchemaProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of PHASE_EVENT_SCHEMA_CATEGORIES) {
    byCategory[category] = 0;
  }
  let aligned = 0;
  for (const item of evidence) {
    byCategory[item.category]++;
    byDisposition[item.disposition]++;
    if (item.aligned) aligned++;
  }
  return {
    provenance,
    evidence,
    telemetry,
    summary: {
      total: evidence.length,
      aligned,
      mismatches: evidence.length - aligned,
      byCategory,
      byDisposition,
    },
  };
}

function validatePhaseEventSchemaRunRecordAgainstProbeIds(
  record: PhaseEventSchemaRunRecord,
  expectedProbeIds: string[],
  contract: PhaseEventSchemaContract,
): PhaseEventSchemaRunValidationResult {
  const issues: PhaseEventSchemaRunValidationIssue[] = [];
  const expectedProbeCount = expectedProbeIds.length;

  if (record.provenance.totalProbes !== expectedProbeCount) {
    issues.push({
      kind: "provenance_mismatch",
      detail: `provenance.totalProbes=${record.provenance.totalProbes} expected=${expectedProbeCount}`,
    });
  }

  if (record.evidence.length !== expectedProbeCount) {
    issues.push({
      kind: "count_mismatch",
      detail: `evidence count=${record.evidence.length} expected=${expectedProbeCount}`,
    });
  }

  if (record.telemetry.length !== expectedProbeCount) {
    issues.push({
      kind: "count_mismatch",
      detail: `telemetry count=${record.telemetry.length} expected=${expectedProbeCount}`,
    });
  }

  const evidenceIds = new Set(record.evidence.map(e => e.probeId));
  const telemetryIds = new Set(record.telemetry.map(t => t.probeId));

  for (const probeId of expectedProbeIds) {
    if (!evidenceIds.has(probeId)) {
      issues.push({ kind: "missing_evidence", probeId, detail: `no evidence for ${probeId}` });
    }
    if (!telemetryIds.has(probeId)) {
      issues.push({ kind: "missing_telemetry", probeId, detail: `no telemetry for ${probeId}` });
    }
  }

  if (record.provenance.contractVersion !== contract.version) {
    issues.push({
      kind: "provenance_mismatch",
      detail: `contractVersion=${record.provenance.contractVersion} expected=${contract.version}`,
    });
  }

  for (const item of record.evidence) {
    if (!item.criterion || item.criterion.length === 0) {
      issues.push({
        kind: "missing_evidence",
        probeId: item.probeId,
        detail: `${item.probeId} evidence missing criterion provenance`,
      });
    }
  }

  for (const item of record.telemetry) {
    if (item.durationMs < 0 || !Number.isFinite(item.durationMs)) {
      issues.push({
        kind: "missing_telemetry",
        probeId: item.probeId,
        detail: `${item.probeId} telemetry durationMs=${item.durationMs}`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validatePhaseEventSchemaRunRecord(
  record: PhaseEventSchemaRunRecord,
  contract: PhaseEventSchemaContract = getActivePhaseEventSchemaContract(),
): PhaseEventSchemaRunValidationResult {
  return validatePhaseEventSchemaRunRecordAgainstProbeIds(
    record,
    listPhaseEventSchemaContractProbeIds(contract),
    contract,
  );
}

/** Validate failure/recovery slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validatePhaseEventSchemaFailureRecoveryRunRecord(
  record: PhaseEventSchemaRunRecord,
  contract: PhaseEventSchemaContract = getActivePhaseEventSchemaContract(),
): PhaseEventSchemaRunValidationResult {
  const issues: PhaseEventSchemaRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P01-B04-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P01-B04-A06`,
    });
  }

  const expectedCategories = [...PHASE_EVENT_SCHEMA_FAILURE_RECOVERY_CATEGORIES];
  const sliceCategories = record.provenance.sliceCategories ?? [];
  if (
    sliceCategories.length !== expectedCategories.length ||
    !expectedCategories.every(cat => sliceCategories.includes(cat))
  ) {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceCategories=${sliceCategories.join(",")} expected=${expectedCategories.join(",")}`,
    });
  }

  const probeValidation = validatePhaseEventSchemaRunRecordAgainstProbeIds(
    record,
    listPhaseEventSchemaFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

export interface PhaseEventSchemaProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare phase/event schema run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectPhaseEventSchemaProbeRegression(
  prior: PhaseEventSchemaRunRecord,
  current: PhaseEventSchemaRunRecord,
): PhaseEventSchemaProbeRegressionReport {
  const priorById = new Map(prior.evidence.map(item => [item.probeId, item]));
  const regressions: string[] = [];
  const fixed: string[] = [];
  const newMismatches: string[] = [];

  for (const item of current.evidence) {
    const previous = priorById.get(item.probeId);
    if (!previous) {
      newMismatches.push(item.probeId);
      continue;
    }
    if (previous.aligned && !item.aligned) {
      regressions.push(item.probeId);
    } else if (!previous.aligned && item.aligned) {
      fixed.push(item.probeId);
    } else if (!item.aligned) {
      newMismatches.push(item.probeId);
    }
  }

  const hasRegression =
    regressions.length > 0 || current.summary.mismatches > prior.summary.mismatches;
  const parts: string[] = [];
  if (regressions.length > 0) parts.push(`${regressions.length} probe regression(s)`);
  if (newMismatches.length > 0) parts.push(`${newMismatches.length} new mismatch(es)`);
  if (fixed.length > 0) parts.push(`${fixed.length} fixed`);
  if (parts.length === 0) parts.push("no alignment regression");

  return {
    hasRegression,
    regressions,
    fixed,
    newMismatches,
    summary: parts.join("; "),
  };
}

export function summarizePhaseEventSchemaTelemetry(
  telemetry: PhaseEventSchemaProbeTelemetry[],
): {
  suiteDurationMs: number;
  maxProbeDurationMs: number;
} {
  let suiteDurationMs = 0;
  let maxProbeDurationMs = 0;
  for (const item of telemetry) {
    suiteDurationMs += item.durationMs;
    if (item.durationMs > maxProbeDurationMs) maxProbeDurationMs = item.durationMs;
  }
  return { suiteDurationMs, maxProbeDurationMs };
}

/** Re-export for harness probe registry checks. */
export { FORGE_PIPELINE_CORE_PHASES };
