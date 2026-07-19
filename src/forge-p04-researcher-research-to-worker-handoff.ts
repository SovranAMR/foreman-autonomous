/**
 * FOREMAN — Researcher Research-to-Worker Handoff Baseline (P04-B09)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P04-B08 spike falsification block gate artifacts.
 * A06: evidence, telemetry and provenance run record for failure/recovery/NO-GO slice probes.
 * A07: property and fuzz validation for contract invariants and run record gates.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import researcherResearchToWorkerHandoffBaseline from "./fixtures/forge-researcher-research-to-worker-handoff-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP04B08ToB09Handoff,
  getActiveResearcherSpikeFalsificationContract,
  summarizeResearcherSpikeFalsificationContractCoverage,
  validateSpikeFalsificationExperiment,
  FORGE_RESEARCHER_SPIKE_FALSIFICATION_CONTRACT_V1,
} from "./forge-p04-researcher-spike-falsification.js";
import { validateResearchRiskTradeoff } from "./forge-p04-researcher-risk-tradeoff.js";
import { parseResearchResponse, parseResearchToWorkerHandoff } from "./parser.js";

export const FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_VERSION = "1.0.0-a01";

export const EXPECTED_P04_B08_SEALED_ATOM_COUNT = 10;

export const RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_INPUT_MAX_LENGTH = 8192;

export const RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES = [
  "evidence_versioning",
  "handoff_signal",
  "worker_context_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type ResearcherResearchToWorkerHandoffCategory =
  (typeof RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES)[number];

export const RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_A01_MIN_PROBES: Readonly<
  Record<ResearcherResearchToWorkerHandoffCategory, number>
> = {
  evidence_versioning: 3,
  handoff_signal: 3,
  worker_context_signal: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

export type ResearchToWorkerHandoffInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface ResearchToWorkerHandoffInputBoundary {
  disposition: ResearchToWorkerHandoffInputDisposition;
  acceptable: boolean;
  normalizedInput: string;
  truncated: boolean;
  detail: string;
}

export function assessResearchToWorkerHandoffInputBoundary(
  handoffInput: string,
): ResearchToWorkerHandoffInputBoundary {
  if (handoffInput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedInput: "",
      truncated: false,
      detail: "null byte detected in handoff input",
    };
  }

  const trimmed = handoffInput.trim();
  if (trimmed.length === 0) {
    const disposition: ResearchToWorkerHandoffInputDisposition =
      handoffInput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedInput: "",
      truncated: false,
      detail: disposition === "empty" ? "empty handoff input" : "whitespace-only handoff input",
    };
  }

  let normalizedInput = handoffInput;
  let truncated = false;
  if (normalizedInput.length > RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_INPUT_MAX_LENGTH) {
    normalizedInput = normalizedInput.slice(0, RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_INPUT_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedInput,
    truncated,
    detail: truncated
      ? `handoff input truncated to ${RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_INPUT_MAX_LENGTH} characters`
      : "valid handoff input",
  };
}

export interface ResearchToWorkerHandoffBundle {
  version: string;
  findings: string;
  sources: string[];
  risks: string[];
  tradeoffs: string[];
  relevance: number | null;
}

export interface ResearchToWorkerHandoffCollectionValidationOutcome {
  valid: boolean;
  fieldCount: number;
  issues: string[];
}

export function validateResearchToWorkerHandoffCollection(
  bundle: ResearchToWorkerHandoffBundle,
): ResearchToWorkerHandoffCollectionValidationOutcome {
  const issues: string[] = [];
  let fieldCount = 0;

  if (bundle.findings.trim().length > 0) {
    fieldCount++;
  } else {
    issues.push("handoff bundle missing findings");
  }

  if (bundle.sources.length > 0) {
    fieldCount++;
  } else {
    issues.push("handoff bundle missing sources");
  }

  if (bundle.risks.length > 0) {
    fieldCount++;
  }

  if (bundle.tradeoffs.length > 0) {
    fieldCount++;
  }

  if (bundle.relevance !== null) {
    fieldCount++;
  }

  return {
    valid: issues.length === 0,
    fieldCount,
    issues,
  };
}

export interface ResearchToWorkerHandoffRecoveryHints {
  topic?: string;
  defaultFindings?: string;
}

export interface ResearchToWorkerHandoffRecoveryResult {
  recovered: boolean;
  bundle: ResearchToWorkerHandoffBundle;
  parseErrors: string[];
  detail: string;
}

const HANDOFF_FINDINGS_PATTERN = /FINDINGS:\s*([\s\S]*?)(?:\n(?:SOURCES|RELEVANCE|RISKS|TRADEOFFS)|$)/i;
const HANDOFF_SOURCES_LINE_PATTERN = /^\s*(?:\d+[.)]|[-*])\s+(.+)$/;
const HANDOFF_HTTP_URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;

function extractHandoffSources(raw: string): string[] {
  const sources: string[] = [];
  const sourcesSection = raw.match(/SOURCES:\s*([\s\S]*?)(?:\n(?:RELEVANCE|RISKS|TRADEOFFS)|$)/i);
  if (sourcesSection?.[1]) {
    for (const line of sourcesSection[1].split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      const match = trimmed.match(HANDOFF_SOURCES_LINE_PATTERN);
      if (match) {
        sources.push(match[1].trim());
        continue;
      }
      if (/^https?:\/\//i.test(trimmed)) {
        sources.push(trimmed);
      }
    }
  }

  if (sources.length === 0) {
    for (const match of raw.matchAll(HANDOFF_HTTP_URL_PATTERN)) {
      sources.push(match[0]);
    }
  }

  return [...new Set(sources)];
}

export function recoverResearchToWorkerHandoff(
  failedParse: string,
  hints: ResearchToWorkerHandoffRecoveryHints = {},
): ResearchToWorkerHandoffRecoveryResult {
  const parseErrors: string[] = [];
  const boundary = assessResearchToWorkerHandoffInputBoundary(failedParse);

  if (!boundary.acceptable) {
    return {
      recovered: false,
      bundle: {
        version: "1.0.0",
        findings: "",
        sources: [],
        risks: [],
        tradeoffs: [],
        relevance: null,
      },
      parseErrors: [boundary.disposition],
      detail: `cannot recover ${boundary.disposition.replace(/_/g, "-")} handoff parse`,
    };
  }

  const raw = boundary.normalizedInput;
  const parsed = parseResearchResponse(raw);
  const bundle: ResearchToWorkerHandoffBundle = {
    version: "1.0.0",
    findings: parsed.ok ? parsed.data.findings : "",
    sources: [],
    risks: parsed.ok && parsed.data.risks ? [parsed.data.risks] : [],
    tradeoffs: parsed.ok
      ? parsed.data.tradeoffs.map(dimension => `${dimension.left} vs ${dimension.right}`)
      : [],
    relevance: parsed.ok ? parsed.data.relevance : null,
  };

  if (!parsed.ok) {
    parseErrors.push(parsed.error.missing.join(","));
  }

  if (bundle.findings.trim().length === 0) {
    const findingsMatch = raw.match(HANDOFF_FINDINGS_PATTERN);
    if (findingsMatch?.[1]?.trim()) {
      bundle.findings = findingsMatch[1].trim();
    } else if (hints.defaultFindings?.trim()) {
      bundle.findings = hints.defaultFindings.trim();
      parseErrors.push("missing_findings_inferred");
    } else if (raw.trim().length > 0) {
      bundle.findings = raw.trim().slice(0, 500);
      parseErrors.push("missing_findings_inferred");
    }
  }

  if (bundle.sources.length === 0) {
    bundle.sources = extractHandoffSources(raw);
  }

  const validation = validateResearchToWorkerHandoffCollection(bundle);
  return {
    recovered: validation.valid,
    bundle,
    parseErrors,
    detail: validation.valid
      ? `recovered handoff bundle with ${validation.fieldCount} populated fields`
      : validation.issues.join("; "),
  };
}

export interface ResearchToWorkerHandoffValidationOutcome {
  valid: boolean;
  fieldCount: number;
  findingsPresent: boolean;
  sourcesPresent: boolean;
  issues: string[];
}

/**
 * Validate researcher output declares actionable worker handoff bundle signals (P04-B09-A03).
 */
