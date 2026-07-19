/**
 * FOREMAN — Strategist Block Production Contract Baseline (P03-B02)
 *
 * Measures block structure, dependency metadata and production contract wiring
 * on sealed P03-B01 strategist intent block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import strategistBlockContractBaseline from "./fixtures/forge-strategist-block-contract-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP03B01ToB02Handoff,
  getActiveStrategistIntentContract,
  summarizeStrategistIntentContractCoverage,
  recoverStrategistDecompose,
  type StrategistDecomposeRecoveryHints,
} from "./forge-p03-strategist-intent.js";
import { parseDecomposeResponse } from "./parser.js";

export const FORGE_STRATEGIST_BLOCK_CONTRACT_VERSION = "1.0.0-a05";

/** Maximum normalized decompose length before truncation (P03-B02-A01 boundary). */
export const STRATEGIST_BLOCK_DECOMPOSE_MAX_LENGTH = 64000;

export const EXPECTED_P03_B01_SEALED_ATOM_COUNT = 10;

export const STRATEGIST_BLOCK_CONTRACT_CATEGORIES = [
  "block_versioning",
  "block_structure",
  "block_metadata",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type StrategistBlockContractCategory = (typeof STRATEGIST_BLOCK_CONTRACT_CATEGORIES)[number];

export type StrategistBlockInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface StrategistBlockInputBoundary {
  disposition: StrategistBlockInputDisposition;
  acceptable: boolean;
  normalizedDecompose: string;
  truncated: boolean;
  detail: string;
}

/**
 * Assess decompose output boundary conditions before block production (P03-B02-A01).
 */
export function assessStrategistBlockInputBoundary(
  decomposeOutput: string,
): StrategistBlockInputBoundary {
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
    const disposition: StrategistBlockInputDisposition =
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
  if (normalizedDecompose.length > STRATEGIST_BLOCK_DECOMPOSE_MAX_LENGTH) {
    normalizedDecompose = normalizedDecompose.slice(0, STRATEGIST_BLOCK_DECOMPOSE_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedDecompose,
    truncated,
    detail: truncated
      ? `decompose truncated to ${STRATEGIST_BLOCK_DECOMPOSE_MAX_LENGTH} characters`
      : "valid decompose output",
  };
}

export interface StrategistBlockProductionRecoveryResult {
  recovered: boolean;
  contractCompliant: boolean;
  composedDecompose: string;
  blocks: string[];
  blockCount: number;
  parseErrors: string[];
  detail: string;
}

/**
 * Restructure failed block parse into contract-compliant production plan (P03-B02-A03).
 */
export function recoverStrategistBlockProduction(
  failedParse: string,
  hints: StrategistDecomposeRecoveryHints = {},
): StrategistBlockProductionRecoveryResult {
  const recovery = recoverStrategistDecompose(failedParse, hints);
  if (!recovery.recovered) {
    return {
      recovered: false,
      contractCompliant: false,
      composedDecompose: recovery.composedDecompose,
      blocks: recovery.blocks,
      blockCount: recovery.blockCount,
      parseErrors: recovery.parseErrors,
      detail: recovery.detail,
    };
  }

  const boundary = assessStrategistBlockInputBoundary(recovery.composedDecompose);
  const parsed = parseDecomposeResponse(recovery.composedDecompose);
  const contractCompliant =
    boundary.acceptable &&
    parsed.ok === true &&
    parsed.data.blocks.length >= 1 &&
    parsed.data.blocks.length <= 8;

  return {
    recovered: recovery.recovered,
    contractCompliant,
    composedDecompose: contractCompliant ? recovery.composedDecompose : "",
    blocks: parsed.ok ? parsed.data.blocks : recovery.blocks,
    blockCount: parsed.ok ? parsed.data.blocks.length : recovery.blockCount,
    parseErrors: recovery.parseErrors,
    detail: contractCompliant
      ? `contract-compliant block plan with ${parsed.ok ? parsed.data.blocks.length : 0} blocks`
      : `recovery incomplete: ${recovery.detail}`,
  };
}

export interface StrategistBlockContractProbeMatrixValidationIssue {
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

export interface StrategistBlockContractProbeMatrixValidationResult {
  valid: boolean;
  issues: StrategistBlockContractProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 */
export function validateStrategistBlockContractProbeMatrix(
  results: StrategistBlockContractProbeResult[],
  contract: StrategistBlockContractContract = getActiveStrategistBlockContract(),
): StrategistBlockContractProbeMatrixValidationResult {
  const issues: StrategistBlockContractProbeMatrixValidationIssue[] = [];
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
    } else if (!result.aligned) {
      issues.push({
        kind: "unexpected_mismatch",
        probeId: contractProbe.id,
        detail: `unexpected mismatch: expected=${result.expected} actual=${result.actual}`,
      });
      unexpectedMismatches++;
    }
  }

  for (const result of results) {
    if (!contract.probes.some(probe => probe.id === result.id)) {
      issues.push({
        kind: "extra_result",
        probeId: result.id,
        detail: `probe matrix extra ${result.id}`,
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

/**
 * Validate boundary-category probe matrix — A04 slice gate.
 * Only boundary probes are evaluated; zero unexpected mismatches required.
 */
export function validateStrategistBlockContractBoundaryProbeMatrix(
  results: StrategistBlockContractProbeResult[],
  contract: StrategistBlockContractContract = getActiveStrategistBlockContract(),
): StrategistBlockContractProbeMatrixValidationResult {
  const boundaryProbes = listStrategistBlockContractContractProbesByCategory("boundary", contract);
  const boundaryContract: StrategistBlockContractContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateStrategistBlockContractProbeMatrix(boundaryResults, boundaryContract);
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const STRATEGIST_BLOCK_CONTRACT_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly StrategistBlockContractCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes must align; zero unexpected mismatches required.
 */
export function validateStrategistBlockContractFailureRecoveryProbeMatrix(
  results: StrategistBlockContractProbeResult[],
  contract: StrategistBlockContractContract = getActiveStrategistBlockContract(),
): StrategistBlockContractProbeMatrixValidationResult {
  const failureRecoveryProbes = STRATEGIST_BLOCK_CONTRACT_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistBlockContractContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: StrategistBlockContractContract = {
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
  return validateStrategistBlockContractProbeMatrix(
    failureRecoveryResults,
    failureRecoveryContract,
  );
}

export function listStrategistBlockContractFailureRecoveryProbeIds(
  contract: StrategistBlockContractContract = getActiveStrategistBlockContract(),
): string[] {
  return STRATEGIST_BLOCK_CONTRACT_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listStrategistBlockContractContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface StrategistBlockContractFailureRecoverySliceResult {
  atom: "P03-B02-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: StrategistBlockContractProbeResult[];
  failureRecoveryResults: StrategistBlockContractProbeResult[];
  matrixValidation: StrategistBlockContractProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches.
 */
export function runStrategistBlockContractFailureRecoverySlice(
  fixture: StrategistBlockContractBaseline = loadStrategistBlockContractBaseline(),
): StrategistBlockContractFailureRecoverySliceResult {
  const contract = getActiveStrategistBlockContract();
  const results = runStrategistBlockContractProbes(fixture);
  const failureRecoveryProbes = STRATEGIST_BLOCK_CONTRACT_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistBlockContractContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateStrategistBlockContractFailureRecoveryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P03-B02-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

export interface StrategistBlockContractProductionSliceResult {
  atom: "P03-B02-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: StrategistBlockContractProbeResult[];
  summary: StrategistBlockContractProbeSummary;
  matrixValidation: StrategistBlockContractProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: recoverStrategistBlockProduction wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runStrategistBlockContractProductionSlice(
  fixture: StrategistBlockContractBaseline = loadStrategistBlockContractBaseline(),
): StrategistBlockContractProductionSliceResult {
  const contract = getActiveStrategistBlockContract();
  const fixtureValidation = validateStrategistBlockContractBaseline(fixture);
  const contractValidation = validateStrategistBlockContractAgainstContract(fixture, contract);
  const results = runStrategistBlockContractProbes(fixture);
  const summary = summarizeStrategistBlockContractMatrix(results);
  const matrixValidation = validateStrategistBlockContractProbeMatrix(results, contract);

  return {
    atom: "P03-B02-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface StrategistBlockContractBoundarySliceResult {
  atom: "P03-B02-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: StrategistBlockContractProbeResult[];
  boundaryResults: StrategistBlockContractProbeResult[];
  matrixValidation: StrategistBlockContractProbeMatrixValidationResult;
}

/**
 * A04 boundary slice: contract-wired boundary probes (decompose input edge cases, probe runner,
 * documented gaps, block cap) with zero unexpected mismatches.
 */
export function runStrategistBlockContractBoundarySlice(
  fixture: StrategistBlockContractBaseline = loadStrategistBlockContractBaseline(),
): StrategistBlockContractBoundarySliceResult {
  const contract = getActiveStrategistBlockContract();
  const results = runStrategistBlockContractProbes(fixture);
  const boundaryProbes = listStrategistBlockContractContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateStrategistBlockContractBoundaryProbeMatrix(results, contract);

  return {
    atom: "P03-B02-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

export interface StrategistBlockContractFixtureEntry {
  id: string;
  category: StrategistBlockContractCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface StrategistBlockContractBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    strategistIntentProbeCount: number;
    sealedAtomCount: number;
  };
  probes: StrategistBlockContractFixtureEntry[];
}

export interface StrategistBlockContractProbeResult {
  id: string;
  category: StrategistBlockContractCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface StrategistBlockContractProbeSummary {
  total: number;
  aligned: number;
  mismatches: StrategistBlockContractProbeResult[];
  knownGaps: StrategistBlockContractProbeResult[];
  byCategory: Record<
    StrategistBlockContractCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface StrategistBlockContractValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: StrategistBlockContractCategory;
  detail: string;
}

export interface StrategistBlockContractValidationResult {
  valid: boolean;
  issues: StrategistBlockContractValidationIssue[];
}

export type StrategistBlockContractProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface StrategistBlockContractProbeContract {
  id: string;
  category: StrategistBlockContractCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: StrategistBlockContractProbeDisposition;
  criterion: string;
}

export interface StrategistBlockContractCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface StrategistBlockContractCategoryContract {
  category: StrategistBlockContractCategory;
  acceptance: StrategistBlockContractCategoryAcceptance;
  probes: readonly StrategistBlockContractProbeContract[];
}

export interface StrategistBlockContractContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<StrategistBlockContractCategory, StrategistBlockContractCategoryContract>;
  probes: readonly StrategistBlockContractProbeContract[];
}

export const STRATEGIST_BLOCK_CONTRACT_A01_MIN_PROBES: Readonly<
  Record<StrategistBlockContractCategory, number>
> = {
  block_versioning: 3,
  block_structure: 3,
  block_metadata: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

function flattenStrategistBlockContractCategoryProbes(
  categories: Record<StrategistBlockContractCategory, StrategistBlockContractCategoryContract>,
): readonly StrategistBlockContractProbeContract[] {
  return STRATEGIST_BLOCK_CONTRACT_CATEGORIES.flatMap(category => categories[category].probes);
}

const STRATEGIST_BLOCK_CONTRACT_CATEGORY_CONTRACTS: Record<
  StrategistBlockContractCategory,
  StrategistBlockContractCategoryContract
> = {
  block_versioning: {
    category: "block_versioning",
    acceptance: {
      invariant:
        "Strategist block contract baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sblk.version_tagged",
        category: "block_versioning",
        description: "Strategist block contract baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist block contract baseline declares semver version field",
      },
      {
        id: "sblk.atom_tagged",
        category: "block_versioning",
        description: "Strategist block contract baseline declares P03-B02-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist block contract baseline declares P03-B02-A01 atom id",
      },
      {
        id: "sblk.harness_version_exported",
        category: "block_versioning",
        description: "FORGE_STRATEGIST_BLOCK_CONTRACT_VERSION exported for block contract harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_STRATEGIST_BLOCK_CONTRACT_VERSION exported for block contract harness",
      },
    ],
  },
  block_structure: {
    category: "block_structure",
    acceptance: {
      invariant:
        "Strategist prompt and parser expose OUTPUT section with numbered Block N: acceptance-criteria format.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sblk.prompt_output_section",
        category: "block_structure",
        description: "STRATEGIST_SYSTEM prompt declares OUTPUT section for numbered blocks",
        expected: "PASS",
        disposition: "observed",
        criterion: "STRATEGIST_SYSTEM prompt declares OUTPUT section for numbered blocks",
      },
      {
        id: "sblk.prompt_block_format",
        category: "block_structure",
        description: "STRATEGIST_SYSTEM prompt declares Block N: acceptance-criteria format",
        expected: "PASS",
        disposition: "observed",
        criterion: "STRATEGIST_SYSTEM prompt declares Block N: acceptance-criteria format",
      },
      {
        id: "sblk.parse_decompose_blocks",
        category: "block_structure",
        description: "parseDecomposeResponse extracts structured blocks from decompose output",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseDecomposeResponse extracts structured blocks from decompose output",
      },
    ],
  },
  block_metadata: {
    category: "block_metadata",
    acceptance: {
      invariant:
        "Block dependency metadata is declared in strategist prompt, parsed by parser and consumed by orchestrator waves.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sblk.parser_block_deps",
        category: "block_metadata",
        description: "parseDecomposeResponse exports blockDeps dependency graph from DEPENDENCIES field",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseDecomposeResponse exports blockDeps dependency graph from DEPENDENCIES field",
      },
      {
        id: "sblk.prompt_dependencies_section",
        category: "block_metadata",
        description: "STRATEGIST_SYSTEM prompt declares DEPENDENCIES section for block ordering",
        expected: "PASS",
        disposition: "observed",
        criterion: "STRATEGIST_SYSTEM prompt declares DEPENDENCIES section for block ordering",
      },
      {
        id: "sblk.orchestrator_wave_compute",
        category: "block_metadata",
        description: "Orchestrator computeBlockWaves derives execution waves from blockDeps graph",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator computeBlockWaves derives execution waves from blockDeps graph",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Block contract baseline links to sealed P03-B01 block gate and strategist intent handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sblk.b01_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P03_B01_TO_B02_HANDOFF_V1 targets P03-B02-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P03_B01_TO_B02_HANDOFF_V1 targets P03-B02-A01 entry atom",
      },
      {
        id: "sblk.b01_sealed_intent_probes",
        category: "baseline_link",
        description: "P03-B01→B02 handoff sealed probeCount matches active strategist intent contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P03-B01→B02 handoff sealed probeCount matches active strategist intent contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Decompose boundary assessment handles empty, whitespace-only and block-cap inputs; probe runner and documented gaps wired.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sblk.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P03-B01 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P03-B01 block gate source artifacts",
      },
      {
        id: "sblk.probe_runner_exported",
        category: "boundary",
        description: "runStrategistBlockContractProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runStrategistBlockContractProbes executes contract-wired probe matrix",
      },
      {
        id: "sblk.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL block contract gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL block contract gap",
      },
      {
        id: "sblk.empty_decompose_boundary",
        category: "boundary",
        description: "assessStrategistBlockInputBoundary rejects empty decompose output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistBlockInputBoundary rejects empty decompose output",
      },
      {
        id: "sblk.whitespace_decompose_boundary",
        category: "boundary",
        description: "assessStrategistBlockInputBoundary rejects whitespace-only decompose output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistBlockInputBoundary rejects whitespace-only decompose output",
      },
      {
        id: "sblk.block_cap_boundary",
        category: "boundary",
        description: "parseDecomposeResponse enforces max 8 blocks programmatically",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseDecomposeResponse enforces max 8 blocks programmatically",
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
        id: "sblk.invalid_version_rejected",
        category: "failure_path",
        description: "validateStrategistBlockContractBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateStrategistBlockContractBaseline rejects unexpected fixture version",
      },
      {
        id: "sblk.malformed_decompose_guard",
        category: "failure_path",
        description: "assessStrategistBlockInputBoundary rejects null-byte decompose output safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessStrategistBlockInputBoundary rejects null-byte decompose output safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Pipeline resume reuses checkpoint blocks; recoverStrategistBlockProduction restructures failed block parse.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sblk.checkpoint_block_restore",
        category: "recovery_path",
        description: "Pipeline resume reuses checkpoint blocks from prior decompose phase",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Pipeline resume reuses checkpoint blocks from prior decompose phase",
      },
      {
        id: "sblk.structured_block_recovery",
        category: "recovery_path",
        description: "recoverStrategistBlockProduction restructures failed block parse into contract-compliant plan",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverStrategistBlockProduction restructures failed block parse into contract-compliant plan",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Orchestrator blocks zero-block decompose; worker can BLOCK impossible atoms under block plan.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sblk.strategist_empty_blocks_block",
        category: "nogo_path",
        description: "Orchestrator blocks pipeline when decompose yields zero extractable blocks",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Orchestrator blocks pipeline when decompose yields zero extractable blocks",
      },
      {
        id: "sblk.worker_impossible_block",
        category: "nogo_path",
        description: "Worker prompt can BLOCK when atom is impossible under block plan",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Worker prompt can BLOCK when atom is impossible under block plan",
      },
    ],
  },
};

export interface StrategistBlockContractContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: StrategistBlockContractCategory;
  detail: string;
}

export interface StrategistBlockContractContractCoverageResult {
  valid: boolean;
  issues: StrategistBlockContractContractCoverageIssue[];
}

export const FORGE_STRATEGIST_BLOCK_CONTRACT_V1: StrategistBlockContractContract = {
  version: "1.0.0",
  atom: "P03-B02-A05",
  purpose:
    "Typed strategist block production contract with measurable probes for structure, metadata, boundary and recovery paths.",
  categories: STRATEGIST_BLOCK_CONTRACT_CATEGORY_CONTRACTS,
  probes: flattenStrategistBlockContractCategoryProbes(STRATEGIST_BLOCK_CONTRACT_CATEGORY_CONTRACTS),
};

export function getActiveStrategistBlockContract(): StrategistBlockContractContract {
  return FORGE_STRATEGIST_BLOCK_CONTRACT_V1;
}

export function getStrategistBlockContractCategoryContract(
  category: StrategistBlockContractCategory,
  contract: StrategistBlockContractContract = getActiveStrategistBlockContract(),
): StrategistBlockContractCategoryContract {
  return contract.categories[category];
}

export function listStrategistBlockContractContractProbeIds(
  contract: StrategistBlockContractContract = getActiveStrategistBlockContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listStrategistBlockContractProbesByDisposition(
  disposition: StrategistBlockContractProbeDisposition,
  contract: StrategistBlockContractContract = getActiveStrategistBlockContract(),
): StrategistBlockContractProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listStrategistBlockContractContractProbesByCategory(
  category: StrategistBlockContractCategory,
  contract: StrategistBlockContractContract = getActiveStrategistBlockContract(),
): StrategistBlockContractProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeStrategistBlockContractCoverage(
  contract: StrategistBlockContractContract = getActiveStrategistBlockContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<StrategistBlockContractCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<StrategistBlockContractProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    StrategistBlockContractCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<StrategistBlockContractProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of STRATEGIST_BLOCK_CONTRACT_CATEGORIES) {
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

export function validateStrategistBlockContractCoverage(
  contract: StrategistBlockContractContract = getActiveStrategistBlockContract(),
): StrategistBlockContractContractCoverageResult {
  const issues: StrategistBlockContractContractCoverageIssue[] = [];

  for (const category of STRATEGIST_BLOCK_CONTRACT_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < STRATEGIST_BLOCK_CONTRACT_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${STRATEGIST_BLOCK_CONTRACT_A01_MIN_PROBES[category]}`,
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

  const ids = listStrategistBlockContractContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeStrategistBlockContractCoverage(contract);
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
    if (!probeEntry.id.startsWith("sblk.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probeEntry.id,
        detail: `${probeEntry.id} missing sblk. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateStrategistBlockContractAgainstContract(
  fixture: StrategistBlockContractBaseline,
  contract: StrategistBlockContractContract = getActiveStrategistBlockContract(),
): StrategistBlockContractValidationResult {
  const issues: StrategistBlockContractValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  for (const category of STRATEGIST_BLOCK_CONTRACT_CATEGORIES) {
    const categoryContract = contract.categories[category];
    const categoryProbes = fixture.probes.filter(p => p.category === category);
    if (categoryProbes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${categoryProbes.length} probes; contract requires >= ${categoryContract.acceptance.minProbeCount}`,
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
    issues.push({ kind: "missing_category", detail: "fixture must document known FAIL gaps matching contract" });
  }
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_probe",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${expectedFailCount}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

export function validateStrategistBlockContractBaseline(
  fixture: StrategistBlockContractBaseline,
): StrategistBlockContractValidationResult {
  const issues: StrategistBlockContractValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P03-B02-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    STRATEGIST_BLOCK_CONTRACT_CATEGORIES.map(category => [category, 0]),
  ) as Record<StrategistBlockContractCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of STRATEGIST_BLOCK_CONTRACT_CATEGORIES) {
    const min = STRATEGIST_BLOCK_CONTRACT_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP03B01ToB02Handoff();
  const intentCoverage = summarizeStrategistIntentContractCoverage(getActiveStrategistIntentContract());

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (fixture.sourceBlockGate.strategistIntentProbeCount !== intentCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.strategistIntentProbeCount=${fixture.sourceBlockGate.strategistIntentProbeCount} ` +
        `contract=${intentCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P03_B01_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P03_B01_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P03_B01_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B01 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P03_B01_SEALED_ATOM_COUNT}`,
    });
  }

  const contractAlignment = validateStrategistBlockContractAgainstContract(
    fixture,
    getActiveStrategistBlockContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function loadStrategistBlockContractBaseline(): StrategistBlockContractBaseline {
  return strategistBlockContractBaseline as StrategistBlockContractBaseline;
}

export function summarizeStrategistBlockContractMatrix(
  results: StrategistBlockContractProbeResult[],
): StrategistBlockContractProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as StrategistBlockContractProbeSummary["byCategory"];
  for (const category of STRATEGIST_BLOCK_CONTRACT_CATEGORIES) {
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

export function listStrategistBlockContractProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistBlockContractBaseline,
): StrategistBlockContractFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listStrategistBlockContractKnownGaps(
  results: StrategistBlockContractProbeResult[],
): StrategistBlockContractProbeResult[] {
  return summarizeStrategistBlockContractMatrix(results).knownGaps;
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
  category: StrategistBlockContractCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): StrategistBlockContractProbeResult {
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

function parserSource(): string {
  return readSrc("parser.ts");
}

function productionBlockContractSource(): string {
  return readSrc("forge-p03-strategist-block-contract.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionBlockContractSource());
}

const SAMPLE_BLOCK_DECOMPOSE_OUTPUT = `REASONING: Break into implementation blocks
OUTPUT:
Block 1: Setup core types and interfaces
Block 2: Wire orchestrator block production seam
Block 3: Add block contract baseline tests
Block 4: Document B02 handoff
Block 5: Seal block gate
Block 6: Regression gate
Block 7: Guard controls
Block 8: Phase gate
Block 9: Extra block trimmed
DEPENDENCIES: 2→1, 3→1,2, 4→3
CONFIDENCE: 0.85`;

function probeBlockVersioning(
  id: string,
  category: StrategistBlockContractCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistBlockContractBaseline,
): StrategistBlockContractProbeResult {
  switch (id) {
    case "sblk.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "sblk.atom_tagged": {
      const ok = fixture.atom === "P03-B02-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "sblk.harness_version_exported": {
      const ok = FORGE_STRATEGIST_BLOCK_CONTRACT_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_STRATEGIST_BLOCK_CONTRACT_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown block_versioning probe");
  }
}

function probeBlockStructure(
  id: string,
  category: StrategistBlockContractCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistBlockContractProbeResult {
  const prompts = promptsSource();

  switch (id) {
    case "sblk.prompt_output_section": {
      const ok = prompts.includes("OUTPUT:") && prompts.includes("STRATEGIST");
      return probe(id, category, expected, ok, `outputSection=${ok}`);
    }
    case "sblk.prompt_block_format": {
      const ok =
        prompts.includes("Block 1:") &&
        prompts.includes("acceptance criteria");
      return probe(id, category, expected, ok, `blockFormat=${ok}`);
    }
    case "sblk.parse_decompose_blocks": {
      const parsed = parseDecomposeResponse(SAMPLE_BLOCK_DECOMPOSE_OUTPUT);
      const ok = parsed.ok === true && parsed.data.blocks.length >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `parseDecomposeResponse=${ok}, blocks=${parsed.ok ? parsed.data.blocks.length : 0}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown block_structure probe");
  }
}

function probeBlockMetadata(
  id: string,
  category: StrategistBlockContractCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistBlockContractProbeResult {
  const prompts = promptsSource();
  const orchestrator = orchestratorSource();
  const parser = parserSource();

  switch (id) {
    case "sblk.parser_block_deps": {
      const parsed = parseDecomposeResponse(SAMPLE_BLOCK_DECOMPOSE_OUTPUT);
      const ok =
        parser.includes("blockDeps") &&
        parsed.ok === true &&
        Array.isArray(parsed.data.blockDeps) &&
        parsed.data.blockDeps.some(deps => deps.length > 0);
      return probe(
        id,
        category,
        expected,
        ok,
        `blockDeps=${ok}, deps=${parsed.ok ? parsed.data.blockDeps.map(d => d.length).join(",") : "none"}`,
      );
    }
    case "sblk.prompt_dependencies_section": {
      const ok =
        prompts.includes("DEPENDENCIES:") &&
        prompts.includes("Blocks with NO dependencies can run IN PARALLEL");
      return probe(id, category, expected, ok, `dependenciesSection=${ok}`);
    }
    case "sblk.orchestrator_wave_compute": {
      const ok =
        orchestrator.includes("computeBlockWaves(") &&
        orchestrator.includes("blockDeps");
      return probe(id, category, expected, ok, `waveCompute=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown block_metadata probe");
  }
}

function probeBaselineLink(
  id: string,
  category: StrategistBlockContractCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistBlockContractProbeResult {
  switch (id) {
    case "sblk.b01_block_handoff_entry": {
      const handoff = getForgeP03B01ToB02Handoff();
      const ok =
        handoff.targetBlock.blockId === "P03-B02" &&
        handoff.targetBlock.entryAtom === "P03-B02-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "sblk.b01_sealed_intent_probes": {
      const handoff = getForgeP03B01ToB02Handoff();
      const coverage = summarizeStrategistIntentContractCoverage(getActiveStrategistIntentContract());
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
  category: StrategistBlockContractCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistBlockContractBaseline,
): StrategistBlockContractProbeResult {
  const parser = parserSource();

  switch (id) {
    case "sblk.source_block_gate_ref": {
      const handoff = getForgeP03B01ToB02Handoff();
      const coverage = summarizeStrategistIntentContractCoverage(getActiveStrategistIntentContract());
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.strategistIntentProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P03_B01_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.strategistIntentProbeCount}`,
      );
    }
    case "sblk.probe_runner_exported": {
      const ok = productionBlockContractSource().includes(
        "export function runStrategistBlockContractProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "sblk.known_gaps_documented": {
      const contract = getActiveStrategistBlockContract();
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
    case "sblk.empty_decompose_boundary": {
      const result = assessStrategistBlockInputBoundary("");
      const ok =
        hasProductionExport("assessStrategistBlockInputBoundary") &&
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
    case "sblk.whitespace_decompose_boundary": {
      const result = assessStrategistBlockInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessStrategistBlockInputBoundary") &&
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
    case "sblk.block_cap_boundary": {
      const ok =
        parser.includes("blocks.length > 8") && parser.includes("blocks.length = 8");
      const overCap = `REASONING: too many blocks
OUTPUT:
${Array.from({ length: 10 }, (_, i) => `Block ${i + 1}: task ${i + 1}`).join("\n")}
CONFIDENCE: 0.5`;
      const parsed = parseDecomposeResponse(overCap);
      const capped = parsed.ok === true && parsed.data.blocks.length === 8;
      return probe(id, category, expected, ok && capped, `parserCap=${ok}, capped=${capped}`);
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: StrategistBlockContractCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistBlockContractBaseline,
): StrategistBlockContractProbeResult {
  switch (id) {
    case "sblk.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateStrategistBlockContractBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "sblk.malformed_decompose_guard": {
      const boundary = assessStrategistBlockInputBoundary("bad\0decompose");
      const ok =
        hasProductionExport("assessStrategistBlockInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false;
      return probe(id, category, expected, ok, `detail=${boundary.detail}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: StrategistBlockContractCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistBlockContractProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "sblk.checkpoint_block_restore": {
      const ok =
        orchestrator.includes("priorCheckpoint?.blocks") &&
        orchestrator.includes("reused");
      return probe(id, category, expected, ok, `checkpointBlocks=${ok}`);
    }
    case "sblk.structured_block_recovery": {
      const malformed = `REASONING: Need block production plan
Here are the steps:
Block 1: Setup block contract types
Block 2: Wire block production seam
Block 3: Add block contract baseline tests
CONFIDENCE: 0.8`;
      const recovery = recoverStrategistBlockProduction(malformed);
      const ok =
        hasProductionExport("recoverStrategistBlockProduction") &&
        recovery.recovered === true &&
        recovery.contractCompliant === true &&
        recovery.blockCount >= 3 &&
        recovery.blocks.some(block => block.includes("block contract types")) &&
        recovery.blocks.some(block => block.includes("block production seam")) &&
        recovery.blocks.some(block => block.includes("block contract baseline"));
      return probe(
        id,
        category,
        expected,
        ok,
        `recovered=${recovery.recovered}, compliant=${recovery.contractCompliant}, blocks=${recovery.blockCount}, ${recovery.detail}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: StrategistBlockContractCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistBlockContractProbeResult {
  const orchestrator = orchestratorSource();
  const prompts = promptsSource();

  switch (id) {
    case "sblk.strategist_empty_blocks_block": {
      const ok =
        orchestrator.includes("blocks.length === 0") &&
        orchestrator.includes("No blocks could be extracted from decompose output");
      return probe(id, category, expected, ok, `emptyBlocksBlock=${ok}`);
    }
    case "sblk.worker_impossible_block": {
      const ok =
        prompts.includes("If you couldn't complete the task, say so honestly") ||
        prompts.includes("impossible");
      return probe(id, category, expected, ok, `workerImpossibleBlock=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: StrategistBlockContractCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistBlockContractBaseline,
): StrategistBlockContractProbeResult {
  switch (category) {
    case "block_versioning":
      return probeBlockVersioning(id, category, expected, fixture);
    case "block_structure":
      return probeBlockStructure(id, category, expected);
    case "block_metadata":
      return probeBlockMetadata(id, category, expected);
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
      return probe(id, category, expected, false, `unknown category: ${category}`);
  }
}

export function runStrategistBlockContractProbes(
  fixture: StrategistBlockContractBaseline = loadStrategistBlockContractBaseline(),
): StrategistBlockContractProbeResult[] {
  const contract = getActiveStrategistBlockContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}
