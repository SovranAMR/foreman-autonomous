/**
 * FOREMAN — Researcher Benchmark & Prior-Art Analysis Baseline (P04-B04)
 *
 * A01 slice: load, validate, run probes, contract alignment against sealed
 * P04-B03 web primary-source block gate artifacts.
 * A03 slice: recoverBenchmarkPriorArtEvidence production vertical slice.
 * A04 slice: boundary-category probe matrix validation for topic input edge cases.
 * A05 slice: failure/recovery/NO-GO category probe matrix validation for invalid fixture,
 * null-byte guard, non-fatal research BLOCK, prior-art recovery and validator export paths.
 * A06 slice: evidence, telemetry and provenance run record for failure/recovery/NO-GO probes.
 * A07 slice: unit, property and fuzz validation for benchmark prior-art contract and run records.
 * A10 slice: block gate evidence seal and P04-B05 handoff contract.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import researcherBenchmarkPriorArtBaseline from "./fixtures/forge-researcher-benchmark-prior-art-v1.json" with { type: "json" };
import type {
  ForgeAcceptanceOutcome,
  ForgeBlockAtomSeal,
  ForgeBlockGateCheck,
  ForgeBlockGateDefinition,
} from "./forge-baseline-contract.js";
import {
  getForgeP04B03ToB04Handoff,
  getActiveResearcherWebPrimarySourceContract,
  summarizeResearcherWebPrimarySourceContractCoverage,
  FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_CONTRACT_V1,
} from "./forge-p04-researcher-web-primary-source.js";

export const FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_VERSION = "1.0.0-a07";

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

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const RESEARCHER_BENCHMARK_PRIOR_ART_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly ResearcherBenchmarkPriorArtCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes must align; zero unexpected mismatches.
 */
