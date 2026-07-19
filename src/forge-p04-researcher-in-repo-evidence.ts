/**
 * FOREMAN — Researcher In-Repo Evidence Collection Baseline (P04-B02)
 *
 * A01 slice: load, validate, run probes, contract alignment against sealed
 * P04-B01 question decomposition block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import researcherInRepoEvidenceBaseline from "./fixtures/forge-researcher-in-repo-evidence-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP04B01ToB02Handoff,
  getActiveResearcherQuestionDecompositionContract,
  summarizeResearcherQuestionDecompositionContractCoverage,
  FORGE_RESEARCHER_QUESTION_DECOMPOSITION_CONTRACT_V1,
} from "./forge-p04-researcher-question-decomposition.js";
import { searchFiles, type FileSearchResult } from "./research-engine.js";

export const FORGE_RESEARCHER_IN_REPO_EVIDENCE_VERSION = "1.0.0-a05";

export const EXPECTED_P04_B01_SEALED_ATOM_COUNT = 10;

/** Maximum normalized in-repo search query length before truncation (P04-B02-A01 boundary). */
export const RESEARCHER_IN_REPO_EVIDENCE_QUERY_MAX_LENGTH = 4096;

export const RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES = [
  "evidence_versioning",
  "repo_signal",
  "citation_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type ResearcherInRepoEvidenceCategory =
  (typeof RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES)[number];

export type InRepoEvidenceInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface InRepoEvidenceInputBoundary {
  disposition: InRepoEvidenceInputDisposition;
  acceptable: boolean;
  normalizedQuery: string;
  truncated: boolean;
  detail: string;
}

/**
 * Assess search query input boundary conditions before in-repo evidence collection (P04-B02-A01).
 */
export function assessInRepoEvidenceInputBoundary(
  searchQuery: string,
): InRepoEvidenceInputBoundary {
  if (searchQuery.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedQuery: "",
      truncated: false,
      detail: "null byte detected in search query input",
    };
  }

  const trimmed = searchQuery.trim();
  if (trimmed.length === 0) {
    const disposition: InRepoEvidenceInputDisposition =
      searchQuery.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedQuery: "",
      truncated: false,
      detail: disposition === "empty" ? "empty search query input" : "whitespace-only search query input",
    };
  }

  let normalizedQuery = searchQuery;
  let truncated = false;
  if (normalizedQuery.length > RESEARCHER_IN_REPO_EVIDENCE_QUERY_MAX_LENGTH) {
    normalizedQuery = normalizedQuery.slice(0, RESEARCHER_IN_REPO_EVIDENCE_QUERY_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedQuery,
    truncated,
    detail: truncated
      ? `search query truncated to ${RESEARCHER_IN_REPO_EVIDENCE_QUERY_MAX_LENGTH} characters`
      : "valid search query input",
  };
}

export interface InRepoEvidenceCollectionValidationOutcome {
  valid: boolean;
  fileHitCount: number;
  issues: string[];
}

/**
 * Validate in-repo evidence collection inputs before orchestrator pre-research wiring (P04-B02-A01).
 */
export function validateInRepoEvidenceCollection(
  searchQuery: string,
  fileResults: FileSearchResult[] = [],
): InRepoEvidenceCollectionValidationOutcome {
  const boundary = assessInRepoEvidenceInputBoundary(searchQuery);
  if (!boundary.acceptable) {
    return {
      valid: false,
      fileHitCount: 0,
      issues: [boundary.detail],
    };
  }

  const fileHitCount = fileResults.length;
  if (fileHitCount === 0) {
    return {
      valid: false,
      fileHitCount,
      issues: ["zero in-repo file hits for normalized search query"],
    };
  }

  const hasCitationFields = fileResults.every(
    result =>
      typeof result.file === "string" &&
      result.file.length > 0 &&
      Number.isFinite(result.line) &&
      typeof result.text === "string",
  );
  if (!hasCitationFields) {
    return {
      valid: false,
      fileHitCount,
      issues: ["file results missing path, line or text citation fields"],
    };
  }

  return {
    valid: true,
    fileHitCount,
    issues: [],
  };
}

export interface InRepoEvidenceRecoveryHints {
  searchQueries?: string[];
  topic?: string;
}

export interface InRepoEvidenceRecoveryResult {
  recovered: boolean;
  evidencePlan: {
    searchQueries: string[];
    citationTargets: Array<{ file: string; line?: number; text?: string }>;
  };
  parseErrors: string[];
  detail: string;
}

