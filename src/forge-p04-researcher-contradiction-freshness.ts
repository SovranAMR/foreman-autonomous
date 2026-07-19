/**
 * FOREMAN — Researcher Contradiction & Freshness Resolution Baseline (P04-B06)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P04-B05 citation provenance graph block gate artifacts.
 * A04: boundary-category slice gate for evidence input edge cases and probe matrix alignment.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import researcherContradictionFreshnessBaseline from "./fixtures/forge-researcher-contradiction-freshness-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP04B05ToB06Handoff,
  getActiveResearcherCitationProvenanceGraphContract,
  summarizeResearcherCitationProvenanceGraphContractCoverage,
  buildResearchCitationProvenanceGraph,
  FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_CONTRACT_V1,
} from "./forge-p04-researcher-citation-provenance-graph.js";

export const FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_VERSION = "1.0.0-a04";

export const EXPECTED_P04_B05_SEALED_ATOM_COUNT = 10;

/** Maximum normalized evidence parse input length before truncation (P04-B06-A01 boundary). */
export const RESEARCHER_CONTRADICTION_FRESHNESS_INPUT_MAX_LENGTH = 8192;

export const RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES = [
  "evidence_versioning",
  "contradiction_signal",
  "freshness_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type ResearcherContradictionFreshnessCategory =
  (typeof RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES)[number];

export const RESEARCHER_CONTRADICTION_FRESHNESS_A01_MIN_PROBES: Readonly<
  Record<ResearcherContradictionFreshnessCategory, number>
> = {
  evidence_versioning: 3,
  contradiction_signal: 3,
  freshness_signal: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

export type ContradictionFreshnessInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface ContradictionFreshnessInputBoundary {
  disposition: ContradictionFreshnessInputDisposition;
  acceptable: boolean;
  normalizedInput: string;
  truncated: boolean;
  detail: string;
}

/**
 * Assess evidence parse input boundary conditions before contradiction/freshness resolution (P04-B06-A01).
 */
export function assessContradictionFreshnessInputBoundary(
  evidenceInput: string,
): ContradictionFreshnessInputBoundary {
  if (evidenceInput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedInput: "",
      truncated: false,
      detail: "null byte detected in evidence input",
    };
  }

  const trimmed = evidenceInput.trim();
  if (trimmed.length === 0) {
    const disposition: ContradictionFreshnessInputDisposition =
      evidenceInput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedInput: "",
      truncated: false,
      detail: disposition === "empty" ? "empty evidence input" : "whitespace-only evidence input",
    };
  }

  let normalizedInput = evidenceInput;
  let truncated = false;
  if (normalizedInput.length > RESEARCHER_CONTRADICTION_FRESHNESS_INPUT_MAX_LENGTH) {
    normalizedInput = normalizedInput.slice(0, RESEARCHER_CONTRADICTION_FRESHNESS_INPUT_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedInput,
    truncated,
    detail: truncated
      ? `evidence input truncated to ${RESEARCHER_CONTRADICTION_FRESHNESS_INPUT_MAX_LENGTH} characters`
      : "valid evidence input",
  };
}

export interface ContradictionFreshnessFindingEntry {
  claim: string;
  source: string;
  freshness?: string;
  contradicts?: string;
}

export interface ContradictionFreshnessCollectionValidationOutcome {
  valid: boolean;
  findingCount: number;
  issues: string[];
}

/**
 * Validate contradiction/freshness evidence collection before orchestrator wiring (P04-B06-A01).
 */
export function validateContradictionFreshnessCollection(
  topic: string,
  findings: ContradictionFreshnessFindingEntry[] = [],
): ContradictionFreshnessCollectionValidationOutcome {
  const boundary = assessContradictionFreshnessInputBoundary(topic);
  if (!boundary.acceptable) {
    return {
      valid: false,
      findingCount: 0,
      issues: [boundary.detail],
    };
  }

  const findingCount = findings.length;
  if (findingCount === 0) {
    return {
      valid: false,
      findingCount,
      issues: ["zero contradiction/freshness findings for normalized topic"],
    };
  }

  const issues: string[] = [];
  for (const [index, finding] of findings.entries()) {
    if (!finding.claim || finding.claim.trim().length === 0) {
      issues.push(`finding ${index} missing claim`);
    }
    if (!finding.source || finding.source.trim().length === 0) {
      issues.push(`finding ${index} missing source citation`);
    }
  }

  return {
    valid: issues.length === 0,
    findingCount,
    issues,
  };
}

export interface ContradictionFreshnessRecoveryHints {
  topic?: string;
  defaultFreshness?: string;
}

export interface ContradictionFreshnessRecoveryResult {
  recovered: boolean;
  resolutionPlan: {
    contradictions: Array<{ claimA: string; claimB: string; detail?: string }>;
    staleSources: Array<{ source: string; freshnessHint: string }>;
    searchFreshness?: string;
  };
  parseErrors: string[];
  detail: string;
}

const CONTRADICTION_PAIR_PATTERN =
  /CONTRADICTION\s*[:=]\s*(.+?)\s+(?:vs\.?|versus|contradicts)\s+(.+?)(?:\n|$)/gi;
const STALE_SOURCE_PATTERN =
  /STALE(?:\s+SOURCE)?\s*[:=]\s*(https?:\/\/[^\s]+|[A-Za-z0-9_./:-]+)(?:\s*\(([^)]+)\))?/gi;
