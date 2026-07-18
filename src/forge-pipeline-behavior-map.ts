/**
 * FOREMAN — Forge Pipeline Behavior Map (P01-B02)
 *
 * Maps live orchestrator pipeline phases to observable behavior contracts.
 * Built on sealed P01-B01 baseline artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import { FORGE_BASELINE_CONTRACT_V1, summarizeContractCoverage } from "./forge-baseline-contract.js";

export type PipelineBehaviorCategory =
  | "phase_presence"
  | "state_sync"
  | "checkpoint_type"
  | "stream_seam"
  | "baseline_link";

/** Probe disposition — observed behavior vs documented known gap. */
export type PipelineBehaviorProbeDisposition = "observed" | "gap";

export const FORGE_PIPELINE_CORE_PHASES = [
  "vision",
  "decompose",
  "research",
  "atomize",
  "execute",
  "reflect",
  "verify",
] as const;

export type ForgePipelineCorePhase = (typeof FORGE_PIPELINE_CORE_PHASES)[number];

export const PIPELINE_BEHAVIOR_CATEGORIES: readonly PipelineBehaviorCategory[] = [
  "phase_presence",
  "state_sync",
  "checkpoint_type",
  "stream_seam",
  "baseline_link",
] as const;

export interface PipelineBehaviorFixtureEntry {
  id: string;
  phase: ForgePipelineCorePhase | "registry";
  category: PipelineBehaviorCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface PipelineBehaviorMapFixture {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBaseline: {
    version: string;
    atom: string;
    contractVersion: string;
    probeCount: number;
    pathCategories: number;
  };
  probes: PipelineBehaviorFixtureEntry[];
}

export interface PipelineBehaviorProbeContract {
  id: string;
  phase: ForgePipelineCorePhase | "registry";
  category: PipelineBehaviorCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  /** Scenario class: observed live behavior or documented known gap. */
  disposition: PipelineBehaviorProbeDisposition;
  /** Measurable assertion enforced by the behavior map harness probe. */
  criterion: string;
}

export interface PipelineBehaviorCategoryAcceptance {
  /** Category-level invariant that all probes collectively enforce. */
  invariant: string;
  /** Minimum number of probes required for this category. */
  minProbeCount: number;
  /** All probes must align (actual === expected); documented FAIL gaps included. */
  requireFullAlignment: true;
}

export interface PipelineBehaviorCategoryContract {
  category: PipelineBehaviorCategory;
  acceptance: PipelineBehaviorCategoryAcceptance;
  probes: readonly PipelineBehaviorProbeContract[];
}

export interface PipelineBehaviorMapContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<PipelineBehaviorCategory, PipelineBehaviorCategoryContract>;
  probes: readonly PipelineBehaviorProbeContract[];
}

export interface BehaviorMapValidationIssue {
  kind: "missing_probe" | "extra_probe" | "mismatch" | "missing_gap" | "underflow" | "missing_category";
  probeId?: string;
  category?: PipelineBehaviorCategory;
  detail: string;
}

export interface BehaviorMapValidationResult {
  valid: boolean;
  issues: BehaviorMapValidationIssue[];
}

function flattenCategoryProbes(
  categories: Record<PipelineBehaviorCategory, PipelineBehaviorCategoryContract>,
): readonly PipelineBehaviorProbeContract[] {
  return PIPELINE_BEHAVIOR_CATEGORIES.flatMap(category => categories[category].probes);
}