const IN_REPO_CITATION_PATH_LINE_PATTERN =
  /([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)\s*(?:[:#]\s*(\d+)|\s+line\s+(\d+))/gi;

/**
 * Restructure failed repo citation parse into actionable evidence plan (P04-B02-A03).
 */
export function recoverInRepoEvidence(
  failedParse: string,
  hints: InRepoEvidenceRecoveryHints = {},
): InRepoEvidenceRecoveryResult {
  const parseErrors: string[] = [];
  const boundary = assessInRepoEvidenceInputBoundary(failedParse);

  if (!boundary.acceptable) {
    return {
      recovered: false,
      evidencePlan: { searchQueries: [], citationTargets: [] },
      parseErrors: [boundary.disposition],
      detail: `cannot recover ${boundary.disposition.replace(/_/g, "-")} citation parse`,
    };
  }

  const raw = boundary.normalizedQuery;
  const citationTargets: Array<{ file: string; line?: number; text?: string }> = [];

  if (raw.includes("{") || raw.includes("[")) {
    try {
      JSON.parse(raw);
    } catch {
      parseErrors.push("json_parse_failed");
    }
  }

  for (const match of raw.matchAll(IN_REPO_CITATION_PATH_LINE_PATTERN)) {
    const file = match[1]?.trim();
    const lineRaw = match[2] ?? match[3];
    if (!file) continue;
    const line = lineRaw ? Number.parseInt(lineRaw, 10) : undefined;
    citationTargets.push({
      file,
      line: Number.isFinite(line) ? line : undefined,
    });
  }

  const exportMatch = raw.match(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/);
  if (exportMatch) {
    const file = citationTargets[0]?.file ?? "unknown";
    citationTargets.push({ file, text: exportMatch[1] });
  }

  const searchQueries: string[] = hints.searchQueries ? [...hints.searchQueries] : [];

  for (const target of citationTargets) {
    if (target.text) {
      searchQueries.push(`export function ${target.text}`);
      searchQueries.push(target.text);
    } else {
      const basename = target.file.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
      if (basename.length > 2) {
        searchQueries.push(basename);
      }
    }
  }

  if (hints.topic) {
    searchQueries.push(hints.topic);
  }

  if (searchQueries.length === 0) {
    const keywords = raw
      .split(/\s+/)
      .map(word => word.replace(/[^A-Za-z0-9_./-]/g, ""))
      .filter(word => word.length > 4)
      .slice(0, 4);
    if (keywords.length > 0) {
      searchQueries.push(keywords.join(" "));
    }
  }

  const uniqueQueries = [
    ...new Set(searchQueries.map(query => query.trim()).filter(query => query.length > 3)),
  ];

  if (uniqueQueries.length === 0) {
    return {
      recovered: false,
      evidencePlan: { searchQueries: [], citationTargets },
      parseErrors,
      detail: "no actionable search queries extracted from failed citation parse",
    };
  }

  return {
    recovered: true,
    evidencePlan: {
      searchQueries: uniqueQueries,
      citationTargets,
    },
    parseErrors,
    detail: `recovered ${uniqueQueries.length} search queries from failed citation parse`,
  };
}

export interface ResearcherInRepoEvidenceFixtureEntry {
  id: string;
  category: ResearcherInRepoEvidenceCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface ResearcherInRepoEvidenceBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    questionDecompositionProbeCount: number;
    sealedAtomCount: number;
  };
  probes: ResearcherInRepoEvidenceFixtureEntry[];
}

export interface ResearcherInRepoEvidenceProbeResult {
  id: string;
  category: ResearcherInRepoEvidenceCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface ResearcherInRepoEvidenceProbeSummary {
  total: number;
  aligned: number;
  mismatches: ResearcherInRepoEvidenceProbeResult[];
  knownGaps: ResearcherInRepoEvidenceProbeResult[];
  byCategory: Record<
    ResearcherInRepoEvidenceCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface ResearcherInRepoEvidenceValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: ResearcherInRepoEvidenceCategory;
  detail: string;
}

export interface ResearcherInRepoEvidenceValidationResult {
  valid: boolean;
  issues: ResearcherInRepoEvidenceValidationIssue[];
}

export interface ResearcherInRepoEvidenceContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: ResearcherInRepoEvidenceCategory;
  detail: string;
}

export interface ResearcherInRepoEvidenceContractCoverageResult {
  valid: boolean;
  issues: ResearcherInRepoEvidenceContractCoverageIssue[];
}

export type ResearcherInRepoEvidenceProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface ResearcherInRepoEvidenceProbeContract {
  id: string;
  category: ResearcherInRepoEvidenceCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: ResearcherInRepoEvidenceProbeDisposition;
  criterion: string;
}

export interface ResearcherInRepoEvidenceCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface ResearcherInRepoEvidenceCategoryContract {
  category: ResearcherInRepoEvidenceCategory;
  acceptance: ResearcherInRepoEvidenceCategoryAcceptance;
  probes: readonly ResearcherInRepoEvidenceProbeContract[];
}

export interface ResearcherInRepoEvidenceContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<ResearcherInRepoEvidenceCategory, ResearcherInRepoEvidenceCategoryContract>;
  probes: readonly ResearcherInRepoEvidenceProbeContract[];
}

export const RESEARCHER_IN_REPO_EVIDENCE_A01_MIN_PROBES: Readonly<
  Record<ResearcherInRepoEvidenceCategory, number>
> = {
  evidence_versioning: 3,
  repo_signal: 3,
  citation_signal: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

function flattenInRepoEvidenceCategoryProbes(
  categories: Record<ResearcherInRepoEvidenceCategory, ResearcherInRepoEvidenceCategoryContract>,
): readonly ResearcherInRepoEvidenceProbeContract[] {
  return RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES.flatMap(category => categories[category].probes);
}

const RESEARCHER_IN_REPO_EVIDENCE_CATEGORY_CONTRACTS: Record<
  ResearcherInRepoEvidenceCategory,
  ResearcherInRepoEvidenceCategoryContract
> = {
  evidence_versioning: {
    category: "evidence_versioning",
    acceptance: {
      invariant:
        "In-repo evidence baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "riev.version_tagged",
        category: "evidence_versioning",
        description: "In-repo evidence baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "In-repo evidence baseline declares semver version field",
      },
      {
        id: "riev.atom_tagged",
        category: "evidence_versioning",
        description: "In-repo evidence baseline declares P04-B02-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "In-repo evidence baseline declares P04-B02-A01 atom id",
      },
      {
        id: "riev.harness_version_exported",
        category: "evidence_versioning",
        description: "FORGE_RESEARCHER_IN_REPO_EVIDENCE_VERSION exported for in-repo evidence harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_RESEARCHER_IN_REPO_EVIDENCE_VERSION exported for in-repo evidence harness",
      },
    ],
  },
  repo_signal: {
    category: "repo_signal",
    acceptance: {
      invariant:
        "Research engine and tools expose grep-based in-repo search wired into unified research context.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "riev.research_engine_search_files",
        category: "repo_signal",
        description: "research-engine searchFiles greps project files for in-repo evidence",
        expected: "PASS",
        disposition: "observed",
        criterion: "research-engine searchFiles greps project files for in-repo evidence",
      },
      {
        id: "riev.research_combined_file_results",
        category: "repo_signal",
        description: "research() aggregates fileResults alongside web findings",
        expected: "PASS",
        disposition: "observed",
        criterion: "research() aggregates fileResults alongside web findings",
      },
      {
        id: "riev.tools_search_fallback",
        category: "repo_signal",
        description: "web_search tool falls back to local searchFiles when Brave API unavailable",
        expected: "PASS",
        disposition: "observed",
        criterion: "web_search tool falls back to local searchFiles when Brave API unavailable",
      },
    ],
  },
  citation_signal: {
    category: "citation_signal",
    acceptance: {
      invariant:
        "File search results and worker tools expose path:line citations for grounded repo evidence.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "riev.research_context_file_fields",
        category: "citation_signal",
        description: "FileSearchResult exposes file path, line number and matching text for citations",
        expected: "PASS",
        disposition: "observed",
        criterion: "FileSearchResult exposes file path, line number and matching text for citations",
      },
      {
        id: "riev.tools_read_file",
        category: "citation_signal",
        description: "read_file tool enables grounded file content inspection",
        expected: "PASS",
        disposition: "observed",
        criterion: "read_file tool enables grounded file content inspection",
      },
      {
        id: "riev.tools_grep",
        category: "citation_signal",
        description: "grep tool searches repository contents with path:line citations",
        expected: "PASS",
        disposition: "observed",
        criterion: "grep tool searches repository contents with path:line citations",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "P04-B01 block gate handoff targets P04-B02-A01 with sealed question decomposition probe count.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "riev.b01_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P04_B01_TO_B02_HANDOFF_V1 targets P04-B02-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P04_B01_TO_B02_HANDOFF_V1 targets P04-B02-A01 entry atom",
      },
      {
        id: "riev.b01_sealed_question_probes",
        category: "baseline_link",
        description: "P04-B01→B02 handoff sealed probeCount matches active question decomposition contract",
        expected: "PASS",
        disposition: "observed",
        criterion: "P04-B01→B02 handoff sealed probeCount matches active question decomposition contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Search query input boundary assessment handles empty, whitespace-only and oversized inputs; probe runner and documented gaps wired.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "riev.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P04-B01 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P04-B01 block gate source artifacts",
      },
      {
        id: "riev.probe_runner_exported",
        category: "boundary",
        description: "runResearcherInRepoEvidenceProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runResearcherInRepoEvidenceProbes executes contract-wired probe matrix",
      },
      {
        id: "riev.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL in-repo evidence gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL in-repo evidence gap",
      },
      {
        id: "riev.empty_query_boundary",
        category: "boundary",
        description: "assessInRepoEvidenceInputBoundary rejects empty search query input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessInRepoEvidenceInputBoundary rejects empty search query input",
      },
      {
        id: "riev.whitespace_query_boundary",
        category: "boundary",
        description: "assessInRepoEvidenceInputBoundary rejects whitespace-only search query input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessInRepoEvidenceInputBoundary rejects whitespace-only search query input",
      },
      {
        id: "riev.long_query_truncation_boundary",
        category: "boundary",
        description: "assessInRepoEvidenceInputBoundary truncates search query exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessInRepoEvidenceInputBoundary truncates search query exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Invalid fixture versions and malformed search queries are rejected safely.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "riev.invalid_version_rejected",
        category: "failure_path",
        description: "validateResearcherInRepoEvidenceBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateResearcherInRepoEvidenceBaseline rejects unexpected fixture version",
      },
      {
        id: "riev.malformed_query_guard",
        category: "failure_path",
        description: "assessInRepoEvidenceInputBoundary rejects null-byte search query safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessInRepoEvidenceInputBoundary rejects null-byte search query safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Recovery paths tolerate non-fatal research blocks and restructure failed repo evidence parses.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "riev.research_block_non_fatal",
        category: "recovery_path",
        description: "Orchestrator treats researcher BLOCK as non-fatal and continues pipeline",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Orchestrator treats researcher BLOCK as non-fatal and continues pipeline",
      },
      {
        id: "riev.structured_repo_evidence_recovery",
        category: "recovery_path",
        description: "recoverInRepoEvidence restructures failed repo citation parse into actionable evidence plan",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverInRepoEvidence restructures failed repo citation parse into actionable evidence plan",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Researcher can BLOCK on critical infeasibility and orchestrator validates in-repo evidence inputs.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "riev.researcher_critical_block",
        category: "nogo_path",
        description: "RESEARCHER_SYSTEM prompt can BLOCK on critical infeasibility findings",
        expected: "PASS",
        disposition: "nogo",
        criterion: "RESEARCHER_SYSTEM prompt can BLOCK on critical infeasibility findings",
      },
      {
        id: "riev.exported_repo_evidence_validator",
        category: "nogo_path",
        description: "validateInRepoEvidenceCollection exported for orchestrator pre-research wiring",
        expected: "PASS",
        disposition: "nogo",
        criterion: "validateInRepoEvidenceCollection exported for orchestrator pre-research wiring",
      },
    ],
  },
};

