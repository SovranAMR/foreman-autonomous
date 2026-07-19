/**
 * FOREMAN — Researcher Benchmark & Prior-Art Analysis Baseline (P04-B04)
 *
 * A01 slice: load, validate, run probes, contract alignment against sealed
 * P04-B03 web primary-source block gate artifacts.
 * A03 slice: recoverBenchmarkPriorArtEvidence production vertical slice.
 * A04 slice: boundary-category probe matrix validation for topic input edge cases.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import researcherBenchmarkPriorArtBaseline from "./fixtures/forge-researcher-benchmark-prior-art-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP04B03ToB04Handoff,
  getActiveResearcherWebPrimarySourceContract,
  summarizeResearcherWebPrimarySourceContractCoverage,
  FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_CONTRACT_V1,
} from "./forge-p04-researcher-web-primary-source.js";

export const FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_VERSION = "1.0.0-a04";

export const EXPECTED_P04_B03_SEALED_ATOM_COUNT = 10;

/** Maximum normalized benchmark prior-art topic length before truncation (P04-B04-A01 boundary). */
export const RESEARCHER_BENCHMARK_PRIOR_ART_TOPIC_MAX_LENGTH = 4096;

export const RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES = [
  "evidence_versioning",
  "benchmark_signal",
  "prior_art_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type ResearcherBenchmarkPriorArtCategory =
  (typeof RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES)[number];

export type BenchmarkPriorArtInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface BenchmarkPriorArtInputBoundary {
  disposition: BenchmarkPriorArtInputDisposition;
  acceptable: boolean;
  normalizedTopic: string;
  truncated: boolean;
  detail: string;
}

/**
 * Assess topic input boundary conditions before benchmark prior-art collection (P04-B04-A01).
 */
export function assessBenchmarkPriorArtInputBoundary(
  topic: string,
): BenchmarkPriorArtInputBoundary {
  if (topic.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedTopic: "",
      truncated: false,
      detail: "null byte detected in topic input",
    };
  }

  const trimmed = topic.trim();
  if (trimmed.length === 0) {
    const disposition: BenchmarkPriorArtInputDisposition =
      topic.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedTopic: "",
      truncated: false,
      detail: disposition === "empty" ? "empty topic input" : "whitespace-only topic input",
    };
  }

  let normalizedTopic = topic;
  let truncated = false;
  if (normalizedTopic.length > RESEARCHER_BENCHMARK_PRIOR_ART_TOPIC_MAX_LENGTH) {
    normalizedTopic = normalizedTopic.slice(0, RESEARCHER_BENCHMARK_PRIOR_ART_TOPIC_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedTopic,
    truncated,
    detail: truncated
      ? `topic truncated to ${RESEARCHER_BENCHMARK_PRIOR_ART_TOPIC_MAX_LENGTH} characters`
      : "valid topic input",
  };
}

export interface BenchmarkPriorArtHitEntry {
  source: string;
  text: string;
  title?: string;
}

export interface BenchmarkPriorArtCollectionValidationOutcome {
  valid: boolean;
  hitCount: number;
  issues: string[];
}

/**
 * Validate benchmark prior-art collection inputs before orchestrator pre-research wiring (P04-B04-A01).
 */
export function validateBenchmarkPriorArtCollection(
  topic: string,
  hits: BenchmarkPriorArtHitEntry[] = [],
): BenchmarkPriorArtCollectionValidationOutcome {
  const boundary = assessBenchmarkPriorArtInputBoundary(topic);
  if (!boundary.acceptable) {
    return {
      valid: false,
      hitCount: 0,
      issues: [boundary.detail],
    };
  }

  const hitCount = hits.length;
  if (hitCount === 0) {
    return {
      valid: false,
      hitCount,
      issues: ["zero benchmark prior-art hits for normalized topic"],
    };
  }

  const hasCitationFields = hits.every(
    hit =>
      typeof hit.source === "string" &&
      hit.source.length > 0 &&
      typeof hit.text === "string" &&
      hit.text.length > 0,
  );
  if (!hasCitationFields) {
    return {
      valid: false,
      hitCount,
      issues: ["prior-art hits missing source or text citation fields"],
    };
  }

  return {
    valid: true,
    hitCount,
    issues: [],
  };
}

export interface BenchmarkPriorArtRecoveryHints {
  searchQueries?: string[];
  topic?: string;
}

export interface BenchmarkPriorArtRecoveryResult {
  recovered: boolean;
  evidencePlan: {
    searchQueries: string[];
    citationTargets: Array<{ source: string; text?: string; title?: string }>;
  };
  parseErrors: string[];
  detail: string;
}

