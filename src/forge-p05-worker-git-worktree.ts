/**
 * FOREMAN — Worker Git & Worktree Transaction Baseline (P05-B05)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P05-B04 worker shell process block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import workerGitWorktreeBaseline from "./fixtures/forge-worker-git-worktree-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP05B04ToB05Handoff,
  summarizeWorkerShellProcessContractCoverage,
  getActiveWorkerShellProcessContract,
} from "./forge-p05-worker-shell-process.js";
import { TOOL_DEFINITIONS, type ToolCall } from "./tools.js";

export const FORGE_WORKER_GIT_WORKTREE_VERSION = "1.0.0-a04";

export const EXPECTED_P05_B04_SEALED_ATOM_COUNT = 10;

/** Maximum normalized git branch name length before truncation (P05-B05-A01 boundary). */
export const WORKER_GIT_WORKTREE_BRANCH_MAX_LENGTH = 255;

export const WORKER_GIT_WORKTREE_CATEGORIES = [
  "git_versioning",
  "git_signal",
  "worktree_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type WorkerGitWorktreeCategory = (typeof WORKER_GIT_WORKTREE_CATEGORIES)[number];

export const WORKER_GIT_WORKTREE_A01_MIN_PROBES: Readonly<
  Record<WorkerGitWorktreeCategory, number>
> = {
  git_versioning: 3,
  git_signal: 4,
  worktree_signal: 4,
  baseline_link: 2,
  boundary: 7,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 3,
};

export type GitBranchInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface GitBranchInputBoundary {
  disposition: GitBranchInputDisposition;
  acceptable: boolean;
  normalizedBranch: string;
  truncated: boolean;
  detail: string;
}

export interface GitCommitRecoveryResult {
  recovered: boolean;
  message: string;
  files?: string[];
  parseErrors: string[];
  detail: string;
}

export interface WorkerGitWorktreeFixtureEntry {
  id: string;
  category: WorkerGitWorktreeCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface WorkerGitWorktreeBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    workerShellProcessProbeCount: number;
    sealedAtomCount: number;
  };
  probes: WorkerGitWorktreeFixtureEntry[];
}

export interface WorkerGitWorktreeProbeResult {
  id: string;
  category: WorkerGitWorktreeCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface WorkerGitWorktreeValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: WorkerGitWorktreeCategory;
  detail: string;
}

export interface WorkerGitWorktreeValidationResult {
  valid: boolean;
  issues: WorkerGitWorktreeValidationIssue[];
}

export interface WorkerGitWorktreeProbeSummary {
  total: number;
  aligned: number;
  mismatches: WorkerGitWorktreeProbeResult[];
  knownGaps: WorkerGitWorktreeProbeResult[];
  byCategory: Record<
    WorkerGitWorktreeCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export type WorkerGitWorktreeProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface WorkerGitWorktreeProbeContract {
  id: string;
  category: WorkerGitWorktreeCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: WorkerGitWorktreeProbeDisposition;
  criterion: string;
}

export interface WorkerGitWorktreeCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface WorkerGitWorktreeCategoryContract {
  category: WorkerGitWorktreeCategory;
  acceptance: WorkerGitWorktreeCategoryAcceptance;
  probes: readonly WorkerGitWorktreeProbeContract[];
}

export interface WorkerGitWorktreeContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<WorkerGitWorktreeCategory, WorkerGitWorktreeCategoryContract>;
  probes: readonly WorkerGitWorktreeProbeContract[];
}

function flattenWorkerGitWorktreeCategoryProbes(
  categories: Record<WorkerGitWorktreeCategory, WorkerGitWorktreeCategoryContract>,
): readonly WorkerGitWorktreeProbeContract[] {
  return WORKER_GIT_WORKTREE_CATEGORIES.flatMap(category => categories[category].probes);
}

const WORKER_GIT_WORKTREE_CATEGORY_CONTRACTS: Record<
  WorkerGitWorktreeCategory,
  WorkerGitWorktreeCategoryContract
