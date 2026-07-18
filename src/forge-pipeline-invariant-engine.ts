/**
 * FOREMAN — Pipeline Invariant Engine Baseline (P01-B05)
 *
 * Measures orchestrator cross-cutting pipeline invariants.
 * Built on sealed P01-B04 typed phase/event schema artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP01B04ToB05Handoff,
  summarizePhaseEventSchemaContractCoverage,
  FORGE_PHASE_EVENT_SCHEMA_CONTRACT_V1,
  PHASE_EVENT_SCHEMA_CATEGORIES,
} from "./forge-phase-event-schema.js";

export const FORGE_PIPELINE_INVARIANT_ENGINE_HARNESS_VERSION = "1.0.0-a04";

export type PipelineInvariantEngineProbeDisposition = "observed" | "gap";

export const PIPELINE_INVARIANT_ENGINE_CATEGORIES = [
  "phase_lifecycle",
  "event_ordering",
  "reflection_cadence",
  "state_coherence",
  "block_halt",
  "verification_gate",
  "baseline_link",
  "boundary",
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
