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

export const FORGE_FORMAL_STATE_MACHINE_HARNESS_VERSION = "1.0.0-a06";

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
  "boundary",
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
  recovery_state: 4,
  baseline_link: 2,
  boundary: 4,
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
      minProbeCount: 4,
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
      {
        id: "fsm.nogo_blocked_rejects_complete",
        category: "recovery_state",
        description: "StateManager rejects blocked→complete NO-GO jump without mutation",
        expected: "PASS",
        disposition: "nogo",
        criterion: "blocked→complete throws InvalidTransitionError without mutation",
      },
      {
        id: "fsm.nogo_awaiting_rejects_verifying",
        category: "recovery_state",
        description: "StateManager rejects awaiting_human→verifying NO-GO jump without mutation",
        expected: "PASS",
        disposition: "nogo",
        criterion: "awaiting_human→verifying throws InvalidTransitionError without mutation",
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
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "StateManager accepts graph edge transitions (replan, terminal, escalation, restart) and rejects invalid jumps without mutating state.",
      minProbeCount: 4,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "fsm.boundary_reflecting_replan_visioning",
        category: "boundary",
        description: "reflecting→visioning replan edge transition succeeds",
        expected: "PASS",
        disposition: "observed",
        criterion: "reflecting→visioning replan edge succeeds in StateManager",
      },
      {
        id: "fsm.boundary_verifying_terminal_complete",
        category: "boundary",
        description: "verifying→complete terminal success edge transition succeeds",
        expected: "PASS",
        disposition: "observed",
        criterion: "verifying→complete terminal edge succeeds in StateManager",
      },
      {
        id: "fsm.boundary_blocked_escalate_awaiting_human",
        category: "boundary",
        description: "blocked→awaiting_human failure escalation edge succeeds",
        expected: "PASS",
        disposition: "observed",
        criterion: "blocked→awaiting_human escalation edge succeeds in StateManager",
      },
      {
        id: "fsm.boundary_complete_restart_idle",
        category: "boundary",
        description: "complete→idle session restart edge succeeds",
        expected: "PASS",
        disposition: "observed",
        criterion: "complete→idle restart edge succeeds in StateManager",
      },
      {
        id: "fsm.boundary_rejects_idle_to_complete",
        category: "boundary",
        description: "idle→complete invalid jump rejected without mutation",
        expected: "PASS",
        disposition: "failure",
        criterion: "idle→complete throws InvalidTransitionError without mutation",
      },
      {
        id: "fsm.boundary_rejects_complete_to_executing",
        category: "boundary",
        description: "complete→executing invalid jump rejected without mutation",
        expected: "PASS",
        disposition: "failure",
        criterion: "complete→executing throws InvalidTransitionError without mutation",
      },
    ],
  },
};

