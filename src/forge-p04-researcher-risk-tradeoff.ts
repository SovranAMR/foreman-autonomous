/**
 * FOREMAN — Researcher Risk & Trade-off Research Baseline (P04-B07)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P04-B06 contradiction freshness block gate artifacts.
 * A05: failure_path, recovery_path and nogo_path slice gate for failure/recovery/NO-GO probes.
 * A06: evidence, telemetry and provenance run record for failure/recovery slice gate.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import researcherRiskTradeoffBaseline from "./fixtures/forge-researcher-risk-tradeoff-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP04B06ToB07Handoff,
  getActiveResearcherContradictionFreshnessContract,
  summarizeResearcherContradictionFreshnessContractCoverage,
  FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_CONTRACT_V1,
} from "./forge-p04-researcher-contradiction-freshness.js";
import { parseResearchResponse, parseResearchTradeoffs } from "./parser.js";

export const FORGE_RESEARCHER_RISK_TRADEOFF_VERSION = "1.0.0-a07";

export const EXPECTED_P04_B06_SEALED_ATOM_COUNT = 10;

export const RESEARCHER_RISK_TRADEOFF_INPUT_MAX_LENGTH = 8192;

export const RESEARCHER_RISK_TRADEOFF_CATEGORIES = [
  "evidence_versioning",
  "risk_signal",
  "tradeoff_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type ResearcherRiskTradeoffCategory =
  (typeof RESEARCHER_RISK_TRADEOFF_CATEGORIES)[number];

export const RESEARCHER_RISK_TRADEOFF_A01_MIN_PROBES: Readonly<
  Record<ResearcherRiskTradeoffCategory, number>
> = {
  evidence_versioning: 3,
  risk_signal: 3,
  tradeoff_signal: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

export type ResearchRiskTradeoffInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface ResearchRiskTradeoffInputBoundary {
  disposition: ResearchRiskTradeoffInputDisposition;
  acceptable: boolean;
  normalizedInput: string;
  truncated: boolean;
  detail: string;
}

export function assessResearchRiskTradeoffInputBoundary(
  researchInput: string,
): ResearchRiskTradeoffInputBoundary {
  if (researchInput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedInput: "",
      truncated: false,
      detail: "null byte detected in research input",
    };
  }

  const trimmed = researchInput.trim();
  if (trimmed.length === 0) {
    const disposition: ResearchRiskTradeoffInputDisposition =
      researchInput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedInput: "",
      truncated: false,
      detail: disposition === "empty" ? "empty research input" : "whitespace-only research input",
    };
  }

  let normalizedInput = researchInput;
  let truncated = false;
  if (normalizedInput.length > RESEARCHER_RISK_TRADEOFF_INPUT_MAX_LENGTH) {
    normalizedInput = normalizedInput.slice(0, RESEARCHER_RISK_TRADEOFF_INPUT_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedInput,
    truncated,
    detail: truncated
      ? `research input truncated to ${RESEARCHER_RISK_TRADEOFF_INPUT_MAX_LENGTH} characters`
      : "valid research input",
  };
}

export interface ResearchRiskTradeoffFindingEntry {
  claim: string;
  severity?: string;
  mitigation?: string;
}

export interface ResearchRiskTradeoffCollectionValidationOutcome {
  valid: boolean;
  findingCount: number;
  issues: string[];
}

export function validateResearchRiskTradeoffCollection(
  topic: string,
  findings: ResearchRiskTradeoffFindingEntry[] = [],
): ResearchRiskTradeoffCollectionValidationOutcome {
  const boundary = assessResearchRiskTradeoffInputBoundary(topic);
  if (!boundary.acceptable) {
    return { valid: false, findingCount: 0, issues: [boundary.detail] };
  }

  const findingCount = findings.length;
  if (findingCount === 0) {
    return {
      valid: false,
      findingCount,
      issues: ["zero risk/trade-off findings for normalized topic"],
    };
  }

  const issues: string[] = [];
  for (const [index, finding] of findings.entries()) {
    if (!finding.claim || finding.claim.trim().length === 0) {
      issues.push(`finding ${index} missing claim`);
    }
  }

  return { valid: issues.length === 0, findingCount, issues };
}

export interface ResearchRiskTradeoffValidationOutcome {
  valid: boolean;
  tradeoffCount: number;
  riskPresent: boolean;
  issues: string[];
}

/**
 * Validate researcher output declares actionable risk and trade-off signals (P04-B07-A03).
 */
export function validateResearchRiskTradeoff(
  researchOutput: string,
): ResearchRiskTradeoffValidationOutcome {
  const boundary = assessResearchRiskTradeoffInputBoundary(researchOutput);
  if (!boundary.acceptable) {
    return {
      valid: false,
      tradeoffCount: 0,
      riskPresent: false,
      issues: [boundary.detail],
    };
  }

  const issues: string[] = [];
  const normalized = boundary.normalizedInput;
  const riskPresent = /RISKS\s*[:=\-.]/i.test(normalized);
  if (!riskPresent) {
    issues.push("missing_risks_section");
  }

  const tradeoffParse = parseResearchTradeoffs(normalized);
  const tradeoffCount = tradeoffParse.ok ? tradeoffParse.data.dimensions.length : 0;
  if (tradeoffCount === 0) {
    const recovery = recoverResearchRiskTradeoffEvidence(normalized);
    if (recovery.researchPlan.tradeoffs.length === 0) {
      issues.push("missing_tradeoff_dimensions");
    }
  }

  return {
    valid: issues.length === 0,
    tradeoffCount:
      tradeoffCount > 0
        ? tradeoffCount
        : recoverResearchRiskTradeoffEvidence(normalized).researchPlan.tradeoffs.length,
    riskPresent,
    issues,
  };
}

export interface ResearchRiskTradeoffRecoveryHints {
  topic?: string;
  defaultSeverity?: string;
}

export interface ResearchRiskTradeoffRecoveryResult {
  recovered: boolean;
  researchPlan: {
    risks: Array<{ claim: string; severity: string; mitigation?: string }>;
    tradeoffs: string[];
    searchTopic?: string;
  };
  parseErrors: string[];
  detail: string;
}

const RISK_LINE_PATTERN =
  /(?:^|\n)\s*(?:RISK|RISKS)\s*[:=\-]\s*(.+?)(?:\s*\(([^)]+)\))?(?:\n|$)/gi;
const TRADEOFF_LINE_PATTERN =
  /(?:^|\n)\s*(?:TRADEOFF|TRADEOFFS|trade[-\s]?off)\s*[:=\-]\s*(.+?)(?:\n|$)/gi;
const VS_TRADEOFF_PATTERN = /(.+?)\s+(?:vs\.?|versus)\s+(.+)/i;