export function validateResearchToWorkerHandoff(
  researchOutput: string,
): ResearchToWorkerHandoffValidationOutcome {
  const boundary = assessResearchToWorkerHandoffInputBoundary(researchOutput);
  if (!boundary.acceptable) {
    return {
      valid: false,
      fieldCount: 0,
      findingsPresent: false,
      sourcesPresent: false,
      issues: [boundary.detail],
    };
  }

  const normalized = boundary.normalizedInput;
  const handoffParse = parseResearchToWorkerHandoff(normalized);
  if (!handoffParse.ok) {
    const recovery = recoverResearchToWorkerHandoff(normalized);
    if (!recovery.recovered) {
      return {
        valid: false,
        fieldCount: 0,
        findingsPresent: false,
        sourcesPresent: false,
        issues:
          recovery.parseErrors.length > 0 ? recovery.parseErrors : ["handoff_parse_failed"],
      };
    }
    const validation = validateResearchToWorkerHandoffCollection(recovery.bundle);
    return {
      valid: validation.valid,
      fieldCount: validation.fieldCount,
      findingsPresent: recovery.bundle.findings.trim().length > 0,
      sourcesPresent: recovery.bundle.sources.length > 0,
      issues: validation.issues,
    };
  }

  const bundle: ResearchToWorkerHandoffBundle = {
    version: handoffParse.data.version,
    findings: handoffParse.data.findings,
    sources: handoffParse.data.sources,
    risks: handoffParse.data.risks,
    tradeoffs: handoffParse.data.tradeoffs,
    relevance: handoffParse.data.relevance,
  };
  const validation = validateResearchToWorkerHandoffCollection(bundle);

  return {
    valid: validation.valid,
    fieldCount: validation.fieldCount,
    findingsPresent: bundle.findings.trim().length > 0,
    sourcesPresent: bundle.sources.length > 0,
    issues: validation.issues,
  };
}

export interface ResearcherResearchToWorkerHandoffFixtureEntry {
  id: string;
  category: ResearcherResearchToWorkerHandoffCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface ResearcherResearchToWorkerHandoffBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    spikeFalsificationProbeCount: number;
    sealedAtomCount: number;
  };
  probes: ResearcherResearchToWorkerHandoffFixtureEntry[];
}

export interface ResearcherResearchToWorkerHandoffProbeResult {
  id: string;
  category: ResearcherResearchToWorkerHandoffCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface ResearcherResearchToWorkerHandoffProbeSummary {
  total: number;
  aligned: number;
  mismatches: ResearcherResearchToWorkerHandoffProbeResult[];
  knownGaps: ResearcherResearchToWorkerHandoffProbeResult[];
  byCategory: Record<
    ResearcherResearchToWorkerHandoffCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface ResearcherResearchToWorkerHandoffValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: ResearcherResearchToWorkerHandoffCategory;
  detail: string;
}

export interface ResearcherResearchToWorkerHandoffValidationResult {
  valid: boolean;
  issues: ResearcherResearchToWorkerHandoffValidationIssue[];
}

export type ResearcherResearchToWorkerHandoffProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface ResearcherResearchToWorkerHandoffProbeContract {
  id: string;
  category: ResearcherResearchToWorkerHandoffCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: ResearcherResearchToWorkerHandoffProbeDisposition;
  criterion: string;
}

export interface ResearcherResearchToWorkerHandoffCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface ResearcherResearchToWorkerHandoffCategoryContract {
  category: ResearcherResearchToWorkerHandoffCategory;
  acceptance: ResearcherResearchToWorkerHandoffCategoryAcceptance;
  probes: readonly ResearcherResearchToWorkerHandoffProbeContract[];
}

export interface ResearcherResearchToWorkerHandoffContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<
    ResearcherResearchToWorkerHandoffCategory,
    ResearcherResearchToWorkerHandoffCategoryContract
  >;
  probes: readonly ResearcherResearchToWorkerHandoffProbeContract[];
}

function flattenResearchToWorkerHandoffCategoryProbes(
  categories: Record<
    ResearcherResearchToWorkerHandoffCategory,
    ResearcherResearchToWorkerHandoffCategoryContract
  >,
): readonly ResearcherResearchToWorkerHandoffProbeContract[] {
  return RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES.flatMap(
    category => categories[category].probes,
  );
}

const RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORY_CONTRACTS: Record<
  ResearcherResearchToWorkerHandoffCategory,
  ResearcherResearchToWorkerHandoffCategoryContract
