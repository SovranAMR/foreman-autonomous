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

export const FORGE_STRATEGIST_DEPENDENCY_DAG_VERSION = "1.0.0-a04";

export const STRATEGIST_DEPENDENCY_DAG_DECOMPOSE_MAX_LENGTH = 64000;

export type StrategistDependencyDagInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface StrategistDependencyDagInputBoundary {
  disposition: StrategistDependencyDagInputDisposition;
  acceptable: boolean;
  normalizedDecompose: string;
  truncated: boolean;
  detail: string;
}

/**
 * Assess decompose output boundary conditions before dependency DAG production (P03-B04-A04).
 */
export function assessStrategistDependencyDagInputBoundary(
  decomposeOutput: string,
): StrategistDependencyDagInputBoundary {
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
    const disposition: StrategistDependencyDagInputDisposition =
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
  if (normalizedDecompose.length > STRATEGIST_DEPENDENCY_DAG_DECOMPOSE_MAX_LENGTH) {
    normalizedDecompose = normalizedDecompose.slice(0, STRATEGIST_DEPENDENCY_DAG_DECOMPOSE_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedDecompose,
    truncated,
    detail: truncated
      ? `decompose truncated to ${STRATEGIST_DEPENDENCY_DAG_DECOMPOSE_MAX_LENGTH} characters`
      : "valid decompose output",
  };
}

export interface StrategistDependencyDagRecoveryHints {
  blocks?: string[];
  blockDeps?: number[][];
  confidence?: number;
  reasoning?: string;
}

export interface StrategistDependencyDagRecoveryResult {
  recovered: boolean;
  dagValid: boolean;
  composedDecompose: string;
  blocks: string[];
  blockDeps: number[][];
  blockCount: number;
  parseErrors: string[];
  detail: string;
}

const INFORMAL_BLOCK_LINE = /^block\s*(\d+)\s*[:=\-]\s*(.+)$/i;

function sanitizeBlockDeps(blockDeps: number[][], blockCount: number): number[][] {
  return blockDeps.map((deps, index) =>
    [...new Set(deps.filter(dep => dep >= 0 && dep < blockCount && dep !== index))],
  );
}

function blockDepsHasCycle(blockDeps: number[][], blockCount: number): boolean {
  const visiting = new Set<number>();
  const visited = new Set<number>();

  function dfs(node: number): boolean {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const dep of blockDeps[node] ?? []) {
      if (dep >= 0 && dep < blockCount && dfs(dep)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  for (let i = 0; i < blockCount; i++) {
    if (dfs(i)) return true;
  }
  return false;
}

function formatDependenciesField(blockDeps: number[][]): string {
  const entries: string[] = [];
  for (let i = 0; i < blockDeps.length; i++) {
    const deps = blockDeps[i] ?? [];
    if (deps.length === 0) continue;
    const depNums = deps.map(dep => dep + 1).join(",");
    entries.push(`${i + 1}→${depNums}`);
  }
  return entries.length > 0 ? entries.join(", ") : "none";
}

/**
 * Infer sequential block dependencies when DEPENDENCIES field is missing (P03-B04-A03).
 */
export function inferBlockDependenciesFromOrder(blockCount: number): number[][] {
  const deps: number[][] = Array.from({ length: blockCount }, () => []);
  for (let i = 1; i < blockCount; i++) {
    deps[i].push(i - 1);
  }
  return deps;
}

/**
 * Restructure malformed dependency graph into valid DAG plan (P03-B04-A03).
 */
export function recoverStrategistDependencyDag(
  failedParse: string,
  hints: StrategistDependencyDagRecoveryHints = {},
): StrategistDependencyDagRecoveryResult {
  const parseErrors: string[] = [];

  if (failedParse.includes("\0")) {
    return {
      recovered: false,
      dagValid: false,
      composedDecompose: "",
      blocks: [],
      blockDeps: [],
      blockCount: 0,
      parseErrors: ["null_byte_in_decompose"],
      detail: "cannot recover null-byte decompose output",
    };
  }

  const trimmed = failedParse.trim();
  if (trimmed.length === 0) {
    return {
      recovered: false,
      dagValid: false,
      composedDecompose: "",
      blocks: [],
      blockDeps: [],
      blockCount: 0,
      parseErrors: ["empty_decompose"],
      detail: "cannot recover empty decompose output",
    };
  }

  const direct = parseDecomposeResponse(failedParse);
  if (direct.ok) {
    const blockCount = direct.data.blocks.length;
    let blockDeps = sanitizeBlockDeps(direct.data.blockDeps, blockCount);
    if (blockDeps.every(deps => deps.length === 0)) {
      blockDeps = inferBlockDependenciesFromOrder(blockCount);
      parseErrors.push("missing_deps_inferred");
    }
    if (blockDepsHasCycle(blockDeps, blockCount)) {
      blockDeps = inferBlockDependenciesFromOrder(blockCount);
      parseErrors.push("cycle_repaired");
    }
    const depsField = formatDependenciesField(blockDeps);
    const composedDecompose = failedParse.includes("DEPENDENCIES:")
      ? failedParse
      : [
          trimmed,
          `DEPENDENCIES: ${depsField}`,
        ].join("\n");
    const reparsed = parseDecomposeResponse(composedDecompose);
    const dagValid =
      reparsed.ok === true &&
      !blockDepsHasCycle(blockDeps, blockCount) &&
      blockDeps.every((deps, index) =>
        deps.every(dep => dep >= 0 && dep < blockCount && dep !== index),
      );
    return {
      recovered: true,
      dagValid,
      composedDecompose: dagValid ? composedDecompose : "",
      blocks: direct.data.blocks,
      blockDeps,
      blockCount,
      parseErrors,
      detail: dagValid
        ? `direct parse succeeded with ${blockCount} blocks and valid DAG`
        : "direct parse deps not DAG-valid",
    };
  }

  let blocks = [...(hints.blocks ?? [])];
  let reasoning = hints.reasoning;
  const confidence = hints.confidence ?? 0.75;

  const reasoningMatch = failedParse.match(
    /REASONING:\s*(.+?)(?:\n(?:OUTPUT|Block\s*\d|CONFIDENCE|DEPENDENCIES|\d+\.)|$)/is,
  );
  if (reasoningMatch && !reasoning) {
    reasoning = reasoningMatch[1].trim();
  }

  for (const line of failedParse.split("\n")) {
    const candidate = line.trim();
    if (!candidate) continue;

    const blockMatch = candidate.match(INFORMAL_BLOCK_LINE);
    if (blockMatch) {
      blocks.push(blockMatch[2].trim());
      continue;
    }

    const numberedMatch = candidate.match(/^(\d+)\.\s*(.+)$/);
    if (numberedMatch) {
      blocks.push(numberedMatch[2].trim());
      continue;
    }

    const bulletMatch = candidate.match(/^[-*•]\s*(.+)$/);
    if (bulletMatch && bulletMatch[1].length > 5) {
      blocks.push(bulletMatch[1].trim());
    }
  }

  blocks = [...new Set(blocks.map(block => block.trim()).filter(block => block.length > 0))];
  if (blocks.length > 8) {
    blocks = blocks.slice(0, 8);
  }

  if (blocks.length === 0) {
    parseErrors.push("missing_blocks");
    blocks = ["Recovered block pending strategist refinement"];
  }

  const outputLines = blocks.map((block, index) => {
    const cleaned = block.replace(/^Block\s*\d+\s*:\s*/i, "");
    return `Block ${index + 1}: ${cleaned}`;
  });

  const draftDecompose = [
    `REASONING: ${reasoning ?? "Recovered from failed dependency DAG parse"}`,
    "OUTPUT:",
    ...outputLines,
    `CONFIDENCE: ${confidence}`,
  ].join("\n");

  const draftParsed = parseDecomposeResponse(draftDecompose);
  const blockCount = draftParsed.ok ? draftParsed.data.blocks.length : blocks.length;
  let blockDeps = hints.blockDeps
    ? sanitizeBlockDeps(hints.blockDeps, blockCount)
    : draftParsed.ok
      ? sanitizeBlockDeps(draftParsed.data.blockDeps, blockCount)
      : inferBlockDependenciesFromOrder(blockCount);

  if (blockDeps.every(deps => deps.length === 0)) {
    blockDeps = inferBlockDependenciesFromOrder(blockCount);
    parseErrors.push("missing_deps_inferred");
  }
  if (blockDepsHasCycle(blockDeps, blockCount)) {
    blockDeps = inferBlockDependenciesFromOrder(blockCount);
    parseErrors.push("cycle_repaired");
  }

  const composedDecompose = [
    `REASONING: ${reasoning ?? "Recovered from failed dependency DAG parse"}`,
    "OUTPUT:",
    ...outputLines,
    `DEPENDENCIES: ${formatDependenciesField(blockDeps)}`,
    `CONFIDENCE: ${confidence}`,
  ].join("\n");

  const parsed = parseDecomposeResponse(composedDecompose);
  const dagValid =
    parsed.ok === true &&
    !blockDepsHasCycle(blockDeps, blockCount) &&
    blockDeps.every((deps, index) =>
      deps.every(dep => dep >= 0 && dep < blockCount && dep !== index),
    );
  const recovered = parsed.ok === true && parsed.data.blocks.length >= 1;

  return {
    recovered,
    dagValid,
    composedDecompose: dagValid ? composedDecompose : "",
    blocks: parsed.ok ? parsed.data.blocks : blocks,
    blockDeps,
    blockCount: parsed.ok ? parsed.data.blocks.length : blocks.length,
    parseErrors,
    detail: dagValid
      ? `valid DAG plan with ${parsed.ok ? parsed.data.blocks.length : 0} blocks`
      : `recovery incomplete: ${parseErrors.join(", ") || "parse failed"}`,
  };
}

export interface StrategistDependencyDagProbeMatrixValidationIssue {
  kind:
    | "missing_result"
    | "extra_result"
    | "pass_mismatch"
    | "gap_misaligned"
    | "unexpected_mismatch"
    | "criterion_mismatch";
  probeId?: string;
  detail: string;
}

export interface StrategistDependencyDagProbeMatrixValidationResult {
  valid: boolean;
  issues: StrategistDependencyDagProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 */
export function validateStrategistDependencyDagProbeMatrix(
  results: StrategistDependencyDagProbeResult[],
  contract: StrategistDependencyDagContract = getActiveStrategistDependencyDagContract(),
): StrategistDependencyDagProbeMatrixValidationResult {
  const issues: StrategistDependencyDagProbeMatrixValidationIssue[] = [];
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
    } else if (contractProbe.expected === "FAIL") {
      if (result.aligned && result.actual === "FAIL") {
        gapAligned++;
      } else {
        issues.push({
          kind: "gap_misaligned",
          probeId: contractProbe.id,
          detail: `documented FAIL gap misaligned: expected=${result.expected} actual=${result.actual} (${result.detail})`,
        });
        unexpectedMismatches++;
      }
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

export interface StrategistDependencyDagProductionSliceResult {
  atom: "P03-B04-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: StrategistDependencyDagProbeResult[];
  summary: StrategistDependencyDagProbeSummary;
  matrixValidation: StrategistDependencyDagProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: recoverStrategistDependencyDag wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runStrategistDependencyDagProductionSlice(
  fixture: StrategistDependencyDagBaseline = loadStrategistDependencyDagBaseline(),
): StrategistDependencyDagProductionSliceResult {
  const contract = getActiveStrategistDependencyDagContract();
  const fixtureValidation = validateStrategistDependencyDagBaseline(fixture);
  const contractValidation = validateStrategistDependencyDagAgainstContract(fixture, contract);
  const results = runStrategistDependencyDagProbes(fixture);
  const summary = summarizeStrategistDependencyDagMatrix(results);
  const matrixValidation = validateStrategistDependencyDagProbeMatrix(results, contract);

  return {
    atom: "P03-B04-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface StrategistDependencyDagBoundarySliceResult {
  atom: "P03-B04-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: StrategistDependencyDagProbeResult[];
  boundaryResults: StrategistDependencyDagProbeResult[];
  matrixValidation: StrategistDependencyDagProbeMatrixValidationResult;
}

/**
 * Validate boundary-category probe matrix — A04 slice gate.
 */
export function validateStrategistDependencyDagBoundaryProbeMatrix(
  results: StrategistDependencyDagProbeResult[],
  contract: StrategistDependencyDagContract = getActiveStrategistDependencyDagContract(),
): StrategistDependencyDagProbeMatrixValidationResult {
  const boundaryProbes = listStrategistDependencyDagContractProbesByCategory("boundary", contract);
  const boundaryContract: StrategistDependencyDagContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateStrategistDependencyDagProbeMatrix(boundaryResults, boundaryContract);
}

/**
 * A04 boundary slice: contract-wired boundary probes (decompose input edge cases, probe runner,
 * documented gaps, out-of-range dep filtering) with zero unexpected mismatches.
 */
export function runStrategistDependencyDagBoundarySlice(
  fixture: StrategistDependencyDagBaseline = loadStrategistDependencyDagBaseline(),
): StrategistDependencyDagBoundarySliceResult {
  const contract = getActiveStrategistDependencyDagContract();
  const results = runStrategistDependencyDagProbes(fixture);
  const boundaryProbes = listStrategistDependencyDagContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateStrategistDependencyDagBoundaryProbeMatrix(results, contract);

  return {
    atom: "P03-B04-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

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

export type StrategistDependencyDagProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface StrategistDependencyDagProbeContract {
  id: string;
  category: StrategistDependencyDagCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: StrategistDependencyDagProbeDisposition;
  criterion: string;
}

export interface StrategistDependencyDagCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface StrategistDependencyDagCategoryContract {
  category: StrategistDependencyDagCategory;
  acceptance: StrategistDependencyDagCategoryAcceptance;
  probes: readonly StrategistDependencyDagProbeContract[];
}

export interface StrategistDependencyDagContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<StrategistDependencyDagCategory, StrategistDependencyDagCategoryContract>;
  probes: readonly StrategistDependencyDagProbeContract[];
}

export interface StrategistDependencyDagCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: StrategistDependencyDagCategory;
  detail: string;
}

export interface StrategistDependencyDagCoverageResult {
  valid: boolean;
  issues: StrategistDependencyDagCoverageIssue[];
}

function flattenStrategistDependencyDagCategoryProbes(
  categories: Record<StrategistDependencyDagCategory, StrategistDependencyDagCategoryContract>,
): readonly StrategistDependencyDagProbeContract[] {
  return STRATEGIST_DEPENDENCY_DAG_CATEGORIES.flatMap(category => categories[category].probes);
}

const STRATEGIST_DEPENDENCY_DAG_CATEGORY_CONTRACTS: Record<
  StrategistDependencyDagCategory,
  StrategistDependencyDagCategoryContract
> = {
  dag_versioning: {
    category: "dag_versioning",
    acceptance: {
      invariant:
        "Strategist dependency DAG baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sdag.version_tagged",
        category: "dag_versioning",
        description: "Strategist dependency DAG baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist dependency DAG baseline declares semver version field",
      },
      {
        id: "sdag.atom_tagged",
        category: "dag_versioning",
        description: "Strategist dependency DAG baseline declares P03-B04-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist dependency DAG baseline declares P03-B04-A01 atom id",
      },
      {
        id: "sdag.harness_version_exported",
        category: "dag_versioning",
        description: "FORGE_STRATEGIST_DEPENDENCY_DAG_VERSION exported for dependency DAG harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_STRATEGIST_DEPENDENCY_DAG_VERSION exported for dependency DAG harness",
      },
    ],
  },
  block_dag: {
    category: "block_dag",
    acceptance: {
      invariant:
        "Block dependency graph is declared in strategist prompt, parsed by parser and consumed by orchestrator waves.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sdag.parser_block_deps",
        category: "block_dag",
        description: "parseDecomposeResponse exports blockDeps dependency graph from DEPENDENCIES field",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseDecomposeResponse exports blockDeps dependency graph from DEPENDENCIES field",
      },
      {
        id: "sdag.prompt_block_dependencies",
        category: "block_dag",
        description: "STRATEGIST_SYSTEM prompt declares DEPENDENCIES section for block ordering",
        expected: "PASS",
        disposition: "observed",
        criterion: "STRATEGIST_SYSTEM prompt declares DEPENDENCIES section for block ordering",
      },
      {
        id: "sdag.orchestrator_block_waves",
        category: "block_dag",
        description: "Orchestrator computeBlockWaves derives execution waves from blockDeps graph",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator computeBlockWaves derives execution waves from blockDeps graph",
      },
      {
        id: "sdag.task_topological_sort",
        category: "block_dag",
        description: "TaskManager topologicalSort orders block tasks by dependsOn edges",
        expected: "PASS",
        disposition: "observed",
        criterion: "TaskManager topologicalSort orders block tasks by dependsOn edges",
      },
    ],
  },
  atom_dag: {
    category: "atom_dag",
    acceptance: {
      invariant:
        "Atom dependency graph is declared in strategist prompt, parsed by parser and consumed by orchestrator waves.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sdag.parser_atom_deps",
        category: "atom_dag",
        description: "parseAtomizeResponse exports atomDeps dependency graph from atomize output",
        expected: "FAIL",
        disposition: "gap",
        criterion: "parseAtomizeResponse exports atomDeps dependency graph from atomize output",
      },
      {
        id: "sdag.prompt_atom_dependencies",
        category: "atom_dag",
        description: "STRATEGIST_SYSTEM prompt declares ATOM DEPENDENCIES section for atom ordering",
        expected: "FAIL",
        disposition: "gap",
        criterion: "STRATEGIST_SYSTEM prompt declares ATOM DEPENDENCIES section for atom ordering",
      },
      {
        id: "sdag.orchestrator_atom_waves",
        category: "atom_dag",
        description: "Orchestrator computeAtomWaves derives execution waves from atom dependency graph",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator computeAtomWaves derives execution waves from atom dependency graph",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Dependency DAG baseline links to sealed P03-B03 atomization block gate and B04 handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sdag.b03_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P03_B03_TO_B04_HANDOFF_V1 targets P03-B04-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P03_B03_TO_B04_HANDOFF_V1 targets P03-B04-A01 entry atom",
      },
      {
        id: "sdag.b03_sealed_atomization_probes",
        category: "baseline_link",
        description: "P03-B03→B04 handoff sealed probeCount matches active atomization contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P03-B03→B04 handoff sealed probeCount matches active atomization contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Dependency boundary assessment filters invalid block indices; probe runner and documented gaps wired.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sdag.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P03-B03 atomization block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P03-B03 atomization block gate source artifacts",
      },
      {
        id: "sdag.probe_runner_exported",
        category: "boundary",
        description: "runStrategistDependencyDagProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runStrategistDependencyDagProbes executes contract-wired probe matrix",
      },
      {
        id: "sdag.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL dependency DAG gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL dependency DAG gap",
      },
      {
        id: "sdag.out_of_range_dep_filtered",
        category: "boundary",
        description: "parseBlockDependencies filters out-of-range and self-referential block indices",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseBlockDependencies filters out-of-range and self-referential block indices",
      },
      {
        id: "sdag.empty_decompose_boundary",
        category: "boundary",
        description: "assessStrategistDependencyDagInputBoundary rejects empty decompose output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistDependencyDagInputBoundary rejects empty decompose output",
      },
      {
        id: "sdag.whitespace_decompose_boundary",
        category: "boundary",
        description: "assessStrategistDependencyDagInputBoundary rejects whitespace-only decompose output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistDependencyDagInputBoundary rejects whitespace-only decompose output",
      },
      {
        id: "sdag.long_decompose_truncation_boundary",
        category: "boundary",
        description: "assessStrategistDependencyDagInputBoundary truncates decompose exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistDependencyDagInputBoundary truncates decompose exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Malformed decompose guard exists; fixture validation rejects invalid versions.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sdag.invalid_version_rejected",
        category: "failure_path",
        description: "validateStrategistDependencyDagBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateStrategistDependencyDagBaseline rejects unexpected fixture version",
      },
      {
        id: "sdag.malformed_decompose_guard",
        category: "failure_path",
        description: "assessStrategistDependencyDagInputBoundary rejects null-byte decompose output safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessStrategistDependencyDagInputBoundary rejects null-byte decompose output safely",
      },
      {
        id: "sdag.min_category_probes",
        category: "failure_path",
        description: "validateStrategistDependencyDagBaseline enforces per-category minimum probe counts",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateStrategistDependencyDagBaseline enforces per-category minimum probe counts",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Dependency recovery restructures malformed graphs and falls back when DEPENDENCIES field is missing.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sdag.recovery_dag_repair",
        category: "recovery_path",
        description: "recoverStrategistDependencyDag restructures malformed dependency graph into valid DAG plan",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverStrategistDependencyDag restructures malformed dependency graph into valid DAG plan",
      },
      {
        id: "sdag.recovery_missing_deps_fallback",
        category: "recovery_path",
        description: "Dependency recovery falls back when DEPENDENCIES field is missing from decompose output",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Dependency recovery falls back when DEPENDENCIES field is missing from decompose output",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Pipeline halts on cyclic block dependencies; NO-GO gate rejects invalid dependency graphs.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sdag.nogo_cycle_block_halt",
        category: "nogo_path",
        description: "Pipeline halts decompose when block dependency graph contains a cycle",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Pipeline halts decompose when block dependency graph contains a cycle",
      },
      {
        id: "sdag.nogo_invalid_dep_graph",
        category: "nogo_path",
        description: "NO-GO gate rejects run when dependency graph references non-existent block indices",
        expected: "FAIL",
        disposition: "gap",
        criterion: "NO-GO gate rejects run when dependency graph references non-existent block indices",
      },
      {
        id: "sdag.exported_dag_validator",
        category: "nogo_path",
        description: "validateStrategistDependencyDag exported for orchestrator dependency graph checks",
        expected: "FAIL",
        disposition: "gap",
        criterion: "validateStrategistDependencyDag exported for orchestrator dependency graph checks",
      },
    ],
  },
};

export const FORGE_STRATEGIST_DEPENDENCY_DAG_CONTRACT_V1: StrategistDependencyDagContract = {
  version: "1.0.0",
  atom: "P03-B04-A06",
  purpose:
    "Typed strategist dependency DAG contract with measurable probes for block/atom graphs, boundary and recovery paths.",
  categories: STRATEGIST_DEPENDENCY_DAG_CATEGORY_CONTRACTS,
  probes: flattenStrategistDependencyDagCategoryProbes(STRATEGIST_DEPENDENCY_DAG_CATEGORY_CONTRACTS),
};

export function getActiveStrategistDependencyDagContract(): StrategistDependencyDagContract {
  return FORGE_STRATEGIST_DEPENDENCY_DAG_CONTRACT_V1;
}

export function getStrategistDependencyDagCategoryContract(
  category: StrategistDependencyDagCategory,
  contract: StrategistDependencyDagContract = getActiveStrategistDependencyDagContract(),
): StrategistDependencyDagCategoryContract {
  return contract.categories[category];
}

export function listStrategistDependencyDagContractProbeIds(
  contract: StrategistDependencyDagContract = getActiveStrategistDependencyDagContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listStrategistDependencyDagProbesByDisposition(
  disposition: StrategistDependencyDagProbeDisposition,
  contract: StrategistDependencyDagContract = getActiveStrategistDependencyDagContract(),
): StrategistDependencyDagProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listStrategistDependencyDagContractProbesByCategory(
  category: StrategistDependencyDagCategory,
  contract: StrategistDependencyDagContract = getActiveStrategistDependencyDagContract(),
): StrategistDependencyDagProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeStrategistDependencyDagCoverage(
  contract: StrategistDependencyDagContract = getActiveStrategistDependencyDagContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<StrategistDependencyDagCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<StrategistDependencyDagProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    StrategistDependencyDagCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<StrategistDependencyDagProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };

  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of STRATEGIST_DEPENDENCY_DAG_CATEGORIES) {
    const categoryContract = contract.categories[category];
    byCategory[category] = {
      probeCount: categoryContract.probes.length,
      invariant: categoryContract.acceptance.invariant,
    };
    totalProbes += categoryContract.probes.length;
    for (const probe of categoryContract.probes) {
      if (probe.expected === "PASS") {
        expectedPass++;
      } else {
        expectedFail++;
      }
      byDisposition[probe.disposition]++;
    }
  }

  return { totalProbes, expectedPass, expectedFail, byCategory, byDisposition };
}

export function validateStrategistDependencyDagCoverage(
  contract: StrategistDependencyDagContract = getActiveStrategistDependencyDagContract(),
): StrategistDependencyDagCoverageResult {
  const issues: StrategistDependencyDagCoverageIssue[] = [];

  for (const category of STRATEGIST_DEPENDENCY_DAG_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < STRATEGIST_DEPENDENCY_DAG_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${STRATEGIST_DEPENDENCY_DAG_A01_MIN_PROBES[category]}`,
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
    for (const probeEntry of categoryContract.probes) {
      if (probeEntry.criterion.trim().length <= 10) {
        issues.push({
          kind: "missing_criterion",
          probeId: probeEntry.id,
          detail: `${probeEntry.id} criterion too short`,
        });
      }
    }
  }

  const ids = listStrategistDependencyDagContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeStrategistDependencyDagCoverage(contract);
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

  for (const probeEntry of contract.probes) {
    if (!probeEntry.id.startsWith("sdag.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probeEntry.id,
        detail: `${probeEntry.id} missing sdag. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateStrategistDependencyDagAgainstContract(
  fixture: StrategistDependencyDagBaseline,
  contract: StrategistDependencyDagContract = getActiveStrategistDependencyDagContract(),
): StrategistDependencyDagValidationResult {
  const issues: StrategistDependencyDagValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  for (const category of STRATEGIST_DEPENDENCY_DAG_CATEGORIES) {
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

  for (const probe of contract.probes) {
    if (!fixtureIds.has(probe.id)) {
      issues.push({ kind: "missing_probe", probeId: probe.id, detail: `fixture missing ${probe.id}` });
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
    if (entry.description !== expected.description) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `description mismatch for ${entry.id}`,
      });
    }
    if (entry.category !== expected.category) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `category mismatch fixture=${entry.category} contract=${expected.category}`,
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

  const contractAlignment = validateStrategistDependencyDagAgainstContract(
    fixture,
    getActiveStrategistDependencyDagContract(),
  );
  issues.push(...contractAlignment.issues);

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
      const contract = getActiveStrategistDependencyDagContract();
      const expectedFail = contract.probes.filter(p => p.expected === "FAIL").length;
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount === expectedFail && failCount >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, contractExpectedFail=${expectedFail}`,
      );
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
    case "sdag.empty_decompose_boundary": {
      const result = assessStrategistDependencyDagInputBoundary("");
      const ok =
        hasProductionExport("assessStrategistDependencyDagInputBoundary") &&
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
    case "sdag.whitespace_decompose_boundary": {
      const result = assessStrategistDependencyDagInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessStrategistDependencyDagInputBoundary") &&
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
    case "sdag.long_decompose_truncation_boundary": {
      const longDecompose = "x".repeat(STRATEGIST_DEPENDENCY_DAG_DECOMPOSE_MAX_LENGTH + 500);
      const result = assessStrategistDependencyDagInputBoundary(longDecompose);
      const ok =
        hasProductionExport("assessStrategistDependencyDagInputBoundary") &&
        result.disposition === "exceeds_max_length" &&
        result.truncated === true &&
        result.normalizedDecompose.length === STRATEGIST_DEPENDENCY_DAG_DECOMPOSE_MAX_LENGTH &&
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
    case "sdag.malformed_decompose_guard": {
      const boundary = assessStrategistDependencyDagInputBoundary("bad\0decompose");
      const ok =
        hasProductionExport("assessStrategistDependencyDagInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false;
      return probe(id, category, expected, ok, `detail=${boundary.detail}`);
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
      const malformed = `REASONING: Need dependency DAG plan
Here are the steps:
Block 1: Setup dependency DAG types
Block 2: Wire block dependency parser seam
Block 3: Add dependency DAG baseline tests
DEPENDENCIES: 2→99, 3→3, 4→1
CONFIDENCE: 0.8`;
      const recovery = recoverStrategistDependencyDag(malformed);
      const ok =
        recovery.recovered === true &&
        recovery.dagValid === true &&
        recovery.blockCount >= 3 &&
        !blockDepsHasCycle(recovery.blockDeps, recovery.blockCount) &&
        recovery.blocks.some(block => block.includes("dependency DAG types")) &&
        recovery.blocks.some(block => block.includes("dependency parser seam")) &&
        recovery.blocks.some(block => block.includes("dependency DAG baseline"));
      return probe(
        id,
        category,
        expected,
        ok,
        `recovered=${recovery.recovered}, dagValid=${recovery.dagValid}, blocks=${recovery.blockCount}, ${recovery.detail}`,
      );
    }
    case "sdag.recovery_missing_deps_fallback": {
      const missingDeps = `REASONING: Blocks without explicit deps
OUTPUT:
Block 1: Root dependency block
Block 2: Depends on prior work implicitly
Block 3: Final dependency integration
CONFIDENCE: 0.75`;
      const recovery = recoverStrategistDependencyDag(missingDeps);
      const inferred = inferBlockDependenciesFromOrder(recovery.blockCount);
      const ok =
        recovery.recovered === true &&
        recovery.dagValid === true &&
        recovery.blockCount >= 2 &&
        recovery.blockDeps.length === recovery.blockCount &&
        recovery.blockDeps[1]?.includes(0) &&
        inferred[1]?.includes(0) &&
        recovery.composedDecompose.includes("DEPENDENCIES:");
      return probe(
        id,
        category,
        expected,
        ok,
        `recovered=${recovery.recovered}, inferred=${recovery.parseErrors.includes("missing_deps_inferred")}, ${recovery.detail}`,
      );
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
  const contract = getActiveStrategistDependencyDagContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}
