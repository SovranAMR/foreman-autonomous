/**
 * FOREMAN — Pipeline Invariant Engine Baseline (P01-B05)
 *
 * Measures orchestrator cross-cutting pipeline invariants.
 * Built on sealed P01-B04 typed phase/event schema artifacts.
 */

import type {
  ForgeAcceptanceOutcome,
  ForgeBlockAtomSeal,
  ForgeBlockGateCheck,
  ForgeBlockGateDefinition,
} from "./forge-baseline-contract.js";
import {
  getForgeP01B04ToB05Handoff,
  summarizePhaseEventSchemaContractCoverage,
  FORGE_PHASE_EVENT_SCHEMA_CONTRACT_V1,
  PHASE_EVENT_SCHEMA_CATEGORIES,
} from "./forge-phase-event-schema.js";

export const FORGE_PIPELINE_INVARIANT_ENGINE_HARNESS_VERSION = "1.0.0-a06";

export type PipelineInvariantEngineProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export const PIPELINE_INVARIANT_ENGINE_CATEGORIES = [
  "phase_lifecycle",
  "event_ordering",
  "reflection_cadence",
  "state_coherence",
  "block_halt",
  "verification_gate",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type PipelineInvariantEngineCategory = (typeof PIPELINE_INVARIANT_ENGINE_CATEGORIES)[number];

export interface PipelineInvariantEngineFixtureEntry {
  id: string;
  category: PipelineInvariantEngineCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface PipelineInvariantEngineFixture {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourcePhaseEventSchema: {
    version: string;
    atom: string;
    contractVersion: string;
    probeCount: number;
    schemaCategories: number;
  };
  probes: PipelineInvariantEngineFixtureEntry[];
}

export interface PipelineInvariantEngineProbeResult {
  id: string;
  category: PipelineInvariantEngineCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface PipelineInvariantEngineProbeSummary {
  total: number;
  aligned: number;
  mismatches: PipelineInvariantEngineProbeResult[];
  knownGaps: PipelineInvariantEngineProbeResult[];
  byCategory: Record<
    PipelineInvariantEngineCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface PipelineInvariantEngineFixtureValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: PipelineInvariantEngineCategory;
  detail: string;
}

export interface PipelineInvariantEngineFixtureValidationResult {
  valid: boolean;
  issues: PipelineInvariantEngineFixtureValidationIssue[];
}

export interface PipelineInvariantEngineProbeContract {
  id: string;
  category: PipelineInvariantEngineCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: PipelineInvariantEngineProbeDisposition;
  criterion: string;
}

export interface PipelineInvariantEngineCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface PipelineInvariantEngineCategoryContract {
  category: PipelineInvariantEngineCategory;
  acceptance: PipelineInvariantEngineCategoryAcceptance;
  probes: readonly PipelineInvariantEngineProbeContract[];
}

export interface PipelineInvariantEngineContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<PipelineInvariantEngineCategory, PipelineInvariantEngineCategoryContract>;
  probes: readonly PipelineInvariantEngineProbeContract[];
}

/** Minimum probes per category for A01 baseline slice. */
export const PIPELINE_INVARIANT_ENGINE_A01_MIN_PROBES: Readonly<
  Record<PipelineInvariantEngineCategory, number>
> = {
  phase_lifecycle: 3,
  event_ordering: 3,
  reflection_cadence: 3,
  state_coherence: 3,
  block_halt: 3,
  verification_gate: 3,
  baseline_link: 2,
  boundary: 3,
  failure_path: 3,
  recovery_path: 3,
  nogo_path: 3,
};

function flattenPipelineInvariantEngineCategoryProbes(
  categories: Record<PipelineInvariantEngineCategory, PipelineInvariantEngineCategoryContract>,
): readonly PipelineInvariantEngineProbeContract[] {
  return PIPELINE_INVARIANT_ENGINE_CATEGORIES.flatMap(category => categories[category].probes);
}

const PIPELINE_INVARIANT_ENGINE_CATEGORY_CONTRACTS: Record<
  PipelineInvariantEngineCategory,
  PipelineInvariantEngineCategoryContract
> = {
  phase_lifecycle: {
    category: "phase_lifecycle",
    acceptance: {
      invariant:
        "Orchestrator maintains balanced phase_start/phase_end emissions across core pipeline phases with runtime balance validation.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "inv.phase_start_end_present",
        category: "phase_lifecycle",
        description: "Orchestrator emits both phase_start and phase_end events",
        expected: "PASS",
        disposition: "observed",
        criterion: "orchestrator.ts emits phase_start and phase_end",
      },
      {
        id: "inv.core_phases_paired",
        category: "phase_lifecycle",
        description: "Core pipeline phases (vision, decompose, execute) have balanced start/end emissions",
        expected: "PASS",
        disposition: "observed",
        criterion: "vision/decompose/execute have balanced phase_start/phase_end",
      },
      {
        id: "inv.runtime_phase_balance_checker",
        category: "phase_lifecycle",
        description: "Orchestrator emit() validates phase_start/phase_end balance at runtime",
        expected: "FAIL",
        disposition: "gap",
        criterion: "emit() validates phase_start/phase_end balance at runtime",
      },
    ],
  },
  event_ordering: {
    category: "event_ordering",
    acceptance: {
      invariant:
        "Pipeline events follow typed ordering with pipeline_complete termination and verification gate emissions.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "inv.pipeline_complete_emitted",
        category: "event_ordering",
        description: "Orchestrator emits pipeline_complete at run termination",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator emits type: "pipeline_complete"',
      },
      {
        id: "inv.verification_events_wired",
        category: "event_ordering",
        description: "Forge verification gates emit typed verification events",
        expected: "PASS",
        disposition: "observed",
        criterion: "Forge verification gates emit typed verification events",
      },
      {
        id: "inv.event_order_validator",
        category: "event_ordering",
        description: "Runtime event sequence validator hooked to orchestrator emit()",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Runtime event sequence validator hooked to emit()",
      },
    ],
  },
  reflection_cadence: {
    category: "reflection_cadence",
    acceptance: {
      invariant:
        "Reflection phase emissions follow dynamic reflectInterval cadence with runtime invariant enforcement.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "inv.reflect_phase_emitted",
        category: "reflection_cadence",
        description: "Orchestrator emits reflect phase_start during atom batches",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator emits phase_start phase: "reflect"',
      },
      {
        id: "inv.reflect_interval_logic",
        category: "reflection_cadence",
        description: "Dynamic reflectInterval cadence logic exists in execute loop",
        expected: "PASS",
        disposition: "observed",
        criterion: "Dynamic reflectInterval cadence logic in execute loop",
      },
      {
        id: "inv.reflection_cadence_invariant",
        category: "reflection_cadence",
        description: "Pipeline invariant engine enforces reflection cadence at runtime",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Pipeline invariant engine enforces reflection cadence at runtime",
      },
    ],
  },
  state_coherence: {
    category: "state_coherence",
    acceptance: {
      invariant:
        "SystemState transitions align with active pipeline phase at start, end, and throughout execution.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "inv.state_transition_visioning",
        category: "state_coherence",
        description: "Orchestrator transitions SystemState to visioning at pipeline start",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator transitions SystemState to visioning at pipeline start",
      },
      {
        id: "inv.state_transition_complete",
        category: "state_coherence",
        description: "Orchestrator transitions SystemState to complete at pipeline end",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator transitions SystemState to complete at pipeline end",
      },
      {
        id: "inv.state_phase_coherence_checker",
        category: "state_coherence",
        description: "Runtime checker validates SystemState matches active pipeline phase",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Runtime checker validates SystemState matches active pipeline phase",
      },
    ],
  },
  block_halt: {
    category: "block_halt",
    acceptance: {
      invariant:
        "block_detected events halt forward progress with dedicated block-halt invariant module wired to emit().",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "inv.block_detected_event",
        category: "block_halt",
        description: "Orchestrator emits block_detected with typed payload",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator emits block_detected with typed payload",
      },
      {
        id: "inv.block_halts_forward",
        category: "block_halt",
        description: "block_detected emission halts forward pipeline progress",
        expected: "PASS",
        disposition: "observed",
        criterion: "block_detected emission halts forward pipeline progress",
      },
      {
        id: "inv.block_invariant_module",
        category: "block_halt",
        description: "Dedicated block-halt invariant module wired into orchestrator emit()",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Dedicated block-halt invariant module wired into emit()",
      },
    ],
  },
  verification_gate: {
    category: "verification_gate",
    acceptance: {
      invariant:
        "Forge verification regression and block gate exports validate before pipeline_complete.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "inv.verify_regression_exports",
        category: "verification_gate",
        description: "Orchestrator exports verifyForge*Regression gate methods",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator exports verifyForge*Regression gate methods",
      },
      {
        id: "inv.verify_block_gate_exports",
        category: "verification_gate",
        description: "Orchestrator exports verifyForge*BlockGate gate methods",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator exports verifyForge*BlockGate gate methods",
      },
      {
        id: "inv.verification_gate_invariant",
        category: "verification_gate",
        description: "Invariant engine validates verification gate ordering before pipeline_complete",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Invariant engine validates verification gate ordering before pipeline_complete",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Pipeline invariant engine aligns with sealed P01-B04 phase/event schema handoff artifacts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "inv.b04_handoff_target",
        category: "baseline_link",
        description: "FORGE_P01_B04_TO_B05_HANDOFF_V1 targets P01-B05-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "B04→B05 handoff entry atom is P01-B05-A01",
      },
      {
        id: "inv.b04_schema_sealed",
        category: "baseline_link",
        description: "Sealed B04 phase/event schema probe count matches handoff artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Sealed B04 handoff probe count matches active phase/event schema contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Orchestrator boundary gates cover empty vision, format_retry validation, and invariant engine wiring.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "inv.error_on_empty_vision",
        category: "boundary",
        description: "Orchestrator emits error when vision phase returns empty output",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator emits error when vision phase returns empty output",
      },
      {
        id: "inv.format_retry_handling",
        category: "boundary",
        description: "Orchestrator handles format_retry as validation NO-GO gate",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator handles format_retry as validation NO-GO gate",
      },
      {
        id: "inv.invariant_engine_orchestrator_wired",
        category: "boundary",
        description: "Orchestrator imports and wires pipeline invariant engine for live validation",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator imports and wires pipeline invariant engine for live validation",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant:
        "Pipeline invariant probes cover block_detected halt, atom-exhaust recovery queue, and runtime invariant validation on failure paths.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "inv.failure_block_halt_invariant",
        category: "failure_path",
        description: "block_detected halts forward progress preserving pipeline invariant state",
        expected: "PASS",
        disposition: "failure",
        criterion: "block_detected emission halts forward pipeline without premature pipeline_complete",
      },
      {
        id: "inv.failure_error_recovery_queue",
        category: "failure_path",
        description: "Atom exhaust emits error and queues recovery without breaking invariants",
        expected: "PASS",
        disposition: "failure",
        criterion: "MAX_ATOM_RETRIES exhaustion emits error and queues recovery",
      },
      {
        id: "inv.failure_invariant_engine_on_block",
        category: "failure_path",
        description: "Pipeline invariant engine validates cross-cutting invariants on block_detected path",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Invariant engine validates state on block_detected emission",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Recovery phase events maintain phase balance, queue clearing, and runtime invariant validation on recovery paths.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "inv.recovery_phase_events_balanced",
        category: "recovery_path",
        description: "runRecoveryPhase emits balanced recovery phase_start and phase_end events",
        expected: "PASS",
        disposition: "recovery",
        criterion: 'runRecoveryPhase emits phaseStart/phaseEnd for "recovery" phase',
      },
      {
        id: "inv.recovery_re_decompose_wired",
        category: "recovery_path",
        description: "re_decompose phase wired on block failure threshold for replan recovery",
        expected: "PASS",
        disposition: "recovery",
        criterion: 'orchestrator calls phaseStart("re_decompose") after block failure threshold',
      },
      {
        id: "inv.recovery_invariant_engine_wired",
        category: "recovery_path",
        description: "Pipeline invariant engine validates recovery phase transition invariants",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Invariant engine validates recovery phase transitions at runtime",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "NO-GO gates enforce reviewer REJECT rollback, format_retry validation, and runtime invariant rejection ordering.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "inv.nogo_reviewer_reject_rollback",
        category: "nogo_path",
        description: "Reviewer REJECT verdict triggers rollback before atom retry (NO-GO gate)",
        expected: "PASS",
        disposition: "nogo",
        criterion: 'reviewResult.verdict === "REJECT" triggers rollbackLastAtom before retry',
      },
      {
        id: "inv.nogo_format_retry_gate",
        category: "nogo_path",
        description: "format_retry acts as validation NO-GO gate before atom re-execution",
        expected: "PASS",
        disposition: "nogo",
        criterion: "format_retry emitted with attempt and missing fields before atom retry",
      },
      {
        id: "inv.nogo_invariant_on_reject",
        category: "nogo_path",
        description: "Pipeline invariant engine enforces NO-GO ordering on reviewer REJECT path",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Invariant engine validates NO-GO ordering on reviewer REJECT",
      },
    ],
  },
};

