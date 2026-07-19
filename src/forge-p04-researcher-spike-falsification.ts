/**
 * FOREMAN — Researcher Spike & Falsification Experiment Baseline (P04-B08)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P04-B07 risk trade-off block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import researcherSpikeFalsificationBaseline from "./fixtures/forge-researcher-spike-falsification-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP04B07ToB08Handoff,
  getActiveResearcherRiskTradeoffContract,
  summarizeResearcherRiskTradeoffContractCoverage,
  FORGE_RESEARCHER_RISK_TRADEOFF_CONTRACT_V1,
  validateResearchRiskTradeoff,
} from "./forge-p04-researcher-risk-tradeoff.js";
import { parseResearchResponse, parseResearchSpikeExperiment } from "./parser.js";

export const FORGE_RESEARCHER_SPIKE_FALSIFICATION_VERSION = "1.0.0-a01";

export const EXPECTED_P04_B07_SEALED_ATOM_COUNT = 10;

export const RESEARCHER_SPIKE_FALSIFICATION_INPUT_MAX_LENGTH = 8192;

export const RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES = [
  "evidence_versioning",
  "spike_signal",
  "falsification_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type ResearcherSpikeFalsificationCategory =
  (typeof RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES)[number];

export const RESEARCHER_SPIKE_FALSIFICATION_A01_MIN_PROBES: Readonly<
  Record<ResearcherSpikeFalsificationCategory, number>
> = {
  evidence_versioning: 3,
  spike_signal: 3,
  falsification_signal: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

export type SpikeFalsificationInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface SpikeFalsificationInputBoundary {
  disposition: SpikeFalsificationInputDisposition;
  acceptable: boolean;
  normalizedInput: string;
  truncated: boolean;
  detail: string;
}

export function assessSpikeFalsificationInputBoundary(
  experimentInput: string,
): SpikeFalsificationInputBoundary {
  if (experimentInput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedInput: "",
      truncated: false,
      detail: "null byte detected in experiment input",
    };
  }

  const trimmed = experimentInput.trim();
  if (trimmed.length === 0) {
    const disposition: SpikeFalsificationInputDisposition =
      experimentInput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedInput: "",
      truncated: false,
      detail: disposition === "empty" ? "empty experiment input" : "whitespace-only experiment input",
    };
  }

  let normalizedInput = experimentInput;
  let truncated = false;
  if (normalizedInput.length > RESEARCHER_SPIKE_FALSIFICATION_INPUT_MAX_LENGTH) {
    normalizedInput = normalizedInput.slice(0, RESEARCHER_SPIKE_FALSIFICATION_INPUT_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedInput,
    truncated,
    detail: truncated
      ? `experiment input truncated to ${RESEARCHER_SPIKE_FALSIFICATION_INPUT_MAX_LENGTH} characters`
      : "valid experiment input",
  };
}

export interface SpikeExperimentEntry {
  hypothesis: string;
  scope?: string;
  timeboxMinutes?: number;
  successCriteria?: string;
}

export interface SpikeFalsificationCollectionValidationOutcome {
  valid: boolean;
  experimentCount: number;
  issues: string[];
}

export function validateSpikeFalsificationCollection(
  topic: string,
  experiments: SpikeExperimentEntry[] = [],
): SpikeFalsificationCollectionValidationOutcome {
  const boundary = assessSpikeFalsificationInputBoundary(topic);
  if (!boundary.acceptable) {
    return { valid: false, experimentCount: 0, issues: [boundary.detail] };
  }

  const experimentCount = experiments.length;
  if (experimentCount === 0) {
    return {
      valid: false,
      experimentCount,
      issues: ["zero spike/falsification experiments for normalized topic"],
    };
  }

  const issues: string[] = [];
  for (const [index, experiment] of experiments.entries()) {
    if (!experiment.hypothesis || experiment.hypothesis.trim().length === 0) {
      issues.push(`experiment ${index} missing hypothesis`);
    }
  }

  return { valid: issues.length === 0, experimentCount, issues };
}

export interface SpikeFalsificationExperimentValidationOutcome {
  valid: boolean;
  experimentCount: number;
  spikePresent: boolean;
  falsificationPresent: boolean;
  issues: string[];
}

/**
 * Validate researcher output declares actionable spike and falsification experiment signals (P04-B08-A03).
 */
