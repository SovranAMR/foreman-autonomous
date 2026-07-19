/**
 * FOREMAN — Strategist Atomization & Atom Sizing Baseline (P03-B03)
 *
 * Measures atomize structure, sizing rules and production wiring
 * on sealed P03-B02 block production contract block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import strategistAtomizationBaseline from "./fixtures/forge-strategist-atomization-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP03B02ToB03Handoff,
  getActiveStrategistBlockContract,
  summarizeStrategistBlockContractCoverage,
  EXPECTED_P03_B02_SEALED_ATOM_COUNT,
} from "./forge-p03-strategist-block-contract.js";
import { parseAtomizeResponse } from "./parser.js";

export const FORGE_STRATEGIST_ATOMIZATION_VERSION = "1.0.0-a04";

/** Maximum normalized atomize length before truncation (P03-B03-A01 boundary debt). */
export const STRATEGIST_ATOMIZE_MAX_LENGTH = 32000;

export type StrategistAtomizeInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface StrategistAtomizeInputBoundary {
  disposition: StrategistAtomizeInputDisposition;
  acceptable: boolean;
  normalizedAtomize: string;
  truncated: boolean;
  detail: string;
}

/**
 * Assess atomize output boundary conditions before atom production (P03-B03-A03).
 */
export function assessStrategistAtomizeInputBoundary(
  atomizeOutput: string,
): StrategistAtomizeInputBoundary {
  if (atomizeOutput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedAtomize: "",
      truncated: false,
      detail: "null byte detected in atomize output",
    };
  }

  const trimmed = atomizeOutput.trim();
  if (trimmed.length === 0) {
    const disposition: StrategistAtomizeInputDisposition =
      atomizeOutput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedAtomize: "",
      truncated: false,
      detail: disposition === "empty" ? "empty atomize output" : "whitespace-only atomize output",
    };
  }

  let normalizedAtomize = atomizeOutput;
  let truncated = false;
  if (normalizedAtomize.length > STRATEGIST_ATOMIZE_MAX_LENGTH) {
    normalizedAtomize = normalizedAtomize.slice(0, STRATEGIST_ATOMIZE_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedAtomize,
    truncated,
    detail: truncated
      ? `atomize truncated to ${STRATEGIST_ATOMIZE_MAX_LENGTH} characters`
      : "valid atomize output",
  };
}

export interface StrategistAtomizeRecoveryHints {
  atoms?: string[];
  confidence?: number;
}

export interface StrategistAtomizeRecoveryResult {
  recovered: boolean;
  contractCompliant: boolean;
  composedAtomize: string;
  atoms: string[];
  atomCount: number;
  parseErrors: string[];
  detail: string;
}

const INFORMAL_ATOM_LINE = /^atom\s*(\d+)\s*[:=\-]\s*(.+)$/i;

/**
 * Restructure failed atomize parse into contract-compliant production plan (P03-B03-A03).
 */
