/**
 * FOREMAN — Researcher Web & Primary-Source Research Baseline (P04-B03)
 *
 * A01 slice: load, validate, run probes, contract alignment against sealed
 * P04-B02 in-repo evidence block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import researcherWebPrimarySourceBaseline from "./fixtures/forge-researcher-web-primary-source-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP04B02ToB03Handoff,
  getActiveResearcherInRepoEvidenceContract,
  summarizeResearcherInRepoEvidenceContractCoverage,
  FORGE_RESEARCHER_IN_REPO_EVIDENCE_CONTRACT_V1,
} from "./forge-p04-researcher-in-repo-evidence.js";

export const FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_VERSION = "1.0.0-a01";

export const EXPECTED_P04_B02_SEALED_ATOM_COUNT = 10;

/** Maximum normalized primary-source URL length before truncation (P04-B03-A01 boundary). */
export const RESEARCHER_WEB_PRIMARY_SOURCE_URL_MAX_LENGTH = 2048;

export const RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORIES = [
  "evidence_versioning",
  "web_signal",
  "primary_source_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type ResearcherWebPrimarySourceCategory =
  (typeof RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORIES)[number];

export type WebPrimarySourceInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface WebPrimarySourceInputBoundary {
  disposition: WebPrimarySourceInputDisposition;
  acceptable: boolean;
  normalizedUrl: string;
  truncated: boolean;
  detail: string;
}

/**
 * Assess URL input boundary conditions before web primary-source fetch (P04-B03-A01).
 */
export function assessWebPrimarySourceInputBoundary(
  url: string,
): WebPrimarySourceInputBoundary {
  if (url.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedUrl: "",
      truncated: false,
      detail: "null byte detected in URL input",
    };
  }

  const trimmed = url.trim();
  if (trimmed.length === 0) {
    const disposition: WebPrimarySourceInputDisposition =
      url.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedUrl: "",
      truncated: false,
      detail: disposition === "empty" ? "empty URL input" : "whitespace-only URL input",
    };
  }

  let normalizedUrl = url;
  let truncated = false;
  if (normalizedUrl.length > RESEARCHER_WEB_PRIMARY_SOURCE_URL_MAX_LENGTH) {
    normalizedUrl = normalizedUrl.slice(0, RESEARCHER_WEB_PRIMARY_SOURCE_URL_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedUrl,
    truncated,
    detail: truncated
      ? `URL truncated to ${RESEARCHER_WEB_PRIMARY_SOURCE_URL_MAX_LENGTH} characters`
      : "valid URL input",
  };
}

export interface WebPrimarySourceFetchEntry {
  url: string;
  text: string;
  title?: string;
}

export interface WebPrimarySourceCollectionValidationOutcome {
  valid: boolean;
  fetchHitCount: number;
  issues: string[];
}

/**
 * Validate web primary-source collection inputs before orchestrator pre-research wiring (P04-B03-A01).
 */
export function validateWebPrimarySourceCollection(
  url: string,
  fetchResults: WebPrimarySourceFetchEntry[] = [],
): WebPrimarySourceCollectionValidationOutcome {
  const boundary = assessWebPrimarySourceInputBoundary(url);
  if (!boundary.acceptable) {
    return {
      valid: false,
      fetchHitCount: 0,
      issues: [boundary.detail],
    };
  }

  const fetchHitCount = fetchResults.length;
  if (fetchHitCount === 0) {
    return {
      valid: false,
      fetchHitCount,
      issues: ["zero primary-source fetch hits for normalized URL"],
    };
  }

  const hasCitationFields = fetchResults.every(
    result =>
      typeof result.url === "string" &&
      result.url.length > 0 &&
      typeof result.text === "string" &&
      result.text.length > 0,
  );
  if (!hasCitationFields) {
    return {
      valid: false,
      fetchHitCount,
      issues: ["fetch results missing url or text citation fields"],
    };
  }

  return {
    valid: true,
    fetchHitCount,
    issues: [],
  };
}

