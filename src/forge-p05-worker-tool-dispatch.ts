/**
 * FOREMAN — Worker Tool Dispatch Baseline (P05-B01)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P04-B10 researcher phase gate artifacts.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import workerToolDispatchBaseline from "./fixtures/forge-worker-tool-dispatch-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP04B10ToP05Handoff,
  getActiveResearcherPhaseGateContract,
  summarizeResearcherPhaseGateContractCoverage,
  EXPECTED_P04_B09_SEALED_ATOM_COUNT,
} from "./forge-p04-researcher-phase-gate.js";
import {
  TOOL_DEFINITIONS,
  createToolExecutor,
  toGeminiFunctionDeclarations,
  type ToolCall,
} from "./tools.js";

export const FORGE_WORKER_TOOL_DISPATCH_VERSION = "1.0.0-a09";

export const WORKER_TOOL_DISPATCH_ARGS_MAX_LENGTH = 16_384;

export const WORKER_TOOL_DISPATCH_CATEGORIES = [
  "dispatch_versioning",
  "tool_interface",
  "dispatch_routing",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type WorkerToolDispatchCategory = (typeof WORKER_TOOL_DISPATCH_CATEGORIES)[number];

export const WORKER_TOOL_DISPATCH_A01_MIN_PROBES: Readonly<
  Record<WorkerToolDispatchCategory, number>
> = {
  dispatch_versioning: 3,
  tool_interface: 4,
  dispatch_routing: 4,
  baseline_link: 2,
  boundary: 7,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 3,
};

export type WorkerToolCallInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface WorkerToolCallInputBoundary {
  disposition: WorkerToolCallInputDisposition;
  acceptable: boolean;
  normalizedName: string;
  normalizedArgs: Record<string, unknown>;
  truncated: boolean;
  detail: string;
}

export interface WorkerToolCallRecoveryResult {
  recovered: boolean;
  call: ToolCall;
  parseErrors: string[];
  detail: string;
}

export interface WorkerToolDispatchFixtureEntry {
  id: string;
  category: WorkerToolDispatchCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface WorkerToolDispatchBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    researcherPhaseGateProbeCount: number;
    sealedAtomCount: number;
  };
  probes: WorkerToolDispatchFixtureEntry[];
}

export interface WorkerToolDispatchProbeResult {
  id: string;
  category: WorkerToolDispatchCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface WorkerToolDispatchValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: WorkerToolDispatchCategory;
  detail: string;
}

export interface WorkerToolDispatchValidationResult {
  valid: boolean;
  issues: WorkerToolDispatchValidationIssue[];
}

export interface WorkerToolDispatchProbeSummary {
  total: number;
  aligned: number;
  mismatches: WorkerToolDispatchProbeResult[];
  knownGaps: WorkerToolDispatchProbeResult[];
  byCategory: Record<
    WorkerToolDispatchCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export type WorkerToolDispatchProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface WorkerToolDispatchProbeContract {
  id: string;
  category: WorkerToolDispatchCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: WorkerToolDispatchProbeDisposition;
  criterion: string;
}

export interface WorkerToolDispatchCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface WorkerToolDispatchCategoryContract {
  category: WorkerToolDispatchCategory;
  acceptance: WorkerToolDispatchCategoryAcceptance;
  probes: readonly WorkerToolDispatchProbeContract[];
}

export interface WorkerToolDispatchContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<WorkerToolDispatchCategory, WorkerToolDispatchCategoryContract>;
  probes: readonly WorkerToolDispatchProbeContract[];
}

function flattenWorkerToolDispatchCategoryProbes(
  categories: Record<WorkerToolDispatchCategory, WorkerToolDispatchCategoryContract>,
): readonly WorkerToolDispatchProbeContract[] {
  return WORKER_TOOL_DISPATCH_CATEGORIES.flatMap(category => categories[category].probes);
}

const WORKER_TOOL_DISPATCH_CATEGORY_CONTRACTS: Record<
  WorkerToolDispatchCategory,
  WorkerToolDispatchCategoryContract
> = {
  dispatch_versioning: {
    category: "dispatch_versioning",
    acceptance: {
      invariant:
        "Worker tool dispatch baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wtd.version_tagged",
        category: "dispatch_versioning",
        description: "Worker tool dispatch baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Worker tool dispatch baseline declares semver version field",
      },
      {
        id: "wtd.atom_tagged",
        category: "dispatch_versioning",
        description: "Worker tool dispatch baseline declares P05-B01-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Worker tool dispatch baseline declares P05-B01-A01 atom id",
      },
      {
        id: "wtd.harness_version_exported",
        category: "dispatch_versioning",
        description: "FORGE_WORKER_TOOL_DISPATCH_VERSION exported for dispatch harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_WORKER_TOOL_DISPATCH_VERSION exported for dispatch harness",
      },
    ],
  },
  tool_interface: {
    category: "tool_interface",
    acceptance: {
      invariant:
        "Tool registry exports schema-backed definitions; typed union and worker prompt contract gate args.",
      minProbeCount: 4,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "wtd.tool_definitions_registry",
        category: "tool_interface",
        description:
          "TOOL_DEFINITIONS exports worker-invokable tool registry with name and parameters schema",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "TOOL_DEFINITIONS exports worker-invokable tool registry with name and parameters schema",
      },
      {
        id: "wtd.gemini_function_declarations",
        category: "tool_interface",
        description:
          "toGeminiFunctionDeclarations converts TOOL_DEFINITIONS into provider function declarations",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "toGeminiFunctionDeclarations converts TOOL_DEFINITIONS into provider function declarations",
      },
      {
        id: "wtd.typed_tool_call_union",
        category: "tool_interface",
        description: "TypedToolCall discriminated union narrows args per tool name before dispatch",
        expected: "PASS",
        disposition: "observed",
        criterion: "TypedToolCall discriminated union narrows args per tool name before dispatch",
      },
      {
        id: "wtd.worker_prompt_typed_contract",
        category: "tool_interface",
        description: "WORKER_SYSTEM prompt declares typed tool dispatch contract for worker execution",
        expected: "PASS",
        disposition: "observed",
        criterion: "WORKER_SYSTEM prompt declares typed tool dispatch contract for worker execution",
      },
    ],
  },
  dispatch_routing: {
    category: "dispatch_routing",
    acceptance: {
      invariant:
        "Tool executors route through deterministic dispatch with orchestrator pre-dispatch validation.",
      minProbeCount: 4,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "wtd.create_tool_executor_exported",
        category: "dispatch_routing",
        description: "createToolExecutor exports project-root-bound worker tool dispatcher",
        expected: "PASS",
        disposition: "observed",
        criterion: "createToolExecutor exports project-root-bound worker tool dispatcher",
      },
      {
        id: "wtd.engine_tool_executor_exported",
        category: "dispatch_routing",
        description: "createEngineToolExecutor reuses Engine subsystems for orchestrator tool dispatch",
        expected: "PASS",
        disposition: "observed",
        criterion: "createEngineToolExecutor reuses Engine subsystems for orchestrator tool dispatch",
      },
      {
        id: "wtd.switch_based_dispatcher",
        category: "dispatch_routing",
        description: "createToolDispatcher routes tool calls through deterministic switch dispatch table",
        expected: "PASS",
        disposition: "observed",
        criterion: "createToolDispatcher routes tool calls through deterministic switch dispatch table",
      },
      {
        id: "wtd.orchestrator_pre_dispatch_check",
        category: "dispatch_routing",
        description: "Orchestrator validates worker tool calls against typed contract before executor dispatch",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Orchestrator validates worker tool calls against typed contract before executor dispatch",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Worker tool dispatch baseline links to sealed P04-B10 researcher phase gate handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wtd.b10_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P04_B10_TO_P05_HANDOFF_V1 targets P05-B01-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P04_B10_TO_P05_HANDOFF_V1 targets P05-B01-A01 entry atom",
      },
      {
        id: "wtd.b10_sealed_phase_gate_probes",
        category: "baseline_link",
        description:
          "P04-B10→P05 handoff sealed probeCount matches active researcher phase gate contract",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "P04-B10→P05 handoff sealed probeCount matches active researcher phase gate contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Tool call boundary assessment rejects invalid input; probe runner and documented gaps wired.",
      minProbeCount: 7,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wtd.source_block_gate_ref",
        category: "boundary",
        description:
          "Baseline fixture references sealed P04-B10 researcher phase gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Baseline fixture references sealed P04-B10 researcher phase gate source artifacts",
      },
      {
        id: "wtd.probe_runner_exported",
        category: "boundary",
        description: "runWorkerToolDispatchProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runWorkerToolDispatchProbes executes contract-wired probe matrix",
      },
      {
        id: "wtd.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL worker tool dispatch gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL worker tool dispatch gap",
      },
      {
        id: "wtd.empty_tool_name_boundary",
        category: "boundary",
        description: "assessWorkerToolCallInputBoundary rejects empty tool name before dispatch",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessWorkerToolCallInputBoundary rejects empty tool name before dispatch",
      },
      {
        id: "wtd.whitespace_tool_name_boundary",
        category: "boundary",
        description: "assessWorkerToolCallInputBoundary rejects whitespace-only tool name",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessWorkerToolCallInputBoundary rejects whitespace-only tool name",
      },
      {
        id: "wtd.null_byte_tool_name_boundary",
        category: "boundary",
        description: "assessWorkerToolCallInputBoundary rejects null-byte tool name safely",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessWorkerToolCallInputBoundary rejects null-byte tool name safely",
      },
      {
        id: "wtd.long_tool_args_truncation_boundary",
        category: "boundary",
        description: "assessWorkerToolCallInputBoundary truncates oversized serialized tool args",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessWorkerToolCallInputBoundary truncates oversized serialized tool args",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Invalid fixture versions and null-byte tool call input are rejected safely.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wtd.invalid_version_rejected",
        category: "failure_path",
        description: "validateWorkerToolDispatchBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateWorkerToolDispatchBaseline rejects unexpected fixture version",
      },
      {
        id: "wtd.malformed_tool_call_guard",
        category: "failure_path",
        description: "assessWorkerToolCallInputBoundary rejects null-byte serialized args safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessWorkerToolCallInputBoundary rejects null-byte serialized args safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant: "Recovery paths coerce malformed tool calls into dispatch-ready ToolCall records.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wtd.recovery_string_args_coercion",
        category: "recovery_path",
        description:
          "recoverWorkerToolCall coerces JSON string tool args into object record before dispatch",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "recoverWorkerToolCall coerces JSON string tool args into object record before dispatch",
      },
      {
        id: "wtd.recovery_missing_name_rejected",
        category: "recovery_path",
        description: "recoverWorkerToolCall rejects tool calls with unrecoverable missing tool name",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverWorkerToolCall rejects tool calls with unrecoverable missing tool name",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Schema validation, dispatch validator and telemetry exports gate worker NO-GO wiring.",
      minProbeCount: 3,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "wtd.schema_validation_before_dispatch",
        category: "nogo_path",
        description:
          "validateWorkerToolCallAgainstSchema rejects args missing required tool parameters before dispatch",
        expected: "PASS",
        disposition: "nogo",
        criterion:
          "validateWorkerToolCallAgainstSchema rejects args missing required tool parameters before dispatch",
      },
      {
        id: "wtd.exported_dispatch_validator",
        category: "nogo_path",
        description: "validateWorkerToolCall exported for orchestrator pre-dispatch typed contract checks",
        expected: "PASS",
        disposition: "nogo",
        criterion: "validateWorkerToolCall exported for orchestrator pre-dispatch typed contract checks",
      },
      {
        id: "wtd.dispatch_telemetry_record",
        category: "nogo_path",
        description: "buildWorkerToolDispatchTelemetry records dispatch provenance for worker tool loop",
        expected: "PASS",
        disposition: "nogo",
        criterion: "buildWorkerToolDispatchTelemetry records dispatch provenance for worker tool loop",
      },
    ],
  },
};

export const FORGE_WORKER_TOOL_DISPATCH_CONTRACT_V1: WorkerToolDispatchContract = {
  version: "1.0.0",
  atom: "P05-B01-A02",
  purpose: "Worker tool dispatch typed contract with measurable acceptance probes.",
  categories: WORKER_TOOL_DISPATCH_CATEGORY_CONTRACTS,
  probes: flattenWorkerToolDispatchCategoryProbes(WORKER_TOOL_DISPATCH_CATEGORY_CONTRACTS),
};

export function getActiveWorkerToolDispatchContract(): WorkerToolDispatchContract {
  return FORGE_WORKER_TOOL_DISPATCH_CONTRACT_V1;
}

export function getWorkerToolDispatchCategoryContract(
  category: WorkerToolDispatchCategory,
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): WorkerToolDispatchCategoryContract {
  return contract.categories[category];
}

export function listWorkerToolDispatchContractProbeIds(
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listWorkerToolDispatchProbesByDisposition(
  disposition: WorkerToolDispatchProbeDisposition,
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): WorkerToolDispatchProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listWorkerToolDispatchContractProbesByCategory(
  category: WorkerToolDispatchCategory,
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): readonly WorkerToolDispatchProbeContract[] {
  return [...contract.categories[category].probes];
}

export interface WorkerToolDispatchContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: WorkerToolDispatchCategory;
  detail: string;
}

export interface WorkerToolDispatchContractCoverageResult {
  valid: boolean;
  issues: WorkerToolDispatchContractCoverageIssue[];
}

export function summarizeWorkerToolDispatchContractCoverage(
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<WorkerToolDispatchCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<WorkerToolDispatchProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    WorkerToolDispatchCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<WorkerToolDispatchProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of WORKER_TOOL_DISPATCH_CATEGORIES) {
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

export function validateWorkerToolDispatchContractCoverage(
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): WorkerToolDispatchContractCoverageResult {
  const issues: WorkerToolDispatchContractCoverageIssue[] = [];

  for (const category of WORKER_TOOL_DISPATCH_CATEGORIES) {
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
      categoryContract.acceptance.minProbeCount < WORKER_TOOL_DISPATCH_A01_MIN_PROBES[category]
    ) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${WORKER_TOOL_DISPATCH_A01_MIN_PROBES[category]}`,
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

  const ids = listWorkerToolDispatchContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeWorkerToolDispatchContractCoverage(contract);
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
    if (!probe.id.startsWith("wtd.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing wtd. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateWorkerToolDispatchContract(
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): WorkerToolDispatchContractCoverageResult {
  return validateWorkerToolDispatchContractCoverage(contract);
}

export function validateWorkerToolDispatchAgainstContract(
  fixture: WorkerToolDispatchBaseline,
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): WorkerToolDispatchValidationResult {
  const issues: WorkerToolDispatchValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of WORKER_TOOL_DISPATCH_CATEGORIES) {
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

function serializeToolArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
}

function argsContainNullByte(args: Record<string, unknown>): boolean {
  for (const value of Object.values(args)) {
    if (typeof value === "string" && value.includes("\0")) {
      return true;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (argsContainNullByte(value as Record<string, unknown>)) {
        return true;
      }
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.includes("\0")) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Assess tool call input boundary conditions before worker dispatch (P05-B01-A01).
 */
