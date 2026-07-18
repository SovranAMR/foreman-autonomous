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
  | "baseline_link"
  | "failure_path"
  | "recovery_path"
  | "nogo_path";

/** Probe disposition — observed behavior, documented gap, or resilience path class. */
export type PipelineBehaviorProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

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
  "failure_path",
  "recovery_path",
  "nogo_path",
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
        description: "Orchestrator exports canonical FORGE_PIPELINE_PHASES registry",
        expected: "PASS",
        disposition: "observed",
        criterion: "orchestrator.ts exports FORGE_PIPELINE_PHASES constant",
      },
    ],
  },
  state_sync: {
    category: "state_sync",
    acceptance: {
      invariant:
        "Each pipeline phase transitions SystemState to a matching state, including dedicated atomizing and verifying states.",
      minProbeCount: 7,
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
        description: "Atomize phase transitions SystemState to atomizing",
        expected: "PASS",
        disposition: "observed",
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
      {
        id: "map.verify_state_sync",
        phase: "verify",
        category: "state_sync",
        description: "Verify phase transitions SystemState to verifying",
        expected: "PASS",
        disposition: "observed",
        criterion: 'orchestrator transitions to "verifying" during verify phase',
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
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant:
        "Execute phase detects worker blocks, retries atoms up to MAX_ATOM_RETRIES, and abandons blocks on failure threshold.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "map.worker_blocked_handling",
        phase: "execute",
        category: "failure_path",
        description: "Orchestrator handles worker thought.status === blocked during execute",
        expected: "PASS",
        disposition: "failure",
        criterion: 'orchestrator checks execResult?.thought.status === "blocked"',
      },
      {
        id: "map.atom_retry_loop",
        phase: "execute",
        category: "failure_path",
        description: "Orchestrator retries failed atoms up to MAX_ATOM_RETRIES",
        expected: "PASS",
        disposition: "failure",
        criterion: "MAX_ATOM_RETRIES loop wraps atom execution attempts",
      },
      {
        id: "map.block_abandon_threshold",
        phase: "execute",
        category: "failure_path",
        description: "Orchestrator abandons block when majority of atoms fail",
        expected: "PASS",
        disposition: "failure",
        criterion: "blockFailedAtoms threshold skips remaining atoms in block",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Pipeline exposes re-decompose, rollback-on-reject, and end-of-pipeline recovery phase runners.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "map.re_decompose_phase_presence",
        phase: "decompose",
        category: "recovery_path",
        description: "Orchestrator emits re_decompose phase after block failure",
        expected: "PASS",
        disposition: "recovery",
        criterion: 'orchestrator.ts contains phaseStart("re_decompose"',
      },
      {
        id: "map.recovery_phase_runner",
        phase: "reflect",
        category: "recovery_path",
        description: "Orchestrator runs runRecoveryPhase for queued failed atoms",
        expected: "PASS",
        disposition: "recovery",
        criterion: "runRecoveryPhase emits recovery phase_start events",
      },
      {
        id: "map.rollback_on_reject",
        phase: "execute",
        category: "recovery_path",
        description: "Orchestrator rolls back atom on reviewer REJECT verdict",
        expected: "PASS",
        disposition: "recovery",
        criterion: 'verdict === "REJECT" triggers rollbackLastAtom',
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Pipeline enforces NO-GO gates via hook blocks, reviewer REJECT handling, and rejection feedback injection.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "map.reviewer_reject_handling",
        phase: "verify",
        category: "nogo_path",
        description: "Orchestrator handles reviewer REJECT verdict as NO-GO",
        expected: "PASS",
        disposition: "nogo",
        criterion: 'reviewResult.verdict === "REJECT" branch in execute loop',
      },
      {
        id: "map.rejection_feedback_injection",
        phase: "execute",
        category: "nogo_path",
        description: "Orchestrator injects PREVIOUS ATTEMPT REJECTED feedback on retry",
        expected: "PASS",
        disposition: "nogo",
        criterion: "lastRejectionFeedback injected into worker retry prompt",
      },
      {
        id: "map.hook_block_early_exit",
        phase: "registry",
        category: "nogo_path",
        description: "before_pipeline hook block returns early with blockedAt hooks",
        expected: "PASS",
        disposition: "nogo",
        criterion: 'blockedAt: "hooks" early return on hook block',
      },
    ],
  },
};