export interface ResearcherWebPrimarySourceFixtureEntry {
  id: string;
  category: ResearcherWebPrimarySourceCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface ResearcherWebPrimarySourceBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    inRepoEvidenceProbeCount: number;
    sealedAtomCount: number;
  };
  probes: ResearcherWebPrimarySourceFixtureEntry[];
}

export interface ResearcherWebPrimarySourceProbeResult {
  id: string;
  category: ResearcherWebPrimarySourceCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface ResearcherWebPrimarySourceProbeSummary {
  total: number;
  aligned: number;
  mismatches: ResearcherWebPrimarySourceProbeResult[];
  knownGaps: ResearcherWebPrimarySourceProbeResult[];
  byCategory: Record<
    ResearcherWebPrimarySourceCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface ResearcherWebPrimarySourceValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: ResearcherWebPrimarySourceCategory;
  detail: string;
}

export interface ResearcherWebPrimarySourceValidationResult {
  valid: boolean;
  issues: ResearcherWebPrimarySourceValidationIssue[];
}

export type ResearcherWebPrimarySourceProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface ResearcherWebPrimarySourceProbeContract {
  id: string;
  category: ResearcherWebPrimarySourceCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: ResearcherWebPrimarySourceProbeDisposition;
  criterion: string;
}

export interface ResearcherWebPrimarySourceCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface ResearcherWebPrimarySourceCategoryContract {
  category: ResearcherWebPrimarySourceCategory;
  acceptance: ResearcherWebPrimarySourceCategoryAcceptance;
  probes: readonly ResearcherWebPrimarySourceProbeContract[];
}

export interface ResearcherWebPrimarySourceContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<
    ResearcherWebPrimarySourceCategory,
    ResearcherWebPrimarySourceCategoryContract
  >;
  probes: readonly ResearcherWebPrimarySourceProbeContract[];
}

export const RESEARCHER_WEB_PRIMARY_SOURCE_A01_MIN_PROBES: Readonly<
  Record<ResearcherWebPrimarySourceCategory, number>