/** Typed pipeline invariant engine contract v1 — source of truth for cross-cutting acceptance. */
export const FORGE_PIPELINE_INVARIANT_ENGINE_CONTRACT_V1: PipelineInvariantEngineContract = {
  version: "1.0.0",
  atom: "P01-B05-A05",
  purpose:
    "Measurable acceptance criteria for orchestrator cross-cutting pipeline invariants (phase lifecycle, event ordering, reflection cadence, state coherence, block halt, verification gate, B04 link, boundary).",
  categories: PIPELINE_INVARIANT_ENGINE_CATEGORY_CONTRACTS,
  probes: flattenPipelineInvariantEngineCategoryProbes(PIPELINE_INVARIANT_ENGINE_CATEGORY_CONTRACTS),
};

export function getActivePipelineInvariantEngineContract(): PipelineInvariantEngineContract {
  return FORGE_PIPELINE_INVARIANT_ENGINE_CONTRACT_V1;
}

export function getPipelineInvariantEngineCategoryContract(
  category: PipelineInvariantEngineCategory,
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
): PipelineInvariantEngineCategoryContract {
  return contract.categories[category];
}

export function listPipelineInvariantEngineContractProbeIds(
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listPipelineInvariantEngineProbesByDisposition(
  disposition: PipelineInvariantEngineProbeDisposition,
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
): PipelineInvariantEngineProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listPipelineInvariantEngineProbesByCategory(
  category: PipelineInvariantEngineCategory,
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
): PipelineInvariantEngineProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizePipelineInvariantEngineContractCoverage(
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<PipelineInvariantEngineCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<PipelineInvariantEngineProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    PipelineInvariantEngineCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<PipelineInvariantEngineProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of PIPELINE_INVARIANT_ENGINE_CATEGORIES) {
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

export function buildDefaultPipelineInvariantEngineSourcePhaseEventSchema(): PipelineInvariantEngineFixture["sourcePhaseEventSchema"] {
  const coverage = summarizePhaseEventSchemaContractCoverage(FORGE_PHASE_EVENT_SCHEMA_CONTRACT_V1);
  return {
    version: "1.0.0",
    atom: "P01-B04-A10",
    contractVersion: FORGE_PHASE_EVENT_SCHEMA_CONTRACT_V1.version,
    probeCount: coverage.totalProbes,
    schemaCategories: PHASE_EVENT_SCHEMA_CATEGORIES.length,
  };
}

export function validatePipelineInvariantEngineFixture(
  fixture: PipelineInvariantEngineFixture,
): PipelineInvariantEngineFixtureValidationResult {
  const issues: PipelineInvariantEngineFixtureValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P01-B05-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory: Record<PipelineInvariantEngineCategory, number> = {
    phase_lifecycle: 0,
    event_ordering: 0,
    reflection_cadence: 0,
    state_coherence: 0,
    block_halt: 0,
    verification_gate: 0,
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

  for (const category of PIPELINE_INVARIANT_ENGINE_CATEGORIES) {
    const min = PIPELINE_INVARIANT_ENGINE_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP01B04ToB05Handoff();
  if (fixture.sourcePhaseEventSchema.probeCount !== handoff.sealedArtifacts.probeCount) {
    issues.push({
      kind: "missing_probe",
      detail: `sourcePhaseEventSchema.probeCount=${fixture.sourcePhaseEventSchema.probeCount} handoff=${handoff.sealedArtifacts.probeCount}`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length < 1) {
    issues.push({
      kind: "missing_category",
      detail: "A01 fixture must document at least one known FAIL gap",
    });
  }

  return { valid: issues.length === 0, issues };
}

export function summarizePipelineInvariantEngineMatrix(
  results: PipelineInvariantEngineProbeResult[],
): PipelineInvariantEngineProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as PipelineInvariantEngineProbeSummary["byCategory"];
  for (const cat of PIPELINE_INVARIANT_ENGINE_CATEGORIES) {
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

export function listPipelineInvariantEngineProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: PipelineInvariantEngineFixture,
): PipelineInvariantEngineFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function validatePipelineInvariantEngineFixtureAgainstContract(
  fixture: PipelineInvariantEngineFixture,
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
): PipelineInvariantEngineFixtureValidationResult {
  const issues: PipelineInvariantEngineFixtureValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of PIPELINE_INVARIANT_ENGINE_CATEGORIES) {
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

export interface PipelineInvariantEngineProbeMatrixValidationIssue {
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

export interface PipelineInvariantEngineProbeMatrixValidationResult {
  valid: boolean;
  issues: PipelineInvariantEngineProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 * PASS probes must align; documented FAIL gaps must remain aligned (actual === FAIL).
 */
export function validatePipelineInvariantEngineProbeMatrix(
  results: PipelineInvariantEngineProbeResult[],
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
): PipelineInvariantEngineProbeMatrixValidationResult {
  const issues: PipelineInvariantEngineProbeMatrixValidationIssue[] = [];
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
export function validatePipelineInvariantEngineBoundaryProbeMatrix(
  results: PipelineInvariantEngineProbeResult[],
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
): PipelineInvariantEngineProbeMatrixValidationResult {
  const boundaryProbes = listPipelineInvariantEngineProbesByCategory("boundary", contract);
  const boundaryContract: PipelineInvariantEngineContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validatePipelineInvariantEngineProbeMatrix(boundaryResults, boundaryContract);
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const PIPELINE_INVARIANT_ENGINE_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly PipelineInvariantEngineCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes and documented FAIL gaps must align; zero unexpected mismatches.
 */
export function validatePipelineInvariantEngineFailureRecoveryProbeMatrix(
  results: PipelineInvariantEngineProbeResult[],
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
): PipelineInvariantEngineProbeMatrixValidationResult {
  const failureRecoveryProbes = PIPELINE_INVARIANT_ENGINE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listPipelineInvariantEngineProbesByCategory(category, contract),
  );
  const failureRecoveryContract: PipelineInvariantEngineContract = {
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
  return validatePipelineInvariantEngineProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listPipelineInvariantEngineFailureRecoveryProbeIds(
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
): string[] {
  return PIPELINE_INVARIANT_ENGINE_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listPipelineInvariantEngineProbesByCategory(category, contract).map(p => p.id),
  );
}

/** Per-probe evidence artifact — auditable proof of invariant engine probe outcome (P01-B05-A06). */
export interface PipelineInvariantEngineProbeEvidence {
  probeId: string;
  category: PipelineInvariantEngineCategory;
  disposition: PipelineInvariantEngineProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for invariant engine runs (P01-B05-A06). */
export interface PipelineInvariantEngineProbeTelemetry {
  probeId: string;
  category: PipelineInvariantEngineCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P01-B05-A06). */
export interface PipelineInvariantEngineProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourcePhaseEventSchemaVersion: string;
  sourcePhaseEventSchemaAtom: string;
  /** Slice atom when record covers a subset (e.g. failure/recovery gate). */
  sliceAtom?: string;
  /** Categories included when sliceAtom is set. */
  sliceCategories?: readonly PipelineInvariantEngineCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated pipeline invariant engine run record bundling evidence, telemetry and provenance. */
export interface PipelineInvariantEngineRunRecord {
  provenance: PipelineInvariantEngineProvenance;
  evidence: PipelineInvariantEngineProbeEvidence[];
  telemetry: PipelineInvariantEngineProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<PipelineInvariantEngineCategory, number>;
    byDisposition: Record<PipelineInvariantEngineProbeDisposition, number>;
  };
}

export interface PipelineInvariantEngineRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface PipelineInvariantEngineRunValidationResult {
  valid: boolean;
  issues: PipelineInvariantEngineRunValidationIssue[];
}

export function buildPipelineInvariantEngineProbeEvidence(
  probeId: string,
  category: PipelineInvariantEngineCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: PipelineInvariantEngineProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): PipelineInvariantEngineProbeEvidence {
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

export function buildPipelineInvariantEngineProbeTelemetry(
  probeId: string,
  category: PipelineInvariantEngineCategory,
  sequenceIndex: number,
  durationMs: number,
): PipelineInvariantEngineProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildPipelineInvariantEngineProvenance(
  runId: string,
  fixture: PipelineInvariantEngineFixture,
  contract: PipelineInvariantEngineContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly PipelineInvariantEngineCategory[];
  },
): PipelineInvariantEngineProvenance {
  return {
    runId,
    harnessVersion: FORGE_PIPELINE_INVARIANT_ENGINE_HARNESS_VERSION,
    contractVersion: contract.version,
    contractAtom: contract.atom,
    fixtureVersion: fixture.version,
    fixtureAtom: fixture.atom,
    sourcePhaseEventSchemaVersion: fixture.sourcePhaseEventSchema.version,
    sourcePhaseEventSchemaAtom: fixture.sourcePhaseEventSchema.atom,
    startedAt,
    completedAt,
    totalProbes,
    ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
    ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    ...(options?.gitCommit ? { gitCommit: options.gitCommit } : {}),
  };
}

export function buildPipelineInvariantEngineRunRecord(
  provenance: PipelineInvariantEngineProvenance,
  evidence: PipelineInvariantEngineProbeEvidence[],
  telemetry: PipelineInvariantEngineProbeTelemetry[],
): PipelineInvariantEngineRunRecord {
  const byCategory = {} as Record<PipelineInvariantEngineCategory, number>;
  const byDisposition: Record<PipelineInvariantEngineProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of PIPELINE_INVARIANT_ENGINE_CATEGORIES) {
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

function validatePipelineInvariantEngineRunRecordAgainstProbeIds(
  record: PipelineInvariantEngineRunRecord,
  expectedProbeIds: string[],
  contract: PipelineInvariantEngineContract,
): PipelineInvariantEngineRunValidationResult {
  const issues: PipelineInvariantEngineRunValidationIssue[] = [];
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

  return { valid: issues.length === 0, issues };
}

export function validatePipelineInvariantEngineRunRecord(
  record: PipelineInvariantEngineRunRecord,
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
): PipelineInvariantEngineRunValidationResult {
  return validatePipelineInvariantEngineRunRecordAgainstProbeIds(
    record,
    listPipelineInvariantEngineContractProbeIds(contract),
    contract,
  );
}

/** Validate failure/recovery slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validatePipelineInvariantEngineFailureRecoveryRunRecord(
  record: PipelineInvariantEngineRunRecord,
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
): PipelineInvariantEngineRunValidationResult {
  const issues: PipelineInvariantEngineRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P01-B05-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P01-B05-A06`,
    });
  }

  const expectedCategories = [...PIPELINE_INVARIANT_ENGINE_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validatePipelineInvariantEngineRunRecordAgainstProbeIds(
    record,
    listPipelineInvariantEngineFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

export interface PipelineInvariantEngineProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare pipeline invariant engine run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectPipelineInvariantEngineProbeRegression(
  prior: PipelineInvariantEngineRunRecord,
  current: PipelineInvariantEngineRunRecord,
): PipelineInvariantEngineProbeRegressionReport {
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

export interface PipelineInvariantEnginePropertyViolation {
  propertyId: string;
  detail: string;
}

export interface PipelineInvariantEnginePropertyResult {
  passed: number;
  failed: PipelineInvariantEnginePropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type PipelineInvariantEnginePropertyCheck = {
  id: string;
  description: string;
  check: (contract: PipelineInvariantEngineContract) => string | null;
};

const PIPELINE_INVARIANT_ENGINE_STRUCTURAL_PROPERTIES: readonly PipelineInvariantEnginePropertyCheck[] = [
  {
    id: "categories_complete",
    description: "All eleven pipeline invariant categories are declared",
    check: contract => {
      for (const category of PIPELINE_INVARIANT_ENGINE_CATEGORIES) {
        if (!contract.categories[category]) return `missing category: ${category}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listPipelineInvariantEngineContractProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each category meets contract minProbeCount",
    check: contract => {
      for (const category of PIPELINE_INVARIANT_ENGINE_CATEGORIES) {
        const categoryContract = contract.categories[category];
        if (categoryContract.probes.length < categoryContract.acceptance.minProbeCount) {
          return `${category} has ${categoryContract.probes.length} probes; requires >= ${categoryContract.acceptance.minProbeCount}`;
        }
      }
      return null;
    },
  },
  {
    id: "criterion_measurable",
    description: "Every probe declares a measurable criterion",
    check: contract => {
      for (const probe of contract.probes) {
        if (probe.criterion.trim().length <= 10) {
          return `${probe.id} criterion too short`;
        }
      }
      return null;
    },
  },
  {
    id: "coverage_consistent",
    description:
      "summarizePipelineInvariantEngineContractCoverage totals match listPipelineInvariantEngineContractProbeIds",
    check: contract => {
      const summary = summarizePipelineInvariantEngineContractCoverage(contract);
      const ids = listPipelineInvariantEngineContractProbeIds(contract);
      if (summary.totalProbes !== ids.length) {
        return `totalProbes=${summary.totalProbes} ids=${ids.length}`;
      }
      const dispositionSum =
        summary.byDisposition.observed +
        summary.byDisposition.gap +
        summary.byDisposition.failure +
        summary.byDisposition.recovery +
        summary.byDisposition.nogo;
      if (dispositionSum !== summary.totalProbes) {
        return `disposition sum=${dispositionSum} total=${summary.totalProbes}`;
      }
      return null;
    },
  },
  {
    id: "probe_id_prefix",
    description: "Probe ids are namespaced with inv. prefix",
    check: contract => {
      for (const probe of contract.probes) {
        if (!probe.id.startsWith("inv.")) {
          return `${probe.id} missing inv. prefix`;
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const probeIds = listPipelineInvariantEngineContractProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildPipelineInvariantEngineProbeEvidence(
          id,
          probe.category,
          probe.expected,
          probe.expected,
          true,
          probe.criterion,
          "synthetic",
          probe.disposition,
        );
      });
      const telemetry = probeIds.map((id, index) => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildPipelineInvariantEngineProbeTelemetry(id, probe.category, index, index);
      });
      const record = buildPipelineInvariantEngineRunRecord(
        buildPipelineInvariantEngineProvenance(
          "property-check",
          {
            version: "0",
            atom: "x",
            purpose: "x",
            sourcePhaseEventSchema: buildDefaultPipelineInvariantEngineSourcePhaseEventSchema(),
            probes: [],
          },
          contract,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:01.000Z",
          probeIds.length,
        ),
        evidence,
        telemetry,
      );
      if (record.summary.aligned + record.summary.mismatches !== record.summary.total) {
        return `aligned(${record.summary.aligned}) + mismatches(${record.summary.mismatches}) != total(${record.summary.total})`;
      }
      return null;
    },
  },
] as const;

export function runPipelineInvariantEnginePropertyChecks(
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
): PipelineInvariantEnginePropertyResult {
  const failed: PipelineInvariantEnginePropertyViolation[] = [];
  for (const property of PIPELINE_INVARIANT_ENGINE_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = PIPELINE_INVARIANT_ENGINE_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type PipelineInvariantEngineFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface PipelineInvariantEngineFuzzMutationCase {
  seed: number;
  kind: PipelineInvariantEngineFuzzMutationKind;
  probeId?: string;
  category?: PipelineInvariantEngineCategory;
}

export interface PipelineInvariantEngineFuzzValidationCaseResult {
  mutation: PipelineInvariantEngineFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface PipelineInvariantEngineFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: PipelineInvariantEngineFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createPipelineInvariantEngineFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clonePipelineInvariantEngineFixture(fixture: PipelineInvariantEngineFixture): PipelineInvariantEngineFixture {
  return {
    ...fixture,
    sourcePhaseEventSchema: { ...fixture.sourcePhaseEventSchema },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickPipelineInvariantEngineFuzzTarget(
  fixture: PipelineInvariantEngineFixture,
  rng: () => number,
): { category: PipelineInvariantEngineCategory; index: number; entry: PipelineInvariantEngineFixtureEntry } {
  const category =
    PIPELINE_INVARIANT_ENGINE_CATEGORIES[Math.floor(rng() * PIPELINE_INVARIANT_ENGINE_CATEGORIES.length)]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyPipelineInvariantEngineFuzzMutation(
  fixture: PipelineInvariantEngineFixture,
  mutation: PipelineInvariantEngineFuzzMutationCase,
): PipelineInvariantEngineFixture {
  const mutated = clonePipelineInvariantEngineFixture(fixture);
  const targetCategory = mutation.category ?? PIPELINE_INVARIANT_ENGINE_CATEGORIES[0]!;
  const categoryEntries = mutated.probes.filter(p => p.category === targetCategory);

  switch (mutation.kind) {
    case "flip_expected": {
      const probeId = mutation.probeId ?? categoryEntries[0]!.id;
      const entry = mutated.probes.find(e => e.id === probeId) ?? categoryEntries[0]!;
      entry.expected = entry.expected === "PASS" ? "FAIL" : "PASS";
      break;
    }
    case "drop_probe": {
      const probeId = mutation.probeId ?? categoryEntries[0]!.id;
      mutated.probes = mutated.probes.filter(e => e.id !== probeId);
      break;
    }
    case "extra_probe":
      mutated.probes = [
        ...mutated.probes,
        {
          id: `inv.fuzz.extra.${mutation.seed}`,
          category: targetCategory,
          description: "synthetic extra probe",
          expected: "PASS",
        },
      ];
      break;
    case "rename_probe": {
      const probeId = mutation.probeId ?? categoryEntries[0]!.id;
      const entry = mutated.probes.find(e => e.id === probeId) ?? categoryEntries[0]!;
      entry.id = `${entry.id}.fuzz_${mutation.seed}`;
      break;
    }
    case "flip_category": {
      const probeId = mutation.probeId ?? categoryEntries[0]!.id;
      const entry = mutated.probes.find(e => e.id === probeId) ?? categoryEntries[0]!;
      const other = PIPELINE_INVARIANT_ENGINE_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generatePipelineInvariantEngineFuzzMutationCases(
  fixture: PipelineInvariantEngineFixture,
  seed: number,
  iterations: number,
): PipelineInvariantEngineFuzzMutationCase[] {
  const rng = createPipelineInvariantEngineFuzzRng(seed);
  const kinds: PipelineInvariantEngineFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: PipelineInvariantEngineFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickPipelineInvariantEngineFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P01-B05-A07). */
export function runPipelineInvariantEngineFuzzValidation(
  fixture: PipelineInvariantEngineFixture,
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
  seed = 42,
  iterations = 24,
): PipelineInvariantEngineFuzzValidationResult {
  const cases = generatePipelineInvariantEngineFuzzMutationCases(fixture, seed, iterations);
  const results: PipelineInvariantEngineFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyPipelineInvariantEngineFuzzMutation(fixture, mutation);
    const validation = validatePipelineInvariantEngineFixtureAgainstContract(mutated, contract);
    if (validation.valid) accepted++;
    else rejected++;
    results.push({
      mutation,
      valid: validation.valid,
      issueKinds: [...new Set(validation.issues.map(i => i.kind))],
    });
  }

  return {
    seed,
    iterations,
    rejected,
    accepted,
    cases: results,
    allMutationsRejected: accepted === 0,
  };
}

export type PipelineInvariantEngineRunRecordFuzzKind = "drop_evidence" | "drop_telemetry" | "wrong_total";

export interface PipelineInvariantEngineRunRecordFuzzCase {
  kind: PipelineInvariantEngineRunRecordFuzzKind;
  probeId?: string;
}

export function applyPipelineInvariantEngineRunRecordFuzzMutation(
  record: PipelineInvariantEngineRunRecord,
  mutation: PipelineInvariantEngineRunRecordFuzzCase,
): PipelineInvariantEngineRunRecord {
  const cloned: PipelineInvariantEngineRunRecord = {
    provenance: { ...record.provenance },
    evidence: record.evidence.map(item => ({ ...item })),
    telemetry: record.telemetry.map(item => ({ ...item })),
    summary: {
      ...record.summary,
      byCategory: { ...record.summary.byCategory },
      byDisposition: { ...record.summary.byDisposition },
    },
  };

  switch (mutation.kind) {
    case "drop_evidence": {
      const probeId = mutation.probeId ?? cloned.evidence[0]?.probeId;
      cloned.evidence = cloned.evidence.filter(item => item.probeId !== probeId);
      break;
    }
    case "drop_telemetry": {
      const probeId = mutation.probeId ?? cloned.telemetry[0]?.probeId;
      cloned.telemetry = cloned.telemetry.filter(item => item.probeId !== probeId);
      break;
    }
    case "wrong_total":
      cloned.provenance = { ...cloned.provenance, totalProbes: cloned.provenance.totalProbes + 1 };
      break;
  }

  cloned.summary = buildPipelineInvariantEngineRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

export function runPipelineInvariantEngineRunRecordFuzzValidation(
  record: PipelineInvariantEngineRunRecord,
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const baseline = validatePipelineInvariantEngineRunRecord(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: PipelineInvariantEngineRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyPipelineInvariantEngineRunRecordFuzzMutation(record, mutation);
    const validation = validatePipelineInvariantEngineRunRecord(mutated, contract);
    if (validation.valid) mutationsAccepted++;
    else mutationsRejected++;
  }

  return {
    validBaseline: baseline.valid,
    mutationsRejected,
    mutationsAccepted,
  };
}

// ─── Guard controls (P01-B05-A09 foundation, used by A08 regression gate) ──

export interface ForgePipelineInvariantEngineGuardControls {
  atom: string;
  adversarial: {
    rejectTamperedRecords: true;
    rejectFalseAlignment: true;
    rejectSummaryEvidenceMismatch: true;
  };
  performance: {
    maxSuiteDurationMs: number;
    maxProbeDurationMs: number;
    maxWallClockMs: number;
  };
  cost: {
    maxTotalCostUsd: number;
    maxLlmCalls: number;
  };
  safety: {
    maxDetailLength: number;
    forbiddenPatterns: readonly RegExp[];
  };
}

export interface PipelineInvariantEngineGuardCheckIssue {
  domain: "adversarial" | "performance" | "cost" | "safety";
  code: string;
  detail: string;
}

export interface PipelineInvariantEngineGuardCheckResult {
  passed: boolean;
  issues: PipelineInvariantEngineGuardCheckIssue[];
  metrics: {
    suiteDurationMs: number;
    wallClockMs: number;
    maxProbeDurationMs: number;
    totalCostUsd: number;
    llmCalls: number;
    adversarialScenariosRejected: number;
    adversarialScenariosTotal: number;
  };
}

export interface PipelineInvariantEngineAdversarialGuardScenario {
  id: string;
  description: string;
  build: (record: PipelineInvariantEngineRunRecord) => PipelineInvariantEngineRunRecord;
  expectRejected: true;
}

export const FORGE_PIPELINE_INVARIANT_ENGINE_GUARD_CONTROLS_V1: ForgePipelineInvariantEngineGuardControls = {
  atom: "P01-B05-A09",
  adversarial: {
    rejectTamperedRecords: true,
    rejectFalseAlignment: true,
    rejectSummaryEvidenceMismatch: true,
  },
  performance: {
    maxSuiteDurationMs: 30_000,
    maxProbeDurationMs: 5_000,
    maxWallClockMs: 45_000,
  },
  cost: {
    maxTotalCostUsd: 0,
    maxLlmCalls: 0,
  },
  safety: {
    maxDetailLength: 4096,
    forbiddenPatterns: [
      /sk-[a-zA-Z0-9]{20,}/,
      /api[_-]?key\s*[:=]\s*\S+/i,
      /Bearer\s+[a-zA-Z0-9._-]{20,}/i,
      /password\s*[:=]\s*\S+/i,
      /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
    ],
  },
};

export function getForgePipelineInvariantEngineGuardControls(): ForgePipelineInvariantEngineGuardControls {
  return FORGE_PIPELINE_INVARIANT_ENGINE_GUARD_CONTROLS_V1;
}

function parsePipelineInvariantEngineIsoDurationMs(startedAt: string, completedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function summarizePipelineInvariantEngineTelemetry(
  telemetry: PipelineInvariantEngineProbeTelemetry[],
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

export function detectPipelineInvariantEngineEvidenceSummaryMismatch(
  record: PipelineInvariantEngineRunRecord,
): string | null {
  let alignedCount = 0;
  for (const item of record.evidence) {
    if (item.aligned) alignedCount++;
  }
  const mismatches = record.evidence.length - alignedCount;
  if (record.summary.aligned !== alignedCount) {
    return `summary.aligned=${record.summary.aligned} evidence=${alignedCount}`;
  }
  if (record.summary.mismatches !== mismatches) {
    return `summary.mismatches=${record.summary.mismatches} evidence=${mismatches}`;
  }
  if (record.summary.total !== record.evidence.length) {
    return `summary.total=${record.summary.total} evidence=${record.evidence.length}`;
  }
  return null;
}

export function detectPipelineInvariantEngineFalseAlignment(
  record: PipelineInvariantEngineRunRecord,
): string[] {
  const violations: string[] = [];
  for (const item of record.evidence) {
    const shouldAlign = item.actual === item.expected;
    if (item.aligned !== shouldAlign) {
      violations.push(`${item.probeId}: aligned=${item.aligned} actual=${item.actual} expected=${item.expected}`);
    }
    if (item.aligned && item.actual !== item.expected) {
      violations.push(`${item.probeId}: false PASS claim`);
    }
  }
  return violations;
}

export function validatePipelineInvariantEngineSafety(
  record: PipelineInvariantEngineRunRecord,
  controls: ForgePipelineInvariantEngineGuardControls = getForgePipelineInvariantEngineGuardControls(),
): PipelineInvariantEngineGuardCheckIssue[] {
  const issues: PipelineInvariantEngineGuardCheckIssue[] = [];
  for (const item of record.evidence) {
    if (item.detail.length > controls.safety.maxDetailLength) {
      issues.push({
        domain: "safety",
        code: "detail_too_long",
        detail: `${item.probeId} detail length=${item.detail.length}`,
      });
    }
    for (const pattern of controls.safety.forbiddenPatterns) {
      if (pattern.test(item.detail) || pattern.test(item.criterion)) {
        issues.push({
          domain: "safety",
          code: "forbidden_pattern",
          detail: `${item.probeId} matched ${pattern.source}`,
        });
      }
    }
  }
  return issues;
}

export function validatePipelineInvariantEnginePerformance(
  record: PipelineInvariantEngineRunRecord,
  controls: ForgePipelineInvariantEngineGuardControls = getForgePipelineInvariantEngineGuardControls(),
): PipelineInvariantEngineGuardCheckIssue[] {
  const issues: PipelineInvariantEngineGuardCheckIssue[] = [];
  const { suiteDurationMs, maxProbeDurationMs } = summarizePipelineInvariantEngineTelemetry(record.telemetry);
  const wallClockMs = parsePipelineInvariantEngineIsoDurationMs(
    record.provenance.startedAt,
    record.provenance.completedAt,
  );

  if (suiteDurationMs > controls.performance.maxSuiteDurationMs) {
    issues.push({
      domain: "performance",
      code: "suite_duration_exceeded",
      detail: `${suiteDurationMs}ms > ${controls.performance.maxSuiteDurationMs}ms`,
    });
  }
  if (maxProbeDurationMs > controls.performance.maxProbeDurationMs) {
    issues.push({
      domain: "performance",
      code: "probe_duration_exceeded",
      detail: `${maxProbeDurationMs}ms > ${controls.performance.maxProbeDurationMs}ms`,
    });
  }
  if (wallClockMs > controls.performance.maxWallClockMs) {
    issues.push({
      domain: "performance",
      code: "wall_clock_exceeded",
      detail: `${wallClockMs}ms > ${controls.performance.maxWallClockMs}ms`,
    });
  }
  return issues;
}

export function validatePipelineInvariantEngineCost(
  totalCostUsd: number,
  llmCalls: number,
  controls: ForgePipelineInvariantEngineGuardControls = getForgePipelineInvariantEngineGuardControls(),
): PipelineInvariantEngineGuardCheckIssue[] {
  const issues: PipelineInvariantEngineGuardCheckIssue[] = [];
  if (totalCostUsd > controls.cost.maxTotalCostUsd) {
    issues.push({
      domain: "cost",
      code: "cost_exceeded",
      detail: `$${totalCostUsd.toFixed(4)} > $${controls.cost.maxTotalCostUsd}`,
    });
  }
  if (llmCalls > controls.cost.maxLlmCalls) {
    issues.push({
      domain: "cost",
      code: "llm_calls_exceeded",
      detail: `${llmCalls} > ${controls.cost.maxLlmCalls}`,
    });
  }
  return issues;
}

export function buildPipelineInvariantEngineAdversarialGuardScenarios(): PipelineInvariantEngineAdversarialGuardScenario[] {
  return [
    {
      id: "adversarial.false_alignment_claim",
      description: "Evidence claims aligned while actual !== expected",
      expectRejected: true,
      build: record => {
        const cloned = structuredClone(record);
        const target = cloned.evidence[0];
        if (!target) return cloned;
        target.aligned = true;
        target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
        return cloned;
      },
    },
    {
      id: "adversarial.summary_mismatch",
      description: "Summary reports zero mismatches while evidence is tampered",
      expectRejected: true,
      build: record => {
        const cloned = structuredClone(record);
        const target = cloned.evidence[0];
        if (!target) return cloned;
        target.aligned = false;
        target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
        cloned.summary = { ...cloned.summary, aligned: cloned.summary.total, mismatches: 0 };
        return cloned;
      },
    },
    {
      id: "adversarial.dropped_probe",
      description: "Run record omits required probe evidence",
      expectRejected: true,
      build: record => {
        const cloned = structuredClone(record);
        cloned.evidence = cloned.evidence.slice(1);
        cloned.telemetry = cloned.telemetry.slice(1);
        cloned.summary = {
          ...cloned.summary,
          total: cloned.evidence.length,
          aligned: cloned.evidence.filter(item => item.aligned).length,
          mismatches: cloned.evidence.filter(item => !item.aligned).length,
        };
        return cloned;
      },
    },
  ];
}

export function runPipelineInvariantEngineAdversarialGuardChecks(
  invariantRecord: PipelineInvariantEngineRunRecord,
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
): { rejected: number; total: number; failures: string[] } {
  const scenarios = buildPipelineInvariantEngineAdversarialGuardScenarios();
  const failures: string[] = [];
  let rejected = 0;

  for (const scenario of scenarios) {
    const tampered = scenario.build(invariantRecord);
    const validation = validatePipelineInvariantEngineRunRecord(tampered, contract);
    const falseAlignment = detectPipelineInvariantEngineFalseAlignment(tampered);
    const summaryMismatch = detectPipelineInvariantEngineEvidenceSummaryMismatch(tampered);
    const rejectedByGuard =
      !validation.valid || falseAlignment.length > 0 || summaryMismatch !== null;

    if (rejectedByGuard) rejected++;
    else failures.push(`${scenario.id}: tampered record was not rejected`);
  }

  return { rejected, total: scenarios.length, failures };
}

export function validateForgePipelineInvariantEngineGuard(
  record: PipelineInvariantEngineRunRecord,
  options: {
    totalCostUsd?: number;
    llmCalls?: number;
    contract?: PipelineInvariantEngineContract;
    controls?: ForgePipelineInvariantEngineGuardControls;
  } = {},
): PipelineInvariantEngineGuardCheckResult {
  const controls = options.controls ?? getForgePipelineInvariantEngineGuardControls();
  const contract = options.contract ?? getActivePipelineInvariantEngineContract();
  const totalCostUsd = options.totalCostUsd ?? 0;
  const llmCalls = options.llmCalls ?? 0;
  const issues: PipelineInvariantEngineGuardCheckIssue[] = [];

  issues.push(...validatePipelineInvariantEnginePerformance(record, controls));
  issues.push(...validatePipelineInvariantEngineCost(totalCostUsd, llmCalls, controls));
  issues.push(...validatePipelineInvariantEngineSafety(record, controls));

  const falseAlignment = detectPipelineInvariantEngineFalseAlignment(record);
  if (falseAlignment.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "false_alignment",
      detail: falseAlignment.join("; "),
    });
  }
  const summaryMismatch = detectPipelineInvariantEngineEvidenceSummaryMismatch(record);
  if (summaryMismatch) {
    issues.push({
      domain: "adversarial",
      code: "summary_evidence_mismatch",
      detail: summaryMismatch,
    });
  }

  const adversarial = runPipelineInvariantEngineAdversarialGuardChecks(record, contract);
  if (adversarial.failures.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "scenario_not_rejected",
      detail: adversarial.failures.join("; "),
    });
  }

  const telemetrySummary = summarizePipelineInvariantEngineTelemetry(record.telemetry);
  const wallClockMs = parsePipelineInvariantEngineIsoDurationMs(
    record.provenance.startedAt,
    record.provenance.completedAt,
  );

  return {
    passed: issues.length === 0 && adversarial.rejected === adversarial.total,
    issues,
    metrics: {
      suiteDurationMs: telemetrySummary.suiteDurationMs,
      wallClockMs,
      maxProbeDurationMs: telemetrySummary.maxProbeDurationMs,
      totalCostUsd,
      llmCalls,
      adversarialScenariosRejected: adversarial.rejected,
      adversarialScenariosTotal: adversarial.total,
    },
  };
}

// ─── Block gate and handoff (P01-B05-A10) ────────────────────────────────────

export interface PipelineInvariantEngineBlockGateEvidence {
  blockId: string;
  atom: string;
  sealedAt: string;
  atomSeals: ForgeBlockAtomSeal[];
  regressionPassed: boolean;
  guardPassed: boolean;
  handoffValid: boolean;
  probeCount: number;
  gitCommit?: string;
}

export interface PipelineInvariantEngineBlockHandoffContract {
  version: string;
  atom: string;
  sourceBlock: {
    blockId: string;
    title: string;
    completedAtoms: readonly string[];
  };
  targetBlock: {
    blockId: string;
    title: string;
    entryAtom: string;
  };
  sealedArtifacts: {
    fixtureVersion: string;
    contractVersion: string;
    harnessVersion: string;
    probeCount: number;
    invariantCategories: readonly PipelineInvariantEngineCategory[];
    sourcePhaseEventSchemaAtom: string;
  };
  prerequisites: readonly string[];
  entryCriteria: {
    description: string;
    requiresBlockGatePass: true;
    pipelineInvariantEngineRecordRequired: true;
  };
}

export const FORGE_P01_B05_BLOCK_GATE_V1: ForgeBlockGateDefinition = {
  version: "1.0.0",
  atom: "P01-B05-A10",
  blockId: "P01-B05",
  title: "Pipeline invariant engine",
  requiredAtomIds: [
    "P01-B05-A01",
    "P01-B05-A02",
    "P01-B05-A03",
    "P01-B05-A04",
    "P01-B05-A05",
    "P01-B05-A06",
    "P01-B05-A07",
    "P01-B05-A08",
    "P01-B05-A09",
    "P01-B05-A10",
  ],
  checks: [
    { id: "fixture_contract_alignment", atomId: "P01-B05-A01", description: "Pipeline invariant engine fixture aligns with typed contract" },
    { id: "typed_contract_coverage", atomId: "P01-B05-A02", description: "Contract declares measurable probes for all invariant categories" },
    { id: "probe_matrix_aligned", atomId: "P01-B05-A03", description: "Invariant probe matrix executes with zero unexpected mismatches" },
    { id: "boundary_disposition_coverage", atomId: "P01-B05-A04", description: "Contract covers observed, gap, failure, recovery and NO-GO dispositions" },
    { id: "failure_recovery_nogo", atomId: "P01-B05-A05", description: "Failure, recovery and NO-GO probes are declared and exercised" },
    { id: "evidence_telemetry_provenance", atomId: "P01-B05-A06", description: "Run record carries evidence, telemetry and provenance" },
    { id: "property_and_fuzz", atomId: "P01-B05-A07", description: "Structural property and fuzz validation reject tampered inputs" },
    { id: "regression_gate", atomId: "P01-B05-A08", description: "Regression gate passes on canonical invariant matrix" },
    { id: "guard_controls", atomId: "P01-B05-A09", description: "Adversarial, performance, cost and safety guard controls pass" },
    { id: "block_gate_sealed", atomId: "P01-B05-A10", description: "Block gate evidence sealed with valid B06 handoff contract" },
  ] satisfies readonly ForgeBlockGateCheck[],
};

export const FORGE_P01_B05_TO_B06_HANDOFF_V1: PipelineInvariantEngineBlockHandoffContract = {
  version: "1.0.0",
  atom: "P01-B05-A10",
  sourceBlock: {
    blockId: "P01-B05",
    title: "Pipeline invariant engine",
    completedAtoms: FORGE_P01_B05_BLOCK_GATE_V1.requiredAtomIds,
  },
  targetBlock: {
    blockId: "P01-B06",
    title: "Benchmark ve eval harness",
    entryAtom: "P01-B06-A01",
  },
  sealedArtifacts: {
    fixtureVersion: "1.0.0",
    contractVersion: FORGE_PIPELINE_INVARIANT_ENGINE_CONTRACT_V1.version,
    harnessVersion: FORGE_PIPELINE_INVARIANT_ENGINE_HARNESS_VERSION,
    probeCount: summarizePipelineInvariantEngineContractCoverage(FORGE_PIPELINE_INVARIANT_ENGINE_CONTRACT_V1).totalProbes,
    invariantCategories: PIPELINE_INVARIANT_ENGINE_CATEGORIES,
    sourcePhaseEventSchemaAtom: "P01-B04-A10",
  },
  prerequisites: [
    "Pipeline invariant engine contract v1 with measurable cross-cutting invariants",
    "Versioned invariant fixture aligned to contract probe matrix",
    "Evidence, telemetry and provenance run records",
    "Regression and guard gates integrated with orchestrator verification",
    "Sealed P01-B04 typed phase/event schema artifacts referenced by sourcePhaseEventSchema",
  ],
  entryCriteria: {
    description:
      "B06-A01 formalizes benchmark and eval harness using sealed pipeline invariant engine artifacts",
    requiresBlockGatePass: true,
    pipelineInvariantEngineRecordRequired: true,
  },
};

export function getForgeP01B05BlockGate(): ForgeBlockGateDefinition {
  return FORGE_P01_B05_BLOCK_GATE_V1;
}

export function getForgeP01B05ToB06Handoff(): PipelineInvariantEngineBlockHandoffContract {
  return FORGE_P01_B05_TO_B06_HANDOFF_V1;
}

export function validatePipelineInvariantEngineBlockHandoffContract(
  handoff: PipelineInvariantEngineBlockHandoffContract,
  evidence: Pick<PipelineInvariantEngineBlockGateEvidence, "probeCount" | "regressionPassed" | "guardPassed">,
  contract: PipelineInvariantEngineContract = getActivePipelineInvariantEngineContract(),
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const coverage = summarizePipelineInvariantEngineContractCoverage(contract);

  if (handoff.sealedArtifacts.probeCount !== coverage.totalProbes) {
    issues.push(
      `handoff probeCount=${handoff.sealedArtifacts.probeCount} contract=${coverage.totalProbes}`,
    );
  }
  if (handoff.sealedArtifacts.contractVersion !== contract.version) {
    issues.push(
      `handoff contractVersion=${handoff.sealedArtifacts.contractVersion} active=${contract.version}`,
    );
  }
  if (handoff.sealedArtifacts.invariantCategories.length !== PIPELINE_INVARIANT_ENGINE_CATEGORIES.length) {
    issues.push("handoff invariantCategories incomplete");
  }
  if (handoff.targetBlock.entryAtom !== "P01-B06-A01") {
    issues.push(`unexpected entry atom: ${handoff.targetBlock.entryAtom}`);
  }
  if (!evidence.regressionPassed) {
    issues.push("regression gate did not pass");
  }
  if (!evidence.guardPassed) {
    issues.push("guard gate did not pass");
  }
  if (evidence.probeCount !== coverage.totalProbes) {
    issues.push(`evidence probeCount=${evidence.probeCount} contract=${coverage.totalProbes}`);
  }

  return { valid: issues.length === 0, issues };
}

export function buildPipelineInvariantEngineBlockGateEvidence(
  atomSeals: ForgeBlockAtomSeal[],
  regressionPassed: boolean,
  guardPassed: boolean,
  probeCount: number,
  gitCommit?: string,
  blockId = FORGE_P01_B05_BLOCK_GATE_V1.blockId,
): PipelineInvariantEngineBlockGateEvidence {
  const handoff = getForgeP01B05ToB06Handoff();
  const handoffValid = validatePipelineInvariantEngineBlockHandoffContract(handoff, {
    probeCount,
    regressionPassed,
    guardPassed,
  }).valid;

  return {
    blockId,
    atom: "P01-B05-A10",
    sealedAt: new Date().toISOString(),
    atomSeals,
    regressionPassed,
    guardPassed,
    handoffValid,
    probeCount,
    gitCommit,
  };
}
