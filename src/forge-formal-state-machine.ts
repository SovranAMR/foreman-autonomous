/**
 * FOREMAN — Formal State Machine Baseline (P01-B03)
 *
 * Measures orchestrator ↔ StateManager alignment against VALID_TRANSITIONS.
 * Built on sealed P01-B02 behavior map artifacts.
 */

import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP01B02ToB03Handoff,
  summarizeBehaviorMapContractCoverage,
  FORGE_PIPELINE_BEHAVIOR_MAP_CONTRACT_V1,
} from "./forge-pipeline-behavior-map.js";

export const FORGE_FORMAL_STATE_MACHINE_HARNESS_VERSION = "1.0.0-a02";

/** Probe disposition — observed behavior, documented gap, or resilience path class. */
export type FormalStateMachineProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export const FORMAL_STATE_MACHINE_CATEGORIES = [
  "transition_graph",
  "state_invariant",
  "orchestrator_sync",
  "failure_state",
  "recovery_state",
  "baseline_link",
] as const;

export type FormalStateMachineCategory = (typeof FORMAL_STATE_MACHINE_CATEGORIES)[number];

export interface FormalStateMachineFixtureEntry {
  id: string;
  category: FormalStateMachineCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface FormalStateMachineFixture {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBehaviorMap: {
    version: string;
    atom: string;
    contractVersion: string;
    probeCount: number;
    behaviorCategories: number;
  };
  probes: FormalStateMachineFixtureEntry[];
}

export interface FormalStateMachineProbeContract {
  id: string;
  category: FormalStateMachineCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  /** Scenario class: observed live behavior or documented known gap. */
  disposition: FormalStateMachineProbeDisposition;
  /** Measurable assertion enforced by the formal state machine harness probe. */
  criterion: string;
}

export interface FormalStateMachineCategoryAcceptance {
  /** Category-level invariant that all probes collectively enforce. */
  invariant: string;
  /** Minimum number of probes required for this category. */
  minProbeCount: number;
  /** All probes must align (actual === expected); documented FAIL gaps included. */
  requireFullAlignment: true;
}

export interface FormalStateMachineCategoryContract {
  category: FormalStateMachineCategory;
  acceptance: FormalStateMachineCategoryAcceptance;
  probes: readonly FormalStateMachineProbeContract[];
}

export interface FormalStateMachineContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<FormalStateMachineCategory, FormalStateMachineCategoryContract>;
  probes: readonly FormalStateMachineProbeContract[];
}