export function assessWorkerToolCallInputBoundary(
  name: string,
  args: Record<string, unknown> = {},
): WorkerToolCallInputBoundary {
  if (name.includes("\0") || argsContainNullByte(args)) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedName: "",
      normalizedArgs: {},
      truncated: false,
      detail: "null byte detected in tool call input",
    };
  }

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    const disposition: WorkerToolCallInputDisposition =
      name.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedName: "",
      normalizedArgs: {},
      truncated: false,
      detail: disposition === "empty" ? "empty tool name" : "whitespace-only tool name",
    };
  }

  let normalizedArgs = args;
  let truncated = false;
  const serialized = serializeToolArgs(args);
  if (serialized.length > WORKER_TOOL_DISPATCH_ARGS_MAX_LENGTH) {
    normalizedArgs = { _truncated: serialized.slice(0, WORKER_TOOL_DISPATCH_ARGS_MAX_LENGTH) };
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedName: trimmedName,
    normalizedArgs,
    truncated,
    detail: truncated
      ? `tool args truncated to ${WORKER_TOOL_DISPATCH_ARGS_MAX_LENGTH} characters`
      : "valid tool call input",
  };
}

/**
 * Recover malformed worker tool call into dispatch-ready ToolCall (P05-B01-A01).
 */
export function recoverWorkerToolCall(
  rawName: string,
  rawArgs: unknown,
): WorkerToolCallRecoveryResult {
  const boundary = assessWorkerToolCallInputBoundary(rawName, {});
  if (!boundary.acceptable) {
    return {
      recovered: false,
      call: { name: rawName, args: {} },
      parseErrors: [boundary.disposition],
      detail: `cannot recover ${boundary.disposition.replace(/_/g, "-")} tool call`,
    };
  }

  let args: Record<string, unknown> = {};
  const parseErrors: string[] = [];

  if (typeof rawArgs === "string") {
    try {
      const parsed = JSON.parse(rawArgs) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      } else {
        parseErrors.push("string_args_not_object");
      }
    } catch {
      parseErrors.push("string_args_invalid_json");
    }
  } else if (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)) {
    args = rawArgs as Record<string, unknown>;
  } else if (rawArgs !== undefined && rawArgs !== null) {
    parseErrors.push("unsupported_args_type");
  }

  const argsBoundary = assessWorkerToolCallInputBoundary(boundary.normalizedName, args);
  if (!argsBoundary.acceptable) {
    return {
      recovered: false,
      call: { name: boundary.normalizedName, args: {} },
      parseErrors: [argsBoundary.disposition],
      detail: argsBoundary.detail,
    };
  }

  const recovered = parseErrors.length === 0;
  return {
    recovered,
    call: {
      name: argsBoundary.normalizedName,
      args: argsBoundary.normalizedArgs,
    },
    parseErrors,
    detail: recovered
      ? `recovered tool call name=${argsBoundary.normalizedName}`
      : `partial recovery: ${parseErrors.join(", ")}`,
  };
}

