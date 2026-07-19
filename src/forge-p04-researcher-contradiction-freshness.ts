/**
 * FOREMAN — Researcher Contradiction & Freshness Resolution Baseline (P04-B06)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P04-B05 citation provenance graph block gate artifacts.
 * A04: boundary-category slice gate for evidence input edge cases and probe matrix alignment.
 * A05: failure_path, recovery_path and nogo_path slice gate for failure/recovery/NO-GO probes.
 * A06: evidence, telemetry and provenance run record for failure/recovery slice gate.
 * A07: property and fuzz validation for contract invariants and run record gates.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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

export const FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_VERSION = "1.0.0-a07";

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

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const RESEARCHER_CONTRADICTION_FRESHNESS_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly ResearcherContradictionFreshnessCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes must align; zero unexpected mismatches.
 */
export function validateResearcherContradictionFreshnessFailureRecoveryProbeMatrix(
  results: ResearcherContradictionFreshnessProbeResult[],
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): ResearcherContradictionFreshnessProbeMatrixValidationResult {
  const failureRecoveryProbes = RESEARCHER_CONTRADICTION_FRESHNESS_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherContradictionFreshnessContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: ResearcherContradictionFreshnessContract = {
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
  return validateResearcherContradictionFreshnessProbeMatrix(
    failureRecoveryResults,
    failureRecoveryContract,
  );
}

export function listResearcherContradictionFreshnessFailureRecoveryProbeIds(
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): string[] {
  return RESEARCHER_CONTRADICTION_FRESHNESS_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listResearcherContradictionFreshnessContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface ResearcherContradictionFreshnessFailureRecoverySliceResult {
  atom: "P04-B06-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherContradictionFreshnessProbeResult[];
  failureRecoveryResults: ResearcherContradictionFreshnessProbeResult[];
  matrixValidation: ResearcherContradictionFreshnessProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes (invalid fixture rejection, null-byte guard, recoverContradictionFreshnessEvidence,
 * stale-source fallback, resolveResearchContradictions and validateResearchFreshness
 * orchestrator NO-GO wiring) with zero unexpected mismatches.
 */
export function runResearcherContradictionFreshnessFailureRecoverySlice(
  fixture: ResearcherContradictionFreshnessBaseline = loadResearcherContradictionFreshnessBaseline(),
): ResearcherContradictionFreshnessFailureRecoverySliceResult {
  const contract = getActiveResearcherContradictionFreshnessContract();
  const results = runResearcherContradictionFreshnessProbes(fixture);
  const failureRecoveryProbes = RESEARCHER_CONTRADICTION_FRESHNESS_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherContradictionFreshnessContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateResearcherContradictionFreshnessFailureRecoveryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B06-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

/** Per-probe evidence artifact — disposition, criterion and aligned outcomes (P04-B06-A06). */
export interface ResearcherContradictionFreshnessProbeEvidence {
  probeId: string;
  category: ResearcherContradictionFreshnessCategory;
  disposition: ResearcherContradictionFreshnessProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for contradiction freshness runs (P04-B06-A06). */
export interface ResearcherContradictionFreshnessProbeTelemetry {
  probeId: string;
  category: ResearcherContradictionFreshnessCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P04-B06-A06). */
export interface ResearcherContradictionFreshnessProvenance {
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
  sliceCategories?: readonly ResearcherContradictionFreshnessCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated contradiction freshness run record bundling evidence, telemetry and provenance. */
export interface ResearcherContradictionFreshnessRunRecord {
  provenance: ResearcherContradictionFreshnessProvenance;
  evidence: ResearcherContradictionFreshnessProbeEvidence[];
  telemetry: ResearcherContradictionFreshnessProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<ResearcherContradictionFreshnessCategory, number>;
    byDisposition: Record<ResearcherContradictionFreshnessProbeDisposition, number>;
  };
}

export interface ResearcherContradictionFreshnessRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface ResearcherContradictionFreshnessRunValidationResult {
  valid: boolean;
  issues: ResearcherContradictionFreshnessRunValidationIssue[];
}

export function buildResearcherContradictionFreshnessProbeEvidence(
  probeId: string,
  category: ResearcherContradictionFreshnessCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: ResearcherContradictionFreshnessProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): ResearcherContradictionFreshnessProbeEvidence {
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

export function buildResearcherContradictionFreshnessProbeTelemetry(
  probeId: string,
  category: ResearcherContradictionFreshnessCategory,
  sequenceIndex: number,
  durationMs: number,
): ResearcherContradictionFreshnessProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildResearcherContradictionFreshnessProvenance(
  runId: string,
  fixture: ResearcherContradictionFreshnessBaseline,
  contract: ResearcherContradictionFreshnessContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly ResearcherContradictionFreshnessCategory[];
  },
): ResearcherContradictionFreshnessProvenance {
  return {
    runId,
    harnessVersion: FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_VERSION,
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

export function buildResearcherContradictionFreshnessRunRecord(
  provenance: ResearcherContradictionFreshnessProvenance,
  evidence: ResearcherContradictionFreshnessProbeEvidence[],
  telemetry: ResearcherContradictionFreshnessProbeTelemetry[],
): ResearcherContradictionFreshnessRunRecord {
  const byCategory = {} as Record<ResearcherContradictionFreshnessCategory, number>;
  const byDisposition: Record<ResearcherContradictionFreshnessProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES) {
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

function validateResearcherContradictionFreshnessRunRecordAgainstProbeIds(
  record: ResearcherContradictionFreshnessRunRecord,
  expectedProbeIds: string[],
  contract: ResearcherContradictionFreshnessContract,
): ResearcherContradictionFreshnessRunValidationResult {
  const issues: ResearcherContradictionFreshnessRunValidationIssue[] = [];
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

export function validateResearcherContradictionFreshnessRunRecord(
  record: ResearcherContradictionFreshnessRunRecord,
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): ResearcherContradictionFreshnessRunValidationResult {
  return validateResearcherContradictionFreshnessRunRecordAgainstProbeIds(
    record,
    listResearcherContradictionFreshnessContractProbeIds(contract),
    contract,
  );
}

/** Validate evidence slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateResearcherContradictionFreshnessEvidenceRunRecord(
  record: ResearcherContradictionFreshnessRunRecord,
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): ResearcherContradictionFreshnessRunValidationResult {
  const issues: ResearcherContradictionFreshnessRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P04-B06-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P04-B06-A06`,
    });
  }

  const expectedCategories = [...RESEARCHER_CONTRADICTION_FRESHNESS_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateResearcherContradictionFreshnessRunRecordAgainstProbeIds(
    record,
    listResearcherContradictionFreshnessFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

export interface ResearcherContradictionFreshnessEvidenceSliceResult {
  atom: "P04-B06-A06";
  evidenceProbeCount: number;
  matrixValid: boolean;
  recordValid: boolean;
  results: ResearcherContradictionFreshnessProbeResult[];
  evidenceResults: ResearcherContradictionFreshnessProbeResult[];
  matrixValidation: ResearcherContradictionFreshnessProbeMatrixValidationResult;
  record: ResearcherContradictionFreshnessRunRecord;
  recordValidation: ResearcherContradictionFreshnessRunValidationResult;
}

function resolveResearcherContradictionFreshnessGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function runResearcherContradictionFreshnessProbeWithTiming(
  entry: ResearcherContradictionFreshnessFixtureEntry,
  fixture: ResearcherContradictionFreshnessBaseline,
  contractProbe: ResearcherContradictionFreshnessProbeContract | undefined,
): {
  result: ResearcherContradictionFreshnessProbeResult;
  durationMs: number;
  disposition: ResearcherContradictionFreshnessProbeDisposition;
} {
  const start = performance.now();
  const expected = contractProbe?.expected ?? entry.expected;
  const result = runSingleProbe(entry.id, entry.category, expected, fixture);
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

function buildResearcherContradictionFreshnessRecordFromEntries(
  entries: ResearcherContradictionFreshnessFixtureEntry[],
  fixture: ResearcherContradictionFreshnessBaseline,
  contract: ResearcherContradictionFreshnessContract,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly ResearcherContradictionFreshnessCategory[];
  },
): ResearcherContradictionFreshnessRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ResearcherContradictionFreshnessProbeEvidence[] = [];
  const telemetry: ResearcherContradictionFreshnessProbeTelemetry[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runResearcherContradictionFreshnessProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildResearcherContradictionFreshnessProbeEvidence(
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
      buildResearcherContradictionFreshnessProbeTelemetry(
        result.id,
        result.category,
        sequenceIndex,
        durationMs,
      ),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildResearcherContradictionFreshnessProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveResearcherContradictionFreshnessGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildResearcherContradictionFreshnessRunRecord(provenance, evidence, telemetry);
}

/** Run all contradiction freshness probes and emit auditable evidence, telemetry and provenance (P04-B06-A06). */
export function runResearcherContradictionFreshnessProbesWithRecord(
  fixture: ResearcherContradictionFreshnessBaseline = loadResearcherContradictionFreshnessBaseline(),
): ResearcherContradictionFreshnessRunRecord {
  const contract = getActiveResearcherContradictionFreshnessContract();
  return buildResearcherContradictionFreshnessRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P04-B06-A06). */
export function runResearcherContradictionFreshnessFailureRecoverySliceWithRecord(
  fixture: ResearcherContradictionFreshnessBaseline = loadResearcherContradictionFreshnessBaseline(),
): ResearcherContradictionFreshnessRunRecord {
  const contract = getActiveResearcherContradictionFreshnessContract();
  const failureRecoveryIds = new Set(
    listResearcherContradictionFreshnessFailureRecoveryProbeIds(contract),
  );
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildResearcherContradictionFreshnessRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P04-B06-A06",
    sliceCategories: RESEARCHER_CONTRADICTION_FRESHNESS_FAILURE_RECOVERY_CATEGORIES,
  });
}

/**
 * A06 evidence slice: contract-wired failure_path, recovery_path, and nogo_path probes
 * with auditable evidence, telemetry and provenance — zero unexpected mismatches.
 */
export function runResearcherContradictionFreshnessEvidenceSlice(
  fixture: ResearcherContradictionFreshnessBaseline = loadResearcherContradictionFreshnessBaseline(),
): ResearcherContradictionFreshnessEvidenceSliceResult {
  const contract = getActiveResearcherContradictionFreshnessContract();
  const results = runResearcherContradictionFreshnessProbes(fixture);
  const failureRecoveryProbes = RESEARCHER_CONTRADICTION_FRESHNESS_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherContradictionFreshnessContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const evidenceResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateResearcherContradictionFreshnessFailureRecoveryProbeMatrix(
    results,
    contract,
  );
  const record = runResearcherContradictionFreshnessFailureRecoverySliceWithRecord(fixture);
  const recordValidation = validateResearcherContradictionFreshnessEvidenceRunRecord(
    record,
    contract,
  );

  return {
    atom: "P04-B06-A06",
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

// ─── Property and fuzz validation (P04-B06-A07) ─────────────────────────────

export interface ResearcherContradictionFreshnessPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface ResearcherContradictionFreshnessPropertyResult {
  passed: number;
  failed: ResearcherContradictionFreshnessPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type ResearcherContradictionFreshnessPropertyCheck = {
  id: string;
  description: string;
  check: (contract: ResearcherContradictionFreshnessContract) => string | null;
};

const RESEARCHER_CONTRADICTION_FRESHNESS_STRUCTURAL_PROPERTIES: readonly ResearcherContradictionFreshnessPropertyCheck[] =
  [
    {
      id: "categories_complete",
      description: "All eight contradiction freshness categories are declared",
      check: contract => {
        for (const category of RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES) {
          if (!contract.categories[category]) return `missing category: ${category}`;
        }
        return null;
      },
    },
    {
      id: "probe_ids_unique",
      description: "Probe ids are globally unique",
      check: contract => {
        const ids = listResearcherContradictionFreshnessContractProbeIds(contract);
        if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
        return null;
      },
    },
    {
      id: "min_probe_count",
      description: "Each category meets contract minProbeCount",
      check: contract => {
        for (const category of RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES) {
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
        "summarizeResearcherContradictionFreshnessContractCoverage totals match listResearcherContradictionFreshnessContractProbeIds",
      check: contract => {
        const summary = summarizeResearcherContradictionFreshnessContractCoverage(contract);
        const ids = listResearcherContradictionFreshnessContractProbeIds(contract);
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
      description: "Probe ids are namespaced with rcfr. prefix",
      check: contract => {
        for (const probe of contract.probes) {
          if (!probe.id.startsWith("rcfr.")) {
            return `${probe.id} missing rcfr. prefix`;
          }
        }
        return null;
      },
    },
    {
      id: "run_record_summary_invariant",
      description: "Run record summary aligned + mismatches equals total",
      check: contract => {
        const fixture = loadResearcherContradictionFreshnessBaseline();
        const probeIds = listResearcherContradictionFreshnessContractProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildResearcherContradictionFreshnessProbeEvidence(
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
          return buildResearcherContradictionFreshnessProbeTelemetry(
            id,
            probe.category,
            index,
            index,
          );
        });
        const record = buildResearcherContradictionFreshnessRunRecord(
          buildResearcherContradictionFreshnessProvenance(
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
        "Synthetic failure/recovery slice record passes validateResearcherContradictionFreshnessEvidenceRunRecord",
      check: contract => {
        const fixture = loadResearcherContradictionFreshnessBaseline();
        const probeIds = listResearcherContradictionFreshnessFailureRecoveryProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildResearcherContradictionFreshnessProbeEvidence(
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
          return buildResearcherContradictionFreshnessProbeTelemetry(
            id,
            probe.category,
            index,
            index * 0.5,
          );
        });
        const record = buildResearcherContradictionFreshnessRunRecord(
          buildResearcherContradictionFreshnessProvenance(
            "property-check-failure-recovery",
            fixture,
            contract,
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T00:00:01.000Z",
            probeIds.length,
            {
              sliceAtom: "P04-B06-A06",
              sliceCategories: RESEARCHER_CONTRADICTION_FRESHNESS_FAILURE_RECOVERY_CATEGORIES,
            },
          ),
          evidence,
          telemetry,
        );
        const validation = validateResearcherContradictionFreshnessEvidenceRunRecord(record, contract);
        if (!validation.valid) {
          return validation.issues.map(i => i.detail).join("; ");
        }
        return null;
      },
    },
  ] as const;

export function runResearcherContradictionFreshnessPropertyValidation(
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): ResearcherContradictionFreshnessPropertyResult {
  const failed: ResearcherContradictionFreshnessPropertyViolation[] = [];
  for (const property of RESEARCHER_CONTRADICTION_FRESHNESS_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = RESEARCHER_CONTRADICTION_FRESHNESS_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type ResearcherContradictionFreshnessFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface ResearcherContradictionFreshnessFuzzMutationCase {
  seed: number;
  kind: ResearcherContradictionFreshnessFuzzMutationKind;
  probeId?: string;
  category?: ResearcherContradictionFreshnessCategory;
}

export interface ResearcherContradictionFreshnessFuzzValidationCaseResult {
  mutation: ResearcherContradictionFreshnessFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface ResearcherContradictionFreshnessFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: ResearcherContradictionFreshnessFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createResearcherContradictionFreshnessFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneResearcherContradictionFreshnessBaseline(
  fixture: ResearcherContradictionFreshnessBaseline,
): ResearcherContradictionFreshnessBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickResearcherContradictionFreshnessFuzzTarget(
  fixture: ResearcherContradictionFreshnessBaseline,
  rng: () => number,
): {
  category: ResearcherContradictionFreshnessCategory;
  index: number;
  entry: ResearcherContradictionFreshnessFixtureEntry;
} {
  const category =
    RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES[
      Math.floor(rng() * RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES.length)
    ]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyResearcherContradictionFreshnessFuzzMutation(
  fixture: ResearcherContradictionFreshnessBaseline,
  mutation: ResearcherContradictionFreshnessFuzzMutationCase,
): ResearcherContradictionFreshnessBaseline {
  const mutated = cloneResearcherContradictionFreshnessBaseline(fixture);
  const targetCategory = mutation.category ?? RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES[0]!;
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
          id: `rcfr.fuzz.extra.${mutation.seed}`,
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
      const other = RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateResearcherContradictionFreshnessFuzzMutationCases(
  fixture: ResearcherContradictionFreshnessBaseline,
  seed: number,
  iterations: number,
): ResearcherContradictionFreshnessFuzzMutationCase[] {
  const rng = createResearcherContradictionFreshnessFuzzRng(seed);
  const kinds: ResearcherContradictionFreshnessFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: ResearcherContradictionFreshnessFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickResearcherContradictionFreshnessFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P04-B06-A07). */
export function runResearcherContradictionFreshnessFuzzValidation(
  fixture: ResearcherContradictionFreshnessBaseline,
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
  seed = 42,
  iterations = 24,
): ResearcherContradictionFreshnessFuzzValidationResult {
  const cases = generateResearcherContradictionFreshnessFuzzMutationCases(fixture, seed, iterations);
  const results: ResearcherContradictionFreshnessFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyResearcherContradictionFreshnessFuzzMutation(fixture, mutation);
    const validation = validateResearcherContradictionFreshnessAgainstContract(mutated, contract);
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

export type ResearcherContradictionFreshnessRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface ResearcherContradictionFreshnessRunRecordFuzzCase {
  kind: ResearcherContradictionFreshnessRunRecordFuzzKind;
  probeId?: string;
}

export function applyResearcherContradictionFreshnessRunRecordFuzzMutation(
  record: ResearcherContradictionFreshnessRunRecord,
  mutation: ResearcherContradictionFreshnessRunRecordFuzzCase,
): ResearcherContradictionFreshnessRunRecord {
  const cloned: ResearcherContradictionFreshnessRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P04-B06-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["evidence_versioning"],
      };
      break;
  }

  cloned.summary = buildResearcherContradictionFreshnessRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveResearcherContradictionFreshnessRunRecordValidator(
  record: ResearcherContradictionFreshnessRunRecord,
): (
  record: ResearcherContradictionFreshnessRunRecord,
  contract: ResearcherContradictionFreshnessContract,
) => ResearcherContradictionFreshnessRunValidationResult {
  return record.provenance.sliceAtom === "P04-B06-A06"
    ? validateResearcherContradictionFreshnessEvidenceRunRecord
    : validateResearcherContradictionFreshnessRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P04-B06-A07). */
export function runResearcherContradictionFreshnessRunRecordFuzzValidation(
  record: ResearcherContradictionFreshnessRunRecord,
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveResearcherContradictionFreshnessRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: ResearcherContradictionFreshnessRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P04-B06-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyResearcherContradictionFreshnessRunRecordFuzzMutation(record, mutation);
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

export interface ResearcherContradictionFreshnessPropertyFuzzSliceResult {
  atom: "P04-B06-A07";
  propertyChecksPassed: boolean;
  contractFuzzRejected: boolean;
  runRecordFuzzRejected: boolean;
  propertyResult: ResearcherContradictionFreshnessPropertyResult;
  contractFuzz: ResearcherContradictionFreshnessFuzzValidationResult;
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
export function runResearcherContradictionFreshnessPropertyFuzzSlice(
  fixture: ResearcherContradictionFreshnessBaseline = loadResearcherContradictionFreshnessBaseline(),
): ResearcherContradictionFreshnessPropertyFuzzSliceResult {
  const contract = getActiveResearcherContradictionFreshnessContract();
  const propertyResult = runResearcherContradictionFreshnessPropertyValidation(contract);
  const contractFuzz = runResearcherContradictionFreshnessFuzzValidation(fixture, contract);
  const record = runResearcherContradictionFreshnessFailureRecoverySliceWithRecord(fixture);
  const runRecordFuzz = runResearcherContradictionFreshnessRunRecordFuzzValidation(record, contract);

  return {
    atom: "P04-B06-A07",
    propertyChecksPassed: propertyResult.allPassed,
    contractFuzzRejected: contractFuzz.allMutationsRejected,
    runRecordFuzzRejected: runRecordFuzz.mutationsAccepted === 0,
    propertyResult,
    contractFuzz,
    runRecordFuzz,
  };
}

// ─── Probe regression detection (P04-B06-A08) ────────────────────────────────

export interface ResearcherContradictionFreshnessProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare contradiction freshness run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectResearcherContradictionFreshnessProbeRegression(
  prior: ResearcherContradictionFreshnessRunRecord,
  current: ResearcherContradictionFreshnessRunRecord,
): ResearcherContradictionFreshnessProbeRegressionReport {
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

export interface ResearcherContradictionFreshnessForgeRegressionResult {
  atom: "P04-B06-A08";
  passed: boolean;
  productionSlice: ResearcherContradictionFreshnessProductionSliceResult;
  propertyFuzzSlice: ResearcherContradictionFreshnessPropertyFuzzSliceResult;
  record: ResearcherContradictionFreshnessRunRecord;
  recordValid: boolean;
  priorRecordValid: boolean;
  validationIssues: string[];
  priorValidationIssues: string[];
  probeRegression: ResearcherContradictionFreshnessProbeRegressionReport | null;
  guard: ResearcherContradictionFreshnessGuardCheckResult;
  detail: string;
}

/**
 * Execute contradiction freshness probes, validate production slice + run record,
 * property/fuzz gates, and optionally detect regression vs prior run (P04-B06-A08).
 */
export function runResearcherContradictionFreshnessForgeRegression(
  priorRecord?: ResearcherContradictionFreshnessRunRecord,
): ResearcherContradictionFreshnessForgeRegressionResult {
  const fixture = loadResearcherContradictionFreshnessBaseline();
  const contract = getActiveResearcherContradictionFreshnessContract();
  const productionSlice = runResearcherContradictionFreshnessProductionSlice(fixture);
  const propertyFuzzSlice = runResearcherContradictionFreshnessPropertyFuzzSlice(fixture);
  const record = runResearcherContradictionFreshnessProbesWithRecord(fixture);
  const validation = validateResearcherContradictionFreshnessRunRecord(record, contract);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  let priorRecordValid = true;
  let priorValidationIssues: string[] = [];
  if (priorRecord) {
    const priorValidation = validateResearcherContradictionFreshnessRunRecord(priorRecord, contract);
    priorRecordValid = priorValidation.valid && priorRecord.summary.mismatches === 0;
    priorValidationIssues = priorValidation.issues.map(issue => issue.detail);
  }

  const probeRegression = priorRecord
    ? detectResearcherContradictionFreshnessProbeRegression(priorRecord, record)
    : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;
  const guard = validateForgeResearcherContradictionFreshnessGuard(record, {
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
    atom: "P04-B06-A08",
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

// ─── Guard controls (P04-B06-A09 foundation, used by A08 regression gate) ────

export interface ForgeResearcherContradictionFreshnessGuardControls {
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

export interface ResearcherContradictionFreshnessGuardCheckIssue {
  domain: "adversarial" | "performance" | "cost" | "safety";
  code: string;
  detail: string;
}

export interface ResearcherContradictionFreshnessGuardCheckResult {
  passed: boolean;
  issues: ResearcherContradictionFreshnessGuardCheckIssue[];
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

export interface ResearcherContradictionFreshnessAdversarialGuardScenario {
  id: string;
  description: string;
  build: (record: ResearcherContradictionFreshnessRunRecord) => ResearcherContradictionFreshnessRunRecord;
  expectRejected: true;
}

export const FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_GUARD_CONTROLS_V1: ForgeResearcherContradictionFreshnessGuardControls =
  {
    atom: "P04-B06-A09",
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

export function getForgeResearcherContradictionFreshnessGuardControls(): ForgeResearcherContradictionFreshnessGuardControls {
  return FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_GUARD_CONTROLS_V1;
}

function parseResearcherContradictionFreshnessIsoDurationMs(
  startedAt: string,
  completedAt: string,
): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function summarizeResearcherContradictionFreshnessTelemetry(
  telemetry: ResearcherContradictionFreshnessProbeTelemetry[],
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

export function detectResearcherContradictionFreshnessEvidenceSummaryMismatch(
  record: ResearcherContradictionFreshnessRunRecord,
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

export function detectResearcherContradictionFreshnessFalseAlignment(
  record: ResearcherContradictionFreshnessRunRecord,
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

export function validateResearcherContradictionFreshnessSafety(
  record: ResearcherContradictionFreshnessRunRecord,
  controls: ForgeResearcherContradictionFreshnessGuardControls = getForgeResearcherContradictionFreshnessGuardControls(),
): ResearcherContradictionFreshnessGuardCheckIssue[] {
  const issues: ResearcherContradictionFreshnessGuardCheckIssue[] = [];
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

export function validateResearcherContradictionFreshnessPerformance(
  record: ResearcherContradictionFreshnessRunRecord,
  controls: ForgeResearcherContradictionFreshnessGuardControls = getForgeResearcherContradictionFreshnessGuardControls(),
): ResearcherContradictionFreshnessGuardCheckIssue[] {
  const issues: ResearcherContradictionFreshnessGuardCheckIssue[] = [];
  const { suiteDurationMs, maxProbeDurationMs } = summarizeResearcherContradictionFreshnessTelemetry(
    record.telemetry,
  );
  const wallClockMs = parseResearcherContradictionFreshnessIsoDurationMs(
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

export function validateResearcherContradictionFreshnessCost(
  totalCostUsd: number,
  llmCalls: number,
  controls: ForgeResearcherContradictionFreshnessGuardControls = getForgeResearcherContradictionFreshnessGuardControls(),
): ResearcherContradictionFreshnessGuardCheckIssue[] {
  const issues: ResearcherContradictionFreshnessGuardCheckIssue[] = [];
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

export function buildResearcherContradictionFreshnessAdversarialGuardScenarios(): ResearcherContradictionFreshnessAdversarialGuardScenario[] {
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

export function runResearcherContradictionFreshnessAdversarialGuardChecks(
  fixtureRecord: ResearcherContradictionFreshnessRunRecord,
  contract: ResearcherContradictionFreshnessContract = getActiveResearcherContradictionFreshnessContract(),
): { rejected: number; total: number; failures: string[] } {
  const scenarios = buildResearcherContradictionFreshnessAdversarialGuardScenarios();
  const failures: string[] = [];
  let rejected = 0;

  for (const scenario of scenarios) {
    const tampered = scenario.build(fixtureRecord);
    const validation = validateResearcherContradictionFreshnessRunRecord(tampered, contract);
    const falseAlignment = detectResearcherContradictionFreshnessFalseAlignment(tampered);
    const summaryMismatch = detectResearcherContradictionFreshnessEvidenceSummaryMismatch(tampered);
    const rejectedByGuard =
      !validation.valid || falseAlignment.length > 0 || summaryMismatch !== null;

    if (rejectedByGuard) rejected++;
    else failures.push(`${scenario.id}: tampered record was not rejected`);
  }

  return { rejected, total: scenarios.length, failures };
}

export function validateForgeResearcherContradictionFreshnessGuard(
  record: ResearcherContradictionFreshnessRunRecord,
  options: {
    totalCostUsd?: number;
    llmCalls?: number;
    contract?: ResearcherContradictionFreshnessContract;
    controls?: ForgeResearcherContradictionFreshnessGuardControls;
  } = {},
): ResearcherContradictionFreshnessGuardCheckResult {
  const controls = options.controls ?? getForgeResearcherContradictionFreshnessGuardControls();
  const contract = options.contract ?? getActiveResearcherContradictionFreshnessContract();
  const totalCostUsd = options.totalCostUsd ?? 0;
  const llmCalls = options.llmCalls ?? 0;
  const issues: ResearcherContradictionFreshnessGuardCheckIssue[] = [];

  issues.push(...validateResearcherContradictionFreshnessPerformance(record, controls));
  issues.push(...validateResearcherContradictionFreshnessCost(totalCostUsd, llmCalls, controls));
  issues.push(...validateResearcherContradictionFreshnessSafety(record, controls));

  const falseAlignment = detectResearcherContradictionFreshnessFalseAlignment(record);
  if (falseAlignment.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "false_alignment",
      detail: falseAlignment.join("; "),
    });
  }
  const summaryMismatch = detectResearcherContradictionFreshnessEvidenceSummaryMismatch(record);
  if (summaryMismatch) {
    issues.push({
      domain: "adversarial",
      code: "summary_evidence_mismatch",
      detail: summaryMismatch,
    });
  }

  const adversarial = runResearcherContradictionFreshnessAdversarialGuardChecks(record, contract);
  if (adversarial.failures.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "scenario_not_rejected",
      detail: adversarial.failures.join("; "),
    });
  }

  const telemetrySummary = summarizeResearcherContradictionFreshnessTelemetry(record.telemetry);
  const wallClockMs = parseResearcherContradictionFreshnessIsoDurationMs(
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