> = {
  git_versioning: {
    category: "git_versioning",
    acceptance: {
      invariant:
        "Worker git worktree baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wgt.version_tagged",
        category: "git_versioning",
        description: "Git worktree baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Git worktree baseline declares semver version field",
      },
      {
        id: "wgt.atom_tagged",
        category: "git_versioning",
        description: "Git worktree baseline declares P05-B05-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Git worktree baseline declares P05-B05-A01 atom id",
      },
      {
        id: "wgt.harness_version_exported",
        category: "git_versioning",
        description: "FORGE_WORKER_GIT_WORKTREE_VERSION exported for git worktree harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_WORKER_GIT_WORKTREE_VERSION exported for git worktree harness",
      },
    ],
  },
  git_signal: {
    category: "git_signal",
    acceptance: {
      invariant:
        "git_status tool, GitEngine class, ExecutionEngine gitCommit and typed git union gate worker git dispatch.",
      minProbeCount: 4,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "wgt.git_status_tool_defined",
        category: "git_signal",
        description: "git_status tool routes worker git status through GitEngine dispatch",
        expected: "PASS",
        disposition: "observed",
        criterion: "git_status tool routes worker git status through GitEngine dispatch",
      },
      {
        id: "wgt.git_engine_exported",
        category: "git_signal",
        description: "GitEngine exports thought-aware commit and branch orchestration",
        expected: "PASS",
        disposition: "observed",
        criterion: "GitEngine exports thought-aware commit and branch orchestration",
      },
      {
        id: "wgt.execution_engine_git_commit",
        category: "git_signal",
        description: "ExecutionEngine.gitCommit provides secure project-root git commits",
        expected: "PASS",
        disposition: "observed",
        criterion: "ExecutionEngine.gitCommit provides secure project-root git commits",
      },
      {
        id: "wgt.typed_git_call_union",
        category: "git_signal",
        description: "TypedGitCall discriminated union narrows branch and message args before git dispatch",
        expected: "PASS",
        disposition: "observed",
        criterion: "TypedGitCall discriminated union narrows branch and message args before git dispatch",
      },
    ],
  },
  worktree_signal: {
    category: "worktree_signal",
    acceptance: {
      invariant:
        "GitEngine task branching, stash guard, ExecutionEngine gitBranch and worktree transaction engine gate worktree lifecycle.",
      minProbeCount: 4,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "wgt.git_engine_task_branching",
        category: "worktree_signal",
        description: "GitEngine.createTaskBranch provides Foreman-prefixed task branch isolation",
        expected: "PASS",
        disposition: "observed",
        criterion: "GitEngine.createTaskBranch provides Foreman-prefixed task branch isolation",
      },
      {
        id: "wgt.git_engine_stash_guard",
        category: "worktree_signal",
        description: "GitEngine.stashSave protects work-in-progress before branch and merge operations",
        expected: "PASS",
        disposition: "observed",
        criterion: "GitEngine.stashSave protects work-in-progress before branch and merge operations",
      },
      {
        id: "wgt.execution_engine_git_branch",
        category: "worktree_signal",
        description: "ExecutionEngine.gitBranch provides create, checkout and delete branch primitives",
        expected: "PASS",
        disposition: "observed",
        criterion: "ExecutionEngine.gitBranch provides create, checkout and delete branch primitives",
      },
      {
        id: "wgt.worktree_transaction_engine",
        category: "worktree_signal",
        description: "GitEngine worktree transaction engine supports add, remove and atomic rollback",
        expected: "FAIL",
        disposition: "gap",
        criterion: "GitEngine worktree transaction engine supports add, remove and atomic rollback",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Worker git worktree baseline links to sealed P05-B04 worker shell process block gate.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wgt.b04_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P05_B04_TO_B05_HANDOFF_V1 targets P05-B05-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P05_B04_TO_B05_HANDOFF_V1 targets P05-B05-A01 entry atom",
      },
      {
        id: "wgt.b04_sealed_shell_process_probes",
        category: "baseline_link",
        description: "P05-B04→B05 handoff sealed probeCount matches active worker shell process contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P05-B04→B05 handoff sealed probeCount matches active worker shell process contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Git branch boundary assessment rejects invalid input; probe runner and documented gaps wired.",
      minProbeCount: 7,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wgt.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P05-B04 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P05-B04 block gate source artifacts",
      },
      {
        id: "wgt.probe_runner_exported",
        category: "boundary",
        description: "runWorkerGitWorktreeProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runWorkerGitWorktreeProbes executes contract-wired probe matrix",
      },
      {
        id: "wgt.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL git worktree gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL git worktree gap",
      },
      {
        id: "wgt.empty_branch_boundary",
        category: "boundary",
        description: "assessGitBranchInputBoundary rejects empty branch name input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessGitBranchInputBoundary rejects empty branch name input",
      },
      {
        id: "wgt.whitespace_branch_boundary",
        category: "boundary",
        description: "assessGitBranchInputBoundary rejects whitespace-only branch name input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessGitBranchInputBoundary rejects whitespace-only branch name input",
      },
      {
        id: "wgt.null_byte_branch_boundary",
        category: "boundary",
        description: "assessGitBranchInputBoundary rejects null-byte branch name safely",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessGitBranchInputBoundary rejects null-byte branch name safely",
      },
      {
        id: "wgt.long_branch_truncation_boundary",
        category: "boundary",
        description: "assessGitBranchInputBoundary truncates branch name exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessGitBranchInputBoundary truncates branch name exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Invalid fixture versions and null-byte git branch input are rejected safely.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wgt.invalid_version_rejected",
        category: "failure_path",
        description: "validateWorkerGitWorktreeBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateWorkerGitWorktreeBaseline rejects unexpected fixture version",
      },
      {
        id: "wgt.malformed_branch_guard",
        category: "failure_path",
        description: "assessGitBranchInputBoundary rejects embedded null-byte branch segments safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessGitBranchInputBoundary rejects embedded null-byte branch segments safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant: "Recovery paths coerce malformed git_commit args into dispatch-ready commit records.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wgt.recovery_string_args_coercion",
        category: "recovery_path",
        description: "recoverGitCommitRequest coerces JSON string args into dispatch-ready record",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverGitCommitRequest coerces JSON string args into dispatch-ready record",
      },
      {
        id: "wgt.recovery_missing_message_rejected",
        category: "recovery_path",
        description: "recoverGitCommitRequest rejects unrecoverable missing commit message input",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverGitCommitRequest rejects unrecoverable missing commit message input",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Worker prompt git contract, orchestrator pre-git validation and exported git validator gate NO-GO paths.",
      minProbeCount: 3,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "wgt.worker_prompt_git_contract",
        category: "nogo_path",
        description: "WORKER_SYSTEM prompt declares git and worktree transaction contract for worker execution",
        expected: "FAIL",
        disposition: "gap",
        criterion: "WORKER_SYSTEM prompt declares git and worktree transaction contract for worker execution",
      },
      {
        id: "wgt.orchestrator_pre_git_validation",
        category: "nogo_path",
        description: "Orchestrator validates git branch boundary before git tool dispatch",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator validates git branch boundary before git tool dispatch",
      },
      {
        id: "wgt.exported_git_validator",
        category: "nogo_path",
        description: "validateGitTransaction exported for orchestrator git worktree checks",
        expected: "FAIL",
        disposition: "gap",
        criterion: "validateGitTransaction exported for orchestrator git worktree checks",
      },
    ],
  },
};

