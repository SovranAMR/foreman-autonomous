/**
 * FOREMAN — Worker Shell & Process Lifecycle Baseline (P05-B04)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P05-B03 worker edit engine block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import workerShellProcessBaseline from "./fixtures/forge-worker-shell-process-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP05B03ToB04Handoff,
  summarizeWorkerEditEngineContractCoverage,
  getActiveWorkerEditEngineContract,
} from "./forge-p05-worker-edit-engine.js";
import { TOOL_DEFINITIONS } from "./tools.js";

export const FORGE_WORKER_SHELL_PROCESS_VERSION = "1.0.0-a02";

export const EXPECTED_P05_B03_SEALED_ATOM_COUNT = 10;

/** Maximum normalized shell command length before truncation (P05-B04-A01 boundary). */
export const WORKER_SHELL_PROCESS_COMMAND_MAX_LENGTH = 65_536;

export const WORKER_SHELL_PROCESS_CATEGORIES = [
  "shell_versioning",
  "shell_signal",
  "process_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type WorkerShellProcessCategory = (typeof WORKER_SHELL_PROCESS_CATEGORIES)[number];

export const WORKER_SHELL_PROCESS_A01_MIN_PROBES: Readonly<
  Record<WorkerShellProcessCategory, number>
> = {
  shell_versioning: 3,
  shell_signal: 4,
  process_signal: 4,
  baseline_link: 2,
  boundary: 7,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 3,
};

export type ShellCommandInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface ShellCommandInputBoundary {
  disposition: ShellCommandInputDisposition;
  acceptable: boolean;
  normalizedCommand: string;
  truncated: boolean;
  detail: string;
}

export interface ShellCommandRecoveryResult {
  recovered: boolean;
  command: string;
  timeoutMs?: number;
  parseErrors: string[];
  detail: string;
}

export interface WorkerShellProcessFixtureEntry {
  id: string;
  category: WorkerShellProcessCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface WorkerShellProcessBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    workerEditEngineProbeCount: number;
    sealedAtomCount: number;
  };
  probes: WorkerShellProcessFixtureEntry[];
}

export interface WorkerShellProcessProbeResult {
  id: string;
  category: WorkerShellProcessCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface WorkerShellProcessValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: WorkerShellProcessCategory;
  detail: string;
}

export interface WorkerShellProcessValidationResult {
  valid: boolean;
  issues: WorkerShellProcessValidationIssue[];
}

export interface WorkerShellProcessProbeSummary {
  total: number;
  aligned: number;
  mismatches: WorkerShellProcessProbeResult[];
  knownGaps: WorkerShellProcessProbeResult[];
  byCategory: Record<
    WorkerShellProcessCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export type WorkerShellProcessProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface WorkerShellProcessProbeContract {
  id: string;
  category: WorkerShellProcessCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: WorkerShellProcessProbeDisposition;
  criterion: string;
}

export interface WorkerShellProcessCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface WorkerShellProcessCategoryContract {
  category: WorkerShellProcessCategory;
  acceptance: WorkerShellProcessCategoryAcceptance;
  probes: readonly WorkerShellProcessProbeContract[];
}

export interface WorkerShellProcessContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<WorkerShellProcessCategory, WorkerShellProcessCategoryContract>;
  probes: readonly WorkerShellProcessProbeContract[];
}

function flattenWorkerShellProcessCategoryProbes(
  categories: Record<WorkerShellProcessCategory, WorkerShellProcessCategoryContract>,
): readonly WorkerShellProcessProbeContract[] {
  return WORKER_SHELL_PROCESS_CATEGORIES.flatMap(category => categories[category].probes);
}

const WORKER_SHELL_PROCESS_CATEGORY_CONTRACTS: Record<
  WorkerShellProcessCategory,
  WorkerShellProcessCategoryContract
