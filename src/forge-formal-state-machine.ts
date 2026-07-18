/**
 * FOREMAN — Formal State Machine Baseline (P01-B03-A01)
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

export const FORGE_FORMAL_STATE_MACHINE_HARNESS_VERSION = "1.0.0-a01";

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
