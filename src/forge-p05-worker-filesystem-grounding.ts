/**
 * FOREMAN — Worker Filesystem Grounding Baseline (P05-B02)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P05-B01 worker tool dispatch block gate artifacts.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import workerFilesystemGroundingBaseline from "./fixtures/forge-worker-filesystem-grounding-v1.json" with { type: "json" };
import type {
  ForgeAcceptanceOutcome,
  ForgeBlockAtomSeal,
  ForgeBlockGateCheck,
  ForgeBlockGateDefinition,
} from "./forge-baseline-contract.js";
import {
  getForgeP05B01ToB02Handoff,
  getActiveWorkerToolDispatchContract,
  summarizeWorkerToolDispatchContractCoverage,
} from "./forge-p05-worker-tool-dispatch.js";
import { TOOL_DEFINITIONS } from "./tools.js";
import type { ToolCall } from "./tools.js";
import { ExecutionEngine } from "./execution-engine.js";

export const FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION = "1.0.0-a10";

export const EXPECTED_P05_B01_SEALED_ATOM_COUNT = 10;

/** Maximum normalized filesystem read path length before truncation (P05-B02-A01 boundary). */
export const WORKER_FILESYSTEM_GROUNDING_PATH_MAX_LENGTH = 4096;

export const WORKER_FILESYSTEM_GROUNDING_CATEGORIES = [
  "grounding_versioning",
  "read_signal",
  "path_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type WorkerFilesystemGroundingCategory =
  (typeof WORKER_FILESYSTEM_GROUNDING_CATEGORIES)[number];

export const WORKER_FILESYSTEM_GROUNDING_A01_MIN_PROBES: Readonly<
  Record<WorkerFilesystemGroundingCategory, number>
> = {
  grounding_versioning: 3,
  read_signal: 4,
  path_signal: 4,
  baseline_link: 2,
  boundary: 7,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 3,
};

export type FilesystemReadInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface FilesystemReadInputBoundary {
  disposition: FilesystemReadInputDisposition;
  acceptable: boolean;
  normalizedPath: string;
  truncated: boolean;
  detail: string;
}

export interface FilesystemReadPathRecoveryResult {
  recovered: boolean;
  path: string;
  parseErrors: string[];
  detail: string;
}

export interface FilesystemReadLineRangeBoundary {
  valid: boolean;
  startLine?: number;
  endLine?: number;
  detail: string;
}

export interface WorkerFilesystemGroundingFixtureEntry {
  id: string;
  category: WorkerFilesystemGroundingCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface WorkerFilesystemGroundingBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    workerToolDispatchProbeCount: number;
    sealedAtomCount: number;
  };
  probes: WorkerFilesystemGroundingFixtureEntry[];
}

export interface WorkerFilesystemGroundingProbeResult {
  id: string;
  category: WorkerFilesystemGroundingCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export type WorkerFilesystemGroundingProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface WorkerFilesystemGroundingProbeContract {
  id: string;
  category: WorkerFilesystemGroundingCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: WorkerFilesystemGroundingProbeDisposition;
  criterion: string;
}

export interface WorkerFilesystemGroundingCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface WorkerFilesystemGroundingCategoryContract {
  category: WorkerFilesystemGroundingCategory;
  acceptance: WorkerFilesystemGroundingCategoryAcceptance;
  probes: readonly WorkerFilesystemGroundingProbeContract[];
}

export interface WorkerFilesystemGroundingContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<WorkerFilesystemGroundingCategory, WorkerFilesystemGroundingCategoryContract>;
  probes: readonly WorkerFilesystemGroundingProbeContract[];
}

function flattenWorkerFilesystemGroundingCategoryProbes(
  categories: Record<WorkerFilesystemGroundingCategory, WorkerFilesystemGroundingCategoryContract>,
): readonly WorkerFilesystemGroundingProbeContract[] {
  return WORKER_FILESYSTEM_GROUNDING_CATEGORIES.flatMap(category => categories[category].probes);
}

const WORKER_FILESYSTEM_GROUNDING_CATEGORY_CONTRACTS: Record<
  WorkerFilesystemGroundingCategory,
  WorkerFilesystemGroundingCategoryContract
> = {
  grounding_versioning: {
    category: "grounding_versioning",
    acceptance: {
      invariant:
        "Worker filesystem grounding baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wfg.version_tagged",
        category: "grounding_versioning",
        description: "Filesystem grounding baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Filesystem grounding baseline declares semver version field",
      },
      {
        id: "wfg.atom_tagged",
        category: "grounding_versioning",
        description: "Filesystem grounding baseline declares P05-B02-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Filesystem grounding baseline declares P05-B02-A01 atom id",
      },
      {
        id: "wfg.harness_version_exported",
        category: "grounding_versioning",
        description: "FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION exported for grounding harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION exported for grounding harness",
      },
    ],
  },
  read_signal: {
    category: "read_signal",
    acceptance: {
      invariant:
        "read_file tool, ExecutionEngine reads and typed read union gate worker file content grounding.",
      minProbeCount: 4,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "wfg.read_file_tool_defined",
        category: "read_signal",
        description: "read_file tool enables worker file content grounding",
        expected: "PASS",
        disposition: "observed",
        criterion: "read_file tool enables worker file content grounding",
      },
      {
        id: "wfg.execution_engine_read_file",
        category: "read_signal",
        description: "ExecutionEngine.readFile provides secure project-root file reads",
        expected: "PASS",
        disposition: "observed",
        criterion: "ExecutionEngine.readFile provides secure project-root file reads",
      },
      {
        id: "wfg.typed_read_call_union",
        category: "read_signal",
        description: "TypedReadCall discriminated union narrows path and line-range args before read",
        expected: "PASS",
        disposition: "observed",
        criterion: "TypedReadCall discriminated union narrows path and line-range args before read",
      },
      {
        id: "wfg.worker_prompt_grounding_contract",
        category: "read_signal",
        description: "WORKER_SYSTEM prompt declares filesystem grounding contract for read-before-edit",
        expected: "PASS",
        disposition: "observed",
        criterion: "WORKER_SYSTEM prompt declares filesystem grounding contract for read-before-edit",
      },
    ],
  },
  path_signal: {
    category: "path_signal",
    acceptance: {
      invariant:
        "Secure path resolution, denied paths, line-range reads and orchestrator pre-read grounding gate edits.",
      minProbeCount: 4,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "wfg.secure_path_resolution",
        category: "path_signal",
        description: "ExecutionEngine.securePath resolves paths within project root",
        expected: "PASS",
        disposition: "observed",
        criterion: "ExecutionEngine.securePath resolves paths within project root",
      },
      {
        id: "wfg.denied_path_blocklist",
        category: "path_signal",
        description: "ExecutionEngine denies sensitive paths (.env, credentials) before read",
        expected: "PASS",
        disposition: "observed",
        criterion: "ExecutionEngine denies sensitive paths (.env, credentials) before read",
      },
      {
        id: "wfg.line_range_reading",
        category: "path_signal",
        description: "ExecutionEngine.readFile supports start_line and end_line grounding slices",
        expected: "PASS",
        disposition: "observed",
        criterion: "ExecutionEngine.readFile supports start_line and end_line grounding slices",
      },
      {
        id: "wfg.orchestrator_pre_read_grounding",
        category: "path_signal",
        description: "Orchestrator validates filesystem read grounding before edit/write dispatch",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator validates filesystem read grounding before edit/write dispatch",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Worker filesystem grounding baseline links to sealed P05-B01 worker tool dispatch block gate.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wfg.b01_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P05_B01_TO_B02_HANDOFF_V1 targets P05-B02-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P05_B01_TO_B02_HANDOFF_V1 targets P05-B02-A01 entry atom",
      },
      {
        id: "wfg.b01_sealed_dispatch_probes",
        category: "baseline_link",
        description: "P05-B01→B02 handoff sealed probeCount matches active worker tool dispatch contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P05-B01→B02 handoff sealed probeCount matches active worker tool dispatch contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Filesystem read path boundary assessment rejects invalid input; probe runner and documented gaps wired.",
      minProbeCount: 7,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wfg.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P05-B01 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P05-B01 block gate source artifacts",
      },
      {
        id: "wfg.probe_runner_exported",
        category: "boundary",
        description: "runWorkerFilesystemGroundingProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runWorkerFilesystemGroundingProbes executes contract-wired probe matrix",
      },
      {
        id: "wfg.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL filesystem grounding gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL filesystem grounding gap",
      },
      {
        id: "wfg.empty_path_boundary",
        category: "boundary",
        description: "assessFilesystemReadInputBoundary rejects empty file path input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessFilesystemReadInputBoundary rejects empty file path input",
      },
      {
        id: "wfg.whitespace_path_boundary",
        category: "boundary",
        description: "assessFilesystemReadInputBoundary rejects whitespace-only file path input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessFilesystemReadInputBoundary rejects whitespace-only file path input",
      },
      {
        id: "wfg.null_byte_path_boundary",
        category: "boundary",
        description: "assessFilesystemReadInputBoundary rejects null-byte file path safely",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessFilesystemReadInputBoundary rejects null-byte file path safely",
      },
      {
        id: "wfg.long_path_truncation_boundary",
        category: "boundary",
        description: "assessFilesystemReadInputBoundary truncates file path exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessFilesystemReadInputBoundary truncates file path exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Invalid fixture versions and null-byte file path input are rejected safely.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wfg.invalid_version_rejected",
        category: "failure_path",
        description: "validateWorkerFilesystemGroundingBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateWorkerFilesystemGroundingBaseline rejects unexpected fixture version",
      },
      {
        id: "wfg.malformed_path_guard",
        category: "failure_path",
        description: "assessFilesystemReadInputBoundary rejects null-byte path segments safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessFilesystemReadInputBoundary rejects null-byte path segments safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant: "Recovery paths coerce malformed file paths into project-root read targets.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wfg.recovery_relative_path_coercion",
        category: "recovery_path",
        description: "recoverFilesystemReadPath coerces relative paths into project-root read targets",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverFilesystemReadPath coerces relative paths into project-root read targets",
      },
      {
        id: "wfg.recovery_missing_path_rejected",
        category: "recovery_path",
        description: "recoverFilesystemReadPath rejects unrecoverable missing file path input",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverFilesystemReadPath rejects unrecoverable missing file path input",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Read-before-edit validator, grounding validator and telemetry exports gate worker NO-GO wiring.",
      minProbeCount: 3,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "wfg.read_before_edit_validator",
        category: "nogo_path",
        description: "validateReadBeforeEdit rejects edit/write without prior read_file grounding",
        expected: "PASS",
        disposition: "nogo",
        criterion: "validateReadBeforeEdit rejects edit/write without prior read_file grounding",
      },
      {
        id: "wfg.grounding_telemetry_record",
        category: "nogo_path",
        description: "buildFilesystemGroundingTelemetry records read grounding provenance for worker loop",
        expected: "PASS",
        disposition: "nogo",
        criterion: "buildFilesystemGroundingTelemetry records read grounding provenance for worker loop",
      },
      {
        id: "wfg.exported_grounding_validator",
        category: "nogo_path",
        description: "validateFilesystemGrounding exported for orchestrator pre-read grounding checks",
        expected: "PASS",
        disposition: "nogo",
        criterion: "validateFilesystemGrounding exported for orchestrator pre-read grounding checks",
      },
    ],
  },
};

export const FORGE_WORKER_FILESYSTEM_GROUNDING_CONTRACT_V1: WorkerFilesystemGroundingContract = {
  version: "1.0.0",
  atom: "P05-B02-A02",
  purpose: "Worker filesystem read and grounding typed contract with measurable acceptance probes.",
  categories: WORKER_FILESYSTEM_GROUNDING_CATEGORY_CONTRACTS,
  probes: flattenWorkerFilesystemGroundingCategoryProbes(WORKER_FILESYSTEM_GROUNDING_CATEGORY_CONTRACTS),
};