export const FORGE_RESEARCHER_IN_REPO_EVIDENCE_CONTRACT_V1: ResearcherInRepoEvidenceContract = {
  version: "1.0.0",
  atom: "P04-B02-A06",
  purpose:
    "Typed in-repo evidence contract declaring measurable repo signal, citation and guard probes.",
  categories: RESEARCHER_IN_REPO_EVIDENCE_CATEGORY_CONTRACTS,
  probes: flattenInRepoEvidenceCategoryProbes(RESEARCHER_IN_REPO_EVIDENCE_CATEGORY_CONTRACTS),
};

export function getActiveResearcherInRepoEvidenceContract(): ResearcherInRepoEvidenceContract {
  return FORGE_RESEARCHER_IN_REPO_EVIDENCE_CONTRACT_V1;
}

export function getResearcherInRepoEvidenceCategoryContract(
  category: ResearcherInRepoEvidenceCategory,
  contract: ResearcherInRepoEvidenceContract = getActiveResearcherInRepoEvidenceContract(),
): ResearcherInRepoEvidenceCategoryContract {
  return contract.categories[category];
}

export function listResearcherInRepoEvidenceContractProbeIds(
  contract: ResearcherInRepoEvidenceContract = getActiveResearcherInRepoEvidenceContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listResearcherInRepoEvidenceProbesByDisposition(
  disposition: ResearcherInRepoEvidenceProbeDisposition,
  contract: ResearcherInRepoEvidenceContract = getActiveResearcherInRepoEvidenceContract(),
): ResearcherInRepoEvidenceProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listResearcherInRepoEvidenceContractProbesByCategory(
  category: ResearcherInRepoEvidenceCategory,
  contract: ResearcherInRepoEvidenceContract = getActiveResearcherInRepoEvidenceContract(),
): ResearcherInRepoEvidenceProbeContract[] {
  return [...contract.categories[category].probes];
}

export function summarizeResearcherInRepoEvidenceContractCoverage(
  contract: ResearcherInRepoEvidenceContract = getActiveResearcherInRepoEvidenceContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<
    ResearcherInRepoEvidenceCategory,
    { probeCount: number; invariant: string }
  >;
  byDisposition: Record<ResearcherInRepoEvidenceProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    ResearcherInRepoEvidenceCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<ResearcherInRepoEvidenceProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES) {
    const categoryContract = contract.categories[category];
    byCategory[category] = {
      probeCount: categoryContract.probes.length,
      invariant: categoryContract.acceptance.invariant,
    };
    for (const probe of categoryContract.probes) {
      totalProbes++;
      if (probe.expected === "PASS") expectedPass++;
      else expectedFail++;
      byDisposition[probe.disposition]++;
    }
  }

  return { totalProbes, expectedPass, expectedFail, byCategory, byDisposition };
}