> = {
  shell_versioning: {
    category: "shell_versioning",
    acceptance: {
      invariant:
        "Worker shell process baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wsp.version_tagged",
        category: "shell_versioning",
        description: "Shell process baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Shell process baseline declares semver version field",
      },
      {
        id: "wsp.atom_tagged",
        category: "shell_versioning",
        description: "Shell process baseline declares P05-B04-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Shell process baseline declares P05-B04-A01 atom id",
      },
      {
        id: "wsp.harness_version_exported",
        category: "shell_versioning",
        description: "FORGE_WORKER_SHELL_PROCESS_VERSION exported for shell process harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_WORKER_SHELL_PROCESS_VERSION exported for shell process harness",
      },
    ],
  },
  shell_signal: {
    category: "shell_signal",
    acceptance: {
      invariant:
        "bash tool, ExecutionEngine sync/async shell runners and typed shell call union gate worker dispatch.",
      minProbeCount: 4,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "wsp.bash_tool_defined",
        category: "shell_signal",
        description: "bash tool routes worker shell commands through ExecutionEngine dispatch",
        expected: "PASS",
        disposition: "observed",
        criterion: "bash tool routes worker shell commands through ExecutionEngine dispatch",
      },
      {
        id: "wsp.execution_engine_run_shell",
        category: "shell_signal",
        description: "ExecutionEngine.runShell provides sync shell execution with timeout",
        expected: "PASS",
        disposition: "observed",
        criterion: "ExecutionEngine.runShell provides sync shell execution with timeout",
      },
      {
        id: "wsp.execution_engine_run_shell_async",
        category: "shell_signal",
        description: "ExecutionEngine.runShellAsync provides async spawn with kill escalation",
        expected: "PASS",
        disposition: "observed",
        criterion: "ExecutionEngine.runShellAsync provides async spawn with kill escalation",
      },
      {
        id: "wsp.typed_shell_call_union",
        category: "shell_signal",
        description: "TypedBashCall discriminated union narrows command and timeout args before shell dispatch",
        expected: "FAIL",
        disposition: "gap",
        criterion: "TypedBashCall discriminated union narrows command and timeout args before shell dispatch",
      },
    ],
  },
  process_signal: {
    category: "process_signal",
    acceptance: {
      invariant:
        "ProcessRegistry lifecycle, list_processes tool, background shell and thought-scoped tracking gate process lifecycle.",
      minProbeCount: 4,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "wsp.process_registry_exported",
        category: "process_signal",
        description: "ProcessRegistry exports lifecycle tracking for background shell processes",
        expected: "PASS",
        disposition: "observed",
        criterion: "ProcessRegistry exports lifecycle tracking for background shell processes",
      },
      {
        id: "wsp.list_processes_tool",
        category: "process_signal",
        description: "list_processes tool exposes running and finished process sessions to worker",
        expected: "PASS",
        disposition: "observed",
        criterion: "list_processes tool exposes running and finished process sessions to worker",
      },
      {
        id: "wsp.run_shell_background",
        category: "process_signal",
        description: "ExecutionEngine.runShellBackground supports yieldMs background execution",
        expected: "PASS",
        disposition: "observed",
        criterion: "ExecutionEngine.runShellBackground supports yieldMs background execution",
      },
      {
        id: "wsp.thought_scoped_process_tracking",
        category: "process_signal",
        description: "Async shell spawn registers thoughtId and layer on ProcessRegistry sessions",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Async shell spawn registers thoughtId and layer on ProcessRegistry sessions",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Worker shell process baseline links to sealed P05-B03 worker edit engine block gate.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wsp.b03_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P05_B03_TO_B04_HANDOFF_V1 targets P05-B04-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P05_B03_TO_B04_HANDOFF_V1 targets P05-B04-A01 entry atom",
      },
      {
        id: "wsp.b03_sealed_edit_engine_probes",
        category: "baseline_link",
        description: "P05-B03→B04 handoff sealed probeCount matches active worker edit engine contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P05-B03→B04 handoff sealed probeCount matches active worker edit engine contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Shell command boundary assessment rejects invalid input; probe runner and documented gaps wired.",
      minProbeCount: 7,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wsp.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P05-B03 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P05-B03 block gate source artifacts",
      },
      {
        id: "wsp.probe_runner_exported",
        category: "boundary",
        description: "runWorkerShellProcessProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runWorkerShellProcessProbes executes contract-wired probe matrix",
      },
      {
        id: "wsp.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL shell process gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL shell process gap",
      },
      {
        id: "wsp.empty_command_boundary",
        category: "boundary",
        description: "assessShellCommandInputBoundary rejects empty shell command input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessShellCommandInputBoundary rejects empty shell command input",
      },
      {
        id: "wsp.whitespace_command_boundary",
        category: "boundary",
        description: "assessShellCommandInputBoundary rejects whitespace-only shell command input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessShellCommandInputBoundary rejects whitespace-only shell command input",
      },
      {
        id: "wsp.null_byte_command_boundary",
        category: "boundary",
        description: "assessShellCommandInputBoundary rejects null-byte shell command safely",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessShellCommandInputBoundary rejects null-byte shell command safely",
      },
      {
        id: "wsp.long_command_truncation_boundary",
        category: "boundary",
        description: "assessShellCommandInputBoundary truncates command exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessShellCommandInputBoundary truncates command exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Invalid fixture versions and null-byte shell command input are rejected safely.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wsp.invalid_version_rejected",
        category: "failure_path",
        description: "validateWorkerShellProcessBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateWorkerShellProcessBaseline rejects unexpected fixture version",
      },
      {
        id: "wsp.malformed_command_guard",
        category: "failure_path",
        description: "assessShellCommandInputBoundary rejects embedded null-byte command segments safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessShellCommandInputBoundary rejects embedded null-byte command segments safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant: "Malformed bash tool args coerce into dispatch-ready shell command records.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wsp.recovery_string_args_coercion",
        category: "recovery_path",
        description: "recoverShellCommandRequest coerces JSON string args into dispatch-ready record",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverShellCommandRequest coerces JSON string args into dispatch-ready record",
      },
      {
        id: "wsp.recovery_missing_command_rejected",
        category: "recovery_path",
        description: "recoverShellCommandRequest rejects unrecoverable missing command input",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverShellCommandRequest rejects unrecoverable missing command input",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Worker prompt shell contract, orchestrator pre-shell validation and exported shell validator gate NO-GO paths.",
      minProbeCount: 3,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "wsp.worker_prompt_shell_contract",
        category: "nogo_path",
        description: "WORKER_SYSTEM prompt declares shell and process lifecycle contract for worker execution",
        expected: "FAIL",
        disposition: "gap",
        criterion: "WORKER_SYSTEM prompt declares shell and process lifecycle contract for worker execution",
      },
      {
        id: "wsp.orchestrator_pre_shell_validation",
        category: "nogo_path",
        description: "Orchestrator validates shell command boundary before bash tool dispatch",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator validates shell command boundary before bash tool dispatch",
      },
      {
        id: "wsp.exported_shell_validator",
        category: "nogo_path",
        description: "validateShellCommand exported for orchestrator shell process checks",
        expected: "FAIL",
        disposition: "gap",
        criterion: "validateShellCommand exported for orchestrator shell process checks",
      },
    ],
  },
};

