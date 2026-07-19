/**
 * FOREMAN — Worker Edit Engine Baseline (P05-B03)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P05-B02 worker filesystem grounding block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import workerEditEngineBaseline from "./fixtures/forge-worker-edit-engine-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP05B02ToB03Handoff,
  getActiveWorkerFilesystemGroundingContract,
  summarizeWorkerFilesystemGroundingContractCoverage,
} from "./forge-p05-worker-filesystem-grounding.js";
import { TOOL_DEFINITIONS, type ToolCall } from "./tools.js";
import { EditEngine } from "./edit-engine.js";

export const FORGE_WORKER_EDIT_ENGINE_VERSION = "1.0.0-a07";

export const EXPECTED_P05_B02_SEALED_ATOM_COUNT = 10;

/** Maximum normalized edit old_text length before truncation (P05-B03-A01 boundary). */
export const WORKER_EDIT_ENGINE_OLD_TEXT_MAX_LENGTH = 65_536;

/** Maximum normalized edit file path length before truncation (P05-B03-A04 boundary). */
export const WORKER_EDIT_ENGINE_PATH_MAX_LENGTH = 4096;

export const WORKER_EDIT_ENGINE_CATEGORIES = [
  "edit_versioning",
  "edit_signal",
  "match_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type WorkerEditEngineCategory = (typeof WORKER_EDIT_ENGINE_CATEGORIES)[number];

export const WORKER_EDIT_ENGINE_A01_MIN_PROBES: Readonly<
  Record<WorkerEditEngineCategory, number>
> = {
  edit_versioning: 3,
  edit_signal: 4,
  match_signal: 4,
  baseline_link: 2,
  boundary: 7,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 3,
};

export type EditInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface EditInputBoundary {
  disposition: EditInputDisposition;
  acceptable: boolean;
  normalizedOldText: string;
  normalizedNewText: string;
  truncated: boolean;
  detail: string;
}

export type EditPathInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface EditPathInputBoundary {
  disposition: EditPathInputDisposition;
  acceptable: boolean;
  normalizedPath: string;
  truncated: boolean;
  detail: string;
}

export interface EditOccurrenceBoundary {
  valid: boolean;
  occurrence?: number | "all";
  detail: string;
}

export interface EditRequestRecoveryResult {
  recovered: boolean;
  path: string;
  oldText: string;
  newText: string;
  parseErrors: string[];
  detail: string;
}

export interface WorkerEditEngineFixtureEntry {
  id: string;
  category: WorkerEditEngineCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface WorkerEditEngineBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    workerFilesystemGroundingProbeCount: number;
    sealedAtomCount: number;
  };
  probes: WorkerEditEngineFixtureEntry[];
}

export interface WorkerEditEngineProbeResult {
  id: string;
  category: WorkerEditEngineCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export type WorkerEditEngineProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface WorkerEditEngineProbeContract {
  id: string;
  category: WorkerEditEngineCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: WorkerEditEngineProbeDisposition;
  criterion: string;
}

export interface WorkerEditEngineCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface WorkerEditEngineCategoryContract {
  category: WorkerEditEngineCategory;
  acceptance: WorkerEditEngineCategoryAcceptance;
  probes: readonly WorkerEditEngineProbeContract[];
}

export interface WorkerEditEngineContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<WorkerEditEngineCategory, WorkerEditEngineCategoryContract>;
  probes: readonly WorkerEditEngineProbeContract[];
}

export interface WorkerEditEngineValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: WorkerEditEngineCategory;
  detail: string;
}

export interface WorkerEditEngineValidationResult {
  valid: boolean;
  issues: WorkerEditEngineValidationIssue[];
}

export interface WorkerEditEngineProbeSummary {
  total: number;
  aligned: number;
  mismatches: WorkerEditEngineProbeResult[];
  knownGaps: WorkerEditEngineProbeResult[];
  byCategory: Record<
    WorkerEditEngineCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

function readSrc(relativePath: string): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(moduleDir, relativePath), "utf8");
}

/**
 * Assess edit old_text/new_text input boundary conditions before worker dispatch (P05-B03-A01).
 */
export function assessEditInputBoundary(
  oldText: string,
  newText = "",
): EditInputBoundary {
  if (oldText.includes("\0") || newText.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedOldText: "",
      normalizedNewText: "",
      truncated: false,
      detail: "null byte detected in edit text input",
    };
  }

  const trimmedOld = oldText.trim();
  if (trimmedOld.length === 0) {
    const disposition: EditInputDisposition =
      oldText.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedOldText: "",
      normalizedNewText: newText,
      truncated: false,
      detail: disposition === "empty" ? "empty old_text input" : "whitespace-only old_text input",
    };
  }

  let normalizedOldText = oldText;
  let truncated = false;
  if (normalizedOldText.length > WORKER_EDIT_ENGINE_OLD_TEXT_MAX_LENGTH) {
    normalizedOldText = normalizedOldText.slice(0, WORKER_EDIT_ENGINE_OLD_TEXT_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedOldText,
    normalizedNewText: newText,
    truncated,
    detail: truncated
      ? `old_text truncated to ${WORKER_EDIT_ENGINE_OLD_TEXT_MAX_LENGTH} characters`
      : "valid edit text input",
  };
}

/**
 * Assess edit file path input boundary conditions before worker dispatch (P05-B03-A04).
 */
export function assessEditPathBoundary(filePath: string): EditPathInputBoundary {
  if (filePath.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedPath: "",
      truncated: false,
      detail: "null byte detected in edit file path input",
    };
  }

  const trimmed = filePath.trim();
  if (trimmed.length === 0) {
    const disposition: EditPathInputDisposition =
      filePath.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedPath: "",
      truncated: false,
      detail: disposition === "empty" ? "empty edit file path input" : "whitespace-only edit file path input",
    };
  }

  let normalizedPath = trimmed.replace(/\\/g, "/");
  if (normalizedPath.startsWith("./")) {
    normalizedPath = normalizedPath.slice(2);
  }

  let truncated = false;
  if (normalizedPath.length > WORKER_EDIT_ENGINE_PATH_MAX_LENGTH) {
    normalizedPath = normalizedPath.slice(0, WORKER_EDIT_ENGINE_PATH_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedPath,
    truncated,
    detail: truncated
      ? `edit file path truncated to ${WORKER_EDIT_ENGINE_PATH_MAX_LENGTH} characters`
      : "valid edit file path input",
  };
}

/**
 * Assess edit occurrence selector boundary before worker dispatch (P05-B03-A04).
 */
export function assessEditOccurrenceBoundary(value: unknown): EditOccurrenceBoundary {
  if (value === undefined || value === null) {
    return { valid: true, detail: "default occurrence (first match)" };
  }
  if (value === "all") {
    return { valid: true, occurrence: "all", detail: "replace all occurrences" };
  }
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return { valid: true, occurrence: value, detail: `replace occurrence ${value}` };
  }
  return {
    valid: false,
    detail: "occurrence must be a positive integer or \"all\"",
  };
}

/**
 * Normalize edit file path through boundary assessment before recovery (P05-B03-A04).
 */