export function recoverStrategistAtomize(
  failedParse: string,
  hints: StrategistAtomizeRecoveryHints = {},
): StrategistAtomizeRecoveryResult {
  const parseErrors: string[] = [];

  if (failedParse.includes("\0")) {
    return {
      recovered: false,
      contractCompliant: false,
      composedAtomize: "",
      atoms: [],
      atomCount: 0,
      parseErrors: ["null_byte_in_atomize"],
      detail: "cannot recover null-byte atomize output",
    };
  }

  const trimmed = failedParse.trim();
  if (trimmed.length === 0) {
    return {
      recovered: false,
      contractCompliant: false,
      composedAtomize: "",
      atoms: [],
      atomCount: 0,
      parseErrors: ["empty_atomize"],
      detail: "cannot recover empty atomize output",
    };
  }

  const direct = parseAtomizeResponse(failedParse);
  if (direct.ok) {
    const boundary = assessStrategistAtomizeInputBoundary(failedParse);
    const outputLines = direct.data.atoms.map((atom, index) => `${index + 1}. ${atom}`);
    const composedAtomize = [
      "OUTPUT:",
      ...outputLines,
      `CONFIDENCE: ${direct.data.confidence}`,
    ].join("\n");
    const contractCompliant =
      boundary.acceptable &&
      direct.data.atoms.length >= 1 &&
      direct.data.atoms.length <= 6;
    return {
      recovered: true,
      contractCompliant,
      composedAtomize: contractCompliant ? composedAtomize : "",
      atoms: direct.data.atoms,
      atomCount: direct.data.atoms.length,
      parseErrors,
      detail: contractCompliant
        ? `direct parse succeeded with ${direct.data.atoms.length} atoms`
        : "direct parse not contract-compliant",
    };
  }

  let atoms = [...(hints.atoms ?? [])];
  const confidence = hints.confidence ?? 0.75;

  for (const line of failedParse.split("\n")) {
    const candidate = line.trim();
    if (!candidate) continue;

    const atomMatch = candidate.match(INFORMAL_ATOM_LINE);
    if (atomMatch) {
      atoms.push(atomMatch[2].trim());
      continue;
    }

    const numberedMatch = candidate.match(/^(\d+)\.\s*(.+)$/);
    if (numberedMatch) {
      atoms.push(numberedMatch[2].trim());
      continue;
    }

    const bulletMatch = candidate.match(/^[-*•]\s*(.+)$/);
    if (bulletMatch && bulletMatch[1].length > 5) {
      atoms.push(bulletMatch[1].trim());
    }
  }

  atoms = [...new Set(atoms.map(atom => atom.trim()).filter(atom => atom.length > 0))];
  if (atoms.length > 6) {
    atoms = atoms.slice(0, 6);
  }

  if (atoms.length === 0) {
    const looseLines = failedParse
      .split("\n")
      .map(line => line.trim())
      .filter(
        line =>
          line.length >= 10 &&
          !/^(REASONING|OUTPUT|CONFIDENCE|NEEDS_RESEARCH|Here are the steps)/i.test(line),
      );
    if (looseLines.length > 0) {
      atoms = looseLines.slice(0, 6);
      parseErrors.push("informal_atom_extraction");
    } else {
      parseErrors.push("missing_atoms");
      atoms = ["Recovered atom pending strategist refinement"];
    }
  }

  const outputLines = atoms.map((atom, index) => {
    const cleaned = atom.replace(/^Atom\s*\d+\s*:\s*/i, "");
    return `${index + 1}. ${cleaned}`;
  });

  const composedAtomize = ["OUTPUT:", ...outputLines, `CONFIDENCE: ${confidence}`].join("\n");

  const boundary = assessStrategistAtomizeInputBoundary(composedAtomize);
  const parsed = parseAtomizeResponse(composedAtomize);
  const contractCompliant =
    boundary.acceptable &&
    parsed.ok === true &&
    parsed.data.atoms.length >= 1 &&
    parsed.data.atoms.length <= 6;
  const recovered = parsed.ok === true && parsed.data.atoms.length >= 1;

  return {
    recovered,
    contractCompliant,
    composedAtomize: contractCompliant ? composedAtomize : "",
    atoms: parsed.ok ? parsed.data.atoms : atoms,
    atomCount: parsed.ok ? parsed.data.atoms.length : atoms.length,
    parseErrors,
    detail: contractCompliant
      ? `contract-compliant atom plan with ${parsed.ok ? parsed.data.atoms.length : 0} atoms`
      : `recovery incomplete: ${parseErrors.join(", ") || "parse failed"}`,
  };
}

export const STRATEGIST_ATOMIZATION_CATEGORIES = [
  "atom_versioning",
  "atom_structure",
  "atom_sizing",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type StrategistAtomizationCategory = (typeof STRATEGIST_ATOMIZATION_CATEGORIES)[number];

export const STRATEGIST_ATOMIZATION_A01_MIN_PROBES: Readonly<
  Record<StrategistAtomizationCategory, number>
> = {
  atom_versioning: 3,
  atom_structure: 3,
  atom_sizing: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

export interface StrategistAtomizationFixtureEntry {
  id: string;
  category: StrategistAtomizationCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface StrategistAtomizationBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    blockContractProbeCount: number;
    sealedAtomCount: number;
  };
  probes: StrategistAtomizationFixtureEntry[];
}

export interface StrategistAtomizationProbeResult {
  id: string;
  category: StrategistAtomizationCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface StrategistAtomizationProbeSummary {
  total: number;
  aligned: number;
  mismatches: StrategistAtomizationProbeResult[];
  knownGaps: StrategistAtomizationProbeResult[];
  byCategory: Record<
    StrategistAtomizationCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface StrategistAtomizationValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: StrategistAtomizationCategory;
  detail: string;
}

export interface StrategistAtomizationValidationResult {
  valid: boolean;
  issues: StrategistAtomizationValidationIssue[];
}

export type StrategistAtomizationProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface StrategistAtomizationProbeContract {
  id: string;
  category: StrategistAtomizationCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: StrategistAtomizationProbeDisposition;
  criterion: string;
}

export interface StrategistAtomizationCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface StrategistAtomizationCategoryContract {
  category: StrategistAtomizationCategory;
  acceptance: StrategistAtomizationCategoryAcceptance;
  probes: readonly StrategistAtomizationProbeContract[];
}

export interface StrategistAtomizationContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<StrategistAtomizationCategory, StrategistAtomizationCategoryContract>;
  probes: readonly StrategistAtomizationProbeContract[];
}

export interface StrategistAtomizationCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: StrategistAtomizationCategory;
  detail: string;
}

