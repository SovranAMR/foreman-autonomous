/**
 * FOREMAN — Strategist Dependency DAG Baseline (P03-B04)
 *
 * Measures block and atom dependency graph behavior on sealed P03-B03
 * atomization block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import strategistDependencyDagBaseline from "./fixtures/forge-strategist-dependency-dag-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP03B03ToB04Handoff,
  getActiveStrategistAtomizationContract,
  summarizeStrategistAtomizationCoverage,
  EXPECTED_P03_B03_SEALED_ATOM_COUNT,
} from "./forge-p03-strategist-atomization.js";
import { parseDecomposeResponse, parseAtomizeResponse } from "./parser.js";

export const FORGE_STRATEGIST_DEPENDENCY_DAG_VERSION = "1.0.0-a01";

export const STRATEGIST_DEPENDENCY_DAG_CATEGORIES = [
  "dag_versioning",
  "block_dag",
  "atom_dag",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type StrategistDependencyDagCategory = (typeof STRATEGIST_DEPENDENCY_DAG_CATEGORIES)[number];

export const STRATEGIST_DEPENDENCY_DAG_A01_MIN_PROBES: Readonly<
  Record<StrategistDependencyDagCategory, number>
> = {
  dag_versioning: 3,
  block_dag: 3,
  atom_dag: 3,
  baseline_link: 2,
  boundary: 3,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

export interface StrategistDependencyDagFixtureEntry {
  id: string;
  category: StrategistDependencyDagCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface StrategistDependencyDagBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    atomizationProbeCount: number;
    sealedAtomCount: number;
  };
  probes: StrategistDependencyDagFixtureEntry[];
}

export interface StrategistDependencyDagProbeResult {
  id: string;
  category: StrategistDependencyDagCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface StrategistDependencyDagProbeSummary {
  total: number;
  aligned: number;
  mismatches: StrategistDependencyDagProbeResult[];
  knownGaps: StrategistDependencyDagProbeResult[];
  byCategory: Record<
    StrategistDependencyDagCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface StrategistDependencyDagValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: StrategistDependencyDagCategory;
  detail: string;
}

export interface StrategistDependencyDagValidationResult {
  valid: boolean;
  issues: StrategistDependencyDagValidationIssue[];
}

/** A01 baseline probe matrix — fixture and harness must stay aligned. */
export const FORGE_STRATEGIST_DEPENDENCY_DAG_A01_PROBE_MATRIX: readonly StrategistDependencyDagFixtureEntry[] =
  strategistDependencyDagBaseline.probes as StrategistDependencyDagFixtureEntry[];

export function getStrategistDependencyDagA01ExpectedFailCount(): number {
  return FORGE_STRATEGIST_DEPENDENCY_DAG_A01_PROBE_MATRIX.filter(p => p.expected === "FAIL").length;
}

export function loadStrategistDependencyDagBaseline(): StrategistDependencyDagBaseline {
  return strategistDependencyDagBaseline as StrategistDependencyDagBaseline;
}

export function validateStrategistDependencyDagBaseline(
  fixture: StrategistDependencyDagBaseline,
): StrategistDependencyDagValidationResult {
  const issues: StrategistDependencyDagValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P03-B04-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    STRATEGIST_DEPENDENCY_DAG_CATEGORIES.map(category => [category, 0]),
  ) as Record<StrategistDependencyDagCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of STRATEGIST_DEPENDENCY_DAG_CATEGORIES) {
    const min = STRATEGIST_DEPENDENCY_DAG_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_STRATEGIST_DEPENDENCY_DAG_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_STRATEGIST_DEPENDENCY_DAG_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_STRATEGIST_DEPENDENCY_DAG_A01_PROBE_MATRIX) {
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

  const handoff = getForgeP03B03ToB04Handoff();
  const atomizationCoverage = summarizeStrategistAtomizationCoverage(getActiveStrategistAtomizationContract());

  if (fixture.sourceBlockGate.atom !== "P03-B03-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P03-B03-A10`,
    });
  }
  if (fixture.sourceBlockGate.atomizationProbeCount !== atomizationCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.atomizationProbeCount=${fixture.sourceBlockGate.atomizationProbeCount} ` +
        `contract=${atomizationCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P03_B03_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P03_B03_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P03_B03_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B03 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P03_B03_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P03-B04-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `B03 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P03-B04-A01`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length === 0) {
    issues.push({
      kind: "missing_category",
      detail: "fixture must document at least one measurable FAIL dependency DAG gap",
    });
  }

  return { valid: issues.length === 0, issues };
}