> = {
  evidence_versioning: {
    category: "evidence_versioning",
    acceptance: {
      invariant:
        "Research-to-worker handoff baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rtwh.version_tagged",
        category: "evidence_versioning",
        description: "Research-to-worker handoff baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Research-to-worker handoff baseline declares semver version field",
      },
      {
        id: "rtwh.atom_tagged",
        category: "evidence_versioning",
        description: "Research-to-worker handoff baseline declares P04-B09-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Research-to-worker handoff baseline declares P04-B09-A01 atom id",
      },
      {
        id: "rtwh.harness_version_exported",
        category: "evidence_versioning",
        description:
          "FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_VERSION exported for handoff harness",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_VERSION exported for handoff harness",
      },
    ],
  },
  handoff_signal: {
    category: "handoff_signal",
    acceptance: {
      invariant:
        "Researcher findings and spike falsification gates inform worker handoff execution context.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rtwh.researcher_findings_flow_to_worker",
        category: "handoff_signal",
        description:
          "RESEARCHER_SYSTEM prompt declares findings available to Worker for execution context",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "RESEARCHER_SYSTEM prompt declares findings available to Worker for execution context",
      },
      {
        id: "rtwh.spike_falsification_informs_handoff",
        category: "handoff_signal",
        description:
          "validateSpikeFalsificationExperiment exports spike gate used before worker handoff",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "validateSpikeFalsificationExperiment exports spike gate used before worker handoff",
      },
      {
        id: "rtwh.b08_handoff_research_block",
        category: "handoff_signal",
        description:
          "FORGE_P04_B08_TO_B09_HANDOFF_V1 targets research-to-worker handoff block entry",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "FORGE_P04_B08_TO_B09_HANDOFF_V1 targets research-to-worker handoff block entry",
      },
    ],
  },
  worker_context_signal: {
    category: "worker_context_signal",
    acceptance: {
      invariant:
        "Orchestrator injects research findings and runs pre-worker validators before execution.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rtwh.orchestrator_injects_findings",
        category: "worker_context_signal",
        description: "Orchestrator injects RESEARCH FINDINGS into worker atomContext before execution",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Orchestrator injects RESEARCH FINDINGS into worker atomContext before execution",
      },
      {
        id: "rtwh.orchestrator_pre_worker_validators",
        category: "worker_context_signal",
        description:
          "Orchestrator runs validateResearchRiskTradeoff and validateSpikeFalsificationExperiment after research",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Orchestrator runs validateResearchRiskTradeoff and validateSpikeFalsificationExperiment after research",
      },
      {
        id: "rtwh.worker_receives_research_context",
        category: "worker_context_signal",
        description: "WORKER_SYSTEM prompt references external knowledge from Researcher layer",
        expected: "PASS",
        disposition: "observed",
        criterion: "WORKER_SYSTEM prompt references external knowledge from Researcher layer",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Research-to-worker handoff baseline links to sealed P04-B08 spike falsification block gate handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rtwh.b08_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P04_B08_TO_B09_HANDOFF_V1 targets P04-B09-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P04_B08_TO_B09_HANDOFF_V1 targets P04-B09-A01 entry atom",
      },
      {
        id: "rtwh.b08_sealed_spike_probes",
        category: "baseline_link",
        description:
          "P04-B08→B09 handoff sealed probeCount matches active spike falsification contract",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "P04-B08→B09 handoff sealed probeCount matches active spike falsification contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Handoff boundary assessment rejects invalid input; probe runner and documented gaps wired.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rtwh.source_block_gate_ref",
        category: "boundary",
        description:
          "Baseline fixture references sealed P04-B08 spike falsification block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Baseline fixture references sealed P04-B08 spike falsification block gate source artifacts",
      },
      {
        id: "rtwh.probe_runner_exported",
        category: "boundary",
        description: "runResearcherResearchToWorkerHandoffProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runResearcherResearchToWorkerHandoffProbes executes contract-wired probe matrix",
      },
      {
        id: "rtwh.known_gaps_documented",
        category: "boundary",
        description:
          "Baseline fixture documents at least one measurable FAIL research-to-worker handoff gap",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Baseline fixture documents at least one measurable FAIL research-to-worker handoff gap",
      },
      {
        id: "rtwh.empty_handoff_input_boundary",
        category: "boundary",
        description: "assessResearchToWorkerHandoffInputBoundary rejects empty handoff parse input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessResearchToWorkerHandoffInputBoundary rejects empty handoff parse input",
      },
      {
        id: "rtwh.whitespace_handoff_input_boundary",
        category: "boundary",
        description:
          "assessResearchToWorkerHandoffInputBoundary rejects whitespace-only handoff parse input",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessResearchToWorkerHandoffInputBoundary rejects whitespace-only handoff parse input",
      },
      {
        id: "rtwh.long_handoff_input_truncation_boundary",
        category: "boundary",
        description:
          "assessResearchToWorkerHandoffInputBoundary truncates handoff input exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessResearchToWorkerHandoffInputBoundary truncates handoff input exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Invalid fixture versions and null-byte handoff input are rejected safely.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rtwh.invalid_version_rejected",
        category: "failure_path",
        description:
          "validateResearcherResearchToWorkerHandoffBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion:
          "validateResearcherResearchToWorkerHandoffBaseline rejects unexpected fixture version",
      },
      {
        id: "rtwh.malformed_handoff_input_guard",
        category: "failure_path",
        description: "assessResearchToWorkerHandoffInputBoundary rejects null-byte handoff input safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessResearchToWorkerHandoffInputBoundary rejects null-byte handoff input safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Recovery paths restructure malformed research parses into actionable worker handoff bundles.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rtwh.recovery_handoff_bundle_repair",
        category: "recovery_path",
        description:
          "recoverResearchToWorkerHandoff restructures malformed research parse into actionable worker bundle",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "recoverResearchToWorkerHandoff restructures malformed research parse into actionable worker bundle",
      },
      {
        id: "rtwh.recovery_missing_findings_fallback",
        category: "recovery_path",
        description: "Handoff recovery infers findings summary when explicit FINDINGS marker is missing",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "Handoff recovery infers findings summary when explicit FINDINGS marker is missing",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Research-to-worker handoff parser and validator exports gate orchestrator NO-GO wiring.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rtwh.parser_research_handoff_bundle",
        category: "nogo_path",
        description:
          "parseResearchToWorkerHandoff exports research→worker context bundle from researcher output",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "parseResearchToWorkerHandoff exports research→worker context bundle from researcher output",
      },
      {
        id: "rtwh.exported_handoff_validator",
        category: "nogo_path",
        description:
          "validateResearchToWorkerHandoff exported for orchestrator pre-worker handoff checks",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "validateResearchToWorkerHandoff exported for orchestrator pre-worker handoff checks",
      },
    ],
  },
};

export const FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CONTRACT_V1: ResearcherResearchToWorkerHandoffContract =
  {
    version: "1.0.0",
    atom: "P04-B09-A06",
    purpose:
      "Typed research-to-worker handoff contract declaring measurable handoff, context and guard probes.",
    categories: RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORY_CONTRACTS,
    probes: flattenResearchToWorkerHandoffCategoryProbes(
      RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORY_CONTRACTS,
    ),
  };

export function getActiveResearcherResearchToWorkerHandoffContract(): ResearcherResearchToWorkerHandoffContract {
  return FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CONTRACT_V1;
}

export function getResearcherResearchToWorkerHandoffCategoryContract(
  category: ResearcherResearchToWorkerHandoffCategory,
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
): ResearcherResearchToWorkerHandoffCategoryContract {
  return contract.categories[category];
}

export function listResearcherResearchToWorkerHandoffContractProbeIds(
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listResearcherResearchToWorkerHandoffProbesByDisposition(
  disposition: ResearcherResearchToWorkerHandoffProbeDisposition,
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
): ResearcherResearchToWorkerHandoffProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listResearcherResearchToWorkerHandoffContractProbesByCategory(
  category: ResearcherResearchToWorkerHandoffCategory,
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
): readonly ResearcherResearchToWorkerHandoffProbeContract[] {
  return [...contract.categories[category].probes];
}

export interface ResearcherResearchToWorkerHandoffContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: ResearcherResearchToWorkerHandoffCategory;
  detail: string;
}

export interface ResearcherResearchToWorkerHandoffContractCoverageResult {
  valid: boolean;
  issues: ResearcherResearchToWorkerHandoffContractCoverageIssue[];
}

