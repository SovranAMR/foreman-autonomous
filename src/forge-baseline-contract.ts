/**
 * FOREMAN — Forge Baseline Typed Contract (P01-B01-A02)
 *
 * Canonical typed acceptance contract for Forge Pipeline path guarantees.
 * Each path category defines measurable invariants and probe-to-criterion mapping.
 */

export type ForgeBaselinePath =
  | "state"
  | "tool"
  | "verification"
  | "reviewer"
  | "rollback"
  | "resume";

export type ForgeAcceptanceOutcome = "PASS" | "FAIL";

/** Probe disposition — how the scenario exercises pipeline resilience. */
export type ForgeProbeDisposition = "happy" | "failure" | "recovery" | "nogo";

/** @deprecated Use ForgeAcceptanceOutcome — kept for harness compatibility. */
export type BaselineOutcome = ForgeAcceptanceOutcome;

/** @deprecated Use ForgeBaselinePath — kept for harness compatibility. */
export type BaselinePath = ForgeBaselinePath;

export interface ForgeBaselineFixtureEntry {
  id: string;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface ForgeBaselineFixture {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  paths: Record<ForgeBaselinePath, ForgeBaselineFixtureEntry[]>;
}

export interface ForgeProbeContract {
  id: string;
  description: string;
  expected: ForgeAcceptanceOutcome;
  /** Scenario class: happy path, failure handling, recovery, or NO-GO gate. */
  disposition: ForgeProbeDisposition;
  /** Measurable assertion enforced by the baseline harness probe. */
  criterion: string;
}

export interface ForgePathAcceptance {
  /** Path-level invariant that all probes collectively enforce. */
  invariant: string;
  /** Minimum number of probes required for this path category. */
  minProbeCount: number;
  /** All probes must align (actual === expected); documented FAIL gaps included. */
  requireFullAlignment: true;
}

export interface ForgePathContract {
  path: ForgeBaselinePath;
  acceptance: ForgePathAcceptance;
  probes: readonly ForgeProbeContract[];
}

export interface ForgeBaselineContract {
  version: string;
  atom: string;
  purpose: string;
  paths: Record<ForgeBaselinePath, ForgePathContract>;
}

export interface ContractValidationIssue {
  kind: "missing_probe" | "extra_probe" | "mismatch" | "underflow" | "missing_path";
  path?: ForgeBaselinePath;
  probeId?: string;
  detail: string;
}

export interface ContractValidationResult {
  valid: boolean;
  issues: ContractValidationIssue[];
}

export const FORGE_BASELINE_PATHS: readonly ForgeBaselinePath[] = [
  "state",
  "tool",
  "verification",
  "reviewer",
  "rollback",
  "resume",
] as const;

/** Typed Forge baseline contract v1 — source of truth for probe acceptance. */
export const FORGE_BASELINE_CONTRACT_V1: ForgeBaselineContract = {
  version: "1.0.0",
  atom: "P01-B01-A02",
  purpose:
    "Measurable acceptance criteria for Forge Pipeline path guarantees (state, tool, verification, reviewer, rollback, resume).",
  paths: {
    state: {
      path: "state",
      acceptance: {
        invariant:
          "StateManager enforces VALID_TRANSITIONS, rejects illegal jumps, and requires non-empty transition reasons.",
        minProbeCount: 5,
        requireFullAlignment: true,
      },
      probes: [
        {
          id: "state.valid_pipeline_chain",
          description: "StateManager accepts the canonical Forge transition chain idle→complete",
          expected: "PASS",
          disposition: "happy",
          criterion: "idle→visioning→decomposing→executing→verifying→complete succeeds; final state is complete",
        },
        {
          id: "state.rejects_skip_to_executing",
          description: "Invalid idle→executing transition is rejected without mutating state",
          expected: "PASS",
          disposition: "happy",
          criterion: "InvalidTransitionError thrown; state remains idle",
        },
        {
          id: "state.rejects_empty_reason",
          description: "Transitions without a reason are rejected",
          expected: "PASS",
          disposition: "happy",
          criterion: "MissingReasonError thrown on empty reason",
        },
        {
          id: "state.blocked_from_executing",
          description: "Pipeline can enter blocked state from executing (failure path)",
          expected: "PASS",
          disposition: "failure",
          criterion: "executing→blocked succeeds; current state is blocked",
        },
        {
          id: "state.recover_from_blocked",
          description: "Pipeline can replan via blocked→decomposing (recovery path)",
          expected: "PASS",
          disposition: "recovery",
          criterion: "blocked→decomposing succeeds; current state is decomposing",
        },
      ],
    },
    tool: {
      path: "tool",
      acceptance: {
        invariant:
          "Tool catalog registers core execution tools; unknown tools return errors; hooks can block invocations.",
        minProbeCount: 3,
        requireFullAlignment: true,
      },
      probes: [
        {
          id: "tool.definitions_registered",
          description: "Forge worker tool catalog exposes core execution tools",
          expected: "PASS",
          disposition: "happy",
          criterion: "bash, read_file, edit_file registered; catalog size >= 40",
        },
        {
          id: "tool.unknown_tool_errors",
          description: "Unknown tool names return an error result instead of silent success",
          expected: "PASS",
          disposition: "failure",
          criterion: "execute({name:'not_a_real_tool'}) returns isError with 'Unknown tool'",
        },
        {
          id: "tool.hooks_can_block",
          description: "before_tool_call hook can block a tool invocation",
          expected: "PASS",
          disposition: "nogo",
          criterion: "blocked hook yields isError containing 'blocked'",
        },
      ],
    },
    verification: {
      path: "verification",
      acceptance: {
        invariant:
          "Verification engine parses build/test output and detects regressions between runs.",
        minProbeCount: 4,
        requireFullAlignment: true,
      },
      probes: [
        {
          id: "verification.parse_build_success",
          description: "parseBuildOutput marks clean build output as success",
          expected: "PASS",
          disposition: "happy",
          criterion: "Vite success output → success=true",
        },
        {
          id: "verification.parse_build_errors",
          description: "parseBuildOutput extracts file:line errors from TypeScript output",
          expected: "PASS",
          disposition: "failure",
          criterion: "TS error line parsed with file src/app.ts and error count 1",
        },
        {
          id: "verification.parse_test_output",
          description: "parseTestOutput counts pass/fail from node:test output",
          expected: "PASS",
          disposition: "happy",
          criterion: "total=2, passed=1, failed=1 from node:test symbols",
        },
        {
          id: "verification.detect_regressions",
          description: "detectRegressions flags newly failing tests against prior run",
          expected: "PASS",
          disposition: "failure",
          criterion: "hasRegression=true and regressions includes 'stable test'",
        },
      ],
    },
    reviewer: {
      path: "reviewer",
      acceptance: {
        invariant:
          "Reviewer gate validates worker protocol completeness, trivial verify rejection, and forbidden-list violations.",
        minProbeCount: 6,
        requireFullAlignment: true,
      },
      probes: [
        {
          id: "reviewer.good_protocol_passes",
          description: "quickReviewCheck accepts a complete worker protocol aligned with vision",
          expected: "PASS",
          disposition: "happy",
          criterion: "GOOD_PROTOCOL + VISION_DOC → null (pass)",
        },
        {
          id: "reviewer.trivial_verify_rejected",
          description: "quickReviewCheck rejects trivial STEP7_VERIFY text",
          expected: "PASS",
          disposition: "nogo",
          criterion: "step7_verify='Looks good' → verdict REJECT",
        },
        {
          id: "reviewer.forbidden_violation_rejected",
          description: "quickReviewCheck rejects FORBIDDEN-list violations in worker output",
          expected: "PASS",
          disposition: "nogo",
          criterion: "particle rain in step6 → verdict REJECT",
        },
        {
          id: "reviewer.empty_llm_response_passes",
          description: "Empty reviewer LLM response is classified insufficient (no auto-PASS leniency)",
          expected: "PASS",
          disposition: "nogo",
          criterion: "classifyReviewerLlmResponse rejects empty/short output; orchestrator retries instead of auto-PASS",
        },
        {
          id: "reviewer.nogo_reject_verdict",
          description: "parseReviewResponse maps REJECT verdict to NO-GO with rejection feedback",
          expected: "PASS",
          disposition: "nogo",
          criterion: "VERDICT: REJECT → verdict=REJECT and rejectionFeedback defined",
        },
        {
          id: "reviewer.nogo_needs_revision",
          description: "parseReviewResponse maps NEEDS_REVISION to NO-GO with actionable feedback",
          expected: "PASS",
          disposition: "nogo",
          criterion: "VERDICT: NEEDS_REVISION → verdict=NEEDS_REVISION and rejectionFeedback defined",
        },
      ],
    },
    rollback: {
      path: "rollback",
      acceptance: {
        invariant:
          "Rollback engine tracks history; orchestrator invokes createPoint; non-git projects expose documented gap.",
        minProbeCount: 5,
        requireFullAlignment: true,
      },
      probes: [
        {
          id: "rollback.point_without_git",
          description: "RollbackEngine.createPoint returns null when project is not a git repo",
          expected: "PASS",
          disposition: "failure",
          criterion: "createPoint returns null and isGitRepository() is false without git repo",
        },
        {
          id: "rollback.history_tracks_attempts",
          description: "RollbackEngine persists rollback history metadata",
          expected: "PASS",
          disposition: "happy",
          criterion: "getHistory().rollbacks is array",
        },
        {
          id: "rollback.orchestrator_calls_create_point",
          description: "Orchestrator.run invokes rollback.createPoint at pipeline start",
          expected: "PASS",
          disposition: "happy",
          criterion: "mock orchestrator run sets createPointCalled=true",
        },
        {
          id: "rollback.unknown_point_fails",
          description: "Rollback to unknown point returns success=false without throwing",
          expected: "PASS",
          disposition: "failure",
          criterion: "rollback('rb_nonexistent') → success=false with error message",
        },
        {
          id: "rollback.last_atom_no_points",
          description: "rollbackLastAtom returns null when insufficient atom checkpoints exist",
          expected: "PASS",
          disposition: "failure",
          criterion: "rollbackLastAtom() === null on empty point history",
        },
      ],
    },
    resume: {
      path: "resume",
      acceptance: {
        invariant:
          "Pipeline resume persists checkpoints, tracks atom completion, and starts fresh when checkpoint missing.",
        minProbeCount: 4,
        requireFullAlignment: true,
      },
      probes: [
        {
          id: "resume.checkpoint_roundtrip",
          description: "PipelineResumeEngine persists and reloads checkpoint data",
          expected: "PASS",
          disposition: "happy",
          criterion: "createCheckpoint + updatePhase + loadCheckpoint preserves task and phase",
        },
        {
          id: "resume.atom_completion_tracking",
          description: "PipelineResumeEngine.isAtomCompleted reflects completed atom keys",
          expected: "PASS",
          disposition: "happy",
          criterion: "completeAtom(0,1) → isAtomCompleted(0,1)=true, (0,2)=false",
        },
        {
          id: "resume.missing_checkpoint_starts_fresh",
          description: "run({resume:true}) without checkpoint continues as fresh run (warning only)",
          expected: "PASS",
          disposition: "recovery",
          criterion: "resume=true without checkpoint → success=true, resumed≠true",
        },
        {
          id: "resume.corrupt_checkpoint_returns_null",
          description: "Corrupt checkpoint JSON returns null on load (recovery without crash)",
          expected: "PASS",
          disposition: "recovery",
          criterion: "invalid JSON at checkpoint path → loadCheckpoint() === null",
        },
      ],
    },
  },
};

export function getActiveForgeBaselineContract(): ForgeBaselineContract {
  return FORGE_BASELINE_CONTRACT_V1;
}

export function getPathContract(
  contract: ForgeBaselineContract,
  path: ForgeBaselinePath,
): ForgePathContract {
  return contract.paths[path];
}

export function listContractProbeIds(contract: ForgeBaselineContract): string[] {
  const ids: string[] = [];
  for (const path of FORGE_BASELINE_PATHS) {
    for (const probe of contract.paths[path].probes) {
      ids.push(probe.id);
    }
  }
  return ids;
}

export function validateFixtureAgainstContract(
  fixture: ForgeBaselineFixture,
  contract: ForgeBaselineContract = getActiveForgeBaselineContract(),
): ContractValidationResult {
  const issues: ContractValidationIssue[] = [];

  for (const path of FORGE_BASELINE_PATHS) {
    const pathContract = contract.paths[path];
    const fixtureProbes = fixture.paths[path];

    if (!fixtureProbes) {
      issues.push({
        kind: "missing_path",
        path,
        detail: `fixture missing path category: ${path}`,
      });
      continue;
    }

    if (fixtureProbes.length < pathContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        path,
        detail: `${path} has ${fixtureProbes.length} probes; contract requires >= ${pathContract.acceptance.minProbeCount}`,
      });
    }