export function recoverResearchRiskTradeoffEvidence(
  failedParse: string,
  hints: ResearchRiskTradeoffRecoveryHints = {},
): ResearchRiskTradeoffRecoveryResult {
  const boundary = assessResearchRiskTradeoffInputBoundary(failedParse);
  if (!boundary.acceptable) {
    return {
      recovered: false,
      researchPlan: { risks: [], tradeoffs: [] },
      parseErrors: [boundary.disposition],
      detail: `cannot recover ${boundary.disposition.replace(/_/g, "-")} research parse`,
    };
  }

  const raw = boundary.normalizedInput;
  const risks: Array<{ claim: string; severity: string; mitigation?: string }> = [];
  const tradeoffs: string[] = [];

  for (const match of raw.matchAll(RISK_LINE_PATTERN)) {
    const claim = match[1]?.trim();
    const severity = match[2]?.trim() ?? hints.defaultSeverity ?? "medium";
    if (claim) risks.push({ claim, severity });
  }

  for (const match of raw.matchAll(TRADEOFF_LINE_PATTERN)) {
    const dimension = match[1]?.trim();
    if (dimension) tradeoffs.push(dimension);
  }

  if (tradeoffs.length === 0) {
    for (const line of raw.split("\n")) {
      const vsMatch = line.match(VS_TRADEOFF_PATTERN);
      if (vsMatch) tradeoffs.push(`${vsMatch[1].trim()} vs ${vsMatch[2].trim()}`);
    }
  }

  const searchTopic = hints.topic ?? raw.split("\n")[0]?.trim();
  const recovered = risks.length >= 1 || tradeoffs.length >= 1;

  if (tradeoffs.length === 0 && recovered) {
    tradeoffs.push("Recovered trade-off dimensions pending refinement");
  }

  return {
    recovered,
    researchPlan: {
      risks,
      tradeoffs: [...new Set(tradeoffs.filter(Boolean))],
      searchTopic: searchTopic || undefined,
    },
    parseErrors: recovered ? [] : ["missing_risk_and_tradeoff_markers"],
    detail: recovered
      ? `recovered ${risks.length} risks and ${tradeoffs.length} trade-offs`
      : "no actionable risk/trade-off markers found",
  };
}

export type ResearcherRiskTradeoffProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface ResearcherRiskTradeoffFixtureEntry {
  id: string;
  category: ResearcherRiskTradeoffCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface ResearcherRiskTradeoffBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    contradictionFreshnessProbeCount: number;
    sealedAtomCount: number;
  };
  probes: ResearcherRiskTradeoffFixtureEntry[];
}

export interface ResearcherRiskTradeoffProbeResult {
  id: string;
  category: ResearcherRiskTradeoffCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface ResearcherRiskTradeoffProbeSummary {
  total: number;
  aligned: number;
  mismatches: ResearcherRiskTradeoffProbeResult[];
  knownGaps: ResearcherRiskTradeoffProbeResult[];
  byCategory: Record<
    ResearcherRiskTradeoffCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface ResearcherRiskTradeoffValidationIssue {
  kind: "missing_probe" | "extra_probe" | "underflow" | "missing_category";
  probeId?: string;
  category?: ResearcherRiskTradeoffCategory;
  detail: string;
}

export interface ResearcherRiskTradeoffValidationResult {
  valid: boolean;
  issues: ResearcherRiskTradeoffValidationIssue[];
}

export interface ResearcherRiskTradeoffProbeContract {
  id: string;
  category: ResearcherRiskTradeoffCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: ResearcherRiskTradeoffProbeDisposition;
  criterion: string;
}

export interface ResearcherRiskTradeoffCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface ResearcherRiskTradeoffCategoryContract {
  category: ResearcherRiskTradeoffCategory;
  acceptance: ResearcherRiskTradeoffCategoryAcceptance;
  probes: readonly ResearcherRiskTradeoffProbeContract[];
}

export interface ResearcherRiskTradeoffContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<ResearcherRiskTradeoffCategory, ResearcherRiskTradeoffCategoryContract>;
  probes: readonly ResearcherRiskTradeoffProbeContract[];
}

function flattenRiskTradeoffCategoryProbes(
  categories: Record<ResearcherRiskTradeoffCategory, ResearcherRiskTradeoffCategoryContract>,
): readonly ResearcherRiskTradeoffProbeContract[] {
  return RESEARCHER_RISK_TRADEOFF_CATEGORIES.flatMap(category => categories[category].probes);
}

const RESEARCHER_RISK_TRADEOFF_CATEGORY_CONTRACTS: Record<
  ResearcherRiskTradeoffCategory,
  ResearcherRiskTradeoffCategoryContract
> = {
  evidence_versioning: {
    category: "evidence_versioning",
    acceptance: {
      invariant:
        "Risk trade-off baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rrto.version_tagged",
        category: "evidence_versioning",
        description: "Risk trade-off baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Risk trade-off baseline declares semver version field",
      },
      {
        id: "rrto.atom_tagged",
        category: "evidence_versioning",
        description: "Risk trade-off baseline declares P04-B07-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Risk trade-off baseline declares P04-B07-A01 atom id",
      },
      {
        id: "rrto.harness_version_exported",
        category: "evidence_versioning",
        description:
          "FORGE_RESEARCHER_RISK_TRADEOFF_VERSION exported for risk trade-off harness",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "FORGE_RESEARCHER_RISK_TRADEOFF_VERSION exported for risk trade-off harness",
      },
    ],
  },
  risk_signal: {
    category: "risk_signal",
    acceptance: {
      invariant:
        "Researcher prompt and parser surface explicit risk reporting with severity and mitigation.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rrto.researcher_risks_prompt",
        category: "risk_signal",
        description: "RESEARCHER_SYSTEM prompt requires RISKS with severity and mitigation",
        expected: "PASS",
        disposition: "observed",
        criterion: "RESEARCHER_SYSTEM prompt requires RISKS with severity and mitigation",
      },
      {
        id: "rrto.parse_research_risks",
        category: "risk_signal",
        description: "parseResearchResponse extracts RISKS field from researcher output",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseResearchResponse extracts RISKS field from researcher output",
      },
      {
        id: "rrto.researcher_block_critical",
        category: "risk_signal",
        description: "RESEARCHER_SYSTEM prompt declares BLOCK signal for critical infeasibility",
        expected: "PASS",
        disposition: "observed",
        criterion: "RESEARCHER_SYSTEM prompt declares BLOCK signal for critical infeasibility",
      },
    ],
  },
  tradeoff_signal: {
    category: "tradeoff_signal",
    acceptance: {
      invariant:
        "Researcher trade-off analysis requires structured output and parser exports trade-off dimensions.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rrto.researcher_tradeoffs_responsibility",
        category: "tradeoff_signal",
        description:
          "RESEARCHER_SYSTEM responsibility section requires tradeoff analysis between approaches",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "RESEARCHER_SYSTEM responsibility section requires tradeoff analysis between approaches",
      },
      {
        id: "rrto.researcher_tradeoffs_output_field",
        category: "tradeoff_signal",
        description: "RESEARCHER output format declares dedicated TRADEOFFS section",
        expected: "PASS",
        disposition: "observed",
        criterion: "RESEARCHER output format declares dedicated TRADEOFFS section",
      },
      {
        id: "rrto.parse_research_tradeoffs",
        category: "tradeoff_signal",
        description:
          "parseResearchTradeoffs exports structured trade-off dimensions from researcher output",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "parseResearchTradeoffs exports structured trade-off dimensions from researcher output",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Risk trade-off baseline links to sealed P04-B06 contradiction freshness block gate handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rrto.b06_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P04_B06_TO_B07_HANDOFF_V1 targets P04-B07-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P04_B06_TO_B07_HANDOFF_V1 targets P04-B07-A01 entry atom",
      },
      {
        id: "rrto.b06_sealed_contradiction_probes",
        category: "baseline_link",
        description:
          "P04-B06→B07 handoff sealed probeCount matches active contradiction freshness contract",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "P04-B06→B07 handoff sealed probeCount matches active contradiction freshness contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Risk trade-off boundary assessment rejects invalid input; probe runner and documented gaps wired.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rrto.source_block_gate_ref",
        category: "boundary",
        description:
          "Baseline fixture references sealed P04-B06 contradiction freshness block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Baseline fixture references sealed P04-B06 contradiction freshness block gate source artifacts",
      },
      {
        id: "rrto.probe_runner_exported",
        category: "boundary",
        description: "runResearcherRiskTradeoffProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runResearcherRiskTradeoffProbes executes contract-wired probe matrix",
      },
      {
        id: "rrto.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL risk trade-off gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL risk trade-off gap",
      },
      {
        id: "rrto.empty_research_input_boundary",
        category: "boundary",
        description: "assessResearchRiskTradeoffInputBoundary rejects empty research parse input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessResearchRiskTradeoffInputBoundary rejects empty research parse input",
      },
      {
        id: "rrto.whitespace_research_input_boundary",
        category: "boundary",
        description:
          "assessResearchRiskTradeoffInputBoundary rejects whitespace-only research parse input",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessResearchRiskTradeoffInputBoundary rejects whitespace-only research parse input",
      },
      {
        id: "rrto.long_research_input_truncation_boundary",
        category: "boundary",
        description:
          "assessResearchRiskTradeoffInputBoundary truncates research input exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessResearchRiskTradeoffInputBoundary truncates research input exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Invalid fixture versions and null-byte research input are rejected safely.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rrto.invalid_version_rejected",
        category: "failure_path",
        description: "validateResearcherRiskTradeoffBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateResearcherRiskTradeoffBaseline rejects unexpected fixture version",
      },
      {
        id: "rrto.malformed_research_guard",
        category: "failure_path",
        description: "assessResearchRiskTradeoffInputBoundary rejects null-byte research input safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessResearchRiskTradeoffInputBoundary rejects null-byte research input safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Recovery paths restructure malformed risk/trade-off parses into actionable research plans.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rrto.recovery_risk_tradeoff_repair",
        category: "recovery_path",
        description:
          "recoverResearchRiskTradeoffEvidence restructures failed risk/trade-off parse into actionable research plan",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "recoverResearchRiskTradeoffEvidence restructures failed risk/trade-off parse into actionable research plan",
      },
      {
        id: "rrto.recovery_tradeoff_dimension_fallback",
        category: "recovery_path",
        description:
          "Risk trade-off recovery infers trade-off dimensions when explicit TRADEOFF marker is missing",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "Risk trade-off recovery infers trade-off dimensions when explicit TRADEOFF marker is missing",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Orchestrator risk/trade-off gate and validator exports gate pre-worker NO-GO wiring.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rrto.orchestrator_risk_tradeoff_gate",
        category: "nogo_path",
        description:
          "Orchestrator validates researcher risk and trade-off completeness before worker handoff",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Orchestrator validates researcher risk and trade-off completeness before worker handoff",
      },
      {
        id: "rrto.exported_risk_tradeoff_validator",
        category: "nogo_path",
        description:
          "validateResearchRiskTradeoff exported for orchestrator pre-worker research checks",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "validateResearchRiskTradeoff exported for orchestrator pre-worker research checks",
      },
    ],
  },
};