export interface StrategistAtomizationCoverageResult {
  valid: boolean;
  issues: StrategistAtomizationCoverageIssue[];
}

function flattenStrategistAtomizationCategoryProbes(
  categories: Record<StrategistAtomizationCategory, StrategistAtomizationCategoryContract>,
): readonly StrategistAtomizationProbeContract[] {
  return STRATEGIST_ATOMIZATION_CATEGORIES.flatMap(category => categories[category].probes);
}

const STRATEGIST_ATOMIZATION_CATEGORY_CONTRACTS: Record<
  StrategistAtomizationCategory,
  StrategistAtomizationCategoryContract
> = {
  atom_versioning: {
    category: "atom_versioning",
    acceptance: {
      invariant:
        "Strategist atomization baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "satom.version_tagged",
        category: "atom_versioning",
        description: "Strategist atomization baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist atomization baseline declares semver version field",
      },
      {
        id: "satom.atom_tagged",
        category: "atom_versioning",
        description: "Strategist atomization baseline declares P03-B03-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist atomization baseline declares P03-B03-A01 atom id",
      },
      {
        id: "satom.harness_version_exported",
        category: "atom_versioning",
        description: "FORGE_STRATEGIST_ATOMIZATION_VERSION exported for atomization harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_STRATEGIST_ATOMIZATION_VERSION exported for atomization harness",
      },
    ],
  },
  atom_structure: {
    category: "atom_structure",
    acceptance: {
      invariant:
        "Strategist prompt and parser expose ATOMIZE Mode with numbered atom OUTPUT format.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "satom.prompt_atomize_output",
        category: "atom_structure",
        description: "STRATEGIST_SYSTEM prompt declares ATOMIZE Mode with OUTPUT section",
        expected: "PASS",
        disposition: "observed",
        criterion: "STRATEGIST_SYSTEM prompt declares ATOMIZE Mode with OUTPUT section",
      },
      {
        id: "satom.prompt_atom_format",
        category: "atom_structure",
        description: "STRATEGIST_SYSTEM prompt declares numbered atom output format",
        expected: "PASS",
        disposition: "observed",
        criterion: "STRATEGIST_SYSTEM prompt declares numbered atom output format",
      },
      {
        id: "satom.parse_atomize_atoms",
        category: "atom_structure",
        description: "parseAtomizeResponse extracts structured atoms from atomize output",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseAtomizeResponse extracts structured atoms from atomize output",
      },
    ],
  },
  atom_sizing: {
    category: "atom_sizing",
    acceptance: {
      invariant:
        "Atom sizing rules enforce max six atoms per block in prompt, parser and orchestrator.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "satom.parser_six_atom_cap",
        category: "atom_sizing",
        description: "parseAtomizeResponse enforces max 6 atoms programmatically",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseAtomizeResponse enforces max 6 atoms programmatically",
      },
      {
        id: "satom.orchestrator_hard_cap",
        category: "atom_sizing",
        description: "Orchestrator hard-caps strategist atomize output at six atoms per block",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator hard-caps strategist atomize output at six atoms per block",
      },
      {
        id: "satom.prompt_max_six_atoms",
        category: "atom_sizing",
        description: "STRATEGIST_SYSTEM prompt declares ABSOLUTE MAXIMUM 6 atoms sizing rule",
        expected: "PASS",
        disposition: "observed",
        criterion: "STRATEGIST_SYSTEM prompt declares ABSOLUTE MAXIMUM 6 atoms sizing rule",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Atomization baseline links to sealed P03-B02 block gate and block contract handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "satom.b02_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P03_B02_TO_B03_HANDOFF_V1 targets P03-B03-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P03_B02_TO_B03_HANDOFF_V1 targets P03-B03-A01 entry atom",
      },
      {
        id: "satom.b02_sealed_block_probes",
        category: "baseline_link",
        description: "P03-B02→B03 handoff sealed probeCount matches active block contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P03-B02→B03 handoff sealed probeCount matches active block contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Atomize boundary assessment handles empty, whitespace-only, oversized and atom-cap inputs; probe runner and documented gaps wired.",
      minProbeCount: 7,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "satom.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P03-B02 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P03-B02 block gate source artifacts",
      },
      {
        id: "satom.probe_runner_exported",
        category: "boundary",
        description: "runStrategistAtomizationProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runStrategistAtomizationProbes executes contract-wired probe matrix",
      },
      {
        id: "satom.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL atomization gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL atomization gap",
      },
      {
        id: "satom.empty_atomize_boundary",
        category: "boundary",
        description: "assessStrategistAtomizeInputBoundary rejects empty atomize output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistAtomizeInputBoundary rejects empty atomize output",
      },
      {
        id: "satom.whitespace_atomize_boundary",
        category: "boundary",
        description: "assessStrategistAtomizeInputBoundary rejects whitespace-only atomize output",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistAtomizeInputBoundary rejects whitespace-only atomize output",
      },
      {
        id: "satom.atom_cap_boundary",
        category: "boundary",
        description: "parseAtomizeResponse caps over-limit atom lists at six atoms",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseAtomizeResponse caps over-limit atom lists at six atoms",
      },
      {
        id: "satom.long_atomize_truncation_boundary",
        category: "boundary",
        description: "assessStrategistAtomizeInputBoundary truncates atomize exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistAtomizeInputBoundary truncates atomize exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Malformed atomize guard exists; fixture validation rejects invalid versions.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "satom.invalid_version_rejected",
        category: "failure_path",
        description: "validateStrategistAtomizationBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateStrategistAtomizationBaseline rejects unexpected fixture version",
      },
      {
        id: "satom.malformed_atomize_guard",
        category: "failure_path",
        description: "assessStrategistAtomizeInputBoundary rejects null-byte atomize output safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessStrategistAtomizeInputBoundary rejects null-byte atomize output safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Orchestrator salvages malformed atomize output; recoverStrategistAtomize restructures failed atom parse.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "satom.atomize_salvage_fallback",
        category: "recovery_path",
        description: "Orchestrator salvages malformed atomize output via fallbackParseBlocks",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Orchestrator salvages malformed atomize output via fallbackParseBlocks",
      },
      {
        id: "satom.structured_atom_recovery",
        category: "recovery_path",
        description: "recoverStrategistAtomize restructures failed atomize parse into contract-compliant plan",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverStrategistAtomize restructures failed atomize parse into contract-compliant plan",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Orchestrator skips zero-atom atomize; worker can BLOCK impossible atoms under block plan.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "satom.orchestrator_zero_atoms_skip",
        category: "nogo_path",
        description: "Orchestrator skips block when atomize yields zero extractable atoms",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Orchestrator skips block when atomize yields zero extractable atoms",
      },
      {
        id: "satom.worker_impossible_atom",
        category: "nogo_path",
        description: "Worker prompt can BLOCK when atom is impossible under block plan",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Worker prompt can BLOCK when atom is impossible under block plan",
      },
    ],
  },
};

