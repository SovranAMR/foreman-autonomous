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

export const FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION = "1.0.0-a01";

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
  return fixture.probes.map(entry =>
    runSingleProbe(entry.id, entry.category, entry.expected, fixture),
  );
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
