/**
 * FOREMAN — Worker Filesystem Grounding Baseline (P05-B02)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P05-B01 worker tool dispatch block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import workerFilesystemGroundingBaseline from "./fixtures/forge-worker-filesystem-grounding-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP05B01ToB02Handoff,
  getActiveWorkerToolDispatchContract,
  summarizeWorkerToolDispatchContractCoverage,
} from "./forge-p05-worker-tool-dispatch.js";
import { TOOL_DEFINITIONS } from "./tools.js";
import { ExecutionEngine } from "./execution-engine.js";

export const FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION = "1.0.0-a02";

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
        expected: "FAIL",
        disposition: "gap",
        criterion: "TypedReadCall discriminated union narrows path and line-range args before read",
      },
      {
        id: "wfg.worker_prompt_grounding_contract",
        category: "read_signal",
        description: "WORKER_SYSTEM prompt declares filesystem grounding contract for read-before-edit",
        expected: "FAIL",
        disposition: "gap",
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
        expected: "FAIL",
        disposition: "gap",
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
        expected: "FAIL",
        disposition: "nogo",
        criterion: "validateReadBeforeEdit rejects edit/write without prior read_file grounding",
      },
      {
        id: "wfg.grounding_telemetry_record",
        category: "nogo_path",
        description: "buildFilesystemGroundingTelemetry records read grounding provenance for worker loop",
        expected: "FAIL",
        disposition: "nogo",
        criterion: "buildFilesystemGroundingTelemetry records read grounding provenance for worker loop",
      },
      {
        id: "wfg.exported_grounding_validator",
        category: "nogo_path",
        description: "validateFilesystemGrounding exported for orchestrator pre-read grounding checks",
        expected: "FAIL",
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

  let normalizedPath = filePath;
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

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length === 0) {
    issues.push({
      kind: "missing_category",
      detail: "fixture must document at least one measurable FAIL gap",
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
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount >= 1;
      return probe(id, category, expected, ok, `documentedFailGaps=${failCount}`);
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
      const ok = hasProductionExport("validateReadBeforeEdit");
      return probe(id, category, expected, ok, `readBeforeEditValidator=${ok}`);
    }
    case "wfg.grounding_telemetry_record": {
      const ok = hasProductionExport("buildFilesystemGroundingTelemetry");
      return probe(id, category, expected, ok, `groundingTelemetry=${ok}`);
    }
    case "wfg.exported_grounding_validator": {
      const ok = hasProductionExport("validateFilesystemGrounding");
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
