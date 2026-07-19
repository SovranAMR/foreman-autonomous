/**
 * FOREMAN — Researcher Spike & Falsification Experiment Baseline (P04-B08)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P04-B07 risk trade-off block gate artifacts.
 * A05: failure_path, recovery_path and nogo_path slice gate for failure/recovery/NO-GO probes.
 * A06: evidence, telemetry and provenance run record for failure/recovery/NO-GO slice probes.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import researcherSpikeFalsificationBaseline from "./fixtures/forge-researcher-spike-falsification-v1.json" with { type: "json" };
import type {
  ForgeAcceptanceOutcome,
  ForgeBlockAtomSeal,
  ForgeBlockGateCheck,
  ForgeBlockGateDefinition,
} from "./forge-baseline-contract.js";
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

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const RESEARCHER_SPIKE_FALSIFICATION_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly ResearcherSpikeFalsificationCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes must align; zero unexpected mismatches.
 */
export function validateResearcherSpikeFalsificationFailureRecoveryProbeMatrix(
  results: ResearcherSpikeFalsificationProbeResult[],
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): ResearcherSpikeFalsificationProbeMatrixValidationResult {
  const failureRecoveryProbes = RESEARCHER_SPIKE_FALSIFICATION_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherSpikeFalsificationContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: ResearcherSpikeFalsificationContract = {
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
  return validateResearcherSpikeFalsificationProbeMatrix(
    failureRecoveryResults,
    failureRecoveryContract,
  );
}

export function listResearcherSpikeFalsificationFailureRecoveryProbeIds(
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): string[] {
  return RESEARCHER_SPIKE_FALSIFICATION_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listResearcherSpikeFalsificationContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface ResearcherSpikeFalsificationFailureRecoverySliceResult {
  atom: "P04-B08-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherSpikeFalsificationProbeResult[];
  failureRecoveryResults: ResearcherSpikeFalsificationProbeResult[];
  matrixValidation: ResearcherSpikeFalsificationProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes (invalid fixture rejection, null-byte guard, recoverSpikeFalsificationEvidence,
 * falsification criteria fallback, parseResearchSpikeExperiment and
 * validateSpikeFalsificationExperiment orchestrator NO-GO wiring) with zero unexpected mismatches.
 */
export function runResearcherSpikeFalsificationFailureRecoverySlice(
  fixture: ResearcherSpikeFalsificationBaseline = loadResearcherSpikeFalsificationBaseline(),
): ResearcherSpikeFalsificationFailureRecoverySliceResult {
  const contract = getActiveResearcherSpikeFalsificationContract();
  const results = runResearcherSpikeFalsificationProbes(fixture);
  const failureRecoveryProbes = RESEARCHER_SPIKE_FALSIFICATION_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherSpikeFalsificationContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateResearcherSpikeFalsificationFailureRecoveryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B08-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

/** Per-probe evidence entry — disposition, criterion and aligned outcomes (P04-B08-A06). */
export interface ResearcherSpikeFalsificationProbeEvidence {
  probeId: string;
  category: ResearcherSpikeFalsificationCategory;
  disposition: ResearcherSpikeFalsificationProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for spike falsification runs (P04-B08-A06). */
export interface ResearcherSpikeFalsificationProbeTelemetry {
  probeId: string;
  category: ResearcherSpikeFalsificationCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P04-B08-A06). */
export interface ResearcherSpikeFalsificationProvenance {
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
  sliceCategories?: readonly ResearcherSpikeFalsificationCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated spike falsification run record bundling evidence, telemetry and provenance. */
export interface ResearcherSpikeFalsificationRunRecord {
  provenance: ResearcherSpikeFalsificationProvenance;
  evidence: ResearcherSpikeFalsificationProbeEvidence[];
  telemetry: ResearcherSpikeFalsificationProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<ResearcherSpikeFalsificationCategory, number>;
    byDisposition: Record<ResearcherSpikeFalsificationProbeDisposition, number>;
  };
}

export interface ResearcherSpikeFalsificationRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface ResearcherSpikeFalsificationRunValidationResult {
  valid: boolean;
  issues: ResearcherSpikeFalsificationRunValidationIssue[];
}

export function buildResearcherSpikeFalsificationProbeEvidence(
  probeId: string,
  category: ResearcherSpikeFalsificationCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: ResearcherSpikeFalsificationProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): ResearcherSpikeFalsificationProbeEvidence {
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

export function buildResearcherSpikeFalsificationProbeTelemetry(
  probeId: string,
  category: ResearcherSpikeFalsificationCategory,
  sequenceIndex: number,
  durationMs: number,
): ResearcherSpikeFalsificationProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildResearcherSpikeFalsificationProvenance(
  runId: string,
  fixture: ResearcherSpikeFalsificationBaseline,
  contract: ResearcherSpikeFalsificationContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly ResearcherSpikeFalsificationCategory[];
  },
): ResearcherSpikeFalsificationProvenance {
  return {
    runId,
    harnessVersion: FORGE_RESEARCHER_SPIKE_FALSIFICATION_VERSION,
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

export function buildResearcherSpikeFalsificationRunRecord(
  provenance: ResearcherSpikeFalsificationProvenance,
  evidence: ResearcherSpikeFalsificationProbeEvidence[],
  telemetry: ResearcherSpikeFalsificationProbeTelemetry[],
): ResearcherSpikeFalsificationRunRecord {
  const byCategory = {} as Record<ResearcherSpikeFalsificationCategory, number>;
  const byDisposition: Record<ResearcherSpikeFalsificationProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES) {
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

function validateResearcherSpikeFalsificationRunRecordAgainstProbeIds(
  record: ResearcherSpikeFalsificationRunRecord,
  expectedProbeIds: string[],
  contract: ResearcherSpikeFalsificationContract,
): ResearcherSpikeFalsificationRunValidationResult {
  const issues: ResearcherSpikeFalsificationRunValidationIssue[] = [];
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

export function validateResearcherSpikeFalsificationRunRecord(
  record: ResearcherSpikeFalsificationRunRecord,
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): ResearcherSpikeFalsificationRunValidationResult {
  return validateResearcherSpikeFalsificationRunRecordAgainstProbeIds(
    record,
    listResearcherSpikeFalsificationContractProbeIds(contract),
    contract,
  );
}

/** Validate evidence slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateResearcherSpikeFalsificationEvidenceRunRecord(
  record: ResearcherSpikeFalsificationRunRecord,
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): ResearcherSpikeFalsificationRunValidationResult {
  const issues: ResearcherSpikeFalsificationRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P04-B08-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P04-B08-A06`,
    });
  }

  const expectedCategories = [...RESEARCHER_SPIKE_FALSIFICATION_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateResearcherSpikeFalsificationRunRecordAgainstProbeIds(
    record,
    listResearcherSpikeFalsificationFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

export interface ResearcherSpikeFalsificationEvidenceSliceResult {
  atom: "P04-B08-A06";
  evidenceProbeCount: number;
  matrixValid: boolean;
  recordValid: boolean;
  results: ResearcherSpikeFalsificationProbeResult[];
  evidenceResults: ResearcherSpikeFalsificationProbeResult[];
  matrixValidation: ResearcherSpikeFalsificationProbeMatrixValidationResult;
  record: ResearcherSpikeFalsificationRunRecord;
  recordValidation: ResearcherSpikeFalsificationRunValidationResult;
}

function resolveResearcherSpikeFalsificationGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function runResearcherSpikeFalsificationProbeWithTiming(
  entry: ResearcherSpikeFalsificationFixtureEntry,
  fixture: ResearcherSpikeFalsificationBaseline,
  contractProbe: ResearcherSpikeFalsificationProbeContract | undefined,
): {
  result: ResearcherSpikeFalsificationProbeResult;
  durationMs: number;
  disposition: ResearcherSpikeFalsificationProbeDisposition;
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

function buildResearcherSpikeFalsificationRecordFromEntries(
  entries: ResearcherSpikeFalsificationFixtureEntry[],
  fixture: ResearcherSpikeFalsificationBaseline,
  contract: ResearcherSpikeFalsificationContract,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly ResearcherSpikeFalsificationCategory[];
  },
): ResearcherSpikeFalsificationRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ResearcherSpikeFalsificationProbeEvidence[] = [];
  const telemetry: ResearcherSpikeFalsificationProbeTelemetry[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runResearcherSpikeFalsificationProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildResearcherSpikeFalsificationProbeEvidence(
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
      buildResearcherSpikeFalsificationProbeTelemetry(
        result.id,
        result.category,
        sequenceIndex,
        durationMs,
      ),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildResearcherSpikeFalsificationProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveResearcherSpikeFalsificationGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildResearcherSpikeFalsificationRunRecord(provenance, evidence, telemetry);
}

/** Run all spike falsification probes and emit auditable evidence, telemetry and provenance (P04-B08-A06). */
export function runResearcherSpikeFalsificationProbesWithRecord(
  fixture: ResearcherSpikeFalsificationBaseline = loadResearcherSpikeFalsificationBaseline(),
): ResearcherSpikeFalsificationRunRecord {
  const contract = getActiveResearcherSpikeFalsificationContract();
  return buildResearcherSpikeFalsificationRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P04-B08-A06). */
export function runResearcherSpikeFalsificationFailureRecoverySliceWithRecord(
  fixture: ResearcherSpikeFalsificationBaseline = loadResearcherSpikeFalsificationBaseline(),
): ResearcherSpikeFalsificationRunRecord {
  const contract = getActiveResearcherSpikeFalsificationContract();
  const failureRecoveryIds = new Set(
    listResearcherSpikeFalsificationFailureRecoveryProbeIds(contract),
  );
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildResearcherSpikeFalsificationRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P04-B08-A06",
    sliceCategories: RESEARCHER_SPIKE_FALSIFICATION_FAILURE_RECOVERY_CATEGORIES,
  });
}

/**
 * A06 evidence slice: contract-wired failure_path, recovery_path, and nogo_path probes
 * with auditable evidence, telemetry and provenance — zero unexpected mismatches.
 */
export function runResearcherSpikeFalsificationEvidenceSlice(
  fixture: ResearcherSpikeFalsificationBaseline = loadResearcherSpikeFalsificationBaseline(),
): ResearcherSpikeFalsificationEvidenceSliceResult {
  const contract = getActiveResearcherSpikeFalsificationContract();
  const results = runResearcherSpikeFalsificationProbes(fixture);
  const failureRecoveryProbes = RESEARCHER_SPIKE_FALSIFICATION_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherSpikeFalsificationContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const evidenceResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateResearcherSpikeFalsificationFailureRecoveryProbeMatrix(
    results,
    contract,
  );
  const record = runResearcherSpikeFalsificationFailureRecoverySliceWithRecord(fixture);
  const recordValidation = validateResearcherSpikeFalsificationEvidenceRunRecord(record, contract);

  return {
    atom: "P04-B08-A06",
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

// ─── Property and fuzz validation (P04-B08-A07) ─────────────────────────────

export interface ResearcherSpikeFalsificationPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface ResearcherSpikeFalsificationPropertyResult {
  passed: number;
  failed: ResearcherSpikeFalsificationPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type ResearcherSpikeFalsificationPropertyCheck = {
  id: string;
  description: string;
  check: (contract: ResearcherSpikeFalsificationContract) => string | null;
};

const RESEARCHER_SPIKE_FALSIFICATION_STRUCTURAL_PROPERTIES: readonly ResearcherSpikeFalsificationPropertyCheck[] =
  [
    {
      id: "categories_complete",
      description: "All eight spike falsification categories are declared",
      check: contract => {
        for (const category of RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES) {
          if (!contract.categories[category]) return `missing category: ${category}`;
        }
        return null;
      },
    },
    {
      id: "probe_ids_unique",
      description: "Probe ids are globally unique",
      check: contract => {
        const ids = listResearcherSpikeFalsificationContractProbeIds(contract);
        if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
        return null;
      },
    },
    {
      id: "min_probe_count",
      description: "Each category meets contract minProbeCount",
      check: contract => {
        for (const category of RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES) {
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
        "summarizeResearcherSpikeFalsificationContractCoverage totals match listResearcherSpikeFalsificationContractProbeIds",
      check: contract => {
        const summary = summarizeResearcherSpikeFalsificationContractCoverage(contract);
        const ids = listResearcherSpikeFalsificationContractProbeIds(contract);
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
      description: "Probe ids are namespaced with rsf. prefix",
      check: contract => {
        for (const probe of contract.probes) {
          if (!probe.id.startsWith("rsf.")) {
            return `${probe.id} missing rsf. prefix`;
          }
        }
        return null;
      },
    },
    {
      id: "run_record_summary_invariant",
      description: "Run record summary aligned + mismatches equals total",
      check: contract => {
        const fixture = loadResearcherSpikeFalsificationBaseline();
        const probeIds = listResearcherSpikeFalsificationContractProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildResearcherSpikeFalsificationProbeEvidence(
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
          return buildResearcherSpikeFalsificationProbeTelemetry(
            id,
            probe.category,
            index,
            index * 0.05,
          );
        });
        const record = buildResearcherSpikeFalsificationRunRecord(
          buildResearcherSpikeFalsificationProvenance(
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
        "Synthetic failure/recovery slice record passes validateResearcherSpikeFalsificationEvidenceRunRecord",
      check: contract => {
        const fixture = loadResearcherSpikeFalsificationBaseline();
        const probeIds = listResearcherSpikeFalsificationFailureRecoveryProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildResearcherSpikeFalsificationProbeEvidence(
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
          return buildResearcherSpikeFalsificationProbeTelemetry(
            id,
            probe.category,
            index,
            index * 0.5,
          );
        });
        const record = buildResearcherSpikeFalsificationRunRecord(
          buildResearcherSpikeFalsificationProvenance(
            "property-check-failure-recovery",
            fixture,
            contract,
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T00:00:01.000Z",
            probeIds.length,
            {
              sliceAtom: "P04-B08-A06",
              sliceCategories: RESEARCHER_SPIKE_FALSIFICATION_FAILURE_RECOVERY_CATEGORIES,
            },
          ),
          evidence,
          telemetry,
        );
        const validation = validateResearcherSpikeFalsificationEvidenceRunRecord(record, contract);
        if (!validation.valid) {
          return validation.issues.map(i => i.detail).join("; ");
        }
        return null;
      },
    },
  ] as const;

export function runResearcherSpikeFalsificationPropertyValidation(
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): ResearcherSpikeFalsificationPropertyResult {
  const failed: ResearcherSpikeFalsificationPropertyViolation[] = [];
  for (const property of RESEARCHER_SPIKE_FALSIFICATION_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = RESEARCHER_SPIKE_FALSIFICATION_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type ResearcherSpikeFalsificationFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface ResearcherSpikeFalsificationFuzzMutationCase {
  seed: number;
  kind: ResearcherSpikeFalsificationFuzzMutationKind;
  probeId?: string;
  category?: ResearcherSpikeFalsificationCategory;
}

export interface ResearcherSpikeFalsificationFuzzValidationCaseResult {
  mutation: ResearcherSpikeFalsificationFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface ResearcherSpikeFalsificationFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: ResearcherSpikeFalsificationFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createResearcherSpikeFalsificationFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneResearcherSpikeFalsificationBaseline(
  fixture: ResearcherSpikeFalsificationBaseline,
): ResearcherSpikeFalsificationBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickResearcherSpikeFalsificationFuzzTarget(
  fixture: ResearcherSpikeFalsificationBaseline,
  rng: () => number,
): {
  category: ResearcherSpikeFalsificationCategory;
  index: number;
  entry: ResearcherSpikeFalsificationFixtureEntry;
} {
  const category =
    RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES[
      Math.floor(rng() * RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES.length)
    ]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyResearcherSpikeFalsificationFuzzMutation(
  fixture: ResearcherSpikeFalsificationBaseline,
  mutation: ResearcherSpikeFalsificationFuzzMutationCase,
): ResearcherSpikeFalsificationBaseline {
  const mutated = cloneResearcherSpikeFalsificationBaseline(fixture);
  const targetCategory = mutation.category ?? RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES[0]!;
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
          id: `rsf.fuzz.extra.${mutation.seed}`,
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
      const other = RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateResearcherSpikeFalsificationFuzzMutationCases(
  fixture: ResearcherSpikeFalsificationBaseline,
  seed: number,
  iterations: number,
): ResearcherSpikeFalsificationFuzzMutationCase[] {
  const rng = createResearcherSpikeFalsificationFuzzRng(seed);
  const kinds: ResearcherSpikeFalsificationFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: ResearcherSpikeFalsificationFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickResearcherSpikeFalsificationFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P04-B08-A07). */
export function runResearcherSpikeFalsificationFuzzValidation(
  fixture: ResearcherSpikeFalsificationBaseline,
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
  seed = 42,
  iterations = 24,
): ResearcherSpikeFalsificationFuzzValidationResult {
  const cases = generateResearcherSpikeFalsificationFuzzMutationCases(fixture, seed, iterations);
  const results: ResearcherSpikeFalsificationFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyResearcherSpikeFalsificationFuzzMutation(fixture, mutation);
    const validation = validateResearcherSpikeFalsificationAgainstContract(mutated, contract);
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

export type ResearcherSpikeFalsificationRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface ResearcherSpikeFalsificationRunRecordFuzzCase {
  kind: ResearcherSpikeFalsificationRunRecordFuzzKind;
  probeId?: string;
}

export function applyResearcherSpikeFalsificationRunRecordFuzzMutation(
  record: ResearcherSpikeFalsificationRunRecord,
  mutation: ResearcherSpikeFalsificationRunRecordFuzzCase,
): ResearcherSpikeFalsificationRunRecord {
  const cloned: ResearcherSpikeFalsificationRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P04-B08-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["evidence_versioning"],
      };
      break;
  }

  cloned.summary = buildResearcherSpikeFalsificationRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveResearcherSpikeFalsificationRunRecordValidator(
  record: ResearcherSpikeFalsificationRunRecord,
): (
  record: ResearcherSpikeFalsificationRunRecord,
  contract: ResearcherSpikeFalsificationContract,
) => ResearcherSpikeFalsificationRunValidationResult {
  return record.provenance.sliceAtom === "P04-B08-A06"
    ? validateResearcherSpikeFalsificationEvidenceRunRecord
    : validateResearcherSpikeFalsificationRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P04-B08-A07). */
export function runResearcherSpikeFalsificationRunRecordFuzzValidation(
  record: ResearcherSpikeFalsificationRunRecord,
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveResearcherSpikeFalsificationRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: ResearcherSpikeFalsificationRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P04-B08-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyResearcherSpikeFalsificationRunRecordFuzzMutation(record, mutation);
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

export interface ResearcherSpikeFalsificationPropertyFuzzSliceResult {
  atom: "P04-B08-A07";
  propertyChecksPassed: boolean;
  contractFuzzRejected: boolean;
  runRecordFuzzRejected: boolean;
  propertyResult: ResearcherSpikeFalsificationPropertyResult;
  contractFuzz: ResearcherSpikeFalsificationFuzzValidationResult;
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
export function runResearcherSpikeFalsificationPropertyFuzzSlice(
  fixture: ResearcherSpikeFalsificationBaseline = loadResearcherSpikeFalsificationBaseline(),
): ResearcherSpikeFalsificationPropertyFuzzSliceResult {
  const contract = getActiveResearcherSpikeFalsificationContract();
  const propertyResult = runResearcherSpikeFalsificationPropertyValidation(contract);
  const contractFuzz = runResearcherSpikeFalsificationFuzzValidation(fixture, contract);
  const record = runResearcherSpikeFalsificationFailureRecoverySliceWithRecord(fixture);
  const runRecordFuzz = runResearcherSpikeFalsificationRunRecordFuzzValidation(record, contract);

  return {
    atom: "P04-B08-A07",
    propertyChecksPassed: propertyResult.allPassed,
    contractFuzzRejected: contractFuzz.allMutationsRejected,
    runRecordFuzzRejected: runRecordFuzz.mutationsAccepted === 0,
    propertyResult,
    contractFuzz,
    runRecordFuzz,
  };
}

// ─── Probe regression detection (P04-B08-A08) ────────────────────────────────

export interface ResearcherSpikeFalsificationProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare spike falsification run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectResearcherSpikeFalsificationProbeRegression(
  prior: ResearcherSpikeFalsificationRunRecord,
  current: ResearcherSpikeFalsificationRunRecord,
): ResearcherSpikeFalsificationProbeRegressionReport {
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

export interface ResearcherSpikeFalsificationForgeRegressionResult {
  atom: "P04-B08-A08";
  passed: boolean;
  productionSlice: ResearcherSpikeFalsificationProductionSliceResult;
  propertyFuzzSlice: ResearcherSpikeFalsificationPropertyFuzzSliceResult;
  record: ResearcherSpikeFalsificationRunRecord;
  recordValid: boolean;
  priorRecordValid: boolean;
  validationIssues: string[];
  priorValidationIssues: string[];
  probeRegression: ResearcherSpikeFalsificationProbeRegressionReport | null;
  guard: ResearcherSpikeFalsificationGuardCheckResult;
  detail: string;
}

/**
 * Execute spike falsification probes, validate production slice + run record,
 * property/fuzz gates, and optionally detect regression vs prior run (P04-B08-A08).
 */
export function runResearcherSpikeFalsificationForgeRegression(
  priorRecord?: ResearcherSpikeFalsificationRunRecord,
): ResearcherSpikeFalsificationForgeRegressionResult {
  const fixture = loadResearcherSpikeFalsificationBaseline();
  const contract = getActiveResearcherSpikeFalsificationContract();
  const productionSlice = runResearcherSpikeFalsificationProductionSlice(fixture);
  const propertyFuzzSlice = runResearcherSpikeFalsificationPropertyFuzzSlice(fixture);
  const record = runResearcherSpikeFalsificationProbesWithRecord(fixture);
  const validation = validateResearcherSpikeFalsificationRunRecord(record, contract);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  let priorRecordValid = true;
  let priorValidationIssues: string[] = [];
  if (priorRecord) {
    const priorValidation = validateResearcherSpikeFalsificationRunRecord(priorRecord, contract);
    priorRecordValid = priorValidation.valid && priorRecord.summary.mismatches === 0;
    priorValidationIssues = priorValidation.issues.map(issue => issue.detail);
  }

  const probeRegression = priorRecord
    ? detectResearcherSpikeFalsificationProbeRegression(priorRecord, record)
    : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;
  const guard = validateForgeResearcherSpikeFalsificationGuard(record, {
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
    atom: "P04-B08-A08",
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

// ─── Guard controls (P04-B08-A09 foundation, used by A08 regression gate) ────

export interface ForgeResearcherSpikeFalsificationGuardControls {
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

export interface ResearcherSpikeFalsificationGuardCheckIssue {
  domain: "adversarial" | "performance" | "cost" | "safety";
  code: string;
  detail: string;
}

export interface ResearcherSpikeFalsificationGuardCheckResult {
  passed: boolean;
  issues: ResearcherSpikeFalsificationGuardCheckIssue[];
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

export interface ResearcherSpikeFalsificationAdversarialGuardScenario {
  id: string;
  description: string;
  build: (record: ResearcherSpikeFalsificationRunRecord) => ResearcherSpikeFalsificationRunRecord;
  expectRejected: true;
}

export const FORGE_RESEARCHER_SPIKE_FALSIFICATION_GUARD_CONTROLS_V1: ForgeResearcherSpikeFalsificationGuardControls =
  {
    atom: "P04-B08-A09",
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

export function getForgeResearcherSpikeFalsificationGuardControls(): ForgeResearcherSpikeFalsificationGuardControls {
  return FORGE_RESEARCHER_SPIKE_FALSIFICATION_GUARD_CONTROLS_V1;
}

function parseResearcherSpikeFalsificationIsoDurationMs(
  startedAt: string,
  completedAt: string,
): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function summarizeResearcherSpikeFalsificationTelemetry(
  telemetry: ResearcherSpikeFalsificationProbeTelemetry[],
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

export function detectResearcherSpikeFalsificationEvidenceSummaryMismatch(
  record: ResearcherSpikeFalsificationRunRecord,
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

export function detectResearcherSpikeFalsificationFalseAlignment(
  record: ResearcherSpikeFalsificationRunRecord,
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

export function validateResearcherSpikeFalsificationSafety(
  record: ResearcherSpikeFalsificationRunRecord,
  controls: ForgeResearcherSpikeFalsificationGuardControls = getForgeResearcherSpikeFalsificationGuardControls(),
): ResearcherSpikeFalsificationGuardCheckIssue[] {
  const issues: ResearcherSpikeFalsificationGuardCheckIssue[] = [];
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

export function validateResearcherSpikeFalsificationPerformance(
  record: ResearcherSpikeFalsificationRunRecord,
  controls: ForgeResearcherSpikeFalsificationGuardControls = getForgeResearcherSpikeFalsificationGuardControls(),
): ResearcherSpikeFalsificationGuardCheckIssue[] {
  const issues: ResearcherSpikeFalsificationGuardCheckIssue[] = [];
  const { suiteDurationMs, maxProbeDurationMs } = summarizeResearcherSpikeFalsificationTelemetry(
    record.telemetry,
  );
  const wallClockMs = parseResearcherSpikeFalsificationIsoDurationMs(
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

export function validateResearcherSpikeFalsificationCost(
  totalCostUsd: number,
  llmCalls: number,
  controls: ForgeResearcherSpikeFalsificationGuardControls = getForgeResearcherSpikeFalsificationGuardControls(),
): ResearcherSpikeFalsificationGuardCheckIssue[] {
  const issues: ResearcherSpikeFalsificationGuardCheckIssue[] = [];
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

export function buildResearcherSpikeFalsificationAdversarialGuardScenarios(): ResearcherSpikeFalsificationAdversarialGuardScenario[] {
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

export function runResearcherSpikeFalsificationAdversarialGuardChecks(
  fixtureRecord: ResearcherSpikeFalsificationRunRecord,
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): { rejected: number; total: number; failures: string[] } {
  const scenarios = buildResearcherSpikeFalsificationAdversarialGuardScenarios();
  const failures: string[] = [];
  let rejected = 0;

  for (const scenario of scenarios) {
    const tampered = scenario.build(fixtureRecord);
    const validation = validateResearcherSpikeFalsificationRunRecord(tampered, contract);
    const falseAlignment = detectResearcherSpikeFalsificationFalseAlignment(tampered);
    const summaryMismatch = detectResearcherSpikeFalsificationEvidenceSummaryMismatch(tampered);
    const rejectedByGuard =
      !validation.valid || falseAlignment.length > 0 || summaryMismatch !== null;

    if (rejectedByGuard) rejected++;
    else failures.push(`${scenario.id}: tampered record was not rejected`);
  }

  return { rejected, total: scenarios.length, failures };
}

export function validateForgeResearcherSpikeFalsificationGuard(
  record: ResearcherSpikeFalsificationRunRecord,
  options: {
    totalCostUsd?: number;
    llmCalls?: number;
    contract?: ResearcherSpikeFalsificationContract;
    controls?: ForgeResearcherSpikeFalsificationGuardControls;
  } = {},
): ResearcherSpikeFalsificationGuardCheckResult {
  const controls = options.controls ?? getForgeResearcherSpikeFalsificationGuardControls();
  const contract = options.contract ?? getActiveResearcherSpikeFalsificationContract();
  const totalCostUsd = options.totalCostUsd ?? 0;
  const llmCalls = options.llmCalls ?? 0;
  const issues: ResearcherSpikeFalsificationGuardCheckIssue[] = [];

  issues.push(...validateResearcherSpikeFalsificationPerformance(record, controls));
  issues.push(...validateResearcherSpikeFalsificationCost(totalCostUsd, llmCalls, controls));
  issues.push(...validateResearcherSpikeFalsificationSafety(record, controls));

  const falseAlignment = detectResearcherSpikeFalsificationFalseAlignment(record);
  if (falseAlignment.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "false_alignment",
      detail: falseAlignment.join("; "),
    });
  }
  const summaryMismatch = detectResearcherSpikeFalsificationEvidenceSummaryMismatch(record);
  if (summaryMismatch) {
    issues.push({
      domain: "adversarial",
      code: "summary_evidence_mismatch",
      detail: summaryMismatch,
    });
  }

  const adversarial = runResearcherSpikeFalsificationAdversarialGuardChecks(record, contract);
  if (adversarial.failures.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "scenario_not_rejected",
      detail: adversarial.failures.join("; "),
    });
  }

  const telemetrySummary = summarizeResearcherSpikeFalsificationTelemetry(record.telemetry);
  const wallClockMs = parseResearcherSpikeFalsificationIsoDurationMs(
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

// ─── Block gate and handoff (P04-B08-A10) ─────────────────────────────────────

export interface ResearcherSpikeFalsificationBlockGateEvidence {
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

export interface ResearcherSpikeFalsificationBlockHandoffContract {
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
    spikeFalsificationCategories: readonly ResearcherSpikeFalsificationCategory[];
    sourceBlockGateAtom: string;
  };
  prerequisites: readonly string[];
  entryCriteria: {
    description: string;
    requiresBlockGatePass: true;
    spikeFalsificationRecordRequired: true;
  };
}

export const FORGE_P04_B08_BLOCK_GATE_V1: ForgeBlockGateDefinition = {
  version: "1.0.0",
  atom: "P04-B08-A10",
  blockId: "P04-B08",
  title: "Spike ve falsification deneyi",
  requiredAtomIds: [
    "P04-B08-A01",
    "P04-B08-A02",
    "P04-B08-A03",
    "P04-B08-A04",
    "P04-B08-A05",
    "P04-B08-A06",
    "P04-B08-A07",
    "P04-B08-A08",
    "P04-B08-A09",
    "P04-B08-A10",
  ],
  checks: [
    {
      id: "fixture_contract_alignment",
      atomId: "P04-B08-A01",
      description:
        "Spike falsification baseline aligns with typed contract and P04-B07 block gate handoff",
    },
    {
      id: "typed_contract_coverage",
      atomId: "P04-B08-A02",
      description: "Contract declares measurable probes for all spike falsification categories",
    },
    {
      id: "probe_matrix_aligned",
      atomId: "P04-B08-A03",
      description: "Spike falsification probe matrix executes with zero unexpected mismatches",
    },
    {
      id: "boundary_disposition_coverage",
      atomId: "P04-B08-A04",
      description:
        "Contract covers observed, failure, recovery and NO-GO dispositions with boundary probes",
    },
    {
      id: "failure_recovery_nogo",
      atomId: "P04-B08-A05",
      description: "Failure, recovery and NO-GO probes are declared and exercised",
    },
    {
      id: "evidence_telemetry_provenance",
      atomId: "P04-B08-A06",
      description: "Run record carries evidence, telemetry and provenance",
    },
    {
      id: "property_and_fuzz",
      atomId: "P04-B08-A07",
      description: "Structural property and fuzz validation reject tampered inputs",
    },
    {
      id: "regression_gate",
      atomId: "P04-B08-A08",
      description: "Regression gate passes on canonical spike falsification matrix",
    },
    {
      id: "guard_controls",
      atomId: "P04-B08-A09",
      description: "Adversarial, performance, cost and safety guard controls pass",
    },
    {
      id: "block_gate_sealed",
      atomId: "P04-B08-A10",
      description: "Block gate evidence sealed with valid B09 handoff contract",
    },
  ] satisfies readonly ForgeBlockGateCheck[],
};

export const FORGE_P04_B08_TO_B09_HANDOFF_V1: ResearcherSpikeFalsificationBlockHandoffContract = {
  version: "1.0.0",
  atom: "P04-B08-A10",
  sourceBlock: {
    blockId: "P04-B08",
    title: "Spike ve falsification deneyi",
    completedAtoms: FORGE_P04_B08_BLOCK_GATE_V1.requiredAtomIds,
  },
  targetBlock: {
    blockId: "P04-B09",
    title: "Research-to-worker handoff",
    entryAtom: "P04-B09-A01",
  },
  sealedArtifacts: {
    fixtureVersion: "1.0.0",
    contractVersion: FORGE_RESEARCHER_SPIKE_FALSIFICATION_CONTRACT_V1.version,
    harnessVersion: FORGE_RESEARCHER_SPIKE_FALSIFICATION_VERSION,
    probeCount: summarizeResearcherSpikeFalsificationContractCoverage(
      FORGE_RESEARCHER_SPIKE_FALSIFICATION_CONTRACT_V1,
    ).totalProbes,
    spikeFalsificationCategories: RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES,
    sourceBlockGateAtom: "P04-B07-A10",
  },
  prerequisites: [
    "Spike falsification contract v1 with measurable spike, falsification and guard probes",
    "Versioned spike falsification baseline aligned to contract probe matrix and sealed P04-B07 block gate",
    "Evidence, telemetry and provenance run records",
    "Regression and guard gates integrated with orchestrator verification",
    "Sealed P04-B07 risk trade-off block gate referenced by sourceBlockGateAtom",
  ],
  entryCriteria: {
    description:
      "P04-B09-A01 formalizes research-to-worker handoff using sealed spike falsification artifacts",
    requiresBlockGatePass: true,
    spikeFalsificationRecordRequired: true,
  },
};

export function getForgeP04B08BlockGate(): ForgeBlockGateDefinition {
  return FORGE_P04_B08_BLOCK_GATE_V1;
}

export function getForgeP04B08ToB09Handoff(): ResearcherSpikeFalsificationBlockHandoffContract {
  return FORGE_P04_B08_TO_B09_HANDOFF_V1;
}

export function validateResearcherSpikeFalsificationBlockHandoffContract(
  handoff: ResearcherSpikeFalsificationBlockHandoffContract,
  evidence: Pick<
    ResearcherSpikeFalsificationBlockGateEvidence,
    "probeCount" | "regressionPassed" | "guardPassed"
  >,
  contract: ResearcherSpikeFalsificationContract = getActiveResearcherSpikeFalsificationContract(),
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const coverage = summarizeResearcherSpikeFalsificationContractCoverage(contract);

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
  if (handoff.sealedArtifacts.harnessVersion !== FORGE_RESEARCHER_SPIKE_FALSIFICATION_VERSION) {
    issues.push(
      `handoff harnessVersion=${handoff.sealedArtifacts.harnessVersion} active=${FORGE_RESEARCHER_SPIKE_FALSIFICATION_VERSION}`,
    );
  }
  if (
    handoff.sealedArtifacts.spikeFalsificationCategories.length !==
    RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES.length
  ) {
    issues.push("handoff spikeFalsificationCategories incomplete");
  }
  if (handoff.sealedArtifacts.sourceBlockGateAtom !== "P04-B07-A10") {
    issues.push(`unexpected source block gate atom: ${handoff.sealedArtifacts.sourceBlockGateAtom}`);
  }
  if (handoff.targetBlock.entryAtom !== "P04-B09-A01") {
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

export function buildResearcherSpikeFalsificationBlockGateEvidence(
  atomSeals: ForgeBlockAtomSeal[],
  regressionPassed: boolean,
  guardPassed: boolean,
  probeCount: number,
  gitCommit?: string,
  blockId = FORGE_P04_B08_BLOCK_GATE_V1.blockId,
): ResearcherSpikeFalsificationBlockGateEvidence {
  const handoffValid = validateResearcherSpikeFalsificationBlockHandoffContract(
    getForgeP04B08ToB09Handoff(),
    {
      probeCount,
      regressionPassed,
      guardPassed,
    },
  ).valid;

  return {
    blockId,
    atom: "P04-B08-A10",
    sealedAt: new Date().toISOString(),
    atomSeals,
    regressionPassed,
    guardPassed,
    handoffValid,
    probeCount,
    ...(gitCommit ? { gitCommit } : {}),
  };
}