export const FORGE_WORKER_GIT_WORKTREE_CONTRACT_V1: WorkerGitWorktreeContract = {
  version: "1.0.0",
  atom: "P05-B05-A02",
  purpose: "Worker git and worktree transaction typed contract with measurable acceptance probes.",
  categories: WORKER_GIT_WORKTREE_CATEGORY_CONTRACTS,
  probes: flattenWorkerGitWorktreeCategoryProbes(WORKER_GIT_WORKTREE_CATEGORY_CONTRACTS),
};

export function getActiveWorkerGitWorktreeContract(): WorkerGitWorktreeContract {
  return FORGE_WORKER_GIT_WORKTREE_CONTRACT_V1;
}

export function getWorkerGitWorktreeCategoryContract(
  category: WorkerGitWorktreeCategory,
  contract: WorkerGitWorktreeContract = getActiveWorkerGitWorktreeContract(),
): WorkerGitWorktreeCategoryContract {
  return contract.categories[category];
}

export function listWorkerGitWorktreeContractProbeIds(
  contract: WorkerGitWorktreeContract = getActiveWorkerGitWorktreeContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listWorkerGitWorktreeProbesByDisposition(
  disposition: WorkerGitWorktreeProbeDisposition,
  contract: WorkerGitWorktreeContract = getActiveWorkerGitWorktreeContract(),
): WorkerGitWorktreeProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listWorkerGitWorktreeContractProbesByCategory(
  category: WorkerGitWorktreeCategory,
  contract: WorkerGitWorktreeContract = getActiveWorkerGitWorktreeContract(),
): readonly WorkerGitWorktreeProbeContract[] {
  return [...contract.categories[category].probes];
}

export interface WorkerGitWorktreeContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: WorkerGitWorktreeCategory;
  detail: string;
}

export interface WorkerGitWorktreeContractCoverageResult {
  valid: boolean;
  issues: WorkerGitWorktreeContractCoverageIssue[];
}

export function summarizeWorkerGitWorktreeContractCoverage(
  contract: WorkerGitWorktreeContract = getActiveWorkerGitWorktreeContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<WorkerGitWorktreeCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<WorkerGitWorktreeProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    WorkerGitWorktreeCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<WorkerGitWorktreeProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of WORKER_GIT_WORKTREE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    byCategory[category] = {
      probeCount: categoryContract.probes.length,
      invariant: categoryContract.acceptance.invariant,
    };
    for (const probeEntry of categoryContract.probes) {
      totalProbes++;
      if (probeEntry.expected === "PASS") expectedPass++;
      else expectedFail++;
      byDisposition[probeEntry.disposition]++;
    }
  }

  return { totalProbes, expectedPass, expectedFail, byCategory, byDisposition };
}

