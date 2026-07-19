/**
 * FOREMAN — Strategist Parallel Execution Wave Baseline (P03-B07)
 *
 * A01 slice: load, validate, run probes against sealed P03-B06 resource
 * budget block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import strategistParallelWaveBaseline from "./fixtures/forge-strategist-parallel-wave-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP03B06ToB07Handoff,
  summarizeStrategistResourceBudgetCoverage,
  getActiveStrategistResourceBudgetContract,
  FORGE_STRATEGIST_RESOURCE_BUDGET_VERSION,
} from "./forge-p03-strategist-resource-budget.js";
import { parseDecomposeResponse } from "./parser.js";

export const FORGE_STRATEGIST_PARALLEL_WAVE_VERSION = "1.0.0";

export const EXPECTED_P03_B06_SEALED_ATOM_COUNT = 10;

export const STRATEGIST_PARALLEL_WAVE_DECOMPOSE_MAX_LENGTH = 64000;

export const STRATEGIST_PARALLEL_WAVE_CATEGORIES = [
  "wave_versioning",
  "block_wave_plan",
  "atom_wave_plan",
  "resource_wave_budget",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type StrategistParallelWaveCategory = (typeof STRATEGIST_PARALLEL_WAVE_CATEGORIES)[number];

export const STRATEGIST_PARALLEL_WAVE_A01_MIN_PROBES: Readonly<
  Record<StrategistParallelWaveCategory, number>
> = {
  wave_versioning: 3,
  block_wave_plan: 4,
  atom_wave_plan: 2,
  resource_wave_budget: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 3,
  recovery_path: 2,
  nogo_path: 2,
};

export type StrategistParallelWaveInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface StrategistParallelWaveInputBoundary {
  disposition: StrategistParallelWaveInputDisposition;
  acceptable: boolean;
  normalizedDecompose: string;
  truncated: boolean;
  detail: string;
}

export function assessStrategistParallelWaveInputBoundary(
  decomposeOutput: string,
): StrategistParallelWaveInputBoundary {
  if (decomposeOutput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedDecompose: "",
      truncated: false,
      detail: "null byte detected in decompose output",
    };
  }

  const trimmed = decomposeOutput.trim();
  if (trimmed.length === 0) {
    const disposition: StrategistParallelWaveInputDisposition =
      decomposeOutput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedDecompose: "",
      truncated: false,
      detail: disposition === "empty" ? "empty decompose output" : "whitespace-only decompose output",
    };
  }

  let normalizedDecompose = decomposeOutput;
  let truncated = false;
  if (normalizedDecompose.length > STRATEGIST_PARALLEL_WAVE_DECOMPOSE_MAX_LENGTH) {
    normalizedDecompose = normalizedDecompose.slice(0, STRATEGIST_PARALLEL_WAVE_DECOMPOSE_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedDecompose,
    truncated,
    detail: truncated
      ? `decompose truncated to ${STRATEGIST_PARALLEL_WAVE_DECOMPOSE_MAX_LENGTH} characters`
      : "valid decompose output",
  };
}

export interface StrategistParallelWaveFixtureEntry {
  id: string;
  category: StrategistParallelWaveCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface StrategistParallelWaveBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    resourceBudgetProbeCount: number;
    sealedAtomCount: number;
  };
  probes: StrategistParallelWaveFixtureEntry[];
}

export interface StrategistParallelWaveProbeResult {
  id: string;
  category: StrategistParallelWaveCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface StrategistParallelWaveProbeSummary {
  total: number;
  aligned: number;
  mismatches: StrategistParallelWaveProbeResult[];
  knownGaps: StrategistParallelWaveProbeResult[];
  byCategory: Record<
    StrategistParallelWaveCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface StrategistParallelWaveValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: StrategistParallelWaveCategory;
  detail: string;
}

export interface StrategistParallelWaveValidationResult {
  valid: boolean;
  issues: StrategistParallelWaveValidationIssue[];
}

export const FORGE_STRATEGIST_PARALLEL_WAVE_A01_PROBE_MATRIX: readonly StrategistParallelWaveFixtureEntry[] =
  strategistParallelWaveBaseline.probes as StrategistParallelWaveFixtureEntry[];

export function loadStrategistParallelWaveBaseline(): StrategistParallelWaveBaseline {
  return strategistParallelWaveBaseline as StrategistParallelWaveBaseline;
}

export function validateStrategistParallelWaveBaseline(
  fixture: StrategistParallelWaveBaseline,
): StrategistParallelWaveValidationResult {
  const issues: StrategistParallelWaveValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P03-B07-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    STRATEGIST_PARALLEL_WAVE_CATEGORIES.map(category => [category, 0]),
  ) as Record<StrategistParallelWaveCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of STRATEGIST_PARALLEL_WAVE_CATEGORIES) {
    const min = STRATEGIST_PARALLEL_WAVE_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_STRATEGIST_PARALLEL_WAVE_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_STRATEGIST_PARALLEL_WAVE_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_STRATEGIST_PARALLEL_WAVE_A01_PROBE_MATRIX) {
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

  const handoff = getForgeP03B06ToB07Handoff();
  const resourceCoverage = summarizeStrategistResourceBudgetCoverage(
    getActiveStrategistResourceBudgetContract(),
  );

  if (fixture.sourceBlockGate.atom !== "P03-B06-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P03-B06-A10`,
    });
  }
  if (fixture.sourceBlockGate.contractVersion !== FORGE_STRATEGIST_RESOURCE_BUDGET_VERSION) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.contractVersion=${fixture.sourceBlockGate.contractVersion} ` +
        `expected=${FORGE_STRATEGIST_RESOURCE_BUDGET_VERSION}`,
    });
  }
  if (fixture.sourceBlockGate.resourceBudgetProbeCount !== resourceCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.resourceBudgetProbeCount=${fixture.sourceBlockGate.resourceBudgetProbeCount} ` +
        `contract=${resourceCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P03_B06_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P03_B06_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P03_B06_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B06 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P03_B06_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P03-B07-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `B06 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P03-B07-A01`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length === 0) {
    issues.push({
      kind: "missing_category",
      detail: "fixture must document at least one measurable FAIL parallel wave gap",
    });
  }

  return { valid: issues.length === 0, issues };
}

export function summarizeStrategistParallelWaveMatrix(
  results: StrategistParallelWaveProbeResult[],
): StrategistParallelWaveProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as StrategistParallelWaveProbeSummary["byCategory"];
  for (const category of STRATEGIST_PARALLEL_WAVE_CATEGORIES) {
    const catResults = results.filter(r => r.category === category);
    byCategory[category] = {
      total: catResults.length,
      aligned: catResults.filter(r => r.aligned).length,
      expectedFail: catResults.filter(r => r.expected === "FAIL").length,
    };
  }

  return {
    total: results.length,
    aligned: results.length - mismatches.length,
    mismatches,
    knownGaps,
    byCategory,
  };
}

export function listStrategistParallelWaveProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistParallelWaveBaseline = loadStrategistParallelWaveBaseline(),
): StrategistParallelWaveFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listStrategistParallelWaveKnownGaps(
  results: StrategistParallelWaveProbeResult[],
): StrategistParallelWaveProbeResult[] {
  return summarizeStrategistParallelWaveMatrix(results).knownGaps;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = __dirname;

function readSrc(relativePath: string): string {
  return readFileSync(join(SRC_ROOT, relativePath), "utf8");
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
): StrategistParallelWaveProbeResult {
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

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function parserSource(): string {
  return readSrc("parser.ts");
}

function rateLimiterSource(): string {
  return readSrc("rate-limiter.ts");
}

function productionParallelWaveSource(): string {
  return readSrc("forge-p03-strategist-parallel-wave.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionParallelWaveSource());
}

const SAMPLE_BLOCK_DECOMPOSE_WITH_DEPS = `REASONING: Parallel wave ordered blocks
OUTPUT:
Block 1: Setup parallel wave baseline types
Block 2: Wire wave planner seam
Block 3: Add parallel wave tests
DEPENDENCIES: 2→1, 3→1,2
RESOURCE PLAN: Block 1 lightweight; Block 2 moderate; Block 3 integration
TOKEN BUDGET: perThought=4096
CONFIDENCE: 0.85`;

function probeWaveVersioning(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistParallelWaveBaseline,
): StrategistParallelWaveProbeResult {
  switch (id) {
    case "swave.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "swave.atom_tagged": {
      const ok = fixture.atom === "P03-B07-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "swave.harness_version_exported": {
      const ok = FORGE_STRATEGIST_PARALLEL_WAVE_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_STRATEGIST_PARALLEL_WAVE_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown wave_versioning probe");
  }
}

function probeBlockWavePlan(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistParallelWaveProbeResult {
  const orchestrator = orchestratorSource();
  const prompts = promptsSource();
  const parser = parserSource();

  switch (id) {
    case "swave.orchestrator_block_waves": {
      const ok =
        orchestrator.includes("computeBlockWaves(") &&
        orchestrator.includes("blockDeps");
      return probe(id, category, expected, ok, `blockWaves=${ok}`);
    }
    case "swave.orchestrator_parallel_plan_phase": {
      const ok =
        orchestrator.includes('phaseStart("parallel_plan"') &&
        orchestrator.includes("waveSummary");
      return probe(id, category, expected, ok, `parallelPlanPhase=${ok}`);
    }
    case "swave.prompt_parallel_wave_plan": {
      const ok =
        prompts.includes("PARALLEL WAVE PLAN:") ||
        prompts.includes("Parallel wave plan:");
      return probe(id, category, expected, ok, `parallelWavePlanSection=${ok}`);
    }
    case "swave.parser_wave_plan_fields": {
      const parsed = parseDecomposeResponse(SAMPLE_BLOCK_DECOMPOSE_WITH_DEPS);
      const ok =
        parsed.ok === true &&
        "parallelWavePlan" in parsed.data &&
        parser.includes("PARALLEL WAVE PLAN");
      return probe(id, category, expected, ok, `parallelWavePlanField=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown block_wave_plan probe");
  }
}

function probeAtomWavePlan(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistParallelWaveProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "swave.orchestrator_atom_waves": {
      const ok = orchestrator.includes("computeAtomWaves(");
      return probe(id, category, expected, ok, `atomWaves=${ok}`);
    }
    case "swave.block_order_preserves_waves": {
      const ok =
        orchestrator.includes("computeBlockWaves(") &&
        orchestrator.includes("for (const { index: i, wave } of effectiveBlockOrder)") &&
        orchestrator.includes("blockOrder");
      return probe(id, category, expected, ok, `waveOrdering=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown atom_wave_plan probe");
  }
}

function probeResourceWaveBudget(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistParallelWaveProbeResult {
  const orchestrator = orchestratorSource();
  const prompts = promptsSource();
  const rateLimiter = rateLimiterSource();

  switch (id) {
    case "swave.rate_limiter_parallel_safety": {
      const ok =
        rateLimiter.includes("maxCallsPerMinute") &&
        rateLimiter.includes("minDelayBetweenCalls") &&
        rateLimiter.includes("BudgetExceededError");
      return probe(id, category, expected, ok, `parallelSafety=${ok}`);
    }
    case "swave.resource_plan_wave_budget_link": {
      const ok =
        prompts.includes("RESOURCE PLAN:") &&
        prompts.includes("Blocks with NO dependencies can run IN PARALLEL");
      return probe(id, category, expected, ok, `resourceWaveLink=${ok}`);
    }
    case "swave.orchestrator_pre_exec_wave_gate": {
      const ok =
        hasProductionExport("validateStrategistParallelWave") &&
        orchestrator.includes("validateStrategistParallelWave(");
      return probe(id, category, expected, ok, `preExecWaveGate=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown resource_wave_budget probe");
  }
}

function probeBaselineLink(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistParallelWaveProbeResult {
  switch (id) {
    case "swave.b06_block_handoff_entry": {
      const handoff = getForgeP03B06ToB07Handoff();
      const ok =
        handoff.targetBlock.blockId === "P03-B07" &&
        handoff.targetBlock.entryAtom === "P03-B07-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "swave.b06_sealed_resource_budget_probes": {
      const handoff = getForgeP03B06ToB07Handoff();
      const coverage = summarizeStrategistResourceBudgetCoverage(
        getActiveStrategistResourceBudgetContract(),
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
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistParallelWaveBaseline,
): StrategistParallelWaveProbeResult {
  switch (id) {
    case "swave.source_block_gate_ref": {
      const handoff = getForgeP03B06ToB07Handoff();
      const coverage = summarizeStrategistResourceBudgetCoverage(
        getActiveStrategistResourceBudgetContract(),
      );
      const ok =
        fixture.sourceBlockGate.atom === "P03-B06-A10" &&
        fixture.sourceBlockGate.resourceBudgetProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P03_B06_SEALED_ATOM_COUNT &&
        handoff.atom === "P03-B06-A10";
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.resourceBudgetProbeCount}`,
      );
    }
    case "swave.probe_runner_exported": {
      const ok = productionParallelWaveSource().includes(
        "export function runStrategistParallelWaveProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "swave.known_gaps_documented": {
      const expectedFail = FORGE_STRATEGIST_PARALLEL_WAVE_A01_PROBE_MATRIX.filter(
        p => p.expected === "FAIL",
      ).length;
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
    case "swave.empty_decompose_boundary": {
      const result = assessStrategistParallelWaveInputBoundary("");
      const ok =
        hasProductionExport("assessStrategistParallelWaveInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, acceptable=${result.acceptable}`,
      );
    }
    case "swave.whitespace_decompose_boundary": {
      const result = assessStrategistParallelWaveInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessStrategistParallelWaveInputBoundary") &&
        result.disposition === "whitespace_only" &&
        result.acceptable === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, acceptable=${result.acceptable}`,
      );
    }
    case "swave.long_decompose_truncation_boundary": {
      const longDecompose = "x".repeat(STRATEGIST_PARALLEL_WAVE_DECOMPOSE_MAX_LENGTH + 500);
      const result = assessStrategistParallelWaveInputBoundary(longDecompose);
      const ok =
        hasProductionExport("assessStrategistParallelWaveInputBoundary") &&
        result.disposition === "exceeds_max_length" &&
        result.truncated === true &&
        result.normalizedDecompose.length === STRATEGIST_PARALLEL_WAVE_DECOMPOSE_MAX_LENGTH &&
        result.acceptable === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, truncated=${result.truncated}, len=${result.normalizedDecompose.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistParallelWaveBaseline,
): StrategistParallelWaveProbeResult {
  switch (id) {
    case "swave.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateStrategistParallelWaveBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "swave.malformed_decompose_guard": {
      const boundary = assessStrategistParallelWaveInputBoundary("bad\0decompose");
      const ok =
        hasProductionExport("assessStrategistParallelWaveInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false;
      return probe(id, category, expected, ok, `detail=${boundary.detail}`);
    }
    case "swave.min_category_probes": {
      const underflow = { ...fixture, probes: fixture.probes.filter(p => p.category !== "nogo_path") };
      const ok = validateStrategistParallelWaveBaseline(underflow).valid === false;
      return probe(id, category, expected, ok, `rejectsUnderflow=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistParallelWaveProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "swave.recovery_sequential_fallback": {
      const ok =
        orchestrator.includes("Within each wave, blocks run sequentially") ||
        orchestrator.includes("shared file system safety");
      return probe(id, category, expected, ok, `sequentialFallback=${ok}`);
    }
    case "swave.recovery_wave_checkpoint": {
      const ok =
        orchestrator.includes("createPoint(\"block\"") &&
        orchestrator.includes("effectiveBlockOrder") &&
        orchestrator.includes("resumeFromBlock");
      return probe(id, category, expected, ok, `waveCheckpoint=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistParallelWaveProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "swave.nogo_invalid_wave_plan": {
      const ok =
        orchestrator.includes("validateStrategistParallelWave(") ||
        orchestrator.includes("invalid wave plan") ||
        orchestrator.includes("wave plan rejected");
      return probe(id, category, expected, ok, `invalidWavePlanGate=${ok}`);
    }
    case "swave.exported_wave_validator": {
      const ok =
        hasProductionExport("validateStrategistParallelWave") &&
        orchestrator.includes("validateStrategistParallelWave(");
      return probe(id, category, expected, ok, `waveValidator=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: StrategistParallelWaveCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistParallelWaveBaseline,
): StrategistParallelWaveProbeResult {
  switch (category) {
    case "wave_versioning":
      return probeWaveVersioning(id, category, expected, fixture);
    case "block_wave_plan":
      return probeBlockWavePlan(id, category, expected);
    case "atom_wave_plan":
      return probeAtomWavePlan(id, category, expected);
    case "resource_wave_budget":
      return probeResourceWaveBudget(id, category, expected);
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

export function runStrategistParallelWaveProbes(
  fixture: StrategistParallelWaveBaseline = loadStrategistParallelWaveBaseline(),
): StrategistParallelWaveProbeResult[] {
  return fixture.probes.map(entry =>
    runSingleProbe(entry.id, entry.category, entry.expected, fixture),
  );
}