export interface FormalStateMachineProbeResult {
  id: string;
  category: FormalStateMachineCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface FormalStateMachineProbeSummary {
  total: number;
  aligned: number;
  mismatches: FormalStateMachineProbeResult[];
  knownGaps: FormalStateMachineProbeResult[];
  byCategory: Record<
    FormalStateMachineCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface FormalStateMachineFixtureValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: FormalStateMachineCategory;
  detail: string;
}

export interface FormalStateMachineFixtureValidationResult {
  valid: boolean;
  issues: FormalStateMachineFixtureValidationIssue[];
}

/** Minimum probes per category for A01 baseline slice. */
export const FORMAL_STATE_MACHINE_A01_MIN_PROBES: Readonly<
  Record<FormalStateMachineCategory, number>
> = {
  transition_graph: 3,
  state_invariant: 3,
  orchestrator_sync: 8,
  failure_state: 2,
  recovery_state: 2,
  baseline_link: 2,
};

function flattenFormalStateMachineCategoryProbes(
  categories: Record<FormalStateMachineCategory, FormalStateMachineCategoryContract>,
): readonly FormalStateMachineProbeContract[] {
  return FORMAL_STATE_MACHINE_CATEGORIES.flatMap(category => categories[category].probes);
}

const FORMAL_STATE_MACHINE_CATEGORY_CONTRACTS: Record<
  FormalStateMachineCategory,
  FormalStateMachineCategoryContract
> = {
  transition_graph: {
    category: "transition_graph",
    acceptance: {
      invariant:
        "VALID_TRANSITIONS defines a complete directed graph: every SystemState has exits, idle is the single entry, complete returns to idle.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "fsm.graph_all_states_have_exits",
        category: "transition_graph",
        description: "Every SystemState in VALID_TRANSITIONS has at least one valid exit",
        expected: "PASS",
        disposition: "observed",
        criterion: "Every SystemState in VALID_TRANSITIONS has ≥1 exit",
      },
      {
        id: "fsm.graph_idle_single_entry",
        category: "transition_graph",
        description: "idle transitions only to visioning (canonical pipeline entry)",
        expected: "PASS",
        disposition: "observed",
        criterion: "idle → [visioning] only",
      },
      {
        id: "fsm.graph_complete_to_idle",
        category: "transition_graph",
        description: "complete returns only to idle for new work",
        expected: "PASS",
        disposition: "observed",
        criterion: "complete → [idle] only",
      },
    ],
  },
  state_invariant: {
    category: "state_invariant",
    acceptance: {
      invariant:
        "StateManager enforces VALID_TRANSITIONS membership, rejects empty reasons, and exposes canTransition() without mutating on invalid jumps.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "fsm.invariant_rejects_empty_reason",
        category: "state_invariant",
        description: "StateManager rejects transitions without a reason",
        expected: "PASS",
        disposition: "observed",
        criterion: "Empty reason throws MissingReasonError",
      },
      {
        id: "fsm.invariant_rejects_invalid",
        category: "state_invariant",
        description: "StateManager rejects undefined transitions via InvalidTransitionError",
        expected: "PASS",
        disposition: "failure",
        criterion: "idle→executing throws InvalidTransitionError without mutation",
      },
      {
        id: "fsm.invariant_can_transition",
        category: "state_invariant",
        description: "canTransition() matches VALID_TRANSITIONS membership",
        expected: "PASS",
        disposition: "observed",
        criterion: "canTransition reflects VALID_TRANSITIONS membership",
      },
    ],
  },
  orchestrator_sync: {
    category: "orchestrator_sync",
    acceptance: {
      invariant:
        "Orchestrator calls state.transition() for each canonical pipeline SystemState (vision through complete).",
      minProbeCount: 8,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "fsm.orch_visioning",
        category: "orchestrator_sync",
        description: "Orchestrator transitions SystemState to visioning at pipeline start",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts calls state.transition("visioning", ...)',
      },
      {
        id: "fsm.orch_decomposing",
        category: "orchestrator_sync",
        description: "Orchestrator transitions SystemState to decomposing after vision",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts calls state.transition("decomposing", ...)',
      },
      {
        id: "fsm.orch_researching",
        category: "orchestrator_sync",
        description: "Orchestrator transitions SystemState to researching per block",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts calls state.transition("researching", ...)',
      },
      {
        id: "fsm.orch_atomizing",
        category: "orchestrator_sync",
        description: "Orchestrator transitions SystemState to atomizing when canTransition allows",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts calls state.transition("atomizing", ...)',
      },
      {
        id: "fsm.orch_executing",
        category: "orchestrator_sync",
        description: "Orchestrator transitions SystemState to executing for each atom",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts calls state.transition("executing", ...)',
      },
      {
        id: "fsm.orch_reflecting",
        category: "orchestrator_sync",
        description: "Orchestrator transitions SystemState to reflecting after atom batches",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts calls state.transition("reflecting", ...)',
      },
      {
        id: "fsm.orch_verifying",
        category: "orchestrator_sync",
        description: "Orchestrator transitions SystemState to verifying before completion",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts calls state.transition("verifying", ...)',
      },
      {
        id: "fsm.orch_complete",
        category: "orchestrator_sync",
        description: "Orchestrator transitions SystemState to complete at pipeline end",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator.ts calls state.transition("complete", ...)',
      },
    ],
  },
  failure_state: {
    category: "failure_state",
    acceptance: {
      invariant:
        "Orchestrator synchronizes formal failure states (blocked, awaiting_human) when worker blocks or human gates are required.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "fsm.orch_blocked_sync",
        category: "failure_state",
        description: "Orchestrator calls state.transition(\"blocked\") when worker blocks (formal failure state)",
        expected: "FAIL",
        disposition: "gap",
        criterion: 'orchestrator.ts calls state.transition("blocked", ...) on worker block',
      },
      {
        id: "fsm.orch_awaiting_human_sync",
        category: "failure_state",
        description: "Orchestrator uses awaiting_human state for human-in-the-loop gates",
        expected: "FAIL",
        disposition: "gap",
        criterion: 'orchestrator.ts calls state.transition("awaiting_human", ...) for human gates',
      },
    ],
  },
  recovery_state: {
    category: "recovery_state",
    acceptance: {
      invariant:
        "StateManager accepts blocked→decomposing replan and awaiting_human→executing resume recovery paths.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "fsm.recovery_blocked_to_decomposing",
        category: "recovery_state",
        description: "StateManager accepts blocked→decomposing replan recovery path",
        expected: "PASS",
        disposition: "recovery",
        criterion: "blocked→decomposing recovery succeeds in StateManager",
      },
      {
        id: "fsm.recovery_awaiting_to_executing",
        category: "recovery_state",
        description: "StateManager accepts awaiting_human→executing resume path",
        expected: "PASS",
        disposition: "recovery",
        criterion: "awaiting_human→executing resume succeeds in StateManager",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Formal state machine baseline links to sealed P01-B02 behavior map handoff artifacts and probe counts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "fsm.b02_handoff_target",
        category: "baseline_link",
        description: "FORGE_P01_B02_TO_B03_HANDOFF_V1 targets P01-B03-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "B02→B03 handoff entry atom is P01-B03-A01",
      },
      {
        id: "fsm.b02_behavior_map_sealed",
        category: "baseline_link",
        description: "Sealed B02 behavior map contract probe count matches handoff artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Sealed B02 handoff probe count matches active behavior map contract",
      },
    ],
  },
};