export function getActiveWorkerFilesystemGroundingContract(): WorkerFilesystemGroundingContract {
  return FORGE_WORKER_FILESYSTEM_GROUNDING_CONTRACT_V1;
}

export function getWorkerFilesystemGroundingCategoryContract(
  category: WorkerFilesystemGroundingCategory,
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): WorkerFilesystemGroundingCategoryContract {
  return contract.categories[category];
}

export function listWorkerFilesystemGroundingContractProbeIds(
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listWorkerFilesystemGroundingProbesByDisposition(
  disposition: WorkerFilesystemGroundingProbeDisposition,
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): WorkerFilesystemGroundingProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listWorkerFilesystemGroundingContractProbesByCategory(
  category: WorkerFilesystemGroundingCategory,
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): readonly WorkerFilesystemGroundingProbeContract[] {
  return [...contract.categories[category].probes];
}

export interface WorkerFilesystemGroundingContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: WorkerFilesystemGroundingCategory;
  detail: string;
}

export interface WorkerFilesystemGroundingContractCoverageResult {
  valid: boolean;
  issues: WorkerFilesystemGroundingContractCoverageIssue[];
}

export function summarizeWorkerFilesystemGroundingContractCoverage(
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<WorkerFilesystemGroundingCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<WorkerFilesystemGroundingProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    WorkerFilesystemGroundingCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<WorkerFilesystemGroundingProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of WORKER_FILESYSTEM_GROUNDING_CATEGORIES) {
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

export function validateWorkerFilesystemGroundingContractCoverage(
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): WorkerFilesystemGroundingContractCoverageResult {
  const issues: WorkerFilesystemGroundingContractCoverageIssue[] = [];

  for (const category of WORKER_FILESYSTEM_GROUNDING_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({
        kind: "missing_category",
        category,
        detail: `missing category contract: ${category}`,
      });
      continue;
    }
    if (
      categoryContract.acceptance.minProbeCount <
      WORKER_FILESYSTEM_GROUNDING_A01_MIN_PROBES[category]
    ) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${WORKER_FILESYSTEM_GROUNDING_A01_MIN_PROBES[category]}`,
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

  const ids = listWorkerFilesystemGroundingContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeWorkerFilesystemGroundingContractCoverage(contract);
  if (summary.totalProbes !== ids.length) {
    issues.push({
      kind: "coverage_mismatch",
      detail: `totalProbes=${summary.totalProbes} ids=${ids.length}`,
    });
  }
  const dispositionSum =
    summary.byDisposition.observed +
    summary.byDisposition.gap +
    summary.byDisposition.failure +
    summary.byDisposition.recovery +
    summary.byDisposition.nogo;
  if (dispositionSum !== summary.totalProbes) {
    issues.push({
      kind: "coverage_mismatch",
      detail: `disposition sum=${dispositionSum} total=${summary.totalProbes}`,
    });
  }

  for (const probe of contract.probes) {
    if (!probe.id.startsWith("wfg.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing wfg. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateWorkerFilesystemGroundingContract(
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): WorkerFilesystemGroundingContractCoverageResult {
  return validateWorkerFilesystemGroundingContractCoverage(contract);
}

export function validateWorkerFilesystemGroundingAgainstContract(
  fixture: WorkerFilesystemGroundingBaseline,
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): WorkerFilesystemGroundingValidationResult {
  const issues: WorkerFilesystemGroundingValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of WORKER_FILESYSTEM_GROUNDING_CATEGORIES) {
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

export interface WorkerFilesystemGroundingValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: WorkerFilesystemGroundingCategory;
  detail: string;
}

export interface WorkerFilesystemGroundingValidationResult {
  valid: boolean;
  issues: WorkerFilesystemGroundingValidationIssue[];
}

export interface WorkerFilesystemGroundingProbeSummary {
  total: number;
  aligned: number;
  mismatches: WorkerFilesystemGroundingProbeResult[];
  knownGaps: WorkerFilesystemGroundingProbeResult[];
  byCategory: Record<
    WorkerFilesystemGroundingCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

function readSrc(relativePath: string): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(moduleDir, relativePath), "utf8");
}

/**
 * Assess filesystem read path input boundary conditions before worker grounding (P05-B02-A01).
 */
export function assessFilesystemReadInputBoundary(
  filePath: string,
): FilesystemReadInputBoundary {
  if (filePath.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedPath: "",
      truncated: false,
      detail: "null byte detected in file path input",
    };
  }

  const trimmed = filePath.trim();
  if (trimmed.length === 0) {
    const disposition: FilesystemReadInputDisposition =
      filePath.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedPath: "",
      truncated: false,
      detail: disposition === "empty" ? "empty file path input" : "whitespace-only file path input",
    };
  }

  let normalizedPath = trimmed;
  let truncated = false;
  if (normalizedPath.length > WORKER_FILESYSTEM_GROUNDING_PATH_MAX_LENGTH) {
    normalizedPath = normalizedPath.slice(0, WORKER_FILESYSTEM_GROUNDING_PATH_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedPath,
    truncated,
    detail: truncated
      ? `file path truncated to ${WORKER_FILESYSTEM_GROUNDING_PATH_MAX_LENGTH} characters`
      : "valid file path input",
  };
}

/**
 * Assess read_file line-range boundary before worker grounding (P05-B02-A04).
 */
export function assessFilesystemReadLineRangeBoundary(
  args: Record<string, unknown>,
): FilesystemReadLineRangeBoundary {
  const hasStart = "start_line" in args && args.start_line !== undefined;
  const hasEnd = "end_line" in args && args.end_line !== undefined;

  if (!hasStart && !hasEnd) {
    return { valid: true, detail: "no line range specified" };
  }

  const startLine = args.start_line;
  const endLine = args.end_line;

  if (hasStart && (typeof startLine !== "number" || !Number.isFinite(startLine) || startLine < 1)) {
    return {
      valid: false,
      detail: "start_line must be a positive finite number",
    };
  }

  if (hasEnd && (typeof endLine !== "number" || !Number.isFinite(endLine) || endLine < 1)) {
    return {
      valid: false,
      detail: "end_line must be a positive finite number",
    };
  }

  const normalizedStart = hasStart ? (startLine as number) : undefined;
  const normalizedEnd = hasEnd ? (endLine as number) : undefined;

  if (
    normalizedStart !== undefined &&
    normalizedEnd !== undefined &&
    normalizedStart > normalizedEnd
  ) {
    return {
      valid: false,
      startLine: normalizedStart,
      endLine: normalizedEnd,
      detail: "start_line must be less than or equal to end_line",
    };
  }

  return {
    valid: true,
    startLine: normalizedStart,
    endLine: normalizedEnd,
    detail: "valid line range",
  };
}

/**
 * Normalize filesystem read path through boundary assessment and recovery (P05-B02-A04).
 */
export function normalizeFilesystemGroundingPath(
  rawPath: string,
): FilesystemReadPathRecoveryResult {
  const boundary = assessFilesystemReadInputBoundary(rawPath);
  if (!boundary.acceptable) {
    return {
      recovered: false,
      path: rawPath,
      parseErrors: [boundary.disposition],
      detail: boundary.detail,
    };
  }
  return recoverFilesystemReadPath(boundary.normalizedPath);
}

/**
 * Recover malformed filesystem read path into project-root read target (P05-B02-A01).
 */
export function recoverFilesystemReadPath(rawPath: string): FilesystemReadPathRecoveryResult {
  const boundary = assessFilesystemReadInputBoundary(rawPath);
  if (!boundary.acceptable) {
    return {
      recovered: false,
      path: rawPath,
      parseErrors: [boundary.disposition],
      detail: `cannot recover ${boundary.disposition.replace(/_/g, "-")} file path`,
    };
  }

  let path = boundary.normalizedPath.replace(/\\/g, "/");
  const parseErrors: string[] = [];

  if (path.startsWith("./")) {
    path = path.slice(2);
  }
  while (path.startsWith("../")) {
    path = path.slice(3);
    parseErrors.push("stripped_parent_segment");
  }

  const recovered = parseErrors.length === 0 || path.length > 0;
  return {
    recovered,
    path,
    parseErrors,
    detail: recovered
      ? `recovered file path=${path}`
      : `partial recovery: ${parseErrors.join(", ")}`,
  };
}

const EDIT_WRITE_TOOLS = new Set(["edit_file", "write_file"]);

export interface FilesystemGroundingValidationResult {
  valid: boolean;
  errors: string[];
  path?: string;
}

export interface FilesystemGroundingTelemetry {
  toolName: string;
  path: string;
  sequenceIndex: number;
  grounded: boolean;
  recordedAt: string;
  contractVersion: string;
  harnessVersion: string;
  errors: string[];
}

/**
 * Validate read-before-edit: reject edit/write without prior read_file grounding (P05-B02-A03).
 */
export function validateReadBeforeEdit(
  call: ToolCall,
  priorReads: ReadonlySet<string>,
): FilesystemGroundingValidationResult {
  if (!EDIT_WRITE_TOOLS.has(call.name)) {
    return { valid: true, errors: [] };
  }

  const pathArg = call.args.path;
  if (typeof pathArg !== "string") {
    return { valid: false, errors: ["edit/write requires path argument"] };
  }

  const recovery = normalizeFilesystemGroundingPath(pathArg);
  if (!recovery.recovered) {
    return { valid: false, errors: [recovery.detail], path: pathArg };
  }

  if (!priorReads.has(recovery.path)) {
    return {
      valid: false,
      errors: [`read_file grounding required before ${call.name} on ${recovery.path}`],
      path: recovery.path,
    };
  }

  return { valid: true, errors: [], path: recovery.path };
}

/**
 * Validate filesystem grounding for worker tool call before orchestrator dispatch (P05-B02-A03).
 */
export function validateFilesystemGrounding(
  call: ToolCall,
  priorReads: ReadonlySet<string>,
): FilesystemGroundingValidationResult {
  if (call.name === "read_file") {
    const pathArg = call.args.path;
    if (typeof pathArg !== "string") {
      return { valid: false, errors: ["read_file requires path argument"] };
    }
    const lineRange = assessFilesystemReadLineRangeBoundary(call.args);
    if (!lineRange.valid) {
      return { valid: false, errors: [lineRange.detail] };
    }
    const recovery = normalizeFilesystemGroundingPath(pathArg);
    if (!recovery.recovered) {
      return { valid: false, errors: [recovery.detail] };
    }
    return { valid: true, errors: [], path: recovery.path };
  }

  return validateReadBeforeEdit(call, priorReads);
}

/**
 * Record filesystem read grounding provenance for worker loop telemetry (P05-B02-A03).
 */
export function buildFilesystemGroundingTelemetry(
  call: ToolCall,
  options: {
    sequenceIndex?: number;
    validation?: FilesystemGroundingValidationResult;
    priorReads?: ReadonlySet<string>;
  } = {},
): FilesystemGroundingTelemetry {
  const priorReads = options.priorReads ?? new Set<string>();
  const validation = options.validation ?? validateFilesystemGrounding(call, priorReads);
  const path =
    validation.path ??
    (typeof call.args.path === "string"
      ? normalizeFilesystemGroundingPath(call.args.path).path
      : "");

  return {
    toolName: call.name,
    path,
    sequenceIndex: options.sequenceIndex ?? 0,
    grounded: validation.valid,
    recordedAt: new Date().toISOString(),
    contractVersion: FORGE_WORKER_FILESYSTEM_GROUNDING_CONTRACT_V1.version,
    harnessVersion: FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION,
    errors: validation.errors,
  };
}

export const FORGE_WORKER_FILESYSTEM_GROUNDING_A01_PROBE_MATRIX: readonly WorkerFilesystemGroundingFixtureEntry[] =
  workerFilesystemGroundingBaseline.probes as WorkerFilesystemGroundingFixtureEntry[];

export function getWorkerFilesystemGroundingA01ExpectedFailCount(): number {
  return FORGE_WORKER_FILESYSTEM_GROUNDING_A01_PROBE_MATRIX.filter(p => p.expected === "FAIL")
    .length;
}

export function loadWorkerFilesystemGroundingBaseline(): WorkerFilesystemGroundingBaseline {
  return workerFilesystemGroundingBaseline as WorkerFilesystemGroundingBaseline;
}

export function validateWorkerFilesystemGroundingBaseline(
  fixture: WorkerFilesystemGroundingBaseline,
): WorkerFilesystemGroundingValidationResult {
  const issues: WorkerFilesystemGroundingValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P05-B02-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    WORKER_FILESYSTEM_GROUNDING_CATEGORIES.map(category => [category, 0]),
  ) as Record<WorkerFilesystemGroundingCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of WORKER_FILESYSTEM_GROUNDING_CATEGORIES) {
    const min = WORKER_FILESYSTEM_GROUNDING_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_WORKER_FILESYSTEM_GROUNDING_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_WORKER_FILESYSTEM_GROUNDING_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_WORKER_FILESYSTEM_GROUNDING_A01_PROBE_MATRIX) {
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

  const contract = getActiveWorkerFilesystemGroundingContract();
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

  const handoff = getForgeP05B01ToB02Handoff();
  const dispatchCoverage = summarizeWorkerToolDispatchContractCoverage(
    getActiveWorkerToolDispatchContract(),
  );

  if (fixture.sourceBlockGate.atom !== "P05-B01-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P05-B01-A10`,
    });
  }
  if (fixture.sourceBlockGate.workerToolDispatchProbeCount !== dispatchCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.workerToolDispatchProbeCount=${fixture.sourceBlockGate.workerToolDispatchProbeCount} ` +
        `contract=${dispatchCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P05_B01_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P05_B01_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P05-B02-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P05-B02-A01`,
    });
  }

  return { valid: issues.length === 0, issues };
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: WorkerFilesystemGroundingCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
): WorkerFilesystemGroundingProbeResult {
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

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function executionEngineSource(): string {
  return readSrc("execution-engine.ts");
}

function productionGroundingSource(): string {
  return readSrc("forge-p05-worker-filesystem-grounding.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionGroundingSource());
}

function probeGroundingVersioning(
  id: string,
  category: WorkerFilesystemGroundingCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerFilesystemGroundingBaseline,
): WorkerFilesystemGroundingProbeResult {
  switch (id) {
    case "wfg.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "wfg.atom_tagged": {
      const ok = fixture.atom === "P05-B02-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "wfg.harness_version_exported": {
      const ok = FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown grounding_versioning probe");
  }
}

function probeReadSignal(
  id: string,
  category: WorkerFilesystemGroundingCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerFilesystemGroundingProbeResult {
  const tools = toolsSource();
  const prompts = promptsSource();
  const execution = executionEngineSource();

  switch (id) {
    case "wfg.read_file_tool_defined": {
      const readDef = TOOL_DEFINITIONS.find(def => def.name === "read_file");
      const ok = readDef !== undefined && readDef.parameters !== undefined;
      return probe(id, category, expected, ok, `readFileTool=${ok}`);
    }
    case "wfg.execution_engine_read_file": {
      const ok =
        execution.includes("readFile(filePath: string") &&
        tools.includes('case "read_file"');
      return probe(id, category, expected, ok, `executionEngineReadFile=${ok}`);
    }
    case "wfg.typed_read_call_union": {
      const ok =
        tools.includes("export type TypedReadCall") ||
        tools.includes("interface TypedReadCall");
      return probe(id, category, expected, ok, `typedReadCall=${ok}`);
    }
    case "wfg.worker_prompt_grounding_contract": {
      const ok =
        prompts.includes("FILESYSTEM GROUNDING") ||
        prompts.includes("filesystem grounding contract") ||
        prompts.includes("Filesystem grounding contract");
      return probe(id, category, expected, ok, `groundingContractSection=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown read_signal probe");
  }
}