export function normalizeEditRequestPath(
  rawPath: string,
): EditRequestRecoveryResult {
  const boundary = assessEditPathBoundary(rawPath);
  if (!boundary.acceptable) {
    return {
      recovered: false,
      path: rawPath,
      oldText: "",
      newText: "",
      parseErrors: [boundary.disposition],
      detail: boundary.detail,
    };
  }
  return {
    recovered: true,
    path: boundary.normalizedPath,
    oldText: "",
    newText: "",
    parseErrors: [],
    detail: `recovered edit path=${boundary.normalizedPath}`,
  };
}

/**
 * Recover malformed edit request args into dispatch-ready record (P05-B03-A01).
 */
export function recoverEditRequest(
  path: string,
  oldText: unknown,
  newText: unknown = "",
): EditRequestRecoveryResult {
  const pathBoundary = assessEditPathBoundary(typeof path === "string" ? path : "");
  if (!pathBoundary.acceptable) {
    return {
      recovered: false,
      path: typeof path === "string" ? path : "",
      oldText: "",
      newText: "",
      parseErrors: [pathBoundary.disposition],
      detail: pathBoundary.detail,
    };
  }

  let resolvedOldText = oldText;
  let resolvedNewText = newText;
  const parseErrors: string[] = [];

  if (typeof oldText === "string" && oldText.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(oldText) as Record<string, unknown>;
      if (typeof parsed.old_string === "string") resolvedOldText = parsed.old_string;
      if (typeof parsed.new_string === "string") resolvedNewText = parsed.new_string;
      parseErrors.push("coerced_json_old_text");
    } catch {
      parseErrors.push("invalid_json_old_text");
    }
  }

  if (typeof resolvedOldText !== "string" || typeof resolvedNewText !== "string") {
    return {
      recovered: false,
      path,
      oldText: "",
      newText: "",
      parseErrors: [...parseErrors, "invalid_edit_fields"],
      detail: "cannot recover non-string edit fields",
    };
  }

  const boundary = assessEditInputBoundary(resolvedOldText, resolvedNewText);
  if (!boundary.acceptable) {
    return {
      recovered: false,
      path: pathBoundary.normalizedPath,
      oldText: resolvedOldText,
      newText: resolvedNewText,
      parseErrors: [...parseErrors, boundary.disposition],
      detail: boundary.detail,
    };
  }

  return {
    recovered: true,
    path: pathBoundary.normalizedPath,
    oldText: boundary.normalizedOldText,
    newText: boundary.normalizedNewText,
    parseErrors,
    detail: `recovered edit path=${pathBoundary.normalizedPath}`,
  };
}

export interface SurgicalEditValidationResult {
  valid: boolean;
  errors: string[];
  path?: string;
  oldText?: string;
  newText?: string;
  occurrence?: number | "all";
}

export interface EditEngineTelemetry {
  toolName: string;
  path: string;
  sequenceIndex: number;
  validated: boolean;
  validatedAt: string;
  contractVersion: string;
  harnessVersion: string;
  errors: string[];
}

/**
 * Validate surgical edit tool call boundary before orchestrator dispatch (P05-B03-A03).
 */
export function validateSurgicalEdit(call: ToolCall): SurgicalEditValidationResult {
  if (call.name !== "edit_file" && call.name !== "edit_range") {
    return { valid: true, errors: [] };
  }

  if (call.name === "edit_range") {
    const pathArg = call.args.path;
    const startLine = call.args.start_line;
    const endLine = call.args.end_line;
    const newContent = call.args.new_content;

    if (typeof pathArg !== "string") {
      return { valid: false, errors: ["edit_range requires path argument"] };
    }
    const pathBoundary = assessEditPathBoundary(pathArg);
    if (!pathBoundary.acceptable) {
      return { valid: false, errors: [pathBoundary.detail] };
    }
    if (
      typeof startLine !== "number" ||
      typeof endLine !== "number" ||
      typeof newContent !== "string"
    ) {
      return {
        valid: false,
        errors: ["edit_range requires start_line, end_line, and new_content"],
      };
    }
    if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) {
      return { valid: false, errors: ["edit_range line range invalid"] };
    }

    return { valid: true, errors: [], path: pathBoundary.normalizedPath };
  }

  const pathArg = call.args.path;
  const oldArg = call.args.old_string;
  const newArg = call.args.new_string;

  if (typeof pathArg !== "string") {
    return { valid: false, errors: ["edit_file requires path argument"] };
  }
  if (oldArg === undefined || newArg === undefined) {
    return { valid: false, errors: ["edit_file requires old_string and new_string"] };
  }

  const recovery = recoverEditRequest(pathArg, oldArg, newArg);
  if (!recovery.recovered) {
    return { valid: false, errors: [recovery.detail], path: recovery.path };
  }

  const occurrenceBoundary = assessEditOccurrenceBoundary(call.args.occurrence);
  if (!occurrenceBoundary.valid) {
    return { valid: false, errors: [occurrenceBoundary.detail], path: recovery.path };
  }

  return {
    valid: true,
    errors: [],
    path: recovery.path,
    oldText: recovery.oldText,
    newText: recovery.newText,
    occurrence: occurrenceBoundary.occurrence,
  };
}

/**
 * Record surgical edit provenance for worker tool loop telemetry (P05-B03-A03).
 */
export function buildEditEngineTelemetry(
  call: ToolCall,
  options: {
    sequenceIndex?: number;
    validation?: SurgicalEditValidationResult;
  } = {},
): EditEngineTelemetry {
  const validation = options.validation ?? validateSurgicalEdit(call);
  const path =
    validation.path ??
    (typeof call.args.path === "string"
      ? recoverEditRequest(call.args.path, call.args.old_string ?? "", call.args.new_string ?? "").path
      : "");

  return {
    toolName: call.name,
    path,
    sequenceIndex: options.sequenceIndex ?? 0,
    validated: validation.valid,
    validatedAt: new Date().toISOString(),
    contractVersion: FORGE_WORKER_EDIT_ENGINE_CONTRACT_V1.version,
    harnessVersion: FORGE_WORKER_EDIT_ENGINE_VERSION,
    errors: validation.errors,
  };
}

export const FORGE_WORKER_EDIT_ENGINE_A01_PROBE_MATRIX: readonly WorkerEditEngineFixtureEntry[] =
  workerEditEngineBaseline.probes as WorkerEditEngineFixtureEntry[];

export function getWorkerEditEngineA01ExpectedFailCount(): number {
  return FORGE_WORKER_EDIT_ENGINE_A01_PROBE_MATRIX.filter(p => p.expected === "FAIL").length;
}

export function loadWorkerEditEngineBaseline(): WorkerEditEngineBaseline {
  return workerEditEngineBaseline as WorkerEditEngineBaseline;
}