/** Typed formal state machine contract v1 — source of truth for FSM probe acceptance. */
export const FORGE_FORMAL_STATE_MACHINE_CONTRACT_V1: FormalStateMachineContract = {
  version: "1.0.0",
  atom: "P01-B03-A02",
  purpose:
    "Measurable acceptance criteria for orchestrator ↔ StateManager formal state machine (transition graph, invariants, sync, failure/recovery paths, B02 link).",
  categories: FORMAL_STATE_MACHINE_CATEGORY_CONTRACTS,
  probes: flattenFormalStateMachineCategoryProbes(FORMAL_STATE_MACHINE_CATEGORY_CONTRACTS),
};

export function getActiveFormalStateMachineContract(): FormalStateMachineContract {
  return FORGE_FORMAL_STATE_MACHINE_CONTRACT_V1;
}

export function getFormalStateMachineCategoryContract(
  category: FormalStateMachineCategory,
  contract: FormalStateMachineContract = getActiveFormalStateMachineContract(),
): FormalStateMachineCategoryContract {
  return contract.categories[category];
}

export function listFormalStateMachineContractProbeIds(
  contract: FormalStateMachineContract = getActiveFormalStateMachineContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listFormalStateMachineProbesByDisposition(
  disposition: FormalStateMachineProbeDisposition,
  contract: FormalStateMachineContract = getActiveFormalStateMachineContract(),
): FormalStateMachineProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function summarizeFormalStateMachineContractCoverage(
  contract: FormalStateMachineContract = getActiveFormalStateMachineContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<FormalStateMachineCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<FormalStateMachineProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    FormalStateMachineCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<FormalStateMachineProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of FORMAL_STATE_MACHINE_CATEGORIES) {
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

export function validateFormalStateMachineFixtureAgainstContract(
  fixture: FormalStateMachineFixture,
  contract: FormalStateMachineContract = getActiveFormalStateMachineContract(),
): FormalStateMachineFixtureValidationResult {
  const issues: FormalStateMachineFixtureValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of FORMAL_STATE_MACHINE_CATEGORIES) {
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

export function buildDefaultFormalStateMachineSourceBehaviorMap(): FormalStateMachineFixture["sourceBehaviorMap"] {
  const coverage = summarizeBehaviorMapContractCoverage(FORGE_PIPELINE_BEHAVIOR_MAP_CONTRACT_V1);
  return {
    version: "1.0.0",
    atom: "P01-B02-A10",
    contractVersion: FORGE_PIPELINE_BEHAVIOR_MAP_CONTRACT_V1.version,
    probeCount: coverage.totalProbes,
    behaviorCategories: coverage.byCategory
      ? Object.keys(coverage.byCategory).length
      : 8,
  };
}

export function validateFormalStateMachineFixture(
  fixture: FormalStateMachineFixture,
): FormalStateMachineFixtureValidationResult {
  const issues: FormalStateMachineFixtureValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P01-B03-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory: Record<FormalStateMachineCategory, number> = {
    transition_graph: 0,
    state_invariant: 0,
    orchestrator_sync: 0,
    failure_state: 0,
    recovery_state: 0,
    baseline_link: 0,
  };

  for (const probe of fixture.probes) {
    if (ids.has(probe.id)) {
      issues.push({ kind: "extra_probe", probeId: probe.id, detail: "duplicate probe id" });
    }
    ids.add(probe.id);
    byCategory[probe.category]++;
  }

  for (const category of FORMAL_STATE_MACHINE_CATEGORIES) {
    const min = FORMAL_STATE_MACHINE_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP01B02ToB03Handoff();
  if (fixture.sourceBehaviorMap.probeCount !== handoff.sealedArtifacts.probeCount) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBehaviorMap.probeCount=${fixture.sourceBehaviorMap.probeCount} handoff=${handoff.sealedArtifacts.probeCount}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

export function summarizeFormalStateMachineMatrix(
  results: FormalStateMachineProbeResult[],
): FormalStateMachineProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as FormalStateMachineProbeSummary["byCategory"];
  for (const cat of FORMAL_STATE_MACHINE_CATEGORIES) {
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