export function validateWorkerGitWorktreeContractCoverage(
  contract: WorkerGitWorktreeContract = getActiveWorkerGitWorktreeContract(),
): WorkerGitWorktreeContractCoverageResult {
  const issues: WorkerGitWorktreeContractCoverageIssue[] = [];

  for (const category of WORKER_GIT_WORKTREE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({
        kind: "missing_category",
        category,
        detail: `missing category contract: ${category}`,
      });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < WORKER_GIT_WORKTREE_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${WORKER_GIT_WORKTREE_A01_MIN_PROBES[category]}`,
      });
    }
    if (categoryContract.probes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} has ${categoryContract.probes.length} probes; ` +
          `contract requires >= ${categoryContract.acceptance.minProbeCount}`,
      });
    }
    if (categoryContract.acceptance.invariant.trim().length <= 20) {
      issues.push({
        kind: "missing_criterion",
        category,
        detail: `${category} invariant too short`,
      });
    }
    for (const probe of categoryContract.probes) {
      if (probe.criterion.trim().length <= 10) {
        issues.push({
          kind: "missing_criterion",
          probeId: probe.id,
          detail: `${probe.id} criterion too short`,
        });
      }
    }
  }

  const ids = listWorkerGitWorktreeContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeWorkerGitWorktreeContractCoverage(contract);
  if (summary.totalProbes !== ids.length) {
    issues.push({
      kind: "coverage_mismatch",
      detail: `totalProbes=${summary.totalProbes} ids=${ids.length}`,
    });
  }

  for (const probe of contract.probes) {
    if (!probe.id.startsWith("wgt.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing wgt. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateWorkerGitWorktreeContract(
  contract: WorkerGitWorktreeContract = getActiveWorkerGitWorktreeContract(),
): WorkerGitWorktreeContractCoverageResult {
  return validateWorkerGitWorktreeContractCoverage(contract);
}

export function validateWorkerGitWorktreeAgainstContract(
  fixture: WorkerGitWorktreeBaseline,
  contract: WorkerGitWorktreeContract = getActiveWorkerGitWorktreeContract(),
): WorkerGitWorktreeValidationResult {
  const issues: WorkerGitWorktreeValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of WORKER_GIT_WORKTREE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    const categoryProbes = fixture.probes.filter(p => p.category === category);
    if (categoryProbes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} has ${categoryProbes.length} probes; ` +
          `contract requires >= ${categoryContract.acceptance.minProbeCount}`,
      });
    }
  }

  for (const probeEntry of contract.probes) {
    if (!fixtureIds.has(probeEntry.id)) {
      issues.push({
        kind: "missing_probe",
        probeId: probeEntry.id,
        detail: `fixture missing ${probeEntry.id}`,
      });
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
    if (entry.category !== expected.category) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `category mismatch fixture=${entry.category} contract=${expected.category}`,
      });
    }
    if (entry.description !== expected.description) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `description mismatch for ${entry.id}`,
      });
    }
  }

  const expectedFailCount = contract.probes.filter(p => p.expected === "FAIL").length;
  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (expectedFailCount > 0 && failGaps.length === 0) {
    issues.push({
      kind: "missing_category",
      detail: "fixture must document known FAIL gaps matching contract",
    });
  }
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_probe",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${expectedFailCount}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

function readSrc(relativePath: string): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(moduleDir, relativePath), "utf8");
}

/**
 * Assess git branch input boundary conditions before worker dispatch (P05-B05-A01).
 */
export function assessGitBranchInputBoundary(branch: string): GitBranchInputBoundary {
  if (branch.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedBranch: "",
      truncated: false,
      detail: "null byte detected in git branch input",
    };
  }

  const trimmed = branch.trim();
  if (trimmed.length === 0) {
    const disposition: GitBranchInputDisposition =
      branch.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedBranch: "",
      truncated: false,
      detail: disposition === "empty" ? "empty git branch input" : "whitespace-only git branch input",
    };
  }

  let normalizedBranch = trimmed;
  let truncated = false;
  if (normalizedBranch.length > WORKER_GIT_WORKTREE_BRANCH_MAX_LENGTH) {
    normalizedBranch = normalizedBranch.slice(0, WORKER_GIT_WORKTREE_BRANCH_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedBranch,
    truncated,
    detail: truncated
      ? `branch truncated to ${WORKER_GIT_WORKTREE_BRANCH_MAX_LENGTH} characters`
      : "valid git branch input",
  };
}

export interface GitCommitNormalizationResult extends GitCommitRecoveryResult {
  branch?: string;
}

/**
 * Normalize git_commit tool args through boundary assessment before recovery (P05-B05-A04).
 */
export function normalizeGitCommitRequest(
  message: unknown,
  files: unknown = undefined,
  branch: unknown = undefined,
): GitCommitNormalizationResult {
  const recovery = recoverGitCommitRequest(message, files);
  if (!recovery.recovered) {
    return recovery;
  }

  if (branch === undefined || branch === null) {
    return recovery;
  }

  if (typeof branch !== "string") {
    return {
      recovered: false,
      message: recovery.message,
      parseErrors: [...recovery.parseErrors, "invalid_branch_field"],
      detail: "cannot recover non-string git branch",
    };
  }

  const branchBoundary = assessGitBranchInputBoundary(branch);
  if (!branchBoundary.acceptable) {
    return {
      recovered: false,
      message: recovery.message,
      parseErrors: [...recovery.parseErrors, branchBoundary.disposition],
      detail: branchBoundary.detail,
    };
  }

  return {
    ...recovery,
    branch: branchBoundary.normalizedBranch,
    detail: `${recovery.detail}; branch normalized`,
  };
}

/**
 * Recover malformed git_commit tool args into dispatch-ready record (P05-B05-A01).
 */
export function recoverGitCommitRequest(
  message: unknown,
  files: unknown = undefined,
): GitCommitRecoveryResult {
  let resolvedMessage = message;
  let resolvedFiles = files;
  const parseErrors: string[] = [];

  if (typeof message === "string" && message.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(message) as Record<string, unknown>;
      if (typeof parsed.message === "string") resolvedMessage = parsed.message;
      if (Array.isArray(parsed.files)) resolvedFiles = parsed.files;
      parseErrors.push("coerced_json_message");
    } catch {
      parseErrors.push("invalid_json_message");
    }
  }

  if (typeof resolvedMessage !== "string") {
    return {
      recovered: false,
      message: "",
      parseErrors: [...parseErrors, "invalid_message_field"],
      detail: "cannot recover non-string commit message",
    };
  }

  if (resolvedMessage.includes("\0")) {
    return {
      recovered: false,
      message: resolvedMessage,
      parseErrors: [...parseErrors, "contains_null_byte"],
      detail: "null byte detected in commit message input",
    };
  }

  if (resolvedMessage.trim().length === 0) {
    return {
      recovered: false,
      message: resolvedMessage,
      parseErrors: [...parseErrors, "empty"],
      detail: "empty commit message input",
    };
  }

  const normalizedFiles =
    Array.isArray(resolvedFiles) && resolvedFiles.every(f => typeof f === "string")
      ? (resolvedFiles as string[])
      : undefined;

  return {
    recovered: true,
    message: resolvedMessage.trim(),
    ...(normalizedFiles ? { files: normalizedFiles } : {}),
    parseErrors,
    detail: `recovered message length=${resolvedMessage.trim().length}`,
  };
}

export const FORGE_WORKER_GIT_WORKTREE_A01_PROBE_MATRIX: readonly WorkerGitWorktreeFixtureEntry[] =
  workerGitWorktreeBaseline.probes as WorkerGitWorktreeFixtureEntry[];

export function getWorkerGitWorktreeA01ExpectedFailCount(): number {
  return FORGE_WORKER_GIT_WORKTREE_A01_PROBE_MATRIX.filter(p => p.expected === "FAIL").length;
}

export function loadWorkerGitWorktreeBaseline(): WorkerGitWorktreeBaseline {
  return workerGitWorktreeBaseline as WorkerGitWorktreeBaseline;
}

export function validateWorkerGitWorktreeBaseline(
  fixture: WorkerGitWorktreeBaseline,
): WorkerGitWorktreeValidationResult {
  const issues: WorkerGitWorktreeValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P05-B05-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    WORKER_GIT_WORKTREE_CATEGORIES.map(category => [category, 0]),
  ) as Record<WorkerGitWorktreeCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of WORKER_GIT_WORKTREE_CATEGORIES) {
    const min = WORKER_GIT_WORKTREE_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_WORKER_GIT_WORKTREE_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_WORKER_GIT_WORKTREE_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_WORKER_GIT_WORKTREE_A01_PROBE_MATRIX) {
    const entry = fixture.probes.find(p => p.id === expected.id);
    if (!entry) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `missing probe ${expected.id}`,
      });
      continue;
    }
    if (entry.category !== expected.category) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `category mismatch for ${expected.id}`,
      });
    }
    if (entry.expected !== expected.expected) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `expected mismatch for ${expected.id}`,
      });
    }
  }

  const expectedFailCount = getWorkerGitWorktreeA01ExpectedFailCount();
  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (expectedFailCount > 0 && failGaps.length === 0) {
    issues.push({
      kind: "missing_category",
      detail: "fixture must document known FAIL gaps matching A01 probe matrix",
    });
  }
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_probe",
      detail: `fixture FAIL count=${failGaps.length} matrix expectedFail=${expectedFailCount}`,
    });
  }

  const handoff = getForgeP05B04ToB05Handoff();
  const shellProcessCoverage = summarizeWorkerShellProcessContractCoverage(
    getActiveWorkerShellProcessContract(),
  );

  if (fixture.sourceBlockGate.atom !== "P05-B04-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P05-B04-A10`,
    });
  }
  if (fixture.sourceBlockGate.workerShellProcessProbeCount !== shellProcessCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.workerShellProcessProbeCount=${fixture.sourceBlockGate.workerShellProcessProbeCount} ` +
        `contract=${shellProcessCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P05_B04_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P05_B04_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P05-B05-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P05-B05-A01`,
    });
  }

  return { valid: issues.length === 0, issues };
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: WorkerGitWorktreeCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
): WorkerGitWorktreeProbeResult {
  const actual = outcome(ok);
  return {
    id,
    category,
    expected,
    actual,
    aligned: actual === expected,
    detail,
  };
}

function toolsSource(): string {
  return readSrc("tools.ts");
}

function executionEngineSource(): string {
  return readSrc("execution-engine.ts");
}

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function gitEngineSource(): string {
  return readSrc("git-engine.ts");
}

function productionGitWorktreeSource(): string {
  return readSrc("forge-p05-worker-git-worktree.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionGitWorktreeSource());
}

function probeGitVersioning(
  id: string,
  category: WorkerGitWorktreeCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerGitWorktreeBaseline,
): WorkerGitWorktreeProbeResult {
  switch (id) {
    case "wgt.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "wgt.atom_tagged": {
      const ok = fixture.atom === "P05-B05-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "wgt.harness_version_exported": {
      const ok = FORGE_WORKER_GIT_WORKTREE_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_WORKER_GIT_WORKTREE_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown git_versioning probe");
  }
}

function probeGitSignal(
  id: string,
  category: WorkerGitWorktreeCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerGitWorktreeProbeResult {
  const tools = toolsSource();
  const executionEngine = executionEngineSource();
  const gitEngine = gitEngineSource();

  switch (id) {
    case "wgt.git_status_tool_defined": {
      const ok =
        TOOL_DEFINITIONS.some(def => def.name === "git_status") &&
        tools.includes('case "git_status"');
      return probe(id, category, expected, ok, `gitStatusTool=${ok}`);
    }
    case "wgt.git_engine_exported": {
      const ok =
        gitEngine.includes("export class GitEngine") &&
        gitEngine.includes("commitThought(");
      return probe(id, category, expected, ok, `gitEngine=${ok}`);
    }
    case "wgt.execution_engine_git_commit": {
      const ok = executionEngine.includes("gitCommit(");
      return probe(id, category, expected, ok, `gitCommit=${ok}`);
    }
    case "wgt.typed_git_call_union": {
      const ok =
        tools.includes("export type TypedGitCall") ||
        tools.includes("interface TypedGitCall") ||
        tools.includes("export type TypedGitCommitCall");
      return probe(id, category, expected, ok, `typedGitCall=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown git_signal probe");
  }
}