/** Per-probe evidence artifact — auditable proof of behavior map probe outcome (P01-B02-A06). */
export interface BehaviorMapProbeEvidence {
  probeId: string;
  phase: ForgePipelineCorePhase | "registry";
  category: PipelineBehaviorCategory;
  disposition: PipelineBehaviorProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for behavior map runs (P01-B02-A06). */
export interface BehaviorMapProbeTelemetry {
  probeId: string;
  category: PipelineBehaviorCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P01-B02-A06). */
export interface BehaviorMapProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourceBaselineVersion: string;
  sourceBaselineAtom: string;
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated behavior map run record bundling evidence, telemetry and provenance. */
export interface BehaviorMapRunRecord {
  provenance: BehaviorMapProvenance;
  evidence: BehaviorMapProbeEvidence[];
  telemetry: BehaviorMapProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<PipelineBehaviorCategory, number>;
    byDisposition: Record<PipelineBehaviorProbeDisposition, number>;
  };
}

export interface BehaviorMapRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface BehaviorMapRunValidationResult {
  valid: boolean;
  issues: BehaviorMapRunValidationIssue[];
}

export const FORGE_BEHAVIOR_MAP_HARNESS_VERSION = "1.0.0";

export function buildBehaviorMapProbeEvidence(
  probeId: string,
  phase: ForgePipelineCorePhase | "registry",
  category: PipelineBehaviorCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: PipelineBehaviorProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): BehaviorMapProbeEvidence {
  return {
    probeId,
    phase,
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

export function buildBehaviorMapProbeTelemetry(
  probeId: string,
  category: PipelineBehaviorCategory,
  sequenceIndex: number,
  durationMs: number,
): BehaviorMapProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildBehaviorMapProvenance(
  runId: string,
  fixture: PipelineBehaviorMapFixture,
  contract: PipelineBehaviorMapContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  gitCommit?: string,
): BehaviorMapProvenance {
  return {
    runId,
    harnessVersion: FORGE_BEHAVIOR_MAP_HARNESS_VERSION,
    contractVersion: contract.version,
    contractAtom: contract.atom,
    fixtureVersion: fixture.version,
    fixtureAtom: fixture.atom,
    sourceBaselineVersion: fixture.sourceBaseline.version,
    sourceBaselineAtom: fixture.sourceBaseline.atom,
    startedAt,
    completedAt,
    totalProbes,
    ...(gitCommit ? { gitCommit } : {}),
  };
}

export function buildBehaviorMapRunRecord(
  provenance: BehaviorMapProvenance,
  evidence: BehaviorMapProbeEvidence[],
  telemetry: BehaviorMapProbeTelemetry[],
): BehaviorMapRunRecord {
  const byCategory = {} as Record<PipelineBehaviorCategory, number>;
  const byDisposition: Record<PipelineBehaviorProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of PIPELINE_BEHAVIOR_CATEGORIES) {
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

export function validateBehaviorMapRunRecord(
  record: BehaviorMapRunRecord,
  contract: PipelineBehaviorMapContract = getActivePipelineBehaviorMapContract(),
): BehaviorMapRunValidationResult {
  const issues: BehaviorMapRunValidationIssue[] = [];
  const expectedProbeCount = listBehaviorMapProbeIds(contract).length;

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

  for (const probeId of listBehaviorMapProbeIds(contract)) {
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

  return { valid: issues.length === 0, issues };
}

/** Regression report when comparing two behavior map run records (P01-B02-A08). */
export interface BehaviorMapProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare behavior map run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectBehaviorMapProbeRegression(
  prior: BehaviorMapRunRecord,
  current: BehaviorMapRunRecord,
): BehaviorMapProbeRegressionReport {
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

  const hasRegression = regressions.length > 0 || current.summary.mismatches > prior.summary.mismatches;
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

/** Typed pipeline behavior map contract v1 — source of truth for phase→behavior acceptance. */
export const FORGE_PIPELINE_BEHAVIOR_MAP_CONTRACT_V1: PipelineBehaviorMapContract = {
  version: "1.0.0",
  atom: "P01-B02-A07",
  purpose:
    "Measurable acceptance criteria for orchestrator pipeline phase→behavior map (presence, state sync, checkpoint, stream, B01 link, failure/recovery/NO-GO paths).",
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
    failure: 0,
    recovery: 0,
    nogo: 0,
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

  const expectedFailCount = contract.probes.filter(p => p.expected === "FAIL").length;
  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (expectedFailCount > 0 && failGaps.length === 0) {
    issues.push({ kind: "missing_gap", detail: "fixture must document known FAIL gaps matching contract" });
  }
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "mismatch",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${expectedFailCount}`,
    });
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

// ─── Property and fuzz validation (P01-B02-A07) ─────────────────────────────

export interface BehaviorMapPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface BehaviorMapPropertyResult {
  passed: number;
  failed: BehaviorMapPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type BehaviorMapPropertyCheck = {
  id: string;
  description: string;
  check: (contract: PipelineBehaviorMapContract) => string | null;
};

const BEHAVIOR_MAP_STRUCTURAL_PROPERTIES: readonly BehaviorMapPropertyCheck[] = [
  {
    id: "categories_complete",
    description: "All eight behavior categories are declared",
    check: contract => {
      for (const category of PIPELINE_BEHAVIOR_CATEGORIES) {
        if (!contract.categories[category]) return `missing category: ${category}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listBehaviorMapProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each category meets contract minProbeCount",
    check: contract => {
      for (const category of PIPELINE_BEHAVIOR_CATEGORIES) {
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
    description: "summarizeBehaviorMapContractCoverage totals match listBehaviorMapProbeIds",
    check: contract => {
      const summary = summarizeBehaviorMapContractCoverage(contract);
      const ids = listBehaviorMapProbeIds(contract);
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
    description: "Probe ids are namespaced with map. prefix",
    check: contract => {
      for (const probe of contract.probes) {
        if (!probe.id.startsWith("map.")) {
          return `${probe.id} missing map. prefix`;
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const probeIds = listBehaviorMapProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildBehaviorMapProbeEvidence(
          id,
          probe.phase,
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
        return buildBehaviorMapProbeTelemetry(id, probe.category, index, index);
      });
      const record = buildBehaviorMapRunRecord(
        buildBehaviorMapProvenance(
          "property-check",
          {
            version: "0",
            atom: "x",
            purpose: "x",
            sourceBaseline: buildDefaultBehaviorMapSourceBaseline(),
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

export function runBehaviorMapPropertyChecks(
  contract: PipelineBehaviorMapContract = getActivePipelineBehaviorMapContract(),
): BehaviorMapPropertyResult {
  const failed: BehaviorMapPropertyViolation[] = [];
  for (const property of BEHAVIOR_MAP_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = BEHAVIOR_MAP_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type BehaviorMapFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface BehaviorMapFuzzMutationCase {
  seed: number;
  kind: BehaviorMapFuzzMutationKind;
  probeId?: string;
  category?: PipelineBehaviorCategory;
}

export interface BehaviorMapFuzzValidationCaseResult {
  mutation: BehaviorMapFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface BehaviorMapFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: BehaviorMapFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createBehaviorMapFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneBehaviorMapFixture(fixture: PipelineBehaviorMapFixture): PipelineBehaviorMapFixture {
  return {
    ...fixture,
    sourceBaseline: { ...fixture.sourceBaseline },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickBehaviorMapFuzzTarget(
  fixture: PipelineBehaviorMapFixture,
  rng: () => number,
): { category: PipelineBehaviorCategory; index: number; entry: PipelineBehaviorFixtureEntry } {
  const category = PIPELINE_BEHAVIOR_CATEGORIES[Math.floor(rng() * PIPELINE_BEHAVIOR_CATEGORIES.length)]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyBehaviorMapFuzzMutation(
  fixture: PipelineBehaviorMapFixture,
  mutation: BehaviorMapFuzzMutationCase,
): PipelineBehaviorMapFixture {
  const mutated = cloneBehaviorMapFixture(fixture);
  const targetCategory = mutation.category ?? PIPELINE_BEHAVIOR_CATEGORIES[0]!;
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
          id: `map.fuzz.extra.${mutation.seed}`,
          phase: "registry",
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
      const other = PIPELINE_BEHAVIOR_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateBehaviorMapFuzzMutationCases(
  fixture: PipelineBehaviorMapFixture,
  seed: number,
  iterations: number,
): BehaviorMapFuzzMutationCase[] {
  const rng = createBehaviorMapFuzzRng(seed);
  const kinds: BehaviorMapFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: BehaviorMapFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickBehaviorMapFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P01-B02-A07). */
export function runBehaviorMapFuzzValidation(
  fixture: PipelineBehaviorMapFixture,
  contract: PipelineBehaviorMapContract = getActivePipelineBehaviorMapContract(),
  seed = 42,
  iterations = 24,
): BehaviorMapFuzzValidationResult {
  const cases = generateBehaviorMapFuzzMutationCases(fixture, seed, iterations);
  const results: BehaviorMapFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyBehaviorMapFuzzMutation(fixture, mutation);
    const validation = validateBehaviorMapFixtureAgainstContract(mutated, contract);
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

export type BehaviorMapRunRecordFuzzKind = "drop_evidence" | "drop_telemetry" | "wrong_total";

export interface BehaviorMapRunRecordFuzzCase {
  kind: BehaviorMapRunRecordFuzzKind;
  probeId?: string;
}

export function applyBehaviorMapRunRecordFuzzMutation(
  record: BehaviorMapRunRecord,
  mutation: BehaviorMapRunRecordFuzzCase,
): BehaviorMapRunRecord {
  const cloned: BehaviorMapRunRecord = {
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

  cloned.summary = buildBehaviorMapRunRecord(cloned.provenance, cloned.evidence, cloned.telemetry).summary;
  return cloned;
}

export function runBehaviorMapRunRecordFuzzValidation(
  record: BehaviorMapRunRecord,
  contract: PipelineBehaviorMapContract = getActivePipelineBehaviorMapContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const baseline = validateBehaviorMapRunRecord(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: BehaviorMapRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyBehaviorMapRunRecordFuzzMutation(record, mutation);
    const validation = validateBehaviorMapRunRecord(mutated, contract);
    if (validation.valid) mutationsAccepted++;
    else mutationsRejected++;
  }

  return {
    validBaseline: baseline.valid,
    mutationsRejected,
    mutationsAccepted,
  };
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

// ─── Guard controls (P01-B02-A09) ────────────────────────────────────────────

export interface ForgeBehaviorMapGuardControls {
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

export interface BehaviorMapGuardCheckIssue {
  domain: "adversarial" | "performance" | "cost" | "safety";
  code: string;
  detail: string;
}

export interface BehaviorMapGuardCheckResult {
  passed: boolean;
  issues: BehaviorMapGuardCheckIssue[];
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

export interface BehaviorMapAdversarialGuardScenario {
  id: string;
  description: string;
  build: (record: BehaviorMapRunRecord) => BehaviorMapRunRecord;
  expectRejected: true;
}

export const FORGE_BEHAVIOR_MAP_GUARD_CONTROLS_V1: ForgeBehaviorMapGuardControls = {
  atom: "P01-B02-A09",
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

export function getForgeBehaviorMapGuardControls(): ForgeBehaviorMapGuardControls {
  return FORGE_BEHAVIOR_MAP_GUARD_CONTROLS_V1;
}

function parseBehaviorMapIsoDurationMs(startedAt: string, completedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function summarizeBehaviorMapTelemetry(telemetry: BehaviorMapProbeTelemetry[]): {
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

export function detectBehaviorMapEvidenceSummaryMismatch(record: BehaviorMapRunRecord): string | null {
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

export function detectBehaviorMapFalseAlignment(record: BehaviorMapRunRecord): string[] {
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

export function validateBehaviorMapSafety(
  record: BehaviorMapRunRecord,
  controls: ForgeBehaviorMapGuardControls = getForgeBehaviorMapGuardControls(),
): BehaviorMapGuardCheckIssue[] {
  const issues: BehaviorMapGuardCheckIssue[] = [];
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

export function validateBehaviorMapPerformance(
  record: BehaviorMapRunRecord,
  controls: ForgeBehaviorMapGuardControls = getForgeBehaviorMapGuardControls(),
): BehaviorMapGuardCheckIssue[] {
  const issues: BehaviorMapGuardCheckIssue[] = [];
  const { suiteDurationMs, maxProbeDurationMs } = summarizeBehaviorMapTelemetry(record.telemetry);
  const wallClockMs = parseBehaviorMapIsoDurationMs(record.provenance.startedAt, record.provenance.completedAt);

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

export function validateBehaviorMapCost(
  totalCostUsd: number,
  llmCalls: number,
  controls: ForgeBehaviorMapGuardControls = getForgeBehaviorMapGuardControls(),
): BehaviorMapGuardCheckIssue[] {
  const issues: BehaviorMapGuardCheckIssue[] = [];
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

export function buildBehaviorMapAdversarialGuardScenarios(): BehaviorMapAdversarialGuardScenario[] {
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

export function runBehaviorMapAdversarialGuardChecks(
  behaviorMapRecord: BehaviorMapRunRecord,
  contract: PipelineBehaviorMapContract = getActivePipelineBehaviorMapContract(),
): { rejected: number; total: number; failures: string[] } {
  const scenarios = buildBehaviorMapAdversarialGuardScenarios();
  const failures: string[] = [];
  let rejected = 0;

  for (const scenario of scenarios) {
    const tampered = scenario.build(behaviorMapRecord);
    const validation = validateBehaviorMapRunRecord(tampered, contract);
    const falseAlignment = detectBehaviorMapFalseAlignment(tampered);
    const summaryMismatch = detectBehaviorMapEvidenceSummaryMismatch(tampered);
    const rejectedByGuard =
      !validation.valid || falseAlignment.length > 0 || summaryMismatch !== null;

    if (rejectedByGuard) rejected++;
    else failures.push(`${scenario.id}: tampered record was not rejected`);
  }

  return { rejected, total: scenarios.length, failures };
}

export function validateForgeBehaviorMapGuard(
  record: BehaviorMapRunRecord,
  options: {
    totalCostUsd?: number;
    llmCalls?: number;
    contract?: PipelineBehaviorMapContract;
    controls?: ForgeBehaviorMapGuardControls;
  } = {},
): BehaviorMapGuardCheckResult {
  const controls = options.controls ?? getForgeBehaviorMapGuardControls();
  const contract = options.contract ?? getActivePipelineBehaviorMapContract();
  const totalCostUsd = options.totalCostUsd ?? 0;
  const llmCalls = options.llmCalls ?? 0;
  const issues: BehaviorMapGuardCheckIssue[] = [];

  issues.push(...validateBehaviorMapPerformance(record, controls));
  issues.push(...validateBehaviorMapCost(totalCostUsd, llmCalls, controls));
  issues.push(...validateBehaviorMapSafety(record, controls));

  const falseAlignment = detectBehaviorMapFalseAlignment(record);
  if (falseAlignment.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "false_alignment",
      detail: falseAlignment.join("; "),
    });
  }
  const summaryMismatch = detectBehaviorMapEvidenceSummaryMismatch(record);
  if (summaryMismatch) {
    issues.push({
      domain: "adversarial",
      code: "summary_evidence_mismatch",
      detail: summaryMismatch,
    });
  }

  const adversarial = runBehaviorMapAdversarialGuardChecks(record, contract);
  if (adversarial.failures.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "scenario_not_rejected",
      detail: adversarial.failures.join("; "),
    });
  }

  const telemetrySummary = summarizeBehaviorMapTelemetry(record.telemetry);
  const wallClockMs = parseBehaviorMapIsoDurationMs(record.provenance.startedAt, record.provenance.completedAt);

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