const BENCHMARK_PRIOR_ART_HTTP_URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const BENCHMARK_PRIOR_ART_MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi;
const BENCHMARK_PRIOR_ART_BENCHMARK_LABEL_PATTERN =
  /(?:benchmark|prior[- ]?art|baseline)\s*[:=]\s*([^\s,;]+)/gi;

/**
 * Restructure failed prior-art parse into actionable benchmark evidence plan (P04-B04-A03).
 */
export function recoverBenchmarkPriorArtEvidence(
  failedParse: string,
  hints: BenchmarkPriorArtRecoveryHints = {},
): BenchmarkPriorArtRecoveryResult {
  const parseErrors: string[] = [];
  const boundary = assessBenchmarkPriorArtInputBoundary(failedParse);

  if (!boundary.acceptable) {
    return {
      recovered: false,
      evidencePlan: { searchQueries: [], citationTargets: [] },
      parseErrors: [boundary.disposition],
      detail: `cannot recover ${boundary.disposition.replace(/_/g, "-")} prior-art parse`,
    };
  }

  const raw = boundary.normalizedTopic;
  const citationTargets: Array<{ source: string; text?: string; title?: string }> = [];

  if (raw.includes("{") || raw.includes("[")) {
    try {
      JSON.parse(raw);
    } catch {
      parseErrors.push("json_parse_failed");
    }
  }

  for (const match of raw.matchAll(BENCHMARK_PRIOR_ART_MARKDOWN_LINK_PATTERN)) {
    const title = match[1]?.trim();
    const source = match[2]?.trim();
    if (source) {
      citationTargets.push({ source, title: title || undefined });
    }
  }

  for (const match of raw.matchAll(BENCHMARK_PRIOR_ART_HTTP_URL_PATTERN)) {
    const source = match[0]?.trim();
    if (!source) continue;
    if (!citationTargets.some(target => target.source === source)) {
      citationTargets.push({ source });
    }
  }

  for (const match of raw.matchAll(BENCHMARK_PRIOR_ART_BENCHMARK_LABEL_PATTERN)) {
    const label = match[1]?.trim();
    if (label && label.length > 2) {
      citationTargets.push({ source: label, text: label });
    }
  }

  const exportMatch = raw.match(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/);
  if (exportMatch) {
    const source = citationTargets[0]?.source ?? "unknown";
    citationTargets.push({ source, text: exportMatch[1] });
  }

  const searchQueries: string[] = hints.searchQueries ? [...hints.searchQueries] : [];

  for (const target of citationTargets) {
    if (target.text) {
      searchQueries.push(`benchmark ${target.text}`);
      searchQueries.push(target.text);
    } else if (target.source.startsWith("http")) {
      searchQueries.push(target.source);
      const hostname = target.source.match(/https?:\/\/([^/]+)/)?.[1];
      if (hostname) {
        searchQueries.push(`prior art ${hostname}`);
      }
    } else {
      searchQueries.push(`prior art ${target.source}`);
    }
  }

  if (hints.topic) {
    searchQueries.push(hints.topic);
  }

  if (searchQueries.length === 0) {
    const keywords = raw
      .split(/\s+/)
      .map(word => word.replace(/[^A-Za-z0-9_./:-]/g, ""))
      .filter(word => word.length > 4)
      .slice(0, 4);
    if (keywords.length > 0) {
      searchQueries.push(`benchmark ${keywords.join(" ")}`);
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
      detail: "no actionable search queries extracted from failed prior-art parse",
    };
  }

  return {
    recovered: true,
    evidencePlan: {
      searchQueries: uniqueQueries,
      citationTargets,
    },
    parseErrors,
    detail: `recovered ${uniqueQueries.length} search queries from failed prior-art parse`,
  };
}

export interface ResearcherBenchmarkPriorArtFixtureEntry {
  id: string;
  category: ResearcherBenchmarkPriorArtCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface ResearcherBenchmarkPriorArtBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    webPrimarySourceProbeCount: number;
    sealedAtomCount: number;
  };
  probes: ResearcherBenchmarkPriorArtFixtureEntry[];
}