export const FORGE_RESEARCHER_RISK_TRADEOFF_CONTRACT_V1: ResearcherRiskTradeoffContract = {
  version: "1.0.0",
  atom: "P04-B07-A06",
  purpose:
    "Typed risk trade-off contract declaring measurable risk, trade-off and guard probes.",
  categories: RESEARCHER_RISK_TRADEOFF_CATEGORY_CONTRACTS,
  probes: flattenRiskTradeoffCategoryProbes(RESEARCHER_RISK_TRADEOFF_CATEGORY_CONTRACTS),
};

export function getActiveResearcherRiskTradeoffContract(): ResearcherRiskTradeoffContract {
  return FORGE_RESEARCHER_RISK_TRADEOFF_CONTRACT_V1;
}

export function getResearcherRiskTradeoffCategoryContract(
  category: ResearcherRiskTradeoffCategory,
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
): ResearcherRiskTradeoffCategoryContract {
  return contract.categories[category];
}

export function listResearcherRiskTradeoffContractProbeIds(
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listResearcherRiskTradeoffProbesByDisposition(
  disposition: ResearcherRiskTradeoffProbeDisposition,
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
): ResearcherRiskTradeoffProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listResearcherRiskTradeoffContractProbesByCategory(
  category: ResearcherRiskTradeoffCategory,
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
): readonly ResearcherRiskTradeoffProbeContract[] {
  return [...contract.categories[category].probes];
}

export interface ResearcherRiskTradeoffContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: ResearcherRiskTradeoffCategory;
  detail: string;
}

export interface ResearcherRiskTradeoffContractCoverageResult {
  valid: boolean;
  issues: ResearcherRiskTradeoffContractCoverageIssue[];
}