/** Typed formal state machine contract v1 — source of truth for FSM probe acceptance. */
export const FORGE_FORMAL_STATE_MACHINE_CONTRACT_V1: FormalStateMachineContract = {
  version: "1.0.0",
  atom: "P01-B03-A05",
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

export function listFormalStateMachineProbesByCategory(
  category: FormalStateMachineCategory,
  contract: FormalStateMachineContract = getActiveFormalStateMachineContract(),
): FormalStateMachineProbeContract[] {
  return contract.categories[category].probes;
}

/**
 * Validate boundary-category probe matrix — A04 slice gate.
 * Only boundary probes are evaluated; zero unexpected mismatches required.
 */
export function validateFormalStateMachineBoundaryProbeMatrix(
  results: FormalStateMachineProbeResult[],
  contract: FormalStateMachineContract = getActiveFormalStateMachineContract(),
): FormalStateMachineProbeMatrixValidationResult {
  const boundaryProbes = listFormalStateMachineProbesByCategory("boundary", contract);
  const boundaryContract: FormalStateMachineContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateFormalStateMachineProbeMatrix(boundaryResults, boundaryContract);
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const FORMAL_STATE_MACHINE_FAILURE_RECOVERY_CATEGORIES = [
  "failure_state",
  "recovery_state",
] as const satisfies readonly FormalStateMachineCategory[];

/**
 * Validate failure_state + recovery_state probe matrix — A05 slice gate.
 * PASS recovery/NO-GO probes and documented FAIL gaps must align; zero unexpected mismatches.
 */
export function validateFormalStateMachineFailureRecoveryProbeMatrix(
  results: FormalStateMachineProbeResult[],
  contract: FormalStateMachineContract = getActiveFormalStateMachineContract(),
): FormalStateMachineProbeMatrixValidationResult {
  const failureRecoveryProbes = FORMAL_STATE_MACHINE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listFormalStateMachineProbesByCategory(category, contract),
  );
  const failureRecoveryContract: FormalStateMachineContract = {
    ...contract,
    probes: failureRecoveryProbes,
    categories: {
      ...contract.categories,
      failure_state: contract.categories.failure_state,
      recovery_state: contract.categories.recovery_state,
    },
  };
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  return validateFormalStateMachineProbeMatrix(failureRecoveryResults, failureRecoveryContract);
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

/** Per-probe evidence artifact — auditable proof of FSM probe outcome (P01-B03-A06). */
export interface FormalStateMachineProbeEvidence {
  probeId: string;
  category: FormalStateMachineCategory;
  disposition: FormalStateMachineProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for FSM runs (P01-B03-A06). */
export interface FormalStateMachineProbeTelemetry {
  probeId: string;
  category: FormalStateMachineCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P01-B03-A06). */
export interface FormalStateMachineProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourceBehaviorMapVersion: string;
  sourceBehaviorMapAtom: string;
  /** Slice atom when record covers a subset (e.g. failure/recovery gate). */
  sliceAtom?: string;
  /** Categories included when sliceAtom is set. */
  sliceCategories?: readonly FormalStateMachineCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated formal state machine run record bundling evidence, telemetry and provenance. */
export interface FormalStateMachineRunRecord {
  provenance: FormalStateMachineProvenance;
  evidence: FormalStateMachineProbeEvidence[];
  telemetry: FormalStateMachineProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<FormalStateMachineCategory, number>;
    byDisposition: Record<FormalStateMachineProbeDisposition, number>;
  };
}

export interface FormalStateMachineRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface FormalStateMachineRunValidationResult {
  valid: boolean;
  issues: FormalStateMachineRunValidationIssue[];
}

export function buildFormalStateMachineProbeEvidence(
  probeId: string,
  category: FormalStateMachineCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: FormalStateMachineProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): FormalStateMachineProbeEvidence {
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

export function buildFormalStateMachineProbeTelemetry(
  probeId: string,
  category: FormalStateMachineCategory,
  sequenceIndex: number,
  durationMs: number,
): FormalStateMachineProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildFormalStateMachineProvenance(
  runId: string,
  fixture: FormalStateMachineFixture,
  contract: FormalStateMachineContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly FormalStateMachineCategory[];
  },
): FormalStateMachineProvenance {
  return {
    runId,
    harnessVersion: FORGE_FORMAL_STATE_MACHINE_HARNESS_VERSION,
    contractVersion: contract.version,
    contractAtom: contract.atom,
    fixtureVersion: fixture.version,
    fixtureAtom: fixture.atom,
    sourceBehaviorMapVersion: fixture.sourceBehaviorMap.version,
    sourceBehaviorMapAtom: fixture.sourceBehaviorMap.atom,
    startedAt,
    completedAt,
    totalProbes,
    ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
    ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    ...(options?.gitCommit ? { gitCommit: options.gitCommit } : {}),
  };
}

export function buildFormalStateMachineRunRecord(
  provenance: FormalStateMachineProvenance,
  evidence: FormalStateMachineProbeEvidence[],
  telemetry: FormalStateMachineProbeTelemetry[],
): FormalStateMachineRunRecord {
  const byCategory = {} as Record<FormalStateMachineCategory, number>;
  const byDisposition: Record<FormalStateMachineProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of FORMAL_STATE_MACHINE_CATEGORIES) {
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

export function listFormalStateMachineFailureRecoveryProbeIds(
  contract: FormalStateMachineContract = getActiveFormalStateMachineContract(),
): string[] {
  return FORMAL_STATE_MACHINE_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listFormalStateMachineProbesByCategory(category, contract).map(p => p.id),
  );
}

function validateFormalStateMachineRunRecordAgainstProbeIds(
  record: FormalStateMachineRunRecord,
  expectedProbeIds: string[],
  contract: FormalStateMachineContract,
): FormalStateMachineRunValidationResult {
  const issues: FormalStateMachineRunValidationIssue[] = [];
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

export function validateFormalStateMachineRunRecord(
  record: FormalStateMachineRunRecord,
  contract: FormalStateMachineContract = getActiveFormalStateMachineContract(),
): FormalStateMachineRunValidationResult {
  return validateFormalStateMachineRunRecordAgainstProbeIds(
    record,
    listFormalStateMachineContractProbeIds(contract),
    contract,
  );
}

/** Validate failure/recovery slice run record — A06 gate for failure_state + recovery_state probes. */
export function validateFormalStateMachineFailureRecoveryRunRecord(
  record: FormalStateMachineRunRecord,
  contract: FormalStateMachineContract = getActiveFormalStateMachineContract(),
): FormalStateMachineRunValidationResult {
  const issues: FormalStateMachineRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P01-B03-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P01-B03-A06`,
    });
  }

  const expectedCategories = [...FORMAL_STATE_MACHINE_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateFormalStateMachineRunRecordAgainstProbeIds(
    record,
    listFormalStateMachineFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
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
    boundary: 0,
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

export interface FormalStateMachineProbeMatrixValidationIssue {
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

export interface FormalStateMachineProbeMatrixValidationResult {
  valid: boolean;
  issues: FormalStateMachineProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 * PASS probes must align; documented FAIL gaps must remain aligned (actual === FAIL).
 */
export function validateFormalStateMachineProbeMatrix(
  results: FormalStateMachineProbeResult[],
  contract: FormalStateMachineContract = getActiveFormalStateMachineContract(),
): FormalStateMachineProbeMatrixValidationResult {
  const issues: FormalStateMachineProbeMatrixValidationIssue[] = [];
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

// ─── Property and fuzz validation (P01-B03-A07) ─────────────────────────────

export interface FormalStateMachinePropertyViolation {
  propertyId: string;
  detail: string;
}

export interface FormalStateMachinePropertyResult {
  passed: number;
  failed: FormalStateMachinePropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type FormalStateMachinePropertyCheck = {
  id: string;
  description: string;
  check: (contract: FormalStateMachineContract) => string | null;
};

const FORMAL_STATE_MACHINE_STRUCTURAL_PROPERTIES: readonly FormalStateMachinePropertyCheck[] = [
  {
    id: "categories_complete",
    description: "All seven formal state machine categories are declared",
    check: contract => {
      for (const category of FORMAL_STATE_MACHINE_CATEGORIES) {
        if (!contract.categories[category]) return `missing category: ${category}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listFormalStateMachineContractProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each category meets contract minProbeCount",
    check: contract => {
      for (const category of FORMAL_STATE_MACHINE_CATEGORIES) {
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
    description: "summarizeFormalStateMachineContractCoverage totals match listFormalStateMachineContractProbeIds",
    check: contract => {
      const summary = summarizeFormalStateMachineContractCoverage(contract);
      const ids = listFormalStateMachineContractProbeIds(contract);
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
    description: "Probe ids are namespaced with fsm. prefix",
    check: contract => {
      for (const probe of contract.probes) {
        if (!probe.id.startsWith("fsm.")) {
          return `${probe.id} missing fsm. prefix`;
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const probeIds = listFormalStateMachineContractProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildFormalStateMachineProbeEvidence(
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
        return buildFormalStateMachineProbeTelemetry(id, probe.category, index, index);
      });
      const record = buildFormalStateMachineRunRecord(
        buildFormalStateMachineProvenance(
          "property-check",
          {
            version: "0",
            atom: "x",
            purpose: "x",
            sourceBehaviorMap: buildDefaultFormalStateMachineSourceBehaviorMap(),
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

export function runFormalStateMachinePropertyChecks(
  contract: FormalStateMachineContract = getActiveFormalStateMachineContract(),
): FormalStateMachinePropertyResult {
  const failed: FormalStateMachinePropertyViolation[] = [];
  for (const property of FORMAL_STATE_MACHINE_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = FORMAL_STATE_MACHINE_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type FormalStateMachineFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface FormalStateMachineFuzzMutationCase {
  seed: number;
  kind: FormalStateMachineFuzzMutationKind;
  probeId?: string;
  category?: FormalStateMachineCategory;
}

export interface FormalStateMachineFuzzValidationCaseResult {
  mutation: FormalStateMachineFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface FormalStateMachineFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: FormalStateMachineFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createFormalStateMachineFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneFormalStateMachineFixture(fixture: FormalStateMachineFixture): FormalStateMachineFixture {
  return {
    ...fixture,
    sourceBehaviorMap: { ...fixture.sourceBehaviorMap },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickFormalStateMachineFuzzTarget(
  fixture: FormalStateMachineFixture,
  rng: () => number,
): { category: FormalStateMachineCategory; index: number; entry: FormalStateMachineFixtureEntry } {
  const category = FORMAL_STATE_MACHINE_CATEGORIES[Math.floor(rng() * FORMAL_STATE_MACHINE_CATEGORIES.length)]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyFormalStateMachineFuzzMutation(
  fixture: FormalStateMachineFixture,
  mutation: FormalStateMachineFuzzMutationCase,
): FormalStateMachineFixture {
  const mutated = cloneFormalStateMachineFixture(fixture);
  const targetCategory = mutation.category ?? FORMAL_STATE_MACHINE_CATEGORIES[0]!;
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
          id: `fsm.fuzz.extra.${mutation.seed}`,
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
      const other = FORMAL_STATE_MACHINE_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateFormalStateMachineFuzzMutationCases(
  fixture: FormalStateMachineFixture,
  seed: number,
  iterations: number,
): FormalStateMachineFuzzMutationCase[] {
  const rng = createFormalStateMachineFuzzRng(seed);
  const kinds: FormalStateMachineFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: FormalStateMachineFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickFormalStateMachineFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P01-B03-A07). */
export function runFormalStateMachineFuzzValidation(
  fixture: FormalStateMachineFixture,
  contract: FormalStateMachineContract = getActiveFormalStateMachineContract(),
  seed = 42,
  iterations = 24,
): FormalStateMachineFuzzValidationResult {
  const cases = generateFormalStateMachineFuzzMutationCases(fixture, seed, iterations);
  const results: FormalStateMachineFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyFormalStateMachineFuzzMutation(fixture, mutation);
    const validation = validateFormalStateMachineFixtureAgainstContract(mutated, contract);
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

export type FormalStateMachineRunRecordFuzzKind = "drop_evidence" | "drop_telemetry" | "wrong_total";

export interface FormalStateMachineRunRecordFuzzCase {
  kind: FormalStateMachineRunRecordFuzzKind;
  probeId?: string;
}

export function applyFormalStateMachineRunRecordFuzzMutation(
  record: FormalStateMachineRunRecord,
  mutation: FormalStateMachineRunRecordFuzzCase,
): FormalStateMachineRunRecord {
  const cloned: FormalStateMachineRunRecord = {
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

  cloned.summary = buildFormalStateMachineRunRecord(cloned.provenance, cloned.evidence, cloned.telemetry).summary;
  return cloned;
}

export function runFormalStateMachineRunRecordFuzzValidation(
  record: FormalStateMachineRunRecord,
  contract: FormalStateMachineContract = getActiveFormalStateMachineContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const baseline = validateFormalStateMachineRunRecord(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: FormalStateMachineRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyFormalStateMachineRunRecordFuzzMutation(record, mutation);
    const validation = validateFormalStateMachineRunRecord(mutated, contract);
    if (validation.valid) mutationsAccepted++;
    else mutationsRejected++;
  }

  return {
    validBaseline: baseline.valid,
    mutationsRejected,
    mutationsAccepted,
  };
}