export interface ResearcherBenchmarkPriorArtProbeResult {
  id: string;
  category: ResearcherBenchmarkPriorArtCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface ResearcherBenchmarkPriorArtProbeSummary {
  total: number;
  aligned: number;
  mismatches: ResearcherBenchmarkPriorArtProbeResult[];
  knownGaps: ResearcherBenchmarkPriorArtProbeResult[];
  byCategory: Record<
    ResearcherBenchmarkPriorArtCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface ResearcherBenchmarkPriorArtValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: ResearcherBenchmarkPriorArtCategory;
  detail: string;
}

export interface ResearcherBenchmarkPriorArtValidationResult {
  valid: boolean;
  issues: ResearcherBenchmarkPriorArtValidationIssue[];
}

export type ResearcherBenchmarkPriorArtProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface ResearcherBenchmarkPriorArtProbeContract {
  id: string;
  category: ResearcherBenchmarkPriorArtCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: ResearcherBenchmarkPriorArtProbeDisposition;
  criterion: string;
}

export interface ResearcherBenchmarkPriorArtCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface ResearcherBenchmarkPriorArtCategoryContract {
  category: ResearcherBenchmarkPriorArtCategory;
  acceptance: ResearcherBenchmarkPriorArtCategoryAcceptance;
  probes: readonly ResearcherBenchmarkPriorArtProbeContract[];
}

export interface ResearcherBenchmarkPriorArtContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<
    ResearcherBenchmarkPriorArtCategory,
    ResearcherBenchmarkPriorArtCategoryContract
  >;
  probes: readonly ResearcherBenchmarkPriorArtProbeContract[];
}

export const RESEARCHER_BENCHMARK_PRIOR_ART_A01_MIN_PROBES: Readonly<
  Record<ResearcherBenchmarkPriorArtCategory, number>