function probeWorktreeSignal(
  id: string,
  category: WorkerGitWorktreeCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerGitWorktreeProbeResult {
  const executionEngine = executionEngineSource();
  const gitEngine = gitEngineSource();

  switch (id) {
    case "wgt.git_engine_task_branching": {
      const ok = gitEngine.includes("createTaskBranch(");
      return probe(id, category, expected, ok, `createTaskBranch=${ok}`);
    }
    case "wgt.git_engine_stash_guard": {
      const ok = gitEngine.includes("stashSave(") && gitEngine.includes("stashPop(");
      return probe(id, category, expected, ok, `stashGuard=${ok}`);
    }
    case "wgt.execution_engine_git_branch": {
      const ok = executionEngine.includes("gitBranch(");
      return probe(id, category, expected, ok, `gitBranch=${ok}`);
    }
    case "wgt.worktree_transaction_engine": {
      const ok =
        gitEngine.includes("worktreeAdd(") ||
        gitEngine.includes("worktreeRemove(") ||
        gitEngine.includes("rollbackWorktreeTransaction(");
      return probe(id, category, expected, ok, `worktreeTransactionEngine=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown worktree_signal probe");
  }
}

function probeBaselineLink(
  id: string,
  category: WorkerGitWorktreeCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerGitWorktreeProbeResult {
  switch (id) {
    case "wgt.b04_handoff_entry": {
      const handoff = getForgeP05B04ToB05Handoff();
      const ok =
        handoff.targetBlock.blockId === "P05-B05" &&
        handoff.targetBlock.entryAtom === "P05-B05-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "wgt.b04_sealed_shell_process_probes": {
      const handoff = getForgeP05B04ToB05Handoff();
      const coverage = summarizeWorkerShellProcessContractCoverage(
        getActiveWorkerShellProcessContract(),
      );
      const ok = handoff.sealedArtifacts.probeCount === coverage.totalProbes;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoff_probes=${handoff.sealedArtifacts.probeCount}, contract=${coverage.totalProbes}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown baseline_link probe");
  }
}

function probeBoundary(
  id: string,
  category: WorkerGitWorktreeCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerGitWorktreeBaseline,
): WorkerGitWorktreeProbeResult {
  switch (id) {
    case "wgt.source_block_gate_ref": {
      const handoff = getForgeP05B04ToB05Handoff();
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P05_B04_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, sealed=${fixture.sourceBlockGate.sealedAtomCount}`,
      );
    }
    case "wgt.probe_runner_exported": {
      const ok = productionGitWorktreeSource().includes(
        "export function runWorkerGitWorktreeProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "wgt.known_gaps_documented": {
      const contract = getActiveWorkerGitWorktreeContract();
      const expectedFail = contract.probes.filter(p => p.expected === "FAIL").length;
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount === expectedFail && failCount >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, contractExpectedFail=${expectedFail}`,
      );
    }
    case "wgt.empty_branch_boundary": {
      const result = assessGitBranchInputBoundary("");
      const ok = !result.acceptable && result.disposition === "empty";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    case "wgt.whitespace_branch_boundary": {
      const result = assessGitBranchInputBoundary("   \t\n  ");
      const ok = !result.acceptable && result.disposition === "whitespace_only";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    case "wgt.null_byte_branch_boundary": {
      const result = assessGitBranchInputBoundary("feature/test\0");
      const ok = !result.acceptable && result.disposition === "contains_null_byte";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    case "wgt.long_branch_truncation_boundary": {
      const longBranch = "feature/" + "x".repeat(WORKER_GIT_WORKTREE_BRANCH_MAX_LENGTH + 50);
      const result = assessGitBranchInputBoundary(longBranch);
      const ok =
        result.acceptable && result.truncated && result.disposition === "exceeds_max_length";
      return probe(
        id,
        category,
        expected,
        ok,
        `truncated=${result.truncated}, branchLen=${result.normalizedBranch.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: WorkerGitWorktreeCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerGitWorktreeBaseline,
): WorkerGitWorktreeProbeResult {
  switch (id) {
    case "wgt.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const validation = validateWorkerGitWorktreeBaseline(invalid);
      const ok = validation.valid === false;
      return probe(id, category, expected, ok, `rejected=${ok}`);
    }
    case "wgt.malformed_branch_guard": {
      const result = assessGitBranchInputBoundary("foreman/task\0");
      const ok = !result.acceptable && result.disposition === "contains_null_byte";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: WorkerGitWorktreeCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerGitWorktreeProbeResult {
  switch (id) {
    case "wgt.recovery_string_args_coercion": {
      const recovery = recoverGitCommitRequest(
        JSON.stringify({ message: "fix: git baseline", files: ["src/tools.ts"] }),
      );
      const ok =
        recovery.recovered &&
        recovery.message === "fix: git baseline" &&
        recovery.files?.includes("src/tools.ts") === true;
      return probe(id, category, expected, ok, recovery.detail);
    }
    case "wgt.recovery_missing_message_rejected": {
      const recovery = recoverGitCommitRequest("");
      const ok = !recovery.recovered && recovery.parseErrors.includes("empty");
      return probe(id, category, expected, ok, recovery.detail);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: WorkerGitWorktreeCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerGitWorktreeProbeResult {
  const orchestrator = orchestratorSource();
  const prompts = promptsSource();

  switch (id) {
    case "wgt.worker_prompt_git_contract": {
      const ok =
        prompts.includes("GIT AND WORKTREE TRANSACTION") ||
        prompts.includes("git and worktree transaction contract");
      return probe(id, category, expected, ok, `gitContractSection=${ok}`);
    }
    case "wgt.orchestrator_pre_git_validation": {
      const ok =
        orchestrator.includes("validateGitTransaction(") ||
        orchestrator.includes("assessGitBranchInputBoundary(");
      return probe(id, category, expected, ok, `preGitValidation=${ok}`);
    }
    case "wgt.exported_git_validator": {
      const ok = hasProductionExport("validateGitTransaction");
      return probe(id, category, expected, ok, `gitValidator=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: WorkerGitWorktreeCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerGitWorktreeBaseline,
): WorkerGitWorktreeProbeResult {
  switch (category) {
    case "git_versioning":
      return probeGitVersioning(id, category, expected, fixture);
    case "git_signal":
      return probeGitSignal(id, category, expected);
    case "worktree_signal":
      return probeWorktreeSignal(id, category, expected);
    case "baseline_link":
      return probeBaselineLink(id, category, expected);
    case "boundary":
      return probeBoundary(id, category, expected, fixture);
    case "failure_path":
      return probeFailurePath(id, category, expected, fixture);
    case "recovery_path":
      return probeRecoveryPath(id, category, expected);
    case "nogo_path":
      return probeNogoPath(id, category, expected);
    default:
      return probe(id, category, expected, false, "unknown category");
  }
}

export function runWorkerGitWorktreeProbes(
  fixture: WorkerGitWorktreeBaseline = loadWorkerGitWorktreeBaseline(),
): WorkerGitWorktreeProbeResult[] {
  const contract = getActiveWorkerGitWorktreeContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion ? { ...result, criterion: contractProbe.criterion } : result;
  });
}

export function summarizeWorkerGitWorktreeMatrix(
  results: WorkerGitWorktreeProbeResult[] = runWorkerGitWorktreeProbes(),
): WorkerGitWorktreeProbeSummary {
  const byCategory = Object.fromEntries(
    WORKER_GIT_WORKTREE_CATEGORIES.map(category => [
      category,
      { total: 0, aligned: 0, expectedFail: 0 },
    ]),
  ) as WorkerGitWorktreeProbeSummary["byCategory"];

  const mismatches: WorkerGitWorktreeProbeResult[] = [];
  const knownGaps: WorkerGitWorktreeProbeResult[] = [];

  for (const result of results) {
    byCategory[result.category].total++;
    if (result.aligned) {
      byCategory[result.category].aligned++;
    } else {
      mismatches.push(result);
    }
    if (result.expected === "FAIL") {
      byCategory[result.category].expectedFail++;
      if (result.aligned) {
        knownGaps.push(result);
      }
    }
  }

  return {
    total: results.length,
    aligned: results.filter(r => r.aligned).length,
    mismatches,
    knownGaps,
    byCategory,
  };
}

export function listWorkerGitWorktreeProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerGitWorktreeBaseline = loadWorkerGitWorktreeBaseline(),
): WorkerGitWorktreeFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listWorkerGitWorktreeKnownGaps(
  results: WorkerGitWorktreeProbeResult[] = runWorkerGitWorktreeProbes(),
): WorkerGitWorktreeProbeResult[] {
  return summarizeWorkerGitWorktreeMatrix(results).knownGaps;
}

export function probeDangerousGitOperationBlocked(): boolean {
  const executionEngine = executionEngineSource();
  return (
    executionEngine.includes("isDangerous(") &&
    executionEngine.includes("Dangerous command blocked")
  );
}

export interface GitCallValidationResult {
  valid: boolean;
  errors: string[];
  message?: string;
  branch?: string;
  files?: string[];
}

/**
 * Validate git tool call boundary before orchestrator dispatch (P05-B05-A03).
 */
export function validateGitCall(call: ToolCall): GitCallValidationResult {
  const gitTools = new Set(["git_status", "git_commit", "git_diff", "git_log"]);
  if (!gitTools.has(call.name)) {
    return { valid: true, errors: [] };
  }

  if (call.name === "git_commit") {
    const normalized = normalizeGitCommitRequest(
      call.args.message,
      call.args.files,
      call.args.branch,
    );
    if (!normalized.recovered) {
      return { valid: false, errors: [normalized.detail], message: normalized.message };
    }

    return {
      valid: true,
      errors: [],
      message: normalized.message,
      ...(normalized.files ? { files: normalized.files } : {}),
      ...(normalized.branch ? { branch: normalized.branch } : {}),
    };
  }

  return { valid: true, errors: [] };
}

export interface GitWorktreeTelemetry {
  toolName: string;
  message?: string;
  branch?: string;
  sequenceIndex: number;
  validated: boolean;
  validatedAt: string;
  contractVersion: string;
  harnessVersion: string;
  errors: string[];
}

/**
 * Record git worktree provenance for worker tool loop telemetry (P05-B05-A03).
 */
export function buildGitWorktreeTelemetry(
  call: ToolCall,
  options: {
    sequenceIndex?: number;
    validation?: GitCallValidationResult;
  } = {},
): GitWorktreeTelemetry {
  const validation = options.validation ?? validateGitCall(call);

  return {
    toolName: call.name,
    ...(validation.message ? { message: validation.message } : {}),
    ...(validation.branch ? { branch: validation.branch } : {}),
    sequenceIndex: options.sequenceIndex ?? 0,
    validated: validation.valid,
    validatedAt: new Date().toISOString(),
    contractVersion: FORGE_WORKER_GIT_WORKTREE_CONTRACT_V1.version,
    harnessVersion: FORGE_WORKER_GIT_WORKTREE_VERSION,
    errors: validation.errors,
  };
}

export interface WorkerGitWorktreeProbeMatrixValidationIssue {
  kind: "missing_result" | "criterion_mismatch" | "pass_mismatch" | "gap_mismatch";
  probeId?: string;
  detail: string;
}

export interface WorkerGitWorktreeProbeMatrixValidationResult {
  valid: boolean;
  issues: WorkerGitWorktreeProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

export function validateWorkerGitWorktreeProbeMatrix(
  results: WorkerGitWorktreeProbeResult[],
  contract: WorkerGitWorktreeContract = getActiveWorkerGitWorktreeContract(),
): WorkerGitWorktreeProbeMatrixValidationResult {
  const issues: WorkerGitWorktreeProbeMatrixValidationIssue[] = [];
  const resultById = new Map(results.map(result => [result.id, result]));
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
      continue;
    }

    if (result.aligned) {
      gapAligned++;
    } else {
      issues.push({
        kind: "gap_mismatch",
        probeId: contractProbe.id,
        detail: `FAIL probe misaligned: expected=${result.expected} actual=${result.actual} (${result.detail})`,
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

export interface WorkerGitWorktreeProductionSliceResult {
  atom: "P05-B05-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: WorkerGitWorktreeProbeResult[];
  summary: WorkerGitWorktreeProbeSummary;
  matrixValidation: WorkerGitWorktreeProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: git worktree contract wired to probe matrix
 * with first gap probe (TypedGitCall) closed and zero unexpected mismatches.
 */
export function runWorkerGitWorktreeProductionSlice(
  fixture: WorkerGitWorktreeBaseline = loadWorkerGitWorktreeBaseline(),
): WorkerGitWorktreeProductionSliceResult {
  const contract = getActiveWorkerGitWorktreeContract();
  const fixtureValidation = validateWorkerGitWorktreeBaseline(fixture);
  const contractValidation = validateWorkerGitWorktreeAgainstContract(fixture, contract);
  const results = runWorkerGitWorktreeProbes(fixture);
  const summary = summarizeWorkerGitWorktreeMatrix(results);
  const matrixValidation = validateWorkerGitWorktreeProbeMatrix(results, contract);

  return {
    atom: "P05-B05-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface WorkerGitWorktreeBoundarySliceResult {
  atom: "P05-B05-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: WorkerGitWorktreeProbeResult[];
  boundaryResults: WorkerGitWorktreeProbeResult[];
  matrixValidation: WorkerGitWorktreeProbeMatrixValidationResult;
}

/**
 * Validate boundary-category probe matrix — A04 slice gate.
 */
export function validateWorkerGitWorktreeBoundaryProbeMatrix(
  results: WorkerGitWorktreeProbeResult[],
  contract: WorkerGitWorktreeContract = getActiveWorkerGitWorktreeContract(),
): WorkerGitWorktreeProbeMatrixValidationResult {
  const boundaryProbes = listWorkerGitWorktreeContractProbesByCategory("boundary", contract);
  const boundaryContract: WorkerGitWorktreeContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateWorkerGitWorktreeProbeMatrix(boundaryResults, boundaryContract);
}

/**
 * A04 boundary slice: contract-wired boundary probes (git branch input edge cases,
 * commit normalization, probe runner, documented gaps, source block gate refs) with zero
 * unexpected mismatches.
 */
export function runWorkerGitWorktreeBoundarySlice(
  fixture: WorkerGitWorktreeBaseline = loadWorkerGitWorktreeBaseline(),
): WorkerGitWorktreeBoundarySliceResult {
  const contract = getActiveWorkerGitWorktreeContract();
  const results = runWorkerGitWorktreeProbes(fixture);
  const boundaryProbes = listWorkerGitWorktreeContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateWorkerGitWorktreeBoundaryProbeMatrix(results, contract);

  return {
    atom: "P05-B05-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}