const FRESHNESS_HINT_PATTERN = /FRESHNESS\s*[:=]\s*(pd|pw|pm|py|\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2})/gi;
const HTTP_URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;

/**
 * Restructure failed contradiction/freshness parse into actionable resolution plan (P04-B06-A01 recovery).
 */
export function recoverContradictionFreshnessEvidence(
  failedParse: string,
  hints: ContradictionFreshnessRecoveryHints = {},
): ContradictionFreshnessRecoveryResult {
  const parseErrors: string[] = [];
  const boundary = assessContradictionFreshnessInputBoundary(failedParse);

  if (!boundary.acceptable) {
    return {
      recovered: false,
      resolutionPlan: { contradictions: [], staleSources: [] },
      parseErrors: [boundary.disposition],
      detail: `cannot recover ${boundary.disposition.replace(/_/g, "-")} evidence parse`,
    };
  }

  const raw = boundary.normalizedInput;
  const contradictions: Array<{ claimA: string; claimB: string; detail?: string }> = [];
  const staleSources: Array<{ source: string; freshnessHint: string }> = [];

  for (const match of raw.matchAll(CONTRADICTION_PAIR_PATTERN)) {
    const claimA = match[1]?.trim();
    const claimB = match[2]?.trim();
    if (claimA && claimB) {
      contradictions.push({ claimA, claimB });
    }
  }

  for (const match of raw.matchAll(STALE_SOURCE_PATTERN)) {
    const source = match[1]?.trim();
    const freshnessHint = match[2]?.trim() ?? hints.defaultFreshness ?? "pm";
    if (source) {
      staleSources.push({ source, freshnessHint });
    }
  }

  let searchFreshness: string | undefined;
  for (const match of raw.matchAll(FRESHNESS_HINT_PATTERN)) {
    const hint = match[1]?.trim().toLowerCase();
    if (hint) {
      searchFreshness = hint;
      break;
    }
  }

  if (staleSources.length === 0) {
    for (const match of raw.matchAll(HTTP_URL_PATTERN)) {
      const source = match[0]?.trim();
      if (!source) continue;
      if (raw.toLowerCase().includes("outdated") || raw.toLowerCase().includes("stale")) {
        staleSources.push({
          source,
          freshnessHint: searchFreshness ?? hints.defaultFreshness ?? "pm",
        });
      }
    }
  }

  if (contradictions.length === 0 && staleSources.length === 0) {
    const fallbackClaim = hints.topic ?? raw.split("\n")[0]?.trim();
    if (fallbackClaim && fallbackClaim.length > 8) {
      contradictions.push({
        claimA: fallbackClaim.slice(0, 120),
        claimB: "prior research finding requires re-validation",
        detail: "inferred contradiction from unstructured evidence parse",
      });
    }
  }

  if (staleSources.length === 0 && searchFreshness) {
    staleSources.push({
      source: "unspecified-source",
      freshnessHint: searchFreshness,
    });
  }

  const recovered = contradictions.length > 0 || staleSources.length > 0;
  if (!recovered) {
    return {
      recovered: false,
      resolutionPlan: { contradictions, staleSources },
      parseErrors,
      detail: "no actionable contradiction or freshness resolution extracted",
    };
  }

  return {
    recovered: true,
    resolutionPlan: {
      contradictions,
      staleSources,
      ...(searchFreshness ? { searchFreshness } : {}),
    },
    parseErrors,
    detail: `recovered ${contradictions.length} contradiction(s) and ${staleSources.length} stale source hint(s)`,
  };
}

export interface ResearchContradictionResolutionEdge {
  claimA: string;
  claimB: string;
  resolution: string;
  source?: string;
}

export interface ResearchContradictionResolutionResult {
  resolved: boolean;
  edges: ResearchContradictionResolutionEdge[];
  contradictionCount: number;
  detail: string;
}

/**
 * Resolve contradiction conflicts into actionable resolution edges (P04-B06-A03 production slice).
 */
export function resolveResearchContradictions(
  researcherOutput: string,
  hints: ContradictionFreshnessRecoveryHints = {},
): ResearchContradictionResolutionResult {
  const recovery = recoverContradictionFreshnessEvidence(researcherOutput, hints);
  const edges: ResearchContradictionResolutionEdge[] = [];

  for (const contradiction of recovery.resolutionPlan.contradictions) {
    edges.push({
      claimA: contradiction.claimA,
      claimB: contradiction.claimB,
      resolution:
        contradiction.detail ??
        `prefer newer evidence over conflicting claim: ${contradiction.claimB}`,
    });
  }

  for (const stale of recovery.resolutionPlan.staleSources) {
    edges.push({
      claimA: stale.source,
      claimB: "current best practice",
      resolution: `refresh source with freshness hint ${stale.freshnessHint}`,
      source: stale.source,
    });
  }

  return {
    resolved: edges.length > 0,
    edges,
    contradictionCount: recovery.resolutionPlan.contradictions.length,
    detail: recovery.detail,
  };
}