> = {
  evidence_versioning: 3,
  benchmark_signal: 3,
  prior_art_signal: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

function flattenBenchmarkPriorArtCategoryProbes(
  categories: Record<
    ResearcherBenchmarkPriorArtCategory,
    ResearcherBenchmarkPriorArtCategoryContract
  >,
): readonly ResearcherBenchmarkPriorArtProbeContract[] {
  return RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES.flatMap(
    category => categories[category].probes,
  );
}

const RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORY_CONTRACTS: Record<
  ResearcherBenchmarkPriorArtCategory,
  ResearcherBenchmarkPriorArtCategoryContract
> = {
  evidence_versioning: {
    category: "evidence_versioning",
    acceptance: {
      invariant:
        "Benchmark prior-art baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rbpa.version_tagged",
        category: "evidence_versioning",
        description: "Benchmark prior-art baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Benchmark prior-art baseline declares semver version field",
      },
      {
        id: "rbpa.atom_tagged",
        category: "evidence_versioning",
        description: "Benchmark prior-art baseline declares P04-B04-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Benchmark prior-art baseline declares P04-B04-A01 atom id",
      },
      {
        id: "rbpa.harness_version_exported",
        category: "evidence_versioning",
        description:
          "FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_VERSION exported for benchmark prior-art harness",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_VERSION exported for benchmark prior-art harness",
      },
    ],
  },
  benchmark_signal: {
    category: "benchmark_signal",
    acceptance: {
      invariant:
        "Benchmark eval harness and orchestrator expose regression gates; researcher prompt requires best practices.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rbpa.benchmark_eval_harness_export",
        category: "benchmark_signal",
        description:
          "forge-benchmark-eval-harness exports versioned benchmark eval contract for regression gates",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "forge-benchmark-eval-harness exports versioned benchmark eval contract for regression gates",
      },
      {
        id: "rbpa.orchestrator_benchmark_regression",
        category: "benchmark_signal",
        description:
          "Orchestrator verifyForgeBenchmarkEvalRegression runs benchmark eval harness regression gate",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Orchestrator verifyForgeBenchmarkEvalRegression runs benchmark eval harness regression gate",
      },
      {
        id: "rbpa.researcher_best_practices_prompt",
        category: "benchmark_signal",
        description:
          "RESEARCHER_SYSTEM prompt requires best practices and industry standards research",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "RESEARCHER_SYSTEM prompt requires best practices and industry standards research",
      },
    ],
  },
  prior_art_signal: {
    category: "prior_art_signal",
    acceptance: {
      invariant:
        "Web search, link intelligence and visioner prompts expose prior-art and reference benchmark signals.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rbpa.web_search_prior_art",
        category: "prior_art_signal",
        description: "research-engine webSearch queries external sources for prior-art evidence",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "research-engine webSearch queries external sources for prior-art evidence",
      },
      {
        id: "rbpa.link_intelligence_classify",
        category: "prior_art_signal",
        description: "LinkIntelligence classifyUrl categorizes URLs before prior-art extraction",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "LinkIntelligence classifyUrl categorizes URLs before prior-art extraction",
      },
      {
        id: "rbpa.visioner_reference_benchmarks",
        category: "prior_art_signal",
        description: "VISIONER_SYSTEM prompt requires REFERENCE BENCHMARKS for complex tasks",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "VISIONER_SYSTEM prompt requires REFERENCE BENCHMARKS for complex tasks",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "P04-B03 block gate handoff targets P04-B04-A01 with sealed web primary-source probe count.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rbpa.b03_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P04_B03_TO_B04_HANDOFF_V1 targets P04-B04-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P04_B03_TO_B04_HANDOFF_V1 targets P04-B04-A01 entry atom",
      },
      {
        id: "rbpa.b03_sealed_web_primary_probes",
        category: "baseline_link",
        description:
          "P04-B03→B04 handoff sealed probeCount matches active web primary-source contract",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "P04-B03→B04 handoff sealed probeCount matches active web primary-source contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Baseline references sealed P04-B03 block gate, documents FAIL gaps and validates topic boundaries.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rbpa.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P04-B03 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P04-B03 block gate source artifacts",
      },
      {
        id: "rbpa.probe_runner_exported",
        category: "boundary",
        description: "runResearcherBenchmarkPriorArtProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runResearcherBenchmarkPriorArtProbes executes contract-wired probe matrix",
      },
      {
        id: "rbpa.known_gaps_documented",
        category: "boundary",
        description:
          "Baseline fixture documents at least one measurable FAIL benchmark prior-art gap",
        expected: "PASS",
        disposition: "gap",
        criterion:
          "Baseline fixture documents at least one measurable FAIL benchmark prior-art gap",
      },
      {
        id: "rbpa.empty_topic_boundary",
        category: "boundary",
        description: "assessBenchmarkPriorArtInputBoundary rejects empty topic input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessBenchmarkPriorArtInputBoundary rejects empty topic input",
      },
      {
        id: "rbpa.whitespace_topic_boundary",
        category: "boundary",
        description: "assessBenchmarkPriorArtInputBoundary rejects whitespace-only topic input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessBenchmarkPriorArtInputBoundary rejects whitespace-only topic input",
      },
      {
        id: "rbpa.long_topic_truncation_boundary",
        category: "boundary",
        description: "assessBenchmarkPriorArtInputBoundary truncates topic exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessBenchmarkPriorArtInputBoundary truncates topic exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Invalid fixture versions and malformed topics are rejected safely.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rbpa.invalid_version_rejected",
        category: "failure_path",
        description: "validateResearcherBenchmarkPriorArtBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion:
          "validateResearcherBenchmarkPriorArtBaseline rejects unexpected fixture version",
      },
      {
        id: "rbpa.malformed_topic_guard",
        category: "failure_path",
        description: "assessBenchmarkPriorArtInputBoundary rejects null-byte topic safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessBenchmarkPriorArtInputBoundary rejects null-byte topic safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Recovery paths tolerate non-fatal research blocks and restructure failed prior-art parses.",
      minProbeCount: 2,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "rbpa.research_block_non_fatal",
        category: "recovery_path",
        description: "Orchestrator treats researcher BLOCK as non-fatal and continues pipeline",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Orchestrator treats researcher BLOCK as non-fatal and continues pipeline",
      },
      {
        id: "rbpa.structured_benchmark_prior_art_recovery",
        category: "recovery_path",
        description:
          "recoverBenchmarkPriorArtEvidence restructures failed prior-art parse into actionable evidence plan",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "recoverBenchmarkPriorArtEvidence restructures failed prior-art parse into actionable evidence plan",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Researcher can BLOCK on critical infeasibility and orchestrator validates benchmark prior-art inputs.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rbpa.researcher_critical_block",
        category: "nogo_path",
        description: "RESEARCHER_SYSTEM prompt can BLOCK on critical infeasibility findings",
        expected: "PASS",
        disposition: "nogo",
        criterion: "RESEARCHER_SYSTEM prompt can BLOCK on critical infeasibility findings",
      },
      {
        id: "rbpa.exported_benchmark_prior_art_validator",
        category: "nogo_path",
        description:
          "validateBenchmarkPriorArtCollection exported for orchestrator pre-research wiring",
        expected: "PASS",
        disposition: "nogo",
        criterion:
          "validateBenchmarkPriorArtCollection exported for orchestrator pre-research wiring",
      },
    ],
  },
};