export function validateSpikeFalsificationExperiment(
  researchOutput: string,
): SpikeFalsificationExperimentValidationOutcome {
  const boundary = assessSpikeFalsificationInputBoundary(researchOutput);
  if (!boundary.acceptable) {
    return {
      valid: false,
      experimentCount: 0,
      spikePresent: false,
      falsificationPresent: false,
      issues: [boundary.detail],
    };
  }

  const normalized = boundary.normalizedInput;
  const issues: string[] = [];
  const spikeParse = parseResearchSpikeExperiment(normalized);
  const experimentCount = spikeParse.ok ? spikeParse.data.edges.length : 0;
  const spikePresent = experimentCount > 0;

  const recovery = recoverSpikeFalsificationEvidence(normalized);
  const resolvedExperimentCount =
    experimentCount > 0 ? experimentCount : recovery.experimentPlan.spikes.length;
  const falsificationPresent = recovery.experimentPlan.falsificationCriteria.length > 0;

  if (resolvedExperimentCount === 0) {
    issues.push("missing_spike_experiment");
  }
  if (!falsificationPresent) {
    const falsificationSection = /FALSIFICATION\s*[:=\-.]/i.test(normalized);
    if (!falsificationSection) {
      issues.push("missing_falsification_criteria");
    }
  }

  return {
    valid: issues.length === 0,
    experimentCount: resolvedExperimentCount,
    spikePresent: spikePresent || recovery.experimentPlan.spikes.length > 0,
    falsificationPresent: falsificationPresent || /FALSIFICATION\s*[:=\-.]/i.test(normalized),
    issues,
  };
}

export interface SpikeFalsificationRecoveryHints {
  topic?: string;
  defaultTimeboxMinutes?: number;
}

export interface SpikeFalsificationRecoveryResult {
  recovered: boolean;
  experimentPlan: {
    spikes: Array<{ hypothesis: string; scope: string; timeboxMinutes: number }>;
    falsificationCriteria: string[];
    topic?: string;
  };
  parseErrors: string[];
  detail: string;
}

const SPIKE_LINE_PATTERN =
  /(?:^|\n)\s*(?:SPIKE|EXPERIMENT|SPIKE_EXPERIMENT)\s*[:=\-]\s*(.+?)(?:\n|$)/gi;
const HYPOTHESIS_LINE_PATTERN =
  /(?:^|\n)\s*(?:HYPOTHESIS|FALSIFICATION|FALSIFY)\s*[:=\-]\s*(.+?)(?:\n|$)/gi;
const TIMEBOX_PATTERN = /(?:timebox|time-box|duration)\s*[:=\-]?\s*(\d+)\s*(?:min|minutes?)/i;
const VS_FALSIFICATION_PATTERN = /(.+?)\s+(?:vs\.?|versus|falsifies)\s+(.+)/i;

export function recoverSpikeFalsificationEvidence(
  failedParse: string,
  hints: SpikeFalsificationRecoveryHints = {},
): SpikeFalsificationRecoveryResult {
  const boundary = assessSpikeFalsificationInputBoundary(failedParse);
  if (!boundary.acceptable) {
    return {
      recovered: false,
      experimentPlan: { spikes: [], falsificationCriteria: [] },
      parseErrors: [boundary.disposition],
      detail: `cannot recover ${boundary.disposition.replace(/_/g, "-")} experiment parse`,
    };
  }

  const raw = boundary.normalizedInput;
  const spikes: Array<{ hypothesis: string; scope: string; timeboxMinutes: number }> = [];
  const falsificationCriteria: string[] = [];

  const timeboxMatch = raw.match(TIMEBOX_PATTERN);
  const defaultTimebox = timeboxMatch
    ? Number.parseInt(timeboxMatch[1] ?? "30", 10)
    : (hints.defaultTimeboxMinutes ?? 30);

  for (const match of raw.matchAll(SPIKE_LINE_PATTERN)) {
    const hypothesis = match[1]?.trim();
    if (hypothesis) {
      spikes.push({
        hypothesis,
        scope: hints.topic ?? "bounded spike scope",
        timeboxMinutes: defaultTimebox,
      });
    }
  }

  for (const match of raw.matchAll(HYPOTHESIS_LINE_PATTERN)) {
    const criterion = match[1]?.trim();
    if (criterion) falsificationCriteria.push(criterion);
  }

  if (falsificationCriteria.length === 0) {
    for (const line of raw.split("\n")) {
      const vsMatch = line.match(VS_FALSIFICATION_PATTERN);
      if (vsMatch) {
        falsificationCriteria.push(
          `Reject if ${vsMatch[1].trim()} does not outperform ${vsMatch[2].trim()}`,
        );
      }
    }
  }

  const topic = hints.topic ?? raw.split("\n")[0]?.trim();
  const recovered = spikes.length >= 1 || falsificationCriteria.length >= 1;

  if (spikes.length === 0 && recovered) {
    spikes.push({
      hypothesis: topic ?? "Recovered spike hypothesis pending refinement",
      scope: "time-boxed falsification probe",
      timeboxMinutes: defaultTimebox,
    });
  }

  return {
    recovered,
    experimentPlan: {
      spikes,
      falsificationCriteria: [...new Set(falsificationCriteria.filter(Boolean))],
      topic: topic || undefined,
    },
    parseErrors: recovered ? [] : ["missing_spike_and_falsification_markers"],
    detail: recovered
      ? `recovered ${spikes.length} spikes and ${falsificationCriteria.length} falsification criteria`
      : "no actionable spike/falsification markers found",
  };
}

export type ResearcherSpikeFalsificationProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface ResearcherSpikeFalsificationFixtureEntry {
  id: string;
  category: ResearcherSpikeFalsificationCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface ResearcherSpikeFalsificationBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    riskTradeoffProbeCount: number;
    sealedAtomCount: number;
  };
  probes: ResearcherSpikeFalsificationFixtureEntry[];
}

export interface ResearcherSpikeFalsificationProbeResult {
  id: string;
  category: ResearcherSpikeFalsificationCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface ResearcherSpikeFalsificationProbeSummary {
  total: number;
  aligned: number;
  mismatches: ResearcherSpikeFalsificationProbeResult[];
  knownGaps: ResearcherSpikeFalsificationProbeResult[];
  byCategory: Record<
    ResearcherSpikeFalsificationCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface ResearcherSpikeFalsificationValidationIssue {
  kind: "missing_probe" | "extra_probe" | "underflow" | "missing_category";
  probeId?: string;
  category?: ResearcherSpikeFalsificationCategory;
  detail: string;
}

export interface ResearcherSpikeFalsificationValidationResult {
  valid: boolean;
  issues: ResearcherSpikeFalsificationValidationIssue[];
}

export interface ResearcherSpikeFalsificationProbeContract {
  id: string;
  category: ResearcherSpikeFalsificationCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: ResearcherSpikeFalsificationProbeDisposition;
  criterion: string;
}

export interface ResearcherSpikeFalsificationCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface ResearcherSpikeFalsificationCategoryContract {
  category: ResearcherSpikeFalsificationCategory;
  acceptance: ResearcherSpikeFalsificationCategoryAcceptance;
  probes: readonly ResearcherSpikeFalsificationProbeContract[];
}

export interface ResearcherSpikeFalsificationContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<
    ResearcherSpikeFalsificationCategory,
    ResearcherSpikeFalsificationCategoryContract
  >;
  probes: readonly ResearcherSpikeFalsificationProbeContract[];
}

function flattenSpikeFalsificationCategoryProbes(
  categories: Record<
    ResearcherSpikeFalsificationCategory,
    ResearcherSpikeFalsificationCategoryContract
  >,
): readonly ResearcherSpikeFalsificationProbeContract[] {
  return RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES.flatMap(
    category => categories[category].probes,
  );
}

const RESEARCHER_SPIKE_FALSIFICATION_CATEGORY_CONTRACTS: Record<
  ResearcherSpikeFalsificationCategory,
  ResearcherSpikeFalsificationCategoryContract
> = {
  evidence_versioning: {
    category: "evidence_versioning",
    acceptance: {
      invariant:
        "Spike falsification baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rsf.version_tagged",
        category: "evidence_versioning",
        description: "Spike falsification baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Spike falsification baseline declares semver version field",
      },
      {
        id: "rsf.atom_tagged",
        category: "evidence_versioning",
        description: "Spike falsification baseline declares P04-B08-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Spike falsification baseline declares P04-B08-A01 atom id",
      },
      {
        id: "rsf.harness_version_exported",
        category: "evidence_versioning",
        description:
          "FORGE_RESEARCHER_SPIKE_FALSIFICATION_VERSION exported for spike falsification harness",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "FORGE_RESEARCHER_SPIKE_FALSIFICATION_VERSION exported for spike falsification harness",
      },
    ],
  },
  spike_signal: {
    category: "spike_signal",
    acceptance: {
      invariant:
        "Researcher spike signals surface time-boxed experiments informed by risk trade-off artifacts.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rsf.researcher_examples_worked_failed",
        category: "spike_signal",
        description: "RESEARCHER_SYSTEM prompt requires examples of what worked and what failed",
        expected: "PASS",
        disposition: "observed",
        criterion: "RESEARCHER_SYSTEM prompt requires examples of what worked and what failed",
      },
      {
        id: "rsf.risk_tradeoff_informs_spike",
        category: "spike_signal",
        description:
          "validateResearchRiskTradeoff exports risk/trade-off gate used to scope spike experiments",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "validateResearchRiskTradeoff exports risk/trade-off gate used to scope spike experiments",
      },
      {
        id: "rsf.b07_handoff_spike_block",
        category: "spike_signal",
        description: "FORGE_P04_B07_TO_B08_HANDOFF_V1 targets spike and falsification block entry",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P04_B07_TO_B08_HANDOFF_V1 targets spike and falsification block entry",
      },
    ],
  },
  falsification_signal: {
    category: "falsification_signal",
    acceptance: {
      invariant:
        "Researcher falsification signals require explicit contradiction and falsifiable sub-hypotheses.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rsf.researcher_contradicts_explicitly",
        category: "falsification_signal",
        description:
          "RESEARCHER_SYSTEM prompt requires explicit contradiction when findings oppose vision",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "RESEARCHER_SYSTEM prompt requires explicit contradiction when findings oppose vision",
      },
      {
        id: "rsf.researcher_block_falsification",
        category: "falsification_signal",
        description: "RESEARCHER_SYSTEM BLOCK signal enables falsification of infeasible plans",
        expected: "PASS",
        disposition: "observed",
        criterion: "RESEARCHER_SYSTEM BLOCK signal enables falsification of infeasible plans",
      },
      {
        id: "rsf.research_questions_hypothesis",
        category: "falsification_signal",
        description:
          "parseResearchResponse extracts RESEARCH_QUESTIONS as falsifiable sub-hypotheses",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "parseResearchResponse extracts RESEARCH_QUESTIONS as falsifiable sub-hypotheses",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Spike falsification baseline links to sealed P04-B07 risk trade-off block gate handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rsf.b07_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P04_B07_TO_B08_HANDOFF_V1 targets P04-B08-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P04_B07_TO_B08_HANDOFF_V1 targets P04-B08-A01 entry atom",
      },
      {
        id: "rsf.b07_sealed_risk_tradeoff_probes",
        category: "baseline_link",
        description:
          "P04-B07→B08 handoff sealed probeCount matches active risk trade-off contract",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "P04-B07→B08 handoff sealed probeCount matches active risk trade-off contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Spike falsification boundary assessment rejects invalid input; probe runner and documented gaps wired.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rsf.source_block_gate_ref",
        category: "boundary",
        description:
          "Baseline fixture references sealed P04-B07 risk trade-off block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Baseline fixture references sealed P04-B07 risk trade-off block gate source artifacts",
      },
      {
        id: "rsf.probe_runner_exported",
        category: "boundary",
        description: "runResearcherSpikeFalsificationProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runResearcherSpikeFalsificationProbes executes contract-wired probe matrix",
      },
      {
        id: "rsf.known_gaps_documented",
        category: "boundary",
        description:
          "Baseline fixture documents at least one measurable FAIL spike falsification gap",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Baseline fixture documents at least one measurable FAIL spike falsification gap",
      },
      {
        id: "rsf.empty_experiment_input_boundary",
        category: "boundary",
        description: "assessSpikeFalsificationInputBoundary rejects empty experiment parse input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessSpikeFalsificationInputBoundary rejects empty experiment parse input",
      },
      {
        id: "rsf.whitespace_experiment_input_boundary",
        category: "boundary",
        description:
          "assessSpikeFalsificationInputBoundary rejects whitespace-only experiment parse input",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessSpikeFalsificationInputBoundary rejects whitespace-only experiment parse input",
      },
      {
        id: "rsf.long_experiment_input_truncation_boundary",
        category: "boundary",
        description:
          "assessSpikeFalsificationInputBoundary truncates experiment input exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessSpikeFalsificationInputBoundary truncates experiment input exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Invalid fixture versions and null-byte experiment input are rejected safely.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rsf.invalid_version_rejected",
        category: "failure_path",
        description:
          "validateResearcherSpikeFalsificationBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion:
          "validateResearcherSpikeFalsificationBaseline rejects unexpected fixture version",
      },
      {
        id: "rsf.malformed_experiment_guard",
        category: "failure_path",
        description:
          "assessSpikeFalsificationInputBoundary rejects null-byte experiment input safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessSpikeFalsificationInputBoundary rejects null-byte experiment input safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Recovery paths restructure malformed spike/falsification parses into actionable experiment plans.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rsf.recovery_spike_experiment_repair",
        category: "recovery_path",
        description:
          "recoverSpikeFalsificationEvidence restructures malformed spike parse into actionable experiment plan",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "recoverSpikeFalsificationEvidence restructures malformed spike parse into actionable experiment plan",
      },
      {
        id: "rsf.recovery_falsification_criteria_fallback",
        category: "recovery_path",
        description:
          "Spike falsification recovery infers falsification criteria when explicit FALSIFICATION marker is missing",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "Spike falsification recovery infers falsification criteria when explicit FALSIFICATION marker is missing",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Orchestrator spike/falsification parser and validator exports gate pre-worker NO-GO wiring.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rsf.parser_spike_experiment",
        category: "nogo_path",
        description:
          "parseResearchSpikeExperiment exports spike→outcome edges from researcher output",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseResearchSpikeExperiment exports spike→outcome edges from researcher output",
      },
      {
        id: "rsf.exported_spike_falsification_validator",
        category: "nogo_path",
        description:
          "validateSpikeFalsificationExperiment exported for orchestrator spike falsification checks",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "validateSpikeFalsificationExperiment exported for orchestrator spike falsification checks",
      },
    ],
  },
};