> = {
  evidence_versioning: 3,
  web_signal: 3,
  primary_source_signal: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

function flattenWebPrimarySourceCategoryProbes(
  categories: Record<
    ResearcherWebPrimarySourceCategory,
    ResearcherWebPrimarySourceCategoryContract
  >,
): readonly ResearcherWebPrimarySourceProbeContract[] {
  return RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORIES.flatMap(
    category => categories[category].probes,
  );
}

const RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORY_CONTRACTS: Record<
  ResearcherWebPrimarySourceCategory,
  ResearcherWebPrimarySourceCategoryContract
> = {
  evidence_versioning: {
    category: "evidence_versioning",
    acceptance: {
      invariant:
        "Web primary-source baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rwps.version_tagged",
        category: "evidence_versioning",
        description: "Web primary-source baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Web primary-source baseline declares semver version field",
      },
      {
        id: "rwps.atom_tagged",
        category: "evidence_versioning",
        description: "Web primary-source baseline declares P04-B03-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Web primary-source baseline declares P04-B03-A01 atom id",
      },
      {
        id: "rwps.harness_version_exported",
        category: "evidence_versioning",
        description:
          "FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_VERSION exported for web primary-source harness",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_VERSION exported for web primary-source harness",
      },
    ],
  },
  web_signal: {
    category: "web_signal",
    acceptance: {
      invariant:
        "Research engine and tools expose Brave web search wired into unified research context.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rwps.research_engine_web_search",
        category: "web_signal",
        description: "research-engine webSearch queries Brave Search API for external evidence",
        expected: "PASS",
        disposition: "observed",
        criterion: "research-engine webSearch queries Brave Search API for external evidence",
      },
      {
        id: "rwps.research_combined_web_results",
        category: "web_signal",
        description:
          "research() aggregates webResults and fetchedContent alongside file findings",
        expected: "PASS",
        disposition: "observed",
        criterion: "research() aggregates webResults and fetchedContent alongside file findings",
      },
      {
        id: "rwps.tools_web_search",
        category: "web_signal",
        description: "web_search tool exposes Brave Search with local fallback for researcher layer",
        expected: "PASS",
        disposition: "observed",
        criterion: "web_search tool exposes Brave Search with local fallback for researcher layer",
      },
    ],
  },
  primary_source_signal: {
    category: "primary_source_signal",
    acceptance: {
      invariant:
        "Web fetch engine and link intelligence expose SSRF-safe URL fetch with classification.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rwps.web_fetch_engine_ssrf",
        category: "primary_source_signal",
        description: "webFetch blocks private IPs and localhost for SSRF-safe primary-source fetch",
        expected: "PASS",
        disposition: "observed",
        criterion: "webFetch blocks private IPs and localhost for SSRF-safe primary-source fetch",
      },
      {
        id: "rwps.link_intelligence_classify",
        category: "primary_source_signal",
        description: "LinkIntelligence classifyUrl categorizes URLs before primary-source extraction",
        expected: "PASS",
        disposition: "observed",
        criterion: "LinkIntelligence classifyUrl categorizes URLs before primary-source extraction",
      },
      {
        id: "rwps.tools_web_fetch",
        category: "primary_source_signal",
        description: "web_fetch tool enables grounded URL content inspection for researcher",
        expected: "PASS",
        disposition: "observed",
        criterion: "web_fetch tool enables grounded URL content inspection for researcher",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "P04-B02 block gate handoff targets P04-B03-A01 with sealed in-repo evidence probe count.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rwps.b02_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P04_B02_TO_B03_HANDOFF_V1 targets P04-B03-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P04_B02_TO_B03_HANDOFF_V1 targets P04-B03-A01 entry atom",
      },
      {
        id: "rwps.b02_sealed_in_repo_probes",
        category: "baseline_link",
        description:
          "P04-B02→B03 handoff sealed probeCount matches active in-repo evidence contract",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "P04-B02→B03 handoff sealed probeCount matches active in-repo evidence contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "URL input boundary assessment handles empty, whitespace-only and oversized inputs; probe runner and documented gaps wired.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rwps.source_block_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P04-B02 block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P04-B02 block gate source artifacts",
      },
      {
        id: "rwps.probe_runner_exported",
        category: "boundary",
        description: "runResearcherWebPrimarySourceProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runResearcherWebPrimarySourceProbes executes contract-wired probe matrix",
      },
      {
        id: "rwps.known_gaps_documented",
        category: "boundary",
        description:
          "Baseline fixture documents at least one measurable FAIL web primary-source gap",
        expected: "PASS",
        disposition: "gap",
        criterion:
          "Baseline fixture documents at least one measurable FAIL web primary-source gap",
      },
      {
        id: "rwps.empty_url_boundary",
        category: "boundary",
        description: "assessWebPrimarySourceInputBoundary rejects empty URL input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessWebPrimarySourceInputBoundary rejects empty URL input",
      },
      {
        id: "rwps.whitespace_url_boundary",
        category: "boundary",
        description: "assessWebPrimarySourceInputBoundary rejects whitespace-only URL input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessWebPrimarySourceInputBoundary rejects whitespace-only URL input",
      },
      {
        id: "rwps.long_url_truncation_boundary",
        category: "boundary",
        description: "assessWebPrimarySourceInputBoundary truncates URL exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessWebPrimarySourceInputBoundary truncates URL exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Invalid fixture versions and null-byte URL inputs are rejected safely.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rwps.invalid_version_rejected",
        category: "failure_path",
        description:
          "validateResearcherWebPrimarySourceBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateResearcherWebPrimarySourceBaseline rejects unexpected fixture version",
      },
      {
        id: "rwps.malformed_url_guard",
        category: "failure_path",
        description: "assessWebPrimarySourceInputBoundary rejects null-byte URL safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessWebPrimarySourceInputBoundary rejects null-byte URL safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Researcher BLOCK is non-fatal; structured URL citation recovery closes documented gap in A03.",
      minProbeCount: 2,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "rwps.research_block_non_fatal",
        category: "recovery_path",
        description: "Orchestrator treats researcher BLOCK as non-fatal and continues pipeline",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Orchestrator treats researcher BLOCK as non-fatal and continues pipeline",
      },
      {
        id: "rwps.structured_web_primary_source_recovery",
        category: "recovery_path",
        description:
          "recoverWebPrimarySourceEvidence restructures failed URL citation parse into actionable fetch plan",
        expected: "FAIL",
        disposition: "gap",
        criterion:
          "recoverWebPrimarySourceEvidence restructures failed URL citation parse into actionable fetch plan",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Researcher can BLOCK on critical infeasibility; web primary-source validator exported.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rwps.researcher_critical_block",
        category: "nogo_path",
        description: "RESEARCHER_SYSTEM prompt can BLOCK on critical infeasibility findings",
        expected: "PASS",
        disposition: "nogo",
        criterion: "RESEARCHER_SYSTEM prompt can BLOCK on critical infeasibility findings",
      },
      {
        id: "rwps.exported_web_primary_source_validator",
        category: "nogo_path",
        description:
          "validateWebPrimarySourceCollection exported for orchestrator pre-research wiring",
        expected: "PASS",
        disposition: "nogo",
        criterion:
          "validateWebPrimarySourceCollection exported for orchestrator pre-research wiring",
      },
    ],
  },
};