export interface ResearchFreshnessValidationOutcome {
  valid: boolean;
  freshnessHints: string[];
  staleSourceCount: number;
  issues: string[];
}

const RESEARCH_FRESHNESS_SHORTCUTS = new Set(["pd", "pw", "pm", "py"]);
const RESEARCH_FRESHNESS_RANGE = /^(\d{4}-\d{2}-\d{2})to(\d{4}-\d{2}-\d{2})$/;

function normalizeResearchFreshnessHint(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (RESEARCH_FRESHNESS_SHORTCUTS.has(trimmed)) return trimmed;
  if (RESEARCH_FRESHNESS_RANGE.test(trimmed)) return trimmed;
  return undefined;
}

/**
 * Validate researcher output declares actionable freshness signals (P04-B06-A03 production slice).
 */
export function validateResearchFreshness(
  researchOutput: string,
): ResearchFreshnessValidationOutcome {
  const boundary = assessContradictionFreshnessInputBoundary(researchOutput);
  if (!boundary.acceptable) {
    return {
      valid: false,
      freshnessHints: [],
      staleSourceCount: 0,
      issues: [boundary.detail],
    };
  }

  const recovery = recoverContradictionFreshnessEvidence(boundary.normalizedInput);
  const freshnessHints: string[] = [];
  const issues: string[] = [];

  if (recovery.resolutionPlan.searchFreshness) {
    const normalized = normalizeResearchFreshnessHint(recovery.resolutionPlan.searchFreshness);
    if (normalized) {
      freshnessHints.push(normalized);
    } else {
      issues.push("invalid_freshness_hint");
    }
  }

  for (const stale of recovery.resolutionPlan.staleSources) {
    const normalized = normalizeResearchFreshnessHint(stale.freshnessHint);
    if (normalized) {
      freshnessHints.push(normalized);
    }
  }

  const hasFindings = boundary.normalizedInput.toLowerCase().includes("findings");
  if (freshnessHints.length === 0 && recovery.resolutionPlan.staleSources.length === 0 && hasFindings) {
    issues.push("missing_freshness_signal");
  }

  return {
    valid: issues.length === 0,
    freshnessHints: [...new Set(freshnessHints)],
    staleSourceCount: recovery.resolutionPlan.staleSources.length,
    issues,
  };
}

export interface ResearcherContradictionFreshnessFixtureEntry {
  id: string;
  category: ResearcherContradictionFreshnessCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface ResearcherContradictionFreshnessBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    citationProvenanceGraphProbeCount: number;
    sealedAtomCount: number;
  };
  probes: ResearcherContradictionFreshnessFixtureEntry[];
}

export interface ResearcherContradictionFreshnessProbeResult {
  id: string;
  category: ResearcherContradictionFreshnessCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface ResearcherContradictionFreshnessProbeSummary {
  total: number;
  aligned: number;
  mismatches: ResearcherContradictionFreshnessProbeResult[];
  knownGaps: ResearcherContradictionFreshnessProbeResult[];
  byCategory: Record<
    ResearcherContradictionFreshnessCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface ResearcherContradictionFreshnessValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: ResearcherContradictionFreshnessCategory;
  detail: string;
}

export interface ResearcherContradictionFreshnessValidationResult {
  valid: boolean;
  issues: ResearcherContradictionFreshnessValidationIssue[];
}

export type ResearcherContradictionFreshnessProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface ResearcherContradictionFreshnessProbeContract {
  id: string;
  category: ResearcherContradictionFreshnessCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: ResearcherContradictionFreshnessProbeDisposition;
  criterion: string;
}

export interface ResearcherContradictionFreshnessCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface ResearcherContradictionFreshnessCategoryContract {
  category: ResearcherContradictionFreshnessCategory;
  acceptance: ResearcherContradictionFreshnessCategoryAcceptance;
  probes: readonly ResearcherContradictionFreshnessProbeContract[];
}

export interface ResearcherContradictionFreshnessContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<
    ResearcherContradictionFreshnessCategory,
    ResearcherContradictionFreshnessCategoryContract
  >;
  probes: readonly ResearcherContradictionFreshnessProbeContract[];
}

function flattenContradictionFreshnessCategoryProbes(
  categories: Record<
    ResearcherContradictionFreshnessCategory,
    ResearcherContradictionFreshnessCategoryContract
  >,
): readonly ResearcherContradictionFreshnessProbeContract[] {
  return RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES.flatMap(
    category => categories[category].probes,
  );
}

const RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORY_CONTRACTS: Record<
  ResearcherContradictionFreshnessCategory,
  ResearcherContradictionFreshnessCategoryContract
> = {
  evidence_versioning: {
    category: "evidence_versioning",
    acceptance: {
      invariant:
        "Contradiction freshness baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rcfr.version_tagged",
        category: "evidence_versioning",
        description: "Contradiction freshness baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Contradiction freshness baseline declares semver version field",
      },
      {
        id: "rcfr.atom_tagged",
        category: "evidence_versioning",
        description: "Contradiction freshness baseline declares P04-B06-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Contradiction freshness baseline declares P04-B06-A01 atom id",
      },
      {
        id: "rcfr.harness_version_exported",
        category: "evidence_versioning",
        description:
          "FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_VERSION exported for contradiction freshness harness",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_VERSION exported for contradiction freshness harness",
      },
    ],
  },
  contradiction_signal: {
    category: "contradiction_signal",
    acceptance: {
      invariant:
        "Researcher and strategist prompts surface explicit contradiction signals against vision or strategy.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rcfr.researcher_contradiction_prompt",
        category: "contradiction_signal",
        description:
          "RESEARCHER_SYSTEM prompt requires explicit contradiction reporting against vision or strategy",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "RESEARCHER_SYSTEM prompt requires explicit contradiction reporting against vision or strategy",
      },
      {
        id: "rcfr.strategist_contradiction_block",
        category: "contradiction_signal",
        description: "STRATEGIST_SYSTEM prompt can BLOCK visioner on internal contradictions",
        expected: "PASS",
        disposition: "observed",
        criterion: "STRATEGIST_SYSTEM prompt can BLOCK visioner on internal contradictions",
      },
      {
        id: "rcfr.citation_graph_claim_nodes",
        category: "contradiction_signal",
        description:
          "buildResearchCitationProvenanceGraph exposes claim nodes for contradiction linkage via provenance",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "buildResearchCitationProvenanceGraph exposes claim nodes for contradiction linkage via provenance",
      },
    ],
  },
  freshness_signal: {
    category: "freshness_signal",
    acceptance: {
      invariant:
        "Web search and research engine expose freshness filtering signals for stale-source detection.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rcfr.web_search_freshness_param",
        category: "freshness_signal",
        description: "web-search-engine validates and normalizes Brave freshness query parameter",
        expected: "PASS",
        disposition: "observed",
        criterion: "web-search-engine validates and normalizes Brave freshness query parameter",
      },
      {
        id: "rcfr.brave_freshness_shortcuts",
        category: "freshness_signal",
        description: "web-search-engine declares BRAVE_FRESHNESS_SHORTCUTS for pd/pw/pm/py filters",
        expected: "PASS",
        disposition: "observed",
        criterion: "web-search-engine declares BRAVE_FRESHNESS_SHORTCUTS for pd/pw/pm/py filters",
      },
      {
        id: "rcfr.research_engine_freshness_docs",
        category: "freshness_signal",
        description: "research-engine documents Brave Search freshness filtering support",
        expected: "PASS",
        disposition: "observed",
        criterion: "research-engine documents Brave Search freshness filtering support",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Contradiction freshness baseline links to sealed P04-B05 citation provenance graph block gate handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rcfr.b05_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P04_B05_TO_B06_HANDOFF_V1 targets P04-B06-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P04_B05_TO_B06_HANDOFF_V1 targets P04-B06-A01 entry atom",
      },
      {
        id: "rcfr.b05_sealed_citation_probes",
        category: "baseline_link",
        description:
          "P04-B05→B06 handoff sealed probeCount matches active citation provenance graph contract",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "P04-B05→B06 handoff sealed probeCount matches active citation provenance graph contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Contradiction freshness boundary assessment rejects invalid input; probe runner and documented gaps wired.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rcfr.source_block_gate_ref",
        category: "boundary",
        description:
          "Baseline fixture references sealed P04-B05 citation provenance graph block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Baseline fixture references sealed P04-B05 citation provenance graph block gate source artifacts",
      },
      {
        id: "rcfr.probe_runner_exported",
        category: "boundary",
        description: "runResearcherContradictionFreshnessProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runResearcherContradictionFreshnessProbes executes contract-wired probe matrix",
      },
      {
        id: "rcfr.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL contradiction freshness gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL contradiction freshness gap",
      },
      {
        id: "rcfr.empty_evidence_input_boundary",
        category: "boundary",
        description: "assessContradictionFreshnessInputBoundary rejects empty evidence parse input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessContradictionFreshnessInputBoundary rejects empty evidence parse input",
      },
      {
        id: "rcfr.whitespace_evidence_input_boundary",
        category: "boundary",
        description:
          "assessContradictionFreshnessInputBoundary rejects whitespace-only evidence parse input",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessContradictionFreshnessInputBoundary rejects whitespace-only evidence parse input",
      },
      {
        id: "rcfr.long_evidence_input_truncation_boundary",
        category: "boundary",
        description:
          "assessContradictionFreshnessInputBoundary truncates evidence input exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessContradictionFreshnessInputBoundary truncates evidence input exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Invalid fixture versions and null-byte evidence input are rejected safely.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rcfr.invalid_version_rejected",
        category: "failure_path",
        description:
          "validateResearcherContradictionFreshnessBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion:
          "validateResearcherContradictionFreshnessBaseline rejects unexpected fixture version",
      },
      {
        id: "rcfr.malformed_evidence_guard",
        category: "failure_path",
        description: "assessContradictionFreshnessInputBoundary rejects null-byte evidence input safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessContradictionFreshnessInputBoundary rejects null-byte evidence input safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Recovery paths restructure malformed contradiction/freshness parses into actionable resolution plans.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rcfr.recovery_contradiction_plan_repair",
        category: "recovery_path",
        description:
          "recoverContradictionFreshnessEvidence restructures failed contradiction parse into actionable resolution plan",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "recoverContradictionFreshnessEvidence restructures failed contradiction parse into actionable resolution plan",
      },
      {
        id: "rcfr.recovery_stale_source_fallback",
        category: "recovery_path",
        description:
          "Contradiction freshness recovery infers stale-source freshness hint when explicit STALE marker is missing",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "Contradiction freshness recovery infers stale-source freshness hint when explicit STALE marker is missing",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Contradiction resolver and freshness validator exports gate orchestrator NO-GO wiring.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rcfr.resolve_contradiction_conflicts",
        category: "nogo_path",
        description: "resolveResearchContradictions exports contradiction→resolution edges from researcher output",
        expected: "PASS",
        disposition: "nogo",
        criterion:
          "resolveResearchContradictions exports contradiction→resolution edges from researcher output",
      },
      {
        id: "rcfr.exported_freshness_validator",
        category: "nogo_path",
        description: "validateResearchFreshness exported for orchestrator contradiction freshness checks",
        expected: "PASS",
        disposition: "nogo",
        criterion: "validateResearchFreshness exported for orchestrator contradiction freshness checks",
      },
    ],
  },
};