export function summarizeStrategistDependencyDagMatrix(
  results: StrategistDependencyDagProbeResult[],
): StrategistDependencyDagProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as StrategistDependencyDagProbeSummary["byCategory"];
  for (const category of STRATEGIST_DEPENDENCY_DAG_CATEGORIES) {
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

export function listStrategistDependencyDagProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistDependencyDagBaseline = loadStrategistDependencyDagBaseline(),
): StrategistDependencyDagFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listStrategistDependencyDagKnownGaps(
  results: StrategistDependencyDagProbeResult[],
): StrategistDependencyDagProbeResult[] {
  return summarizeStrategistDependencyDagMatrix(results).knownGaps;
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
  category: StrategistDependencyDagCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): StrategistDependencyDagProbeResult {
  const actual = outcome(ok);
  return {
    id,
    category,
    expected,
    actual,
    aligned: actual === expected,
    detail,
    criterion,
  };
}

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function taskManagerSource(): string {
  return readSrc("task-manager.ts");
}

function productionDependencyDagSource(): string {
  return readSrc("forge-p03-strategist-dependency-dag.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionDependencyDagSource());
}

const SAMPLE_BLOCK_DECOMPOSE_WITH_DEPS = `REASONING: Dependency-ordered blocks
OUTPUT:
Block 1: Setup dependency DAG types
Block 2: Wire block dependency parser seam
Block 3: Add dependency DAG baseline tests
DEPENDENCIES: 2→1, 3→1,2
CONFIDENCE: 0.85`;

const SAMPLE_ATOMIZE_OUTPUT = `OUTPUT:
1. Read parser dependency fields
2. Wire orchestrator wave compute
3. Add dependency DAG tests
CONFIDENCE: 0.8`;

function probeDagVersioning(
  id: string,
  category: StrategistDependencyDagCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistDependencyDagBaseline,
): StrategistDependencyDagProbeResult {
  switch (id) {
    case "sdag.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "sdag.atom_tagged": {
      const ok = fixture.atom === "P03-B04-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "sdag.harness_version_exported": {
      const ok = FORGE_STRATEGIST_DEPENDENCY_DAG_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_STRATEGIST_DEPENDENCY_DAG_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown dag_versioning probe");
  }
}

function probeBlockDag(
  id: string,
  category: StrategistDependencyDagCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistDependencyDagProbeResult {
  const orchestrator = orchestratorSource();
  const prompts = promptsSource();

  switch (id) {
    case "sdag.parser_block_deps": {
      const parsed = parseDecomposeResponse(SAMPLE_BLOCK_DECOMPOSE_WITH_DEPS);
      const ok =
        parsed.ok === true &&
        parsed.data.blockDeps.length === 3 &&
        parsed.data.blockDeps.some(deps => deps.length > 0);
      return probe(
        id,
        category,
        expected,
        ok,
        `blockDeps=${ok}, deps=${parsed.ok ? parsed.data.blockDeps.map(d => d.length).join(",") : "none"}`,
      );
    }
    case "sdag.prompt_block_dependencies": {
      const ok =
        prompts.includes("DEPENDENCIES:") &&
        prompts.includes("Blocks with NO dependencies can run IN PARALLEL");
      return probe(id, category, expected, ok, `dependenciesSection=${ok}`);
    }
    case "sdag.orchestrator_block_waves": {
      const ok =
        orchestrator.includes("computeBlockWaves(") &&
        orchestrator.includes("blockDeps");
      return probe(id, category, expected, ok, `blockWaves=${ok}`);
    }
    case "sdag.task_topological_sort": {
      const taskManager = taskManagerSource();
      const ok =
        taskManager.includes("topologicalSort(") &&
        orchestrator.includes("topologicalSort(") &&
        orchestrator.includes("dependsOn:");
      return probe(id, category, expected, ok, `topologicalSort=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown block_dag probe");
  }
}

function probeAtomDag(
  id: string,
  category: StrategistDependencyDagCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistDependencyDagProbeResult {
  const orchestrator = orchestratorSource();
  const prompts = promptsSource();

  switch (id) {
    case "sdag.parser_atom_deps": {
      const parsed = parseAtomizeResponse(SAMPLE_ATOMIZE_OUTPUT);
      const ok = parsed.ok === true && "atomDeps" in parsed.data;
      return probe(id, category, expected, ok, `atomDeps=${ok}`);
    }
    case "sdag.prompt_atom_dependencies": {
      const ok =
        prompts.includes("ATOM DEPENDENCIES:") ||
        prompts.includes("Atom dependencies:");
      return probe(id, category, expected, ok, `atomDependenciesSection=${ok}`);
    }
    case "sdag.orchestrator_atom_waves": {
      const ok = orchestrator.includes("computeAtomWaves(");
      return probe(id, category, expected, ok, `atomWaves=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown atom_dag probe");
  }
}

function probeBaselineLink(
  id: string,
  category: StrategistDependencyDagCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistDependencyDagProbeResult {
  switch (id) {
    case "sdag.b03_block_handoff_entry": {
      const handoff = getForgeP03B03ToB04Handoff();
      const ok =
        handoff.targetBlock.blockId === "P03-B04" &&
        handoff.targetBlock.entryAtom === "P03-B04-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "sdag.b03_sealed_atomization_probes": {
      const handoff = getForgeP03B03ToB04Handoff();
      const coverage = summarizeStrategistAtomizationCoverage(getActiveStrategistAtomizationContract());
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
  category: StrategistDependencyDagCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistDependencyDagBaseline,
): StrategistDependencyDagProbeResult {
  switch (id) {
    case "sdag.source_block_gate_ref": {
      const handoff = getForgeP03B03ToB04Handoff();
      const coverage = summarizeStrategistAtomizationCoverage(getActiveStrategistAtomizationContract());
      const ok =
        fixture.sourceBlockGate.atom === "P03-B03-A10" &&
        fixture.sourceBlockGate.atomizationProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P03_B03_SEALED_ATOM_COUNT &&
        handoff.atom === "P03-B03-A10";
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.atomizationProbeCount}`,
      );
    }
    case "sdag.probe_runner_exported": {
      const ok = productionDependencyDagSource().includes(
        "export function runStrategistDependencyDagProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "sdag.known_gaps_documented": {
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount >= 1;
      return probe(id, category, expected, ok, `documentedFail=${failCount}`);
    }
    case "sdag.out_of_range_dep_filtered": {
      const invalidDeps = `REASONING: invalid deps
OUTPUT:
Block 1: Root block
Block 2: Depends on invalid indices
Block 3: Self reference
DEPENDENCIES: 2→99, 3→3, 4→1
CONFIDENCE: 0.7`;
      const parsed = parseDecomposeResponse(invalidDeps);
      const ok =
        parsed.ok === true &&
        parsed.data.blocks.length === 3 &&
        parsed.data.blockDeps[1].every(dep => dep >= 0 && dep < 3) &&
        !parsed.data.blockDeps[2].includes(2);
      return probe(
        id,
        category,
        expected,
        ok,
        `filtered=${ok}, deps=${parsed.ok ? parsed.data.blockDeps.map(d => d.join(".")).join("|") : "none"}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: StrategistDependencyDagCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistDependencyDagBaseline,
): StrategistDependencyDagProbeResult {
  switch (id) {
    case "sdag.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateStrategistDependencyDagBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "sdag.min_category_probes": {
      const underflow = { ...fixture, probes: fixture.probes.filter(p => p.category !== "nogo_path") };
      const ok = validateStrategistDependencyDagBaseline(underflow).valid === false;
      return probe(id, category, expected, ok, `rejectsUnderflow=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: StrategistDependencyDagCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistDependencyDagProbeResult {
  switch (id) {
    case "sdag.recovery_dag_repair": {
      const ok = hasProductionExport("recoverStrategistDependencyDag");
      return probe(id, category, expected, ok, `recoveryRepair=${ok}`);
    }
    case "sdag.recovery_missing_deps_fallback": {
      const ok =
        hasProductionExport("recoverMissingBlockDependencies") ||
        hasProductionExport("inferBlockDependenciesFromOrder");
      return probe(id, category, expected, ok, `missingDepsFallback=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: StrategistDependencyDagCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistDependencyDagProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "sdag.nogo_cycle_block_halt": {
      const warnsCycle = orchestrator.includes("circular dependency — appending at end");
      const haltsOnCycle =
        orchestrator.includes("circular dependency") &&
        orchestrator.includes("return this.buildResult(false");
      const ok = haltsOnCycle && !warnsCycle;
      return probe(id, category, expected, ok, `cycleHalt=${ok}, warnsOnly=${warnsCycle}`);
    }
    case "sdag.nogo_invalid_dep_graph": {
      const ok =
        hasProductionExport("validateStrategistDependencyDagGraph") ||
        orchestrator.includes("invalid dependency graph");
      return probe(id, category, expected, ok, `invalidDepGraph=${ok}`);
    }
    case "sdag.exported_dag_validator": {
      const ok = hasProductionExport("validateStrategistDependencyDag");
      return probe(id, category, expected, ok, `dagValidator=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: StrategistDependencyDagCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistDependencyDagBaseline,
): StrategistDependencyDagProbeResult {
  switch (category) {
    case "dag_versioning":
      return probeDagVersioning(id, category, expected, fixture);
    case "block_dag":
      return probeBlockDag(id, category, expected);
    case "atom_dag":
      return probeAtomDag(id, category, expected);
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

export function runStrategistDependencyDagProbes(
  fixture: StrategistDependencyDagBaseline = loadStrategistDependencyDagBaseline(),
): StrategistDependencyDagProbeResult[] {
  return fixture.probes.map(entry =>
    runSingleProbe(entry.id, entry.category, entry.expected, fixture),
  );
}