export const FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_CONTRACT_V1: ResearcherWebPrimarySourceContract =
  {
    version: "1.0.0",
    atom: "P04-B03-A02",
    purpose:
      "Typed contract for web and primary-source research probe matrix aligned to P04-B03 baseline.",
    categories: RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORY_CONTRACTS,
    probes: flattenWebPrimarySourceCategoryProbes(RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORY_CONTRACTS),
  };

export function getActiveResearcherWebPrimarySourceContract(): ResearcherWebPrimarySourceContract {
  return FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_CONTRACT_V1;
}

export function listResearcherWebPrimarySourceContractProbeIds(
  contract: ResearcherWebPrimarySourceContract = getActiveResearcherWebPrimarySourceContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function summarizeResearcherWebPrimarySourceContractCoverage(
  contract: ResearcherWebPrimarySourceContract = getActiveResearcherWebPrimarySourceContract(),
): {
  totalProbes: number;
  byCategory: Record<ResearcherWebPrimarySourceCategory, number>;
  byDisposition: Record<ResearcherWebPrimarySourceProbeDisposition, number>;
} {
  const byCategory = {} as Record<ResearcherWebPrimarySourceCategory, number>;
  const byDisposition = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  } satisfies Record<ResearcherWebPrimarySourceProbeDisposition, number>;

  for (const category of RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORIES) {
    byCategory[category] = contract.categories[category].probes.length;
  }
  for (const probeEntry of contract.probes) {
    byDisposition[probeEntry.disposition]++;
  }

  return {
    totalProbes: contract.probes.length,
    byCategory,
    byDisposition,
  };
}

export interface ResearcherWebPrimarySourceContractValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow" | "prefix";
  probeId?: string;
  category?: ResearcherWebPrimarySourceCategory;
  detail: string;
}