export interface WorkerToolCallValidationResult {
  valid: boolean;
  errors: string[];
  call?: ToolCall;
}

export interface WorkerToolDispatchTelemetry {
  toolName: string;
  sequenceIndex: number;
  validated: boolean;
  validatedAt: string;
  contractVersion: string;
  harnessVersion: string;
  errors: string[];
}

/**
 * Validate worker tool call args against TOOL_DEFINITIONS schema (P05-B01-A03).
 */
export function validateWorkerToolCallAgainstSchema(
  name: string,
  args: Record<string, unknown> = {},
): WorkerToolCallValidationResult {
  const definition = TOOL_DEFINITIONS.find(def => def.name === name);
  if (!definition) {
    return { valid: false, errors: [`unknown tool: ${name}`] };
  }

  const parameters = definition.parameters as {
    required?: string[];
  };
  const required = parameters.required ?? [];
  const errors: string[] = [];

  for (const field of required) {
    if (!(field in args) || args[field] === undefined || args[field] === null) {
      errors.push(`missing required parameter: ${field}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    call: { name, args },
  };
}

/**
 * Validate worker tool call boundary + schema before orchestrator dispatch (P05-B01-A03).
 */
export function validateWorkerToolCall(call: ToolCall): WorkerToolCallValidationResult {
  const boundary = assessWorkerToolCallInputBoundary(call.name, call.args);
  if (!boundary.acceptable) {
    return { valid: false, errors: [boundary.detail] };
  }

  return validateWorkerToolCallAgainstSchema(
    boundary.normalizedName,
    boundary.normalizedArgs,
  );
}

/**
 * Record worker tool dispatch provenance for tool loop telemetry (P05-B01-A03).
 */
export function buildWorkerToolDispatchTelemetry(
  call: ToolCall,
  options: {
    sequenceIndex?: number;
    validation?: WorkerToolCallValidationResult;
  } = {},
): WorkerToolDispatchTelemetry {
  const validation = options.validation ?? validateWorkerToolCall(call);

  return {
    toolName: call.name,
    sequenceIndex: options.sequenceIndex ?? 0,
    validated: validation.valid,
    validatedAt: new Date().toISOString(),
    contractVersion: FORGE_WORKER_TOOL_DISPATCH_CONTRACT_V1.version,
    harnessVersion: FORGE_WORKER_TOOL_DISPATCH_VERSION,
    errors: validation.errors,
  };
}

export const FORGE_WORKER_TOOL_DISPATCH_A01_PROBE_MATRIX: readonly WorkerToolDispatchFixtureEntry[] =
  workerToolDispatchBaseline.probes as WorkerToolDispatchFixtureEntry[];

export function getWorkerToolDispatchA01ExpectedFailCount(): number {
  return FORGE_WORKER_TOOL_DISPATCH_A01_PROBE_MATRIX.filter(p => p.expected === "FAIL").length;
}

export function loadWorkerToolDispatchBaseline(): WorkerToolDispatchBaseline {
  return workerToolDispatchBaseline as WorkerToolDispatchBaseline;
}

export function validateWorkerToolDispatchBaseline(
  fixture: WorkerToolDispatchBaseline,
): WorkerToolDispatchValidationResult {
  const issues: WorkerToolDispatchValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P05-B01-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    WORKER_TOOL_DISPATCH_CATEGORIES.map(category => [category, 0]),
  ) as Record<WorkerToolDispatchCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of WORKER_TOOL_DISPATCH_CATEGORIES) {
    const min = WORKER_TOOL_DISPATCH_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_WORKER_TOOL_DISPATCH_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_WORKER_TOOL_DISPATCH_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_WORKER_TOOL_DISPATCH_A01_PROBE_MATRIX) {
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

  const contract = getActiveWorkerToolDispatchContract();
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

  const handoff = getForgeP04B10ToP05Handoff();
  const phaseGateCoverage = summarizeResearcherPhaseGateContractCoverage(
    getActiveResearcherPhaseGateContract(),
  );

  if (fixture.sourceBlockGate.atom !== "P04-B10-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P04-B10-A10`,
    });
  }
  if (fixture.sourceBlockGate.researcherPhaseGateProbeCount !== phaseGateCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.researcherPhaseGateProbeCount=${fixture.sourceBlockGate.researcherPhaseGateProbeCount} ` +
        `contract=${phaseGateCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P04_B09_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P04_B09_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P05-B01-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P05-B01-A01`,
    });
  }

  const contractAlignment = validateWorkerToolDispatchAgainstContract(
    fixture,
    getActiveWorkerToolDispatchContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: WorkerToolDispatchCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
): WorkerToolDispatchProbeResult {
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

function productionDispatchSource(): string {
  return readSrc("forge-p05-worker-tool-dispatch.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionDispatchSource());
}

function probeDispatchVersioning(
  id: string,
  category: WorkerToolDispatchCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerToolDispatchBaseline,
): WorkerToolDispatchProbeResult {
  switch (id) {
    case "wtd.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "wtd.atom_tagged": {
      const ok = fixture.atom === "P05-B01-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "wtd.harness_version_exported": {
      const ok = FORGE_WORKER_TOOL_DISPATCH_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_WORKER_TOOL_DISPATCH_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown dispatch_versioning probe");
  }
}

function probeToolInterface(
  id: string,
  category: WorkerToolDispatchCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerToolDispatchProbeResult {
  const tools = toolsSource();
  const prompts = promptsSource();

  switch (id) {
    case "wtd.tool_definitions_registry": {
      const ok =
        TOOL_DEFINITIONS.length > 0 &&
        TOOL_DEFINITIONS.every(def => def.name.length > 0 && def.parameters !== undefined);
      return probe(
        id,
        category,
        expected,
        ok,
        `toolCount=${TOOL_DEFINITIONS.length}`,
      );
    }
    case "wtd.gemini_function_declarations": {
      const declarations = toGeminiFunctionDeclarations();
      const ok =
        declarations.length === TOOL_DEFINITIONS.length &&
        tools.includes("export function toGeminiFunctionDeclarations");
      return probe(id, category, expected, ok, `declarations=${declarations.length}`);
    }
    case "wtd.typed_tool_call_union": {
      const ok =
        tools.includes("export type TypedToolCall") ||
        tools.includes("interface TypedToolCall");
      return probe(id, category, expected, ok, `typedToolCall=${ok}`);
    }
    case "wtd.worker_prompt_typed_contract": {
      const ok =
        prompts.includes("typed tool dispatch") ||
        prompts.includes("Typed tool dispatch") ||
        prompts.includes("TYPED TOOL DISPATCH");
      return probe(id, category, expected, ok, `typedContractSection=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown tool_interface probe");
  }
}

function probeDispatchRouting(
  id: string,
  category: WorkerToolDispatchCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerToolDispatchProbeResult {
  const tools = toolsSource();
  const orchestrator = orchestratorSource();

  switch (id) {
    case "wtd.create_tool_executor_exported": {
      const ok = tools.includes("export function createToolExecutor");
      return probe(id, category, expected, ok, `createToolExecutor=${ok}`);
    }
    case "wtd.engine_tool_executor_exported": {
      const ok = tools.includes("export function createEngineToolExecutor");
      return probe(id, category, expected, ok, `createEngineToolExecutor=${ok}`);
    }
    case "wtd.switch_based_dispatcher": {
      const ok =
        tools.includes("function createToolDispatcher") &&
        tools.includes("switch (call.name)");
      return probe(id, category, expected, ok, `switchDispatcher=${ok}`);
    }
    case "wtd.orchestrator_pre_dispatch_check": {
      const ok =
        orchestrator.includes("validateWorkerToolCall(") ||
        orchestrator.includes("validateWorkerToolCallAgainstSchema(");
      return probe(id, category, expected, ok, `preDispatchValidation=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown dispatch_routing probe");
  }
}

function probeBaselineLink(
  id: string,
  category: WorkerToolDispatchCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerToolDispatchProbeResult {
  switch (id) {
    case "wtd.b10_handoff_entry": {
      const handoff = getForgeP04B10ToP05Handoff();
      const ok =
        handoff.targetBlock.blockId === "P05-B01" &&
        handoff.targetBlock.entryAtom === "P05-B01-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "wtd.b10_sealed_phase_gate_probes": {
      const handoff = getForgeP04B10ToP05Handoff();
      const coverage = summarizeResearcherPhaseGateContractCoverage(
        getActiveResearcherPhaseGateContract(),
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
  category: WorkerToolDispatchCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerToolDispatchBaseline,
): WorkerToolDispatchProbeResult {
  switch (id) {
    case "wtd.source_block_gate_ref": {
      const handoff = getForgeP04B10ToP05Handoff();
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P04_B09_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, sealed=${fixture.sourceBlockGate.sealedAtomCount}`,
      );
    }
    case "wtd.probe_runner_exported": {
      const ok = productionDispatchSource().includes(
        "export function runWorkerToolDispatchProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "wtd.known_gaps_documented": {
      const contract = getActiveWorkerToolDispatchContract();
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
    case "wtd.empty_tool_name_boundary": {
      const result = assessWorkerToolCallInputBoundary("");
      const ok = !result.acceptable && result.disposition === "empty";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    case "wtd.whitespace_tool_name_boundary": {
      const result = assessWorkerToolCallInputBoundary("   \t\n  ");
      const ok = !result.acceptable && result.disposition === "whitespace_only";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    case "wtd.null_byte_tool_name_boundary": {
      const result = assessWorkerToolCallInputBoundary("read_file\0");
      const ok = !result.acceptable && result.disposition === "contains_null_byte";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    case "wtd.long_tool_args_truncation_boundary": {
      const longArgs = { payload: "x".repeat(WORKER_TOOL_DISPATCH_ARGS_MAX_LENGTH + 500) };
      const result = assessWorkerToolCallInputBoundary("read_file", longArgs);
      const ok = result.acceptable && result.truncated && result.disposition === "exceeds_max_length";
      return probe(
        id,
        category,
        expected,
        ok,
        `truncated=${result.truncated}, argsLen=${serializeToolArgs(result.normalizedArgs).length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: WorkerToolDispatchCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerToolDispatchBaseline,
): WorkerToolDispatchProbeResult {
  switch (id) {
    case "wtd.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const validation = validateWorkerToolDispatchBaseline(invalid);
      const ok = validation.valid === false;
      return probe(id, category, expected, ok, `rejected=${ok}`);
    }
    case "wtd.malformed_tool_call_guard": {
      const result = assessWorkerToolCallInputBoundary("read_file", { path: "file\0.txt" });
      const ok = !result.acceptable && result.disposition === "contains_null_byte";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: WorkerToolDispatchCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerToolDispatchProbeResult {
  switch (id) {
    case "wtd.recovery_string_args_coercion": {
      const recovery = recoverWorkerToolCall(
        "read_file",
        JSON.stringify({ path: "src/tools.ts" }),
      );
      const ok =
        recovery.recovered &&
        recovery.call.name === "read_file" &&
        recovery.call.args.path === "src/tools.ts";
      return probe(id, category, expected, ok, recovery.detail);
    }
    case "wtd.recovery_missing_name_rejected": {
      const recovery = recoverWorkerToolCall("", { path: "src/tools.ts" });
      const ok = !recovery.recovered && recovery.parseErrors.includes("empty");
      return probe(id, category, expected, ok, recovery.detail);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: WorkerToolDispatchCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerToolDispatchProbeResult {
  switch (id) {
    case "wtd.schema_validation_before_dispatch": {
      const missingRequired = validateWorkerToolCallAgainstSchema("read_file", {});
      const ok =
        hasProductionExport("validateWorkerToolCallAgainstSchema") && !missingRequired.valid;
      return probe(
        id,
        category,
        expected,
        ok,
        `schemaValidator=${ok}, errors=${missingRequired.errors.join(",")}`,
      );
    }
    case "wtd.exported_dispatch_validator": {
      const invalidName = validateWorkerToolCall({ name: "", args: {} });
      const ok = hasProductionExport("validateWorkerToolCall") && !invalidName.valid;
      return probe(id, category, expected, ok, `dispatchValidator=${ok}`);
    }
    case "wtd.dispatch_telemetry_record": {
      const telemetry = buildWorkerToolDispatchTelemetry(
        { name: "read_file", args: { explanation: "probe", path: "src/tools.ts" } },
        { sequenceIndex: 1 },
      );
      const ok =
        hasProductionExport("buildWorkerToolDispatchTelemetry") &&
        telemetry.toolName === "read_file" &&
        telemetry.sequenceIndex === 1 &&
        telemetry.validated === true;
      return probe(id, category, expected, ok, `dispatchTelemetry=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: WorkerToolDispatchCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerToolDispatchBaseline,
): WorkerToolDispatchProbeResult {
  switch (category) {
    case "dispatch_versioning":
      return probeDispatchVersioning(id, category, expected, fixture);
    case "tool_interface":
      return probeToolInterface(id, category, expected);
    case "dispatch_routing":
      return probeDispatchRouting(id, category, expected);
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

export function runWorkerToolDispatchProbes(
  fixture: WorkerToolDispatchBaseline = loadWorkerToolDispatchBaseline(),
): WorkerToolDispatchProbeResult[] {
  const contract = getActiveWorkerToolDispatchContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion ? { ...result, criterion: contractProbe.criterion } : result;
  });
}

export function summarizeWorkerToolDispatchMatrix(
  results: WorkerToolDispatchProbeResult[],
): WorkerToolDispatchProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = Object.fromEntries(
    WORKER_TOOL_DISPATCH_CATEGORIES.map(category => [
      category,
      { total: 0, aligned: 0, expectedFail: 0 },
    ]),
  ) as WorkerToolDispatchProbeSummary["byCategory"];

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

export function listWorkerToolDispatchProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerToolDispatchBaseline = loadWorkerToolDispatchBaseline(),
): WorkerToolDispatchFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listWorkerToolDispatchKnownGaps(
  results: WorkerToolDispatchProbeResult[] = runWorkerToolDispatchProbes(),
): WorkerToolDispatchProbeResult[] {
  return summarizeWorkerToolDispatchMatrix(results).knownGaps;
}

export interface WorkerToolDispatchProbeMatrixValidationIssue {
  kind: "missing_result" | "criterion_mismatch" | "pass_mismatch" | "gap_mismatch";
  probeId?: string;
  detail: string;
}

export interface WorkerToolDispatchProbeMatrixValidationResult {
  valid: boolean;
  issues: WorkerToolDispatchProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

export function validateWorkerToolDispatchProbeMatrix(
  results: WorkerToolDispatchProbeResult[],
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): WorkerToolDispatchProbeMatrixValidationResult {
  const issues: WorkerToolDispatchProbeMatrixValidationIssue[] = [];
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

export interface WorkerToolDispatchProductionSliceResult {
  atom: "P05-B01-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: WorkerToolDispatchProbeResult[];
  summary: WorkerToolDispatchProbeSummary;
  matrixValidation: WorkerToolDispatchProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: typed tool dispatch wired to contract probes
 * with zero unexpected mismatches against the sealed contract matrix.
 */
export function runWorkerToolDispatchProductionSlice(
  fixture: WorkerToolDispatchBaseline = loadWorkerToolDispatchBaseline(),
): WorkerToolDispatchProductionSliceResult {
  const contract = getActiveWorkerToolDispatchContract();
  const fixtureValidation = validateWorkerToolDispatchBaseline(fixture);
  const contractValidation = validateWorkerToolDispatchAgainstContract(fixture, contract);
  const results = runWorkerToolDispatchProbes(fixture);
  const summary = summarizeWorkerToolDispatchMatrix(results);
  const matrixValidation = validateWorkerToolDispatchProbeMatrix(results, contract);

  return {
    atom: "P05-B01-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface WorkerToolDispatchBoundarySliceResult {
  atom: "P05-B01-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: WorkerToolDispatchProbeResult[];
  boundaryResults: WorkerToolDispatchProbeResult[];
  matrixValidation: WorkerToolDispatchProbeMatrixValidationResult;
}

/**
 * Validate boundary-category probe matrix — A04 slice gate.
 */
export function validateWorkerToolDispatchBoundaryProbeMatrix(
  results: WorkerToolDispatchProbeResult[],
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): WorkerToolDispatchProbeMatrixValidationResult {
  const boundaryProbes = listWorkerToolDispatchContractProbesByCategory("boundary", contract);
  const boundaryContract: WorkerToolDispatchContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateWorkerToolDispatchProbeMatrix(boundaryResults, boundaryContract);
}

/**
 * A04 boundary slice: contract-wired boundary probes (tool call input edge cases, probe runner,
 * documented gaps, source block gate refs) with zero unexpected mismatches.
 */
export function runWorkerToolDispatchBoundarySlice(
  fixture: WorkerToolDispatchBaseline = loadWorkerToolDispatchBaseline(),
): WorkerToolDispatchBoundarySliceResult {
  const contract = getActiveWorkerToolDispatchContract();
  const results = runWorkerToolDispatchProbes(fixture);
  const boundaryProbes = listWorkerToolDispatchContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateWorkerToolDispatchBoundaryProbeMatrix(results, contract);

  return {
    atom: "P05-B01-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const WORKER_TOOL_DISPATCH_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly WorkerToolDispatchCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery probes and documented NO-GO wiring must align; zero unexpected mismatches.
 */
export function validateWorkerToolDispatchFailureRecoveryProbeMatrix(
  results: WorkerToolDispatchProbeResult[],
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): WorkerToolDispatchProbeMatrixValidationResult {
  const failureRecoveryProbes = WORKER_TOOL_DISPATCH_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listWorkerToolDispatchContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: WorkerToolDispatchContract = {
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
  return validateWorkerToolDispatchProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listWorkerToolDispatchFailureRecoveryProbeIds(
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): string[] {
  return WORKER_TOOL_DISPATCH_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listWorkerToolDispatchContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface WorkerToolDispatchFailureRecoverySliceResult {
  atom: "P05-B01-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: WorkerToolDispatchProbeResult[];
  failureRecoveryResults: WorkerToolDispatchProbeResult[];
  matrixValidation: WorkerToolDispatchProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches.
 */
export function runWorkerToolDispatchFailureRecoverySlice(
  fixture: WorkerToolDispatchBaseline = loadWorkerToolDispatchBaseline(),
): WorkerToolDispatchFailureRecoverySliceResult {
  const contract = getActiveWorkerToolDispatchContract();
  const results = runWorkerToolDispatchProbes(fixture);
  const failureRecoveryProbes = WORKER_TOOL_DISPATCH_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listWorkerToolDispatchContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateWorkerToolDispatchFailureRecoveryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P05-B01-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

/** Per-probe evidence artifact — disposition, criterion and aligned outcomes (P05-B01-A06). */
export interface WorkerToolDispatchProbeEvidence {
  probeId: string;
  category: WorkerToolDispatchCategory;
  disposition: WorkerToolDispatchProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for worker tool dispatch runs (P05-B01-A06). */
export interface WorkerToolDispatchProbeRunTelemetry {
  probeId: string;
  category: WorkerToolDispatchCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P05-B01-A06). */
export interface WorkerToolDispatchProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourceBlockGateVersion: string;
  sourceBlockGateAtom: string;
  sliceAtom?: string;
  sliceCategories?: readonly WorkerToolDispatchCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated worker tool dispatch run record bundling evidence, telemetry and provenance. */
export interface WorkerToolDispatchRunRecord {
  provenance: WorkerToolDispatchProvenance;
  evidence: WorkerToolDispatchProbeEvidence[];
  telemetry: WorkerToolDispatchProbeRunTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<WorkerToolDispatchCategory, number>;
    byDisposition: Record<WorkerToolDispatchProbeDisposition, number>;
  };
}

export interface WorkerToolDispatchRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface WorkerToolDispatchRunValidationResult {
  valid: boolean;
  issues: WorkerToolDispatchRunValidationIssue[];
}

export function buildWorkerToolDispatchProbeEvidence(
  probeId: string,
  category: WorkerToolDispatchCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: WorkerToolDispatchProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): WorkerToolDispatchProbeEvidence {
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

export function buildWorkerToolDispatchProbeRunTelemetry(
  probeId: string,
  category: WorkerToolDispatchCategory,
  sequenceIndex: number,
  durationMs: number,
): WorkerToolDispatchProbeRunTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildWorkerToolDispatchProvenance(
  runId: string,
  fixture: WorkerToolDispatchBaseline,
  contract: WorkerToolDispatchContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly WorkerToolDispatchCategory[];
  },
): WorkerToolDispatchProvenance {
  return {
    runId,
    harnessVersion: FORGE_WORKER_TOOL_DISPATCH_VERSION,
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

export function buildWorkerToolDispatchRunRecord(
  provenance: WorkerToolDispatchProvenance,
  evidence: WorkerToolDispatchProbeEvidence[],
  telemetry: WorkerToolDispatchProbeRunTelemetry[],
): WorkerToolDispatchRunRecord {
  const byCategory = {} as Record<WorkerToolDispatchCategory, number>;
  const byDisposition: Record<WorkerToolDispatchProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of WORKER_TOOL_DISPATCH_CATEGORIES) {
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

function validateWorkerToolDispatchRunRecordAgainstProbeIds(
  record: WorkerToolDispatchRunRecord,
  expectedProbeIds: string[],
  contract: WorkerToolDispatchContract,
): WorkerToolDispatchRunValidationResult {
  const issues: WorkerToolDispatchRunValidationIssue[] = [];
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

export function validateWorkerToolDispatchRunRecord(
  record: WorkerToolDispatchRunRecord,
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): WorkerToolDispatchRunValidationResult {
  return validateWorkerToolDispatchRunRecordAgainstProbeIds(
    record,
    listWorkerToolDispatchContractProbeIds(contract),
    contract,
  );
}

/** Validate evidence slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateWorkerToolDispatchEvidenceRunRecord(
  record: WorkerToolDispatchRunRecord,
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): WorkerToolDispatchRunValidationResult {
  const issues: WorkerToolDispatchRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P05-B01-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P05-B01-A06`,
    });
  }

  const expectedCategories = [...WORKER_TOOL_DISPATCH_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateWorkerToolDispatchRunRecordAgainstProbeIds(
    record,
    listWorkerToolDispatchFailureRecoveryProbeIds(contract),
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
export function validateWorkerToolDispatchEvidenceProbeMatrix(
  results: WorkerToolDispatchProbeResult[],
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): WorkerToolDispatchProbeMatrixValidationResult {
  return validateWorkerToolDispatchFailureRecoveryProbeMatrix(results, contract);
}

export interface WorkerToolDispatchEvidenceSliceResult {
  atom: "P05-B01-A06";
  evidenceProbeCount: number;
  matrixValid: boolean;
  recordValid: boolean;
  results: WorkerToolDispatchProbeResult[];
  evidenceResults: WorkerToolDispatchProbeResult[];
  matrixValidation: WorkerToolDispatchProbeMatrixValidationResult;
  record: WorkerToolDispatchRunRecord;
  recordValidation: WorkerToolDispatchRunValidationResult;
}

function resolveWorkerToolDispatchGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function runWorkerToolDispatchProbeWithTiming(
  entry: WorkerToolDispatchFixtureEntry,
  fixture: WorkerToolDispatchBaseline,
  contractProbe:
    | { criterion: string; disposition: WorkerToolDispatchProbeDisposition }
    | undefined,
): {
  result: WorkerToolDispatchProbeResult;
  durationMs: number;
  disposition: WorkerToolDispatchProbeDisposition;
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

function buildWorkerToolDispatchRecordFromEntries(
  entries: WorkerToolDispatchFixtureEntry[],
  fixture: WorkerToolDispatchBaseline,
  contract: WorkerToolDispatchContract,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly WorkerToolDispatchCategory[];
  },
): WorkerToolDispatchRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: WorkerToolDispatchProbeEvidence[] = [];
  const telemetry: WorkerToolDispatchProbeRunTelemetry[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runWorkerToolDispatchProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildWorkerToolDispatchProbeEvidence(
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
      buildWorkerToolDispatchProbeRunTelemetry(
        result.id,
        result.category,
        sequenceIndex,
        durationMs,
      ),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildWorkerToolDispatchProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveWorkerToolDispatchGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildWorkerToolDispatchRunRecord(provenance, evidence, telemetry);
}

/** Run all worker tool dispatch probes and emit auditable evidence, telemetry and provenance (P05-B01-A06). */
export function runWorkerToolDispatchProbesWithRecord(
  fixture: WorkerToolDispatchBaseline = loadWorkerToolDispatchBaseline(),
): WorkerToolDispatchRunRecord {
  const contract = getActiveWorkerToolDispatchContract();
  return buildWorkerToolDispatchRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P05-B01-A06). */
export function runWorkerToolDispatchFailureRecoverySliceWithRecord(
  fixture: WorkerToolDispatchBaseline = loadWorkerToolDispatchBaseline(),
): WorkerToolDispatchRunRecord {
  const contract = getActiveWorkerToolDispatchContract();
  const failureRecoveryIds = new Set(listWorkerToolDispatchFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildWorkerToolDispatchRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P05-B01-A06",
    sliceCategories: WORKER_TOOL_DISPATCH_FAILURE_RECOVERY_CATEGORIES,
  });
}

/**
 * A06 evidence slice: contract-wired failure_path, recovery_path, and nogo_path probes
 * with auditable evidence, telemetry and provenance — zero unexpected mismatches.
 */
export function runWorkerToolDispatchEvidenceSlice(
  fixture: WorkerToolDispatchBaseline = loadWorkerToolDispatchBaseline(),
): WorkerToolDispatchEvidenceSliceResult {
  const contract = getActiveWorkerToolDispatchContract();
  const results = runWorkerToolDispatchProbes(fixture);
  const failureRecoveryProbes = WORKER_TOOL_DISPATCH_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listWorkerToolDispatchContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const evidenceResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateWorkerToolDispatchEvidenceProbeMatrix(results, contract);
  const record = runWorkerToolDispatchFailureRecoverySliceWithRecord(fixture);
  const recordValidation = validateWorkerToolDispatchEvidenceRunRecord(record, contract);

  return {
    atom: "P05-B01-A06",
    evidenceProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    recordValid: recordValidation.valid && record.summary.mismatches === 0,
    results,
    evidenceResults,
    matrixValidation,
    record,
    recordValidation,
  };
}

// ─── Property and fuzz validation (P05-B01-A07) ─────────────────────────────

export interface WorkerToolDispatchPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface WorkerToolDispatchPropertyResult {
  passed: number;
  failed: WorkerToolDispatchPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type WorkerToolDispatchPropertyCheck = {
  id: string;
  description: string;
  check: (contract: WorkerToolDispatchContract) => string | null;
};

const WORKER_TOOL_DISPATCH_STRUCTURAL_PROPERTIES: readonly WorkerToolDispatchPropertyCheck[] = [
  {
    id: "categories_complete",
    description: "All eight worker tool dispatch categories are declared",
    check: contract => {
      for (const category of WORKER_TOOL_DISPATCH_CATEGORIES) {
        if (!contract.categories[category]) return `missing category: ${category}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listWorkerToolDispatchContractProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each category meets contract minProbeCount",
    check: contract => {
      for (const category of WORKER_TOOL_DISPATCH_CATEGORIES) {
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
      "summarizeWorkerToolDispatchContractCoverage totals match listWorkerToolDispatchContractProbeIds",
    check: contract => {
      const summary = summarizeWorkerToolDispatchContractCoverage(contract);
      const ids = listWorkerToolDispatchContractProbeIds(contract);
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
    description: "Probe ids are namespaced with wtd. prefix",
    check: contract => {
      for (const probe of contract.probes) {
        if (!probe.id.startsWith("wtd.")) {
          return `${probe.id} missing wtd. prefix`;
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const fixture = loadWorkerToolDispatchBaseline();
      const probeIds = listWorkerToolDispatchContractProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildWorkerToolDispatchProbeEvidence(
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
        return buildWorkerToolDispatchProbeRunTelemetry(id, probe.category, index, index);
      });
      const record = buildWorkerToolDispatchRunRecord(
        buildWorkerToolDispatchProvenance(
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
      "Synthetic failure/recovery slice record passes validateWorkerToolDispatchEvidenceRunRecord",
    check: contract => {
      const fixture = loadWorkerToolDispatchBaseline();
      const probeIds = listWorkerToolDispatchFailureRecoveryProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildWorkerToolDispatchProbeEvidence(
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
        return buildWorkerToolDispatchProbeRunTelemetry(id, probe.category, index, index * 0.5);
      });
      const record = buildWorkerToolDispatchRunRecord(
        buildWorkerToolDispatchProvenance(
          "property-check-failure-recovery",
          fixture,
          contract,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:01.000Z",
          probeIds.length,
          {
            sliceAtom: "P05-B01-A06",
            sliceCategories: WORKER_TOOL_DISPATCH_FAILURE_RECOVERY_CATEGORIES,
          },
        ),
        evidence,
        telemetry,
      );
      const validation = validateWorkerToolDispatchEvidenceRunRecord(record, contract);
      if (!validation.valid) {
        return validation.issues.map(i => i.detail).join("; ");
      }
      return null;
    },
  },
] as const;

export function runWorkerToolDispatchPropertyValidation(
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): WorkerToolDispatchPropertyResult {
  const failed: WorkerToolDispatchPropertyViolation[] = [];
  for (const property of WORKER_TOOL_DISPATCH_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = WORKER_TOOL_DISPATCH_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type WorkerToolDispatchFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface WorkerToolDispatchFuzzMutationCase {
  seed: number;
  kind: WorkerToolDispatchFuzzMutationKind;
  probeId?: string;
  category?: WorkerToolDispatchCategory;
}

export interface WorkerToolDispatchFuzzValidationCaseResult {
  mutation: WorkerToolDispatchFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface WorkerToolDispatchFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: WorkerToolDispatchFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createWorkerToolDispatchFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneWorkerToolDispatchBaseline(
  fixture: WorkerToolDispatchBaseline,
): WorkerToolDispatchBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickWorkerToolDispatchFuzzTarget(
  fixture: WorkerToolDispatchBaseline,
  rng: () => number,
): {
  category: WorkerToolDispatchCategory;
  index: number;
  entry: WorkerToolDispatchFixtureEntry;
} {
  const category =
    WORKER_TOOL_DISPATCH_CATEGORIES[
      Math.floor(rng() * WORKER_TOOL_DISPATCH_CATEGORIES.length)
    ]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyWorkerToolDispatchFuzzMutation(
  fixture: WorkerToolDispatchBaseline,
  mutation: WorkerToolDispatchFuzzMutationCase,
): WorkerToolDispatchBaseline {
  const mutated = cloneWorkerToolDispatchBaseline(fixture);
  const targetCategory = mutation.category ?? WORKER_TOOL_DISPATCH_CATEGORIES[0]!;
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
          id: `wtd.fuzz.extra.${mutation.seed}`,
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
      const other = WORKER_TOOL_DISPATCH_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateWorkerToolDispatchFuzzMutationCases(
  fixture: WorkerToolDispatchBaseline,
  seed: number,
  iterations: number,
): WorkerToolDispatchFuzzMutationCase[] {
  const rng = createWorkerToolDispatchFuzzRng(seed);
  const kinds: WorkerToolDispatchFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: WorkerToolDispatchFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickWorkerToolDispatchFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P05-B01-A07). */
export function runWorkerToolDispatchFuzzValidation(
  fixture: WorkerToolDispatchBaseline,
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
  seed = 42,
  iterations = 24,
): WorkerToolDispatchFuzzValidationResult {
  const cases = generateWorkerToolDispatchFuzzMutationCases(fixture, seed, iterations);
  const results: WorkerToolDispatchFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyWorkerToolDispatchFuzzMutation(fixture, mutation);
    const validation = validateWorkerToolDispatchAgainstContract(mutated, contract);
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

export type WorkerToolDispatchRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface WorkerToolDispatchRunRecordFuzzCase {
  kind: WorkerToolDispatchRunRecordFuzzKind;
  probeId?: string;
}

export function applyWorkerToolDispatchRunRecordFuzzMutation(
  record: WorkerToolDispatchRunRecord,
  mutation: WorkerToolDispatchRunRecordFuzzCase,
): WorkerToolDispatchRunRecord {
  const cloned: WorkerToolDispatchRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P05-B01-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["dispatch_versioning"],
      };
      break;
  }

  cloned.summary = buildWorkerToolDispatchRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveWorkerToolDispatchRunRecordValidator(
  record: WorkerToolDispatchRunRecord,
): (
  record: WorkerToolDispatchRunRecord,
  contract: WorkerToolDispatchContract,
) => WorkerToolDispatchRunValidationResult {
  return record.provenance.sliceAtom === "P05-B01-A06"
    ? validateWorkerToolDispatchEvidenceRunRecord
    : validateWorkerToolDispatchRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P05-B01-A07). */
export function runWorkerToolDispatchRunRecordFuzzValidation(
  record: WorkerToolDispatchRunRecord,
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveWorkerToolDispatchRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: WorkerToolDispatchRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P05-B01-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyWorkerToolDispatchRunRecordFuzzMutation(record, mutation);
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

export interface WorkerToolDispatchPropertyFuzzSliceResult {
  atom: "P05-B01-A07";
  propertyChecksPassed: boolean;
  contractFuzzRejected: boolean;
  runRecordFuzzRejected: boolean;
  propertyResult: WorkerToolDispatchPropertyResult;
  contractFuzz: WorkerToolDispatchFuzzValidationResult;
  runRecordFuzz: {
    validBaseline: boolean;
    mutationsRejected: number;
    mutationsAccepted: number;
  };
}

export interface WorkerToolDispatchPropertyProbeMatrixValidationResult {
  valid: boolean;
  issues: WorkerToolDispatchProbeMatrixValidationIssue[];
  propertyChecksAligned: number;
  fuzzMutationsAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate property_checks + fuzz_mutations against the A07 contract matrix —
 * all structural properties pass and zero fuzz mutations accepted.
 */
export function validateWorkerToolDispatchPropertyProbeMatrix(
  slice: WorkerToolDispatchPropertyFuzzSliceResult,
): WorkerToolDispatchPropertyProbeMatrixValidationResult {
  const issues: WorkerToolDispatchProbeMatrixValidationIssue[] = [];
  let propertyChecksAligned = 0;
  let fuzzMutationsAligned = 0;
  let unexpectedMismatches = 0;

  if (slice.atom !== "P05-B01-A07") {
    issues.push({
      kind: "pass_mismatch",
      detail: `slice atom=${slice.atom} expected=P05-B01-A07`,
    });
    unexpectedMismatches++;
  }

  for (const property of WORKER_TOOL_DISPATCH_STRUCTURAL_PROPERTIES) {
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
export function runWorkerToolDispatchPropertyFuzzSlice(
  fixture: WorkerToolDispatchBaseline = loadWorkerToolDispatchBaseline(),
): WorkerToolDispatchPropertyFuzzSliceResult {
  const contract = getActiveWorkerToolDispatchContract();
  const propertyResult = runWorkerToolDispatchPropertyValidation(contract);
  const contractFuzz = runWorkerToolDispatchFuzzValidation(fixture, contract);
  const record = runWorkerToolDispatchFailureRecoverySliceWithRecord(fixture);
  const runRecordFuzz = runWorkerToolDispatchRunRecordFuzzValidation(record, contract);

  return {
    atom: "P05-B01-A07",
    propertyChecksPassed: propertyResult.allPassed,
    contractFuzzRejected: contractFuzz.allMutationsRejected,
    runRecordFuzzRejected: runRecordFuzz.mutationsAccepted === 0,
    propertyResult,
    contractFuzz,
    runRecordFuzz,
  };
}

// ─── Forge integration regression (P05-B01-A08) ─────────────────────────────

export interface WorkerToolDispatchProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare worker tool dispatch run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectWorkerToolDispatchProbeRegression(
  prior: WorkerToolDispatchRunRecord,
  current: WorkerToolDispatchRunRecord,
): WorkerToolDispatchProbeRegressionReport {
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

export interface WorkerToolDispatchIntegrationSliceResult {
  atom: "P05-B01-A08";
  passed: boolean;
  productionSlice: WorkerToolDispatchProductionSliceResult;
  boundarySlice: WorkerToolDispatchBoundarySliceResult;
  failureRecoverySlice: WorkerToolDispatchFailureRecoverySliceResult;
  evidenceSlice: WorkerToolDispatchEvidenceSliceResult;
  propertyFuzzSlice: WorkerToolDispatchPropertyFuzzSliceResult;
  record: WorkerToolDispatchRunRecord;
  recordValid: boolean;
  priorRecordValid: boolean;
  validationIssues: string[];
  priorValidationIssues: string[];
  probeRegression: WorkerToolDispatchProbeRegressionReport | null;
  guard: WorkerToolDispatchGuardCheckResult;
  matrixValid: boolean;
  matrixValidation: WorkerToolDispatchIntegrationProbeMatrixValidationResult;
  detail: string;
}

export interface WorkerToolDispatchIntegrationProbeMatrixValidationResult {
  valid: boolean;
  issues: WorkerToolDispatchProbeMatrixValidationIssue[];
  slicesAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate integration slice sub-gates — all prior A03–A07 slices with zero unexpected mismatches.
 */
export function validateWorkerToolDispatchIntegrationProbeMatrix(
  slice: WorkerToolDispatchIntegrationSliceResult,
): WorkerToolDispatchIntegrationProbeMatrixValidationResult {
  const issues: WorkerToolDispatchProbeMatrixValidationIssue[] = [];
  let slicesAligned = 0;
  let unexpectedMismatches = 0;

  if (slice.atom !== "P05-B01-A08") {
    issues.push({
      kind: "pass_mismatch",
      detail: `slice atom=${slice.atom} expected=P05-B01-A08`,
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
export function runWorkerToolDispatchIntegrationSlice(
  priorRecord?: WorkerToolDispatchRunRecord,
): WorkerToolDispatchIntegrationSliceResult {
  const fixture = loadWorkerToolDispatchBaseline();
  const contract = getActiveWorkerToolDispatchContract();
  const productionSlice = runWorkerToolDispatchProductionSlice(fixture);
  const boundarySlice = runWorkerToolDispatchBoundarySlice(fixture);
  const failureRecoverySlice = runWorkerToolDispatchFailureRecoverySlice(fixture);
  const evidenceSlice = runWorkerToolDispatchEvidenceSlice(fixture);
  const propertyFuzzSlice = runWorkerToolDispatchPropertyFuzzSlice(fixture);
  const record = runWorkerToolDispatchProbesWithRecord(fixture);
  const validation = validateWorkerToolDispatchRunRecord(record, contract);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  let priorRecordValid = true;
  let priorValidationIssues: string[] = [];
  if (priorRecord) {
    const priorValidation = validateWorkerToolDispatchRunRecord(priorRecord, contract);
    priorRecordValid = priorValidation.valid && priorRecord.summary.mismatches === 0;
    priorValidationIssues = priorValidation.issues.map(issue => issue.detail);
  }

  const probeRegression = priorRecord
    ? detectWorkerToolDispatchProbeRegression(priorRecord, record)
    : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;
  const guard = validateForgeWorkerToolDispatchGuard(record, {
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

  const partial: WorkerToolDispatchIntegrationSliceResult = {
    atom: "P05-B01-A08",
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

  const matrixValidation = validateWorkerToolDispatchIntegrationProbeMatrix(partial);
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

/** Alias for forge-pipeline-regression integration seam (P05-B01-A08). */
export const runWorkerToolDispatchRegressionIntegration = runWorkerToolDispatchIntegrationSlice;

// ─── Guard controls (P05-B01-A09) ─────────────────────────────────────────────

export interface ForgeWorkerToolDispatchGuardControls {
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

export interface WorkerToolDispatchGuardCheckIssue {
  domain: "adversarial" | "performance" | "cost" | "safety";
  code: string;
  detail: string;
}

export interface WorkerToolDispatchGuardCheckResult {
  passed: boolean;
  issues: WorkerToolDispatchGuardCheckIssue[];
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

export interface WorkerToolDispatchAdversarialGuardScenario {
  id: string;
  description: string;
  build: (record: WorkerToolDispatchRunRecord) => WorkerToolDispatchRunRecord;
  expectRejected: true;
}

export interface WorkerToolDispatchGuardSliceResult {
  atom: "P05-B01-A09";
  passed: boolean;
  record: WorkerToolDispatchRunRecord;
  guard: WorkerToolDispatchGuardCheckResult;
  detail: string;
}

export const FORGE_WORKER_TOOL_DISPATCH_GUARD_CONTROLS_V1: ForgeWorkerToolDispatchGuardControls = {
  atom: "P05-B01-A09",
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

export function getForgeWorkerToolDispatchGuardControls(): ForgeWorkerToolDispatchGuardControls {
  return FORGE_WORKER_TOOL_DISPATCH_GUARD_CONTROLS_V1;
}

function parseWorkerToolDispatchIsoDurationMs(startedAt: string, completedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function summarizeWorkerToolDispatchTelemetry(
  telemetry: WorkerToolDispatchProbeRunTelemetry[],
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

export function detectWorkerToolDispatchEvidenceSummaryMismatch(
  record: WorkerToolDispatchRunRecord,
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

export function detectWorkerToolDispatchFalseAlignment(
  record: WorkerToolDispatchRunRecord,
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

export function validateWorkerToolDispatchSafety(
  record: WorkerToolDispatchRunRecord,
  controls: ForgeWorkerToolDispatchGuardControls = getForgeWorkerToolDispatchGuardControls(),
): WorkerToolDispatchGuardCheckIssue[] {
  const issues: WorkerToolDispatchGuardCheckIssue[] = [];
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

export function validateWorkerToolDispatchPerformance(
  record: WorkerToolDispatchRunRecord,
  controls: ForgeWorkerToolDispatchGuardControls = getForgeWorkerToolDispatchGuardControls(),
): WorkerToolDispatchGuardCheckIssue[] {
  const issues: WorkerToolDispatchGuardCheckIssue[] = [];
  const { suiteDurationMs, maxProbeDurationMs } = summarizeWorkerToolDispatchTelemetry(
    record.telemetry,
  );
  const wallClockMs = parseWorkerToolDispatchIsoDurationMs(
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

export function validateWorkerToolDispatchCost(
  totalCostUsd: number,
  llmCalls: number,
  controls: ForgeWorkerToolDispatchGuardControls = getForgeWorkerToolDispatchGuardControls(),
): WorkerToolDispatchGuardCheckIssue[] {
  const issues: WorkerToolDispatchGuardCheckIssue[] = [];
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

export function buildWorkerToolDispatchAdversarialGuardScenarios(): WorkerToolDispatchAdversarialGuardScenario[] {
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

export function runWorkerToolDispatchAdversarialGuardChecks(
  fixtureRecord: WorkerToolDispatchRunRecord,
  contract: WorkerToolDispatchContract = getActiveWorkerToolDispatchContract(),
): { rejected: number; total: number; failures: string[] } {
  const scenarios = buildWorkerToolDispatchAdversarialGuardScenarios();
  const failures: string[] = [];
  let rejected = 0;

  for (const scenario of scenarios) {
    const tampered = scenario.build(fixtureRecord);
    const validation = validateWorkerToolDispatchRunRecord(tampered, contract);
    const falseAlignment = detectWorkerToolDispatchFalseAlignment(tampered);
    const summaryMismatch = detectWorkerToolDispatchEvidenceSummaryMismatch(tampered);
    const rejectedByGuard =
      !validation.valid || falseAlignment.length > 0 || summaryMismatch !== null;

    if (rejectedByGuard) rejected++;
    else failures.push(`${scenario.id}: tampered record was not rejected`);
  }

  return { rejected, total: scenarios.length, failures };
}

export function validateForgeWorkerToolDispatchGuard(
  record: WorkerToolDispatchRunRecord,
  options: {
    totalCostUsd?: number;
    llmCalls?: number;
    contract?: WorkerToolDispatchContract;
    controls?: ForgeWorkerToolDispatchGuardControls;
  } = {},
): WorkerToolDispatchGuardCheckResult {
  const controls = options.controls ?? getForgeWorkerToolDispatchGuardControls();
  const contract = options.contract ?? getActiveWorkerToolDispatchContract();
  const totalCostUsd = options.totalCostUsd ?? 0;
  const llmCalls = options.llmCalls ?? 0;
  const issues: WorkerToolDispatchGuardCheckIssue[] = [];

  issues.push(...validateWorkerToolDispatchPerformance(record, controls));
  issues.push(...validateWorkerToolDispatchCost(totalCostUsd, llmCalls, controls));
  issues.push(...validateWorkerToolDispatchSafety(record, controls));

  const falseAlignment = detectWorkerToolDispatchFalseAlignment(record);
  if (falseAlignment.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "false_alignment",
      detail: falseAlignment.join("; "),
    });
  }
  const summaryMismatch = detectWorkerToolDispatchEvidenceSummaryMismatch(record);
  if (summaryMismatch) {
    issues.push({
      domain: "adversarial",
      code: "summary_evidence_mismatch",
      detail: summaryMismatch,
    });
  }

  const adversarial = runWorkerToolDispatchAdversarialGuardChecks(record, contract);
  if (adversarial.failures.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "scenario_not_rejected",
      detail: adversarial.failures.join("; "),
    });
  }

  const telemetrySummary = summarizeWorkerToolDispatchTelemetry(record.telemetry);
  const wallClockMs = parseWorkerToolDispatchIsoDurationMs(
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
export function runWorkerToolDispatchGuardSlice(): WorkerToolDispatchGuardSliceResult {
  const record = runWorkerToolDispatchProbesWithRecord();
  const contract = getActiveWorkerToolDispatchContract();
  const guard = validateForgeWorkerToolDispatchGuard(record, {
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
    atom: "P05-B01-A09",
    passed,
    record,
    guard,
    detail: detailParts.join(" | "),
  };
}

/** Smoke probe: unknown tool dispatch returns deterministic error (P05-B01-A01 boundary). */
export async function probeUnknownToolDispatchError(): Promise<boolean> {
  const tempRoot = mkdtempSync(join(tmpdir(), "foreman-wtd-"));
  try {
    const executor = createToolExecutor(tempRoot);
    const result = await executor({ name: "__nonexistent_foreman_tool__", args: {} });
    return result.isError === true && result.content.includes("Unknown tool");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