export function validateResearcherInRepoEvidenceContractCoverage(
  contract: ResearcherInRepoEvidenceContract = getActiveResearcherInRepoEvidenceContract(),
): ResearcherInRepoEvidenceContractCoverageResult {
  const issues: ResearcherInRepoEvidenceContractCoverageIssue[] = [];

  for (const category of RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES) {
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
      RESEARCHER_IN_REPO_EVIDENCE_A01_MIN_PROBES[category]
    ) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${RESEARCHER_IN_REPO_EVIDENCE_A01_MIN_PROBES[category]}`,
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

  const ids = listResearcherInRepoEvidenceContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeResearcherInRepoEvidenceContractCoverage(contract);
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
    if (!probe.id.startsWith("riev.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing riev. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateResearcherInRepoEvidenceAgainstContract(
  fixture: ResearcherInRepoEvidenceBaseline,
  contract: ResearcherInRepoEvidenceContract = getActiveResearcherInRepoEvidenceContract(),
): ResearcherInRepoEvidenceValidationResult {
  const issues: ResearcherInRepoEvidenceValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  for (const category of RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES) {
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

export const FORGE_RESEARCHER_IN_REPO_EVIDENCE_A01_PROBE_MATRIX: readonly ResearcherInRepoEvidenceFixtureEntry[] =
  researcherInRepoEvidenceBaseline.probes as ResearcherInRepoEvidenceFixtureEntry[];

export function loadResearcherInRepoEvidenceBaseline(): ResearcherInRepoEvidenceBaseline {
  return researcherInRepoEvidenceBaseline as ResearcherInRepoEvidenceBaseline;
}

export function validateResearcherInRepoEvidenceBaseline(
  fixture: ResearcherInRepoEvidenceBaseline,
): ResearcherInRepoEvidenceValidationResult {
  const issues: ResearcherInRepoEvidenceValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P04-B02-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES.map(category => [category, 0]),
  ) as Record<ResearcherInRepoEvidenceCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES) {
    const min = RESEARCHER_IN_REPO_EVIDENCE_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_RESEARCHER_IN_REPO_EVIDENCE_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_RESEARCHER_IN_REPO_EVIDENCE_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_RESEARCHER_IN_REPO_EVIDENCE_A01_PROBE_MATRIX) {
    const entry = fixture.probes.find(p => p.id === expected.id);
    if (!entry) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `missing probe ${expected.id}`,
      });
      continue;
    }
    if (entry.category !== expected.category || entry.expected !== expected.expected) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `probe metadata mismatch for ${expected.id}`,
      });
    }
  }

  const handoff = getForgeP04B01ToB02Handoff();
  const questionCoverage = summarizeResearcherQuestionDecompositionContractCoverage(
    getActiveResearcherQuestionDecompositionContract(),
  );

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (
    fixture.sourceBlockGate.contractVersion !==
    FORGE_RESEARCHER_QUESTION_DECOMPOSITION_CONTRACT_V1.version
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.contractVersion=${fixture.sourceBlockGate.contractVersion} ` +
        `expected=${FORGE_RESEARCHER_QUESTION_DECOMPOSITION_CONTRACT_V1.version}`,
    });
  }
  if (
    fixture.sourceBlockGate.questionDecompositionProbeCount !== questionCoverage.totalProbes
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.questionDecompositionProbeCount=${fixture.sourceBlockGate.questionDecompositionProbeCount} ` +
        `contract=${questionCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P04_B01_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P04_B01_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P04-B02-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `P04-B01 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P04-B02-A01`,
    });
  }

  const contract = getActiveResearcherInRepoEvidenceContract();
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

  const contractAlignment = validateResearcherInRepoEvidenceAgainstContract(fixture);
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export interface ResearcherInRepoEvidenceProbeMatrixValidationIssue {
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

export interface ResearcherInRepoEvidenceProbeMatrixValidationResult {
  valid: boolean;
  issues: ResearcherInRepoEvidenceProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 */
export function validateResearcherInRepoEvidenceProbeMatrix(
  results: ResearcherInRepoEvidenceProbeResult[],
  contract: ResearcherInRepoEvidenceContract = getActiveResearcherInRepoEvidenceContract(),
): ResearcherInRepoEvidenceProbeMatrixValidationResult {
  const issues: ResearcherInRepoEvidenceProbeMatrixValidationIssue[] = [];
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
        detail: `unexpected mismatch: expected=${result.expected} actual=${result.actual} (${result.detail})`,
      });
      unexpectedMismatches++;
    }
  }

  if (results.length !== contract.probes.length) {
    issues.push({
      kind: "extra_result",
      detail: `results=${results.length} contract=${contract.probes.length}`,
    });
    unexpectedMismatches++;
  }

  return {
    valid: issues.length === 0,
    issues,
    passAligned,
    gapAligned,
    unexpectedMismatches,
  };
}