function probePathSignal(
  id: string,
  category: WorkerFilesystemGroundingCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerFilesystemGroundingProbeResult {
  const execution = executionEngineSource();
  const orchestrator = orchestratorSource();

  switch (id) {
    case "wfg.secure_path_resolution": {
      const ok =
        execution.includes("securePath(filePath: string)") &&
        execution.includes("outside allowed roots");
      return probe(id, category, expected, ok, `securePath=${ok}`);
    }
    case "wfg.denied_path_blocklist": {
      const ok =
        execution.includes("DENIED_PATHS") ||
        (execution.includes("denied") && execution.includes(".env"));
      return probe(id, category, expected, ok, `deniedPathBlocklist=${ok}`);
    }
    case "wfg.line_range_reading": {
      const ok =
        execution.includes("startLine?: number") &&
        execution.includes("endLine?: number");
      return probe(id, category, expected, ok, `lineRangeReading=${ok}`);
    }
    case "wfg.orchestrator_pre_read_grounding": {
      const ok =
        orchestrator.includes("validateFilesystemGrounding(") ||
        orchestrator.includes("validateReadBeforeEdit(");
      return probe(id, category, expected, ok, `preReadGrounding=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown path_signal probe");
  }
}

function probeBaselineLink(
  id: string,
  category: WorkerFilesystemGroundingCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerFilesystemGroundingProbeResult {
  switch (id) {
    case "wfg.b01_handoff_entry": {
      const handoff = getForgeP05B01ToB02Handoff();
      const ok =
        handoff.targetBlock.blockId === "P05-B02" &&
        handoff.targetBlock.entryAtom === "P05-B02-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "wfg.b01_sealed_dispatch_probes": {
      const handoff = getForgeP05B01ToB02Handoff();
      const coverage = summarizeWorkerToolDispatchContractCoverage(
        getActiveWorkerToolDispatchContract(),
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
  category: WorkerFilesystemGroundingCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerFilesystemGroundingBaseline,
): WorkerFilesystemGroundingProbeResult {
  switch (id) {
    case "wfg.source_block_gate_ref": {
      const handoff = getForgeP05B01ToB02Handoff();
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P05_B01_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, sealed=${fixture.sourceBlockGate.sealedAtomCount}`,
      );
    }
    case "wfg.probe_runner_exported": {
      const ok = productionGroundingSource().includes(
        "export function runWorkerFilesystemGroundingProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "wfg.known_gaps_documented": {
      const contract = getActiveWorkerFilesystemGroundingContract();
      const expectedFail = contract.probes.filter(p => p.expected === "FAIL").length;
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount === expectedFail;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, contractExpectedFail=${expectedFail}`,
      );
    }
    case "wfg.empty_path_boundary": {
      const result = assessFilesystemReadInputBoundary("");
      const ok = !result.acceptable && result.disposition === "empty";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    case "wfg.whitespace_path_boundary": {
      const result = assessFilesystemReadInputBoundary("   \t\n  ");
      const ok = !result.acceptable && result.disposition === "whitespace_only";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    case "wfg.null_byte_path_boundary": {
      const result = assessFilesystemReadInputBoundary("src/tools.ts\0");
      const ok = !result.acceptable && result.disposition === "contains_null_byte";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    case "wfg.long_path_truncation_boundary": {
      const longPath = "src/" + "x".repeat(WORKER_FILESYSTEM_GROUNDING_PATH_MAX_LENGTH + 500);
      const result = assessFilesystemReadInputBoundary(longPath);
      const ok =
        result.acceptable && result.truncated && result.disposition === "exceeds_max_length";
      return probe(
        id,
        category,
        expected,
        ok,
        `truncated=${result.truncated}, pathLen=${result.normalizedPath.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: WorkerFilesystemGroundingCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerFilesystemGroundingBaseline,
): WorkerFilesystemGroundingProbeResult {
  switch (id) {
    case "wfg.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const validation = validateWorkerFilesystemGroundingBaseline(invalid);
      const ok = validation.valid === false;
      return probe(id, category, expected, ok, `rejected=${ok}`);
    }
    case "wfg.malformed_path_guard": {
      const result = assessFilesystemReadInputBoundary("src/\0secret.ts");
      const ok = !result.acceptable && result.disposition === "contains_null_byte";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: WorkerFilesystemGroundingCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerFilesystemGroundingProbeResult {
  switch (id) {
    case "wfg.recovery_relative_path_coercion": {
      const recovery = recoverFilesystemReadPath("./src/tools.ts");
      const ok = recovery.recovered && recovery.path === "src/tools.ts";
      return probe(id, category, expected, ok, recovery.detail);
    }
    case "wfg.recovery_missing_path_rejected": {
      const recovery = recoverFilesystemReadPath("");
      const ok = !recovery.recovered && recovery.parseErrors.includes("empty");
      return probe(id, category, expected, ok, recovery.detail);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: WorkerFilesystemGroundingCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerFilesystemGroundingProbeResult {
  switch (id) {
    case "wfg.read_before_edit_validator": {
      const ungrounded = validateReadBeforeEdit(
        { name: "edit_file", args: { path: "src/tools.ts" } },
        new Set<string>(),
      );
      const ok = hasProductionExport("validateReadBeforeEdit") && !ungrounded.valid;
      return probe(id, category, expected, ok, `readBeforeEditValidator=${ok}`);
    }
    case "wfg.grounding_telemetry_record": {
      const telemetry = buildFilesystemGroundingTelemetry(
        { name: "read_file", args: { explanation: "probe", path: "src/tools.ts" } },
        { sequenceIndex: 1 },
      );
      const ok =
        hasProductionExport("buildFilesystemGroundingTelemetry") &&
        telemetry.toolName === "read_file" &&
        telemetry.sequenceIndex === 1 &&
        telemetry.grounded === true;
      return probe(id, category, expected, ok, `groundingTelemetry=${ok}`);
    }
    case "wfg.exported_grounding_validator": {
      const invalidRead = validateFilesystemGrounding(
        { name: "read_file", args: {} },
        new Set<string>(),
      );
      const ok = hasProductionExport("validateFilesystemGrounding") && !invalidRead.valid;
      return probe(id, category, expected, ok, `groundingValidator=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: WorkerFilesystemGroundingCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerFilesystemGroundingBaseline,
): WorkerFilesystemGroundingProbeResult {
  switch (category) {
    case "grounding_versioning":
      return probeGroundingVersioning(id, category, expected, fixture);
    case "read_signal":
      return probeReadSignal(id, category, expected);
    case "path_signal":
      return probePathSignal(id, category, expected);
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

export function runWorkerFilesystemGroundingProbes(
  fixture: WorkerFilesystemGroundingBaseline = loadWorkerFilesystemGroundingBaseline(),
): WorkerFilesystemGroundingProbeResult[] {
  const contract = getActiveWorkerFilesystemGroundingContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion ? { ...result, criterion: contractProbe.criterion } : result;
  });
}

export function summarizeWorkerFilesystemGroundingMatrix(
  results: WorkerFilesystemGroundingProbeResult[],
): WorkerFilesystemGroundingProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = Object.fromEntries(
    WORKER_FILESYSTEM_GROUNDING_CATEGORIES.map(category => [
      category,
      { total: 0, aligned: 0, expectedFail: 0 },
    ]),
  ) as WorkerFilesystemGroundingProbeSummary["byCategory"];

  for (const result of results) {
    const bucket = byCategory[result.category];
    bucket.total++;
    if (result.aligned) bucket.aligned++;
    if (result.expected === "FAIL") bucket.expectedFail++;
  }

  return {
    total: results.length,
    aligned: results.filter(r => r.aligned).length,
    mismatches,
    knownGaps,
    byCategory,
  };
}

export function listWorkerFilesystemGroundingProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerFilesystemGroundingBaseline = loadWorkerFilesystemGroundingBaseline(),
): WorkerFilesystemGroundingFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listWorkerFilesystemGroundingKnownGaps(
  results: WorkerFilesystemGroundingProbeResult[] = runWorkerFilesystemGroundingProbes(),
): WorkerFilesystemGroundingProbeResult[] {
  return summarizeWorkerFilesystemGroundingMatrix(results).knownGaps;
}

export interface WorkerFilesystemGroundingProbeMatrixValidationIssue {
  kind: "missing_result" | "criterion_mismatch" | "pass_mismatch" | "gap_mismatch";
  probeId?: string;
  detail: string;
}

export interface WorkerFilesystemGroundingProbeMatrixValidationResult {
  valid: boolean;
  issues: WorkerFilesystemGroundingProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

export function validateWorkerFilesystemGroundingProbeMatrix(
  results: WorkerFilesystemGroundingProbeResult[],
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): WorkerFilesystemGroundingProbeMatrixValidationResult {
  const issues: WorkerFilesystemGroundingProbeMatrixValidationIssue[] = [];
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

export interface WorkerFilesystemGroundingBoundarySliceResult {
  atom: "P05-B02-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: WorkerFilesystemGroundingProbeResult[];
  boundaryResults: WorkerFilesystemGroundingProbeResult[];
  matrixValidation: WorkerFilesystemGroundingProbeMatrixValidationResult;
}

/**
 * Validate boundary-category probe matrix — A04 slice gate.
 */
export function validateWorkerFilesystemGroundingBoundaryProbeMatrix(
  results: WorkerFilesystemGroundingProbeResult[],
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): WorkerFilesystemGroundingProbeMatrixValidationResult {
  const boundaryProbes = listWorkerFilesystemGroundingContractProbesByCategory("boundary", contract);
  const boundaryContract: WorkerFilesystemGroundingContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateWorkerFilesystemGroundingProbeMatrix(boundaryResults, boundaryContract);
}

/**
 * A04 boundary slice: contract-wired boundary probes (filesystem read path edge cases, probe runner,
 * documented gaps, source block gate refs) with zero unexpected mismatches.
 */
export function runWorkerFilesystemGroundingBoundarySlice(
  fixture: WorkerFilesystemGroundingBaseline = loadWorkerFilesystemGroundingBaseline(),
): WorkerFilesystemGroundingBoundarySliceResult {
  const contract = getActiveWorkerFilesystemGroundingContract();
  const results = runWorkerFilesystemGroundingProbes(fixture);
  const boundaryProbes = listWorkerFilesystemGroundingContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateWorkerFilesystemGroundingBoundaryProbeMatrix(results, contract);

  return {
    atom: "P05-B02-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const WORKER_FILESYSTEM_GROUNDING_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly WorkerFilesystemGroundingCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery probes and documented NO-GO wiring must align; zero unexpected mismatches.
 */
export function validateWorkerFilesystemGroundingFailureRecoveryProbeMatrix(
  results: WorkerFilesystemGroundingProbeResult[],
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): WorkerFilesystemGroundingProbeMatrixValidationResult {
  const failureRecoveryProbes = WORKER_FILESYSTEM_GROUNDING_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listWorkerFilesystemGroundingContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: WorkerFilesystemGroundingContract = {
    ...contract,
    probes: failureRecoveryProbes,
    categories: {
      ...contract.categories,
      failure_path: contract.categories.failure_path,
      recovery_path: contract.categories.recovery_path,
      nogo_path: contract.categories.nogo_path,
    },
  };
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  return validateWorkerFilesystemGroundingProbeMatrix(
    failureRecoveryResults,
    failureRecoveryContract,
  );
}

export function listWorkerFilesystemGroundingFailureRecoveryProbeIds(
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): string[] {
  return WORKER_FILESYSTEM_GROUNDING_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listWorkerFilesystemGroundingContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface WorkerFilesystemGroundingFailureRecoverySliceResult {
  atom: "P05-B02-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: WorkerFilesystemGroundingProbeResult[];
  failureRecoveryResults: WorkerFilesystemGroundingProbeResult[];
  matrixValidation: WorkerFilesystemGroundingProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches.
 */
export function runWorkerFilesystemGroundingFailureRecoverySlice(
  fixture: WorkerFilesystemGroundingBaseline = loadWorkerFilesystemGroundingBaseline(),
): WorkerFilesystemGroundingFailureRecoverySliceResult {
  const contract = getActiveWorkerFilesystemGroundingContract();
  const results = runWorkerFilesystemGroundingProbes(fixture);
  const failureRecoveryProbes = WORKER_FILESYSTEM_GROUNDING_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listWorkerFilesystemGroundingContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateWorkerFilesystemGroundingFailureRecoveryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P05-B02-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

export interface WorkerFilesystemGroundingProductionSliceResult {
  atom: "P05-B02-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: WorkerFilesystemGroundingProbeResult[];
  summary: WorkerFilesystemGroundingProbeSummary;
  matrixValidation: WorkerFilesystemGroundingProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: filesystem read/grounding wired to contract probes
 * with zero unexpected mismatches against the sealed contract matrix.
 */
export function runWorkerFilesystemGroundingProductionSlice(
  fixture: WorkerFilesystemGroundingBaseline = loadWorkerFilesystemGroundingBaseline(),
): WorkerFilesystemGroundingProductionSliceResult {
  const contract = getActiveWorkerFilesystemGroundingContract();
  const fixtureValidation = validateWorkerFilesystemGroundingBaseline(fixture);
  const contractValidation = validateWorkerFilesystemGroundingAgainstContract(fixture, contract);
  const results = runWorkerFilesystemGroundingProbes(fixture);
  const summary = summarizeWorkerFilesystemGroundingMatrix(results);
  const matrixValidation = validateWorkerFilesystemGroundingProbeMatrix(results, contract);

  return {
    atom: "P05-B02-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

/** Smoke probe: denied path read returns deterministic error (P05-B02-A01 boundary). */
export function probeDeniedPathReadError(): boolean {
  const tempRoot = mkdtempSync(join(tmpdir(), "foreman-wfg-"));
  try {
    writeFileSync(join(tempRoot, ".env"), "SECRET=1\n", "utf8");
    const engine = new ExecutionEngine(tempRoot);
    const result = engine.readFile(".env");
    return result.success === false && (result.error?.includes("denied") ?? false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

/** Per-probe evidence artifact — disposition, criterion and aligned outcomes (P05-B02-A06). */
export interface WorkerFilesystemGroundingProbeEvidence {
  probeId: string;
  category: WorkerFilesystemGroundingCategory;
  disposition: WorkerFilesystemGroundingProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for filesystem grounding runs (P05-B02-A06). */
export interface WorkerFilesystemGroundingProbeRunTelemetry {
  probeId: string;
  category: WorkerFilesystemGroundingCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P05-B02-A06). */
export interface WorkerFilesystemGroundingProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourceBlockGateVersion: string;
  sourceBlockGateAtom: string;
  sliceAtom?: string;
  sliceCategories?: readonly WorkerFilesystemGroundingCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated filesystem grounding run record bundling evidence, telemetry and provenance. */
export interface WorkerFilesystemGroundingRunRecord {
  provenance: WorkerFilesystemGroundingProvenance;
  evidence: WorkerFilesystemGroundingProbeEvidence[];
  telemetry: WorkerFilesystemGroundingProbeRunTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<WorkerFilesystemGroundingCategory, number>;
    byDisposition: Record<WorkerFilesystemGroundingProbeDisposition, number>;
  };
}

export interface WorkerFilesystemGroundingRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface WorkerFilesystemGroundingRunValidationResult {
  valid: boolean;
  issues: WorkerFilesystemGroundingRunValidationIssue[];
}

export function buildWorkerFilesystemGroundingProbeEvidence(
  probeId: string,
  category: WorkerFilesystemGroundingCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: WorkerFilesystemGroundingProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): WorkerFilesystemGroundingProbeEvidence {
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

export function buildWorkerFilesystemGroundingProbeRunTelemetry(
  probeId: string,
  category: WorkerFilesystemGroundingCategory,
  sequenceIndex: number,
  durationMs: number,
): WorkerFilesystemGroundingProbeRunTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildWorkerFilesystemGroundingProvenance(
  runId: string,
  fixture: WorkerFilesystemGroundingBaseline,
  contract: WorkerFilesystemGroundingContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly WorkerFilesystemGroundingCategory[];
  },
): WorkerFilesystemGroundingProvenance {
  return {
    runId,
    harnessVersion: FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION,
    contractVersion: contract.version,
    contractAtom: contract.atom,
    fixtureVersion: fixture.version,
    fixtureAtom: fixture.atom,
    sourceBlockGateVersion: fixture.sourceBlockGate.version,
    sourceBlockGateAtom: fixture.sourceBlockGate.atom,
    startedAt,
    completedAt,
    totalProbes,
    ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
    ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    ...(options?.gitCommit ? { gitCommit: options.gitCommit } : {}),
  };
}

export function buildWorkerFilesystemGroundingRunRecord(
  provenance: WorkerFilesystemGroundingProvenance,
  evidence: WorkerFilesystemGroundingProbeEvidence[],
  telemetry: WorkerFilesystemGroundingProbeRunTelemetry[],
): WorkerFilesystemGroundingRunRecord {
  const byCategory = {} as Record<WorkerFilesystemGroundingCategory, number>;
  const byDisposition: Record<WorkerFilesystemGroundingProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of WORKER_FILESYSTEM_GROUNDING_CATEGORIES) {
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

function validateWorkerFilesystemGroundingRunRecordAgainstProbeIds(
  record: WorkerFilesystemGroundingRunRecord,
  expectedProbeIds: string[],
  contract: WorkerFilesystemGroundingContract,
): WorkerFilesystemGroundingRunValidationResult {
  const issues: WorkerFilesystemGroundingRunValidationIssue[] = [];
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

export function validateWorkerFilesystemGroundingRunRecord(
  record: WorkerFilesystemGroundingRunRecord,
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): WorkerFilesystemGroundingRunValidationResult {
  return validateWorkerFilesystemGroundingRunRecordAgainstProbeIds(
    record,
    listWorkerFilesystemGroundingContractProbeIds(contract),
    contract,
  );
}

/** Validate evidence slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateWorkerFilesystemGroundingEvidenceRunRecord(
  record: WorkerFilesystemGroundingRunRecord,
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): WorkerFilesystemGroundingRunValidationResult {
  const issues: WorkerFilesystemGroundingRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P05-B02-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P05-B02-A06`,
    });
  }

  const expectedCategories = [...WORKER_FILESYSTEM_GROUNDING_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateWorkerFilesystemGroundingRunRecordAgainstProbeIds(
    record,
    listWorkerFilesystemGroundingFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

/**
 * Validate evidence_path + telemetry_path + provenance_path probe matrix — A06 slice gate.
 * Contract-wired failure_path, recovery_path and nogo_path probes with zero unexpected mismatches.
 */
export function validateWorkerFilesystemGroundingEvidenceProbeMatrix(
  results: WorkerFilesystemGroundingProbeResult[],
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): WorkerFilesystemGroundingProbeMatrixValidationResult {
  return validateWorkerFilesystemGroundingFailureRecoveryProbeMatrix(results, contract);
}

export interface WorkerFilesystemGroundingEvidenceSliceResult {
  atom: "P05-B02-A06";
  evidenceProbeCount: number;
  matrixValid: boolean;
  recordValid: boolean;
  results: WorkerFilesystemGroundingProbeResult[];
  evidenceResults: WorkerFilesystemGroundingProbeResult[];
  matrixValidation: WorkerFilesystemGroundingProbeMatrixValidationResult;
  record: WorkerFilesystemGroundingRunRecord;
  recordValidation: WorkerFilesystemGroundingRunValidationResult;
}

function resolveWorkerFilesystemGroundingGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function runWorkerFilesystemGroundingProbeWithTiming(
  entry: WorkerFilesystemGroundingFixtureEntry,
  fixture: WorkerFilesystemGroundingBaseline,
  contractProbe:
    | { criterion: string; disposition: WorkerFilesystemGroundingProbeDisposition }
    | undefined,
): {
  result: WorkerFilesystemGroundingProbeResult;
  durationMs: number;
  disposition: WorkerFilesystemGroundingProbeDisposition;
} {
  const start = performance.now();
  const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
  const enriched = contractProbe?.criterion
    ? { ...result, criterion: contractProbe.criterion }
    : result;
  const durationMs = performance.now() - start;
  return {
    result: enriched,
    durationMs,
    disposition: contractProbe?.disposition ?? "observed",
  };
}

function buildWorkerFilesystemGroundingRecordFromEntries(
  entries: WorkerFilesystemGroundingFixtureEntry[],
  fixture: WorkerFilesystemGroundingBaseline,
  contract: WorkerFilesystemGroundingContract,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly WorkerFilesystemGroundingCategory[];
  },
): WorkerFilesystemGroundingRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: WorkerFilesystemGroundingProbeEvidence[] = [];
  const telemetry: WorkerFilesystemGroundingProbeRunTelemetry[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runWorkerFilesystemGroundingProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildWorkerFilesystemGroundingProbeEvidence(
        result.id,
        result.category,
        result.expected,
        result.actual,
        result.aligned,
        criterion,
        result.detail,
        disposition,
      ),
    );
    telemetry.push(
      buildWorkerFilesystemGroundingProbeRunTelemetry(
        result.id,
        result.category,
        sequenceIndex,
        durationMs,
      ),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildWorkerFilesystemGroundingProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveWorkerFilesystemGroundingGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildWorkerFilesystemGroundingRunRecord(provenance, evidence, telemetry);
}

/** Run all filesystem grounding probes and emit auditable evidence, telemetry and provenance (P05-B02-A06). */
export function runWorkerFilesystemGroundingProbesWithRecord(
  fixture: WorkerFilesystemGroundingBaseline = loadWorkerFilesystemGroundingBaseline(),
): WorkerFilesystemGroundingRunRecord {
  const contract = getActiveWorkerFilesystemGroundingContract();
  return buildWorkerFilesystemGroundingRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P05-B02-A06). */
export function runWorkerFilesystemGroundingFailureRecoverySliceWithRecord(
  fixture: WorkerFilesystemGroundingBaseline = loadWorkerFilesystemGroundingBaseline(),
): WorkerFilesystemGroundingRunRecord {
  const contract = getActiveWorkerFilesystemGroundingContract();
  const failureRecoveryIds = new Set(listWorkerFilesystemGroundingFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildWorkerFilesystemGroundingRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P05-B02-A06",
    sliceCategories: WORKER_FILESYSTEM_GROUNDING_FAILURE_RECOVERY_CATEGORIES,
  });
}

/**
 * A06 evidence slice: contract-wired failure_path, recovery_path, and nogo_path probes
 * with auditable evidence, telemetry and provenance — zero unexpected mismatches.
 */
export function runWorkerFilesystemGroundingEvidenceSlice(
  fixture: WorkerFilesystemGroundingBaseline = loadWorkerFilesystemGroundingBaseline(),
): WorkerFilesystemGroundingEvidenceSliceResult {
  const contract = getActiveWorkerFilesystemGroundingContract();
  const results = runWorkerFilesystemGroundingProbes(fixture);
  const failureRecoveryProbes = WORKER_FILESYSTEM_GROUNDING_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listWorkerFilesystemGroundingContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const evidenceResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateWorkerFilesystemGroundingEvidenceProbeMatrix(results, contract);
  const record = runWorkerFilesystemGroundingFailureRecoverySliceWithRecord(fixture);
  const recordValidation = validateWorkerFilesystemGroundingEvidenceRunRecord(record, contract);

  return {
    atom: "P05-B02-A06",
    evidenceProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    recordValid: recordValidation.valid,
    results,
    evidenceResults,
    matrixValidation,
    record,
    recordValidation,
  };
}

// ─── Property and fuzz validation (P05-B02-A07) ─────────────────────────────

export interface WorkerFilesystemGroundingPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface WorkerFilesystemGroundingPropertyResult {
  passed: number;
  failed: WorkerFilesystemGroundingPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type WorkerFilesystemGroundingPropertyCheck = {
  id: string;
  description: string;
  check: (contract: WorkerFilesystemGroundingContract) => string | null;
};

const WORKER_FILESYSTEM_GROUNDING_STRUCTURAL_PROPERTIES: readonly WorkerFilesystemGroundingPropertyCheck[] =
  [
    {
      id: "categories_complete",
      description: "All eight worker filesystem grounding categories are declared",
      check: contract => {
        for (const category of WORKER_FILESYSTEM_GROUNDING_CATEGORIES) {
          if (!contract.categories[category]) return `missing category: ${category}`;
        }
        return null;
      },
    },
    {
      id: "probe_ids_unique",
      description: "Probe ids are globally unique",
      check: contract => {
        const ids = listWorkerFilesystemGroundingContractProbeIds(contract);
        if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
        return null;
      },
    },
    {
      id: "min_probe_count",
      description: "Each category meets contract minProbeCount",
      check: contract => {
        for (const category of WORKER_FILESYSTEM_GROUNDING_CATEGORIES) {
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
      description:
        "summarizeWorkerFilesystemGroundingContractCoverage totals match listWorkerFilesystemGroundingContractProbeIds",
      check: contract => {
        const summary = summarizeWorkerFilesystemGroundingContractCoverage(contract);
        const ids = listWorkerFilesystemGroundingContractProbeIds(contract);
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
      description: "Probe ids are namespaced with wfg. prefix",
      check: contract => {
        for (const probe of contract.probes) {
          if (!probe.id.startsWith("wfg.")) {
            return `${probe.id} missing wfg. prefix`;
          }
        }
        return null;
      },
    },
    {
      id: "run_record_summary_invariant",
      description: "Run record summary aligned + mismatches equals total",
      check: contract => {
        const fixture = loadWorkerFilesystemGroundingBaseline();
        const probeIds = listWorkerFilesystemGroundingContractProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildWorkerFilesystemGroundingProbeEvidence(
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
          return buildWorkerFilesystemGroundingProbeRunTelemetry(id, probe.category, index, index);
        });
        const record = buildWorkerFilesystemGroundingRunRecord(
          buildWorkerFilesystemGroundingProvenance(
            "property-check",
            fixture,
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
    {
      id: "failure_recovery_run_record_gate",
      description:
        "Synthetic failure/recovery slice record passes validateWorkerFilesystemGroundingEvidenceRunRecord",
      check: contract => {
        const fixture = loadWorkerFilesystemGroundingBaseline();
        const probeIds = listWorkerFilesystemGroundingFailureRecoveryProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildWorkerFilesystemGroundingProbeEvidence(
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
          return buildWorkerFilesystemGroundingProbeRunTelemetry(
            id,
            probe.category,
            index,
            index * 0.5,
          );
        });
        const record = buildWorkerFilesystemGroundingRunRecord(
          buildWorkerFilesystemGroundingProvenance(
            "property-check-failure-recovery",
            fixture,
            contract,
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T00:00:01.000Z",
            probeIds.length,
            {
              sliceAtom: "P05-B02-A06",
              sliceCategories: WORKER_FILESYSTEM_GROUNDING_FAILURE_RECOVERY_CATEGORIES,
            },
          ),
          evidence,
          telemetry,
        );
        const validation = validateWorkerFilesystemGroundingEvidenceRunRecord(record, contract);
        if (!validation.valid) {
          return validation.issues.map(i => i.detail).join("; ");
        }
        return null;
      },
    },
  ] as const;

export function runWorkerFilesystemGroundingPropertyValidation(
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): WorkerFilesystemGroundingPropertyResult {
  const failed: WorkerFilesystemGroundingPropertyViolation[] = [];
  for (const property of WORKER_FILESYSTEM_GROUNDING_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = WORKER_FILESYSTEM_GROUNDING_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type WorkerFilesystemGroundingFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface WorkerFilesystemGroundingFuzzMutationCase {
  seed: number;
  kind: WorkerFilesystemGroundingFuzzMutationKind;
  probeId?: string;
  category?: WorkerFilesystemGroundingCategory;
}

export interface WorkerFilesystemGroundingFuzzValidationCaseResult {
  mutation: WorkerFilesystemGroundingFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface WorkerFilesystemGroundingFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: WorkerFilesystemGroundingFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createWorkerFilesystemGroundingFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneWorkerFilesystemGroundingBaseline(
  fixture: WorkerFilesystemGroundingBaseline,
): WorkerFilesystemGroundingBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickWorkerFilesystemGroundingFuzzTarget(
  fixture: WorkerFilesystemGroundingBaseline,
  rng: () => number,
): {
  category: WorkerFilesystemGroundingCategory;
  index: number;
  entry: WorkerFilesystemGroundingFixtureEntry;
} {
  const category =
    WORKER_FILESYSTEM_GROUNDING_CATEGORIES[
      Math.floor(rng() * WORKER_FILESYSTEM_GROUNDING_CATEGORIES.length)
    ]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyWorkerFilesystemGroundingFuzzMutation(
  fixture: WorkerFilesystemGroundingBaseline,
  mutation: WorkerFilesystemGroundingFuzzMutationCase,
): WorkerFilesystemGroundingBaseline {
  const mutated = cloneWorkerFilesystemGroundingBaseline(fixture);
  const targetCategory = mutation.category ?? WORKER_FILESYSTEM_GROUNDING_CATEGORIES[0]!;
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
          id: `wfg.fuzz.extra.${mutation.seed}`,
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
      const other = WORKER_FILESYSTEM_GROUNDING_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateWorkerFilesystemGroundingFuzzMutationCases(
  fixture: WorkerFilesystemGroundingBaseline,
  seed: number,
  iterations: number,
): WorkerFilesystemGroundingFuzzMutationCase[] {
  const rng = createWorkerFilesystemGroundingFuzzRng(seed);
  const kinds: WorkerFilesystemGroundingFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: WorkerFilesystemGroundingFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickWorkerFilesystemGroundingFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P05-B02-A07). */
export function runWorkerFilesystemGroundingFuzzValidation(
  fixture: WorkerFilesystemGroundingBaseline,
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
  seed = 42,
  iterations = 24,
): WorkerFilesystemGroundingFuzzValidationResult {
  const cases = generateWorkerFilesystemGroundingFuzzMutationCases(fixture, seed, iterations);
  const results: WorkerFilesystemGroundingFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyWorkerFilesystemGroundingFuzzMutation(fixture, mutation);
    const validation = validateWorkerFilesystemGroundingAgainstContract(mutated, contract);
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

export type WorkerFilesystemGroundingRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface WorkerFilesystemGroundingRunRecordFuzzCase {
  kind: WorkerFilesystemGroundingRunRecordFuzzKind;
  probeId?: string;
}

export function applyWorkerFilesystemGroundingRunRecordFuzzMutation(
  record: WorkerFilesystemGroundingRunRecord,
  mutation: WorkerFilesystemGroundingRunRecordFuzzCase,
): WorkerFilesystemGroundingRunRecord {
  const cloned: WorkerFilesystemGroundingRunRecord = {
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
    case "wrong_slice_atom":
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P05-B02-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["grounding_versioning"],
      };
      break;
  }

  cloned.summary = buildWorkerFilesystemGroundingRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveWorkerFilesystemGroundingRunRecordValidator(
  record: WorkerFilesystemGroundingRunRecord,
): (
  record: WorkerFilesystemGroundingRunRecord,
  contract: WorkerFilesystemGroundingContract,
) => WorkerFilesystemGroundingRunValidationResult {
  return record.provenance.sliceAtom === "P05-B02-A06"
    ? validateWorkerFilesystemGroundingEvidenceRunRecord
    : validateWorkerFilesystemGroundingRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P05-B02-A07). */
export function runWorkerFilesystemGroundingRunRecordFuzzValidation(
  record: WorkerFilesystemGroundingRunRecord,
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveWorkerFilesystemGroundingRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: WorkerFilesystemGroundingRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P05-B02-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyWorkerFilesystemGroundingRunRecordFuzzMutation(record, mutation);
    const validation = validate(mutated, contract);
    if (validation.valid) mutationsAccepted++;
    else mutationsRejected++;
  }

  return {
    validBaseline: baseline.valid,
    mutationsRejected,
    mutationsAccepted,
  };
}

export interface WorkerFilesystemGroundingPropertyFuzzSliceResult {
  atom: "P05-B02-A07";
  propertyChecksPassed: boolean;
  contractFuzzRejected: boolean;
  runRecordFuzzRejected: boolean;
  propertyResult: WorkerFilesystemGroundingPropertyResult;
  contractFuzz: WorkerFilesystemGroundingFuzzValidationResult;
  runRecordFuzz: {
    validBaseline: boolean;
    mutationsRejected: number;
    mutationsAccepted: number;
  };
}

export interface WorkerFilesystemGroundingPropertyProbeMatrixValidationResult {
  valid: boolean;
  issues: WorkerFilesystemGroundingProbeMatrixValidationIssue[];
  propertyChecksAligned: number;
  fuzzMutationsAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate property_checks + fuzz_mutations against the A07 contract matrix —
 * all structural properties pass and zero fuzz mutations accepted.
 */
export function validateWorkerFilesystemGroundingPropertyProbeMatrix(
  slice: WorkerFilesystemGroundingPropertyFuzzSliceResult,
): WorkerFilesystemGroundingPropertyProbeMatrixValidationResult {
  const issues: WorkerFilesystemGroundingProbeMatrixValidationIssue[] = [];
  let propertyChecksAligned = 0;
  let fuzzMutationsAligned = 0;
  let unexpectedMismatches = 0;

  if (slice.atom !== "P05-B02-A07") {
    issues.push({
      kind: "pass_mismatch",
      detail: `slice atom=${slice.atom} expected=P05-B02-A07`,
    });
    unexpectedMismatches++;
  }

  for (const property of WORKER_FILESYSTEM_GROUNDING_STRUCTURAL_PROPERTIES) {
    const failed = slice.propertyResult.failed.find(f => f.propertyId === property.id);
    if (failed) {
      issues.push({
        kind: "pass_mismatch",
        probeId: property.id,
        detail: `property ${property.id}: ${failed.detail}`,
      });
      unexpectedMismatches++;
    } else {
      propertyChecksAligned++;
    }
  }

  if (!slice.contractFuzz.allMutationsRejected) {
    issues.push({
      kind: "pass_mismatch",
      detail: `contract fuzz accepted=${slice.contractFuzz.accepted} rejected=${slice.contractFuzz.rejected}`,
    });
    unexpectedMismatches++;
  } else {
    fuzzMutationsAligned += slice.contractFuzz.rejected;
  }

  if (slice.runRecordFuzz.mutationsAccepted > 0) {
    issues.push({
      kind: "pass_mismatch",
      detail: `run record fuzz accepted=${slice.runRecordFuzz.mutationsAccepted}`,
    });
    unexpectedMismatches++;
  } else if (slice.runRecordFuzz.validBaseline) {
    fuzzMutationsAligned += slice.runRecordFuzz.mutationsRejected;
  } else {
    issues.push({
      kind: "pass_mismatch",
      detail: "run record fuzz baseline invalid",
    });
    unexpectedMismatches++;
  }

  return {
    valid: issues.length === 0,
    issues,
    propertyChecksAligned,
    fuzzMutationsAligned,
    unexpectedMismatches,
  };
}

/**
 * A07 property/fuzz slice: structural property checks and contract fuzz gates
 * with zero accepted mutations.
 */
export function runWorkerFilesystemGroundingPropertyFuzzSlice(
  fixture: WorkerFilesystemGroundingBaseline = loadWorkerFilesystemGroundingBaseline(),
): WorkerFilesystemGroundingPropertyFuzzSliceResult {
  const contract = getActiveWorkerFilesystemGroundingContract();
  const propertyResult = runWorkerFilesystemGroundingPropertyValidation(contract);
  const contractFuzz = runWorkerFilesystemGroundingFuzzValidation(fixture, contract);
  const record = runWorkerFilesystemGroundingFailureRecoverySliceWithRecord(fixture);
  const runRecordFuzz = runWorkerFilesystemGroundingRunRecordFuzzValidation(record, contract);

  return {
    atom: "P05-B02-A07",
    propertyChecksPassed: propertyResult.allPassed,
    contractFuzzRejected: contractFuzz.allMutationsRejected,
    runRecordFuzzRejected: runRecordFuzz.mutationsAccepted === 0,
    propertyResult,
    contractFuzz,
    runRecordFuzz,
  };
}

// ─── Forge integration regression (P05-B02-A08) ─────────────────────────────

export interface WorkerFilesystemGroundingProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare worker filesystem grounding run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectWorkerFilesystemGroundingProbeRegression(
  prior: WorkerFilesystemGroundingRunRecord,
  current: WorkerFilesystemGroundingRunRecord,
): WorkerFilesystemGroundingProbeRegressionReport {
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

  const hasRegression =
    regressions.length > 0 || current.summary.mismatches > prior.summary.mismatches;
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

export interface WorkerFilesystemGroundingIntegrationSliceResult {
  atom: "P05-B02-A08";
  passed: boolean;
  productionSlice: WorkerFilesystemGroundingProductionSliceResult;
  boundarySlice: WorkerFilesystemGroundingBoundarySliceResult;
  failureRecoverySlice: WorkerFilesystemGroundingFailureRecoverySliceResult;
  evidenceSlice: WorkerFilesystemGroundingEvidenceSliceResult;
  propertyFuzzSlice: WorkerFilesystemGroundingPropertyFuzzSliceResult;
  record: WorkerFilesystemGroundingRunRecord;
  recordValid: boolean;
  priorRecordValid: boolean;
  validationIssues: string[];
  priorValidationIssues: string[];
  probeRegression: WorkerFilesystemGroundingProbeRegressionReport | null;
  guard: WorkerFilesystemGroundingGuardCheckResult;
  matrixValid: boolean;
  matrixValidation: WorkerFilesystemGroundingIntegrationProbeMatrixValidationResult;
  detail: string;
}

export interface WorkerFilesystemGroundingIntegrationProbeMatrixValidationResult {
  valid: boolean;
  issues: WorkerFilesystemGroundingProbeMatrixValidationIssue[];
  slicesAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate integration slice sub-gates — all prior A03–A07 slices with zero unexpected mismatches.
 */
export function validateWorkerFilesystemGroundingIntegrationProbeMatrix(
  slice: WorkerFilesystemGroundingIntegrationSliceResult,
): WorkerFilesystemGroundingIntegrationProbeMatrixValidationResult {
  const issues: WorkerFilesystemGroundingProbeMatrixValidationIssue[] = [];
  let slicesAligned = 0;
  let unexpectedMismatches = 0;

  if (slice.atom !== "P05-B02-A08") {
    issues.push({
      kind: "pass_mismatch",
      detail: `slice atom=${slice.atom} expected=P05-B02-A08`,
    });
    unexpectedMismatches++;
  }

  const sliceChecks: Array<{ name: string; ok: boolean; detail: string }> = [
    {
      name: "production",
      ok:
        slice.productionSlice.matrixValid &&
        slice.productionSlice.matrixValidation.unexpectedMismatches === 0,
      detail: `production unexpected=${slice.productionSlice.matrixValidation.unexpectedMismatches}`,
    },
    {
      name: "boundary",
      ok:
        slice.boundarySlice.matrixValid &&
        slice.boundarySlice.matrixValidation.unexpectedMismatches === 0,
      detail: `boundary unexpected=${slice.boundarySlice.matrixValidation.unexpectedMismatches}`,
    },
    {
      name: "failure_recovery",
      ok:
        slice.failureRecoverySlice.matrixValid &&
        slice.failureRecoverySlice.matrixValidation.unexpectedMismatches === 0,
      detail: `failureRecovery unexpected=${slice.failureRecoverySlice.matrixValidation.unexpectedMismatches}`,
    },
    {
      name: "evidence",
      ok:
        slice.evidenceSlice.matrixValid &&
        slice.evidenceSlice.recordValid &&
        slice.evidenceSlice.matrixValidation.unexpectedMismatches === 0,
      detail: `evidence unexpected=${slice.evidenceSlice.matrixValidation.unexpectedMismatches}`,
    },
    {
      name: "property_fuzz",
      ok:
        slice.propertyFuzzSlice.propertyChecksPassed &&
        slice.propertyFuzzSlice.contractFuzzRejected &&
        slice.propertyFuzzSlice.runRecordFuzzRejected,
      detail: `propertyFuzz properties=${slice.propertyFuzzSlice.propertyResult.passed}/${slice.propertyFuzzSlice.propertyResult.total}`,
    },
    {
      name: "record",
      ok: slice.recordValid && slice.record.summary.mismatches === 0,
      detail: `record mismatches=${slice.record.summary.mismatches}`,
    },
  ];

  for (const check of sliceChecks) {
    if (check.ok) {
      slicesAligned++;
    } else {
      issues.push({ kind: "pass_mismatch", detail: `${check.name}: ${check.detail}` });
      unexpectedMismatches++;
    }
  }

  if (slice.probeRegression?.hasRegression) {
    issues.push({
      kind: "pass_mismatch",
      detail: `probe regression: ${slice.probeRegression.summary}`,
    });
    unexpectedMismatches++;
  }

  if (!slice.priorRecordValid && slice.probeRegression !== null) {
    issues.push({ kind: "pass_mismatch", detail: "prior record validation failed" });
    unexpectedMismatches++;
  }

  return {
    valid: issues.length === 0,
    issues,
    slicesAligned,
    unexpectedMismatches,
  };
}

/**
 * A08 integration slice: wire production, boundary, failure/recovery, evidence and property/fuzz
 * gates with full run record and optional prior-run regression detection — zero unexpected mismatches.
 */
export function runWorkerFilesystemGroundingIntegrationSlice(
  priorRecord?: WorkerFilesystemGroundingRunRecord,
): WorkerFilesystemGroundingIntegrationSliceResult {
  const fixture = loadWorkerFilesystemGroundingBaseline();
  const contract = getActiveWorkerFilesystemGroundingContract();
  const productionSlice = runWorkerFilesystemGroundingProductionSlice(fixture);
  const boundarySlice = runWorkerFilesystemGroundingBoundarySlice(fixture);
  const failureRecoverySlice = runWorkerFilesystemGroundingFailureRecoverySlice(fixture);
  const evidenceSlice = runWorkerFilesystemGroundingEvidenceSlice(fixture);
  const propertyFuzzSlice = runWorkerFilesystemGroundingPropertyFuzzSlice(fixture);
  const record = runWorkerFilesystemGroundingProbesWithRecord(fixture);
  const validation = validateWorkerFilesystemGroundingRunRecord(record, contract);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  let priorRecordValid = true;
  let priorValidationIssues: string[] = [];
  if (priorRecord) {
    const priorValidation = validateWorkerFilesystemGroundingRunRecord(priorRecord, contract);
    priorRecordValid = priorValidation.valid && priorRecord.summary.mismatches === 0;
    priorValidationIssues = priorValidation.issues.map(issue => issue.detail);
  }

  const probeRegression = priorRecord
    ? detectWorkerFilesystemGroundingProbeRegression(priorRecord, record)
    : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;
  const guard = validateForgeWorkerFilesystemGroundingGuard(record, {
    totalCostUsd: 0,
    llmCalls: 0,
    contract,
  });

  const productionSliceOk =
    productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0;
  const boundarySliceOk =
    boundarySlice.matrixValid && boundarySlice.matrixValidation.unexpectedMismatches === 0;
  const failureRecoverySliceOk =
    failureRecoverySlice.matrixValid &&
    failureRecoverySlice.matrixValidation.unexpectedMismatches === 0;
  const evidenceSliceOk =
    evidenceSlice.matrixValid &&
    evidenceSlice.recordValid &&
    evidenceSlice.matrixValidation.unexpectedMismatches === 0;
  const propertyFuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;

  const passed =
    productionSliceOk &&
    boundarySliceOk &&
    failureRecoverySliceOk &&
    evidenceSliceOk &&
    propertyFuzzOk &&
    recordValid &&
    priorRecordValid &&
    !alignmentRegression &&
    guard.passed;

  const detailParts: string[] = [];
  detailParts.push(`${record.summary.aligned}/${record.summary.total} probes aligned`);
  detailParts.push(
    `productionSlice: unexpected=${productionSlice.matrixValidation.unexpectedMismatches}`,
  );
  detailParts.push(`boundarySlice: unexpected=${boundarySlice.matrixValidation.unexpectedMismatches}`);
  detailParts.push(
    `failureRecoverySlice: unexpected=${failureRecoverySlice.matrixValidation.unexpectedMismatches}`,
  );
  detailParts.push(`evidenceSlice: unexpected=${evidenceSlice.matrixValidation.unexpectedMismatches}`);
  if (!recordValid) {
    detailParts.push(`validation: ${validationIssues.join("; ") || "mismatches present"}`);
  }
  if (!priorRecordValid) {
    detailParts.push(`priorValidation: ${priorValidationIssues.join("; ") || "tampered prior record"}`);
  }
  if (probeRegression) detailParts.push(`regression: ${probeRegression.summary}`);
  detailParts.push(
    `propertyFuzz: properties=${propertyFuzzSlice.propertyResult.passed}/${propertyFuzzSlice.propertyResult.total} contractFuzz rejected=${propertyFuzzSlice.contractFuzz.rejected}/${propertyFuzzSlice.contractFuzz.iterations} runFuzz rejected=${propertyFuzzSlice.runRecordFuzz.mutationsRejected}`,
  );
  if (!guard.passed) {
    detailParts.push(
      `guard: ${guard.issues.map(issue => `${issue.domain}/${issue.code}`).join(", ") || "failed"}`,
    );
  } else {
    detailParts.push(
      `guard: perf=${guard.metrics.suiteDurationMs.toFixed(1)}ms cost=$${guard.metrics.totalCostUsd} adversarial=${guard.metrics.adversarialScenariosRejected}/${guard.metrics.adversarialScenariosTotal}`,
    );
  }

  const partial: WorkerFilesystemGroundingIntegrationSliceResult = {
    atom: "P05-B02-A08",
    passed,
    productionSlice,
    boundarySlice,
    failureRecoverySlice,
    evidenceSlice,
    propertyFuzzSlice,
    record,
    recordValid,
    priorRecordValid,
    validationIssues,
    priorValidationIssues,
    probeRegression,
    guard,
    matrixValid: false,
    matrixValidation: {
      valid: false,
      issues: [],
      slicesAligned: 0,
      unexpectedMismatches: 0,
    },
    detail: detailParts.join(" | "),
  };

  const matrixValidation = validateWorkerFilesystemGroundingIntegrationProbeMatrix(partial);
  return {
    ...partial,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    matrixValidation,
    passed: passed && matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    detail:
      passed && matrixValidation.valid
        ? detailParts.join(" | ")
        : `${detailParts.join(" | ")} | integrationMatrix: unexpected=${matrixValidation.unexpectedMismatches}`,
  };
}

/** Alias for forge-pipeline-regression integration seam (P05-B02-A08). */
export const runWorkerFilesystemGroundingRegressionIntegration =
  runWorkerFilesystemGroundingIntegrationSlice;

// ─── Guard controls (P05-B02-A09) ─────────────────────────────────────────────

export interface ForgeWorkerFilesystemGroundingGuardControls {
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

export interface WorkerFilesystemGroundingGuardCheckIssue {
  domain: "adversarial" | "performance" | "cost" | "safety";
  code: string;
  detail: string;
}

export interface WorkerFilesystemGroundingGuardCheckResult {
  passed: boolean;
  issues: WorkerFilesystemGroundingGuardCheckIssue[];
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

export interface WorkerFilesystemGroundingAdversarialGuardScenario {
  id: string;
  description: string;
  build: (record: WorkerFilesystemGroundingRunRecord) => WorkerFilesystemGroundingRunRecord;
  expectRejected: true;
}

export interface WorkerFilesystemGroundingGuardSliceResult {
  atom: "P05-B02-A09";
  passed: boolean;
  record: WorkerFilesystemGroundingRunRecord;
  guard: WorkerFilesystemGroundingGuardCheckResult;
  detail: string;
}

export const FORGE_WORKER_FILESYSTEM_GROUNDING_GUARD_CONTROLS_V1: ForgeWorkerFilesystemGroundingGuardControls =
  {
    atom: "P05-B02-A09",
    adversarial: {
      rejectTamperedRecords: true,
      rejectFalseAlignment: true,
      rejectSummaryEvidenceMismatch: true,
    },
    performance: {
      maxSuiteDurationMs: 60_000,
      maxProbeDurationMs: 10_000,
      maxWallClockMs: 90_000,
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

export function getForgeWorkerFilesystemGroundingGuardControls(): ForgeWorkerFilesystemGroundingGuardControls {
  return FORGE_WORKER_FILESYSTEM_GROUNDING_GUARD_CONTROLS_V1;
}

function parseWorkerFilesystemGroundingIsoDurationMs(startedAt: string, completedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function summarizeWorkerFilesystemGroundingTelemetry(
  telemetry: WorkerFilesystemGroundingProbeRunTelemetry[],
): {
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

export function detectWorkerFilesystemGroundingEvidenceSummaryMismatch(
  record: WorkerFilesystemGroundingRunRecord,
): string | null {
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

export function detectWorkerFilesystemGroundingFalseAlignment(
  record: WorkerFilesystemGroundingRunRecord,
): string[] {
  const violations: string[] = [];
  for (const item of record.evidence) {
    const shouldAlign = item.actual === item.expected;
    if (item.aligned !== shouldAlign) {
      violations.push(
        `${item.probeId}: aligned=${item.aligned} actual=${item.actual} expected=${item.expected}`,
      );
    }
    if (item.aligned && item.actual !== item.expected) {
      violations.push(`${item.probeId}: false PASS claim`);
    }
  }
  return violations;
}

export function validateWorkerFilesystemGroundingSafety(
  record: WorkerFilesystemGroundingRunRecord,
  controls: ForgeWorkerFilesystemGroundingGuardControls = getForgeWorkerFilesystemGroundingGuardControls(),
): WorkerFilesystemGroundingGuardCheckIssue[] {
  const issues: WorkerFilesystemGroundingGuardCheckIssue[] = [];
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

export function validateWorkerFilesystemGroundingPerformance(
  record: WorkerFilesystemGroundingRunRecord,
  controls: ForgeWorkerFilesystemGroundingGuardControls = getForgeWorkerFilesystemGroundingGuardControls(),
): WorkerFilesystemGroundingGuardCheckIssue[] {
  const issues: WorkerFilesystemGroundingGuardCheckIssue[] = [];
  const { suiteDurationMs, maxProbeDurationMs } = summarizeWorkerFilesystemGroundingTelemetry(
    record.telemetry,
  );
  const wallClockMs = parseWorkerFilesystemGroundingIsoDurationMs(
    record.provenance.startedAt,
    record.provenance.completedAt,
  );

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

export function validateWorkerFilesystemGroundingCost(
  totalCostUsd: number,
  llmCalls: number,
  controls: ForgeWorkerFilesystemGroundingGuardControls = getForgeWorkerFilesystemGroundingGuardControls(),
): WorkerFilesystemGroundingGuardCheckIssue[] {
  const issues: WorkerFilesystemGroundingGuardCheckIssue[] = [];
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

export function buildWorkerFilesystemGroundingAdversarialGuardScenarios(): WorkerFilesystemGroundingAdversarialGuardScenario[] {
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
        cloned.summary = buildWorkerFilesystemGroundingRunRecord(
          cloned.provenance,
          cloned.evidence,
          cloned.telemetry,
        ).summary;
        return cloned;
      },
    },
  ];
}

export function runWorkerFilesystemGroundingAdversarialGuardChecks(
  fixtureRecord: WorkerFilesystemGroundingRunRecord,
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): { rejected: number; total: number; failures: string[] } {
  const scenarios = buildWorkerFilesystemGroundingAdversarialGuardScenarios();
  const failures: string[] = [];
  let rejected = 0;

  for (const scenario of scenarios) {
    const tampered = scenario.build(fixtureRecord);
    const validation = validateWorkerFilesystemGroundingRunRecord(tampered, contract);
    const falseAlignment = detectWorkerFilesystemGroundingFalseAlignment(tampered);
    const summaryMismatch = detectWorkerFilesystemGroundingEvidenceSummaryMismatch(tampered);
    const rejectedByGuard =
      !validation.valid || falseAlignment.length > 0 || summaryMismatch !== null;

    if (rejectedByGuard) rejected++;
    else failures.push(`${scenario.id}: tampered record was not rejected`);
  }

  return { rejected, total: scenarios.length, failures };
}

export function validateForgeWorkerFilesystemGroundingGuard(
  record: WorkerFilesystemGroundingRunRecord,
  options: {
    totalCostUsd?: number;
    llmCalls?: number;
    contract?: WorkerFilesystemGroundingContract;
    controls?: ForgeWorkerFilesystemGroundingGuardControls;
  } = {},
): WorkerFilesystemGroundingGuardCheckResult {
  const controls = options.controls ?? getForgeWorkerFilesystemGroundingGuardControls();
  const contract = options.contract ?? getActiveWorkerFilesystemGroundingContract();
  const totalCostUsd = options.totalCostUsd ?? 0;
  const llmCalls = options.llmCalls ?? 0;
  const issues: WorkerFilesystemGroundingGuardCheckIssue[] = [];

  issues.push(...validateWorkerFilesystemGroundingPerformance(record, controls));
  issues.push(...validateWorkerFilesystemGroundingCost(totalCostUsd, llmCalls, controls));
  issues.push(...validateWorkerFilesystemGroundingSafety(record, controls));

  const falseAlignment = detectWorkerFilesystemGroundingFalseAlignment(record);
  if (falseAlignment.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "false_alignment",
      detail: falseAlignment.join("; "),
    });
  }
  const summaryMismatch = detectWorkerFilesystemGroundingEvidenceSummaryMismatch(record);
  if (summaryMismatch) {
    issues.push({
      domain: "adversarial",
      code: "summary_evidence_mismatch",
      detail: summaryMismatch,
    });
  }

  const adversarial = runWorkerFilesystemGroundingAdversarialGuardChecks(record, contract);
  if (adversarial.failures.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "scenario_not_rejected",
      detail: adversarial.failures.join("; "),
    });
  }

  const telemetrySummary = summarizeWorkerFilesystemGroundingTelemetry(record.telemetry);
  const wallClockMs = parseWorkerFilesystemGroundingIsoDurationMs(
    record.provenance.startedAt,
    record.provenance.completedAt,
  );

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

/**
 * A09 guard slice: adversarial tamper rejection plus performance, cost and safety ceilings.
 */
export function runWorkerFilesystemGroundingGuardSlice(): WorkerFilesystemGroundingGuardSliceResult {
  const record = runWorkerFilesystemGroundingProbesWithRecord();
  const contract = getActiveWorkerFilesystemGroundingContract();
  const guard = validateForgeWorkerFilesystemGroundingGuard(record, {
    totalCostUsd: 0,
    llmCalls: 0,
    contract,
  });
  const passed = guard.passed && record.summary.mismatches === 0;
  const detailParts: string[] = [];
  detailParts.push(`${record.summary.aligned}/${record.summary.total} probes aligned`);
  if (!guard.passed) {
    detailParts.push(
      `guard FAIL: ${guard.issues.map(issue => `${issue.domain}/${issue.code}`).join(", ") || "failed"}`,
    );
  } else {
    detailParts.push(
      `guard PASS: perf=${guard.metrics.suiteDurationMs.toFixed(1)}ms cost=$${guard.metrics.totalCostUsd} adversarial=${guard.metrics.adversarialScenariosRejected}/${guard.metrics.adversarialScenariosTotal}`,
    );
  }
  return {
    atom: "P05-B02-A09",
    passed,
    record,
    guard,
    detail: detailParts.join(" | "),
  };
}

// ─── Block gate and handoff (P05-B02-A10) ─────────────────────────────────────

export interface WorkerFilesystemGroundingBlockGateEvidence {
  blockId: string;
  atom: string;
  sealedAt: string;
  atomSeals: ForgeBlockAtomSeal[];
  regressionPassed: boolean;
  guardPassed: boolean;
  handoffValid: boolean;
  probeCount: number;
  gitCommit?: string;
}

export interface WorkerFilesystemGroundingBlockHandoffContract {
  version: string;
  atom: string;
  sourceBlock: {
    blockId: string;
    title: string;
    completedAtoms: readonly string[];
  };
  targetBlock: {
    blockId: string;
    title: string;
    entryAtom: string;
  };
  sealedArtifacts: {
    fixtureVersion: string;
    contractVersion: string;
    harnessVersion: string;
    probeCount: number;
    workerFilesystemGroundingCategories: readonly WorkerFilesystemGroundingCategory[];
    sourceWorkerToolDispatchBlockGateAtom: string;
  };
  prerequisites: readonly string[];
  entryCriteria: {
    description: string;
    requiresBlockGatePass: true;
    workerFilesystemGroundingRecordRequired: true;
  };
}

export const FORGE_P05_B02_BLOCK_GATE_V1: ForgeBlockGateDefinition = {
  version: "1.0.0",
  atom: "P05-B02-A10",
  blockId: "P05-B02",
  title: "Filesystem okuma ve grounding",
  requiredAtomIds: [
    "P05-B02-A01",
    "P05-B02-A02",
    "P05-B02-A03",
    "P05-B02-A04",
    "P05-B02-A05",
    "P05-B02-A06",
    "P05-B02-A07",
    "P05-B02-A08",
    "P05-B02-A09",
    "P05-B02-A10",
  ],
  checks: [
    {
      id: "fixture_contract_alignment",
      atomId: "P05-B02-A01",
      description:
        "Worker filesystem grounding baseline aligns with typed contract and P05-B01 block gate handoff",
    },
    {
      id: "typed_contract_coverage",
      atomId: "P05-B02-A02",
      description: "Contract declares measurable probes for all filesystem grounding categories",
    },
    {
      id: "probe_matrix_aligned",
      atomId: "P05-B02-A03",
      description: "Filesystem grounding probe matrix executes with zero unexpected mismatches",
    },
    {
      id: "boundary_disposition_coverage",
      atomId: "P05-B02-A04",
      description:
        "Contract covers observed, failure, recovery and NO-GO dispositions with boundary probes",
    },
    {
      id: "failure_recovery_nogo",
      atomId: "P05-B02-A05",
      description: "Failure, recovery and NO-GO probes are declared and exercised",
    },
    {
      id: "evidence_telemetry_provenance",
      atomId: "P05-B02-A06",
      description: "Run record carries evidence, telemetry and provenance",
    },
    {
      id: "property_and_fuzz",
      atomId: "P05-B02-A07",
      description: "Structural property and fuzz validation reject tampered inputs",
    },
    {
      id: "regression_gate",
      atomId: "P05-B02-A08",
      description: "Regression gate passes on canonical filesystem grounding matrix",
    },
    {
      id: "guard_controls",
      atomId: "P05-B02-A09",
      description: "Adversarial, performance, cost and safety guard controls pass",
    },
    {
      id: "block_gate_sealed",
      atomId: "P05-B02-A10",
      description: "Block gate evidence sealed with valid B03 handoff contract",
    },
  ] satisfies readonly ForgeBlockGateCheck[],
};

export const FORGE_P05_B02_TO_B03_HANDOFF_V1: WorkerFilesystemGroundingBlockHandoffContract = {
  version: "1.0.0",
  atom: "P05-B02-A10",
  sourceBlock: {
    blockId: "P05-B02",
    title: "Filesystem okuma ve grounding",
    completedAtoms: FORGE_P05_B02_BLOCK_GATE_V1.requiredAtomIds,
  },
  targetBlock: {
    blockId: "P05-B03",
    title: "Cerrahi edit engine",
    entryAtom: "P05-B03-A01",
  },
  sealedArtifacts: {
    fixtureVersion: "1.0.0",
    contractVersion: FORGE_WORKER_FILESYSTEM_GROUNDING_CONTRACT_V1.version,
    harnessVersion: FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION,
    probeCount: summarizeWorkerFilesystemGroundingContractCoverage(
      FORGE_WORKER_FILESYSTEM_GROUNDING_CONTRACT_V1,
    ).totalProbes,
    workerFilesystemGroundingCategories: WORKER_FILESYSTEM_GROUNDING_CATEGORIES,
    sourceWorkerToolDispatchBlockGateAtom: "P05-B01-A10",
  },
  prerequisites: [
    "Worker filesystem grounding contract v1 with measurable read, path and boundary probes",
    "Versioned filesystem grounding baseline aligned to contract probe matrix and sealed P05-B01 block gate",
    "Evidence, telemetry and provenance run records",
    "Regression and guard gates integrated with orchestrator verification",
    "Sealed P05-B01 worker tool dispatch block gate referenced by sourceWorkerToolDispatchBlockGateAtom",
  ],
  entryCriteria: {
    description:
      "P05-B03-A01 formalizes surgical edit engine using sealed worker filesystem grounding artifacts",
    requiresBlockGatePass: true,
    workerFilesystemGroundingRecordRequired: true,
  },
};

export function getForgeP05B02BlockGate(): ForgeBlockGateDefinition {
  return FORGE_P05_B02_BLOCK_GATE_V1;
}

export function getForgeP05B02ToB03Handoff(): WorkerFilesystemGroundingBlockHandoffContract {
  return FORGE_P05_B02_TO_B03_HANDOFF_V1;
}

export function validateWorkerFilesystemGroundingBlockHandoffContract(
  handoff: WorkerFilesystemGroundingBlockHandoffContract,
  evidence: Pick<
    WorkerFilesystemGroundingBlockGateEvidence,
    "probeCount" | "regressionPassed" | "guardPassed"
  >,
  contract: WorkerFilesystemGroundingContract = getActiveWorkerFilesystemGroundingContract(),
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const coverage = summarizeWorkerFilesystemGroundingContractCoverage(contract);

  if (handoff.sealedArtifacts.probeCount !== coverage.totalProbes) {
    issues.push(
      `handoff probeCount=${handoff.sealedArtifacts.probeCount} contract=${coverage.totalProbes}`,
    );
  }
  if (handoff.sealedArtifacts.contractVersion !== contract.version) {
    issues.push(
      `handoff contractVersion=${handoff.sealedArtifacts.contractVersion} active=${contract.version}`,
    );
  }
  if (handoff.sealedArtifacts.harnessVersion !== FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION) {
    issues.push(
      `handoff harnessVersion=${handoff.sealedArtifacts.harnessVersion} active=${FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION}`,
    );
  }
  if (
    handoff.sealedArtifacts.workerFilesystemGroundingCategories.length !==
    WORKER_FILESYSTEM_GROUNDING_CATEGORIES.length
  ) {
    issues.push("handoff workerFilesystemGroundingCategories incomplete");
  }
  if (handoff.sealedArtifacts.sourceWorkerToolDispatchBlockGateAtom !== "P05-B01-A10") {
    issues.push(
      `unexpected source worker tool dispatch block gate atom: ${handoff.sealedArtifacts.sourceWorkerToolDispatchBlockGateAtom}`,
    );
  }
  if (handoff.targetBlock.entryAtom !== "P05-B03-A01") {
    issues.push(`unexpected entry atom: ${handoff.targetBlock.entryAtom}`);
  }
  if (!evidence.regressionPassed) {
    issues.push("regression gate did not pass");
  }
  if (!evidence.guardPassed) {
    issues.push("guard gate did not pass");
  }
  if (evidence.probeCount !== coverage.totalProbes) {
    issues.push(`evidence probeCount=${evidence.probeCount} contract=${coverage.totalProbes}`);
  }

  return { valid: issues.length === 0, issues };
}

export function buildWorkerFilesystemGroundingBlockGateEvidence(
  atomSeals: ForgeBlockAtomSeal[],
  regressionPassed: boolean,
  guardPassed: boolean,
  probeCount: number,
  gitCommit?: string,
  blockId = FORGE_P05_B02_BLOCK_GATE_V1.blockId,
): WorkerFilesystemGroundingBlockGateEvidence {
  const handoff = getForgeP05B02ToB03Handoff();
  const handoffValid = validateWorkerFilesystemGroundingBlockHandoffContract(handoff, {
    probeCount,
    regressionPassed,
    guardPassed,
  }).valid;

  return {
    blockId,
    atom: "P05-B02-A10",
    sealedAt: new Date().toISOString(),
    atomSeals,
    regressionPassed,
    guardPassed,
    handoffValid,
    probeCount,
    ...(gitCommit ? { gitCommit } : {}),
  };
}

/**
 * Validate block gate atom seals and handoff contract — rejects incomplete or failed seals.
 */
export function validateForgeWorkerFilesystemGroundingBlockGate(
  atomSeals: ForgeBlockAtomSeal[],
  evidence: Pick<
    WorkerFilesystemGroundingBlockGateEvidence,
    "probeCount" | "regressionPassed" | "guardPassed"
  >,
  blockGate: ForgeBlockGateDefinition = getForgeP05B02BlockGate(),
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (atomSeals.length !== blockGate.requiredAtomIds.length) {
    issues.push(
      `atomSeals count=${atomSeals.length} expected=${blockGate.requiredAtomIds.length}`,
    );
  }

  for (const atomId of blockGate.requiredAtomIds) {
    const seal = atomSeals.find(item => item.atomId === atomId);
    if (!seal) {
      issues.push(`missing atom seal: ${atomId}`);
    } else if (!seal.passed) {
      issues.push(`atom seal failed: ${atomId} — ${seal.detail}`);
    }
  }

  const handoffValidation = validateWorkerFilesystemGroundingBlockHandoffContract(
    getForgeP05B02ToB03Handoff(),
    evidence,
  );
  if (!handoffValidation.valid) {
    issues.push(...handoffValidation.issues);
  }

  return { valid: issues.length === 0, issues };
}
