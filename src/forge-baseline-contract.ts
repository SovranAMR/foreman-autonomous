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
        minProbeCount: 3,
        requireFullAlignment: true,
      },
      probes: [
        {
          id: "state.valid_pipeline_chain",
          description: "StateManager accepts the canonical Forge transition chain idle→complete",
          expected: "PASS",
          criterion: "idle→visioning→decomposing→executing→verifying→complete succeeds; final state is complete",
        },
        {
          id: "state.rejects_skip_to_executing",
          description: "Invalid idle→executing transition is rejected without mutating state",
          expected: "PASS",
          criterion: "InvalidTransitionError thrown; state remains idle",
        },
        {
          id: "state.rejects_empty_reason",
          description: "Transitions without a reason are rejected",
          expected: "PASS",
          criterion: "MissingReasonError thrown on empty reason",
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
          criterion: "bash, read_file, edit_file registered; catalog size >= 40",
        },
        {
          id: "tool.unknown_tool_errors",
          description: "Unknown tool names return an error result instead of silent success",
          expected: "PASS",
          criterion: "execute({name:'not_a_real_tool'}) returns isError with 'Unknown tool'",
        },
        {
          id: "tool.hooks_can_block",
          description: "before_tool_call hook can block a tool invocation",
          expected: "PASS",
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
          criterion: "Vite success output → success=true",
        },
        {
          id: "verification.parse_build_errors",
          description: "parseBuildOutput extracts file:line errors from TypeScript output",
          expected: "PASS",
          criterion: "TS error line parsed with file src/app.ts and error count 1",
        },
        {
          id: "verification.parse_test_output",
          description: "parseTestOutput counts pass/fail from node:test output",
          expected: "PASS",
          criterion: "total=2, passed=1, failed=1 from node:test symbols",
        },
        {
          id: "verification.detect_regressions",
          description: "detectRegressions flags newly failing tests against prior run",
          expected: "PASS",
          criterion: "hasRegression=true and regressions includes 'stable test'",
        },
      ],
    },
    reviewer: {
      path: "reviewer",
      acceptance: {
        invariant:
          "Reviewer gate validates worker protocol completeness, trivial verify rejection, and forbidden-list violations.",
        minProbeCount: 4,
        requireFullAlignment: true,
      },
      probes: [
        {
          id: "reviewer.good_protocol_passes",
          description: "quickReviewCheck accepts a complete worker protocol aligned with vision",
          expected: "PASS",
          criterion: "GOOD_PROTOCOL + VISION_DOC → null (pass)",
        },
        {
          id: "reviewer.trivial_verify_rejected",
          description: "quickReviewCheck rejects trivial STEP7_VERIFY text",
          expected: "PASS",
          criterion: "step7_verify='Looks good' → verdict REJECT",
        },
        {
          id: "reviewer.forbidden_violation_rejected",
          description: "quickReviewCheck rejects FORBIDDEN-list violations in worker output",
          expected: "PASS",
          criterion: "particle rain in step6 → verdict REJECT",
        },
        {
          id: "reviewer.empty_llm_response_passes",
          description: "Empty reviewer LLM response is classified insufficient (no auto-PASS leniency)",
          expected: "PASS",
          criterion: "classifyReviewerLlmResponse rejects empty/short output; orchestrator retries instead of auto-PASS",
        },
      ],
    },
    rollback: {
      path: "rollback",
      acceptance: {
        invariant:
          "Rollback engine tracks history; orchestrator invokes createPoint; non-git projects expose documented gap.",
        minProbeCount: 3,
        requireFullAlignment: true,
      },
      probes: [
        {
          id: "rollback.point_without_git",
          description: "RollbackEngine.createPoint returns null when project is not a git repo",
          expected: "FAIL",
          criterion: "documented gap: createPoint returns non-null without git repo",
        },
        {
          id: "rollback.history_tracks_attempts",
          description: "RollbackEngine persists rollback history metadata",
          expected: "PASS",
          criterion: "getHistory().rollbacks is array",
        },
        {
          id: "rollback.orchestrator_calls_create_point",
          description: "Orchestrator.run invokes rollback.createPoint at pipeline start",
          expected: "PASS",
          criterion: "mock orchestrator run sets createPointCalled=true",
        },
      ],
    },
    resume: {
      path: "resume",
      acceptance: {
        invariant:
          "Pipeline resume persists checkpoints, tracks atom completion, and starts fresh when checkpoint missing.",
        minProbeCount: 3,
        requireFullAlignment: true,
      },
      probes: [
        {
          id: "resume.checkpoint_roundtrip",
          description: "PipelineResumeEngine persists and reloads checkpoint data",
          expected: "PASS",
          criterion: "createCheckpoint + updatePhase + loadCheckpoint preserves task and phase",
        },
        {
          id: "resume.atom_completion_tracking",
          description: "PipelineResumeEngine.isAtomCompleted reflects completed atom keys",
          expected: "PASS",
          criterion: "completeAtom(0,1) → isAtomCompleted(0,1)=true, (0,2)=false",
        },
        {
          id: "resume.missing_checkpoint_starts_fresh",
          description: "run({resume:true}) without checkpoint continues as fresh run (warning only)",
          expected: "PASS",
          criterion: "resume=true without checkpoint → success=true, resumed≠true",
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
} {
  const byPath = {} as Record<ForgeBaselinePath, { probeCount: number; invariant: string }>;
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
      if (probe.expected === "PASS") expectedPass++;
      else expectedFail++;
    }
  }

  return { totalProbes, expectedPass, expectedFail, byPath };
}