export const FORGE_WORKER_SHELL_PROCESS_CONTRACT_V1: WorkerShellProcessContract = {
  version: "1.0.0",
  atom: "P05-B04-A02",
  purpose: "Worker shell and process lifecycle typed contract with measurable acceptance probes.",
  categories: WORKER_SHELL_PROCESS_CATEGORY_CONTRACTS,
  probes: flattenWorkerShellProcessCategoryProbes(WORKER_SHELL_PROCESS_CATEGORY_CONTRACTS),
};

export function getActiveWorkerShellProcessContract(): WorkerShellProcessContract {
  return FORGE_WORKER_SHELL_PROCESS_CONTRACT_V1;
}

export function getWorkerShellProcessCategoryContract(
  category: WorkerShellProcessCategory,
  contract: WorkerShellProcessContract = getActiveWorkerShellProcessContract(),
): WorkerShellProcessCategoryContract {
  return contract.categories[category];
}

export function listWorkerShellProcessContractProbeIds(
  contract: WorkerShellProcessContract = getActiveWorkerShellProcessContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listWorkerShellProcessProbesByDisposition(
  disposition: WorkerShellProcessProbeDisposition,
  contract: WorkerShellProcessContract = getActiveWorkerShellProcessContract(),
): WorkerShellProcessProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listWorkerShellProcessContractProbesByCategory(
  category: WorkerShellProcessCategory,
  contract: WorkerShellProcessContract = getActiveWorkerShellProcessContract(),
): readonly WorkerShellProcessProbeContract[] {
  return [...contract.categories[category].probes];
}

export interface WorkerShellProcessContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: WorkerShellProcessCategory;
  detail: string;
}

