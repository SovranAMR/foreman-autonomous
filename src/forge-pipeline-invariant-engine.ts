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

export const FORGE_PIPELINE_INVARIANT_ENGINE_HARNESS_VERSION = "1.0.0-a01";

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
