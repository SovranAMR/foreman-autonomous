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
import workerEditEngineBaseline from "./fixtures/forge-worker-edit-engine-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP05B02ToB03Handoff,
  getActiveWorkerFilesystemGroundingContract,
  summarizeWorkerFilesystemGroundingContractCoverage,
} from "./forge-p05-worker-filesystem-grounding.js";
import { TOOL_DEFINITIONS } from "./tools.js";
import { EditEngine } from "./edit-engine.js";

export const FORGE_WORKER_EDIT_ENGINE_VERSION = "1.0.0-a01";

export const EXPECTED_P05_B02_SEALED_ATOM_COUNT = 10;

/** Maximum normalized edit old_text length before truncation (P05-B03-A01 boundary). */
export const WORKER_EDIT_ENGINE_OLD_TEXT_MAX_LENGTH = 65_536;

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
 * Recover malformed edit request args into dispatch-ready record (P05-B03-A01).
 */
export function recoverEditRequest(
  path: string,
  oldText: unknown,
  newText: unknown = "",
): EditRequestRecoveryResult {
  if (typeof path !== "string" || path.trim().length === 0) {
    return {
      recovered: false,
      path: typeof path === "string" ? path : "",
      oldText: "",
      newText: "",
      parseErrors: ["empty"],
      detail: "cannot recover missing file path",
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
      path,
      oldText: resolvedOldText,
      newText: resolvedNewText,
      parseErrors: [...parseErrors, boundary.disposition],
      detail: boundary.detail,
    };
  }

  let normalizedPath = path.trim().replace(/\\/g, "/");
  if (normalizedPath.startsWith("./")) {
    normalizedPath = normalizedPath.slice(2);
  }

  return {
    recovered: true,
    path: normalizedPath,
    oldText: boundary.normalizedOldText,
    newText: boundary.normalizedNewText,
    parseErrors,
    detail: `recovered edit path=${normalizedPath}`,
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

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length === 0) {
    issues.push({
      kind: "missing_category",
      detail: "fixture must document at least one measurable FAIL gap",
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
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount >= 1;
      return probe(id, category, expected, ok, `documentedFailGaps=${failCount}`);
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
      const ok =
        orchestrator.includes("validateSurgicalEdit(") ||
        orchestrator.includes("validateEditEngineGrounding(");
      return probe(id, category, expected, ok, `preEditValidation=${ok}`);
    }
    case "wee.edit_telemetry_record": {
      const ok = hasProductionExport("buildEditEngineTelemetry");
      return probe(id, category, expected, ok, `editTelemetry=${ok}`);
    }
    case "wee.exported_edit_validator": {
      const ok = hasProductionExport("validateSurgicalEdit");
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
  return fixture.probes.map(entry =>
    runSingleProbe(entry.id, entry.category, entry.expected, fixture),
  );
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