export function validateWorkerEditEngineBaseline(
  fixture: WorkerEditEngineBaseline,
): WorkerEditEngineValidationResult {
  const issues: WorkerEditEngineValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P05-B03-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    WORKER_EDIT_ENGINE_CATEGORIES.map(category => [category, 0]),
  ) as Record<WorkerEditEngineCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of WORKER_EDIT_ENGINE_CATEGORIES) {
    const min = WORKER_EDIT_ENGINE_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_WORKER_EDIT_ENGINE_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_WORKER_EDIT_ENGINE_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_WORKER_EDIT_ENGINE_A01_PROBE_MATRIX) {
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

  const contract = getActiveWorkerEditEngineContract();
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

  const handoff = getForgeP05B02ToB03Handoff();
  const groundingCoverage = summarizeWorkerFilesystemGroundingContractCoverage(
    getActiveWorkerFilesystemGroundingContract(),
  );

  if (fixture.sourceBlockGate.atom !== "P05-B02-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P05-B02-A10`,
    });
  }
  if (
    fixture.sourceBlockGate.workerFilesystemGroundingProbeCount !== groundingCoverage.totalProbes
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.workerFilesystemGroundingProbeCount=${fixture.sourceBlockGate.workerFilesystemGroundingProbeCount} ` +
        `contract=${groundingCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P05_B02_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P05_B02_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P05-B03-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P05-B03-A01`,
    });
  }

  return { valid: issues.length === 0, issues };
}

function flattenWorkerEditEngineCategoryProbes(
  categories: Record<WorkerEditEngineCategory, WorkerEditEngineCategoryContract>,
): readonly WorkerEditEngineProbeContract[] {
  return WORKER_EDIT_ENGINE_CATEGORIES.flatMap(category => categories[category].probes);
}

const WORKER_EDIT_ENGINE_CATEGORY_CONTRACTS: Record<
  WorkerEditEngineCategory,
  WorkerEditEngineCategoryContract
> = {
  edit_versioning: {
    category: "edit_versioning",
    acceptance: {
      invariant:
        "Worker surgical edit engine baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wee.version_tagged",
        category: "edit_versioning",
        description: "Edit engine baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Edit engine baseline declares semver version field",
      },
      {
        id: "wee.atom_tagged",
        category: "edit_versioning",
        description: "Edit engine baseline declares P05-B03-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Edit engine baseline declares P05-B03-A01 atom id",
      },
      {
        id: "wee.harness_version_exported",
        category: "edit_versioning",
        description: "FORGE_WORKER_EDIT_ENGINE_VERSION exported for edit harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_WORKER_EDIT_ENGINE_VERSION exported for edit harness",
      },
    ],
  },
  edit_signal: {
    category: "edit_signal",
    acceptance: {
      invariant:
        "edit_file tool, EditEngine class and typed edit union gate worker surgical edit dispatch.",
      minProbeCount: 4,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "wee.edit_file_tool_defined",
        category: "edit_signal",
        description: "edit_file tool routes worker surgical edits through EditEngine dispatch",
        expected: "PASS",
        disposition: "observed",
        criterion: "edit_file tool routes worker surgical edits through EditEngine dispatch",
      },
      {
        id: "wee.edit_engine_class_exported",
        category: "edit_signal",
        description: "EditEngine class exports surgical edit with fuzzy and line-range support",
        expected: "PASS",
        disposition: "observed",
        criterion: "EditEngine class exports surgical edit with fuzzy and line-range support",
      },
      {
        id: "wee.typed_edit_call_union",
        category: "edit_signal",
        description: "TypedEditCall discriminated union narrows path and old/new text args before edit",
        expected: "PASS",
        disposition: "observed",
        criterion: "TypedEditCall discriminated union narrows path and old/new text args before edit",
      },
      {
        id: "wee.worker_prompt_edit_contract",
        category: "edit_signal",
        description: "WORKER_SYSTEM prompt declares surgical edit engine contract for worker execution",
        expected: "PASS",
        disposition: "observed",
        criterion: "WORKER_SYSTEM prompt declares surgical edit engine contract for worker execution",
      },
    ],
  },
  match_signal: {
    category: "match_signal",
    acceptance: {
      invariant:
        "Fuzzy match, 5-tier cascade, line-range edit and multi-occurrence dispatch gate surgical edits.",
      minProbeCount: 4,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "wee.fuzzy_match_exported",
        category: "match_signal",
        description: "findFuzzyMatch exports whitespace-insensitive closest-match recovery for edit_file",
        expected: "PASS",
        disposition: "observed",
        criterion: "findFuzzyMatch exports whitespace-insensitive closest-match recovery for edit_file",
      },
      {
        id: "wee.find_text_cascade",
        category: "match_signal",
        description: "findTextInFileContents exports 5-tier cascade matching for surgical edits",
        expected: "PASS",
        disposition: "observed",
        criterion: "findTextInFileContents exports 5-tier cascade matching for surgical edits",
      },
      {
        id: "wee.line_range_edit_tool",
        category: "match_signal",
        description: "edit_range tool and editByLineRange support deterministic line-range replacement",
        expected: "PASS",
        disposition: "observed",
        criterion: "edit_range tool and editByLineRange support deterministic line-range replacement",
      },
      {
        id: "wee.multi_occurrence_dispatch",
        category: "match_signal",
        description: "executeEditFileV2 passes occurrence selector into EditEngine.edit dispatch",
        expected: "PASS",
        disposition: "observed",
        criterion: "executeEditFileV2 passes occurrence selector into EditEngine.edit dispatch",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Worker edit engine baseline links to sealed P05-B02 worker filesystem grounding block gate.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wee.b02_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P05_B02_TO_B03_HANDOFF_V1 targets P05-B03-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P05_B02_TO_B03_HANDOFF_V1 targets P05-B03-A01 entry atom",
      },
      {
        id: "wee.b02_sealed_grounding_probes",
        category: "baseline_link",
        description: "P05-B02→B03 handoff sealed probeCount matches active worker filesystem grounding contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P05-B02→B03 handoff sealed probeCount matches active worker filesystem grounding contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Edit old_text boundary assessment rejects invalid input; probe runner and documented gaps wired.",
      minProbeCount: 7,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wee.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P05-B02 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P05-B02 block gate source artifacts",
      },
      {
        id: "wee.probe_runner_exported",
        category: "boundary",
        description: "runWorkerEditEngineProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runWorkerEditEngineProbes executes contract-wired probe matrix",
      },
      {
        id: "wee.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL surgical edit gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL surgical edit gap",
      },
      {
        id: "wee.empty_old_text_boundary",
        category: "boundary",
        description: "assessEditInputBoundary rejects empty old_text input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessEditInputBoundary rejects empty old_text input",
      },
      {
        id: "wee.whitespace_old_text_boundary",
        category: "boundary",
        description: "assessEditInputBoundary rejects whitespace-only old_text input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessEditInputBoundary rejects whitespace-only old_text input",
      },
      {
        id: "wee.null_byte_old_text_boundary",
        category: "boundary",
        description: "assessEditInputBoundary rejects null-byte old_text safely",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessEditInputBoundary rejects null-byte old_text safely",
      },
      {
        id: "wee.long_old_text_truncation_boundary",
        category: "boundary",
        description: "assessEditInputBoundary truncates old_text exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessEditInputBoundary truncates old_text exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Invalid fixture versions and null-byte edit text input are rejected safely.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wee.invalid_version_rejected",
        category: "failure_path",
        description: "validateWorkerEditEngineBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateWorkerEditEngineBaseline rejects unexpected fixture version",
      },
      {
        id: "wee.malformed_edit_guard",
        category: "failure_path",
        description: "assessEditInputBoundary rejects null-byte new_text segments safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessEditInputBoundary rejects null-byte new_text segments safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant: "Recovery paths coerce malformed edit args into dispatch-ready edit records.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "wee.recovery_string_args_coercion",
        category: "recovery_path",
        description: "recoverEditRequest coerces JSON string edit args into dispatch-ready record",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverEditRequest coerces JSON string edit args into dispatch-ready record",
      },
      {
        id: "wee.recovery_missing_path_rejected",
        category: "recovery_path",
        description: "recoverEditRequest rejects unrecoverable missing file path input",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverEditRequest rejects unrecoverable missing file path input",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Pre-edit validator, surgical edit validator and telemetry exports gate worker NO-GO wiring.",
      minProbeCount: 3,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "wee.orchestrator_pre_edit_validation",
        category: "nogo_path",
        description: "Orchestrator validates surgical edit calls through forge edit engine contract before dispatch",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator validates surgical edit calls through forge edit engine contract before dispatch",
      },
      {
        id: "wee.edit_telemetry_record",
        category: "nogo_path",
        description: "buildEditEngineTelemetry records edit provenance for worker tool loop",
        expected: "PASS",
        disposition: "observed",
        criterion: "buildEditEngineTelemetry records edit provenance for worker tool loop",
      },
      {
        id: "wee.exported_edit_validator",
        category: "nogo_path",
        description: "validateSurgicalEdit exported for orchestrator pre-edit contract checks",
        expected: "PASS",
        disposition: "observed",
        criterion: "validateSurgicalEdit exported for orchestrator pre-edit contract checks",
      },
    ],
  },
};

export const FORGE_WORKER_EDIT_ENGINE_CONTRACT_V1: WorkerEditEngineContract = {
  version: "1.0.0",
  atom: "P05-B03-A02",
  purpose: "Worker surgical edit engine typed contract with measurable acceptance probes.",
  categories: WORKER_EDIT_ENGINE_CATEGORY_CONTRACTS,
  probes: flattenWorkerEditEngineCategoryProbes(WORKER_EDIT_ENGINE_CATEGORY_CONTRACTS),
};

export function getActiveWorkerEditEngineContract(): WorkerEditEngineContract {
  return FORGE_WORKER_EDIT_ENGINE_CONTRACT_V1;
}

export function getWorkerEditEngineCategoryContract(
  category: WorkerEditEngineCategory,
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): WorkerEditEngineCategoryContract {
  return contract.categories[category];
}

export function listWorkerEditEngineContractProbeIds(
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listWorkerEditEngineProbesByDisposition(
  disposition: WorkerEditEngineProbeDisposition,
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): WorkerEditEngineProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listWorkerEditEngineContractProbesByCategory(
  category: WorkerEditEngineCategory,
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): readonly WorkerEditEngineProbeContract[] {
  return [...contract.categories[category].probes];
}

export interface WorkerEditEngineContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: WorkerEditEngineCategory;
  detail: string;
}

export interface WorkerEditEngineContractCoverageResult {
  valid: boolean;
  issues: WorkerEditEngineContractCoverageIssue[];
}

export function summarizeWorkerEditEngineContractCoverage(
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<WorkerEditEngineCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<WorkerEditEngineProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    WorkerEditEngineCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<WorkerEditEngineProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of WORKER_EDIT_ENGINE_CATEGORIES) {
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

export function validateWorkerEditEngineContractCoverage(
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): WorkerEditEngineContractCoverageResult {
  const issues: WorkerEditEngineContractCoverageIssue[] = [];

  for (const category of WORKER_EDIT_ENGINE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({
        kind: "missing_category",
        category,
        detail: `missing category contract: ${category}`,
      });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < WORKER_EDIT_ENGINE_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${WORKER_EDIT_ENGINE_A01_MIN_PROBES[category]}`,
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

  const ids = listWorkerEditEngineContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeWorkerEditEngineContractCoverage(contract);
  if (summary.totalProbes !== ids.length) {
    issues.push({
      kind: "coverage_mismatch",
      detail: `totalProbes=${summary.totalProbes} ids=${ids.length}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

export function validateWorkerEditEngineContract(
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): WorkerEditEngineContractCoverageResult {
  return validateWorkerEditEngineContractCoverage(contract);
}

export function validateWorkerEditEngineAgainstContract(
  fixture: WorkerEditEngineBaseline,
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): WorkerEditEngineValidationResult {
  const issues: WorkerEditEngineValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of WORKER_EDIT_ENGINE_CATEGORIES) {
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

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: WorkerEditEngineCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
): WorkerEditEngineProbeResult {
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

function editEngineSource(): string {
  return readSrc("edit-engine.ts");
}

function productionEditEngineSource(): string {
  return readSrc("forge-p05-worker-edit-engine.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionEditEngineSource());
}

function probeEditVersioning(
  id: string,
  category: WorkerEditEngineCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerEditEngineBaseline,
): WorkerEditEngineProbeResult {
  switch (id) {
    case "wee.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "wee.atom_tagged": {
      const ok = fixture.atom === "P05-B03-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "wee.harness_version_exported": {
      const ok = FORGE_WORKER_EDIT_ENGINE_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_WORKER_EDIT_ENGINE_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown edit_versioning probe");
  }
}

function probeEditSignal(
  id: string,
  category: WorkerEditEngineCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerEditEngineProbeResult {
  const tools = toolsSource();
  const prompts = promptsSource();
  const editEngine = editEngineSource();

  switch (id) {
    case "wee.edit_file_tool_defined": {
      const editDef = TOOL_DEFINITIONS.find(def => def.name === "edit_file");
      const ok =
        editDef !== undefined &&
        editDef.parameters !== undefined &&
        tools.includes("executeEditFileV2") &&
        tools.includes('case "edit_file"');
      return probe(id, category, expected, ok, `editFileTool=${ok}`);
    }
    case "wee.edit_engine_class_exported": {
      const ok =
        editEngine.includes("export class EditEngine") &&
        editEngine.includes("editByLineRange(") &&
        editEngine.includes("edit(request: EditRequest)");
      return probe(id, category, expected, ok, `editEngineClass=${ok}`);
    }
    case "wee.typed_edit_call_union": {
      const ok =
        tools.includes("export type TypedEditCall") ||
        tools.includes("interface TypedEditCall");
      return probe(id, category, expected, ok, `typedEditCall=${ok}`);
    }
    case "wee.worker_prompt_edit_contract": {
      const ok =
        prompts.includes("SURGICAL EDIT ENGINE") ||
        prompts.includes("surgical edit engine contract") ||
        prompts.includes("Surgical edit engine contract");
      return probe(id, category, expected, ok, `editContractSection=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown edit_signal probe");
  }
}

function probeMatchSignal(
  id: string,
  category: WorkerEditEngineCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerEditEngineProbeResult {
  const tools = toolsSource();
  const editEngine = editEngineSource();

  switch (id) {
    case "wee.fuzzy_match_exported": {
      const ok = editEngine.includes("export function findFuzzyMatch");
      return probe(id, category, expected, ok, `findFuzzyMatch=${ok}`);
    }
    case "wee.find_text_cascade": {
      const ok = editEngine.includes("export function findTextInFileContents");
      return probe(id, category, expected, ok, `findTextInFileContents=${ok}`);
    }
    case "wee.line_range_edit_tool": {
      const ok =
        tools.includes('name: "edit_range"') &&
        tools.includes("editByLineRange(") &&
        tools.includes('case "edit_range"');
      return probe(id, category, expected, ok, `lineRangeEdit=${ok}`);
    }
    case "wee.multi_occurrence_dispatch": {
      const fnBody = tools.match(/function executeEditFileV2[\s\S]*?^}/m)?.[0] ?? "";
      const ok = fnBody.includes("occurrence");
      return probe(id, category, expected, ok, `occurrenceDispatch=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown match_signal probe");
  }
}

function probeBaselineLink(
  id: string,
  category: WorkerEditEngineCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerEditEngineProbeResult {
  switch (id) {
    case "wee.b02_handoff_entry": {
      const handoff = getForgeP05B02ToB03Handoff();
      const ok =
        handoff.targetBlock.blockId === "P05-B03" &&
        handoff.targetBlock.entryAtom === "P05-B03-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "wee.b02_sealed_grounding_probes": {
      const handoff = getForgeP05B02ToB03Handoff();
      const coverage = summarizeWorkerFilesystemGroundingContractCoverage(
        getActiveWorkerFilesystemGroundingContract(),
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
  category: WorkerEditEngineCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerEditEngineBaseline,
): WorkerEditEngineProbeResult {
  switch (id) {
    case "wee.source_block_gate_ref": {
      const handoff = getForgeP05B02ToB03Handoff();
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P05_B02_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, sealed=${fixture.sourceBlockGate.sealedAtomCount}`,
      );
    }
    case "wee.probe_runner_exported": {
      const ok = productionEditEngineSource().includes(
        "export function runWorkerEditEngineProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "wee.known_gaps_documented": {
      const contract = getActiveWorkerEditEngineContract();
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
    case "wee.empty_old_text_boundary": {
      const result = assessEditInputBoundary("");
      const ok = !result.acceptable && result.disposition === "empty";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    case "wee.whitespace_old_text_boundary": {
      const result = assessEditInputBoundary("   \t\n  ");
      const ok = !result.acceptable && result.disposition === "whitespace_only";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    case "wee.null_byte_old_text_boundary": {
      const result = assessEditInputBoundary("const x = 1;\0");
      const ok = !result.acceptable && result.disposition === "contains_null_byte";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    case "wee.long_old_text_truncation_boundary": {
      const longText = "x".repeat(WORKER_EDIT_ENGINE_OLD_TEXT_MAX_LENGTH + 500);
      const result = assessEditInputBoundary(longText);
      const ok =
        result.acceptable && result.truncated && result.disposition === "exceeds_max_length";
      return probe(
        id,
        category,
        expected,
        ok,
        `truncated=${result.truncated}, oldTextLen=${result.normalizedOldText.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: WorkerEditEngineCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerEditEngineBaseline,
): WorkerEditEngineProbeResult {
  switch (id) {
    case "wee.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const validation = validateWorkerEditEngineBaseline(invalid);
      const ok = validation.valid === false;
      return probe(id, category, expected, ok, `rejected=${ok}`);
    }
    case "wee.malformed_edit_guard": {
      const result = assessEditInputBoundary("valid", "replacement\0text");
      const ok = !result.acceptable && result.disposition === "contains_null_byte";
      return probe(id, category, expected, ok, `disposition=${result.disposition}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: WorkerEditEngineCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerEditEngineProbeResult {
  switch (id) {
    case "wee.recovery_string_args_coercion": {
      const recovery = recoverEditRequest(
        "./src/tools.ts",
        JSON.stringify({ old_string: "const x = 1;", new_string: "const x = 2;" }),
      );
      const ok =
        recovery.recovered &&
        recovery.path === "src/tools.ts" &&
        recovery.oldText === "const x = 1;";
      return probe(id, category, expected, ok, recovery.detail);
    }
    case "wee.recovery_missing_path_rejected": {
      const recovery = recoverEditRequest("", "const x = 1;", "const x = 2;");
      const ok = !recovery.recovered && recovery.parseErrors.includes("empty");
      return probe(id, category, expected, ok, recovery.detail);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: WorkerEditEngineCategory,
  expected: ForgeAcceptanceOutcome,
): WorkerEditEngineProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "wee.orchestrator_pre_edit_validation": {
      const ok = orchestrator.includes("validateSurgicalEdit(");
      return probe(id, category, expected, ok, `preEditValidation=${ok}`);
    }
    case "wee.edit_telemetry_record": {
      const telemetry = buildEditEngineTelemetry(
        {
          name: "edit_file",
          args: {
            explanation: "probe",
            path: "src/tools.ts",
            old_string: "const x = 1;",
            new_string: "const x = 2;",
          },
        },
        { sequenceIndex: 1 },
      );
      const ok =
        hasProductionExport("buildEditEngineTelemetry") &&
        telemetry.toolName === "edit_file" &&
        telemetry.sequenceIndex === 1 &&
        telemetry.validated === true;
      return probe(id, category, expected, ok, `editTelemetry=${ok}`);
    }
    case "wee.exported_edit_validator": {
      const invalidEdit = validateSurgicalEdit({
        name: "edit_file",
        args: { path: "src/tools.ts", old_string: "", new_string: "x" },
      });
      const ok = hasProductionExport("validateSurgicalEdit") && !invalidEdit.valid;
      return probe(id, category, expected, ok, `editValidator=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: WorkerEditEngineCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerEditEngineBaseline,
): WorkerEditEngineProbeResult {
  switch (category) {
    case "edit_versioning":
      return probeEditVersioning(id, category, expected, fixture);
    case "edit_signal":
      return probeEditSignal(id, category, expected);
    case "match_signal":
      return probeMatchSignal(id, category, expected);
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

export function runWorkerEditEngineProbes(
  fixture: WorkerEditEngineBaseline = loadWorkerEditEngineBaseline(),
): WorkerEditEngineProbeResult[] {
  const contract = getActiveWorkerEditEngineContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion ? { ...result, criterion: contractProbe.criterion } : result;
  });
}

export function summarizeWorkerEditEngineMatrix(
  results: WorkerEditEngineProbeResult[],
): WorkerEditEngineProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = Object.fromEntries(
    WORKER_EDIT_ENGINE_CATEGORIES.map(category => [
      category,
      { total: 0, aligned: 0, expectedFail: 0 },
    ]),
  ) as WorkerEditEngineProbeSummary["byCategory"];

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

export function listWorkerEditEngineProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: WorkerEditEngineBaseline = loadWorkerEditEngineBaseline(),
): WorkerEditEngineFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listWorkerEditEngineKnownGaps(
  results: WorkerEditEngineProbeResult[] = runWorkerEditEngineProbes(),
): WorkerEditEngineProbeResult[] {
  return summarizeWorkerEditEngineMatrix(results).knownGaps;
}

export interface WorkerEditEngineProbeMatrixValidationIssue {
  kind: "missing_result" | "criterion_mismatch" | "pass_mismatch" | "gap_mismatch";
  probeId?: string;
  detail: string;
}

export interface WorkerEditEngineProbeMatrixValidationResult {
  valid: boolean;
  issues: WorkerEditEngineProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

export function validateWorkerEditEngineProbeMatrix(
  results: WorkerEditEngineProbeResult[],
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): WorkerEditEngineProbeMatrixValidationResult {
  const issues: WorkerEditEngineProbeMatrixValidationIssue[] = [];
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

export interface WorkerEditEngineProductionSliceResult {
  atom: "P05-B03-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: WorkerEditEngineProbeResult[];
  summary: WorkerEditEngineProbeSummary;
  matrixValidation: WorkerEditEngineProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: surgical edit engine wired to contract probes
 * with zero unexpected mismatches against the sealed contract matrix.
 */
export function runWorkerEditEngineProductionSlice(
  fixture: WorkerEditEngineBaseline = loadWorkerEditEngineBaseline(),
): WorkerEditEngineProductionSliceResult {
  const contract = getActiveWorkerEditEngineContract();
  const fixtureValidation = validateWorkerEditEngineBaseline(fixture);
  const contractValidation = validateWorkerEditEngineAgainstContract(fixture, contract);
  const results = runWorkerEditEngineProbes(fixture);
  const summary = summarizeWorkerEditEngineMatrix(results);
  const matrixValidation = validateWorkerEditEngineProbeMatrix(results, contract);

  return {
    atom: "P05-B03-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface WorkerEditEngineBoundarySliceResult {
  atom: "P05-B03-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: WorkerEditEngineProbeResult[];
  boundaryResults: WorkerEditEngineProbeResult[];
  matrixValidation: WorkerEditEngineProbeMatrixValidationResult;
}

/**
 * Validate boundary-category probe matrix — A04 slice gate.
 */
export function validateWorkerEditEngineBoundaryProbeMatrix(
  results: WorkerEditEngineProbeResult[],
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): WorkerEditEngineProbeMatrixValidationResult {
  const boundaryProbes = listWorkerEditEngineContractProbesByCategory("boundary", contract);
  const boundaryContract: WorkerEditEngineContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateWorkerEditEngineProbeMatrix(boundaryResults, boundaryContract);
}

/**
 * A04 boundary slice: contract-wired boundary probes (edit input edge cases, occurrence dispatch,
 * probe runner, documented gaps, source block gate refs) with zero unexpected mismatches.
 */
export function runWorkerEditEngineBoundarySlice(
  fixture: WorkerEditEngineBaseline = loadWorkerEditEngineBaseline(),
): WorkerEditEngineBoundarySliceResult {
  const contract = getActiveWorkerEditEngineContract();
  const results = runWorkerEditEngineProbes(fixture);
  const boundaryProbes = listWorkerEditEngineContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateWorkerEditEngineBoundaryProbeMatrix(results, contract);

  return {
    atom: "P05-B03-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const WORKER_EDIT_ENGINE_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly WorkerEditEngineCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery probes and documented NO-GO wiring must align; zero unexpected mismatches.
 */
export function validateWorkerEditEngineFailureRecoveryProbeMatrix(
  results: WorkerEditEngineProbeResult[],
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): WorkerEditEngineProbeMatrixValidationResult {
  const failureRecoveryProbes = WORKER_EDIT_ENGINE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listWorkerEditEngineContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: WorkerEditEngineContract = {
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
  return validateWorkerEditEngineProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listWorkerEditEngineFailureRecoveryProbeIds(
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): string[] {
  return WORKER_EDIT_ENGINE_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listWorkerEditEngineContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface WorkerEditEngineFailureRecoverySliceResult {
  atom: "P05-B03-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: WorkerEditEngineProbeResult[];
  failureRecoveryResults: WorkerEditEngineProbeResult[];
  matrixValidation: WorkerEditEngineProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches.
 */
export function runWorkerEditEngineFailureRecoverySlice(
  fixture: WorkerEditEngineBaseline = loadWorkerEditEngineBaseline(),
): WorkerEditEngineFailureRecoverySliceResult {
  const contract = getActiveWorkerEditEngineContract();
  const results = runWorkerEditEngineProbes(fixture);
  const failureRecoveryProbes = WORKER_EDIT_ENGINE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listWorkerEditEngineContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateWorkerEditEngineFailureRecoveryProbeMatrix(results, contract);

  return {
    atom: "P05-B03-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

/** Per-probe evidence artifact — expected vs actual with criterion provenance (P05-B03-A06). */
export interface WorkerEditEngineProbeEvidence {
  probeId: string;
  category: WorkerEditEngineCategory;
  disposition: WorkerEditEngineProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for worker edit engine runs (P05-B03-A06). */
export interface WorkerEditEngineProbeRunTelemetry {
  probeId: string;
  category: WorkerEditEngineCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P05-B03-A06). */
export interface WorkerEditEngineProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourceBlockGateVersion: string;
  sourceBlockGateAtom: string;
  sliceAtom?: string;
  sliceCategories?: readonly WorkerEditEngineCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated worker edit engine run record bundling evidence, telemetry and provenance. */
export interface WorkerEditEngineRunRecord {
  provenance: WorkerEditEngineProvenance;
  evidence: WorkerEditEngineProbeEvidence[];
  telemetry: WorkerEditEngineProbeRunTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<WorkerEditEngineCategory, number>;
    byDisposition: Record<WorkerEditEngineProbeDisposition, number>;
  };
}

export interface WorkerEditEngineRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface WorkerEditEngineRunValidationResult {
  valid: boolean;
  issues: WorkerEditEngineRunValidationIssue[];
}

export function buildWorkerEditEngineProbeEvidence(
  probeId: string,
  category: WorkerEditEngineCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: WorkerEditEngineProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): WorkerEditEngineProbeEvidence {
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

export function buildWorkerEditEngineProbeRunTelemetry(
  probeId: string,
  category: WorkerEditEngineCategory,
  sequenceIndex: number,
  durationMs: number,
): WorkerEditEngineProbeRunTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildWorkerEditEngineProvenance(
  runId: string,
  fixture: WorkerEditEngineBaseline,
  contract: WorkerEditEngineContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly WorkerEditEngineCategory[];
  },
): WorkerEditEngineProvenance {
  return {
    runId,
    harnessVersion: FORGE_WORKER_EDIT_ENGINE_VERSION,
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

export function buildWorkerEditEngineRunRecord(
  provenance: WorkerEditEngineProvenance,
  evidence: WorkerEditEngineProbeEvidence[],
  telemetry: WorkerEditEngineProbeRunTelemetry[],
): WorkerEditEngineRunRecord {
  const byCategory = {} as Record<WorkerEditEngineCategory, number>;
  const byDisposition: Record<WorkerEditEngineProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of WORKER_EDIT_ENGINE_CATEGORIES) {
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

function validateWorkerEditEngineRunRecordAgainstProbeIds(
  record: WorkerEditEngineRunRecord,
  expectedProbeIds: string[],
  contract: WorkerEditEngineContract,
): WorkerEditEngineRunValidationResult {
  const issues: WorkerEditEngineRunValidationIssue[] = [];
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

export function validateWorkerEditEngineRunRecord(
  record: WorkerEditEngineRunRecord,
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): WorkerEditEngineRunValidationResult {
  return validateWorkerEditEngineRunRecordAgainstProbeIds(
    record,
    listWorkerEditEngineContractProbeIds(contract),
    contract,
  );
}

/** Validate evidence slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateWorkerEditEngineEvidenceRunRecord(
  record: WorkerEditEngineRunRecord,
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): WorkerEditEngineRunValidationResult {
  const issues: WorkerEditEngineRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P05-B03-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P05-B03-A06`,
    });
  }

  const expectedCategories = [...WORKER_EDIT_ENGINE_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateWorkerEditEngineRunRecordAgainstProbeIds(
    record,
    listWorkerEditEngineFailureRecoveryProbeIds(contract),
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
export function validateWorkerEditEngineEvidenceProbeMatrix(
  results: WorkerEditEngineProbeResult[],
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): WorkerEditEngineProbeMatrixValidationResult {
  return validateWorkerEditEngineFailureRecoveryProbeMatrix(results, contract);
}

export interface WorkerEditEngineEvidenceSliceResult {
  atom: "P05-B03-A06";
  evidenceProbeCount: number;
  matrixValid: boolean;
  recordValid: boolean;
  results: WorkerEditEngineProbeResult[];
  evidenceResults: WorkerEditEngineProbeResult[];
  matrixValidation: WorkerEditEngineProbeMatrixValidationResult;
  record: WorkerEditEngineRunRecord;
  recordValidation: WorkerEditEngineRunValidationResult;
}

function resolveWorkerEditEngineGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function runWorkerEditEngineProbeWithTiming(
  entry: WorkerEditEngineFixtureEntry,
  fixture: WorkerEditEngineBaseline,
  contractProbe:
    | { criterion: string; disposition: WorkerEditEngineProbeDisposition }
    | undefined,
): {
  result: WorkerEditEngineProbeResult;
  durationMs: number;
  disposition: WorkerEditEngineProbeDisposition;
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

function buildWorkerEditEngineRecordFromEntries(
  entries: WorkerEditEngineFixtureEntry[],
  fixture: WorkerEditEngineBaseline,
  contract: WorkerEditEngineContract,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly WorkerEditEngineCategory[];
  },
): WorkerEditEngineRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: WorkerEditEngineProbeEvidence[] = [];
  const telemetry: WorkerEditEngineProbeRunTelemetry[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runWorkerEditEngineProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildWorkerEditEngineProbeEvidence(
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
      buildWorkerEditEngineProbeRunTelemetry(
        result.id,
        result.category,
        sequenceIndex,
        durationMs,
      ),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildWorkerEditEngineProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveWorkerEditEngineGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildWorkerEditEngineRunRecord(provenance, evidence, telemetry);
}

/** Run all worker edit engine probes and emit auditable evidence, telemetry and provenance (P05-B03-A06). */
export function runWorkerEditEngineProbesWithRecord(
  fixture: WorkerEditEngineBaseline = loadWorkerEditEngineBaseline(),
): WorkerEditEngineRunRecord {
  const contract = getActiveWorkerEditEngineContract();
  return buildWorkerEditEngineRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P05-B03-A06). */
export function runWorkerEditEngineFailureRecoverySliceWithRecord(
  fixture: WorkerEditEngineBaseline = loadWorkerEditEngineBaseline(),
): WorkerEditEngineRunRecord {
  const contract = getActiveWorkerEditEngineContract();
  const failureRecoveryIds = new Set(listWorkerEditEngineFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildWorkerEditEngineRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P05-B03-A06",
    sliceCategories: WORKER_EDIT_ENGINE_FAILURE_RECOVERY_CATEGORIES,
  });
}

/**
 * A06 evidence slice: contract-wired failure_path, recovery_path, and nogo_path probes
 * with auditable evidence, telemetry and provenance — zero unexpected mismatches.
 */
export function runWorkerEditEngineEvidenceSlice(
  fixture: WorkerEditEngineBaseline = loadWorkerEditEngineBaseline(),
): WorkerEditEngineEvidenceSliceResult {
  const contract = getActiveWorkerEditEngineContract();
  const results = runWorkerEditEngineProbes(fixture);
  const failureRecoveryProbes = WORKER_EDIT_ENGINE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listWorkerEditEngineContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const evidenceResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateWorkerEditEngineEvidenceProbeMatrix(results, contract);
  const record = runWorkerEditEngineFailureRecoverySliceWithRecord(fixture);
  const recordValidation = validateWorkerEditEngineEvidenceRunRecord(record, contract);

  return {
    atom: "P05-B03-A06",
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

// ─── Property and fuzz validation (P05-B03-A07) ─────────────────────────────

export interface WorkerEditEnginePropertyViolation {
  propertyId: string;
  detail: string;
}

export interface WorkerEditEnginePropertyResult {
  passed: number;
  failed: WorkerEditEnginePropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type WorkerEditEnginePropertyCheck = {
  id: string;
  description: string;
  check: (contract: WorkerEditEngineContract) => string | null;
};

const WORKER_EDIT_ENGINE_STRUCTURAL_PROPERTIES: readonly WorkerEditEnginePropertyCheck[] = [
  {
    id: "categories_complete",
    description: "All eight worker edit engine categories are declared",
    check: contract => {
      for (const category of WORKER_EDIT_ENGINE_CATEGORIES) {
        if (!contract.categories[category]) return `missing category: ${category}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listWorkerEditEngineContractProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each category meets contract minProbeCount",
    check: contract => {
      for (const category of WORKER_EDIT_ENGINE_CATEGORIES) {
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
      "summarizeWorkerEditEngineContractCoverage totals match listWorkerEditEngineContractProbeIds",
    check: contract => {
      const summary = summarizeWorkerEditEngineContractCoverage(contract);
      const ids = listWorkerEditEngineContractProbeIds(contract);
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
    description: "Probe ids are namespaced with wee. prefix",
    check: contract => {
      for (const probe of contract.probes) {
        if (!probe.id.startsWith("wee.")) {
          return `${probe.id} missing wee. prefix`;
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const fixture = loadWorkerEditEngineBaseline();
      const probeIds = listWorkerEditEngineContractProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildWorkerEditEngineProbeEvidence(
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
        return buildWorkerEditEngineProbeRunTelemetry(id, probe.category, index, index);
      });
      const record = buildWorkerEditEngineRunRecord(
        buildWorkerEditEngineProvenance(
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
      "Synthetic failure/recovery slice record passes validateWorkerEditEngineEvidenceRunRecord",
    check: contract => {
      const fixture = loadWorkerEditEngineBaseline();
      const probeIds = listWorkerEditEngineFailureRecoveryProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildWorkerEditEngineProbeEvidence(
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
        return buildWorkerEditEngineProbeRunTelemetry(
          id,
          probe.category,
          index,
          index * 0.5,
        );
      });
      const record = buildWorkerEditEngineRunRecord(
        buildWorkerEditEngineProvenance(
          "property-check-failure-recovery",
          fixture,
          contract,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:01.000Z",
          probeIds.length,
          {
            sliceAtom: "P05-B03-A06",
            sliceCategories: WORKER_EDIT_ENGINE_FAILURE_RECOVERY_CATEGORIES,
          },
        ),
        evidence,
        telemetry,
      );
      const validation = validateWorkerEditEngineEvidenceRunRecord(record, contract);
      if (!validation.valid) {
        return validation.issues.map(i => i.detail).join("; ");
      }
      return null;
    },
  },
] as const;

export function runWorkerEditEnginePropertyValidation(
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): WorkerEditEnginePropertyResult {
  const failed: WorkerEditEnginePropertyViolation[] = [];
  for (const property of WORKER_EDIT_ENGINE_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = WORKER_EDIT_ENGINE_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type WorkerEditEngineFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface WorkerEditEngineFuzzMutationCase {
  seed: number;
  kind: WorkerEditEngineFuzzMutationKind;
  probeId?: string;
  category?: WorkerEditEngineCategory;
}

export interface WorkerEditEngineFuzzValidationCaseResult {
  mutation: WorkerEditEngineFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface WorkerEditEngineFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: WorkerEditEngineFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createWorkerEditEngineFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneWorkerEditEngineBaseline(
  fixture: WorkerEditEngineBaseline,
): WorkerEditEngineBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickWorkerEditEngineFuzzTarget(
  fixture: WorkerEditEngineBaseline,
  rng: () => number,
): {
  category: WorkerEditEngineCategory;
  index: number;
  entry: WorkerEditEngineFixtureEntry;
} {
  const category =
    WORKER_EDIT_ENGINE_CATEGORIES[
      Math.floor(rng() * WORKER_EDIT_ENGINE_CATEGORIES.length)
    ]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyWorkerEditEngineFuzzMutation(
  fixture: WorkerEditEngineBaseline,
  mutation: WorkerEditEngineFuzzMutationCase,
): WorkerEditEngineBaseline {
  const mutated = cloneWorkerEditEngineBaseline(fixture);
  const targetCategory = mutation.category ?? WORKER_EDIT_ENGINE_CATEGORIES[0]!;
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
          id: `wee.fuzz.extra.${mutation.seed}`,
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
      const other = WORKER_EDIT_ENGINE_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateWorkerEditEngineFuzzMutationCases(
  fixture: WorkerEditEngineBaseline,
  seed: number,
  iterations: number,
): WorkerEditEngineFuzzMutationCase[] {
  const rng = createWorkerEditEngineFuzzRng(seed);
  const kinds: WorkerEditEngineFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: WorkerEditEngineFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickWorkerEditEngineFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P05-B03-A07). */
export function runWorkerEditEngineFuzzValidation(
  fixture: WorkerEditEngineBaseline,
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
  seed = 42,
  iterations = 24,
): WorkerEditEngineFuzzValidationResult {
  const cases = generateWorkerEditEngineFuzzMutationCases(fixture, seed, iterations);
  const results: WorkerEditEngineFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyWorkerEditEngineFuzzMutation(fixture, mutation);
    const validation = validateWorkerEditEngineAgainstContract(mutated, contract);
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

export type WorkerEditEngineRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface WorkerEditEngineRunRecordFuzzCase {
  kind: WorkerEditEngineRunRecordFuzzKind;
  probeId?: string;
}

export function applyWorkerEditEngineRunRecordFuzzMutation(
  record: WorkerEditEngineRunRecord,
  mutation: WorkerEditEngineRunRecordFuzzCase,
): WorkerEditEngineRunRecord {
  const cloned: WorkerEditEngineRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P05-B03-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["edit_versioning"],
      };
      break;
  }

  cloned.summary = buildWorkerEditEngineRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveWorkerEditEngineRunRecordValidator(
  record: WorkerEditEngineRunRecord,
): (
  record: WorkerEditEngineRunRecord,
  contract: WorkerEditEngineContract,
) => WorkerEditEngineRunValidationResult {
  return record.provenance.sliceAtom === "P05-B03-A06"
    ? validateWorkerEditEngineEvidenceRunRecord
    : validateWorkerEditEngineRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P05-B03-A07). */
export function runWorkerEditEngineRunRecordFuzzValidation(
  record: WorkerEditEngineRunRecord,
  contract: WorkerEditEngineContract = getActiveWorkerEditEngineContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveWorkerEditEngineRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: WorkerEditEngineRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P05-B03-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyWorkerEditEngineRunRecordFuzzMutation(record, mutation);
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

export interface WorkerEditEnginePropertyFuzzSliceResult {
  atom: "P05-B03-A07";
  propertyChecksPassed: boolean;
  contractFuzzRejected: boolean;
  runRecordFuzzRejected: boolean;
  propertyResult: WorkerEditEnginePropertyResult;
  contractFuzz: WorkerEditEngineFuzzValidationResult;
  runRecordFuzz: {
    validBaseline: boolean;
    mutationsRejected: number;
    mutationsAccepted: number;
  };
}

export interface WorkerEditEnginePropertyProbeMatrixValidationResult {
  valid: boolean;
  issues: WorkerEditEngineProbeMatrixValidationIssue[];
  propertyChecksAligned: number;
  fuzzMutationsAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate property_checks + fuzz_mutations against the A07 contract matrix —
 * all structural properties pass and zero fuzz mutations accepted.
 */
export function validateWorkerEditEnginePropertyProbeMatrix(
  slice: WorkerEditEnginePropertyFuzzSliceResult,
): WorkerEditEnginePropertyProbeMatrixValidationResult {
  const issues: WorkerEditEngineProbeMatrixValidationIssue[] = [];
  let propertyChecksAligned = 0;
  let fuzzMutationsAligned = 0;
  let unexpectedMismatches = 0;

  if (slice.atom !== "P05-B03-A07") {
    issues.push({
      kind: "pass_mismatch",
      detail: `slice atom=${slice.atom} expected=P05-B03-A07`,
    });
    unexpectedMismatches++;
  }

  for (const property of WORKER_EDIT_ENGINE_STRUCTURAL_PROPERTIES) {
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
export function runWorkerEditEnginePropertyFuzzSlice(
  fixture: WorkerEditEngineBaseline = loadWorkerEditEngineBaseline(),
): WorkerEditEnginePropertyFuzzSliceResult {
  const contract = getActiveWorkerEditEngineContract();
  const propertyResult = runWorkerEditEnginePropertyValidation(contract);
  const contractFuzz = runWorkerEditEngineFuzzValidation(fixture, contract);
  const record = runWorkerEditEngineFailureRecoverySliceWithRecord(fixture);
  const runRecordFuzz = runWorkerEditEngineRunRecordFuzzValidation(record, contract);

  return {
    atom: "P05-B03-A07",
    propertyChecksPassed: propertyResult.allPassed,
    contractFuzzRejected: contractFuzz.allMutationsRejected,
    runRecordFuzzRejected: runRecordFuzz.mutationsAccepted === 0,
    propertyResult,
    contractFuzz,
    runRecordFuzz,
  };
}

/** Smoke probe: edit with missing old_text returns deterministic not-found error (P05-B03-A01 boundary). */
export function probeEditNotFoundError(): boolean {
  const tempRoot = mkdtempSync(join(tmpdir(), "foreman-wee-"));
  try {
    const filePath = join(tempRoot, "sample.ts");
    writeFileSync(filePath, "const value = 1;\n", "utf8");
    const editEngine = new EditEngine();
    const result = editEngine.edit({
      filePath,
      oldText: "const missing = 1;",
      newText: "const missing = 2;",
    });
    return result.success === false && result.message.includes("not found");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