const BEHAVIOR_MAP_CATEGORIES: Record<PipelineBehaviorCategory, PipelineBehaviorCategoryContract> = {
  phase_presence: {
    category: "phase_presence",
    acceptance: {
      invariant:
        "Orchestrator emits phase_start for each core pipeline phase and exports a canonical phase registry.",
      minProbeCount: 7,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "map.vision_phase_presence",
        phase: "vision",
        category: "phase_presence",
        description: "Orchestrator emits phase_start for vision",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts contains phase_start with phase "vision"',
      },
      {
        id: "map.decompose_phase_presence",
        phase: "decompose",
        category: "phase_presence",
        description: "Orchestrator emits phase_start for decompose",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts contains phase_start with phase "decompose"',
      },
      {
        id: "map.research_phase_presence",
        phase: "research",
        category: "phase_presence",
        description: "Orchestrator emits phase_start for research",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts contains phase_start with phase "research"',
      },
      {
        id: "map.atomize_phase_presence",
        phase: "atomize",
        category: "phase_presence",
        description: "Orchestrator emits phase_start for atomize",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts contains phase_start with phase "atomize"',
      },
      {
        id: "map.execute_phase_presence",
        phase: "execute",
        category: "phase_presence",
        description: "Orchestrator emits phase_start for execute",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts contains phase_start with phase "execute"',
      },
      {
        id: "map.reflect_phase_presence",
        phase: "reflect",
        category: "phase_presence",
        description: "Orchestrator emits phase_start for reflect",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts contains phase_start with phase "reflect"',
      },
      {
        id: "map.registry_export",
        phase: "registry",
        category: "phase_presence",
        description: "Orchestrator exports canonical FORGE_PIPELINE_PHASES registry (known gap)",
        expected: "FAIL",
        disposition: "gap",
        criterion: "orchestrator.ts exports FORGE_PIPELINE_PHASES constant",
      },
    ],
  },
  state_sync: {
    category: "state_sync",
    acceptance: {
      invariant:
        "Each pipeline phase transitions SystemState to a matching state; atomize requires dedicated atomizing state.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "map.vision_state_sync",
        phase: "vision",
        category: "state_sync",
        description: "Vision phase transitions SystemState to visioning",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator transitions to "visioning" during vision phase',
      },
      {
        id: "map.decompose_state_sync",
        phase: "decompose",
        category: "state_sync",
        description: "Decompose phase transitions SystemState to decomposing",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator transitions to "decomposing" during decompose phase',
      },
      {
        id: "map.research_state_sync",
        phase: "research",
        category: "state_sync",
        description: "Research phase transitions SystemState to researching",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator transitions to "researching" during research phase',
      },
      {
        id: "map.atomize_state_sync",
        phase: "atomize",
        category: "state_sync",
        description: "Atomize phase has dedicated SystemState (known gap: uses decomposing)",
        expected: "FAIL",
        disposition: "gap",
        criterion: 'SystemState includes "atomizing" and orchestrator transitions to it during atomize',
      },
      {
        id: "map.execute_state_sync",
        phase: "execute",
        category: "state_sync",
        description: "Execute phase transitions SystemState to executing",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator transitions to "executing" during execute phase',
      },
      {
        id: "map.reflect_state_sync",
        phase: "reflect",
        category: "state_sync",
        description: "Reflect phase transitions SystemState to reflecting",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator transitions to "reflecting" during reflect phase',
      },
    ],
  },
  checkpoint_type: {
    category: "checkpoint_type",
    acceptance: {
      invariant: "Pipeline resume types include verify phase for checkpoint recovery.",
      minProbeCount: 1,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "map.verify_checkpoint_type",
        phase: "verify",
        category: "checkpoint_type",
        description: "PipelinePhase type includes verify for checkpoint resume",
        expected: "PASS",
        disposition: "observed",
        criterion: 'pipeline-resume.ts PipelinePhase union includes "verify"',
      },
    ],
  },
  stream_seam: {
    category: "stream_seam",
    acceptance: {
      invariant: "StreamingPipeline exposes phase icons for live CLI stream rendering.",
      minProbeCount: 1,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "map.vision_stream_icon",
        phase: "vision",
        category: "stream_seam",
        description: "StreamingPipeline PHASE_ICONS includes vision",
        expected: "PASS",
        disposition: "observed",
        criterion: "streaming-pipeline.ts PHASE_ICONS defines vision icon",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant: "Behavior map fixture references sealed P01-B01 baseline probe count and contract version.",
      minProbeCount: 1,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "map.b01_baseline_handoff",
        phase: "registry",
        category: "baseline_link",
        description: "Behavior map fixture references sealed B01 baseline artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "fixture sourceBaseline matches FORGE_BASELINE_CONTRACT_V1 probe count",
      },
    ],
  },
};