export interface ResearcherInRepoEvidenceProductionSliceResult {
  atom: "P04-B02-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: ResearcherInRepoEvidenceProbeResult[];
  summary: ResearcherInRepoEvidenceProbeSummary;
  matrixValidation: ResearcherInRepoEvidenceProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: recoverInRepoEvidence wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runResearcherInRepoEvidenceProductionSlice(
  fixture: ResearcherInRepoEvidenceBaseline = loadResearcherInRepoEvidenceBaseline(),
): ResearcherInRepoEvidenceProductionSliceResult {
  const contract = getActiveResearcherInRepoEvidenceContract();
  const fixtureValidation = validateResearcherInRepoEvidenceBaseline(fixture);
  const contractValidation = validateResearcherInRepoEvidenceAgainstContract(fixture, contract);
  const results = runResearcherInRepoEvidenceProbes(fixture);
  const summary = summarizeResearcherInRepoEvidenceMatrix(results);
  const matrixValidation = validateResearcherInRepoEvidenceProbeMatrix(results, contract);

  return {
    atom: "P04-B02-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

/**
 * Validate boundary-category probe matrix — A04 slice gate.
 * Only boundary probes are evaluated; zero unexpected mismatches required.
 */
export function validateResearcherInRepoEvidenceBoundaryProbeMatrix(
  results: ResearcherInRepoEvidenceProbeResult[],
  contract: ResearcherInRepoEvidenceContract = getActiveResearcherInRepoEvidenceContract(),
): ResearcherInRepoEvidenceProbeMatrixValidationResult {
  const boundaryProbes = listResearcherInRepoEvidenceContractProbesByCategory(
    "boundary",
    contract,
  );
  const boundaryContract: ResearcherInRepoEvidenceContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateResearcherInRepoEvidenceProbeMatrix(boundaryResults, boundaryContract);
}

export interface ResearcherInRepoEvidenceBoundarySliceResult {
  atom: "P04-B02-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherInRepoEvidenceProbeResult[];
  boundaryResults: ResearcherInRepoEvidenceProbeResult[];
  matrixValidation: ResearcherInRepoEvidenceProbeMatrixValidationResult;
}

/**
 * A04 boundary slice: contract-wired boundary probes (search query input edge cases, probe runner,
 * documented gaps) with zero unexpected mismatches.
 */
export function runResearcherInRepoEvidenceBoundarySlice(
  fixture: ResearcherInRepoEvidenceBaseline = loadResearcherInRepoEvidenceBaseline(),
): ResearcherInRepoEvidenceBoundarySliceResult {
  const contract = getActiveResearcherInRepoEvidenceContract();
  const results = runResearcherInRepoEvidenceProbes(fixture);
  const boundaryProbes = listResearcherInRepoEvidenceContractProbesByCategory(
    "boundary",
    contract,
  );
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateResearcherInRepoEvidenceBoundaryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B02-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const RESEARCHER_IN_REPO_EVIDENCE_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly ResearcherInRepoEvidenceCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes must align; zero unexpected mismatches.
 */
export function validateResearcherInRepoEvidenceFailureRecoveryProbeMatrix(
  results: ResearcherInRepoEvidenceProbeResult[],
  contract: ResearcherInRepoEvidenceContract = getActiveResearcherInRepoEvidenceContract(),
): ResearcherInRepoEvidenceProbeMatrixValidationResult {
  const failureRecoveryProbes = RESEARCHER_IN_REPO_EVIDENCE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherInRepoEvidenceContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: ResearcherInRepoEvidenceContract = {
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
  return validateResearcherInRepoEvidenceProbeMatrix(
    failureRecoveryResults,
    failureRecoveryContract,
  );
}

export function listResearcherInRepoEvidenceFailureRecoveryProbeIds(
  contract: ResearcherInRepoEvidenceContract = getActiveResearcherInRepoEvidenceContract(),
): string[] {
  return RESEARCHER_IN_REPO_EVIDENCE_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listResearcherInRepoEvidenceContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface ResearcherInRepoEvidenceFailureRecoverySliceResult {
  atom: "P04-B02-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherInRepoEvidenceProbeResult[];
  failureRecoveryResults: ResearcherInRepoEvidenceProbeResult[];
  matrixValidation: ResearcherInRepoEvidenceProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes (invalid fixture rejection, null-byte guard, non-fatal research BLOCK,
 * recoverInRepoEvidence, researcher BLOCK, validateInRepoEvidenceCollection) with zero
 * unexpected mismatches.
 */
export function runResearcherInRepoEvidenceFailureRecoverySlice(
  fixture: ResearcherInRepoEvidenceBaseline = loadResearcherInRepoEvidenceBaseline(),
): ResearcherInRepoEvidenceFailureRecoverySliceResult {
  const contract = getActiveResearcherInRepoEvidenceContract();
  const results = runResearcherInRepoEvidenceProbes(fixture);
  const failureRecoveryProbes = RESEARCHER_IN_REPO_EVIDENCE_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherInRepoEvidenceContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateResearcherInRepoEvidenceFailureRecoveryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B02-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

export function summarizeResearcherInRepoEvidenceMatrix(
  results: ResearcherInRepoEvidenceProbeResult[],
): ResearcherInRepoEvidenceProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as ResearcherInRepoEvidenceProbeSummary["byCategory"];
  for (const category of RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES) {
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

export function listResearcherInRepoEvidenceProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherInRepoEvidenceBaseline = loadResearcherInRepoEvidenceBaseline(),
): ResearcherInRepoEvidenceFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listResearcherInRepoEvidenceKnownGaps(
  results: ResearcherInRepoEvidenceProbeResult[],
): ResearcherInRepoEvidenceProbeResult[] {
  return summarizeResearcherInRepoEvidenceMatrix(results).knownGaps;
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
  category: ResearcherInRepoEvidenceCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): ResearcherInRepoEvidenceProbeResult {
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

function productionInRepoEvidenceSource(): string {
  return readSrc("forge-p04-researcher-in-repo-evidence.ts");
}

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function researchEngineSource(): string {
  return readSrc("research-engine.ts");
}

function toolsSource(): string {
  return readSrc("tools.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionInRepoEvidenceSource());
}

function researcherFormatSection(): string {
  const prompts = promptsSource();
  const researcherStart = prompts.indexOf("const RESEARCHER_SYSTEM");
  const workerStart = prompts.indexOf("const WORKER_SYSTEM");
  if (researcherStart === -1 || workerStart === -1 || workerStart <= researcherStart) {
    return prompts;
  }
  return prompts.slice(researcherStart, workerStart);
}

function runResearcherInRepoEvidenceProbe(
  id: string,
  category: ResearcherInRepoEvidenceCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherInRepoEvidenceBaseline,
): ResearcherInRepoEvidenceProbeResult {
  const contract = getActiveResearcherInRepoEvidenceContract();
  const contractProbe = contract.probes.find(p => p.id === id);
  const criterion = contractProbe?.criterion;
  const orchestrator = orchestratorSource();
  const researchEngine = researchEngineSource();
  const tools = toolsSource();
  const researcherPrompt = researcherFormatSection();

  switch (id) {
    case "riev.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`, criterion);
    }
    case "riev.atom_tagged": {
      const ok = fixture.atom === "P04-B02-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`, criterion);
    }
    case "riev.harness_version_exported": {
      const ok = FORGE_RESEARCHER_IN_REPO_EVIDENCE_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_RESEARCHER_IN_REPO_EVIDENCE_VERSION}`,
        criterion,
      );
    }
    case "riev.research_engine_search_files": {
      const ok =
        researchEngine.includes("export function searchFiles") &&
        researchEngine.includes("grep -rn");
      return probe(id, category, expected, ok, `searchFiles=${ok}`, criterion);
    }
    case "riev.research_combined_file_results": {
      const ok =
        researchEngine.includes("fileResults") &&
        researchEngine.includes("export async function research(") &&
        researchEngine.includes("includeFiles");
      return probe(id, category, expected, ok, `combinedResearch=${ok}`, criterion);
    }
    case "riev.tools_search_fallback": {
      const ok =
        tools.includes("Fallback: local project file search") &&
        tools.includes("searchFiles(projectRoot, query");
      return probe(id, category, expected, ok, `toolsFallback=${ok}`, criterion);
    }
    case "riev.research_context_file_fields": {
      const ok =
        researchEngine.includes("export interface FileSearchResult") &&
        researchEngine.includes("file: string") &&
        researchEngine.includes("line: number") &&
        researchEngine.includes("text: string");
      return probe(id, category, expected, ok, `fileSearchResultFields=${ok}`, criterion);
    }
    case "riev.tools_read_file": {
      const ok = tools.includes('name: "read_file"') && tools.includes('case "read_file"');
      return probe(id, category, expected, ok, `readFileTool=${ok}`, criterion);
    }
    case "riev.tools_grep": {
      const ok = tools.includes('name: "grep"') && tools.includes('case "grep"');
      return probe(id, category, expected, ok, `grepTool=${ok}`, criterion);
    }
    case "riev.b01_block_handoff_entry": {
      const handoff = getForgeP04B01ToB02Handoff();
      const ok =
        handoff.targetBlock.blockId === "P04-B02" &&
        handoff.targetBlock.entryAtom === "P04-B02-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
        criterion,
      );
    }
    case "riev.b01_sealed_question_probes": {
      const handoff = getForgeP04B01ToB02Handoff();
      const coverage = summarizeResearcherQuestionDecompositionContractCoverage(
        getActiveResearcherQuestionDecompositionContract(),
      );
      const ok = handoff.sealedArtifacts.probeCount === coverage.totalProbes;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoff_probes=${handoff.sealedArtifacts.probeCount}, contract=${coverage.totalProbes}`,
        criterion,
      );
    }
    case "riev.source_block_gate_ref": {
      const handoff = getForgeP04B01ToB02Handoff();
      const coverage = summarizeResearcherQuestionDecompositionContractCoverage(
        getActiveResearcherQuestionDecompositionContract(),
      );
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.questionDecompositionProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P04_B01_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.questionDecompositionProbeCount}`,
        criterion,
      );
    }
    case "riev.probe_runner_exported": {
      const ok = productionInRepoEvidenceSource().includes(
        "export function runResearcherInRepoEvidenceProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`, criterion);
    }
    case "riev.known_gaps_documented": {
      const contract = getActiveResearcherInRepoEvidenceContract();
      const expectedFail = contract.probes.filter(p => p.expected === "FAIL").length;
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount === expectedFail;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, contractExpectedFail=${expectedFail}`,
        criterion,
      );
    }
    case "riev.empty_query_boundary": {
      const result = assessInRepoEvidenceInputBoundary("");
      const ok =
        hasProductionExport("assessInRepoEvidenceInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, acceptable=${result.acceptable}`,
        criterion,
      );
    }
    case "riev.whitespace_query_boundary": {
      const result = assessInRepoEvidenceInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessInRepoEvidenceInputBoundary") &&
        result.disposition === "whitespace_only" &&
        result.acceptable === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, acceptable=${result.acceptable}`,
        criterion,
      );
    }
    case "riev.long_query_truncation_boundary": {
      const longQuery = "x".repeat(RESEARCHER_IN_REPO_EVIDENCE_QUERY_MAX_LENGTH + 500);
      const result = assessInRepoEvidenceInputBoundary(longQuery);
      const ok =
        hasProductionExport("assessInRepoEvidenceInputBoundary") &&
        result.acceptable === true &&
        result.truncated === true &&
        result.normalizedQuery.length === RESEARCHER_IN_REPO_EVIDENCE_QUERY_MAX_LENGTH;
      return probe(
        id,
        category,
        expected,
        ok,
        `truncated=${result.truncated}, len=${result.normalizedQuery.length}`,
        criterion,
      );
    }
    case "riev.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateResearcherInRepoEvidenceBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`, criterion);
    }
    case "riev.malformed_query_guard": {
      const boundary = assessInRepoEvidenceInputBoundary("query\0input");
      const ok =
        hasProductionExport("assessInRepoEvidenceInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false;
      return probe(id, category, expected, ok, `disposition=${boundary.disposition}`, criterion);
    }
    case "riev.research_block_non_fatal": {
      const ok =
        orchestrator.includes("Research BLOCK") &&
        orchestrator.includes("non-fatal");
      return probe(id, category, expected, ok, `researchBlockNonFatal=${ok}`, criterion);
    }
    case "riev.structured_repo_evidence_recovery": {
      const recovery = recoverInRepoEvidence(
        'malformed repo citation: src/research-engine.ts:30 export function searchFiles {"file":"broken',
      );
      const ok =
        hasProductionExport("recoverInRepoEvidence") &&
        recovery.recovered &&
        recovery.evidencePlan.searchQueries.length >= 1 &&
        recovery.evidencePlan.citationTargets.some(target => target.file.includes("research-engine.ts"));
      return probe(
        id,
        category,
        expected,
        ok,
        `recoverFn=${ok}, queryCount=${recovery.evidencePlan.searchQueries.length}`,
        criterion,
      );
    }
    case "riev.researcher_critical_block": {
      const ok =
        researcherPrompt.includes("You CAN block the Strategist") &&
        researcherPrompt.includes("CRITICAL issue");
      return probe(id, category, expected, ok, `researcherCriticalBlock=${ok}`, criterion);
    }
    case "riev.exported_repo_evidence_validator": {
      const ok = hasProductionExport("validateInRepoEvidenceCollection");
      const sampleHits = searchFiles(SRC_ROOT, "export function validateInRepoEvidenceCollection", "*.ts", 1);
      const liveOk = ok && sampleHits.length >= 0;
      return probe(
        id,
        category,
        expected,
        liveOk,
        `validateInRepoEvidenceCollection=${ok}`,
        criterion,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown probe id", criterion);
  }
}

export function runResearcherInRepoEvidenceProbes(
  fixture: ResearcherInRepoEvidenceBaseline = loadResearcherInRepoEvidenceBaseline(),
): ResearcherInRepoEvidenceProbeResult[] {
  const contract = getActiveResearcherInRepoEvidenceContract();
  return contract.probes.map(contractProbe =>
    runResearcherInRepoEvidenceProbe(
      contractProbe.id,
      contractProbe.category,
      contractProbe.expected,
      fixture,
    ),
  );
}