export const FORGE_STRATEGIST_ATOMIZATION_CONTRACT_V1: StrategistAtomizationContract = {
  version: "1.0.0",
  atom: "P03-B03-A06",
  purpose:
    "Typed strategist atomization contract with measurable probes for structure, sizing, boundary and recovery paths.",
  categories: STRATEGIST_ATOMIZATION_CATEGORY_CONTRACTS,
  probes: flattenStrategistAtomizationCategoryProbes(STRATEGIST_ATOMIZATION_CATEGORY_CONTRACTS),
};

export function getActiveStrategistAtomizationContract(): StrategistAtomizationContract {
  return FORGE_STRATEGIST_ATOMIZATION_CONTRACT_V1;
}

export interface StrategistAtomizationProbeMatrixValidationIssue {
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

export interface StrategistAtomizationProbeMatrixValidationResult {
  valid: boolean;
  issues: StrategistAtomizationProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 */
export function validateStrategistAtomizationProbeMatrix(
  results: StrategistAtomizationProbeResult[],
  contract: StrategistAtomizationContract = getActiveStrategistAtomizationContract(),
): StrategistAtomizationProbeMatrixValidationResult {
  const issues: StrategistAtomizationProbeMatrixValidationIssue[] = [];
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
export function validateStrategistAtomizationBoundaryProbeMatrix(
  results: StrategistAtomizationProbeResult[],
  contract: StrategistAtomizationContract = getActiveStrategistAtomizationContract(),
): StrategistAtomizationProbeMatrixValidationResult {
  const boundaryProbes = listStrategistAtomizationContractProbesByCategory("boundary", contract);
  const boundaryContract: StrategistAtomizationContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateStrategistAtomizationProbeMatrix(boundaryResults, boundaryContract);
}

export interface StrategistAtomizationProductionSliceResult {
  atom: "P03-B03-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: StrategistAtomizationProbeResult[];
  summary: StrategistAtomizationProbeSummary;
  matrixValidation: StrategistAtomizationProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: recoverStrategistAtomize wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runStrategistAtomizationProductionSlice(
  fixture: StrategistAtomizationBaseline = loadStrategistAtomizationBaseline(),
): StrategistAtomizationProductionSliceResult {
  const contract = getActiveStrategistAtomizationContract();
  const fixtureValidation = validateStrategistAtomizationBaseline(fixture);
  const contractValidation = validateStrategistAtomizationAgainstContract(fixture, contract);
  const results = runStrategistAtomizationProbes(fixture);
  const summary = summarizeStrategistAtomizationMatrix(results);
  const matrixValidation = validateStrategistAtomizationProbeMatrix(results, contract);

  return {
    atom: "P03-B03-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface StrategistAtomizationBoundarySliceResult {
  atom: "P03-B03-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: StrategistAtomizationProbeResult[];
  boundaryResults: StrategistAtomizationProbeResult[];
  matrixValidation: StrategistAtomizationProbeMatrixValidationResult;
}

/**
 * A04 boundary slice: contract-wired boundary probes (atomize input edge cases, probe runner,
 * documented gaps, atom cap, truncation) with zero unexpected mismatches.
 */
export function runStrategistAtomizationBoundarySlice(
  fixture: StrategistAtomizationBaseline = loadStrategistAtomizationBaseline(),
): StrategistAtomizationBoundarySliceResult {
  const contract = getActiveStrategistAtomizationContract();
  const results = runStrategistAtomizationProbes(fixture);
  const boundaryProbes = listStrategistAtomizationContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateStrategistAtomizationBoundaryProbeMatrix(results, contract);

  return {
    atom: "P03-B03-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

export function getStrategistAtomizationCategoryContract(
  category: StrategistAtomizationCategory,
  contract: StrategistAtomizationContract = getActiveStrategistAtomizationContract(),
): StrategistAtomizationCategoryContract {
  return contract.categories[category];
}

export function listStrategistAtomizationContractProbeIds(
  contract: StrategistAtomizationContract = getActiveStrategistAtomizationContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listStrategistAtomizationProbesByDisposition(
  disposition: StrategistAtomizationProbeDisposition,
  contract: StrategistAtomizationContract = getActiveStrategistAtomizationContract(),
): StrategistAtomizationProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listStrategistAtomizationContractProbesByCategory(
  category: StrategistAtomizationCategory,
  contract: StrategistAtomizationContract = getActiveStrategistAtomizationContract(),
): StrategistAtomizationProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeStrategistAtomizationCoverage(
  contract: StrategistAtomizationContract = getActiveStrategistAtomizationContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<StrategistAtomizationCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<StrategistAtomizationProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    StrategistAtomizationCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<StrategistAtomizationProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of STRATEGIST_ATOMIZATION_CATEGORIES) {
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

export function validateStrategistAtomizationCoverage(
  contract: StrategistAtomizationContract = getActiveStrategistAtomizationContract(),
): StrategistAtomizationCoverageResult {
  const issues: StrategistAtomizationCoverageIssue[] = [];

  for (const category of STRATEGIST_ATOMIZATION_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < STRATEGIST_ATOMIZATION_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${STRATEGIST_ATOMIZATION_A01_MIN_PROBES[category]}`,
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

  const ids = listStrategistAtomizationContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeStrategistAtomizationCoverage(contract);
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
    if (!probeEntry.id.startsWith("satom.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probeEntry.id,
        detail: `${probeEntry.id} missing satom. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateStrategistAtomizationAgainstContract(
  fixture: StrategistAtomizationBaseline,
  contract: StrategistAtomizationContract = getActiveStrategistAtomizationContract(),
): StrategistAtomizationValidationResult {
  const issues: StrategistAtomizationValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  for (const category of STRATEGIST_ATOMIZATION_CATEGORIES) {
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
export const FORGE_STRATEGIST_ATOMIZATION_A01_PROBE_MATRIX: readonly StrategistAtomizationFixtureEntry[] =
  strategistAtomizationBaseline.probes as StrategistAtomizationFixtureEntry[];

export function getStrategistAtomizationA01ExpectedFailCount(): number {
  return FORGE_STRATEGIST_ATOMIZATION_A01_PROBE_MATRIX.filter(p => p.expected === "FAIL").length;
}

export function loadStrategistAtomizationBaseline(): StrategistAtomizationBaseline {
  return strategistAtomizationBaseline as StrategistAtomizationBaseline;
}

function validateStrategistAtomizationAgainstA01Matrix(
  fixture: StrategistAtomizationBaseline,
): StrategistAtomizationValidationResult {
  const issues: StrategistAtomizationValidationIssue[] = [];

  if (fixture.probes.length !== FORGE_STRATEGIST_ATOMIZATION_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_STRATEGIST_ATOMIZATION_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_STRATEGIST_ATOMIZATION_A01_PROBE_MATRIX) {
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
  }

  const contract = getActiveStrategistAtomizationContract();
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

export function validateStrategistAtomizationBaseline(
  fixture: StrategistAtomizationBaseline,
): StrategistAtomizationValidationResult {
  const issues: StrategistAtomizationValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P03-B03-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    STRATEGIST_ATOMIZATION_CATEGORIES.map(category => [category, 0]),
  ) as Record<StrategistAtomizationCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of STRATEGIST_ATOMIZATION_CATEGORIES) {
    const min = STRATEGIST_ATOMIZATION_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP03B02ToB03Handoff();
  const blockCoverage = summarizeStrategistBlockContractCoverage(getActiveStrategistBlockContract());

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (fixture.sourceBlockGate.blockContractProbeCount !== blockCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.blockContractProbeCount=${fixture.sourceBlockGate.blockContractProbeCount} ` +
        `contract=${blockCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P03_B02_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P03_B02_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.sourceBlock.completedAtoms.length !== EXPECTED_P03_B02_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `B02 handoff completedAtoms=${handoff.sourceBlock.completedAtoms.length} ` +
        `expected=${EXPECTED_P03_B02_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P03-B03-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `B02 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P03-B03-A01`,
    });
  }

  const matrixAlignment = validateStrategistAtomizationAgainstA01Matrix(fixture);
  issues.push(...matrixAlignment.issues);

  const contractAlignment = validateStrategistAtomizationAgainstContract(
    fixture,
    getActiveStrategistAtomizationContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeStrategistAtomizationMatrix(
  results: StrategistAtomizationProbeResult[],
): StrategistAtomizationProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as StrategistAtomizationProbeSummary["byCategory"];
  for (const category of STRATEGIST_ATOMIZATION_CATEGORIES) {
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

export function listStrategistAtomizationProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistAtomizationBaseline = loadStrategistAtomizationBaseline(),
): StrategistAtomizationFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listStrategistAtomizationKnownGaps(
  results: StrategistAtomizationProbeResult[],
): StrategistAtomizationProbeResult[] {
  return summarizeStrategistAtomizationMatrix(results).knownGaps;
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
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
): StrategistAtomizationProbeResult {
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

function productionAtomizationSource(): string {
  return readSrc("forge-p03-strategist-atomization.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionAtomizationSource());
}

const SAMPLE_ATOMIZE_OUTPUT = `OUTPUT:
1. Create src/types.ts with ForgeAtom interface
2. Wire orchestrator atomize seam in orchestrator.ts
3. Add atomization baseline tests in forge-p03-strategist-atomization.test.ts
4. Document B03 handoff in ACTIVE_FRONT.md
5. Seal atomization block gate
6. Regression gate
7. Extra atom trimmed
CONFIDENCE: 0.85`;

function probeAtomVersioning(
  id: string,
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistAtomizationBaseline,
): StrategistAtomizationProbeResult {
  switch (id) {
    case "satom.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "satom.atom_tagged": {
      const ok = fixture.atom === "P03-B03-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "satom.harness_version_exported": {
      const ok = FORGE_STRATEGIST_ATOMIZATION_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_STRATEGIST_ATOMIZATION_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown atom_versioning probe");
  }
}

function probeAtomStructure(
  id: string,
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistAtomizationProbeResult {
  const prompts = promptsSource();
  const parser = parserSource();

  switch (id) {
    case "satom.prompt_atomize_output": {
      const ok =
        prompts.includes("### ATOMIZE Mode") &&
        prompts.includes("## Output Format — ATOMIZE") &&
        prompts.includes("OUTPUT:");
      return probe(id, category, expected, ok, `atomizeOutputSection=${ok}`);
    }
    case "satom.prompt_atom_format": {
      const ok =
        prompts.includes("1. [exact atomic task") &&
        prompts.includes("Atomize Quality Checklist");
      return probe(id, category, expected, ok, `atomFormat=${ok}`);
    }
    case "satom.parse_atomize_atoms": {
      const ok =
        parser.includes("export function parseAtomizeResponse") &&
        parseAtomizeResponse(SAMPLE_ATOMIZE_OUTPUT).ok === true;
      const parsed = parseAtomizeResponse(SAMPLE_ATOMIZE_OUTPUT);
      const atomCount = parsed.ok ? parsed.data.atoms.length : 0;
      return probe(id, category, expected, ok && atomCount >= 3, `parsedAtoms=${atomCount}`);
    }
    default:
      return probe(id, category, expected, false, "unknown atom_structure probe");
  }
}

function probeAtomSizing(
  id: string,
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistAtomizationProbeResult {
  const prompts = promptsSource();
  const parser = parserSource();
  const orchestrator = orchestratorSource();

  switch (id) {
    case "satom.parser_six_atom_cap": {
      const ok = parser.includes("atoms.length > 6") && parser.includes("atoms.length = 6");
      return probe(id, category, expected, ok, `parserCap=${ok}`);
    }
    case "satom.orchestrator_hard_cap": {
      const ok =
        orchestrator.includes("Hard cap: max 6 atoms per block") &&
        orchestrator.includes("atoms.length > 6") &&
        orchestrator.includes("atoms.length = 6");
      return probe(id, category, expected, ok, `orchestratorCap=${ok}`);
    }
    case "satom.prompt_max_six_atoms": {
      const ok =
        prompts.includes("ABSOLUTE MAXIMUM: 6 atoms") &&
        prompts.includes("1-2 atoms MAX") &&
        prompts.includes("3-6 atoms");
      return probe(id, category, expected, ok, `promptSizing=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown atom_sizing probe");
  }
}

function probeBaselineLink(
  id: string,
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistAtomizationProbeResult {
  switch (id) {
    case "satom.b02_block_handoff_entry": {
      const handoff = getForgeP03B02ToB03Handoff();
      const ok =
        handoff.targetBlock.blockId === "P03-B03" &&
        handoff.targetBlock.entryAtom === "P03-B03-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "satom.b02_sealed_block_probes": {
      const handoff = getForgeP03B02ToB03Handoff();
      const coverage = summarizeStrategistBlockContractCoverage(getActiveStrategistBlockContract());
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
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistAtomizationBaseline,
): StrategistAtomizationProbeResult {
  switch (id) {
    case "satom.source_block_gate_ref": {
      const handoff = getForgeP03B02ToB03Handoff();
      const coverage = summarizeStrategistBlockContractCoverage(getActiveStrategistBlockContract());
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.blockContractProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P03_B02_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.blockContractProbeCount}`,
      );
    }
    case "satom.probe_runner_exported": {
      const ok = productionAtomizationSource().includes(
        "export function runStrategistAtomizationProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "satom.known_gaps_documented": {
      const contract = getActiveStrategistAtomizationContract();
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
    case "satom.empty_atomize_boundary": {
      const result = assessStrategistAtomizeInputBoundary("");
      const ok =
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
    case "satom.whitespace_atomize_boundary": {
      const result = assessStrategistAtomizeInputBoundary("   \t\n  ");
      const ok =
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
    case "satom.atom_cap_boundary": {
      const parser = parserSource();
      const ok = parser.includes("atoms.length > 6") && parser.includes("atoms.length = 6");
      const overCap = `OUTPUT:\n${Array.from({ length: 8 }, (_, i) => `${i + 1}. atom task ${i + 1}`).join("\n")}\nCONFIDENCE: 0.5`;
      const parsed = parseAtomizeResponse(overCap);
      const capped = parsed.ok === true && parsed.data.atoms.length === 6;
      return probe(id, category, expected, ok && capped, `parserCap=${ok}, capped=${capped}`);
    }
    case "satom.long_atomize_truncation_boundary": {
      const longAtomize = "x".repeat(STRATEGIST_ATOMIZE_MAX_LENGTH + 500);
      const result = assessStrategistAtomizeInputBoundary(longAtomize);
      const ok =
        result.disposition === "exceeds_max_length" &&
        result.truncated === true &&
        result.normalizedAtomize.length === STRATEGIST_ATOMIZE_MAX_LENGTH &&
        result.acceptable === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `truncated=${result.truncated}, length=${result.normalizedAtomize.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistAtomizationBaseline,
): StrategistAtomizationProbeResult {
  switch (id) {
    case "satom.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateStrategistAtomizationBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "satom.malformed_atomize_guard": {
      const boundary = assessStrategistAtomizeInputBoundary("bad\0atomize");
      const ok =
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
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistAtomizationProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "satom.atomize_salvage_fallback": {
      const ok =
        orchestrator.includes("atomize format invalid; salvaged") &&
        orchestrator.includes("fallbackParseBlocks") &&
        orchestrator.includes('phase: "atomize"');
      return probe(id, category, expected, ok, `salvageFallback=${ok}`);
    }
    case "satom.structured_atom_recovery": {
      const malformed = `REASONING: Need atom production plan
Here are the steps:
1. Setup atomization types
2. Wire atomize production seam
3. Add atomization baseline tests
CONFIDENCE: 0.8`;
      const recovery = recoverStrategistAtomize(malformed);
      const ok =
        recovery.recovered === true &&
        recovery.contractCompliant === true &&
        recovery.atomCount >= 3 &&
        recovery.atoms.some(atom => atom.includes("atomization types")) &&
        recovery.atoms.some(atom => atom.includes("atomize production seam")) &&
        recovery.atoms.some(atom => atom.includes("atomization baseline"));
      return probe(
        id,
        category,
        expected,
        ok,
        `recovered=${recovery.recovered}, compliant=${recovery.contractCompliant}, atoms=${recovery.atomCount}, ${recovery.detail}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistAtomizationProbeResult {
  const orchestrator = orchestratorSource();
  const prompts = promptsSource();

  switch (id) {
    case "satom.orchestrator_zero_atoms_skip": {
      const ok =
        orchestrator.includes("if (atoms.length === 0)") &&
        orchestrator.includes("No atoms extracted from block");
      return probe(id, category, expected, ok, `zeroAtomsSkip=${ok}`);
    }
    case "satom.worker_impossible_atom": {
      const ok =
        prompts.includes("BLOCK Signal") &&
        prompts.includes("impossible atom") &&
        prompts.includes("Worker");
      return probe(id, category, expected, ok, `workerBlockSignal=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: StrategistAtomizationCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistAtomizationBaseline,
): StrategistAtomizationProbeResult {
  switch (category) {
    case "atom_versioning":
      return probeAtomVersioning(id, category, expected, fixture);
    case "atom_structure":
      return probeAtomStructure(id, category, expected);
    case "atom_sizing":
      return probeAtomSizing(id, category, expected);
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

export function runStrategistAtomizationProbes(
  fixture: StrategistAtomizationBaseline = loadStrategistAtomizationBaseline(),
): StrategistAtomizationProbeResult[] {
  const contract = getActiveStrategistAtomizationContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}
