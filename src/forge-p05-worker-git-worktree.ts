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
import { TOOL_DEFINITIONS } from "./tools.js";

export const FORGE_WORKER_GIT_WORKTREE_VERSION = "1.0.0-a01";

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
      const expectedFail = getWorkerGitWorktreeA01ExpectedFailCount();
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount === expectedFail && failCount >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, matrixExpectedFail=${expectedFail}`,
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
  return fixture.probes.map(entry =>
    runSingleProbe(entry.id, entry.category, entry.expected, fixture),
  );
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