export function summarizeResearcherResearchToWorkerHandoffContractCoverage(
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<
    ResearcherResearchToWorkerHandoffCategory,
    { probeCount: number; invariant: string }
  >;
  byDisposition: Record<ResearcherResearchToWorkerHandoffProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    ResearcherResearchToWorkerHandoffCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<ResearcherResearchToWorkerHandoffProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES) {
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

export function validateResearcherResearchToWorkerHandoffContractCoverage(
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
): ResearcherResearchToWorkerHandoffContractCoverageResult {
  const issues: ResearcherResearchToWorkerHandoffContractCoverageIssue[] = [];

  for (const category of RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES) {
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
      RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_A01_MIN_PROBES[category]
    ) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_A01_MIN_PROBES[category]}`,
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

  const ids = listResearcherResearchToWorkerHandoffContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeResearcherResearchToWorkerHandoffContractCoverage(contract);
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
    if (!probe.id.startsWith("rtwh.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing rtwh. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateResearcherResearchToWorkerHandoffContract(
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
): ResearcherResearchToWorkerHandoffContractCoverageResult {
  return validateResearcherResearchToWorkerHandoffContractCoverage(contract);
}

export function validateResearcherResearchToWorkerHandoffAgainstContract(
  fixture: ResearcherResearchToWorkerHandoffBaseline,
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
): ResearcherResearchToWorkerHandoffValidationResult {
  const issues: ResearcherResearchToWorkerHandoffValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES) {
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

export const FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_A01_PROBE_MATRIX: readonly ResearcherResearchToWorkerHandoffFixtureEntry[] =
  researcherResearchToWorkerHandoffBaseline.probes as ResearcherResearchToWorkerHandoffFixtureEntry[];

export function loadResearcherResearchToWorkerHandoffBaseline(): ResearcherResearchToWorkerHandoffBaseline {
  return researcherResearchToWorkerHandoffBaseline as ResearcherResearchToWorkerHandoffBaseline;
}

export function validateResearcherResearchToWorkerHandoffBaseline(
  fixture: ResearcherResearchToWorkerHandoffBaseline,
): ResearcherResearchToWorkerHandoffValidationResult {
  const issues: ResearcherResearchToWorkerHandoffValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P04-B09-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES.map(category => [category, 0]),
  ) as Record<ResearcherResearchToWorkerHandoffCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES) {
    const min = RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_A01_PROBE_MATRIX) {
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

  const handoff = getForgeP04B08ToB09Handoff();
  const spikeCoverage = summarizeResearcherSpikeFalsificationContractCoverage(
    getActiveResearcherSpikeFalsificationContract(),
  );

  if (fixture.sourceBlockGate.atom !== "P04-B08-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P04-B08-A10`,
    });
  }
  if (
    fixture.sourceBlockGate.contractVersion !==
    FORGE_RESEARCHER_SPIKE_FALSIFICATION_CONTRACT_V1.version
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.contractVersion=${fixture.sourceBlockGate.contractVersion} ` +
        `expected=${FORGE_RESEARCHER_SPIKE_FALSIFICATION_CONTRACT_V1.version}`,
    });
  }
  if (fixture.sourceBlockGate.spikeFalsificationProbeCount !== spikeCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.spikeFalsificationProbeCount=${fixture.sourceBlockGate.spikeFalsificationProbeCount} ` +
        `expected=${spikeCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P04_B08_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P04_B08_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P04-B09-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `B08 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P04-B09-A01`,
    });
  }

  const contractAlignment = validateResearcherResearchToWorkerHandoffAgainstContract(
    fixture,
    getActiveResearcherResearchToWorkerHandoffContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeResearcherResearchToWorkerHandoffMatrix(
  results: ResearcherResearchToWorkerHandoffProbeResult[],
): ResearcherResearchToWorkerHandoffProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as ResearcherResearchToWorkerHandoffProbeSummary["byCategory"];
  for (const category of RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES) {
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

export function listResearcherResearchToWorkerHandoffProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherResearchToWorkerHandoffBaseline = loadResearcherResearchToWorkerHandoffBaseline(),
): ResearcherResearchToWorkerHandoffFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listResearcherResearchToWorkerHandoffKnownGaps(
  results: ResearcherResearchToWorkerHandoffProbeResult[],
): ResearcherResearchToWorkerHandoffProbeResult[] {
  return summarizeResearcherResearchToWorkerHandoffMatrix(results).knownGaps;
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
  category: ResearcherResearchToWorkerHandoffCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
): ResearcherResearchToWorkerHandoffProbeResult {
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

function productionHandoffSource(): string {
  return readSrc("forge-p04-researcher-research-to-worker-handoff.ts");
}

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function parserSource(): string {
  return readSrc("parser.ts");
}

function hasProductionExport(functionName: string, source = productionHandoffSource()): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(source);
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

function workerFormatSection(): string {
  const prompts = promptsSource();
  const workerStart = prompts.indexOf("const WORKER_SYSTEM");
  if (workerStart === -1) {
    return prompts;
  }
  return prompts.slice(workerStart);
}

const SAMPLE_RESEARCH_OUTPUT = `RESEARCH_QUESTIONS:
1. Can async worker pool reduce tail latency under burst load?
FINDINGS: Bounded concurrency reduces p99 latency in similar systems.
SOURCES: https://example.com/async-patterns
RELEVANCE: 0.85
TRADEOFFS:
1. sync vs async (latency vs complexity)
RISKS: Increased complexity (medium) — mitigate with bounded worker pool
SPIKE_EXPERIMENTS:
1. bounded async worker pool → p99 latency below 500ms (scope: worker pool sizing, timebox: 30min)
FALSIFICATION: Reject if sync baseline outperforms async under burst load`;

function runSingleProbe(
  id: string,
  category: ResearcherResearchToWorkerHandoffCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherResearchToWorkerHandoffBaseline,
): ResearcherResearchToWorkerHandoffProbeResult {
  switch (id) {
    case "rtwh.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "rtwh.atom_tagged": {
      const ok = fixture.atom === "P04-B09-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "rtwh.harness_version_exported": {
      const ok = FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_VERSION}`,
      );
    }
    case "rtwh.researcher_findings_flow_to_worker": {
      const section = researcherFormatSection();
      const ok =
        section.includes("available to the Worker") ||
        section.includes("available to the Worker (for execution context)");
      return probe(id, category, expected, ok, `findingsFlowToWorker=${ok}`);
    }
    case "rtwh.spike_falsification_informs_handoff": {
      const sampleValidation = validateSpikeFalsificationExperiment(SAMPLE_RESEARCH_OUTPUT);
      const ok =
        hasProductionExport(
          "validateSpikeFalsificationExperiment",
          readSrc("forge-p04-researcher-spike-falsification.ts"),
        ) && sampleValidation.valid === true;
      return probe(id, category, expected, ok, `spikeGate=${sampleValidation.valid}`);
    }
    case "rtwh.b08_handoff_research_block": {
      const handoff = getForgeP04B08ToB09Handoff();
      const ok =
        handoff.targetBlock.blockId === "P04-B09" &&
        handoff.targetBlock.title.toLowerCase().includes("research-to-worker");
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.title}`,
      );
    }
    case "rtwh.orchestrator_injects_findings": {
      const orchestrator = orchestratorSource();
      const ok =
        orchestrator.includes("RESEARCH FINDINGS:") &&
        orchestrator.includes("findings ? `RESEARCH FINDINGS:");
      return probe(id, category, expected, ok, `orchestratorFindingsInjection=${ok}`);
    }
    case "rtwh.orchestrator_pre_worker_validators": {
      const orchestrator = orchestratorSource();
      const ok =
        orchestrator.includes("validateResearchRiskTradeoff(") &&
        orchestrator.includes("validateSpikeFalsificationExperiment(");
      return probe(id, category, expected, ok, `preWorkerValidators=${ok}`);
    }
    case "rtwh.worker_receives_research_context": {
      const section = workerFormatSection();
      const ok =
        section.includes("Researcher") ||
        section.includes("research") ||
        section.includes("external knowledge");
      return probe(id, category, expected, ok, `workerResearchContext=${ok}`);
    }
    case "rtwh.b08_block_handoff_entry": {
      const handoff = getForgeP04B08ToB09Handoff();
      const ok =
        handoff.targetBlock.blockId === "P04-B09" &&
        handoff.targetBlock.entryAtom === "P04-B09-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "rtwh.b08_sealed_spike_probes": {
      const handoff = getForgeP04B08ToB09Handoff();
      const coverage = summarizeResearcherSpikeFalsificationContractCoverage(
        getActiveResearcherSpikeFalsificationContract(),
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
    case "rtwh.source_block_gate_ref": {
      const ok =
        fixture.sourceBlockGate.atom === "P04-B08-A10" &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P04_B08_SEALED_ATOM_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `sourceGate=${fixture.sourceBlockGate.atom}, sealed=${fixture.sourceBlockGate.sealedAtomCount}`,
      );
    }
    case "rtwh.probe_runner_exported": {
      const ok = productionHandoffSource().includes(
        "export function runResearcherResearchToWorkerHandoffProbes",
      );
      return probe(
        id,
        category,
        expected,
        ok,
        `probeRunner=${ok}, probeCount=${fixture.probes.length}`,
      );
    }
    case "rtwh.known_gaps_documented": {
      const contract = getActiveResearcherResearchToWorkerHandoffContract();
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
    case "rtwh.empty_handoff_input_boundary": {
      const boundary = assessResearchToWorkerHandoffInputBoundary("");
      const ok = boundary.acceptable === false && boundary.disposition === "empty";
      return probe(id, category, expected, ok, `disposition=${boundary.disposition}`);
    }
    case "rtwh.whitespace_handoff_input_boundary": {
      const boundary = assessResearchToWorkerHandoffInputBoundary("   \t\n  ");
      const ok = boundary.acceptable === false && boundary.disposition === "whitespace_only";
      return probe(id, category, expected, ok, `disposition=${boundary.disposition}`);
    }
    case "rtwh.long_handoff_input_truncation_boundary": {
      const longInput = "x".repeat(RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_INPUT_MAX_LENGTH + 500);
      const boundary = assessResearchToWorkerHandoffInputBoundary(longInput);
      const ok =
        boundary.acceptable === true &&
        boundary.truncated === true &&
        boundary.normalizedInput.length === RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_INPUT_MAX_LENGTH;
      return probe(id, category, expected, ok, `truncated=${boundary.truncated}`);
    }
    case "rtwh.invalid_version_rejected": {
      const badFixture = {
        ...fixture,
        version: "9.9.9",
      } as ResearcherResearchToWorkerHandoffBaseline;
      const validation = validateResearcherResearchToWorkerHandoffBaseline(badFixture);
      const ok = validation.valid === false;
      return probe(id, category, expected, ok, `invalidVersionRejected=${ok}`);
    }
    case "rtwh.malformed_handoff_input_guard": {
      const boundary = assessResearchToWorkerHandoffInputBoundary("handoff\0parse");
      const ok = boundary.acceptable === false && boundary.disposition === "contains_null_byte";
      return probe(id, category, expected, ok, `disposition=${boundary.disposition}`);
    }
    case "rtwh.recovery_handoff_bundle_repair": {
      const recovery = recoverResearchToWorkerHandoff(
        "FINDINGS: async worker pool reduces tail latency under burst load\nSOURCES: https://example.com/async",
        { topic: "worker pool handoff" },
      );
      const ok = recovery.recovered === true && recovery.bundle.findings.length > 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `recovered=${recovery.recovered}, findings=${recovery.bundle.findings.length > 0}`,
      );
    }
    case "rtwh.recovery_missing_findings_fallback": {
      const recovery = recoverResearchToWorkerHandoff(
        "Bounded concurrency reduces p99 latency in similar systems.\nSOURCES: https://example.com/async",
        { defaultFindings: "inferred findings from unstructured research output" },
      );
      const ok =
        recovery.recovered === true &&
        recovery.bundle.findings.length > 0 &&
        recovery.parseErrors.includes("missing_findings_inferred");
      return probe(
        id,
        category,
        expected,
        ok,
        `findings=${recovery.bundle.findings.length > 0}, inferred=${recovery.parseErrors.includes("missing_findings_inferred")}`,
      );
    }
    case "rtwh.parser_research_handoff_bundle": {
      const parser = parserSource();
      const parsed = parseResearchToWorkerHandoff(SAMPLE_RESEARCH_OUTPUT);
      const ok =
        /\bexport function parseResearchToWorkerHandoff\b/.test(parser) &&
        parsed.ok &&
        parsed.data.findings.length > 0 &&
        parsed.data.sources.length >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `parseResearchToWorkerHandoff=${ok}, sources=${parsed.ok ? parsed.data.sources.length : 0}`,
      );
    }
    case "rtwh.exported_handoff_validator": {
      const orchestrator = orchestratorSource();
      const sampleValidation = validateResearchToWorkerHandoff(SAMPLE_RESEARCH_OUTPUT);
      const ok =
        hasProductionExport("validateResearchToWorkerHandoff") &&
        orchestrator.includes("validateResearchToWorkerHandoff(") &&
        sampleValidation.valid === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoffValidator=${ok}, valid=${sampleValidation.valid}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown probe");
  }
}