export interface WorkerShellProcessContractCoverageResult {
  valid: boolean;
  issues: WorkerShellProcessContractCoverageIssue[];
}

export function summarizeWorkerShellProcessContractCoverage(
  contract: WorkerShellProcessContract = getActiveWorkerShellProcessContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<WorkerShellProcessCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<WorkerShellProcessProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    WorkerShellProcessCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<WorkerShellProcessProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of WORKER_SHELL_PROCESS_CATEGORIES) {
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

export function validateWorkerShellProcessContractCoverage(
  contract: WorkerShellProcessContract = getActiveWorkerShellProcessContract(),
): WorkerShellProcessContractCoverageResult {
  const issues: WorkerShellProcessContractCoverageIssue[] = [];

  for (const category of WORKER_SHELL_PROCESS_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({
        kind: "missing_category",
        category,
        detail: `missing category contract: ${category}`,
      });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < WORKER_SHELL_PROCESS_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${WORKER_SHELL_PROCESS_A01_MIN_PROBES[category]}`,
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

  const ids = listWorkerShellProcessContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeWorkerShellProcessContractCoverage(contract);
  if (summary.totalProbes !== ids.length) {
    issues.push({
      kind: "coverage_mismatch",
      detail: `totalProbes=${summary.totalProbes} ids=${ids.length}`,
    });
  }

  for (const probe of contract.probes) {
    if (!probe.id.startsWith("wsp.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing wsp. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateWorkerShellProcessContract(
  contract: WorkerShellProcessContract = getActiveWorkerShellProcessContract(),
): WorkerShellProcessContractCoverageResult {
  return validateWorkerShellProcessContractCoverage(contract);
}

export function validateWorkerShellProcessAgainstContract(
  fixture: WorkerShellProcessBaseline,
  contract: WorkerShellProcessContract = getActiveWorkerShellProcessContract(),
): WorkerShellProcessValidationResult {
  const issues: WorkerShellProcessValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of WORKER_SHELL_PROCESS_CATEGORIES) {
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

  const gapProbes = listWorkerShellProcessProbesByDisposition("gap", contract);
  for (const gap of gapProbes) {
    if (gap.expected !== "FAIL") {
      issues.push({
        kind: "missing_probe",
        probeId: gap.id,
        detail: `${gap.id} gap disposition requires expected FAIL`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

function readSrc(relativePath: string): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(moduleDir, relativePath), "utf8");
}

/**
 * Assess shell command input boundary conditions before worker dispatch (P05-B04-A01).
 */
export function assessShellCommandInputBoundary(command: string): ShellCommandInputBoundary {
  if (command.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedCommand: "",
      truncated: false,
      detail: "null byte detected in shell command input",
    };
  }

  const trimmed = command.trim();
  if (trimmed.length === 0) {
    const disposition: ShellCommandInputDisposition =
      command.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedCommand: "",
      truncated: false,
      detail: disposition === "empty" ? "empty shell command input" : "whitespace-only shell command input",
    };
  }

  let normalizedCommand = command;
  let truncated = false;
  if (normalizedCommand.length > WORKER_SHELL_PROCESS_COMMAND_MAX_LENGTH) {
    normalizedCommand = normalizedCommand.slice(0, WORKER_SHELL_PROCESS_COMMAND_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedCommand,
    truncated,
    detail: truncated
      ? `command truncated to ${WORKER_SHELL_PROCESS_COMMAND_MAX_LENGTH} characters`
      : "valid shell command input",
  };
}

/**
 * Recover malformed bash tool args into dispatch-ready record (P05-B04-A01).
 */
export function recoverShellCommandRequest(
  command: unknown,
  timeoutMs: unknown = 30_000,
): ShellCommandRecoveryResult {
  let resolvedCommand = command;
  let resolvedTimeout = timeoutMs;
  const parseErrors: string[] = [];

  if (typeof command === "string" && command.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(command) as Record<string, unknown>;
      if (typeof parsed.command === "string") resolvedCommand = parsed.command;
      if (typeof parsed.timeout_ms === "number") resolvedTimeout = parsed.timeout_ms;
      parseErrors.push("coerced_json_command");
    } catch {
      parseErrors.push("invalid_json_command");
    }
  }

  if (typeof resolvedCommand !== "string") {
    return {
      recovered: false,
      command: "",
      parseErrors: [...parseErrors, "invalid_command_field"],
      detail: "cannot recover non-string shell command",
    };
  }

  const boundary = assessShellCommandInputBoundary(resolvedCommand);
  if (!boundary.acceptable) {
    return {
      recovered: false,
      command: resolvedCommand,
      parseErrors: [...parseErrors, boundary.disposition],
      detail: boundary.detail,
    };
  }

  const timeout =
    typeof resolvedTimeout === "number" && Number.isFinite(resolvedTimeout) && resolvedTimeout > 0
      ? resolvedTimeout
      : 30_000;

  return {
    recovered: true,
    command: boundary.normalizedCommand,
    timeoutMs: timeout,
    parseErrors,
    detail: `recovered command length=${boundary.normalizedCommand.length}`,
  };
}

export const FORGE_WORKER_SHELL_PROCESS_A01_PROBE_MATRIX: readonly WorkerShellProcessFixtureEntry[] =
  workerShellProcessBaseline.probes as WorkerShellProcessFixtureEntry[];

export function getWorkerShellProcessA01ExpectedFailCount(): number {
  return FORGE_WORKER_SHELL_PROCESS_A01_PROBE_MATRIX.filter(p => p.expected === "FAIL").length;
}

export function loadWorkerShellProcessBaseline(): WorkerShellProcessBaseline {
  return workerShellProcessBaseline as WorkerShellProcessBaseline;
}

export function validateWorkerShellProcessBaseline(
  fixture: WorkerShellProcessBaseline,
): WorkerShellProcessValidationResult {
  const issues: WorkerShellProcessValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P05-B04-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    WORKER_SHELL_PROCESS_CATEGORIES.map(category => [category, 0]),
  ) as Record<WorkerShellProcessCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of WORKER_SHELL_PROCESS_CATEGORIES) {
    const min = WORKER_SHELL_PROCESS_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_WORKER_SHELL_PROCESS_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_WORKER_SHELL_PROCESS_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_WORKER_SHELL_PROCESS_A01_PROBE_MATRIX) {
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

  const expectedFailCount = getWorkerShellProcessA01ExpectedFailCount();
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

  const handoff = getForgeP05B03ToB04Handoff();
  const editEngineCoverage = summarizeWorkerEditEngineContractCoverage(
    getActiveWorkerEditEngineContract(),
  );

  if (fixture.sourceBlockGate.atom !== "P05-B03-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P05-B03-A10`,
    });
  }
  if (fixture.sourceBlockGate.workerEditEngineProbeCount !== editEngineCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.workerEditEngineProbeCount=${fixture.sourceBlockGate.workerEditEngineProbeCount} ` +
        `contract=${editEngineCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P05_B03_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P05_B03_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P05-B04-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P05-B04-A01`,
    });
  }

  return { valid: issues.length === 0, issues };
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: WorkerShellProcessCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
): WorkerShellProcessProbeResult {
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

function processRegistrySource(): string {
  return readSrc("process-registry.ts");
}

function productionShellProcessSource(): string {
  return readSrc("forge-p05-worker-shell-process.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionShellProcessSource());
}

function probeShellVersioning(
  id: string,
  category: WorkerShellProcessCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerShellProcessBaseline,
): WorkerShellProcessProbeResult {
  switch (id) {
    case "wsp.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "wsp.atom_tagged": {
      const ok = fixture.atom === "P05-B04-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "wsp.harness_version_exported": {
      const ok = FORGE_WORKER_SHELL_PROCESS_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_WORKER_SHELL_PROCESS_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown shell_versioning probe");
  }
}

function probeShellSignal(
  id: string,
  category: WorkerShellProcessCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerShellProcessProbeResult {
  const tools = toolsSource();
  const executionEngine = executionEngineSource();

  switch (id) {
    case "wsp.bash_tool_defined": {
      const ok =
        TOOL_DEFINITIONS.some(def => def.name === "bash") &&
        tools.includes('case "bash"');
      return probe(id, category, expected, ok, `bashTool=${ok}`);
    }
    case "wsp.execution_engine_run_shell": {
      const ok = executionEngine.includes("runShell(");
      return probe(id, category, expected, ok, `runShell=${ok}`);
    }
    case "wsp.execution_engine_run_shell_async": {
      const ok = executionEngine.includes("runShellAsync(");
      return probe(id, category, expected, ok, `runShellAsync=${ok}`);
    }
    case "wsp.typed_shell_call_union": {
      const ok =
        tools.includes("export type TypedBashCall") ||
        tools.includes("interface TypedBashCall") ||
        tools.includes("export type TypedShellCall");
      return probe(id, category, expected, ok, `typedShellCall=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown shell_signal probe");
  }
}