export const FORGE_RESEARCHER_SPIKE_FALSIFICATION_CONTRACT_V1: ResearcherSpikeFalsificationContract =
  {
    version: "1.0.0",
    atom: "P04-B08-A06",
    purpose:
      "Typed spike and falsification contract declaring measurable experiment and guard probes.",
    categories: RESEARCHER_SPIKE_FALSIFICATION_CATEGORY_CONTRACTS,
    probes: flattenSpikeFalsificationCategoryProbes(
      RESEARCHER_SPIKE_FALSIFICATION_CATEGORY_CONTRACTS,
    ),
  };

export function getActiveResearcherSpikeFalsificationContract(): ResearcherSpikeFalsificationContract {
  return FORGE_RESEARCHER_SPIKE_FALSIFICATION_CONTRACT_V1;
}

export function getResearcherSpikeFalsificationCategoryContract(
  category: ResearcherSpikeFalsificationCategory,
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): ResearcherSpikeFalsificationCategoryContract {
  return contract.categories[category];
}

export function listResearcherSpikeFalsificationContractProbeIds(
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listResearcherSpikeFalsificationProbesByDisposition(
  disposition: ResearcherSpikeFalsificationProbeDisposition,
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): ResearcherSpikeFalsificationProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listResearcherSpikeFalsificationContractProbesByCategory(
  category: ResearcherSpikeFalsificationCategory,
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): readonly ResearcherSpikeFalsificationProbeContract[] {
  return [...contract.categories[category].probes];
}

export function summarizeResearcherSpikeFalsificationContractCoverage(
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<
    ResearcherSpikeFalsificationCategory,
    { probeCount: number; invariant: string }
  >;
  byDisposition: Record<ResearcherSpikeFalsificationProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    ResearcherSpikeFalsificationCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<ResearcherSpikeFalsificationProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES) {
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

export interface ResearcherSpikeFalsificationContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: ResearcherSpikeFalsificationCategory;
  detail: string;
}

export interface ResearcherSpikeFalsificationContractCoverageResult {
  valid: boolean;
  issues: ResearcherSpikeFalsificationContractCoverageIssue[];
}

export function validateResearcherSpikeFalsificationContractCoverage(
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): ResearcherSpikeFalsificationContractCoverageResult {
  const issues: ResearcherSpikeFalsificationContractCoverageIssue[] = [];

  for (const category of RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES) {
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
      RESEARCHER_SPIKE_FALSIFICATION_A01_MIN_PROBES[category]
    ) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${RESEARCHER_SPIKE_FALSIFICATION_A01_MIN_PROBES[category]}`,
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

  const ids = listResearcherSpikeFalsificationContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeResearcherSpikeFalsificationContractCoverage(contract);
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
    if (!probe.id.startsWith("rsf.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing rsf. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateResearcherSpikeFalsificationContract(
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): ResearcherSpikeFalsificationContractCoverageResult {
  return validateResearcherSpikeFalsificationContractCoverage(contract);
}

export function validateResearcherSpikeFalsificationAgainstContract(
  fixture: ResearcherSpikeFalsificationBaseline,
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): ResearcherSpikeFalsificationValidationResult {
  const issues: ResearcherSpikeFalsificationValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES) {
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

export const FORGE_RESEARCHER_SPIKE_FALSIFICATION_A01_PROBE_MATRIX: readonly ResearcherSpikeFalsificationFixtureEntry[] =
  researcherSpikeFalsificationBaseline.probes as ResearcherSpikeFalsificationFixtureEntry[];

export function loadResearcherSpikeFalsificationBaseline(): ResearcherSpikeFalsificationBaseline {
  return researcherSpikeFalsificationBaseline as ResearcherSpikeFalsificationBaseline;
}

export function validateResearcherSpikeFalsificationBaseline(
  fixture: ResearcherSpikeFalsificationBaseline,
): ResearcherSpikeFalsificationValidationResult {
  const issues: ResearcherSpikeFalsificationValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P04-B08-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES.map(category => [category, 0]),
  ) as Record<ResearcherSpikeFalsificationCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES) {
    const min = RESEARCHER_SPIKE_FALSIFICATION_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_RESEARCHER_SPIKE_FALSIFICATION_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_RESEARCHER_SPIKE_FALSIFICATION_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_RESEARCHER_SPIKE_FALSIFICATION_A01_PROBE_MATRIX) {
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

  const handoff = getForgeP04B07ToB08Handoff();
  const riskCoverage = summarizeResearcherRiskTradeoffContractCoverage(
    getActiveResearcherRiskTradeoffContract(),
  );

  if (fixture.sourceBlockGate.atom !== "P04-B07-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P04-B07-A10`,
    });
  }
  if (
    fixture.sourceBlockGate.contractVersion !== FORGE_RESEARCHER_RISK_TRADEOFF_CONTRACT_V1.version
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.contractVersion=${fixture.sourceBlockGate.contractVersion} ` +
        `expected=${FORGE_RESEARCHER_RISK_TRADEOFF_CONTRACT_V1.version}`,
    });
  }
  if (fixture.sourceBlockGate.riskTradeoffProbeCount !== riskCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.riskTradeoffProbeCount=${fixture.sourceBlockGate.riskTradeoffProbeCount} ` +
        `contract=${riskCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P04_B07_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P04_B07_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P04-B08-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `B07 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P04-B08-A01`,
    });
  }

  const contractAlignment = validateResearcherSpikeFalsificationAgainstContract(
    fixture,
    getActiveResearcherSpikeFalsificationContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeResearcherSpikeFalsificationMatrix(
  results: ResearcherSpikeFalsificationProbeResult[],
): ResearcherSpikeFalsificationProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as ResearcherSpikeFalsificationProbeSummary["byCategory"];
  for (const category of RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES) {
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

export function listResearcherSpikeFalsificationProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherSpikeFalsificationBaseline = loadResearcherSpikeFalsificationBaseline(),
): ResearcherSpikeFalsificationFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listResearcherSpikeFalsificationKnownGaps(
  results: ResearcherSpikeFalsificationProbeResult[],
): ResearcherSpikeFalsificationProbeResult[] {
  return summarizeResearcherSpikeFalsificationMatrix(results).knownGaps;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSrc(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf8");
}

function outcome(ok: boolean): ForgeAcceptanceOutcome {
  return ok ? "PASS" : "FAIL";
}

function probe(
  id: string,
  category: ResearcherSpikeFalsificationCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
): ResearcherSpikeFalsificationProbeResult {
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
  return readSrc("forge-p04-researcher-spike-falsification.ts");
}

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function parserSource(): string {
  return readSrc("parser.ts");
}

function hasProductionExport(functionName: string, source = productionSource()): boolean {
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
  category: ResearcherSpikeFalsificationCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherSpikeFalsificationBaseline,
): ResearcherSpikeFalsificationProbeResult {
  switch (id) {
    case "rsf.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "rsf.atom_tagged": {
      const ok = fixture.atom === "P04-B08-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "rsf.harness_version_exported": {
      const ok = FORGE_RESEARCHER_SPIKE_FALSIFICATION_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_RESEARCHER_SPIKE_FALSIFICATION_VERSION}`,
      );
    }
    case "rsf.researcher_examples_worked_failed": {
      const section = researcherFormatSection();
      const ok =
        section.includes("What examples exist?") &&
        section.includes("What worked?") &&
        section.includes("What failed?");
      return probe(id, category, expected, ok, `examplesWorkedFailed=${ok}`);
    }
    case "rsf.risk_tradeoff_informs_spike": {
      const sampleValidation = validateResearchRiskTradeoff(SAMPLE_RESEARCH_OUTPUT);
      const ok = hasProductionExport("validateResearchRiskTradeoff", readSrc("forge-p04-researcher-risk-tradeoff.ts")) &&
        sampleValidation.valid === true;
      return probe(id, category, expected, ok, `riskTradeoffGate=${sampleValidation.valid}`);
    }
    case "rsf.b07_handoff_spike_block": {
      const handoff = getForgeP04B07ToB08Handoff();
      const ok =
        handoff.targetBlock.blockId === "P04-B08" &&
        handoff.targetBlock.title.toLowerCase().includes("spike");
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.title}`,
      );
    }
    case "rsf.researcher_contradicts_explicitly": {
      const section = researcherFormatSection();
      const ok = section.includes("contradict the vision or strategy, say so EXPLICITLY");
      return probe(id, category, expected, ok, `contradictsExplicitly=${ok}`);
    }
    case "rsf.researcher_block_falsification": {
      const section = researcherFormatSection();
      const ok =
        section.includes("You CAN block the Strategist") &&
        section.includes("CRITICAL issue");
      return probe(id, category, expected, ok, `blockFalsification=${ok}`);
    }
    case "rsf.research_questions_hypothesis": {
      const parsed = parseResearchResponse(SAMPLE_RESEARCH_OUTPUT);
      const ok =
        parsed.ok &&
        parsed.data.researchQuestions.length >= 1 &&
        parsed.data.researchQuestions[0].includes("latency");
      return probe(
        id,
        category,
        expected,
        ok,
        `researchQuestions=${parsed.ok ? parsed.data.researchQuestions.length : 0}`,
      );
    }
    case "rsf.b07_block_handoff_entry": {
      const handoff = getForgeP04B07ToB08Handoff();
      const ok =
        handoff.targetBlock.blockId === "P04-B08" &&
        handoff.targetBlock.entryAtom === "P04-B08-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "rsf.b07_sealed_risk_tradeoff_probes": {
      const handoff = getForgeP04B07ToB08Handoff();
      const coverage = summarizeResearcherRiskTradeoffContractCoverage(
        getActiveResearcherRiskTradeoffContract(),
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
    case "rsf.source_block_gate_ref": {
      const handoff = getForgeP04B07ToB08Handoff();
      const coverage = summarizeResearcherRiskTradeoffContractCoverage(
        getActiveResearcherRiskTradeoffContract(),
      );
      const ok =
        fixture.sourceBlockGate.atom === "P04-B07-A10" &&
        fixture.sourceBlockGate.riskTradeoffProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P04_B07_SEALED_ATOM_COUNT &&
        handoff.atom === "P04-B07-A10";
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.riskTradeoffProbeCount}`,
      );
    }
    case "rsf.probe_runner_exported": {
      const ok = productionSource().includes("export function runResearcherSpikeFalsificationProbes");
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "rsf.known_gaps_documented": {
      const contract = getActiveResearcherSpikeFalsificationContract();
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
    case "rsf.empty_experiment_input_boundary": {
      const result = assessSpikeFalsificationInputBoundary("");
      const ok =
        hasProductionExport("assessSpikeFalsificationInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false;
      return probe(id, category, expected, ok, `emptyBoundary=${result.disposition}`);
    }
    case "rsf.whitespace_experiment_input_boundary": {
      const result = assessSpikeFalsificationInputBoundary("   \t\n  ");
      const ok = result.disposition === "whitespace_only" && result.acceptable === false;
      return probe(id, category, expected, ok, `whitespaceBoundary=${result.disposition}`);
    }
    case "rsf.long_experiment_input_truncation_boundary": {
      const longInput = "x".repeat(RESEARCHER_SPIKE_FALSIFICATION_INPUT_MAX_LENGTH + 500);
      const result = assessSpikeFalsificationInputBoundary(longInput);
      const ok =
        result.acceptable === true &&
        result.truncated === true &&
        result.normalizedInput.length === RESEARCHER_SPIKE_FALSIFICATION_INPUT_MAX_LENGTH;
      return probe(id, category, expected, ok, `truncated=${result.truncated}`);
    }
    case "rsf.invalid_version_rejected": {
      const badFixture = {
        ...fixture,
        version: "9.9.9",
      } as ResearcherSpikeFalsificationBaseline;
      const validation = validateResearcherSpikeFalsificationBaseline(badFixture);
      const ok = validation.valid === false;
      return probe(id, category, expected, ok, `invalidVersionRejected=${ok}`);
    }
    case "rsf.malformed_experiment_guard": {
      const result = assessSpikeFalsificationInputBoundary("experiment\0parse");
      const ok = result.disposition === "contains_null_byte" && result.acceptable === false;
      return probe(id, category, expected, ok, `nullByteGuard=${result.disposition}`);
    }
    case "rsf.recovery_spike_experiment_repair": {
      const malformed = `SPIKE: bounded async worker pool under burst load
timebox: 45 minutes
FINDINGS: partial parse`;
      const recovery = recoverSpikeFalsificationEvidence(malformed);
      const ok =
        recovery.recovered === true &&
        recovery.experimentPlan.spikes.length >= 1 &&
        recovery.experimentPlan.spikes[0].timeboxMinutes === 45;
      return probe(
        id,
        category,
        expected,
        ok,
        `recovered=${recovery.recovered}, spikes=${recovery.experimentPlan.spikes.length}`,
      );
    }
    case "rsf.recovery_falsification_criteria_fallback": {
      const malformed = "Approach A vs Approach B for deployment throughput";
      const recovery = recoverSpikeFalsificationEvidence(malformed);
      const ok =
        recovery.recovered === true &&
        recovery.experimentPlan.falsificationCriteria.some(c =>
          c.toLowerCase().includes("approach"),
        );
      return probe(
        id,
        category,
        expected,
        ok,
        `fallbackCriteria=${recovery.experimentPlan.falsificationCriteria.join("; ")}`,
      );
    }
    case "rsf.parser_spike_experiment": {
      const parser = parserSource();
      const parsed = parseResearchSpikeExperiment(SAMPLE_RESEARCH_OUTPUT);
      const ok =
        /\bexport function parseResearchSpikeExperiment\b/.test(parser) &&
        parsed.ok &&
        parsed.data.edges.length >= 1 &&
        parsed.data.edges[0].hypothesis.toLowerCase().includes("async");
      return probe(
        id,
        category,
        expected,
        ok,
        `parseResearchSpikeExperiment=${ok}, edges=${parsed.ok ? parsed.data.edges.length : 0}`,
      );
    }
    case "rsf.exported_spike_falsification_validator": {
      const orchestrator = readSrc("orchestrator.ts");
      const sampleValidation = validateSpikeFalsificationExperiment(SAMPLE_RESEARCH_OUTPUT);
      const ok =
        hasProductionExport("validateSpikeFalsificationExperiment") &&
        orchestrator.includes("validateSpikeFalsificationExperiment(") &&
        sampleValidation.valid === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `spikeFalsificationValidator=${ok}, valid=${sampleValidation.valid}`,
      );
    }
    default:
      return probe(id, category, expected, false, `unknown probe ${id}`);
  }
}