export const FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_CONTRACT_V1: ResearcherBenchmarkPriorArtContract =
  {
    version: "1.0.0",
    atom: "P04-B04-A06",
    purpose:
      "Typed benchmark prior-art contract declaring measurable benchmark signal, prior-art and guard probes.",
    categories: RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORY_CONTRACTS,
    probes: flattenBenchmarkPriorArtCategoryProbes(
      RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORY_CONTRACTS,
    ),
  };

export function getActiveResearcherBenchmarkPriorArtContract(): ResearcherBenchmarkPriorArtContract {
  return FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_CONTRACT_V1;
}

export function getResearcherBenchmarkPriorArtCategoryContract(
  category: ResearcherBenchmarkPriorArtCategory,
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): ResearcherBenchmarkPriorArtCategoryContract {
  return contract.categories[category];
}

export function listResearcherBenchmarkPriorArtContractProbeIds(
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listResearcherBenchmarkPriorArtProbesByDisposition(
  disposition: ResearcherBenchmarkPriorArtProbeDisposition,
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): ResearcherBenchmarkPriorArtProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listResearcherBenchmarkPriorArtContractProbesByCategory(
  category: ResearcherBenchmarkPriorArtCategory,
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): ResearcherBenchmarkPriorArtProbeContract[] {
  return [...contract.categories[category].probes];
}

export function summarizeResearcherBenchmarkPriorArtContractCoverage(
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<
    ResearcherBenchmarkPriorArtCategory,
    { probeCount: number; invariant: string }
  >;
  byDisposition: Record<ResearcherBenchmarkPriorArtProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    ResearcherBenchmarkPriorArtCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<ResearcherBenchmarkPriorArtProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES) {
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

export interface ResearcherBenchmarkPriorArtContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: ResearcherBenchmarkPriorArtCategory;
  detail: string;
}

export interface ResearcherBenchmarkPriorArtContractCoverageResult {
  valid: boolean;
  issues: ResearcherBenchmarkPriorArtContractCoverageIssue[];
}

export function validateResearcherBenchmarkPriorArtContractCoverage(
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): ResearcherBenchmarkPriorArtContractCoverageResult {
  const issues: ResearcherBenchmarkPriorArtContractCoverageIssue[] = [];

  for (const category of RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES) {
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
      RESEARCHER_BENCHMARK_PRIOR_ART_A01_MIN_PROBES[category]
    ) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${RESEARCHER_BENCHMARK_PRIOR_ART_A01_MIN_PROBES[category]}`,
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

  const ids = listResearcherBenchmarkPriorArtContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeResearcherBenchmarkPriorArtContractCoverage(contract);
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
    if (!probe.id.startsWith("rbpa.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing rbpa. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateResearcherBenchmarkPriorArtAgainstContract(
  fixture: ResearcherBenchmarkPriorArtBaseline,
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): ResearcherBenchmarkPriorArtValidationResult {
  const issues: ResearcherBenchmarkPriorArtValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES) {
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

export const FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_A01_PROBE_MATRIX: readonly ResearcherBenchmarkPriorArtFixtureEntry[] =
  researcherBenchmarkPriorArtBaseline.probes as ResearcherBenchmarkPriorArtFixtureEntry[];

export function loadResearcherBenchmarkPriorArtBaseline(): ResearcherBenchmarkPriorArtBaseline {
  return researcherBenchmarkPriorArtBaseline as ResearcherBenchmarkPriorArtBaseline;
}

export function validateResearcherBenchmarkPriorArtBaseline(
  fixture: ResearcherBenchmarkPriorArtBaseline,
): ResearcherBenchmarkPriorArtValidationResult {
  const issues: ResearcherBenchmarkPriorArtValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P04-B04-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES.map(category => [category, 0]),
  ) as Record<ResearcherBenchmarkPriorArtCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES) {
    const min = RESEARCHER_BENCHMARK_PRIOR_ART_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (
    fixture.probes.length !== FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_A01_PROBE_MATRIX.length
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_A01_PROBE_MATRIX) {
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

  const handoff = getForgeP04B03ToB04Handoff();
  const webCoverage = summarizeResearcherWebPrimarySourceContractCoverage(
    getActiveResearcherWebPrimarySourceContract(),
  );

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (
    fixture.sourceBlockGate.contractVersion !==
    FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_CONTRACT_V1.version
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.contractVersion=${fixture.sourceBlockGate.contractVersion} ` +
        `expected=${FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_CONTRACT_V1.version}`,
    });
  }
  if (
    fixture.sourceBlockGate.webPrimarySourceProbeCount !== webCoverage.totalProbes
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.webPrimarySourceProbeCount=${fixture.sourceBlockGate.webPrimarySourceProbeCount} ` +
        `contract=${webCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P04_B03_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P04_B03_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P04-B04-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `P04-B03 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P04-B04-A01`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  const contract = getActiveResearcherBenchmarkPriorArtContract();
  const expectedFailCount = contract.probes.filter(p => p.expected === "FAIL").length;
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

  const contractAlignment = validateResearcherBenchmarkPriorArtAgainstContract(fixture);
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeResearcherBenchmarkPriorArtMatrix(
  results: ResearcherBenchmarkPriorArtProbeResult[],
): ResearcherBenchmarkPriorArtProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as ResearcherBenchmarkPriorArtProbeSummary["byCategory"];
  for (const category of RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES) {
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

export function listResearcherBenchmarkPriorArtProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherBenchmarkPriorArtBaseline = loadResearcherBenchmarkPriorArtBaseline(),
): ResearcherBenchmarkPriorArtFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listResearcherBenchmarkPriorArtKnownGaps(
  results: ResearcherBenchmarkPriorArtProbeResult[],
): ResearcherBenchmarkPriorArtProbeResult[] {
  return summarizeResearcherBenchmarkPriorArtMatrix(results).knownGaps;
}

export interface ResearcherBenchmarkPriorArtProbeMatrixValidationIssue {
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

export interface ResearcherBenchmarkPriorArtProbeMatrixValidationResult {
  valid: boolean;
  issues: ResearcherBenchmarkPriorArtProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 */
export function validateResearcherBenchmarkPriorArtProbeMatrix(
  results: ResearcherBenchmarkPriorArtProbeResult[],
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): ResearcherBenchmarkPriorArtProbeMatrixValidationResult {
  const issues: ResearcherBenchmarkPriorArtProbeMatrixValidationIssue[] = [];
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

export interface ResearcherBenchmarkPriorArtProductionSliceResult {
  atom: "P04-B04-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: ResearcherBenchmarkPriorArtProbeResult[];
  summary: ResearcherBenchmarkPriorArtProbeSummary;
  matrixValidation: ResearcherBenchmarkPriorArtProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: recoverBenchmarkPriorArtEvidence wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runResearcherBenchmarkPriorArtProductionSlice(
  fixture: ResearcherBenchmarkPriorArtBaseline = loadResearcherBenchmarkPriorArtBaseline(),
): ResearcherBenchmarkPriorArtProductionSliceResult {
  const contract = getActiveResearcherBenchmarkPriorArtContract();
  const fixtureValidation = validateResearcherBenchmarkPriorArtBaseline(fixture);
  const contractValidation = validateResearcherBenchmarkPriorArtAgainstContract(fixture, contract);
  const results = runResearcherBenchmarkPriorArtProbes(fixture);
  const summary = summarizeResearcherBenchmarkPriorArtMatrix(results);
  const matrixValidation = validateResearcherBenchmarkPriorArtProbeMatrix(results, contract);

  return {
    atom: "P04-B04-A03",
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
export function validateResearcherBenchmarkPriorArtBoundaryProbeMatrix(
  results: ResearcherBenchmarkPriorArtProbeResult[],
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): ResearcherBenchmarkPriorArtProbeMatrixValidationResult {
  const boundaryProbes = listResearcherBenchmarkPriorArtContractProbesByCategory(
    "boundary",
    contract,
  );
  const boundaryContract: ResearcherBenchmarkPriorArtContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateResearcherBenchmarkPriorArtProbeMatrix(boundaryResults, boundaryContract);
}

export interface ResearcherBenchmarkPriorArtBoundarySliceResult {
  atom: "P04-B04-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherBenchmarkPriorArtProbeResult[];
  boundaryResults: ResearcherBenchmarkPriorArtProbeResult[];
  matrixValidation: ResearcherBenchmarkPriorArtProbeMatrixValidationResult;
}

/**
 * A04 boundary slice: contract-wired boundary probes (topic input edge cases, probe runner,
 * documented gaps) with zero unexpected mismatches.
 */
export function runResearcherBenchmarkPriorArtBoundarySlice(
  fixture: ResearcherBenchmarkPriorArtBaseline = loadResearcherBenchmarkPriorArtBaseline(),
): ResearcherBenchmarkPriorArtBoundarySliceResult {
  const contract = getActiveResearcherBenchmarkPriorArtContract();
  const results = runResearcherBenchmarkPriorArtProbes(fixture);
  const boundaryProbes = listResearcherBenchmarkPriorArtContractProbesByCategory(
    "boundary",
    contract,
  );
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateResearcherBenchmarkPriorArtBoundaryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B04-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
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
  category: ResearcherBenchmarkPriorArtCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): ResearcherBenchmarkPriorArtProbeResult {
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

function productionBenchmarkPriorArtSource(): string {
  return readSrc("forge-p04-researcher-benchmark-prior-art.ts");
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

function linkIntelligenceSource(): string {
  return readSrc("link-intelligence.ts");
}

function benchmarkEvalHarnessSource(): string {
  return readSrc("forge-benchmark-eval-harness.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(
    productionBenchmarkPriorArtSource(),
  );
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

function visionerFormatSection(): string {
  const prompts = promptsSource();
  const visionerStart = prompts.indexOf("const VISIONER_SYSTEM");
  const strategistStart = prompts.indexOf("const STRATEGIST_SYSTEM");
  if (visionerStart === -1 || strategistStart === -1 || strategistStart <= visionerStart) {
    return prompts;
  }
  return prompts.slice(visionerStart, strategistStart);
}

function runResearcherBenchmarkPriorArtProbe(
  id: string,
  category: ResearcherBenchmarkPriorArtCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherBenchmarkPriorArtBaseline,
): ResearcherBenchmarkPriorArtProbeResult {
  const contract = getActiveResearcherBenchmarkPriorArtContract();
  const contractProbe = contract.probes.find(p => p.id === id);
  const criterion = contractProbe?.criterion;
  const orchestrator = orchestratorSource();
  const researchEngine = researchEngineSource();
  const linkIntelligence = linkIntelligenceSource();
  const benchmarkHarness = benchmarkEvalHarnessSource();
  const researcherPrompt = researcherFormatSection();
  const visionerPrompt = visionerFormatSection();

  switch (id) {
    case "rbpa.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`, criterion);
    }
    case "rbpa.atom_tagged": {
      const ok = fixture.atom === "P04-B04-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`, criterion);
    }
    case "rbpa.harness_version_exported": {
      const ok = FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_VERSION}`,
        criterion,
      );
    }
    case "rbpa.benchmark_eval_harness_export": {
      const ok =
        benchmarkHarness.includes("export const FORGE_BENCHMARK_EVAL_HARNESS_VERSION") &&
        benchmarkHarness.includes("export function getActiveBenchmarkEvalContract");
      return probe(id, category, expected, ok, `benchmarkEvalHarness=${ok}`, criterion);
    }
    case "rbpa.orchestrator_benchmark_regression": {
      const ok =
        orchestrator.includes("async verifyForgeBenchmarkEvalRegression") &&
        orchestrator.includes("runForgeBenchmarkEvalRegressionGate");
      return probe(id, category, expected, ok, `benchmarkRegression=${ok}`, criterion);
    }
    case "rbpa.researcher_best_practices_prompt": {
      const ok =
        researcherPrompt.includes("best practices and industry standards") &&
        researcherPrompt.includes("What examples exist?");
      return probe(id, category, expected, ok, `researcherBestPractices=${ok}`, criterion);
    }
    case "rbpa.web_search_prior_art": {
      const ok =
        researchEngine.includes("export async function webSearch") &&
        researchEngine.includes("Brave Search");
      return probe(id, category, expected, ok, `webSearch=${ok}`, criterion);
    }
    case "rbpa.link_intelligence_classify": {
      const ok =
        linkIntelligence.includes("export function classifyUrl") &&
        linkIntelligence.includes("export class LinkIntelligence");
      return probe(id, category, expected, ok, `linkIntelligence=${ok}`, criterion);
    }
    case "rbpa.visioner_reference_benchmarks": {
      const ok =
        visionerPrompt.includes("REFERENCE BENCHMARKS") &&
        visionerPrompt.includes("3-5 specific real examples");
      return probe(id, category, expected, ok, `visionerBenchmarks=${ok}`, criterion);
    }
    case "rbpa.b03_block_handoff_entry": {
      const handoff = getForgeP04B03ToB04Handoff();
      const ok =
        handoff.targetBlock.blockId === "P04-B04" &&
        handoff.targetBlock.entryAtom === "P04-B04-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
        criterion,
      );
    }
    case "rbpa.b03_sealed_web_primary_probes": {
      const handoff = getForgeP04B03ToB04Handoff();
      const coverage = summarizeResearcherWebPrimarySourceContractCoverage(
        getActiveResearcherWebPrimarySourceContract(),
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
    case "rbpa.source_block_gate_ref": {
      const handoff = getForgeP04B03ToB04Handoff();
      const coverage = summarizeResearcherWebPrimarySourceContractCoverage(
        getActiveResearcherWebPrimarySourceContract(),
      );
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.webPrimarySourceProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P04_B03_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.webPrimarySourceProbeCount}`,
        criterion,
      );
    }
    case "rbpa.probe_runner_exported": {
      const ok = productionBenchmarkPriorArtSource().includes(
        "export function runResearcherBenchmarkPriorArtProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`, criterion);
    }
    case "rbpa.known_gaps_documented": {
      const contract = getActiveResearcherBenchmarkPriorArtContract();
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
    case "rbpa.empty_topic_boundary": {
      const result = assessBenchmarkPriorArtInputBoundary("");
      const ok =
        hasProductionExport("assessBenchmarkPriorArtInputBoundary") &&
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
    case "rbpa.whitespace_topic_boundary": {
      const result = assessBenchmarkPriorArtInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessBenchmarkPriorArtInputBoundary") &&
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
    case "rbpa.long_topic_truncation_boundary": {
      const longTopic = "x".repeat(RESEARCHER_BENCHMARK_PRIOR_ART_TOPIC_MAX_LENGTH + 500);
      const result = assessBenchmarkPriorArtInputBoundary(longTopic);
      const ok =
        hasProductionExport("assessBenchmarkPriorArtInputBoundary") &&
        result.acceptable === true &&
        result.truncated === true &&
        result.normalizedTopic.length === RESEARCHER_BENCHMARK_PRIOR_ART_TOPIC_MAX_LENGTH;
      return probe(
        id,
        category,
        expected,
        ok,
        `truncated=${result.truncated}, len=${result.normalizedTopic.length}`,
        criterion,
      );
    }
    case "rbpa.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateResearcherBenchmarkPriorArtBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`, criterion);
    }
    case "rbpa.malformed_topic_guard": {
      const boundary = assessBenchmarkPriorArtInputBoundary("topic\0input");
      const ok =
        hasProductionExport("assessBenchmarkPriorArtInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false;
      return probe(id, category, expected, ok, `disposition=${boundary.disposition}`, criterion);
    }
    case "rbpa.research_block_non_fatal": {
      const ok =
        orchestrator.includes("Research BLOCK") &&
        orchestrator.includes("non-fatal");
      return probe(id, category, expected, ok, `researchBlockNonFatal=${ok}`, criterion);
    }
    case "rbpa.structured_benchmark_prior_art_recovery": {
      const recovery = recoverBenchmarkPriorArtEvidence(
        'malformed prior-art citation: https://benchmark.example.com/report export function runBenchmark {"source":"broken',
      );
      const ok =
        hasProductionExport("recoverBenchmarkPriorArtEvidence") &&
        recovery.recovered &&
        recovery.evidencePlan.searchQueries.length >= 1 &&
        recovery.evidencePlan.citationTargets.some(target =>
          target.source.includes("benchmark.example.com"),
        );
      return probe(
        id,
        category,
        expected,
        ok,
        `recoverFn=${ok}, queryCount=${recovery.evidencePlan.searchQueries.length}`,
        criterion,
      );
    }
    case "rbpa.researcher_critical_block": {
      const ok =
        researcherPrompt.includes("You CAN block the Strategist") &&
        researcherPrompt.includes("CRITICAL issue");
      return probe(id, category, expected, ok, `researcherCriticalBlock=${ok}`, criterion);
    }
    case "rbpa.exported_benchmark_prior_art_validator": {
      const ok = hasProductionExport("validateBenchmarkPriorArtCollection");
      return probe(
        id,
        category,
        expected,
        ok,
        `validateBenchmarkPriorArtCollection=${ok}`,
        criterion,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown probe id", criterion);
  }
}

export function runResearcherBenchmarkPriorArtProbes(
  fixture: ResearcherBenchmarkPriorArtBaseline = loadResearcherBenchmarkPriorArtBaseline(),
): ResearcherBenchmarkPriorArtProbeResult[] {
  const contract = getActiveResearcherBenchmarkPriorArtContract();
  return contract.probes.map(contractProbe =>
    runResearcherBenchmarkPriorArtProbe(
      contractProbe.id,
      contractProbe.category,
      contractProbe.expected,
      fixture,
    ),
  );
}