    const contractById = new Map(pathContract.probes.map(p => [p.id, p]));
    const fixtureIds = new Set<string>();

    for (const entry of fixtureProbes) {
      fixtureIds.add(entry.id);
      const spec = contractById.get(entry.id);
      if (!spec) {
        issues.push({
          kind: "extra_probe",
          path,
          probeId: entry.id,
          detail: `fixture probe not declared in contract: ${entry.id}`,
        });
        continue;
      }

      if (entry.expected !== spec.expected) {
        issues.push({
          kind: "mismatch",
          path,
          probeId: entry.id,
          detail: `expected outcome mismatch for ${entry.id}: fixture=${entry.expected} contract=${spec.expected}`,
        });
      }

      if (entry.description !== spec.description) {
        issues.push({
          kind: "mismatch",
          path,
          probeId: entry.id,
          detail: `description mismatch for ${entry.id}`,
        });
      }
    }

    for (const spec of pathContract.probes) {
      if (!fixtureIds.has(spec.id)) {
        issues.push({
          kind: "missing_probe",
          path,
          probeId: spec.id,
          detail: `contract probe missing from fixture: ${spec.id}`,
        });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

export function summarizeContractCoverage(contract: ForgeBaselineContract = getActiveForgeBaselineContract()): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byPath: Record<ForgeBaselinePath, { probeCount: number; invariant: string }>;
  byDisposition: Record<ForgeProbeDisposition, number>;
} {
  const byPath = {} as Record<ForgeBaselinePath, { probeCount: number; invariant: string }>;
  const byDisposition: Record<ForgeProbeDisposition, number> = {
    happy: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const path of FORGE_BASELINE_PATHS) {
    const pathContract = contract.paths[path];
    byPath[path] = {
      probeCount: pathContract.probes.length,
      invariant: pathContract.acceptance.invariant,
    };
    for (const probe of pathContract.probes) {
      totalProbes++;
      byDisposition[probe.disposition]++;
      if (probe.expected === "PASS") expectedPass++;
      else expectedFail++;
    }
  }

  return { totalProbes, expectedPass, expectedFail, byPath, byDisposition };
}

export function listProbesByDisposition(
  disposition: ForgeProbeDisposition,
  contract: ForgeBaselineContract = getActiveForgeBaselineContract(),
): ForgeProbeContract[] {
  const probes: ForgeProbeContract[] = [];
  for (const path of FORGE_BASELINE_PATHS) {
    for (const probe of contract.paths[path].probes) {
      if (probe.disposition === disposition) {
        probes.push(probe);
      }
    }
  }
  return probes;
}

/** Per-probe evidence artifact — auditable proof of baseline probe outcome (P01-B01-A06). */
export interface ForgeProbeEvidence {
  probeId: string;
  path: ForgeBaselinePath;
  disposition: ForgeProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for baseline runs (P01-B01-A06). */
export interface ForgeProbeTelemetry {
  probeId: string;
  path: ForgeBaselinePath;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P01-B01-A06). */
export interface ForgeBaselineProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated baseline run record bundling evidence, telemetry and provenance. */
export interface ForgeBaselineRunRecord {
  provenance: ForgeBaselineProvenance;
  evidence: ForgeProbeEvidence[];
  telemetry: ForgeProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byDisposition: Record<ForgeProbeDisposition, number>;
  };
}

export interface BaselineRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface BaselineRunValidationResult {
  valid: boolean;
  issues: BaselineRunValidationIssue[];
}

export const FORGE_BASELINE_HARNESS_VERSION = "1.0.0";

export function buildProbeEvidence(
  probeId: string,
  path: ForgeBaselinePath,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: ForgeProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): ForgeProbeEvidence {
  return {
    probeId,
    path,
    disposition,
    expected,
    actual,
    aligned,
    criterion,
    detail,
    recordedAt,
  };
}

export function buildProbeTelemetry(
  probeId: string,
  path: ForgeBaselinePath,
  sequenceIndex: number,
  durationMs: number,
): ForgeProbeTelemetry {
  return {
    probeId,
    path,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildBaselineProvenance(
  runId: string,
  fixture: ForgeBaselineFixture,
  contract: ForgeBaselineContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  gitCommit?: string,
): ForgeBaselineProvenance {
  return {
    runId,
    harnessVersion: FORGE_BASELINE_HARNESS_VERSION,
    contractVersion: contract.version,
    contractAtom: contract.atom,
    fixtureVersion: fixture.version,
    fixtureAtom: fixture.atom,
    startedAt,
    completedAt,
    totalProbes,
    ...(gitCommit ? { gitCommit } : {}),
  };
}

export function buildBaselineRunRecord(
  provenance: ForgeBaselineProvenance,
  evidence: ForgeProbeEvidence[],
  telemetry: ForgeProbeTelemetry[],
): ForgeBaselineRunRecord {
  const byDisposition: Record<ForgeProbeDisposition, number> = {
    happy: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let aligned = 0;
  for (const item of evidence) {
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
      byDisposition,
    },
  };
}

export function validateBaselineRunRecord(
  record: ForgeBaselineRunRecord,
  contract: ForgeBaselineContract = getActiveForgeBaselineContract(),
): BaselineRunValidationResult {
  const issues: BaselineRunValidationIssue[] = [];
  const expectedProbeCount = listContractProbeIds(contract).length;

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

  for (const probeId of listContractProbeIds(contract)) {
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

/** Structural property violation surfaced by contract property suite (P01-B01-A07). */
export interface ContractPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface ContractPropertyResult {
  passed: number;
  failed: ContractPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type ContractPropertyCheck = {
  id: string;
  description: string;
  check: (contract: ForgeBaselineContract) => string | null;
};

const CONTRACT_STRUCTURAL_PROPERTIES: readonly ContractPropertyCheck[] = [
  {
    id: "paths_complete",
    description: "All six baseline path categories are declared",
    check: contract => {
      for (const path of FORGE_BASELINE_PATHS) {
        if (!contract.paths[path]) return `missing path: ${path}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listContractProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each path meets contract minProbeCount",
    check: contract => {
      for (const path of FORGE_BASELINE_PATHS) {
        const pathContract = contract.paths[path];
        if (pathContract.probes.length < pathContract.acceptance.minProbeCount) {
          return `${path} has ${pathContract.probes.length} probes; requires >= ${pathContract.acceptance.minProbeCount}`;
        }
      }
      return null;
    },
  },
  {
    id: "criterion_measurable",
    description: "Every probe declares a measurable criterion",
    check: contract => {
      for (const path of FORGE_BASELINE_PATHS) {
        for (const probe of contract.paths[path].probes) {
          if (probe.criterion.trim().length <= 10) {
            return `${probe.id} criterion too short`;
          }
        }
      }
      return null;
    },
  },
  {
    id: "coverage_consistent",
    description: "summarizeContractCoverage totals match listContractProbeIds",
    check: contract => {
      const summary = summarizeContractCoverage(contract);
      const ids = listContractProbeIds(contract);
      if (summary.totalProbes !== ids.length) {
        return `totalProbes=${summary.totalProbes} ids=${ids.length}`;
      }
      const dispositionSum =
        summary.byDisposition.happy +
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
    description: "Probe ids are namespaced by path category",
    check: contract => {
      for (const path of FORGE_BASELINE_PATHS) {
        for (const probe of contract.paths[path].probes) {
          if (!probe.id.startsWith(`${path}.`)) {
            return `${probe.id} missing ${path}. prefix`;
          }
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const probeIds = listContractProbeIds(contract);
      const evidence = probeIds.map(id => {
        const path = FORGE_BASELINE_PATHS.find(p => contract.paths[p].probes.some(probe => probe.id === id))!;
        const probe = contract.paths[path].probes.find(p => p.id === id)!;
        return buildProbeEvidence(id, path, probe.expected, probe.expected, true, probe.criterion, "synthetic", probe.disposition);
      });
      const telemetry = probeIds.map((id, index) => {
        const path = FORGE_BASELINE_PATHS.find(p => contract.paths[p].probes.some(probe => probe.id === id))!;
        return buildProbeTelemetry(id, path, index, index);
      });
      const record = buildBaselineRunRecord(
        buildBaselineProvenance(
          "property-check",
          { version: "0", atom: "x", purpose: "x", paths: {} as ForgeBaselineFixture["paths"] },
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

export function runContractPropertyChecks(
  contract: ForgeBaselineContract = getActiveForgeBaselineContract(),
): ContractPropertyResult {
  const failed: ContractPropertyViolation[] = [];
  for (const property of CONTRACT_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = CONTRACT_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type FuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "truncate_description";

export interface FuzzMutationCase {
  seed: number;
  kind: FuzzMutationKind;
  probeId?: string;
  path?: ForgeBaselinePath;
}

export interface FuzzValidationCaseResult {
  mutation: FuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface FuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: FuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneFixture(fixture: ForgeBaselineFixture): ForgeBaselineFixture {
  const paths = {} as ForgeBaselineFixture["paths"];
  for (const path of FORGE_BASELINE_PATHS) {
    paths[path] = fixture.paths[path].map(entry => ({ ...entry }));
  }
  return { ...fixture, paths };
}

function pickFuzzTarget(
  fixture: ForgeBaselineFixture,
  rng: () => number,
): { path: ForgeBaselinePath; index: number; entry: ForgeBaselineFixtureEntry } {
  const path = FORGE_BASELINE_PATHS[Math.floor(rng() * FORGE_BASELINE_PATHS.length)]!;
  const entries = fixture.paths[path];
  const index = Math.floor(rng() * entries.length);
  return { path, index, entry: entries[index]! };
}

export function applyFuzzMutation(
  fixture: ForgeBaselineFixture,
  mutation: FuzzMutationCase,
): ForgeBaselineFixture {
  const mutated = cloneFixture(fixture);
  const targetPath = mutation.path ?? FORGE_BASELINE_PATHS[0]!;
  const entries = mutated.paths[targetPath];

  switch (mutation.kind) {
    case "flip_expected": {
      const probeId = mutation.probeId ?? entries[0]!.id;
      const entry = entries.find(e => e.id === probeId) ?? entries[0]!;
      entry.expected = entry.expected === "PASS" ? "FAIL" : "PASS";
      break;
    }
    case "drop_probe": {
      const probeId = mutation.probeId ?? entries[0]!.id;
      mutated.paths[targetPath] = entries.filter(e => e.id !== probeId);
      break;
    }
    case "extra_probe":
      mutated.paths[targetPath] = [
        ...entries,
        {
          id: `fuzz.extra.${mutation.seed}`,
          description: "synthetic extra probe",
          expected: "PASS",
        },
      ];
      break;
    case "rename_probe": {
      const probeId = mutation.probeId ?? entries[0]!.id;
      const entry = entries.find(e => e.id === probeId) ?? entries[0]!;
      entry.id = `${entry.id}.fuzz_${mutation.seed}`;
      break;
    }
    case "truncate_description": {
      const probeId = mutation.probeId ?? entries[0]!.id;
      const entry = entries.find(e => e.id === probeId) ?? entries[0]!;
      entry.description = "";
      break;
    }
  }

  return mutated;
}

export function generateFuzzMutationCases(
  fixture: ForgeBaselineFixture,
  seed: number,
  iterations: number,
): FuzzMutationCase[] {
  const rng = createFuzzRng(seed);
  const kinds: FuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "truncate_description",
  ];
  const cases: FuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      path: target.path,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P01-B01-A07). */
export function runContractFuzzValidation(
  fixture: ForgeBaselineFixture,
  contract: ForgeBaselineContract = getActiveForgeBaselineContract(),
  seed = 42,
  iterations = 24,
): FuzzValidationResult {
  const cases = generateFuzzMutationCases(fixture, seed, iterations);
  const results: FuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyFuzzMutation(fixture, mutation);
    const validation = validateFixtureAgainstContract(mutated, contract);
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

export type RunRecordFuzzKind = "drop_evidence" | "drop_telemetry" | "wrong_total";

export interface RunRecordFuzzCase {
  kind: RunRecordFuzzKind;
  probeId?: string;
}

export function applyRunRecordFuzzMutation(
  record: ForgeBaselineRunRecord,
  mutation: RunRecordFuzzCase,
): ForgeBaselineRunRecord {
  const cloned: ForgeBaselineRunRecord = {
    provenance: { ...record.provenance },
    evidence: record.evidence.map(item => ({ ...item })),
    telemetry: record.telemetry.map(item => ({ ...item })),
    summary: { ...record.summary, byDisposition: { ...record.summary.byDisposition } },
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

  cloned.summary = buildBaselineRunRecord(cloned.provenance, cloned.evidence, cloned.telemetry).summary;
  return cloned;
}

export function runRunRecordFuzzValidation(
  record: ForgeBaselineRunRecord,
  contract: ForgeBaselineContract = getActiveForgeBaselineContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const baseline = validateBaselineRunRecord(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: RunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyRunRecordFuzzMutation(record, mutation);
    const validation = validateBaselineRunRecord(mutated, contract);
    if (validation.valid) mutationsAccepted++;
    else mutationsRejected++;
  }

  return {
    validBaseline: baseline.valid,
    mutationsRejected,
    mutationsAccepted,
  };
}