export function validateResearcherBenchmarkPriorArtFailureRecoveryProbeMatrix(
  results: ResearcherBenchmarkPriorArtProbeResult[],
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): ResearcherBenchmarkPriorArtProbeMatrixValidationResult {
  const failureRecoveryProbes = RESEARCHER_BENCHMARK_PRIOR_ART_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherBenchmarkPriorArtContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: ResearcherBenchmarkPriorArtContract = {
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
  return validateResearcherBenchmarkPriorArtProbeMatrix(
    failureRecoveryResults,
    failureRecoveryContract,
  );
}

export function listResearcherBenchmarkPriorArtFailureRecoveryProbeIds(
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): string[] {
  return RESEARCHER_BENCHMARK_PRIOR_ART_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listResearcherBenchmarkPriorArtContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface ResearcherBenchmarkPriorArtFailureRecoverySliceResult {
  atom: "P04-B04-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherBenchmarkPriorArtProbeResult[];
  failureRecoveryResults: ResearcherBenchmarkPriorArtProbeResult[];
  matrixValidation: ResearcherBenchmarkPriorArtProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes (invalid fixture rejection, null-byte guard, non-fatal research BLOCK,
 * recoverBenchmarkPriorArtEvidence, researcher BLOCK, validateBenchmarkPriorArtCollection)
 * with zero unexpected mismatches.
 */
export function runResearcherBenchmarkPriorArtFailureRecoverySlice(
  fixture: ResearcherBenchmarkPriorArtBaseline = loadResearcherBenchmarkPriorArtBaseline(),
): ResearcherBenchmarkPriorArtFailureRecoverySliceResult {
  const contract = getActiveResearcherBenchmarkPriorArtContract();
  const results = runResearcherBenchmarkPriorArtProbes(fixture);
  const failureRecoveryProbes = RESEARCHER_BENCHMARK_PRIOR_ART_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherBenchmarkPriorArtContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateResearcherBenchmarkPriorArtFailureRecoveryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B04-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

/** Per-probe evidence artifact — disposition, criterion and aligned outcomes (P04-B04-A06). */
export interface ResearcherBenchmarkPriorArtProbeEvidence {
  probeId: string;
  category: ResearcherBenchmarkPriorArtCategory;
  disposition: ResearcherBenchmarkPriorArtProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for benchmark prior-art runs (P04-B04-A06). */
export interface ResearcherBenchmarkPriorArtProbeTelemetry {
  probeId: string;
  category: ResearcherBenchmarkPriorArtCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P04-B04-A06). */
export interface ResearcherBenchmarkPriorArtProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourceBlockGateVersion: string;
  sourceBlockGateAtom: string;
  /** Slice atom when record covers a subset (e.g. evidence gate). */
  sliceAtom?: string;
  /** Categories included when sliceAtom is set. */
  sliceCategories?: readonly ResearcherBenchmarkPriorArtCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated benchmark prior-art run record bundling evidence, telemetry and provenance. */
export interface ResearcherBenchmarkPriorArtRunRecord {
  provenance: ResearcherBenchmarkPriorArtProvenance;
  evidence: ResearcherBenchmarkPriorArtProbeEvidence[];
  telemetry: ResearcherBenchmarkPriorArtProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<ResearcherBenchmarkPriorArtCategory, number>;
    byDisposition: Record<ResearcherBenchmarkPriorArtProbeDisposition, number>;
  };
}

export interface ResearcherBenchmarkPriorArtRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface ResearcherBenchmarkPriorArtRunValidationResult {
  valid: boolean;
  issues: ResearcherBenchmarkPriorArtRunValidationIssue[];
}

export function buildResearcherBenchmarkPriorArtProbeEvidence(
  probeId: string,
  category: ResearcherBenchmarkPriorArtCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: ResearcherBenchmarkPriorArtProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): ResearcherBenchmarkPriorArtProbeEvidence {
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

export function buildResearcherBenchmarkPriorArtProbeTelemetry(
  probeId: string,
  category: ResearcherBenchmarkPriorArtCategory,
  sequenceIndex: number,
  durationMs: number,
): ResearcherBenchmarkPriorArtProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildResearcherBenchmarkPriorArtProvenance(
  runId: string,
  fixture: ResearcherBenchmarkPriorArtBaseline,
  contract: ResearcherBenchmarkPriorArtContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly ResearcherBenchmarkPriorArtCategory[];
  },
): ResearcherBenchmarkPriorArtProvenance {
  return {
    runId,
    harnessVersion: FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_VERSION,
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

export function buildResearcherBenchmarkPriorArtRunRecord(
  provenance: ResearcherBenchmarkPriorArtProvenance,
  evidence: ResearcherBenchmarkPriorArtProbeEvidence[],
  telemetry: ResearcherBenchmarkPriorArtProbeTelemetry[],
): ResearcherBenchmarkPriorArtRunRecord {
  const byCategory = {} as Record<ResearcherBenchmarkPriorArtCategory, number>;
  const byDisposition: Record<ResearcherBenchmarkPriorArtProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES) {
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

function validateResearcherBenchmarkPriorArtRunRecordAgainstProbeIds(
  record: ResearcherBenchmarkPriorArtRunRecord,
  expectedProbeIds: string[],
  contract: ResearcherBenchmarkPriorArtContract,
): ResearcherBenchmarkPriorArtRunValidationResult {
  const issues: ResearcherBenchmarkPriorArtRunValidationIssue[] = [];
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

export function validateResearcherBenchmarkPriorArtRunRecord(
  record: ResearcherBenchmarkPriorArtRunRecord,
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): ResearcherBenchmarkPriorArtRunValidationResult {
  return validateResearcherBenchmarkPriorArtRunRecordAgainstProbeIds(
    record,
    listResearcherBenchmarkPriorArtContractProbeIds(contract),
    contract,
  );
}

/** Validate evidence slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateResearcherBenchmarkPriorArtEvidenceRunRecord(
  record: ResearcherBenchmarkPriorArtRunRecord,
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): ResearcherBenchmarkPriorArtRunValidationResult {
  const issues: ResearcherBenchmarkPriorArtRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P04-B04-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P04-B04-A06`,
    });
  }

  const expectedCategories = [...RESEARCHER_BENCHMARK_PRIOR_ART_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateResearcherBenchmarkPriorArtRunRecordAgainstProbeIds(
    record,
    listResearcherBenchmarkPriorArtFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

export interface ResearcherBenchmarkPriorArtEvidenceSliceResult {
  atom: "P04-B04-A06";
  evidenceProbeCount: number;
  matrixValid: boolean;
  recordValid: boolean;
  results: ResearcherBenchmarkPriorArtProbeResult[];
  evidenceResults: ResearcherBenchmarkPriorArtProbeResult[];
  matrixValidation: ResearcherBenchmarkPriorArtProbeMatrixValidationResult;
  record: ResearcherBenchmarkPriorArtRunRecord;
  recordValidation: ResearcherBenchmarkPriorArtRunValidationResult;
}

function resolveResearcherBenchmarkPriorArtGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function runResearcherBenchmarkPriorArtProbeWithTiming(
  entry: ResearcherBenchmarkPriorArtFixtureEntry,
  fixture: ResearcherBenchmarkPriorArtBaseline,
  contractProbe:
    | { criterion: string; disposition: ResearcherBenchmarkPriorArtProbeDisposition }
    | undefined,
): {
  result: ResearcherBenchmarkPriorArtProbeResult;
  durationMs: number;
  disposition: ResearcherBenchmarkPriorArtProbeDisposition;
} {
  const start = performance.now();
  const result = runResearcherBenchmarkPriorArtProbe(
    entry.id,
    entry.category,
    entry.expected,
    fixture,
  );
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

function buildResearcherBenchmarkPriorArtRecordFromEntries(
  entries: ResearcherBenchmarkPriorArtFixtureEntry[],
  fixture: ResearcherBenchmarkPriorArtBaseline,
  contract: ResearcherBenchmarkPriorArtContract,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly ResearcherBenchmarkPriorArtCategory[];
  },
): ResearcherBenchmarkPriorArtRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ResearcherBenchmarkPriorArtProbeEvidence[] = [];
  const telemetry: ResearcherBenchmarkPriorArtProbeTelemetry[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runResearcherBenchmarkPriorArtProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildResearcherBenchmarkPriorArtProbeEvidence(
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
      buildResearcherBenchmarkPriorArtProbeTelemetry(
        result.id,
        result.category,
        sequenceIndex,
        durationMs,
      ),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildResearcherBenchmarkPriorArtProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveResearcherBenchmarkPriorArtGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildResearcherBenchmarkPriorArtRunRecord(provenance, evidence, telemetry);
}

/** Run all benchmark prior-art probes and emit auditable evidence, telemetry and provenance (P04-B04-A06). */
export function runResearcherBenchmarkPriorArtProbesWithRecord(
  fixture: ResearcherBenchmarkPriorArtBaseline = loadResearcherBenchmarkPriorArtBaseline(),
): ResearcherBenchmarkPriorArtRunRecord {
  const contract = getActiveResearcherBenchmarkPriorArtContract();
  return buildResearcherBenchmarkPriorArtRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P04-B04-A06). */
export function runResearcherBenchmarkPriorArtFailureRecoverySliceWithRecord(
  fixture: ResearcherBenchmarkPriorArtBaseline = loadResearcherBenchmarkPriorArtBaseline(),
): ResearcherBenchmarkPriorArtRunRecord {
  const contract = getActiveResearcherBenchmarkPriorArtContract();
  const failureRecoveryIds = new Set(listResearcherBenchmarkPriorArtFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildResearcherBenchmarkPriorArtRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P04-B04-A06",
    sliceCategories: RESEARCHER_BENCHMARK_PRIOR_ART_FAILURE_RECOVERY_CATEGORIES,
  });
}

/**
 * A06 evidence slice: contract-wired failure_path, recovery_path, and nogo_path probes
 * with auditable evidence, telemetry and provenance — zero unexpected mismatches.
 */
export function runResearcherBenchmarkPriorArtEvidenceSlice(
  fixture: ResearcherBenchmarkPriorArtBaseline = loadResearcherBenchmarkPriorArtBaseline(),
): ResearcherBenchmarkPriorArtEvidenceSliceResult {
  const contract = getActiveResearcherBenchmarkPriorArtContract();
  const results = runResearcherBenchmarkPriorArtProbes(fixture);
  const failureRecoveryProbes = RESEARCHER_BENCHMARK_PRIOR_ART_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherBenchmarkPriorArtContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const evidenceResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateResearcherBenchmarkPriorArtFailureRecoveryProbeMatrix(
    results,
    contract,
  );
  const record = runResearcherBenchmarkPriorArtFailureRecoverySliceWithRecord(fixture);
  const recordValidation = validateResearcherBenchmarkPriorArtEvidenceRunRecord(record, contract);

  return {
    atom: "P04-B04-A06",
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

// ─── Property and fuzz validation (P04-B04-A07) ─────────────────────────────

export interface ResearcherBenchmarkPriorArtPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface ResearcherBenchmarkPriorArtPropertyResult {
  passed: number;
  failed: ResearcherBenchmarkPriorArtPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type ResearcherBenchmarkPriorArtPropertyCheck = {
  id: string;
  description: string;
  check: (contract: ResearcherBenchmarkPriorArtContract) => string | null;
};

const RESEARCHER_BENCHMARK_PRIOR_ART_STRUCTURAL_PROPERTIES: readonly ResearcherBenchmarkPriorArtPropertyCheck[] =
  [
    {
      id: "categories_complete",
      description: "All eight benchmark prior-art categories are declared",
      check: contract => {
        for (const category of RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES) {
          if (!contract.categories[category]) return `missing category: ${category}`;
        }
        return null;
      },
    },
    {
      id: "probe_ids_unique",
      description: "Probe ids are globally unique",
      check: contract => {
        const ids = listResearcherBenchmarkPriorArtContractProbeIds(contract);
        if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
        return null;
      },
    },
    {
      id: "min_probe_count",
      description: "Each category meets contract minProbeCount",
      check: contract => {
        for (const category of RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES) {
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
        "summarizeResearcherBenchmarkPriorArtContractCoverage totals match listResearcherBenchmarkPriorArtContractProbeIds",
      check: contract => {
        const summary = summarizeResearcherBenchmarkPriorArtContractCoverage(contract);
        const ids = listResearcherBenchmarkPriorArtContractProbeIds(contract);
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
      description: "Probe ids are namespaced with rbpa. prefix",
      check: contract => {
        for (const probe of contract.probes) {
          if (!probe.id.startsWith("rbpa.")) {
            return `${probe.id} missing rbpa. prefix`;
          }
        }
        return null;
      },
    },
    {
      id: "run_record_summary_invariant",
      description: "Run record summary aligned + mismatches equals total",
      check: contract => {
        const fixture = loadResearcherBenchmarkPriorArtBaseline();
        const probeIds = listResearcherBenchmarkPriorArtContractProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildResearcherBenchmarkPriorArtProbeEvidence(
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
          return buildResearcherBenchmarkPriorArtProbeTelemetry(
            id,
            probe.category,
            index,
            index,
          );
        });
        const record = buildResearcherBenchmarkPriorArtRunRecord(
          buildResearcherBenchmarkPriorArtProvenance(
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
        "Synthetic failure/recovery slice record passes validateResearcherBenchmarkPriorArtEvidenceRunRecord",
      check: contract => {
        const fixture = loadResearcherBenchmarkPriorArtBaseline();
        const probeIds = listResearcherBenchmarkPriorArtFailureRecoveryProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildResearcherBenchmarkPriorArtProbeEvidence(
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
          return buildResearcherBenchmarkPriorArtProbeTelemetry(
            id,
            probe.category,
            index,
            index * 0.5,
          );
        });
        const record = buildResearcherBenchmarkPriorArtRunRecord(
          buildResearcherBenchmarkPriorArtProvenance(
            "property-check-failure-recovery",
            fixture,
            contract,
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T00:00:01.000Z",
            probeIds.length,
            {
              sliceAtom: "P04-B04-A06",
              sliceCategories: RESEARCHER_BENCHMARK_PRIOR_ART_FAILURE_RECOVERY_CATEGORIES,
            },
          ),
          evidence,
          telemetry,
        );
        const validation = validateResearcherBenchmarkPriorArtEvidenceRunRecord(record, contract);
        if (!validation.valid) {
          return validation.issues.map(i => i.detail).join("; ");
        }
        return null;
      },
    },
  ] as const;

export function runResearcherBenchmarkPriorArtPropertyValidation(
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): ResearcherBenchmarkPriorArtPropertyResult {
  const failed: ResearcherBenchmarkPriorArtPropertyViolation[] = [];
  for (const property of RESEARCHER_BENCHMARK_PRIOR_ART_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = RESEARCHER_BENCHMARK_PRIOR_ART_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type ResearcherBenchmarkPriorArtFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface ResearcherBenchmarkPriorArtFuzzMutationCase {
  seed: number;
  kind: ResearcherBenchmarkPriorArtFuzzMutationKind;
  probeId?: string;
  category?: ResearcherBenchmarkPriorArtCategory;
}

export interface ResearcherBenchmarkPriorArtFuzzValidationCaseResult {
  mutation: ResearcherBenchmarkPriorArtFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface ResearcherBenchmarkPriorArtFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: ResearcherBenchmarkPriorArtFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createResearcherBenchmarkPriorArtFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneResearcherBenchmarkPriorArtBaseline(
  fixture: ResearcherBenchmarkPriorArtBaseline,
): ResearcherBenchmarkPriorArtBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickResearcherBenchmarkPriorArtFuzzTarget(
  fixture: ResearcherBenchmarkPriorArtBaseline,
  rng: () => number,
): {
  category: ResearcherBenchmarkPriorArtCategory;
  index: number;
  entry: ResearcherBenchmarkPriorArtFixtureEntry;
} {
  const category =
    RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES[
      Math.floor(rng() * RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES.length)
    ]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyResearcherBenchmarkPriorArtFuzzMutation(
  fixture: ResearcherBenchmarkPriorArtBaseline,
  mutation: ResearcherBenchmarkPriorArtFuzzMutationCase,
): ResearcherBenchmarkPriorArtBaseline {
  const mutated = cloneResearcherBenchmarkPriorArtBaseline(fixture);
  const targetCategory = mutation.category ?? RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES[0]!;
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
          id: `rbpa.fuzz.extra.${mutation.seed}`,
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
      const other = RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateResearcherBenchmarkPriorArtFuzzMutationCases(
  fixture: ResearcherBenchmarkPriorArtBaseline,
  seed: number,
  iterations: number,
): ResearcherBenchmarkPriorArtFuzzMutationCase[] {
  const rng = createResearcherBenchmarkPriorArtFuzzRng(seed);
  const kinds: ResearcherBenchmarkPriorArtFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: ResearcherBenchmarkPriorArtFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickResearcherBenchmarkPriorArtFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P04-B04-A07). */
export function runResearcherBenchmarkPriorArtFuzzValidation(
  fixture: ResearcherBenchmarkPriorArtBaseline,
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
  seed = 42,
  iterations = 24,
): ResearcherBenchmarkPriorArtFuzzValidationResult {
  const cases = generateResearcherBenchmarkPriorArtFuzzMutationCases(fixture, seed, iterations);
  const results: ResearcherBenchmarkPriorArtFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyResearcherBenchmarkPriorArtFuzzMutation(fixture, mutation);
    const validation = validateResearcherBenchmarkPriorArtAgainstContract(mutated, contract);
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

export type ResearcherBenchmarkPriorArtRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface ResearcherBenchmarkPriorArtRunRecordFuzzCase {
  kind: ResearcherBenchmarkPriorArtRunRecordFuzzKind;
  probeId?: string;
}

export function applyResearcherBenchmarkPriorArtRunRecordFuzzMutation(
  record: ResearcherBenchmarkPriorArtRunRecord,
  mutation: ResearcherBenchmarkPriorArtRunRecordFuzzCase,
): ResearcherBenchmarkPriorArtRunRecord {
  const cloned: ResearcherBenchmarkPriorArtRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P04-B04-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["evidence_versioning"],
      };
      break;
  }

  cloned.summary = buildResearcherBenchmarkPriorArtRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveResearcherBenchmarkPriorArtRunRecordValidator(
  record: ResearcherBenchmarkPriorArtRunRecord,
): (
  record: ResearcherBenchmarkPriorArtRunRecord,
  contract: ResearcherBenchmarkPriorArtContract,
) => ResearcherBenchmarkPriorArtRunValidationResult {
  return record.provenance.sliceAtom === "P04-B04-A06"
    ? validateResearcherBenchmarkPriorArtEvidenceRunRecord
    : validateResearcherBenchmarkPriorArtRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P04-B04-A07). */
export function runResearcherBenchmarkPriorArtRunRecordFuzzValidation(
  record: ResearcherBenchmarkPriorArtRunRecord,
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveResearcherBenchmarkPriorArtRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: ResearcherBenchmarkPriorArtRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P04-B04-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyResearcherBenchmarkPriorArtRunRecordFuzzMutation(record, mutation);
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

export interface ResearcherBenchmarkPriorArtPropertyFuzzSliceResult {
  atom: "P04-B04-A07";
  propertyChecksPassed: boolean;
  contractFuzzRejected: boolean;
  runRecordFuzzRejected: boolean;
  propertyResult: ResearcherBenchmarkPriorArtPropertyResult;
  contractFuzz: ResearcherBenchmarkPriorArtFuzzValidationResult;
  runRecordFuzz: {
    validBaseline: boolean;
    mutationsRejected: number;
    mutationsAccepted: number;
  };
}

/**
 * A07 property/fuzz slice: structural property checks and contract fuzz gates
 * with zero accepted mutations.
 */
export function runResearcherBenchmarkPriorArtPropertyFuzzSlice(
  fixture: ResearcherBenchmarkPriorArtBaseline = loadResearcherBenchmarkPriorArtBaseline(),
): ResearcherBenchmarkPriorArtPropertyFuzzSliceResult {
  const contract = getActiveResearcherBenchmarkPriorArtContract();
  const propertyResult = runResearcherBenchmarkPriorArtPropertyValidation(contract);
  const contractFuzz = runResearcherBenchmarkPriorArtFuzzValidation(fixture, contract);
  const record = runResearcherBenchmarkPriorArtFailureRecoverySliceWithRecord(fixture);
  const runRecordFuzz = runResearcherBenchmarkPriorArtRunRecordFuzzValidation(record, contract);

  return {
    atom: "P04-B04-A07",
    propertyChecksPassed: propertyResult.allPassed,
    contractFuzzRejected: contractFuzz.allMutationsRejected,
    runRecordFuzzRejected: runRecordFuzz.mutationsAccepted === 0,
    propertyResult,
    contractFuzz,
    runRecordFuzz,
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

// ─── Probe regression detection (P04-B04-A08) ────────────────────────────────

export interface ResearcherBenchmarkPriorArtProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare benchmark prior-art run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectResearcherBenchmarkPriorArtProbeRegression(
  prior: ResearcherBenchmarkPriorArtRunRecord,
  current: ResearcherBenchmarkPriorArtRunRecord,
): ResearcherBenchmarkPriorArtProbeRegressionReport {
  const priorById = new Map(prior.evidence.map(item => [item.probeId, item]));
  const regressions: string[] = [];
  const fixed: string[] = [];
  const newMismatches: string[] = [];

  for (const item of current.evidence) {
    const previous = priorById.get(item.probeId);
    if (!previous) {
      newMismatches.push(item.probeId);
      continue;
    }
    if (previous.aligned && !item.aligned) {
      regressions.push(item.probeId);
    } else if (!previous.aligned && item.aligned) {
      fixed.push(item.probeId);
    } else if (!item.aligned) {
      newMismatches.push(item.probeId);
    }
  }

  const hasRegression =
    regressions.length > 0 || current.summary.mismatches > prior.summary.mismatches;
  const parts: string[] = [];
  if (regressions.length > 0) parts.push(`${regressions.length} probe regression(s)`);
  if (newMismatches.length > 0) parts.push(`${newMismatches.length} new mismatch(es)`);
  if (fixed.length > 0) parts.push(`${fixed.length} fixed`);
  if (parts.length === 0) parts.push("no alignment regression");

  return {
    hasRegression,
    regressions,
    fixed,
    newMismatches,
    summary: parts.join("; "),
  };
}

export interface ResearcherBenchmarkPriorArtForgeRegressionResult {
  atom: "P04-B04-A08";
  passed: boolean;
  productionSlice: ResearcherBenchmarkPriorArtProductionSliceResult;
  propertyFuzzSlice: ResearcherBenchmarkPriorArtPropertyFuzzSliceResult;
  record: ResearcherBenchmarkPriorArtRunRecord;
  recordValid: boolean;
  priorRecordValid: boolean;
  validationIssues: string[];
  priorValidationIssues: string[];
  probeRegression: ResearcherBenchmarkPriorArtProbeRegressionReport | null;
  guard: ResearcherBenchmarkPriorArtGuardCheckResult;
  detail: string;
}

/**
 * Execute benchmark prior-art probes, validate production slice + run record, property/fuzz gates,
 * and optionally detect regression vs prior run. Forge pipeline integration gate (P04-B04-A08).
 */
export function runResearcherBenchmarkPriorArtForgeRegression(
  priorRecord?: ResearcherBenchmarkPriorArtRunRecord,
): ResearcherBenchmarkPriorArtForgeRegressionResult {
  const fixture = loadResearcherBenchmarkPriorArtBaseline();
  const contract = getActiveResearcherBenchmarkPriorArtContract();
  const productionSlice = runResearcherBenchmarkPriorArtProductionSlice(fixture);
  const propertyFuzzSlice = runResearcherBenchmarkPriorArtPropertyFuzzSlice(fixture);
  const record = runResearcherBenchmarkPriorArtProbesWithRecord(fixture);
  const validation = validateResearcherBenchmarkPriorArtRunRecord(record, contract);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  let priorRecordValid = true;
  let priorValidationIssues: string[] = [];
  if (priorRecord) {
    const priorValidation = validateResearcherBenchmarkPriorArtRunRecord(priorRecord, contract);
    priorRecordValid = priorValidation.valid && priorRecord.summary.mismatches === 0;
    priorValidationIssues = priorValidation.issues.map(issue => issue.detail);
  }

  const probeRegression = priorRecord
    ? detectResearcherBenchmarkPriorArtProbeRegression(priorRecord, record)
    : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;
  const guard = validateForgeResearcherBenchmarkPriorArtGuard(record, {
    totalCostUsd: 0,
    llmCalls: 0,
    contract,
  });

  const productionSliceOk =
    productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0;
  const propertyFuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;

  const passed =
    productionSliceOk &&
    recordValid &&
    priorRecordValid &&
    !alignmentRegression &&
    propertyFuzzOk &&
    guard.passed;

  const detailParts: string[] = [];
  detailParts.push(`${record.summary.aligned}/${record.summary.total} probes aligned`);
  detailParts.push(
    `productionSlice: unexpected=${productionSlice.matrixValidation.unexpectedMismatches}`,
  );
  if (!recordValid) {
    detailParts.push(`validation: ${validationIssues.join("; ") || "mismatches present"}`);
  }
  if (!priorRecordValid) {
    detailParts.push(`priorValidation: ${priorValidationIssues.join("; ") || "tampered prior record"}`);
  }
  if (probeRegression) detailParts.push(`regression: ${probeRegression.summary}`);
  detailParts.push(
    `propertyFuzz: properties=${propertyFuzzSlice.propertyResult.passed}/${propertyFuzzSlice.propertyResult.total} contractFuzz rejected=${propertyFuzzSlice.contractFuzz.rejected}/${propertyFuzzSlice.contractFuzz.iterations} runFuzz rejected=${propertyFuzzSlice.runRecordFuzz.mutationsRejected}`,
  );
  if (!guard.passed) {
    detailParts.push(
      `guard: ${guard.issues.map(issue => `${issue.domain}/${issue.code}`).join(", ") || "failed"}`,
    );
  } else {
    detailParts.push(
      `guard: perf=${guard.metrics.suiteDurationMs.toFixed(1)}ms cost=$${guard.metrics.totalCostUsd} adversarial=${guard.metrics.adversarialScenariosRejected}/${guard.metrics.adversarialScenariosTotal}`,
    );
  }

  return {
    atom: "P04-B04-A08",
    passed,
    productionSlice,
    propertyFuzzSlice,
    record,
    recordValid,
    priorRecordValid,
    validationIssues,
    priorValidationIssues,
    probeRegression,
    guard,
    detail: detailParts.join(" | "),
  };
}

// ─── Guard controls (P04-B04-A09 foundation, used by A08 regression gate) ────

export interface ForgeResearcherBenchmarkPriorArtGuardControls {
  atom: string;
  adversarial: {
    rejectTamperedRecords: true;
    rejectFalseAlignment: true;
    rejectSummaryEvidenceMismatch: true;
  };
  performance: {
    maxSuiteDurationMs: number;
    maxProbeDurationMs: number;
    maxWallClockMs: number;
  };
  cost: {
    maxTotalCostUsd: number;
    maxLlmCalls: number;
  };
  safety: {
    maxDetailLength: number;
    forbiddenPatterns: readonly RegExp[];
  };
}

export interface ResearcherBenchmarkPriorArtGuardCheckIssue {
  domain: "adversarial" | "performance" | "cost" | "safety";
  code: string;
  detail: string;
}

export interface ResearcherBenchmarkPriorArtGuardCheckResult {
  passed: boolean;
  issues: ResearcherBenchmarkPriorArtGuardCheckIssue[];
  metrics: {
    suiteDurationMs: number;
    wallClockMs: number;
    maxProbeDurationMs: number;
    totalCostUsd: number;
    llmCalls: number;
    adversarialScenariosRejected: number;
    adversarialScenariosTotal: number;
  };
}

export interface ResearcherBenchmarkPriorArtAdversarialGuardScenario {
  id: string;
  description: string;
  build: (record: ResearcherBenchmarkPriorArtRunRecord) => ResearcherBenchmarkPriorArtRunRecord;
  expectRejected: true;
}

export const FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_GUARD_CONTROLS_V1: ForgeResearcherBenchmarkPriorArtGuardControls =
  {
    atom: "P04-B04-A09",
    adversarial: {
      rejectTamperedRecords: true,
      rejectFalseAlignment: true,
      rejectSummaryEvidenceMismatch: true,
    },
    performance: {
      maxSuiteDurationMs: 30_000,
      maxProbeDurationMs: 5_000,
      maxWallClockMs: 45_000,
    },
    cost: {
      maxTotalCostUsd: 0,
      maxLlmCalls: 0,
    },
    safety: {
      maxDetailLength: 4096,
      forbiddenPatterns: [
        /sk-[a-zA-Z0-9]{20,}/,
        /api[_-]?key\s*[:=]\s*\S+/i,
        /Bearer\s+[a-zA-Z0-9._-]{20,}/i,
        /password\s*[:=]\s*\S+/i,
        /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
      ],
    },
  };

export function getForgeResearcherBenchmarkPriorArtGuardControls(): ForgeResearcherBenchmarkPriorArtGuardControls {
  return FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_GUARD_CONTROLS_V1;
}

function parseResearcherBenchmarkPriorArtIsoDurationMs(
  startedAt: string,
  completedAt: string,
): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function summarizeResearcherBenchmarkPriorArtTelemetry(
  telemetry: ResearcherBenchmarkPriorArtProbeTelemetry[],
): {
  suiteDurationMs: number;
  maxProbeDurationMs: number;
} {
  let suiteDurationMs = 0;
  let maxProbeDurationMs = 0;
  for (const item of telemetry) {
    suiteDurationMs += item.durationMs;
    if (item.durationMs > maxProbeDurationMs) maxProbeDurationMs = item.durationMs;
  }
  return { suiteDurationMs, maxProbeDurationMs };
}

export function detectResearcherBenchmarkPriorArtEvidenceSummaryMismatch(
  record: ResearcherBenchmarkPriorArtRunRecord,
): string | null {
  let alignedCount = 0;
  for (const item of record.evidence) {
    if (item.aligned) alignedCount++;
  }
  const mismatches = record.evidence.length - alignedCount;
  if (record.summary.aligned !== alignedCount) {
    return `summary.aligned=${record.summary.aligned} evidence=${alignedCount}`;
  }
  if (record.summary.mismatches !== mismatches) {
    return `summary.mismatches=${record.summary.mismatches} evidence=${mismatches}`;
  }
  if (record.summary.total !== record.evidence.length) {
    return `summary.total=${record.summary.total} evidence=${record.evidence.length}`;
  }
  return null;
}

export function detectResearcherBenchmarkPriorArtFalseAlignment(
  record: ResearcherBenchmarkPriorArtRunRecord,
): string[] {
  const violations: string[] = [];
  for (const item of record.evidence) {
    const shouldAlign = item.actual === item.expected;
    if (item.aligned !== shouldAlign) {
      violations.push(
        `${item.probeId}: aligned=${item.aligned} actual=${item.actual} expected=${item.expected}`,
      );
    }
    if (item.aligned && item.actual !== item.expected) {
      violations.push(`${item.probeId}: false PASS claim`);
    }
  }
  return violations;
}

export function validateResearcherBenchmarkPriorArtSafety(
  record: ResearcherBenchmarkPriorArtRunRecord,
  controls: ForgeResearcherBenchmarkPriorArtGuardControls = getForgeResearcherBenchmarkPriorArtGuardControls(),
): ResearcherBenchmarkPriorArtGuardCheckIssue[] {
  const issues: ResearcherBenchmarkPriorArtGuardCheckIssue[] = [];
  for (const item of record.evidence) {
    if (item.detail.length > controls.safety.maxDetailLength) {
      issues.push({
        domain: "safety",
        code: "detail_too_long",
        detail: `${item.probeId} detail length=${item.detail.length}`,
      });
    }
    for (const pattern of controls.safety.forbiddenPatterns) {
      if (pattern.test(item.detail) || pattern.test(item.criterion)) {
        issues.push({
          domain: "safety",
          code: "forbidden_pattern",
          detail: `${item.probeId} matched ${pattern.source}`,
        });
      }
    }
  }
  return issues;
}

export function validateResearcherBenchmarkPriorArtPerformance(
  record: ResearcherBenchmarkPriorArtRunRecord,
  controls: ForgeResearcherBenchmarkPriorArtGuardControls = getForgeResearcherBenchmarkPriorArtGuardControls(),
): ResearcherBenchmarkPriorArtGuardCheckIssue[] {
  const issues: ResearcherBenchmarkPriorArtGuardCheckIssue[] = [];
  const { suiteDurationMs, maxProbeDurationMs } = summarizeResearcherBenchmarkPriorArtTelemetry(
    record.telemetry,
  );
  const wallClockMs = parseResearcherBenchmarkPriorArtIsoDurationMs(
    record.provenance.startedAt,
    record.provenance.completedAt,
  );

  if (suiteDurationMs > controls.performance.maxSuiteDurationMs) {
    issues.push({
      domain: "performance",
      code: "suite_duration_exceeded",
      detail: `${suiteDurationMs}ms > ${controls.performance.maxSuiteDurationMs}ms`,
    });
  }
  if (maxProbeDurationMs > controls.performance.maxProbeDurationMs) {
    issues.push({
      domain: "performance",
      code: "probe_duration_exceeded",
      detail: `${maxProbeDurationMs}ms > ${controls.performance.maxProbeDurationMs}ms`,
    });
  }
  if (wallClockMs > controls.performance.maxWallClockMs) {
    issues.push({
      domain: "performance",
      code: "wall_clock_exceeded",
      detail: `${wallClockMs}ms > ${controls.performance.maxWallClockMs}ms`,
    });
  }
  return issues;
}

export function validateResearcherBenchmarkPriorArtCost(
  totalCostUsd: number,
  llmCalls: number,
  controls: ForgeResearcherBenchmarkPriorArtGuardControls = getForgeResearcherBenchmarkPriorArtGuardControls(),
): ResearcherBenchmarkPriorArtGuardCheckIssue[] {
  const issues: ResearcherBenchmarkPriorArtGuardCheckIssue[] = [];
  if (totalCostUsd > controls.cost.maxTotalCostUsd) {
    issues.push({
      domain: "cost",
      code: "cost_exceeded",
      detail: `$${totalCostUsd.toFixed(4)} > $${controls.cost.maxTotalCostUsd}`,
    });
  }
  if (llmCalls > controls.cost.maxLlmCalls) {
    issues.push({
      domain: "cost",
      code: "llm_calls_exceeded",
      detail: `${llmCalls} > ${controls.cost.maxLlmCalls}`,
    });
  }
  return issues;
}

export function buildResearcherBenchmarkPriorArtAdversarialGuardScenarios(): ResearcherBenchmarkPriorArtAdversarialGuardScenario[] {
  return [
    {
      id: "adversarial.false_alignment_claim",
      description: "Evidence claims aligned while actual !== expected",
      expectRejected: true,
      build: record => {
        const cloned = structuredClone(record);
        const target = cloned.evidence[0];
        if (!target) return cloned;
        target.aligned = true;
        target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
        return cloned;
      },
    },
    {
      id: "adversarial.summary_mismatch",
      description: "Summary reports zero mismatches while evidence is tampered",
      expectRejected: true,
      build: record => {
        const cloned = structuredClone(record);
        const target = cloned.evidence[0];
        if (!target) return cloned;
        target.aligned = false;
        target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
        cloned.summary = { ...cloned.summary, aligned: cloned.summary.total, mismatches: 0 };
        return cloned;
      },
    },
    {
      id: "adversarial.dropped_probe",
      description: "Run record omits required probe evidence",
      expectRejected: true,
      build: record => {
        const cloned = structuredClone(record);
        cloned.evidence = cloned.evidence.slice(1);
        cloned.telemetry = cloned.telemetry.slice(1);
        cloned.summary = {
          ...cloned.summary,
          total: cloned.evidence.length,
          aligned: cloned.evidence.filter(item => item.aligned).length,
          mismatches: cloned.evidence.filter(item => !item.aligned).length,
        };
        return cloned;
      },
    },
  ];
}

export function runResearcherBenchmarkPriorArtAdversarialGuardChecks(
  fixtureRecord: ResearcherBenchmarkPriorArtRunRecord,
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): { rejected: number; total: number; failures: string[] } {
  const scenarios = buildResearcherBenchmarkPriorArtAdversarialGuardScenarios();
  const failures: string[] = [];
  let rejected = 0;

  for (const scenario of scenarios) {
    const tampered = scenario.build(fixtureRecord);
    const validation = validateResearcherBenchmarkPriorArtRunRecord(tampered, contract);
    const falseAlignment = detectResearcherBenchmarkPriorArtFalseAlignment(tampered);
    const summaryMismatch = detectResearcherBenchmarkPriorArtEvidenceSummaryMismatch(tampered);
    const rejectedByGuard =
      !validation.valid || falseAlignment.length > 0 || summaryMismatch !== null;

    if (rejectedByGuard) rejected++;
    else failures.push(`${scenario.id}: tampered record was not rejected`);
  }

  return { rejected, total: scenarios.length, failures };
}

export function validateForgeResearcherBenchmarkPriorArtGuard(
  record: ResearcherBenchmarkPriorArtRunRecord,
  options: {
    totalCostUsd?: number;
    llmCalls?: number;
    contract?: ResearcherBenchmarkPriorArtContract;
    controls?: ForgeResearcherBenchmarkPriorArtGuardControls;
  } = {},
): ResearcherBenchmarkPriorArtGuardCheckResult {
  const controls = options.controls ?? getForgeResearcherBenchmarkPriorArtGuardControls();
  const contract = options.contract ?? getActiveResearcherBenchmarkPriorArtContract();
  const totalCostUsd = options.totalCostUsd ?? 0;
  const llmCalls = options.llmCalls ?? 0;
  const issues: ResearcherBenchmarkPriorArtGuardCheckIssue[] = [];

  issues.push(...validateResearcherBenchmarkPriorArtPerformance(record, controls));
  issues.push(...validateResearcherBenchmarkPriorArtCost(totalCostUsd, llmCalls, controls));
  issues.push(...validateResearcherBenchmarkPriorArtSafety(record, controls));

  const falseAlignment = detectResearcherBenchmarkPriorArtFalseAlignment(record);
  if (falseAlignment.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "false_alignment",
      detail: falseAlignment.join("; "),
    });
  }
  const summaryMismatch = detectResearcherBenchmarkPriorArtEvidenceSummaryMismatch(record);
  if (summaryMismatch) {
    issues.push({
      domain: "adversarial",
      code: "summary_evidence_mismatch",
      detail: summaryMismatch,
    });
  }

  const adversarial = runResearcherBenchmarkPriorArtAdversarialGuardChecks(record, contract);
  if (adversarial.failures.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "scenario_not_rejected",
      detail: adversarial.failures.join("; "),
    });
  }

  const telemetrySummary = summarizeResearcherBenchmarkPriorArtTelemetry(record.telemetry);
  const wallClockMs = parseResearcherBenchmarkPriorArtIsoDurationMs(
    record.provenance.startedAt,
    record.provenance.completedAt,
  );

  return {
    passed: issues.length === 0 && adversarial.rejected === adversarial.total,
    issues,
    metrics: {
      suiteDurationMs: telemetrySummary.suiteDurationMs,
      wallClockMs,
      maxProbeDurationMs: telemetrySummary.maxProbeDurationMs,
      totalCostUsd,
      llmCalls,
      adversarialScenariosRejected: adversarial.rejected,
      adversarialScenariosTotal: adversarial.total,
    },
  };
}

// ─── Block gate and handoff (P04-B04-A10) ─────────────────────────────────────

export interface ResearcherBenchmarkPriorArtBlockGateEvidence {
  blockId: string;
  atom: string;
  sealedAt: string;
  atomSeals: ForgeBlockAtomSeal[];
  regressionPassed: boolean;
  guardPassed: boolean;
  handoffValid: boolean;
  probeCount: number;
  gitCommit?: string;
}

export interface ResearcherBenchmarkPriorArtBlockHandoffContract {
  version: string;
  atom: string;
  sourceBlock: {
    blockId: string;
    title: string;
    completedAtoms: readonly string[];
  };
  targetBlock: {
    blockId: string;
    title: string;
    entryAtom: string;
  };
  sealedArtifacts: {
    fixtureVersion: string;
    contractVersion: string;
    harnessVersion: string;
    probeCount: number;
    benchmarkPriorArtCategories: readonly ResearcherBenchmarkPriorArtCategory[];
    sourceBlockGateAtom: string;
  };
  prerequisites: readonly string[];
  entryCriteria: {
    description: string;
    requiresBlockGatePass: true;
    benchmarkPriorArtRecordRequired: true;
  };
}

export const FORGE_P04_B04_BLOCK_GATE_V1: ForgeBlockGateDefinition = {
  version: "1.0.0",
  atom: "P04-B04-A10",
  blockId: "P04-B04",
  title: "Benchmark ve prior-art analizi",
  requiredAtomIds: [
    "P04-B04-A01",
    "P04-B04-A02",
    "P04-B04-A03",
    "P04-B04-A04",
    "P04-B04-A05",
    "P04-B04-A06",
    "P04-B04-A07",
    "P04-B04-A08",
    "P04-B04-A09",
    "P04-B04-A10",
  ],
  checks: [
    {
      id: "fixture_contract_alignment",
      atomId: "P04-B04-A01",
      description:
        "Benchmark prior-art baseline aligns with typed contract and P04-B03 block gate handoff",
    },
    {
      id: "typed_contract_coverage",
      atomId: "P04-B04-A02",
      description: "Contract declares measurable probes for all benchmark prior-art categories",
    },
    {
      id: "probe_matrix_aligned",
      atomId: "P04-B04-A03",
      description: "Benchmark prior-art probe matrix executes with zero unexpected mismatches",
    },
    {
      id: "boundary_disposition_coverage",
      atomId: "P04-B04-A04",
      description:
        "Contract covers observed, failure, recovery and NO-GO dispositions with boundary probes",
    },
    {
      id: "failure_recovery_nogo",
      atomId: "P04-B04-A05",
      description: "Failure, recovery and NO-GO probes are declared and exercised",
    },
    {
      id: "evidence_telemetry_provenance",
      atomId: "P04-B04-A06",
      description: "Run record carries evidence, telemetry and provenance",
    },
    {
      id: "property_and_fuzz",
      atomId: "P04-B04-A07",
      description: "Structural property and fuzz validation reject tampered inputs",
    },
    {
      id: "regression_gate",
      atomId: "P04-B04-A08",
      description: "Regression gate passes on canonical benchmark prior-art matrix",
    },
    {
      id: "guard_controls",
      atomId: "P04-B04-A09",
      description: "Adversarial, performance, cost and safety guard controls pass",
    },
    {
      id: "block_gate_sealed",
      atomId: "P04-B04-A10",
      description: "Block gate evidence sealed with valid B05 handoff contract",
    },
  ] satisfies readonly ForgeBlockGateCheck[],
};

export const FORGE_P04_B04_TO_B05_HANDOFF_V1: ResearcherBenchmarkPriorArtBlockHandoffContract = {
  version: "1.0.0",
  atom: "P04-B04-A10",
  sourceBlock: {
    blockId: "P04-B04",
    title: "Benchmark ve prior-art analizi",
    completedAtoms: FORGE_P04_B04_BLOCK_GATE_V1.requiredAtomIds,
  },
  targetBlock: {
    blockId: "P04-B05",
    title: "Citation ve provenance graph",
    entryAtom: "P04-B05-A01",
  },
  sealedArtifacts: {
    fixtureVersion: "1.0.0",
    contractVersion: FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_CONTRACT_V1.version,
    harnessVersion: FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_VERSION,
    probeCount: summarizeResearcherBenchmarkPriorArtContractCoverage(
      FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_CONTRACT_V1,
    ).totalProbes,
    benchmarkPriorArtCategories: RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES,
    sourceBlockGateAtom: "P04-B03-A10",
  },
  prerequisites: [
    "Benchmark prior-art contract v1 with measurable benchmark signal, prior-art and guard probes",
    "Versioned benchmark prior-art baseline aligned to contract probe matrix and sealed P04-B03 block gate",
    "Evidence, telemetry and provenance run records",
    "Regression and guard gates integrated with orchestrator verification",
    "Sealed P04-B03 web primary-source block gate referenced by sourceBlockGateAtom",
  ],
  entryCriteria: {
    description:
      "P04-B05-A01 formalizes citation and provenance graph using sealed benchmark prior-art artifacts",
    requiresBlockGatePass: true,
    benchmarkPriorArtRecordRequired: true,
  },
};

export function getForgeP04B04BlockGate(): ForgeBlockGateDefinition {
  return FORGE_P04_B04_BLOCK_GATE_V1;
}

export function getForgeP04B04ToB05Handoff(): ResearcherBenchmarkPriorArtBlockHandoffContract {
  return FORGE_P04_B04_TO_B05_HANDOFF_V1;
}

export function validateResearcherBenchmarkPriorArtBlockHandoffContract(
  handoff: ResearcherBenchmarkPriorArtBlockHandoffContract,
  evidence: Pick<
    ResearcherBenchmarkPriorArtBlockGateEvidence,
    "probeCount" | "regressionPassed" | "guardPassed"
  >,
  contract: ResearcherBenchmarkPriorArtContract = getActiveResearcherBenchmarkPriorArtContract(),
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const coverage = summarizeResearcherBenchmarkPriorArtContractCoverage(contract);

  if (handoff.sealedArtifacts.probeCount !== coverage.totalProbes) {
    issues.push(
      `handoff probeCount=${handoff.sealedArtifacts.probeCount} contract=${coverage.totalProbes}`,
    );
  }
  if (handoff.sealedArtifacts.contractVersion !== contract.version) {
    issues.push(
      `handoff contractVersion=${handoff.sealedArtifacts.contractVersion} active=${contract.version}`,
    );
  }
  if (handoff.sealedArtifacts.harnessVersion !== FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_VERSION) {
    issues.push(
      `handoff harnessVersion=${handoff.sealedArtifacts.harnessVersion} active=${FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_VERSION}`,
    );
  }
  if (
    handoff.sealedArtifacts.benchmarkPriorArtCategories.length !==
    RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES.length
  ) {
    issues.push("handoff benchmarkPriorArtCategories incomplete");
  }
  if (handoff.sealedArtifacts.sourceBlockGateAtom !== "P04-B03-A10") {
    issues.push(`unexpected source block gate atom: ${handoff.sealedArtifacts.sourceBlockGateAtom}`);
  }
  if (handoff.targetBlock.entryAtom !== "P04-B05-A01") {
    issues.push(`unexpected entry atom: ${handoff.targetBlock.entryAtom}`);
  }
  if (!evidence.regressionPassed) {
    issues.push("regression gate did not pass");
  }
  if (!evidence.guardPassed) {
    issues.push("guard gate did not pass");
  }
  if (evidence.probeCount !== coverage.totalProbes) {
    issues.push(`evidence probeCount=${evidence.probeCount} contract=${coverage.totalProbes}`);
  }

  return { valid: issues.length === 0, issues };
}

export function buildResearcherBenchmarkPriorArtBlockGateEvidence(
  atomSeals: ForgeBlockAtomSeal[],
  regressionPassed: boolean,
  guardPassed: boolean,
  probeCount: number,
  gitCommit?: string,
  blockId = FORGE_P04_B04_BLOCK_GATE_V1.blockId,
): ResearcherBenchmarkPriorArtBlockGateEvidence {
  const handoff = getForgeP04B04ToB05Handoff();
  const handoffValid = validateResearcherBenchmarkPriorArtBlockHandoffContract(handoff, {
    probeCount,
    regressionPassed,
    guardPassed,
  }).valid;

  return {
    blockId,
    atom: "P04-B04-A10",
    sealedAt: new Date().toISOString(),
    atomSeals,
    regressionPassed,
    guardPassed,
    handoffValid,
    probeCount,
    ...(gitCommit ? { gitCommit } : {}),
  };
}