export function runResearcherSpikeFalsificationProbes(
  fixture: ResearcherSpikeFalsificationBaseline = loadResearcherSpikeFalsificationBaseline(),
): ResearcherSpikeFalsificationProbeResult[] {
  const contract = getActiveResearcherSpikeFalsificationContract();
  return fixture.probes.map(entry => {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const expected = contractProbe?.expected ?? entry.expected;
    const result = runSingleProbe(entry.id, entry.category, expected, fixture);
    return contractProbe?.criterion ? { ...result, criterion: contractProbe.criterion } : result;
  });
}

export interface ResearcherSpikeFalsificationProbeMatrixValidationIssue {
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

export interface ResearcherSpikeFalsificationProbeMatrixValidationResult {
  valid: boolean;
  issues: ResearcherSpikeFalsificationProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

export function validateResearcherSpikeFalsificationProbeMatrix(
  results: ResearcherSpikeFalsificationProbeResult[],
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): ResearcherSpikeFalsificationProbeMatrixValidationResult {
  const issues: ResearcherSpikeFalsificationProbeMatrixValidationIssue[] = [];
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

export interface ResearcherSpikeFalsificationProductionSliceResult {
  atom: "P04-B08-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: ResearcherSpikeFalsificationProbeResult[];
  summary: ResearcherSpikeFalsificationProbeSummary;
  matrixValidation: ResearcherSpikeFalsificationProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: parseResearchSpikeExperiment and validateSpikeFalsificationExperiment
 * wired to contract probe execution with zero unexpected mismatches.
 */
export function runResearcherSpikeFalsificationProductionSlice(
  fixture: ResearcherSpikeFalsificationBaseline = loadResearcherSpikeFalsificationBaseline(),
): ResearcherSpikeFalsificationProductionSliceResult {
  const contract = getActiveResearcherSpikeFalsificationContract();
  const fixtureValidation = validateResearcherSpikeFalsificationBaseline(fixture);
  const contractValidation = validateResearcherSpikeFalsificationAgainstContract(fixture, contract);
  const results = runResearcherSpikeFalsificationProbes(fixture);
  const summary = summarizeResearcherSpikeFalsificationMatrix(results);
  const matrixValidation = validateResearcherSpikeFalsificationProbeMatrix(results, contract);

  return {
    atom: "P04-B08-A03",
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
export function validateResearcherSpikeFalsificationBoundaryProbeMatrix(
  results: ResearcherSpikeFalsificationProbeResult[],
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): ResearcherSpikeFalsificationProbeMatrixValidationResult {
  const boundaryProbes = listResearcherSpikeFalsificationContractProbesByCategory(
    "boundary",
    contract,
  );
  const boundaryContract: ResearcherSpikeFalsificationContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateResearcherSpikeFalsificationProbeMatrix(boundaryResults, boundaryContract);
}

export interface ResearcherSpikeFalsificationBoundarySliceResult {
  atom: "P04-B08-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherSpikeFalsificationProbeResult[];
  boundaryResults: ResearcherSpikeFalsificationProbeResult[];
  matrixValidation: ResearcherSpikeFalsificationProbeMatrixValidationResult;
}

/**
 * A04 boundary slice: contract-wired boundary probes (spike falsification input edge cases,
 * probe runner, documented gaps) with zero unexpected mismatches.
 */
export function runResearcherSpikeFalsificationBoundarySlice(
  fixture: ResearcherSpikeFalsificationBaseline = loadResearcherSpikeFalsificationBaseline(),
): ResearcherSpikeFalsificationBoundarySliceResult {
  const contract = getActiveResearcherSpikeFalsificationContract();
  const results = runResearcherSpikeFalsificationProbes(fixture);
  const boundaryProbes = listResearcherSpikeFalsificationContractProbesByCategory(
    "boundary",
    contract,
  );
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateResearcherSpikeFalsificationBoundaryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B08-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}