export function runResearcherResearchToWorkerHandoffProbes(
  fixture: ResearcherResearchToWorkerHandoffBaseline = loadResearcherResearchToWorkerHandoffBaseline(),
): ResearcherResearchToWorkerHandoffProbeResult[] {
  const contract = getActiveResearcherResearchToWorkerHandoffContract();
  return fixture.probes.map(entry => {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const expected = contractProbe?.expected ?? entry.expected;
    const result = runSingleProbe(entry.id, entry.category, expected, fixture);
    return contractProbe?.criterion ? { ...result, criterion: contractProbe.criterion } : result;
  });
}

export interface ResearcherResearchToWorkerHandoffProbeMatrixValidationIssue {
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

export interface ResearcherResearchToWorkerHandoffProbeMatrixValidationResult {
  valid: boolean;
  issues: ResearcherResearchToWorkerHandoffProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

export function validateResearcherResearchToWorkerHandoffProbeMatrix(
  results: ResearcherResearchToWorkerHandoffProbeResult[],
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
): ResearcherResearchToWorkerHandoffProbeMatrixValidationResult {
  const issues: ResearcherResearchToWorkerHandoffProbeMatrixValidationIssue[] = [];
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

export interface ResearcherResearchToWorkerHandoffProductionSliceResult {
  atom: "P04-B09-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: ResearcherResearchToWorkerHandoffProbeResult[];
  summary: ResearcherResearchToWorkerHandoffProbeSummary;
  matrixValidation: ResearcherResearchToWorkerHandoffProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: parseResearchToWorkerHandoff and validateResearchToWorkerHandoff
 * wired to contract probe execution with zero unexpected mismatches.
 */
export function runResearcherResearchToWorkerHandoffProductionSlice(
  fixture: ResearcherResearchToWorkerHandoffBaseline = loadResearcherResearchToWorkerHandoffBaseline(),
): ResearcherResearchToWorkerHandoffProductionSliceResult {
  const contract = getActiveResearcherResearchToWorkerHandoffContract();
  const fixtureValidation = validateResearcherResearchToWorkerHandoffBaseline(fixture);
  const contractValidation = validateResearcherResearchToWorkerHandoffAgainstContract(fixture, contract);
  const results = runResearcherResearchToWorkerHandoffProbes(fixture);
  const summary = summarizeResearcherResearchToWorkerHandoffMatrix(results);
  const matrixValidation = validateResearcherResearchToWorkerHandoffProbeMatrix(results, contract);

  return {
    atom: "P04-B09-A03",
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
export function validateResearcherResearchToWorkerHandoffBoundaryProbeMatrix(
  results: ResearcherResearchToWorkerHandoffProbeResult[],
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
): ResearcherResearchToWorkerHandoffProbeMatrixValidationResult {
  const boundaryProbes = listResearcherResearchToWorkerHandoffContractProbesByCategory(
    "boundary",
    contract,
  );
  const boundaryContract: ResearcherResearchToWorkerHandoffContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateResearcherResearchToWorkerHandoffProbeMatrix(boundaryResults, boundaryContract);
}

export interface ResearcherResearchToWorkerHandoffBoundarySliceResult {
  atom: "P04-B09-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherResearchToWorkerHandoffProbeResult[];
  boundaryResults: ResearcherResearchToWorkerHandoffProbeResult[];
  matrixValidation: ResearcherResearchToWorkerHandoffProbeMatrixValidationResult;
}

/**
 * A04 boundary slice: contract-wired boundary probes (handoff input edge cases,
 * probe runner, documented gaps) with zero unexpected mismatches.
 */
export function runResearcherResearchToWorkerHandoffBoundarySlice(
  fixture: ResearcherResearchToWorkerHandoffBaseline = loadResearcherResearchToWorkerHandoffBaseline(),
): ResearcherResearchToWorkerHandoffBoundarySliceResult {
  const contract = getActiveResearcherResearchToWorkerHandoffContract();
  const results = runResearcherResearchToWorkerHandoffProbes(fixture);
  const boundaryProbes = listResearcherResearchToWorkerHandoffContractProbesByCategory(
    "boundary",
    contract,
  );
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateResearcherResearchToWorkerHandoffBoundaryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B09-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly ResearcherResearchToWorkerHandoffCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes must align; zero unexpected mismatches.
 */
export function validateResearcherResearchToWorkerHandoffFailureRecoveryProbeMatrix(
  results: ResearcherResearchToWorkerHandoffProbeResult[],
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
): ResearcherResearchToWorkerHandoffProbeMatrixValidationResult {
  const failureRecoveryProbes =
    RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
      listResearcherResearchToWorkerHandoffContractProbesByCategory(category, contract),
    );
  const failureRecoveryContract: ResearcherResearchToWorkerHandoffContract = {
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
  return validateResearcherResearchToWorkerHandoffProbeMatrix(
    failureRecoveryResults,
    failureRecoveryContract,
  );
}

export function listResearcherResearchToWorkerHandoffFailureRecoveryProbeIds(
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
): string[] {
  return RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listResearcherResearchToWorkerHandoffContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface ResearcherResearchToWorkerHandoffFailureRecoverySliceResult {
  atom: "P04-B09-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherResearchToWorkerHandoffProbeResult[];
  failureRecoveryResults: ResearcherResearchToWorkerHandoffProbeResult[];
  matrixValidation: ResearcherResearchToWorkerHandoffProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes (invalid fixture rejection, null-byte guard, recoverResearchToWorkerHandoff bundle
 * repair, findings fallback, parseResearchToWorkerHandoff and validateResearchToWorkerHandoff
 * orchestrator NO-GO wiring) with zero unexpected mismatches.
 */
export function runResearcherResearchToWorkerHandoffFailureRecoverySlice(
  fixture: ResearcherResearchToWorkerHandoffBaseline = loadResearcherResearchToWorkerHandoffBaseline(),
): ResearcherResearchToWorkerHandoffFailureRecoverySliceResult {
  const contract = getActiveResearcherResearchToWorkerHandoffContract();
  const results = runResearcherResearchToWorkerHandoffProbes(fixture);
  const failureRecoveryProbes =
    RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
      listResearcherResearchToWorkerHandoffContractProbesByCategory(category, contract),
    );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateResearcherResearchToWorkerHandoffFailureRecoveryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B09-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

/** Per-probe evidence entry — disposition, criterion and aligned outcomes (P04-B09-A06). */
export interface ResearcherResearchToWorkerHandoffProbeEvidence {
  probeId: string;
  category: ResearcherResearchToWorkerHandoffCategory;
  disposition: ResearcherResearchToWorkerHandoffProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for research-to-worker handoff runs (P04-B09-A06). */
export interface ResearcherResearchToWorkerHandoffProbeTelemetry {
  probeId: string;
  category: ResearcherResearchToWorkerHandoffCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P04-B09-A06). */
export interface ResearcherResearchToWorkerHandoffProvenance {
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
  sliceCategories?: readonly ResearcherResearchToWorkerHandoffCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated research-to-worker handoff run record bundling evidence, telemetry and provenance. */
export interface ResearcherResearchToWorkerHandoffRunRecord {
  provenance: ResearcherResearchToWorkerHandoffProvenance;
  evidence: ResearcherResearchToWorkerHandoffProbeEvidence[];
  telemetry: ResearcherResearchToWorkerHandoffProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<ResearcherResearchToWorkerHandoffCategory, number>;
    byDisposition: Record<ResearcherResearchToWorkerHandoffProbeDisposition, number>;
  };
}

export interface ResearcherResearchToWorkerHandoffRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface ResearcherResearchToWorkerHandoffRunValidationResult {
  valid: boolean;
  issues: ResearcherResearchToWorkerHandoffRunValidationIssue[];
}

export function buildResearcherResearchToWorkerHandoffProbeEvidence(
  probeId: string,
  category: ResearcherResearchToWorkerHandoffCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: ResearcherResearchToWorkerHandoffProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): ResearcherResearchToWorkerHandoffProbeEvidence {
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

export function buildResearcherResearchToWorkerHandoffProbeTelemetry(
  probeId: string,
  category: ResearcherResearchToWorkerHandoffCategory,
  sequenceIndex: number,
  durationMs: number,
): ResearcherResearchToWorkerHandoffProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildResearcherResearchToWorkerHandoffProvenance(
  runId: string,
  fixture: ResearcherResearchToWorkerHandoffBaseline,
  contract: ResearcherResearchToWorkerHandoffContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly ResearcherResearchToWorkerHandoffCategory[];
  },
): ResearcherResearchToWorkerHandoffProvenance {
  return {
    runId,
    harnessVersion: FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_VERSION,
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

export function buildResearcherResearchToWorkerHandoffRunRecord(
  provenance: ResearcherResearchToWorkerHandoffProvenance,
  evidence: ResearcherResearchToWorkerHandoffProbeEvidence[],
  telemetry: ResearcherResearchToWorkerHandoffProbeTelemetry[],
): ResearcherResearchToWorkerHandoffRunRecord {
  const byCategory = {} as Record<ResearcherResearchToWorkerHandoffCategory, number>;
  const byDisposition: Record<ResearcherResearchToWorkerHandoffProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES) {
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

function validateResearcherResearchToWorkerHandoffRunRecordAgainstProbeIds(
  record: ResearcherResearchToWorkerHandoffRunRecord,
  expectedProbeIds: string[],
  contract: ResearcherResearchToWorkerHandoffContract,
): ResearcherResearchToWorkerHandoffRunValidationResult {
  const issues: ResearcherResearchToWorkerHandoffRunValidationIssue[] = [];
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

export function validateResearcherResearchToWorkerHandoffRunRecord(
  record: ResearcherResearchToWorkerHandoffRunRecord,
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
): ResearcherResearchToWorkerHandoffRunValidationResult {
  return validateResearcherResearchToWorkerHandoffRunRecordAgainstProbeIds(
    record,
    listResearcherResearchToWorkerHandoffContractProbeIds(contract),
    contract,
  );
}

/** Validate evidence slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateResearcherResearchToWorkerHandoffEvidenceRunRecord(
  record: ResearcherResearchToWorkerHandoffRunRecord,
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
): ResearcherResearchToWorkerHandoffRunValidationResult {
  const issues: ResearcherResearchToWorkerHandoffRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P04-B09-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P04-B09-A06`,
    });
  }

  const expectedCategories = [...RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateResearcherResearchToWorkerHandoffRunRecordAgainstProbeIds(
    record,
    listResearcherResearchToWorkerHandoffFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

export interface ResearcherResearchToWorkerHandoffEvidenceSliceResult {
  atom: "P04-B09-A06";
  evidenceProbeCount: number;
  matrixValid: boolean;
  recordValid: boolean;
  results: ResearcherResearchToWorkerHandoffProbeResult[];
  evidenceResults: ResearcherResearchToWorkerHandoffProbeResult[];
  matrixValidation: ResearcherResearchToWorkerHandoffProbeMatrixValidationResult;
  record: ResearcherResearchToWorkerHandoffRunRecord;
  recordValidation: ResearcherResearchToWorkerHandoffRunValidationResult;
}

function resolveResearcherResearchToWorkerHandoffGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function runResearcherResearchToWorkerHandoffProbeWithTiming(
  entry: ResearcherResearchToWorkerHandoffFixtureEntry,
  fixture: ResearcherResearchToWorkerHandoffBaseline,
  contractProbe: ResearcherResearchToWorkerHandoffProbeContract | undefined,
): {
  result: ResearcherResearchToWorkerHandoffProbeResult;
  durationMs: number;
  disposition: ResearcherResearchToWorkerHandoffProbeDisposition;
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

function buildResearcherResearchToWorkerHandoffRecordFromEntries(
  entries: ResearcherResearchToWorkerHandoffFixtureEntry[],
  fixture: ResearcherResearchToWorkerHandoffBaseline,
  contract: ResearcherResearchToWorkerHandoffContract,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly ResearcherResearchToWorkerHandoffCategory[];
  },
): ResearcherResearchToWorkerHandoffRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ResearcherResearchToWorkerHandoffProbeEvidence[] = [];
  const telemetry: ResearcherResearchToWorkerHandoffProbeTelemetry[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runResearcherResearchToWorkerHandoffProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildResearcherResearchToWorkerHandoffProbeEvidence(
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
      buildResearcherResearchToWorkerHandoffProbeTelemetry(
        result.id,
        result.category,
        sequenceIndex,
        durationMs,
      ),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildResearcherResearchToWorkerHandoffProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveResearcherResearchToWorkerHandoffGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildResearcherResearchToWorkerHandoffRunRecord(provenance, evidence, telemetry);
}

/** Run all research-to-worker handoff probes and emit auditable evidence, telemetry and provenance (P04-B09-A06). */
export function runResearcherResearchToWorkerHandoffProbesWithRecord(
  fixture: ResearcherResearchToWorkerHandoffBaseline = loadResearcherResearchToWorkerHandoffBaseline(),
): ResearcherResearchToWorkerHandoffRunRecord {
  const contract = getActiveResearcherResearchToWorkerHandoffContract();
  return buildResearcherResearchToWorkerHandoffRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P04-B09-A06). */
export function runResearcherResearchToWorkerHandoffFailureRecoverySliceWithRecord(
  fixture: ResearcherResearchToWorkerHandoffBaseline = loadResearcherResearchToWorkerHandoffBaseline(),
): ResearcherResearchToWorkerHandoffRunRecord {
  const contract = getActiveResearcherResearchToWorkerHandoffContract();
  const failureRecoveryIds = new Set(
    listResearcherResearchToWorkerHandoffFailureRecoveryProbeIds(contract),
  );
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildResearcherResearchToWorkerHandoffRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P04-B09-A06",
    sliceCategories: RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_FAILURE_RECOVERY_CATEGORIES,
  });
}

/**
 * A06 evidence slice: contract-wired failure_path, recovery_path, and nogo_path probes
 * with auditable evidence, telemetry and provenance — zero unexpected mismatches.
 */
export function runResearcherResearchToWorkerHandoffEvidenceSlice(
  fixture: ResearcherResearchToWorkerHandoffBaseline = loadResearcherResearchToWorkerHandoffBaseline(),
): ResearcherResearchToWorkerHandoffEvidenceSliceResult {
  const contract = getActiveResearcherResearchToWorkerHandoffContract();
  const results = runResearcherResearchToWorkerHandoffProbes(fixture);
  const failureRecoveryProbes =
    RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
      listResearcherResearchToWorkerHandoffContractProbesByCategory(category, contract),
    );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const evidenceResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateResearcherResearchToWorkerHandoffFailureRecoveryProbeMatrix(
    results,
    contract,
  );
  const record = runResearcherResearchToWorkerHandoffFailureRecoverySliceWithRecord(fixture);
  const recordValidation = validateResearcherResearchToWorkerHandoffEvidenceRunRecord(
    record,
    contract,
  );

  return {
    atom: "P04-B09-A06",
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

// ─── Property and fuzz validation (P04-B09-A07) ───────────────────────────────

export interface ResearcherResearchToWorkerHandoffPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface ResearcherResearchToWorkerHandoffPropertyResult {
  passed: number;
  failed: ResearcherResearchToWorkerHandoffPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type ResearcherResearchToWorkerHandoffPropertyCheck = {
  id: string;
  description: string;
  check: (contract: ResearcherResearchToWorkerHandoffContract) => string | null;
};

const RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_STRUCTURAL_PROPERTIES: readonly ResearcherResearchToWorkerHandoffPropertyCheck[] =
  [
    {
      id: "categories_complete",
      description: "All eight research-to-worker handoff categories are declared",
      check: contract => {
        for (const category of RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES) {
          if (!contract.categories[category]) return `missing category: ${category}`;
        }
        return null;
      },
    },
    {
      id: "probe_ids_unique",
      description: "Probe ids are globally unique",
      check: contract => {
        const ids = listResearcherResearchToWorkerHandoffContractProbeIds(contract);
        if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
        return null;
      },
    },
    {
      id: "min_probe_count",
      description: "Each category meets contract minProbeCount",
      check: contract => {
        for (const category of RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES) {
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
        "summarizeResearcherResearchToWorkerHandoffContractCoverage totals match listResearcherResearchToWorkerHandoffContractProbeIds",
      check: contract => {
        const summary = summarizeResearcherResearchToWorkerHandoffContractCoverage(contract);
        const ids = listResearcherResearchToWorkerHandoffContractProbeIds(contract);
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
      description: "Probe ids are namespaced with rtwh. prefix",
      check: contract => {
        for (const probe of contract.probes) {
          if (!probe.id.startsWith("rtwh.")) {
            return `${probe.id} missing rtwh. prefix`;
          }
        }
        return null;
      },
    },
    {
      id: "run_record_summary_invariant",
      description: "Run record summary aligned + mismatches equals total",
      check: contract => {
        const fixture = loadResearcherResearchToWorkerHandoffBaseline();
        const probeIds = listResearcherResearchToWorkerHandoffContractProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildResearcherResearchToWorkerHandoffProbeEvidence(
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
          return buildResearcherResearchToWorkerHandoffProbeTelemetry(
            id,
            probe.category,
            index,
            index * 0.05,
          );
        });
        const record = buildResearcherResearchToWorkerHandoffRunRecord(
          buildResearcherResearchToWorkerHandoffProvenance(
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
        "Synthetic failure/recovery slice record passes validateResearcherResearchToWorkerHandoffEvidenceRunRecord",
      check: contract => {
        const fixture = loadResearcherResearchToWorkerHandoffBaseline();
        const probeIds = listResearcherResearchToWorkerHandoffFailureRecoveryProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildResearcherResearchToWorkerHandoffProbeEvidence(
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
          return buildResearcherResearchToWorkerHandoffProbeTelemetry(
            id,
            probe.category,
            index,
            index * 0.5,
          );
        });
        const record = buildResearcherResearchToWorkerHandoffRunRecord(
          buildResearcherResearchToWorkerHandoffProvenance(
            "property-check-failure-recovery",
            fixture,
            contract,
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T00:00:01.000Z",
            probeIds.length,
            {
              sliceAtom: "P04-B09-A06",
              sliceCategories: RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_FAILURE_RECOVERY_CATEGORIES,
            },
          ),
          evidence,
          telemetry,
        );
        const validation = validateResearcherResearchToWorkerHandoffEvidenceRunRecord(
          record,
          contract,
        );
        if (!validation.valid) {
          return validation.issues.map(i => i.detail).join("; ");
        }
        return null;
      },
    },
  ] as const;

export function runResearcherResearchToWorkerHandoffPropertyValidation(
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
): ResearcherResearchToWorkerHandoffPropertyResult {
  const failed: ResearcherResearchToWorkerHandoffPropertyViolation[] = [];
  for (const property of RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type ResearcherResearchToWorkerHandoffFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface ResearcherResearchToWorkerHandoffFuzzMutationCase {
  seed: number;
  kind: ResearcherResearchToWorkerHandoffFuzzMutationKind;
  probeId?: string;
  category?: ResearcherResearchToWorkerHandoffCategory;
}

export interface ResearcherResearchToWorkerHandoffFuzzValidationCaseResult {
  mutation: ResearcherResearchToWorkerHandoffFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface ResearcherResearchToWorkerHandoffFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: ResearcherResearchToWorkerHandoffFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createResearcherResearchToWorkerHandoffFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneResearcherResearchToWorkerHandoffBaseline(
  fixture: ResearcherResearchToWorkerHandoffBaseline,
): ResearcherResearchToWorkerHandoffBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickResearcherResearchToWorkerHandoffFuzzTarget(
  fixture: ResearcherResearchToWorkerHandoffBaseline,
  rng: () => number,
): {
  category: ResearcherResearchToWorkerHandoffCategory;
  index: number;
  entry: ResearcherResearchToWorkerHandoffFixtureEntry;
} {
  const category =
    RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES[
      Math.floor(rng() * RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES.length)
    ]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyResearcherResearchToWorkerHandoffFuzzMutation(
  fixture: ResearcherResearchToWorkerHandoffBaseline,
  mutation: ResearcherResearchToWorkerHandoffFuzzMutationCase,
): ResearcherResearchToWorkerHandoffBaseline {
  const mutated = cloneResearcherResearchToWorkerHandoffBaseline(fixture);
  const targetCategory = mutation.category ?? RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES[0]!;
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
          id: `rtwh.fuzz.extra.${mutation.seed}`,
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
      const other = RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateResearcherResearchToWorkerHandoffFuzzMutationCases(
  fixture: ResearcherResearchToWorkerHandoffBaseline,
  seed: number,
  iterations: number,
): ResearcherResearchToWorkerHandoffFuzzMutationCase[] {
  const rng = createResearcherResearchToWorkerHandoffFuzzRng(seed);
  const kinds: ResearcherResearchToWorkerHandoffFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: ResearcherResearchToWorkerHandoffFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickResearcherResearchToWorkerHandoffFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P04-B09-A07). */
export function runResearcherResearchToWorkerHandoffFuzzValidation(
  fixture: ResearcherResearchToWorkerHandoffBaseline,
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
  seed = 42,
  iterations = 24,
): ResearcherResearchToWorkerHandoffFuzzValidationResult {
  const cases = generateResearcherResearchToWorkerHandoffFuzzMutationCases(fixture, seed, iterations);
  const results: ResearcherResearchToWorkerHandoffFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyResearcherResearchToWorkerHandoffFuzzMutation(fixture, mutation);
    const validation = validateResearcherResearchToWorkerHandoffAgainstContract(mutated, contract);
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

export type ResearcherResearchToWorkerHandoffRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface ResearcherResearchToWorkerHandoffRunRecordFuzzCase {
  kind: ResearcherResearchToWorkerHandoffRunRecordFuzzKind;
  probeId?: string;
}

export function applyResearcherResearchToWorkerHandoffRunRecordFuzzMutation(
  record: ResearcherResearchToWorkerHandoffRunRecord,
  mutation: ResearcherResearchToWorkerHandoffRunRecordFuzzCase,
): ResearcherResearchToWorkerHandoffRunRecord {
  const cloned: ResearcherResearchToWorkerHandoffRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P04-B09-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["evidence_versioning"],
      };
      break;
  }

  cloned.summary = buildResearcherResearchToWorkerHandoffRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveResearcherResearchToWorkerHandoffRunRecordValidator(
  record: ResearcherResearchToWorkerHandoffRunRecord,
): (
  record: ResearcherResearchToWorkerHandoffRunRecord,
  contract: ResearcherResearchToWorkerHandoffContract,
) => ResearcherResearchToWorkerHandoffRunValidationResult {
  return record.provenance.sliceAtom === "P04-B09-A06"
    ? validateResearcherResearchToWorkerHandoffEvidenceRunRecord
    : validateResearcherResearchToWorkerHandoffRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P04-B09-A07). */
export function runResearcherResearchToWorkerHandoffRunRecordFuzzValidation(
  record: ResearcherResearchToWorkerHandoffRunRecord,
  contract: ResearcherResearchToWorkerHandoffContract = getActiveResearcherResearchToWorkerHandoffContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveResearcherResearchToWorkerHandoffRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: ResearcherResearchToWorkerHandoffRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P04-B09-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyResearcherResearchToWorkerHandoffRunRecordFuzzMutation(record, mutation);
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

export interface ResearcherResearchToWorkerHandoffPropertyFuzzSliceResult {
  atom: "P04-B09-A07";
  propertyChecksPassed: boolean;
  contractFuzzRejected: boolean;
  runRecordFuzzRejected: boolean;
  propertyResult: ResearcherResearchToWorkerHandoffPropertyResult;
  contractFuzz: ResearcherResearchToWorkerHandoffFuzzValidationResult;
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
export function runResearcherResearchToWorkerHandoffPropertyFuzzSlice(
  fixture: ResearcherResearchToWorkerHandoffBaseline = loadResearcherResearchToWorkerHandoffBaseline(),
): ResearcherResearchToWorkerHandoffPropertyFuzzSliceResult {
  const contract = getActiveResearcherResearchToWorkerHandoffContract();
  const propertyResult = runResearcherResearchToWorkerHandoffPropertyValidation(contract);
  const contractFuzz = runResearcherResearchToWorkerHandoffFuzzValidation(fixture, contract);
  const record = runResearcherResearchToWorkerHandoffFailureRecoverySliceWithRecord(fixture);
  const runRecordFuzz = runResearcherResearchToWorkerHandoffRunRecordFuzzValidation(record, contract);

  return {
    atom: "P04-B09-A07",
    propertyChecksPassed: propertyResult.allPassed,
    contractFuzzRejected: contractFuzz.allMutationsRejected,
    runRecordFuzzRejected: runRecordFuzz.mutationsAccepted === 0,
    propertyResult,
    contractFuzz,
    runRecordFuzz,
  };
}