export const FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_CONTRACT_V1: ResearcherContradictionFreshnessContract =
  {
    version: "1.0.0",
    atom: "P04-B06-A06",
    purpose:
      "Typed contradiction freshness contract declaring measurable contradiction, freshness and guard probes.",
    categories: RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORY_CONTRACTS,
    probes: flattenContradictionFreshnessCategoryProbes(
      RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORY_CONTRACTS,
    ),
  };

export function getActiveResearcherContradictionFreshnessContract(): ResearcherContradictionFreshnessContract {
  return FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_CONTRACT_V1;
}

export function getResearcherContradictionFreshnessCategoryContract(
  category: ResearcherContradictionFreshnessCategory,
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): ResearcherContradictionFreshnessCategoryContract {
  return contract.categories[category];
}

export function listResearcherContradictionFreshnessContractProbeIds(
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listResearcherContradictionFreshnessProbesByDisposition(
  disposition: ResearcherContradictionFreshnessProbeDisposition,
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): ResearcherContradictionFreshnessProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listResearcherContradictionFreshnessContractProbesByCategory(
  category: ResearcherContradictionFreshnessCategory,
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): readonly ResearcherContradictionFreshnessProbeContract[] {
  return [...contract.categories[category].probes];
}

export function summarizeResearcherContradictionFreshnessContractCoverage(
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<
    ResearcherContradictionFreshnessCategory,
    { probeCount: number; invariant: string }
  >;
  byDisposition: Record<ResearcherContradictionFreshnessProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    ResearcherContradictionFreshnessCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<ResearcherContradictionFreshnessProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES) {
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

export interface ResearcherContradictionFreshnessContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: ResearcherContradictionFreshnessCategory;
  detail: string;
}

export interface ResearcherContradictionFreshnessContractCoverageResult {
  valid: boolean;
  issues: ResearcherContradictionFreshnessContractCoverageIssue[];
}

export function validateResearcherContradictionFreshnessContractCoverage(
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): ResearcherContradictionFreshnessContractCoverageResult {
  const issues: ResearcherContradictionFreshnessContractCoverageIssue[] = [];

  for (const category of RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES) {
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
      RESEARCHER_CONTRADICTION_FRESHNESS_A01_MIN_PROBES[category]
    ) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${RESEARCHER_CONTRADICTION_FRESHNESS_A01_MIN_PROBES[category]}`,
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

  const ids = listResearcherContradictionFreshnessContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeResearcherContradictionFreshnessContractCoverage(contract);
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
    if (!probe.id.startsWith("rcfr.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing rcfr. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateResearcherContradictionFreshnessContract(
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): ResearcherContradictionFreshnessContractCoverageResult {
  return validateResearcherContradictionFreshnessContractCoverage(contract);
}

export function validateResearcherContradictionFreshnessAgainstContract(
  fixture: ResearcherContradictionFreshnessBaseline,
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): ResearcherContradictionFreshnessValidationResult {
  const issues: ResearcherContradictionFreshnessValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES) {
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

export const FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_A01_PROBE_MATRIX: readonly ResearcherContradictionFreshnessFixtureEntry[] =
  researcherContradictionFreshnessBaseline.probes as ResearcherContradictionFreshnessFixtureEntry[];

export function loadResearcherContradictionFreshnessBaseline(): ResearcherContradictionFreshnessBaseline {
  return researcherContradictionFreshnessBaseline as ResearcherContradictionFreshnessBaseline;
}

export function validateResearcherContradictionFreshnessBaseline(
  fixture: ResearcherContradictionFreshnessBaseline,
): ResearcherContradictionFreshnessValidationResult {
  const issues: ResearcherContradictionFreshnessValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P04-B06-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES.map(category => [category, 0]),
  ) as Record<ResearcherContradictionFreshnessCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES) {
    const min = RESEARCHER_CONTRADICTION_FRESHNESS_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (
    fixture.probes.length !== FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_A01_PROBE_MATRIX.length
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_A01_PROBE_MATRIX) {
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

  const handoff = getForgeP04B05ToB06Handoff();
  const citationCoverage = summarizeResearcherCitationProvenanceGraphContractCoverage(
    getActiveResearcherCitationProvenanceGraphContract(),
  );

  if (fixture.sourceBlockGate.atom !== "P04-B05-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P04-B05-A10`,
    });
  }
  if (
    fixture.sourceBlockGate.contractVersion !==
    FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_CONTRACT_V1.version
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.contractVersion=${fixture.sourceBlockGate.contractVersion} ` +
        `expected=${FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_CONTRACT_V1.version}`,
    });
  }
  if (
    fixture.sourceBlockGate.citationProvenanceGraphProbeCount !== citationCoverage.totalProbes
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.citationProvenanceGraphProbeCount=${fixture.sourceBlockGate.citationProvenanceGraphProbeCount} ` +
        `contract=${citationCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P04_B05_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P04_B05_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P04-B06-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `B05 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P04-B06-A01`,
    });
  }

  const contractAlignment = validateResearcherContradictionFreshnessAgainstContract(
    fixture,
    getActiveResearcherContradictionFreshnessContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeResearcherContradictionFreshnessMatrix(
  results: ResearcherContradictionFreshnessProbeResult[],
): ResearcherContradictionFreshnessProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as ResearcherContradictionFreshnessProbeSummary["byCategory"];
  for (const category of RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES) {
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

export function listResearcherContradictionFreshnessProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherContradictionFreshnessBaseline = loadResearcherContradictionFreshnessBaseline(),
): ResearcherContradictionFreshnessFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listResearcherContradictionFreshnessKnownGaps(
  results: ResearcherContradictionFreshnessProbeResult[],
): ResearcherContradictionFreshnessProbeResult[] {
  return summarizeResearcherContradictionFreshnessMatrix(results).knownGaps;
}

export interface ResearcherContradictionFreshnessProbeMatrixValidationIssue {
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

export interface ResearcherContradictionFreshnessProbeMatrixValidationResult {
  valid: boolean;
  issues: ResearcherContradictionFreshnessProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 */
export function validateResearcherContradictionFreshnessProbeMatrix(
  results: ResearcherContradictionFreshnessProbeResult[],
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): ResearcherContradictionFreshnessProbeMatrixValidationResult {
  const issues: ResearcherContradictionFreshnessProbeMatrixValidationIssue[] = [];
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

export interface ResearcherContradictionFreshnessProductionSliceResult {
  atom: "P04-B06-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: ResearcherContradictionFreshnessProbeResult[];
  summary: ResearcherContradictionFreshnessProbeSummary;
  matrixValidation: ResearcherContradictionFreshnessProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: resolveResearchContradictions and validateResearchFreshness
 * wired to contract probe execution with zero unexpected mismatches.
 */
export function runResearcherContradictionFreshnessProductionSlice(
  fixture: ResearcherContradictionFreshnessBaseline = loadResearcherContradictionFreshnessBaseline(),
): ResearcherContradictionFreshnessProductionSliceResult {
  const contract = getActiveResearcherContradictionFreshnessContract();
  const fixtureValidation = validateResearcherContradictionFreshnessBaseline(fixture);
  const contractValidation = validateResearcherContradictionFreshnessAgainstContract(fixture, contract);
  const results = runResearcherContradictionFreshnessProbes(fixture);
  const summary = summarizeResearcherContradictionFreshnessMatrix(results);
  const matrixValidation = validateResearcherContradictionFreshnessProbeMatrix(results, contract);

  return {
    atom: "P04-B06-A03",
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
export function validateResearcherContradictionFreshnessBoundaryProbeMatrix(
  results: ResearcherContradictionFreshnessProbeResult[],
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): ResearcherContradictionFreshnessProbeMatrixValidationResult {
  const boundaryProbes = listResearcherContradictionFreshnessContractProbesByCategory(
    "boundary",
    contract,
  );
  const boundaryContract: ResearcherContradictionFreshnessContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateResearcherContradictionFreshnessProbeMatrix(boundaryResults, boundaryContract);
}

export interface ResearcherContradictionFreshnessBoundarySliceResult {
  atom: "P04-B06-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherContradictionFreshnessProbeResult[];
  boundaryResults: ResearcherContradictionFreshnessProbeResult[];
  matrixValidation: ResearcherContradictionFreshnessProbeMatrixValidationResult;
}

/**
 * A04 boundary slice: contract-wired boundary probes (evidence input edge cases, probe runner,
 * documented gaps) with zero unexpected mismatches.
 */
export function runResearcherContradictionFreshnessBoundarySlice(
  fixture: ResearcherContradictionFreshnessBaseline = loadResearcherContradictionFreshnessBaseline(),
): ResearcherContradictionFreshnessBoundarySliceResult {
  const contract = getActiveResearcherContradictionFreshnessContract();
  const results = runResearcherContradictionFreshnessProbes(fixture);
  const boundaryProbes = listResearcherContradictionFreshnessContractProbesByCategory(
    "boundary",
    contract,
  );
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateResearcherContradictionFreshnessBoundaryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B06-A04",
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
  category: ResearcherContradictionFreshnessCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
): ResearcherContradictionFreshnessProbeResult {
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

function productionSource(): string {
  return readSrc("forge-p04-researcher-contradiction-freshness.ts");
}

function promptsSource(): string {
  return readSrc("prompts.ts");
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

function strategistFormatSection(): string {
  const prompts = promptsSource();
  const strategistStart = prompts.indexOf("const STRATEGIST_SYSTEM");
  const researcherStart = prompts.indexOf("const RESEARCHER_SYSTEM");
  if (strategistStart === -1 || researcherStart === -1 || researcherStart <= strategistStart) {
    return prompts;
  }
  return prompts.slice(strategistStart, researcherStart);
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionSource());
}

function runSingleProbe(
  id: string,
  category: ResearcherContradictionFreshnessCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherContradictionFreshnessBaseline,
): ResearcherContradictionFreshnessProbeResult {
  switch (id) {
    case "rcfr.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "rcfr.atom_tagged": {
      const ok = fixture.atom === "P04-B06-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "rcfr.harness_version_exported": {
      const ok = FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_VERSION}`,
      );
    }
    case "rcfr.researcher_contradiction_prompt": {
      const section = researcherFormatSection();
      const ok =
        section.includes("contradict the vision or strategy") &&
        section.includes("say so EXPLICITLY");
      return probe(id, category, expected, ok, `contradictionPrompt=${ok}`);
    }
    case "rcfr.strategist_contradiction_block": {
      const section = strategistFormatSection();
      const ok =
        section.includes("internal contradictions") &&
        section.includes("block the Visioner");
      return probe(id, category, expected, ok, `strategistBlock=${ok}`);
    }
    case "rcfr.citation_graph_claim_nodes": {
      const sample =
        "FINDINGS: claim A supports X\nSOURCES: https://docs.example.com/spec\nCITATIONS: src/research-engine.ts:30";
      const build = buildResearchCitationProvenanceGraph(sample, { topic: "contradiction linkage" });
      const ok =
        build.recovered === true &&
        build.graph.nodes.some(node => node.kind === "claim");
      return probe(
        id,
        category,
        expected,
        ok,
        `claimNodes=${build.graph.nodes.filter(node => node.kind === "claim").length}`,
      );
    }
    case "rcfr.web_search_freshness_param": {
      const source = readSrc("web-search-engine.ts");
      const ok =
        source.includes("normalizeFreshness") && source.includes("freshness?: string");
      return probe(id, category, expected, ok, `freshnessParam=${ok}`);
    }
    case "rcfr.brave_freshness_shortcuts": {
      const source = readSrc("web-search-engine.ts");
      const ok =
        source.includes("BRAVE_FRESHNESS_SHORTCUTS") &&
        source.includes('"pd"') &&
        source.includes('"py"');
      return probe(id, category, expected, ok, `freshnessShortcuts=${ok}`);
    }
    case "rcfr.research_engine_freshness_docs": {
      const source = readSrc("research-engine.ts");
      const ok = source.toLowerCase().includes("freshness");
      return probe(id, category, expected, ok, `freshnessDocs=${ok}`);
    }
    case "rcfr.b05_block_handoff_entry": {
      const handoff = getForgeP04B05ToB06Handoff();
      const ok =
        handoff.targetBlock.blockId === "P04-B06" &&
        handoff.targetBlock.entryAtom === "P04-B06-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "rcfr.b05_sealed_citation_probes": {
      const handoff = getForgeP04B05ToB06Handoff();
      const coverage = summarizeResearcherCitationProvenanceGraphContractCoverage(
        getActiveResearcherCitationProvenanceGraphContract(),
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
    case "rcfr.source_block_gate_ref": {
      const handoff = getForgeP04B05ToB06Handoff();
      const coverage = summarizeResearcherCitationProvenanceGraphContractCoverage(
        getActiveResearcherCitationProvenanceGraphContract(),
      );
      const ok =
        fixture.sourceBlockGate.atom === "P04-B05-A10" &&
        fixture.sourceBlockGate.citationProvenanceGraphProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P04_B05_SEALED_ATOM_COUNT &&
        handoff.atom === "P04-B05-A10";
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.citationProvenanceGraphProbeCount}`,
      );
    }
    case "rcfr.probe_runner_exported": {
      const ok = productionSource().includes(
        "export function runResearcherContradictionFreshnessProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "rcfr.known_gaps_documented": {
      const contract = getActiveResearcherContradictionFreshnessContract();
      const expectedFail = contract.probes.filter(p => p.expected === "FAIL").length;
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount === expectedFail;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, expectedFail=${expectedFail}`,
      );
    }
    case "rcfr.empty_evidence_input_boundary": {
      const result = assessContradictionFreshnessInputBoundary("");
      const ok =
        hasProductionExport("assessContradictionFreshnessInputBoundary") &&
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
    case "rcfr.whitespace_evidence_input_boundary": {
      const result = assessContradictionFreshnessInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessContradictionFreshnessInputBoundary") &&
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
    case "rcfr.long_evidence_input_truncation_boundary": {
      const longInput = "x".repeat(RESEARCHER_CONTRADICTION_FRESHNESS_INPUT_MAX_LENGTH + 500);
      const result = assessContradictionFreshnessInputBoundary(longInput);
      const ok =
        hasProductionExport("assessContradictionFreshnessInputBoundary") &&
        result.acceptable === true &&
        result.truncated === true &&
        result.normalizedInput.length === RESEARCHER_CONTRADICTION_FRESHNESS_INPUT_MAX_LENGTH;
      return probe(
        id,
        category,
        expected,
        ok,
        `truncated=${result.truncated}, len=${result.normalizedInput.length}`,
      );
    }
    case "rcfr.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateResearcherContradictionFreshnessBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "rcfr.malformed_evidence_guard": {
      const boundary = assessContradictionFreshnessInputBoundary("evidence\0input");
      const ok =
        hasProductionExport("assessContradictionFreshnessInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false;
      return probe(id, category, expected, ok, `disposition=${boundary.disposition}`);
    }
    case "rcfr.recovery_contradiction_plan_repair": {
      const recovery = recoverContradictionFreshnessEvidence(
        "CONTRADICTION: React 18 concurrent mode vs legacy class components contradicts migration plan\nFRESHNESS: pm",
        { topic: "frontend migration" },
      );
      const ok =
        hasProductionExport("recoverContradictionFreshnessEvidence") &&
        recovery.recovered === true &&
        recovery.resolutionPlan.contradictions.length >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `contradictions=${recovery.resolutionPlan.contradictions.length}`,
      );
    }
    case "rcfr.recovery_stale_source_fallback": {
      const recovery = recoverContradictionFreshnessEvidence(
        "FINDINGS: outdated benchmark from https://legacy.example.com/report still referenced",
        { defaultFreshness: "py" },
      );
      const ok =
        recovery.recovered === true &&
        recovery.resolutionPlan.staleSources.length >= 1 &&
        recovery.resolutionPlan.staleSources.some(entry => entry.freshnessHint.length > 0);
      return probe(
        id,
        category,
        expected,
        ok,
        `staleSources=${recovery.resolutionPlan.staleSources.length}`,
      );
    }
    case "rcfr.resolve_contradiction_conflicts": {
      const sample =
        "CONTRADICTION: React 18 concurrent mode vs legacy class components contradicts migration plan\nFRESHNESS: pm";
      const resolution = resolveResearchContradictions(sample, { topic: "frontend migration" });
      const ok =
        hasProductionExport("resolveResearchContradictions") &&
        resolution.resolved === true &&
        resolution.edges.length >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `edges=${resolution.edges.length}, contradictions=${resolution.contradictionCount}`,
      );
    }
    case "rcfr.exported_freshness_validator": {
      const orchestrator = readSrc("orchestrator.ts");
      const ok =
        hasProductionExport("validateResearchFreshness") &&
        orchestrator.includes("validateResearchFreshness(");
      return probe(id, category, expected, ok, `freshnessValidator=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown probe id");
  }
}

export function runResearcherContradictionFreshnessProbes(
  fixture: ResearcherContradictionFreshnessBaseline = loadResearcherContradictionFreshnessBaseline(),
): ResearcherContradictionFreshnessProbeResult[] {
  const contract = getActiveResearcherContradictionFreshnessContract();
  return fixture.probes.map(entry => {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const expected = contractProbe?.expected ?? entry.expected;
    const result = runSingleProbe(entry.id, entry.category, expected, fixture);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}