export function validateResearcherWebPrimarySourceAgainstContract(
  fixture: ResearcherWebPrimarySourceBaseline,
  contract: ResearcherWebPrimarySourceContract = getActiveResearcherWebPrimarySourceContract(),
): { valid: boolean; issues: ResearcherWebPrimarySourceContractValidationIssue[] } {
  const issues: ResearcherWebPrimarySourceContractValidationIssue[] = [];

  for (const category of RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORIES) {
    const min = RESEARCHER_WEB_PRIMARY_SOURCE_A01_MIN_PROBES[category];
    const count = contract.categories[category].probes.length;
    if (count < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${count} contract probes; requires >= ${min}`,
      });
    }
  }

  for (const probeEntry of contract.probes) {
    if (!probeEntry.id.startsWith("rwps.")) {
      issues.push({
        kind: "prefix",
        probeId: probeEntry.id,
        detail: `${probeEntry.id} missing rwps. prefix`,
      });
    }
  }

  for (const expected of contract.probes) {
    const entry = fixture.probes.find(p => p.id === expected.id);
    if (!entry) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `fixture missing probe ${expected.id}`,
      });
      continue;
    }
    if (entry.expected !== expected.expected) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `expected mismatch fixture=${entry.expected} contract=${expected.expected}`,
      });
    }
    if (entry.category !== expected.category) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `category mismatch fixture=${entry.category} contract=${expected.category}`,
      });
    }
    if (entry.description !== expected.description) {
      issues.push({
        kind: "missing_probe",
        probeId: expected.id,
        detail: `description mismatch for ${expected.id}`,
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

export const FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_A01_PROBE_MATRIX: readonly ResearcherWebPrimarySourceFixtureEntry[] =
  researcherWebPrimarySourceBaseline.probes as ResearcherWebPrimarySourceFixtureEntry[];

export function loadResearcherWebPrimarySourceBaseline(): ResearcherWebPrimarySourceBaseline {
  return researcherWebPrimarySourceBaseline as ResearcherWebPrimarySourceBaseline;
}

export function validateResearcherWebPrimarySourceBaseline(
  fixture: ResearcherWebPrimarySourceBaseline,
): ResearcherWebPrimarySourceValidationResult {
  const issues: ResearcherWebPrimarySourceValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P04-B03-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORIES.map(category => [category, 0]),
  ) as Record<ResearcherWebPrimarySourceCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORIES) {
    const min = RESEARCHER_WEB_PRIMARY_SOURCE_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_A01_PROBE_MATRIX) {
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

  const handoff = getForgeP04B02ToB03Handoff();
  const inRepoCoverage = summarizeResearcherInRepoEvidenceContractCoverage(
    getActiveResearcherInRepoEvidenceContract(),
  );

  if (fixture.sourceBlockGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (
    fixture.sourceBlockGate.contractVersion !==
    FORGE_RESEARCHER_IN_REPO_EVIDENCE_CONTRACT_V1.version
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.contractVersion=${fixture.sourceBlockGate.contractVersion} ` +
        `expected=${FORGE_RESEARCHER_IN_REPO_EVIDENCE_CONTRACT_V1.version}`,
    });
  }
  if (
    fixture.sourceBlockGate.inRepoEvidenceProbeCount !== inRepoCoverage.totalProbes
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.inRepoEvidenceProbeCount=${fixture.sourceBlockGate.inRepoEvidenceProbeCount} ` +
        `contract=${inRepoCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P04_B02_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P04_B02_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P04-B03-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `P04-B02 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P04-B03-A01`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length < 1) {
    issues.push({
      kind: "missing_category",
      detail: "A01 fixture must document at least one known FAIL gap",
    });
  }

  const contractAlignment = validateResearcherWebPrimarySourceAgainstContract(fixture);
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeResearcherWebPrimarySourceMatrix(
  results: ResearcherWebPrimarySourceProbeResult[],
): ResearcherWebPrimarySourceProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as ResearcherWebPrimarySourceProbeSummary["byCategory"];
  for (const category of RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORIES) {
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

export function listResearcherWebPrimarySourceProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherWebPrimarySourceBaseline = loadResearcherWebPrimarySourceBaseline(),
): ResearcherWebPrimarySourceFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listResearcherWebPrimarySourceKnownGaps(
  results: ResearcherWebPrimarySourceProbeResult[],
): ResearcherWebPrimarySourceProbeResult[] {
  return summarizeResearcherWebPrimarySourceMatrix(results).knownGaps;
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
  category: ResearcherWebPrimarySourceCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): ResearcherWebPrimarySourceProbeResult {
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

function productionWebPrimarySourceSource(): string {
  return readSrc("forge-p04-researcher-web-primary-source.ts");
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

function webFetchEngineSource(): string {
  return readSrc("web-fetch-engine.ts");
}

function linkIntelligenceSource(): string {
  return readSrc("link-intelligence.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionWebPrimarySourceSource());
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

function runResearcherWebPrimarySourceProbe(
  id: string,
  category: ResearcherWebPrimarySourceCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherWebPrimarySourceBaseline,
): ResearcherWebPrimarySourceProbeResult {
  const contract = getActiveResearcherWebPrimarySourceContract();
  const contractProbe = contract.probes.find(p => p.id === id);
  const criterion = contractProbe?.criterion;
  const orchestrator = orchestratorSource();
  const researchEngine = researchEngineSource();
  const tools = toolsSource();
  const webFetchEngine = webFetchEngineSource();
  const linkIntelligence = linkIntelligenceSource();
  const researcherPrompt = researcherFormatSection();

  switch (id) {
    case "rwps.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`, criterion);
    }
    case "rwps.atom_tagged": {
      const ok = fixture.atom === "P04-B03-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`, criterion);
    }
    case "rwps.harness_version_exported": {
      const ok = FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_VERSION}`,
        criterion,
      );
    }
    case "rwps.research_engine_web_search": {
      const ok =
        researchEngine.includes("export async function webSearch") &&
        researchEngine.includes("braveSearch");
      return probe(id, category, expected, ok, `webSearch=${ok}`, criterion);
    }
    case "rwps.research_combined_web_results": {
      const ok =
        researchEngine.includes("webResults") &&
        researchEngine.includes("fetchedContent") &&
        researchEngine.includes("export async function research(");
      return probe(id, category, expected, ok, `combinedWebResearch=${ok}`, criterion);
    }
    case "rwps.tools_web_search": {
      const ok = tools.includes('name: "web_search"') && tools.includes('case "web_search"');
      return probe(id, category, expected, ok, `webSearchTool=${ok}`, criterion);
    }
    case "rwps.web_fetch_engine_ssrf": {
      const ok =
        webFetchEngine.includes("export async function webFetch") &&
        webFetchEngine.includes("PRIVATE_IP_PATTERNS") &&
        webFetchEngine.includes("/^127\\./") &&
        webFetchEngine.includes("/^localhost$/i");
      return probe(id, category, expected, ok, `ssrfGuard=${ok}`, criterion);
    }
    case "rwps.link_intelligence_classify": {
      const ok =
        linkIntelligence.includes("export function classifyUrl") &&
        linkIntelligence.includes("export class LinkIntelligence");
      return probe(id, category, expected, ok, `classifyUrl=${ok}`, criterion);
    }
    case "rwps.tools_web_fetch": {
      const ok = tools.includes('name: "web_fetch"') && tools.includes('case "web_fetch"');
      return probe(id, category, expected, ok, `webFetchTool=${ok}`, criterion);
    }
    case "rwps.b02_block_handoff_entry": {
      const handoff = getForgeP04B02ToB03Handoff();
      const ok =
        handoff.targetBlock.blockId === "P04-B03" &&
        handoff.targetBlock.entryAtom === "P04-B03-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
        criterion,
      );
    }
    case "rwps.b02_sealed_in_repo_probes": {
      const handoff = getForgeP04B02ToB03Handoff();
      const coverage = summarizeResearcherInRepoEvidenceContractCoverage(
        getActiveResearcherInRepoEvidenceContract(),
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
    case "rwps.source_block_gate_ref": {
      const handoff = getForgeP04B02ToB03Handoff();
      const coverage = summarizeResearcherInRepoEvidenceContractCoverage(
        getActiveResearcherInRepoEvidenceContract(),
      );
      const ok =
        fixture.sourceBlockGate.atom === handoff.atom &&
        fixture.sourceBlockGate.inRepoEvidenceProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P04_B02_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.inRepoEvidenceProbeCount}`,
        criterion,
      );
    }
    case "rwps.probe_runner_exported": {
      const ok = productionWebPrimarySourceSource().includes(
        "export function runResearcherWebPrimarySourceProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`, criterion);
    }
    case "rwps.known_gaps_documented": {
      const activeContract = getActiveResearcherWebPrimarySourceContract();
      const expectedFail = activeContract.probes.filter(p => p.expected === "FAIL").length;
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount === expectedFail && failCount >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, contractExpectedFail=${expectedFail}`,
        criterion,
      );
    }
    case "rwps.empty_url_boundary": {
      const result = assessWebPrimarySourceInputBoundary("");
      const ok =
        hasProductionExport("assessWebPrimarySourceInputBoundary") &&
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
    case "rwps.whitespace_url_boundary": {
      const result = assessWebPrimarySourceInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessWebPrimarySourceInputBoundary") &&
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
    case "rwps.long_url_truncation_boundary": {
      const longUrl = "https://example.com/" + "x".repeat(RESEARCHER_WEB_PRIMARY_SOURCE_URL_MAX_LENGTH);
      const result = assessWebPrimarySourceInputBoundary(longUrl);
      const ok =
        hasProductionExport("assessWebPrimarySourceInputBoundary") &&
        result.acceptable === true &&
        result.truncated === true &&
        result.normalizedUrl.length === RESEARCHER_WEB_PRIMARY_SOURCE_URL_MAX_LENGTH;
      return probe(
        id,
        category,
        expected,
        ok,
        `truncated=${result.truncated}, len=${result.normalizedUrl.length}`,
        criterion,
      );
    }
    case "rwps.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateResearcherWebPrimarySourceBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`, criterion);
    }
    case "rwps.malformed_url_guard": {
      const boundary = assessWebPrimarySourceInputBoundary("https://example.com\0/evil");
      const ok =
        hasProductionExport("assessWebPrimarySourceInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${boundary.disposition}, acceptable=${boundary.acceptable}`,
        criterion,
      );
    }
    case "rwps.research_block_non_fatal": {
      const ok =
        orchestrator.includes("Research BLOCK is non-fatal") ||
        orchestrator.includes("Research BLOCK for block");
      return probe(id, category, expected, ok, `nonFatalBlock=${ok}`, criterion);
    }
    case "rwps.structured_web_primary_source_recovery": {
      const ok = hasProductionExport("recoverWebPrimarySourceEvidence");
      return probe(id, category, expected, ok, `recoverWebPrimarySourceEvidence=${ok}`, criterion);
    }
    case "rwps.researcher_critical_block": {
      const ok =
        researcherPrompt.includes("You CAN block the Strategist") &&
        researcherPrompt.includes("CRITICAL issue");
      return probe(id, category, expected, ok, `criticalBlockPrompt=${ok}`, criterion);
    }
    case "rwps.exported_web_primary_source_validator": {
      const ok = hasProductionExport("validateWebPrimarySourceCollection");
      return probe(
        id,
        category,
        expected,
        ok,
        `validateWebPrimarySourceCollection=${ok}`,
        criterion,
      );
    }
    default:
      return probe(id, category, expected, false, `unknown probe id: ${id}`, criterion);
  }
}

export function runResearcherWebPrimarySourceProbes(
  fixture: ResearcherWebPrimarySourceBaseline = loadResearcherWebPrimarySourceBaseline(),
): ResearcherWebPrimarySourceProbeResult[] {
  const contract = getActiveResearcherWebPrimarySourceContract();
  return contract.probes.map(contractProbe =>
    runResearcherWebPrimarySourceProbe(
      contractProbe.id,
      contractProbe.category,
      contractProbe.expected,
      fixture,
    ),
  );
}