export function validateResearcherRiskTradeoffContractCoverage(
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
): ResearcherRiskTradeoffContractCoverageResult {
  const issues: ResearcherRiskTradeoffContractCoverageIssue[] = [];

  for (const category of RESEARCHER_RISK_TRADEOFF_CATEGORIES) {
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
      RESEARCHER_RISK_TRADEOFF_A01_MIN_PROBES[category]
    ) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${RESEARCHER_RISK_TRADEOFF_A01_MIN_PROBES[category]}`,
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

  const ids = listResearcherRiskTradeoffContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeResearcherRiskTradeoffContractCoverage(contract);
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
    if (!probe.id.startsWith("rrto.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing rrto. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateResearcherRiskTradeoffContract(
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
): ResearcherRiskTradeoffContractCoverageResult {
  return validateResearcherRiskTradeoffContractCoverage(contract);
}

export function summarizeResearcherRiskTradeoffContractCoverage(
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<
    ResearcherRiskTradeoffCategory,
    { probeCount: number; invariant: string }
  >;
  byDisposition: Record<ResearcherRiskTradeoffProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    ResearcherRiskTradeoffCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<ResearcherRiskTradeoffProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of RESEARCHER_RISK_TRADEOFF_CATEGORIES) {
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

export function validateResearcherRiskTradeoffAgainstContract(
  fixture: ResearcherRiskTradeoffBaseline,
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
): ResearcherRiskTradeoffValidationResult {
  const issues: ResearcherRiskTradeoffValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of RESEARCHER_RISK_TRADEOFF_CATEGORIES) {
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

export const FORGE_RESEARCHER_RISK_TRADEOFF_A01_PROBE_MATRIX: readonly ResearcherRiskTradeoffFixtureEntry[] =
  researcherRiskTradeoffBaseline.probes as ResearcherRiskTradeoffFixtureEntry[];

export function loadResearcherRiskTradeoffBaseline(): ResearcherRiskTradeoffBaseline {
  return researcherRiskTradeoffBaseline as ResearcherRiskTradeoffBaseline;
}

export function validateResearcherRiskTradeoffBaseline(
  fixture: ResearcherRiskTradeoffBaseline,
): ResearcherRiskTradeoffValidationResult {
  const issues: ResearcherRiskTradeoffValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P04-B07-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    RESEARCHER_RISK_TRADEOFF_CATEGORIES.map(category => [category, 0]),
  ) as Record<ResearcherRiskTradeoffCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of RESEARCHER_RISK_TRADEOFF_CATEGORIES) {
    const min = RESEARCHER_RISK_TRADEOFF_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_RESEARCHER_RISK_TRADEOFF_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_RESEARCHER_RISK_TRADEOFF_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_RESEARCHER_RISK_TRADEOFF_A01_PROBE_MATRIX) {
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

  const handoff = getForgeP04B06ToB07Handoff();
  const contradictionCoverage = summarizeResearcherContradictionFreshnessContractCoverage(
    getActiveResearcherContradictionFreshnessContract(),
  );

  if (fixture.sourceBlockGate.atom !== "P04-B06-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P04-B06-A10`,
    });
  }
  if (
    fixture.sourceBlockGate.contractVersion !==
    FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_CONTRACT_V1.version
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.contractVersion=${fixture.sourceBlockGate.contractVersion} ` +
        `expected=${FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_CONTRACT_V1.version}`,
    });
  }
  if (
    fixture.sourceBlockGate.contradictionFreshnessProbeCount !== contradictionCoverage.totalProbes
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.contradictionFreshnessProbeCount=${fixture.sourceBlockGate.contradictionFreshnessProbeCount} ` +
        `contract=${contradictionCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P04_B06_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P04_B06_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P04-B07-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `B06 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P04-B07-A01`,
    });
  }

  const contractAlignment = validateResearcherRiskTradeoffAgainstContract(
    fixture,
    getActiveResearcherRiskTradeoffContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeResearcherRiskTradeoffMatrix(
  results: ResearcherRiskTradeoffProbeResult[],
): ResearcherRiskTradeoffProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as ResearcherRiskTradeoffProbeSummary["byCategory"];
  for (const category of RESEARCHER_RISK_TRADEOFF_CATEGORIES) {
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

export function listResearcherRiskTradeoffProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherRiskTradeoffBaseline = loadResearcherRiskTradeoffBaseline(),
): ResearcherRiskTradeoffFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listResearcherRiskTradeoffKnownGaps(
  results: ResearcherRiskTradeoffProbeResult[],
): ResearcherRiskTradeoffProbeResult[] {
  return summarizeResearcherRiskTradeoffMatrix(results).knownGaps;
}

export interface ResearcherRiskTradeoffProbeMatrixValidationIssue {
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

export interface ResearcherRiskTradeoffProbeMatrixValidationResult {
  valid: boolean;
  issues: ResearcherRiskTradeoffProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

export function validateResearcherRiskTradeoffProbeMatrix(
  results: ResearcherRiskTradeoffProbeResult[],
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
): ResearcherRiskTradeoffProbeMatrixValidationResult {
  const issues: ResearcherRiskTradeoffProbeMatrixValidationIssue[] = [];
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

function readSrc(relativePath: string): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(dir, relativePath), "utf8");
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: ResearcherRiskTradeoffCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
): ResearcherRiskTradeoffProbeResult {
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
  return readSrc("forge-p04-researcher-risk-tradeoff.ts");
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

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionSource());
}

const SAMPLE_RESEARCH_OUTPUT = `RESEARCH_QUESTIONS:
1. What are the latency trade-offs between sync and async execution?
FINDINGS: Async execution reduces blocking but adds complexity.
SOURCES: https://example.com/async-patterns
RELEVANCE: 0.85
RISKS: Increased complexity (medium) — mitigate with bounded concurrency limits`;

function runSingleProbe(
  id: string,
  category: ResearcherRiskTradeoffCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherRiskTradeoffBaseline,
): ResearcherRiskTradeoffProbeResult {
  switch (id) {
    case "rrto.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "rrto.atom_tagged": {
      const ok = fixture.atom === "P04-B07-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "rrto.harness_version_exported": {
      const ok = FORGE_RESEARCHER_RISK_TRADEOFF_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_RESEARCHER_RISK_TRADEOFF_VERSION}`,
      );
    }
    case "rrto.researcher_risks_prompt": {
      const section = researcherFormatSection();
      const ok =
        section.includes("RISKS: [specific risks with severity and mitigation") &&
        section.includes("Every risk must include severity AND mitigation suggestion");
      return probe(id, category, expected, ok, `risksPrompt=${ok}`);
    }
    case "rrto.parse_research_risks": {
      const parser = readSrc("parser.ts");
      const parsed = parseResearchResponse(SAMPLE_RESEARCH_OUTPUT);
      const ok =
        parsed.ok &&
        parsed.data.risks.includes("complexity") &&
        parser.includes('extractField(text, "RISKS"');
      return probe(id, category, expected, ok, `parseRisks=${ok}`);
    }
    case "rrto.researcher_block_critical": {
      const section = researcherFormatSection();
      const ok =
        section.includes("You CAN block the Strategist") &&
        section.includes("CRITICAL issue");
      return probe(id, category, expected, ok, `blockCritical=${ok}`);
    }
    case "rrto.researcher_tradeoffs_responsibility": {
      const section = researcherFormatSection();
      const ok =
        section.includes("What are the tradeoffs between approaches?") ||
        section.toLowerCase().includes("tradeoff");
      return probe(id, category, expected, ok, `tradeoffsResponsibility=${ok}`);
    }
    case "rrto.researcher_tradeoffs_output_field": {
      const section = researcherFormatSection();
      const ok = /TRADEOFFS:/i.test(section);
      return probe(id, category, expected, ok, `tradeoffsOutputField=${ok}`);
    }
    case "rrto.parse_research_tradeoffs": {
      const parser = readSrc("parser.ts");
      const sample = `${SAMPLE_RESEARCH_OUTPUT}
TRADEOFFS:
1. sync vs async latency`;
      const parsed = parseResearchTradeoffs(sample);
      const ok =
        /\bexport function parseResearchTradeoffs\b/.test(parser) &&
        parsed.ok &&
        parsed.data.dimensions.length >= 1;
      return probe(id, category, expected, ok, `parseResearchTradeoffs=${ok}`);
    }
    case "rrto.b06_block_handoff_entry": {
      const handoff = getForgeP04B06ToB07Handoff();
      const ok =
        handoff.targetBlock.blockId === "P04-B07" &&
        handoff.targetBlock.entryAtom === "P04-B07-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "rrto.b06_sealed_contradiction_probes": {
      const handoff = getForgeP04B06ToB07Handoff();
      const coverage = summarizeResearcherContradictionFreshnessContractCoverage(
        getActiveResearcherContradictionFreshnessContract(),
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
    case "rrto.source_block_gate_ref": {
      const handoff = getForgeP04B06ToB07Handoff();
      const coverage = summarizeResearcherContradictionFreshnessContractCoverage(
        getActiveResearcherContradictionFreshnessContract(),
      );
      const ok =
        fixture.sourceBlockGate.atom === "P04-B06-A10" &&
        fixture.sourceBlockGate.contradictionFreshnessProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P04_B06_SEALED_ATOM_COUNT &&
        handoff.atom === "P04-B06-A10";
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.contradictionFreshnessProbeCount}`,
      );
    }
    case "rrto.probe_runner_exported": {
      const ok = productionSource().includes("export function runResearcherRiskTradeoffProbes");
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "rrto.known_gaps_documented": {
      const contract = getActiveResearcherRiskTradeoffContract();
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
    case "rrto.empty_research_input_boundary": {
      const result = assessResearchRiskTradeoffInputBoundary("");
      const ok =
        hasProductionExport("assessResearchRiskTradeoffInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false;
      return probe(id, category, expected, ok, `emptyBoundary=${result.disposition}`);
    }
    case "rrto.whitespace_research_input_boundary": {
      const result = assessResearchRiskTradeoffInputBoundary("   \t\n  ");
      const ok = result.disposition === "whitespace_only" && result.acceptable === false;
      return probe(id, category, expected, ok, `whitespaceBoundary=${result.disposition}`);
    }
    case "rrto.long_research_input_truncation_boundary": {
      const longInput = "x".repeat(RESEARCHER_RISK_TRADEOFF_INPUT_MAX_LENGTH + 500);
      const result = assessResearchRiskTradeoffInputBoundary(longInput);
      const ok =
        result.acceptable === true &&
        result.truncated === true &&
        result.normalizedInput.length === RESEARCHER_RISK_TRADEOFF_INPUT_MAX_LENGTH;
      return probe(id, category, expected, ok, `truncated=${result.truncated}`);
    }
    case "rrto.invalid_version_rejected": {
      const badFixture = {
        ...fixture,
        version: "9.9.9",
      } as ResearcherRiskTradeoffBaseline;
      const validation = validateResearcherRiskTradeoffBaseline(badFixture);
      const ok = validation.valid === false;
      return probe(id, category, expected, ok, `invalidVersionRejected=${ok}`);
    }
    case "rrto.malformed_research_guard": {
      const result = assessResearchRiskTradeoffInputBoundary("research\0parse");
      const ok = result.disposition === "contains_null_byte" && result.acceptable === false;
      return probe(id, category, expected, ok, `nullByteGuard=${result.disposition}`);
    }
    case "rrto.recovery_risk_tradeoff_repair": {
      const malformed = `RISK: Unbounded concurrency (high)
tradeoff: latency vs throughput
FINDINGS: partial parse`;
      const recovery = recoverResearchRiskTradeoffEvidence(malformed);
      const ok =
        recovery.recovered === true &&
        recovery.researchPlan.risks.length >= 1 &&
        recovery.researchPlan.tradeoffs.length >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `recovered=${recovery.recovered}, risks=${recovery.researchPlan.risks.length}, tradeoffs=${recovery.researchPlan.tradeoffs.length}`,
      );
    }
    case "rrto.recovery_tradeoff_dimension_fallback": {
      const malformed = "Approach A vs Approach B for deployment speed";
      const recovery = recoverResearchRiskTradeoffEvidence(malformed);
      const ok =
        recovery.recovered === true &&
        recovery.researchPlan.tradeoffs.some(t => t.toLowerCase().includes("approach"));
      return probe(
        id,
        category,
        expected,
        ok,
        `fallbackTradeoffs=${recovery.researchPlan.tradeoffs.join("; ")}`,
      );
    }
    case "rrto.orchestrator_risk_tradeoff_gate": {
      const orchestrator = readSrc("orchestrator.ts");
      const ok =
        orchestrator.includes("validateResearchRiskTradeoff(") ||
        orchestrator.includes("verifyResearchRiskTradeoff");
      return probe(id, category, expected, ok, `orchestratorGate=${ok}`);
    }
    case "rrto.exported_risk_tradeoff_validator": {
      const ok = hasProductionExport("validateResearchRiskTradeoff");
      return probe(id, category, expected, ok, `riskTradeoffValidator=${ok}`);
    }
    default:
      return probe(id, category, expected, false, `unknown probe ${id}`);
  }
}

export function runResearcherRiskTradeoffProbes(
  fixture: ResearcherRiskTradeoffBaseline = loadResearcherRiskTradeoffBaseline(),
): ResearcherRiskTradeoffProbeResult[] {
  const contract = getActiveResearcherRiskTradeoffContract();
  return fixture.probes.map(entry => {
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion ? { ...result, criterion: contractProbe.criterion } : result;
  });
}

export interface ResearcherRiskTradeoffProductionSliceResult {
  atom: "P04-B07-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: ResearcherRiskTradeoffProbeResult[];
  summary: ResearcherRiskTradeoffProbeSummary;
  matrixValidation: ResearcherRiskTradeoffProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: parseResearchTradeoffs and validateResearchRiskTradeoff
 * wired to contract probe execution with zero unexpected mismatches.
 */
export function runResearcherRiskTradeoffProductionSlice(
  fixture: ResearcherRiskTradeoffBaseline = loadResearcherRiskTradeoffBaseline(),
): ResearcherRiskTradeoffProductionSliceResult {
  const contract = getActiveResearcherRiskTradeoffContract();
  const fixtureValidation = validateResearcherRiskTradeoffBaseline(fixture);
  const contractValidation = validateResearcherRiskTradeoffAgainstContract(fixture, contract);
  const results = runResearcherRiskTradeoffProbes(fixture);
  const summary = summarizeResearcherRiskTradeoffMatrix(results);
  const matrixValidation = validateResearcherRiskTradeoffProbeMatrix(results, contract);

  return {
    atom: "P04-B07-A03",
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
export function validateResearcherRiskTradeoffBoundaryProbeMatrix(
  results: ResearcherRiskTradeoffProbeResult[],
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
): ResearcherRiskTradeoffProbeMatrixValidationResult {
  const boundaryProbes = listResearcherRiskTradeoffContractProbesByCategory(
    "boundary",
    contract,
  );
  const boundaryContract: ResearcherRiskTradeoffContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateResearcherRiskTradeoffProbeMatrix(boundaryResults, boundaryContract);
}

export interface ResearcherRiskTradeoffBoundarySliceResult {
  atom: "P04-B07-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherRiskTradeoffProbeResult[];
  boundaryResults: ResearcherRiskTradeoffProbeResult[];
  matrixValidation: ResearcherRiskTradeoffProbeMatrixValidationResult;
}

/**
 * A04 boundary slice: contract-wired boundary probes (research input edge cases, probe runner,
 * documented gaps) with zero unexpected mismatches.
 */
export function runResearcherRiskTradeoffBoundarySlice(
  fixture: ResearcherRiskTradeoffBaseline = loadResearcherRiskTradeoffBaseline(),
): ResearcherRiskTradeoffBoundarySliceResult {
  const contract = getActiveResearcherRiskTradeoffContract();
  const results = runResearcherRiskTradeoffProbes(fixture);
  const boundaryProbes = listResearcherRiskTradeoffContractProbesByCategory(
    "boundary",
    contract,
  );
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateResearcherRiskTradeoffBoundaryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B07-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const RESEARCHER_RISK_TRADEOFF_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly ResearcherRiskTradeoffCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes must align; zero unexpected mismatches.
 */
export function validateResearcherRiskTradeoffFailureRecoveryProbeMatrix(
  results: ResearcherRiskTradeoffProbeResult[],
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
): ResearcherRiskTradeoffProbeMatrixValidationResult {
  const failureRecoveryProbes = RESEARCHER_RISK_TRADEOFF_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherRiskTradeoffContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: ResearcherRiskTradeoffContract = {
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
  return validateResearcherRiskTradeoffProbeMatrix(
    failureRecoveryResults,
    failureRecoveryContract,
  );
}

export function listResearcherRiskTradeoffFailureRecoveryProbeIds(
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
): string[] {
  return RESEARCHER_RISK_TRADEOFF_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listResearcherRiskTradeoffContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface ResearcherRiskTradeoffFailureRecoverySliceResult {
  atom: "P04-B07-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherRiskTradeoffProbeResult[];
  failureRecoveryResults: ResearcherRiskTradeoffProbeResult[];
  matrixValidation: ResearcherRiskTradeoffProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes (invalid fixture rejection, null-byte guard, recoverResearchRiskTradeoffEvidence,
 * trade-off dimension fallback, validateResearchRiskTradeoff orchestrator NO-GO wiring)
 * with zero unexpected mismatches.
 */
export function runResearcherRiskTradeoffFailureRecoverySlice(
  fixture: ResearcherRiskTradeoffBaseline = loadResearcherRiskTradeoffBaseline(),
): ResearcherRiskTradeoffFailureRecoverySliceResult {
  const contract = getActiveResearcherRiskTradeoffContract();
  const results = runResearcherRiskTradeoffProbes(fixture);
  const failureRecoveryProbes = RESEARCHER_RISK_TRADEOFF_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherRiskTradeoffContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateResearcherRiskTradeoffFailureRecoveryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B07-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

/** Per-probe evidence entry — disposition, criterion and aligned outcomes (P04-B07-A06). */
export interface ResearcherRiskTradeoffProbeEvidence {
  probeId: string;
  category: ResearcherRiskTradeoffCategory;
  disposition: ResearcherRiskTradeoffProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for risk trade-off runs (P04-B07-A06). */
export interface ResearcherRiskTradeoffProbeTelemetry {
  probeId: string;
  category: ResearcherRiskTradeoffCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P04-B07-A06). */
export interface ResearcherRiskTradeoffProvenance {
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
  sliceCategories?: readonly ResearcherRiskTradeoffCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated risk trade-off run record bundling evidence, telemetry and provenance. */
export interface ResearcherRiskTradeoffRunRecord {
  provenance: ResearcherRiskTradeoffProvenance;
  evidence: ResearcherRiskTradeoffProbeEvidence[];
  telemetry: ResearcherRiskTradeoffProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<ResearcherRiskTradeoffCategory, number>;
    byDisposition: Record<ResearcherRiskTradeoffProbeDisposition, number>;
  };
}

export interface ResearcherRiskTradeoffRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface ResearcherRiskTradeoffRunValidationResult {
  valid: boolean;
  issues: ResearcherRiskTradeoffRunValidationIssue[];
}

export function buildResearcherRiskTradeoffProbeEvidence(
  probeId: string,
  category: ResearcherRiskTradeoffCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: ResearcherRiskTradeoffProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): ResearcherRiskTradeoffProbeEvidence {
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

export function buildResearcherRiskTradeoffProbeTelemetry(
  probeId: string,
  category: ResearcherRiskTradeoffCategory,
  sequenceIndex: number,
  durationMs: number,
): ResearcherRiskTradeoffProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildResearcherRiskTradeoffProvenance(
  runId: string,
  fixture: ResearcherRiskTradeoffBaseline,
  contract: ResearcherRiskTradeoffContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly ResearcherRiskTradeoffCategory[];
  },
): ResearcherRiskTradeoffProvenance {
  return {
    runId,
    harnessVersion: FORGE_RESEARCHER_RISK_TRADEOFF_VERSION,
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

export function buildResearcherRiskTradeoffRunRecord(
  provenance: ResearcherRiskTradeoffProvenance,
  evidence: ResearcherRiskTradeoffProbeEvidence[],
  telemetry: ResearcherRiskTradeoffProbeTelemetry[],
): ResearcherRiskTradeoffRunRecord {
  const byCategory = {} as Record<ResearcherRiskTradeoffCategory, number>;
  const byDisposition: Record<ResearcherRiskTradeoffProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of RESEARCHER_RISK_TRADEOFF_CATEGORIES) {
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

function validateResearcherRiskTradeoffRunRecordAgainstProbeIds(
  record: ResearcherRiskTradeoffRunRecord,
  expectedProbeIds: string[],
  contract: ResearcherRiskTradeoffContract,
): ResearcherRiskTradeoffRunValidationResult {
  const issues: ResearcherRiskTradeoffRunValidationIssue[] = [];
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

export function validateResearcherRiskTradeoffRunRecord(
  record: ResearcherRiskTradeoffRunRecord,
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
): ResearcherRiskTradeoffRunValidationResult {
  return validateResearcherRiskTradeoffRunRecordAgainstProbeIds(
    record,
    listResearcherRiskTradeoffContractProbeIds(contract),
    contract,
  );
}

/** Validate evidence slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateResearcherRiskTradeoffEvidenceRunRecord(
  record: ResearcherRiskTradeoffRunRecord,
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
): ResearcherRiskTradeoffRunValidationResult {
  const issues: ResearcherRiskTradeoffRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P04-B07-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P04-B07-A06`,
    });
  }

  const expectedCategories = [...RESEARCHER_RISK_TRADEOFF_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateResearcherRiskTradeoffRunRecordAgainstProbeIds(
    record,
    listResearcherRiskTradeoffFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

export interface ResearcherRiskTradeoffEvidenceSliceResult {
  atom: "P04-B07-A06";
  evidenceProbeCount: number;
  matrixValid: boolean;
  recordValid: boolean;
  results: ResearcherRiskTradeoffProbeResult[];
  evidenceResults: ResearcherRiskTradeoffProbeResult[];
  matrixValidation: ResearcherRiskTradeoffProbeMatrixValidationResult;
  record: ResearcherRiskTradeoffRunRecord;
  recordValidation: ResearcherRiskTradeoffRunValidationResult;
}

function resolveResearcherRiskTradeoffGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function runResearcherRiskTradeoffProbeWithTiming(
  entry: ResearcherRiskTradeoffFixtureEntry,
  fixture: ResearcherRiskTradeoffBaseline,
  contractProbe: ResearcherRiskTradeoffProbeContract | undefined,
): {
  result: ResearcherRiskTradeoffProbeResult;
  durationMs: number;
  disposition: ResearcherRiskTradeoffProbeDisposition;
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

function buildResearcherRiskTradeoffRecordFromEntries(
  entries: ResearcherRiskTradeoffFixtureEntry[],
  fixture: ResearcherRiskTradeoffBaseline,
  contract: ResearcherRiskTradeoffContract,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly ResearcherRiskTradeoffCategory[];
  },
): ResearcherRiskTradeoffRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ResearcherRiskTradeoffProbeEvidence[] = [];
  const telemetry: ResearcherRiskTradeoffProbeTelemetry[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runResearcherRiskTradeoffProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildResearcherRiskTradeoffProbeEvidence(
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
      buildResearcherRiskTradeoffProbeTelemetry(
        result.id,
        result.category,
        sequenceIndex,
        durationMs,
      ),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildResearcherRiskTradeoffProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveResearcherRiskTradeoffGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildResearcherRiskTradeoffRunRecord(provenance, evidence, telemetry);
}

/** Run all risk trade-off probes and emit auditable evidence, telemetry and provenance (P04-B07-A06). */
export function runResearcherRiskTradeoffProbesWithRecord(
  fixture: ResearcherRiskTradeoffBaseline = loadResearcherRiskTradeoffBaseline(),
): ResearcherRiskTradeoffRunRecord {
  const contract = getActiveResearcherRiskTradeoffContract();
  return buildResearcherRiskTradeoffRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P04-B07-A06). */
export function runResearcherRiskTradeoffFailureRecoverySliceWithRecord(
  fixture: ResearcherRiskTradeoffBaseline = loadResearcherRiskTradeoffBaseline(),
): ResearcherRiskTradeoffRunRecord {
  const contract = getActiveResearcherRiskTradeoffContract();
  const failureRecoveryIds = new Set(
    listResearcherRiskTradeoffFailureRecoveryProbeIds(contract),
  );
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildResearcherRiskTradeoffRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P04-B07-A06",
    sliceCategories: RESEARCHER_RISK_TRADEOFF_FAILURE_RECOVERY_CATEGORIES,
  });
}

/**
 * A06 evidence slice: contract-wired failure_path, recovery_path, and nogo_path probes
 * with auditable evidence, telemetry and provenance — zero unexpected mismatches.
 */
export function runResearcherRiskTradeoffEvidenceSlice(
  fixture: ResearcherRiskTradeoffBaseline = loadResearcherRiskTradeoffBaseline(),
): ResearcherRiskTradeoffEvidenceSliceResult {
  const contract = getActiveResearcherRiskTradeoffContract();
  const results = runResearcherRiskTradeoffProbes(fixture);
  const failureRecoveryProbes = RESEARCHER_RISK_TRADEOFF_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherRiskTradeoffContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const evidenceResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateResearcherRiskTradeoffFailureRecoveryProbeMatrix(
    results,
    contract,
  );
  const record = runResearcherRiskTradeoffFailureRecoverySliceWithRecord(fixture);
  const recordValidation = validateResearcherRiskTradeoffEvidenceRunRecord(record, contract);

  return {
    atom: "P04-B07-A06",
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

// ─── Property and fuzz validation (P04-B07-A07) ─────────────────────────────

export interface ResearcherRiskTradeoffPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface ResearcherRiskTradeoffPropertyResult {
  passed: number;
  failed: ResearcherRiskTradeoffPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type ResearcherRiskTradeoffPropertyCheck = {
  id: string;
  description: string;
  check: (contract: ResearcherRiskTradeoffContract) => string | null;
};

const RESEARCHER_RISK_TRADEOFF_STRUCTURAL_PROPERTIES: readonly ResearcherRiskTradeoffPropertyCheck[] =
  [
    {
      id: "categories_complete",
      description: "All eight risk trade-off categories are declared",
      check: contract => {
        for (const category of RESEARCHER_RISK_TRADEOFF_CATEGORIES) {
          if (!contract.categories[category]) return `missing category: ${category}`;
        }
        return null;
      },
    },
    {
      id: "probe_ids_unique",
      description: "Probe ids are globally unique",
      check: contract => {
        const ids = listResearcherRiskTradeoffContractProbeIds(contract);
        if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
        return null;
      },
    },
    {
      id: "min_probe_count",
      description: "Each category meets contract minProbeCount",
      check: contract => {
        for (const category of RESEARCHER_RISK_TRADEOFF_CATEGORIES) {
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
        "summarizeResearcherRiskTradeoffContractCoverage totals match listResearcherRiskTradeoffContractProbeIds",
      check: contract => {
        const summary = summarizeResearcherRiskTradeoffContractCoverage(contract);
        const ids = listResearcherRiskTradeoffContractProbeIds(contract);
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
      description: "Probe ids are namespaced with rrto. prefix",
      check: contract => {
        for (const probe of contract.probes) {
          if (!probe.id.startsWith("rrto.")) {
            return `${probe.id} missing rrto. prefix`;
          }
        }
        return null;
      },
    },
    {
      id: "run_record_summary_invariant",
      description: "Run record summary aligned + mismatches equals total",
      check: contract => {
        const fixture = loadResearcherRiskTradeoffBaseline();
        const probeIds = listResearcherRiskTradeoffContractProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildResearcherRiskTradeoffProbeEvidence(
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
          return buildResearcherRiskTradeoffProbeTelemetry(
            id,
            probe.category,
            index,
            index,
          );
        });
        const record = buildResearcherRiskTradeoffRunRecord(
          buildResearcherRiskTradeoffProvenance(
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
        "Synthetic failure/recovery slice record passes validateResearcherRiskTradeoffEvidenceRunRecord",
      check: contract => {
        const fixture = loadResearcherRiskTradeoffBaseline();
        const probeIds = listResearcherRiskTradeoffFailureRecoveryProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildResearcherRiskTradeoffProbeEvidence(
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
          return buildResearcherRiskTradeoffProbeTelemetry(
            id,
            probe.category,
            index,
            index * 0.5,
          );
        });
        const record = buildResearcherRiskTradeoffRunRecord(
          buildResearcherRiskTradeoffProvenance(
            "property-check-failure-recovery",
            fixture,
            contract,
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T00:00:01.000Z",
            probeIds.length,
            {
              sliceAtom: "P04-B07-A06",
              sliceCategories: RESEARCHER_RISK_TRADEOFF_FAILURE_RECOVERY_CATEGORIES,
            },
          ),
          evidence,
          telemetry,
        );
        const validation = validateResearcherRiskTradeoffEvidenceRunRecord(record, contract);
        if (!validation.valid) {
          return validation.issues.map(i => i.detail).join("; ");
        }
        return null;
      },
    },
  ] as const;

export function runResearcherRiskTradeoffPropertyValidation(
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
): ResearcherRiskTradeoffPropertyResult {
  const failed: ResearcherRiskTradeoffPropertyViolation[] = [];
  for (const property of RESEARCHER_RISK_TRADEOFF_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = RESEARCHER_RISK_TRADEOFF_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type ResearcherRiskTradeoffFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface ResearcherRiskTradeoffFuzzMutationCase {
  seed: number;
  kind: ResearcherRiskTradeoffFuzzMutationKind;
  probeId?: string;
  category?: ResearcherRiskTradeoffCategory;
}

export interface ResearcherRiskTradeoffFuzzValidationCaseResult {
  mutation: ResearcherRiskTradeoffFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface ResearcherRiskTradeoffFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: ResearcherRiskTradeoffFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createResearcherRiskTradeoffFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneResearcherRiskTradeoffBaseline(
  fixture: ResearcherRiskTradeoffBaseline,
): ResearcherRiskTradeoffBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickResearcherRiskTradeoffFuzzTarget(
  fixture: ResearcherRiskTradeoffBaseline,
  rng: () => number,
): {
  category: ResearcherRiskTradeoffCategory;
  index: number;
  entry: ResearcherRiskTradeoffFixtureEntry;
} {
  const category =
    RESEARCHER_RISK_TRADEOFF_CATEGORIES[
      Math.floor(rng() * RESEARCHER_RISK_TRADEOFF_CATEGORIES.length)
    ]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyResearcherRiskTradeoffFuzzMutation(
  fixture: ResearcherRiskTradeoffBaseline,
  mutation: ResearcherRiskTradeoffFuzzMutationCase,
): ResearcherRiskTradeoffBaseline {
  const mutated = cloneResearcherRiskTradeoffBaseline(fixture);
  const targetCategory = mutation.category ?? RESEARCHER_RISK_TRADEOFF_CATEGORIES[0]!;
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
          id: `rrto.fuzz.extra.${mutation.seed}`,
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
      const other = RESEARCHER_RISK_TRADEOFF_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateResearcherRiskTradeoffFuzzMutationCases(
  fixture: ResearcherRiskTradeoffBaseline,
  seed: number,
  iterations: number,
): ResearcherRiskTradeoffFuzzMutationCase[] {
  const rng = createResearcherRiskTradeoffFuzzRng(seed);
  const kinds: ResearcherRiskTradeoffFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: ResearcherRiskTradeoffFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickResearcherRiskTradeoffFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P04-B07-A07). */
export function runResearcherRiskTradeoffFuzzValidation(
  fixture: ResearcherRiskTradeoffBaseline,
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
  seed = 42,
  iterations = 24,
): ResearcherRiskTradeoffFuzzValidationResult {
  const cases = generateResearcherRiskTradeoffFuzzMutationCases(fixture, seed, iterations);
  const results: ResearcherRiskTradeoffFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyResearcherRiskTradeoffFuzzMutation(fixture, mutation);
    const validation = validateResearcherRiskTradeoffAgainstContract(mutated, contract);
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

export type ResearcherRiskTradeoffRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface ResearcherRiskTradeoffRunRecordFuzzCase {
  kind: ResearcherRiskTradeoffRunRecordFuzzKind;
  probeId?: string;
}

export function applyResearcherRiskTradeoffRunRecordFuzzMutation(
  record: ResearcherRiskTradeoffRunRecord,
  mutation: ResearcherRiskTradeoffRunRecordFuzzCase,
): ResearcherRiskTradeoffRunRecord {
  const cloned: ResearcherRiskTradeoffRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P04-B07-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["evidence_versioning"],
      };
      break;
  }

  cloned.summary = buildResearcherRiskTradeoffRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveResearcherRiskTradeoffRunRecordValidator(
  record: ResearcherRiskTradeoffRunRecord,
): (
  record: ResearcherRiskTradeoffRunRecord,
  contract: ResearcherRiskTradeoffContract,
) => ResearcherRiskTradeoffRunValidationResult {
  return record.provenance.sliceAtom === "P04-B07-A06"
    ? validateResearcherRiskTradeoffEvidenceRunRecord
    : validateResearcherRiskTradeoffRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P04-B07-A07). */
export function runResearcherRiskTradeoffRunRecordFuzzValidation(
  record: ResearcherRiskTradeoffRunRecord,
  contract: ResearcherRiskTradeoffContract = getActiveResearcherRiskTradeoffContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveResearcherRiskTradeoffRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: ResearcherRiskTradeoffRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P04-B07-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyResearcherRiskTradeoffRunRecordFuzzMutation(record, mutation);
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

export interface ResearcherRiskTradeoffPropertyFuzzSliceResult {
  atom: "P04-B07-A07";
  propertyChecksPassed: boolean;
  contractFuzzRejected: boolean;
  runRecordFuzzRejected: boolean;
  propertyResult: ResearcherRiskTradeoffPropertyResult;
  contractFuzz: ResearcherRiskTradeoffFuzzValidationResult;
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
export function runResearcherRiskTradeoffPropertyFuzzSlice(
  fixture: ResearcherRiskTradeoffBaseline = loadResearcherRiskTradeoffBaseline(),
): ResearcherRiskTradeoffPropertyFuzzSliceResult {
  const contract = getActiveResearcherRiskTradeoffContract();
  const propertyResult = runResearcherRiskTradeoffPropertyValidation(contract);
  const contractFuzz = runResearcherRiskTradeoffFuzzValidation(fixture, contract);
  const record = runResearcherRiskTradeoffFailureRecoverySliceWithRecord(fixture);
  const runRecordFuzz = runResearcherRiskTradeoffRunRecordFuzzValidation(record, contract);

  return {
    atom: "P04-B07-A07",
    propertyChecksPassed: propertyResult.allPassed,
    contractFuzzRejected: contractFuzz.allMutationsRejected,
    runRecordFuzzRejected: runRecordFuzz.mutationsAccepted === 0,
    propertyResult,
    contractFuzz,
    runRecordFuzz,
  };
}