function probeProcessSignal(
  id: string,
  category: WorkerShellProcessCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerShellProcessProbeResult {
  const tools = toolsSource();
  const executionEngine = executionEngineSource();
  const processRegistry = processRegistrySource();

  switch (id) {
    case "wsp.process_registry_exported": {
      const ok =
        processRegistry.includes("export class ProcessRegistry") &&
        executionEngine.includes("connectRegistry(");
      return probe(id, category, expected, ok, `processRegistry=${ok}`);
    }
    case "wsp.list_processes_tool": {
      const ok =
        TOOL_DEFINITIONS.some(def => def.name === "list_processes") &&
        tools.includes('case "list_processes"');
      return probe(id, category, expected, ok, `listProcessesTool=${ok}`);
    }
    case "wsp.run_shell_background": {
      const ok = executionEngine.includes("runShellBackground(");
      return probe(id, category, expected, ok, `runShellBackground=${ok}`);
    }
    case "wsp.thought_scoped_process_tracking": {
      const registerBody =
        executionEngine.match(/this\.registry\.register\([\s\S]*?\);/)?.[0] ?? "";
      const ok = registerBody.includes("thoughtId") && registerBody.includes("layer");
      return probe(id, category, expected, ok, `thoughtScopedRegister=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown process_signal probe");
  }
}

function probeBaselineLink(
  id: string,
  category: WorkerShellProcessCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerShellProcessProbeResult {
  switch (id) {
    case "wsp.b03_handoff_entry": {
      const handoff = getForgeP05B03ToB04Handoff();
      const ok =
        handoff.targetBlock.blockId === "P05-B04" &&
        handoff.targetBlock.entryAtom === "P05-B04-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "wsp.b03_sealed_edit_engine_probes": {
      const handoff = getForgeP05B03ToB04Handoff();
      const coverage = summarizeWorkerEditEngineContractCoverage(
        getActiveWorkerEditEngineContract(),
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
  category: WorkerShellProcessCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerShellProcessBaseline,
): WorkerShellProcessProbeResult {
  switch (id) {
    case "wsp.source_block_gate_ref": {
      const handoff = getForgeP05B03ToB04Handoff();
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P05_B03_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, sealed=${fixture.sourceBlockGate.sealedAtomCount}`,
      );
    }
    case "wsp.probe_runner_exported": {
      const ok = productionShellProcessSource().includes(
        "export function runWorkerShellProcessProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "wsp.known_gaps_documented": {
      const expectedFail = getWorkerShellProcessA01ExpectedFailCount();
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
    case "wsp.empty_command_boundary": {
      const result = assessShellCommandInputBoundary("");
      const ok = !result.acceptable && result.disposition === "empty";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    case "wsp.whitespace_command_boundary": {
      const result = assessShellCommandInputBoundary("   \t\n  ");
      const ok = !result.acceptable && result.disposition === "whitespace_only";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    case "wsp.null_byte_command_boundary": {
      const result = assessShellCommandInputBoundary("echo hello\0");
      const ok = !result.acceptable && result.disposition === "contains_null_byte";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    case "wsp.long_command_truncation_boundary": {
      const longCommand = "x".repeat(WORKER_SHELL_PROCESS_COMMAND_MAX_LENGTH + 500);
      const result = assessShellCommandInputBoundary(longCommand);
      const ok =
        result.acceptable && result.truncated && result.disposition === "exceeds_max_length";
      return probe(
        id,
        category,
        expected,
        ok,
        `truncated=${result.truncated}, commandLen=${result.normalizedCommand.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: WorkerShellProcessCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerShellProcessBaseline,
): WorkerShellProcessProbeResult {
  switch (id) {
    case "wsp.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const validation = validateWorkerShellProcessBaseline(invalid);
      const ok = validation.valid === false;
      return probe(id, category, expected, ok, `rejected=${ok}`);
    }
    case "wsp.malformed_command_guard": {
      const result = assessShellCommandInputBoundary("npm test\0");
      const ok = !result.acceptable && result.disposition === "contains_null_byte";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: WorkerShellProcessCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerShellProcessProbeResult {
  switch (id) {
    case "wsp.recovery_string_args_coercion": {
      const recovery = recoverShellCommandRequest(
        JSON.stringify({ command: "npm test", timeout_ms: 45_000 }),
      );
      const ok =
        recovery.recovered &&
        recovery.command === "npm test" &&
        recovery.timeoutMs === 45_000;
      return probe(id, category, expected, ok, recovery.detail);
    }
    case "wsp.recovery_missing_command_rejected": {
      const recovery = recoverShellCommandRequest("");
      const ok = !recovery.recovered && recovery.parseErrors.includes("empty");
      return probe(id, category, expected, ok, recovery.detail);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: WorkerShellProcessCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerShellProcessProbeResult {
  const orchestrator = orchestratorSource();
  const prompts = promptsSource();

  switch (id) {
    case "wsp.worker_prompt_shell_contract": {
      const ok =
        prompts.includes("SHELL AND PROCESS LIFECYCLE") ||
        prompts.includes("shell and process lifecycle contract");
      return probe(id, category, expected, ok, `shellContractSection=${ok}`);
    }
    case "wsp.orchestrator_pre_shell_validation": {
      const ok =
        orchestrator.includes("validateShellCommand(") ||
        orchestrator.includes("assessShellCommandInputBoundary(");
      return probe(id, category, expected, ok, `preShellValidation=${ok}`);
    }
    case "wsp.exported_shell_validator": {
      const ok = hasProductionExport("validateShellCommand");
      return probe(id, category, expected, ok, `shellValidator=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: WorkerShellProcessCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerShellProcessBaseline,
): WorkerShellProcessProbeResult {
  switch (category) {
    case "shell_versioning":
      return probeShellVersioning(id, category, expected, fixture);
    case "shell_signal":
      return probeShellSignal(id, category, expected);
    case "process_signal":
      return probeProcessSignal(id, category, expected);
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

export function runWorkerShellProcessProbes(
  fixture: WorkerShellProcessBaseline = loadWorkerShellProcessBaseline(),
): WorkerShellProcessProbeResult[] {
  const contract = getActiveWorkerShellProcessContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion ? { ...result, criterion: contractProbe.criterion } : result;
  });
}

export function summarizeWorkerShellProcessMatrix(
  results: WorkerShellProcessProbeResult[] = runWorkerShellProcessProbes(),
): WorkerShellProcessProbeSummary {
  const byCategory = Object.fromEntries(
    WORKER_SHELL_PROCESS_CATEGORIES.map(category => [
      category,
      { total: 0, aligned: 0, expectedFail: 0 },
    ]),
  ) as WorkerShellProcessProbeSummary["byCategory"];

  const mismatches: WorkerShellProcessProbeResult[] = [];
  const knownGaps: WorkerShellProcessProbeResult[] = [];

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

export function listWorkerShellProcessProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerShellProcessBaseline = loadWorkerShellProcessBaseline(),
): WorkerShellProcessFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listWorkerShellProcessKnownGaps(
  results: WorkerShellProcessProbeResult[] = runWorkerShellProcessProbes(),
): WorkerShellProcessProbeResult[] {
  return summarizeWorkerShellProcessMatrix(results).knownGaps;
}

export function probeDangerousShellCommandBlocked(): boolean {
  const executionEngine = executionEngineSource();
  return (
    executionEngine.includes("isDangerous(") &&
    executionEngine.includes("Dangerous command blocked")
  );
}