/** Typed pipeline behavior map contract v1 — source of truth for phase→behavior acceptance. */
export const FORGE_PIPELINE_BEHAVIOR_MAP_CONTRACT_V1: PipelineBehaviorMapContract = {
  version: "1.0.0",
  atom: "P01-B02-A02",
  purpose:
    "Measurable acceptance criteria for orchestrator pipeline phase→behavior map (presence, state sync, checkpoint, stream, B01 link).",
  categories: BEHAVIOR_MAP_CATEGORIES,
  probes: flattenCategoryProbes(BEHAVIOR_MAP_CATEGORIES),
};

export function getActivePipelineBehaviorMapContract(): PipelineBehaviorMapContract {
  return FORGE_PIPELINE_BEHAVIOR_MAP_CONTRACT_V1;
}

export function getBehaviorMapCategoryContract(
  category: PipelineBehaviorCategory,
  contract: PipelineBehaviorMapContract = getActivePipelineBehaviorMapContract(),
): PipelineBehaviorCategoryContract {
  return contract.categories[category];
}

export function listBehaviorMapProbeIds(
  contract: PipelineBehaviorMapContract = getActivePipelineBehaviorMapContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listBehaviorMapProbesByDisposition(
  disposition: PipelineBehaviorProbeDisposition,
  contract: PipelineBehaviorMapContract = getActivePipelineBehaviorMapContract(),
): PipelineBehaviorProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function summarizeBehaviorMapContractCoverage(
  contract: PipelineBehaviorMapContract = getActivePipelineBehaviorMapContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<PipelineBehaviorCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<PipelineBehaviorProbeDisposition, number>;
} {
  const byCategory = {} as Record<PipelineBehaviorCategory, { probeCount: number; invariant: string }>;
  const byDisposition: Record<PipelineBehaviorProbeDisposition, number> = {
    observed: 0,
    gap: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of PIPELINE_BEHAVIOR_CATEGORIES) {
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

export function buildDefaultBehaviorMapSourceBaseline(): PipelineBehaviorMapFixture["sourceBaseline"] {
  const coverage = summarizeContractCoverage(FORGE_BASELINE_CONTRACT_V1);
  return {
    version: "1.0.0",
    atom: "P01-B01-A10",
    contractVersion: FORGE_BASELINE_CONTRACT_V1.version,
    probeCount: coverage.totalProbes,
    pathCategories: coverage.byPath ? Object.keys(coverage.byPath).length : 6,
  };
}

export function validateBehaviorMapFixtureAgainstContract(
  fixture: PipelineBehaviorMapFixture,
  contract: PipelineBehaviorMapContract = getActivePipelineBehaviorMapContract(),
): BehaviorMapValidationResult {
  const issues: BehaviorMapValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  for (const category of PIPELINE_BEHAVIOR_CATEGORIES) {
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
        kind: "mismatch",
        probeId: entry.id,
        detail: `expected mismatch fixture=${entry.expected} contract=${expected.expected}`,
      });
    }
    if (entry.description !== expected.description) {
      issues.push({
        kind: "mismatch",
        probeId: entry.id,
        detail: `description mismatch for ${entry.id}`,
      });
    }
    if (entry.category !== expected.category) {
      issues.push({
        kind: "mismatch",
        probeId: entry.id,
        detail: `category mismatch fixture=${entry.category} contract=${expected.category}`,
      });
    }
    if (entry.phase !== expected.phase) {
      issues.push({
        kind: "mismatch",
        probeId: entry.id,
        detail: `phase mismatch fixture=${entry.phase} contract=${expected.phase}`,
      });
    }
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length === 0) {
    issues.push({ kind: "missing_gap", detail: "fixture must document at least one known FAIL gap" });
  }

  const baseline = buildDefaultBehaviorMapSourceBaseline();
  if (fixture.sourceBaseline.probeCount !== baseline.probeCount) {
    issues.push({
      kind: "mismatch",
      detail: `sourceBaseline probeCount=${fixture.sourceBaseline.probeCount} expected=${baseline.probeCount}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

export interface BehaviorMapProbeSummary {
  total: number;
  aligned: number;
  mismatches: BehaviorMapProbeResult[];
  knownGaps: BehaviorMapProbeResult[];
  byCategory: Record<PipelineBehaviorCategory, { total: number; aligned: number; expectedFail: number }>;
}

export interface BehaviorMapProbeResult {
  id: string;
  phase: string;
  category: PipelineBehaviorCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}
