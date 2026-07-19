/**
 * FOREMAN — Researcher Question Decomposition Baseline (P04-B01)
 *
 * A01 slice: load, validate, run probes, contract alignment against sealed
 * P03 strategist phase gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import researcherQuestionDecompositionBaseline from "./fixtures/forge-researcher-question-decomposition-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
import {
  getForgeP03ToP04PhaseHandoff,
  P03_STRATEGIST_PHASE_BLOCK_COUNT,
} from "./forge-p03-strategist-phase-gate.js";
import {
  getActiveStrategistProvenanceContract,
  summarizeStrategistProvenanceCoverage,
  FORGE_STRATEGIST_PROVENANCE_VERSION,
} from "./forge-p03-strategist-provenance.js";
import { parseResearchResponse } from "./parser.js";

export const FORGE_RESEARCHER_QUESTION_DECOMPOSITION_VERSION = "1.0.0-a02";

export const EXPECTED_P03_PHASE_GATE_SEALED_BLOCK_COUNT = P03_STRATEGIST_PHASE_BLOCK_COUNT;

/** Maximum normalized block task length before truncation (P04-B01-A01 boundary). */
export const RESEARCHER_QUESTION_BLOCK_MAX_LENGTH = 32000;

export const RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES = [
  "question_versioning",
  "question_signal",
  "subquery_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type ResearcherQuestionDecompositionCategory =
  (typeof RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES)[number];

export type ResearchQuestionInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface ResearchQuestionInputBoundary {
  disposition: ResearchQuestionInputDisposition;
  acceptable: boolean;
  normalizedBlock: string;
  truncated: boolean;
  detail: string;
}

/**
 * Assess block task input boundary conditions before research question decomposition (P04-B01-A01).
 */
export function assessResearchQuestionInputBoundary(
  blockTask: string,
): ResearchQuestionInputBoundary {
  if (blockTask.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedBlock: "",
      truncated: false,
      detail: "null byte detected in block task input",
    };
  }

  const trimmed = blockTask.trim();
  if (trimmed.length === 0) {
    const disposition: ResearchQuestionInputDisposition =
      blockTask.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedBlock: "",
      truncated: false,
      detail: disposition === "empty" ? "empty block task input" : "whitespace-only block task input",
    };
  }

  let normalizedBlock = blockTask;
  let truncated = false;
  if (normalizedBlock.length > RESEARCHER_QUESTION_BLOCK_MAX_LENGTH) {
    normalizedBlock = normalizedBlock.slice(0, RESEARCHER_QUESTION_BLOCK_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedBlock,
    truncated,
    detail: truncated
      ? `block task truncated to ${RESEARCHER_QUESTION_BLOCK_MAX_LENGTH} characters`
      : "valid block task input",
  };
}

export interface ResearchQuestionDecompositionPresence {
  hasResearchQuestions: boolean;
  questions: string[];
  questionCount: number;
  detail: string;
}

const NUMBERED_QUESTION_LINE = /^\s*(?:\d+[.)]|[-*])\s+(.+)$/;

/**
 * Parse numbered or bulleted research questions from a RESEARCH_QUESTIONS section.
 */
export function parseResearchQuestionsFromText(text: string): string[] {
  const sectionMatch = text.match(
    /RESEARCH_QUESTIONS:\s*([\s\S]*?)(?:\n(?:FINDINGS|RELEVANCE|RISKS|REASONING)|$)/i,
  );
  const source = sectionMatch?.[1]?.trim() ?? text.trim();
  if (source.length === 0) {
    return [];
  }

  const questions: string[] = [];
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const numbered = trimmed.match(NUMBERED_QUESTION_LINE);
    if (numbered) {
      questions.push(numbered[1].trim());
      continue;
    }
    if (!/^(RESEARCH_QUESTIONS|FINDINGS|RELEVANCE|RISKS):/i.test(trimmed)) {
      questions.push(trimmed);
    }
  }

  return questions.filter(q => q.length > 0);
}

/**
 * Assess whether researcher output declares decomposed RESEARCH_QUESTIONS (P04-B01-A01).
 */
export function assessResearchQuestionDecompositionPresence(
  researchOutput: string,
): ResearchQuestionDecompositionPresence {
  const boundary = assessResearchQuestionInputBoundary(researchOutput);
  if (!boundary.acceptable) {
    return {
      hasResearchQuestions: false,
      questions: [],
      questionCount: 0,
      detail: boundary.detail,
    };
  }

  const questions = parseResearchQuestionsFromText(boundary.normalizedBlock);
  const hasResearchQuestions = questions.length > 0;

  return {
    hasResearchQuestions,
    questions,
    questionCount: questions.length,
    detail:
      `questionCount=${questions.length}` +
      (questions[0] ? `, first="${questions[0].slice(0, 40)}"` : ""),
  };
}

export interface ResearchQuestionDecompositionValidationOutcome {
  valid: boolean;
  questionCount: number;
  hasFindings: boolean;
  issues: string[];
}

/**
 * Validate researcher output declares decomposed questions before findings (P04-B01-A03 target).
 */
export function validateResearchQuestionDecomposition(
  researchOutput: string,
): ResearchQuestionDecompositionValidationOutcome {
  const boundary = assessResearchQuestionInputBoundary(researchOutput);
  if (!boundary.acceptable) {
    return {
      valid: false,
      questionCount: 0,
      hasFindings: false,
      issues: [boundary.detail],
    };
  }

  const presence = assessResearchQuestionDecompositionPresence(boundary.normalizedBlock);
  const parsed = parseResearchResponse(boundary.normalizedBlock);
  const hasFindings = parsed.ok && parsed.data.findings.length > 0;
  const issues: string[] = [];

  if (presence.questionCount === 0) {
    issues.push("missing_research_questions");
  }
  if (!hasFindings) {
    issues.push("missing_findings");
  }

  return {
    valid: issues.length === 0,
    questionCount: presence.questionCount,
    hasFindings,
    issues,
  };
}

export const RESEARCHER_QUESTION_DECOMPOSITION_A01_MIN_PROBES: Readonly<
  Record<ResearcherQuestionDecompositionCategory, number>
> = {
  question_versioning: 3,
  question_signal: 5,
  subquery_signal: 4,
  baseline_link: 2,
  boundary: 4,
  failure_path: 3,
  recovery_path: 2,
  nogo_path: 2,
};

export interface ResearcherQuestionDecompositionFixtureEntry {
  id: string;
  category: ResearcherQuestionDecompositionCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface ResearcherQuestionDecompositionBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourcePhaseGate: {
    version: string;
    atom: string;
    contractVersion: string;
    strategistProvenanceProbeCount: number;
    sealedBlockCount: number;
  };
  probes: ResearcherQuestionDecompositionFixtureEntry[];
}

export interface ResearcherQuestionDecompositionProbeResult {
  id: string;
  category: ResearcherQuestionDecompositionCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface ResearcherQuestionDecompositionProbeSummary {
  total: number;
  aligned: number;
  mismatches: ResearcherQuestionDecompositionProbeResult[];
  knownGaps: ResearcherQuestionDecompositionProbeResult[];
  byCategory: Record<
    ResearcherQuestionDecompositionCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface ResearcherQuestionDecompositionValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: ResearcherQuestionDecompositionCategory;
  detail: string;
}

export interface ResearcherQuestionDecompositionValidationResult {
  valid: boolean;
  issues: ResearcherQuestionDecompositionValidationIssue[];
}

export interface ResearcherQuestionDecompositionContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: ResearcherQuestionDecompositionCategory;
  detail: string;
}

export interface ResearcherQuestionDecompositionContractCoverageResult {
  valid: boolean;
  issues: ResearcherQuestionDecompositionContractCoverageIssue[];
}

export type ResearcherQuestionDecompositionProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface ResearcherQuestionDecompositionProbeContract {
  id: string;
  category: ResearcherQuestionDecompositionCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: ResearcherQuestionDecompositionProbeDisposition;
  criterion: string;
}

export interface ResearcherQuestionDecompositionCategoryContract {
  category: ResearcherQuestionDecompositionCategory;
  acceptance: {
    invariant: string;
    minProbeCount: number;
    requireFullAlignment: boolean;
  };
  probes: readonly ResearcherQuestionDecompositionProbeContract[];
}

export interface ResearcherQuestionDecompositionContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<
    ResearcherQuestionDecompositionCategory,
    ResearcherQuestionDecompositionCategoryContract
  >;
  probes: readonly ResearcherQuestionDecompositionProbeContract[];
}

function flattenCategoryProbes(
  categories: Record<
    ResearcherQuestionDecompositionCategory,
    ResearcherQuestionDecompositionCategoryContract
  >,
): readonly ResearcherQuestionDecompositionProbeContract[] {
  return RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES.flatMap(
    category => categories[category].probes,
  );
}

const RESEARCHER_QUESTION_DECOMPOSITION_CATEGORY_CONTRACTS: Record<
  ResearcherQuestionDecompositionCategory,
  ResearcherQuestionDecompositionCategoryContract
> = {
  question_versioning: {
    category: "question_versioning",
    acceptance: {
      invariant:
        "Researcher question decomposition baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rques.version_tagged",
        category: "question_versioning",
        description: "Researcher question decomposition baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Researcher question decomposition baseline declares semver version field",
      },
      {
        id: "rques.atom_tagged",
        category: "question_versioning",
        description: "Researcher question decomposition baseline declares P04-B01-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Researcher question decomposition baseline declares P04-B01-A01 atom id",
      },
      {
        id: "rques.harness_version_exported",
        category: "question_versioning",
        description:
          "FORGE_RESEARCHER_QUESTION_DECOMPOSITION_VERSION exported for question decomposition harness",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "FORGE_RESEARCHER_QUESTION_DECOMPOSITION_VERSION exported for question decomposition harness",
      },
    ],
  },
  question_signal: {
    category: "question_signal",
    acceptance: {
      invariant:
        "Researcher prompt and parser expose RESEARCH_QUESTIONS signal before findings synthesis.",
      minProbeCount: 5,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "rques.prompt_research_questions",
        category: "question_signal",
        description: "RESEARCHER_SYSTEM prompt declares RESEARCH_QUESTIONS output field before findings",
        expected: "FAIL",
        disposition: "gap",
        criterion: "RESEARCHER_SYSTEM prompt declares RESEARCH_QUESTIONS output field before findings",
      },
      {
        id: "rques.parser_research_questions_extract",
        category: "question_signal",
        description: "parseResearchResponse extracts RESEARCH_QUESTIONS list from researcher output",
        expected: "FAIL",
        disposition: "gap",
        criterion: "parseResearchResponse extracts RESEARCH_QUESTIONS list from researcher output",
      },
      {
        id: "rques.researcher_findings_format",
        category: "question_signal",
        description: "RESEARCHER_SYSTEM prompt declares FINDINGS output field",
        expected: "PASS",
        disposition: "observed",
        criterion: "RESEARCHER_SYSTEM prompt declares FINDINGS output field",
      },
      {
        id: "rques.parser_findings_extract",
        category: "question_signal",
        description: "parseResearchResponse extracts FINDINGS from researcher output",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseResearchResponse extracts FINDINGS from researcher output",
      },
      {
        id: "rques.presence_question_detect",
        category: "question_signal",
        description:
          "assessResearchQuestionDecompositionPresence detects RESEARCH_QUESTIONS in researcher output",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessResearchQuestionDecompositionPresence detects RESEARCH_QUESTIONS in researcher output",
      },
    ],
  },
  subquery_signal: {
    category: "subquery_signal",
    acceptance: {
      invariant:
        "Block tasks decompose into measurable sub-queries before unified research execution.",
      minProbeCount: 4,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "rques.decompose_research_questions_fn",
        category: "subquery_signal",
        description: "decomposeResearchQuestions splits block task into measurable sub-queries",
        expected: "FAIL",
        disposition: "gap",
        criterion: "decomposeResearchQuestions splits block task into measurable sub-queries",
      },
      {
        id: "rques.orchestrator_pre_research_decompose",
        category: "subquery_signal",
        description: "Orchestrator decomposes research questions before researcher stepWithPhase",
        expected: "FAIL",
        disposition: "gap",
        criterion: "Orchestrator decomposes research questions before researcher stepWithPhase",
      },
      {
        id: "rques.research_engine_single_query",
        category: "subquery_signal",
        description: "research-engine research() accepts query string for unified research context",
        expected: "PASS",
        disposition: "observed",
        criterion: "research-engine research() accepts query string for unified research context",
      },
      {
        id: "rques.block_keyword_query_extract",
        category: "subquery_signal",
        description: "Orchestrator extracts block keywords for pre-research web search context",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator extracts block keywords for pre-research web search context",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Question decomposition baseline links to sealed P03 strategist phase gate handoff artifacts.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rques.p03_phase_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P03_TO_P04_PHASE_HANDOFF_V1 targets P04-B01-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P03_TO_P04_PHASE_HANDOFF_V1 targets P04-B01-A01 entry atom",
      },
      {
        id: "rques.p03_sealed_provenance_probes",
        category: "baseline_link",
        description:
          "P03→P04 handoff sealed probeCount matches active strategist provenance contract",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "P03→P04 handoff sealed probeCount matches active strategist provenance contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Question decomposition baseline documents source phase gate references and block input boundaries.",
      minProbeCount: 4,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rques.source_phase_gate_ref",
        category: "boundary",
        description:
          "Baseline fixture references sealed P03 strategist phase gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Baseline fixture references sealed P03 strategist phase gate source artifacts",
      },
      {
        id: "rques.probe_runner_exported",
        category: "boundary",
        description: "runResearcherQuestionDecompositionProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runResearcherQuestionDecompositionProbes executes contract-wired probe matrix",
      },
      {
        id: "rques.known_gaps_documented",
        category: "boundary",
        description:
          "Baseline fixture documents at least one measurable FAIL question decomposition gap",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Baseline fixture documents at least one measurable FAIL question decomposition gap",
      },
      {
        id: "rques.empty_block_boundary",
        category: "boundary",
        description: "assessResearchQuestionInputBoundary rejects empty block task input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessResearchQuestionInputBoundary rejects empty block task input",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Baseline validation rejects invalid fixture versions and malformed block input.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rques.invalid_version_rejected",
        category: "failure_path",
        description:
          "validateResearcherQuestionDecompositionBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion:
          "validateResearcherQuestionDecompositionBaseline rejects unexpected fixture version",
      },
      {
        id: "rques.malformed_block_guard",
        category: "failure_path",
        description: "assessResearchQuestionInputBoundary rejects null-byte block task input safely",
        expected: "PASS",
        disposition: "failure",
        criterion: "assessResearchQuestionInputBoundary rejects null-byte block task input safely",
      },
      {
        id: "rques.min_category_probes",
        category: "failure_path",
        description:
          "validateResearcherQuestionDecompositionBaseline enforces per-category minimum probe counts",
        expected: "PASS",
        disposition: "failure",
        criterion:
          "validateResearcherQuestionDecompositionBaseline enforces per-category minimum probe counts",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Researcher recovery paths skip memory re-research and tolerate non-fatal research blocks.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rques.researcher_memory_skip",
        category: "recovery_path",
        description: "Researcher prompt skips re-researching items already in memory",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Researcher prompt skips re-researching items already in memory",
      },
      {
        id: "rques.research_block_non_fatal",
        category: "recovery_path",
        description: "Orchestrator treats researcher BLOCK as non-fatal and continues pipeline",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Orchestrator treats researcher BLOCK as non-fatal and continues pipeline",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Pipeline halts when question decomposition fails and orchestrator validates sub-queries.",
      minProbeCount: 2,
      requireFullAlignment: false,
    },
    probes: [
      {
        id: "rques.nogo_empty_question_halt",
        category: "nogo_path",
        description:
          "Pipeline halts research when question decomposition yields zero actionable sub-queries",
        expected: "FAIL",
        disposition: "nogo",
        criterion:
          "Pipeline halts research when question decomposition yields zero actionable sub-queries",
      },
      {
        id: "rques.exported_orchestrator_question_validator",
        category: "nogo_path",
        description:
          "validateResearchQuestionDecomposition exported for orchestrator pre-research checks",
        expected: "FAIL",
        disposition: "nogo",
        criterion:
          "validateResearchQuestionDecomposition exported for orchestrator pre-research checks",
      },
    ],
  },
};

export const FORGE_RESEARCHER_QUESTION_DECOMPOSITION_CONTRACT_V1: ResearcherQuestionDecompositionContract =
  {
    version: "1.0.0",
    atom: "P04-B01-A06",
    purpose:
      "Typed researcher question decomposition contract aligned to baseline probe matrix and sealed P03 phase gate.",
    categories: RESEARCHER_QUESTION_DECOMPOSITION_CATEGORY_CONTRACTS,
    probes: flattenCategoryProbes(RESEARCHER_QUESTION_DECOMPOSITION_CATEGORY_CONTRACTS),
  };

export function getActiveResearcherQuestionDecompositionContract(): ResearcherQuestionDecompositionContract {
  return FORGE_RESEARCHER_QUESTION_DECOMPOSITION_CONTRACT_V1;
}

export function getResearcherQuestionDecompositionCategoryContract(
  category: ResearcherQuestionDecompositionCategory,
  contract: ResearcherQuestionDecompositionContract = getActiveResearcherQuestionDecompositionContract(),
): ResearcherQuestionDecompositionCategoryContract {
  return contract.categories[category];
}

export function listResearcherQuestionDecompositionContractProbeIds(
  contract: ResearcherQuestionDecompositionContract = getActiveResearcherQuestionDecompositionContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listResearcherQuestionDecompositionProbesByDisposition(
  disposition: ResearcherQuestionDecompositionProbeDisposition,
  contract: ResearcherQuestionDecompositionContract = getActiveResearcherQuestionDecompositionContract(),
): ResearcherQuestionDecompositionProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listResearcherQuestionDecompositionContractProbesByCategory(
  category: ResearcherQuestionDecompositionCategory,
  contract: ResearcherQuestionDecompositionContract = getActiveResearcherQuestionDecompositionContract(),
): ResearcherQuestionDecompositionProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeResearcherQuestionDecompositionContractCoverage(
  contract: ResearcherQuestionDecompositionContract = getActiveResearcherQuestionDecompositionContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<
    ResearcherQuestionDecompositionCategory,
    { probeCount: number; invariant: string }
  >;
  byDisposition: Record<ResearcherQuestionDecompositionProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    ResearcherQuestionDecompositionCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<ResearcherQuestionDecompositionProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES) {
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

export function validateResearcherQuestionDecompositionContractCoverage(
  contract: ResearcherQuestionDecompositionContract = getActiveResearcherQuestionDecompositionContract(),
): ResearcherQuestionDecompositionContractCoverageResult {
  const issues: ResearcherQuestionDecompositionContractCoverageIssue[] = [];

  for (const category of RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES) {
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
      RESEARCHER_QUESTION_DECOMPOSITION_A01_MIN_PROBES[category]
    ) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${RESEARCHER_QUESTION_DECOMPOSITION_A01_MIN_PROBES[category]}`,
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

  const ids = listResearcherQuestionDecompositionContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeResearcherQuestionDecompositionContractCoverage(contract);
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
    if (!probe.id.startsWith("rques.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing rques. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateResearcherQuestionDecompositionAgainstContract(
  fixture: ResearcherQuestionDecompositionBaseline,
  contract: ResearcherQuestionDecompositionContract = getActiveResearcherQuestionDecompositionContract(),
): ResearcherQuestionDecompositionValidationResult {
  const issues: ResearcherQuestionDecompositionValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  for (const category of RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES) {
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

export const FORGE_RESEARCHER_QUESTION_DECOMPOSITION_A01_PROBE_MATRIX: readonly ResearcherQuestionDecompositionFixtureEntry[] =
  researcherQuestionDecompositionBaseline.probes as ResearcherQuestionDecompositionFixtureEntry[];

export function loadResearcherQuestionDecompositionBaseline(): ResearcherQuestionDecompositionBaseline {
  return researcherQuestionDecompositionBaseline as ResearcherQuestionDecompositionBaseline;
}

export function validateResearcherQuestionDecompositionBaseline(
  fixture: ResearcherQuestionDecompositionBaseline,
): ResearcherQuestionDecompositionValidationResult {
  const issues: ResearcherQuestionDecompositionValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P04-B01-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES.map(category => [category, 0]),
  ) as Record<ResearcherQuestionDecompositionCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES) {
    const min = RESEARCHER_QUESTION_DECOMPOSITION_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_RESEARCHER_QUESTION_DECOMPOSITION_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_RESEARCHER_QUESTION_DECOMPOSITION_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_RESEARCHER_QUESTION_DECOMPOSITION_A01_PROBE_MATRIX) {
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

  const handoff = getForgeP03ToP04PhaseHandoff();
  const provenanceCoverage = summarizeStrategistProvenanceCoverage(
    getActiveStrategistProvenanceContract(),
  );

  if (fixture.sourcePhaseGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourcePhaseGate.atom=${fixture.sourcePhaseGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (fixture.sourcePhaseGate.contractVersion !== FORGE_STRATEGIST_PROVENANCE_VERSION) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourcePhaseGate.contractVersion=${fixture.sourcePhaseGate.contractVersion} ` +
        `expected=${FORGE_STRATEGIST_PROVENANCE_VERSION}`,
    });
  }
  if (
    fixture.sourcePhaseGate.strategistProvenanceProbeCount !== provenanceCoverage.totalProbes
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourcePhaseGate.strategistProvenanceProbeCount=${fixture.sourcePhaseGate.strategistProvenanceProbeCount} ` +
        `contract=${provenanceCoverage.totalProbes}`,
    });
  }
  if (fixture.sourcePhaseGate.sealedBlockCount !== EXPECTED_P03_PHASE_GATE_SEALED_BLOCK_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourcePhaseGate.sealedBlockCount=${fixture.sourcePhaseGate.sealedBlockCount} ` +
        `expected=${EXPECTED_P03_PHASE_GATE_SEALED_BLOCK_COUNT}`,
    });
  }
  if (handoff.targetPhase.entryAtom !== "P04-B01-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `P03 handoff entryAtom=${handoff.targetPhase.entryAtom} expected=P04-B01-A01`,
    });
  }

  const contractAlignment = validateResearcherQuestionDecompositionAgainstContract(fixture);
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeResearcherQuestionDecompositionMatrix(
  results: ResearcherQuestionDecompositionProbeResult[],
): ResearcherQuestionDecompositionProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as ResearcherQuestionDecompositionProbeSummary["byCategory"];
  for (const category of RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES) {
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

export function listResearcherQuestionDecompositionProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherQuestionDecompositionBaseline = loadResearcherQuestionDecompositionBaseline(),
): ResearcherQuestionDecompositionFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listResearcherQuestionDecompositionKnownGaps(
  results: ResearcherQuestionDecompositionProbeResult[],
): ResearcherQuestionDecompositionProbeResult[] {
  return summarizeResearcherQuestionDecompositionMatrix(results).knownGaps;
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
  category: ResearcherQuestionDecompositionCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): ResearcherQuestionDecompositionProbeResult {
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

function productionQuestionDecompositionSource(): string {
  return readSrc("forge-p04-researcher-question-decomposition.ts");
}

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function parserSource(): string {
  return readSrc("parser.ts");
}

function researchEngineSource(): string {
  return readSrc("research-engine.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(
    productionQuestionDecompositionSource(),
  );
}

const SAMPLE_RESEARCH_OUTPUT = `RESEARCH_QUESTIONS:
1. What are current best practices for research question decomposition in agent pipelines?
2. How do benchmark harnesses document FAIL gaps before production slices?
FINDINGS: Structured question decomposition improves research coverage and benchmark traceability.
RELEVANCE: 0.92
RISKS: None identified`;

function researcherFormatSection(): string {
  const prompts = promptsSource();
  const researcherStart = prompts.indexOf("const RESEARCHER_SYSTEM");
  const workerStart = prompts.indexOf("const WORKER_SYSTEM");
  if (researcherStart === -1 || workerStart === -1 || workerStart <= researcherStart) {
    return prompts;
  }
  return prompts.slice(researcherStart, workerStart);
}

function runResearcherQuestionDecompositionProbe(
  id: string,
  category: ResearcherQuestionDecompositionCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherQuestionDecompositionBaseline,
): ResearcherQuestionDecompositionProbeResult {
  const contract = getActiveResearcherQuestionDecompositionContract();
  const contractProbe = contract.probes.find(p => p.id === id);
  const criterion = contractProbe?.criterion;
  const prompts = promptsSource();
  const researcherPrompt = researcherFormatSection();
  const orchestrator = orchestratorSource();
  const parser = parserSource();
  const researchEngine = researchEngineSource();

  switch (id) {
    case "rques.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`, criterion);
    }
    case "rques.atom_tagged": {
      const ok = fixture.atom === "P04-B01-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`, criterion);
    }
    case "rques.harness_version_exported": {
      const ok = FORGE_RESEARCHER_QUESTION_DECOMPOSITION_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_RESEARCHER_QUESTION_DECOMPOSITION_VERSION}`,
        criterion,
      );
    }
    case "rques.prompt_research_questions": {
      const ok = /RESEARCH_QUESTIONS:/i.test(researcherPrompt);
      return probe(id, category, expected, ok, `researchQuestionsField=${ok}`, criterion);
    }
    case "rques.parser_research_questions_extract": {
      const ok =
        parser.includes("researchQuestions") &&
        parser.includes("RESEARCH_QUESTIONS") &&
        /parseResearchResponse[\s\S]*researchQuestions/.test(parser);
      return probe(id, category, expected, ok, `parserResearchQuestions=${ok}`, criterion);
    }
    case "rques.researcher_findings_format": {
      const ok = /FINDINGS:/i.test(researcherPrompt);
      return probe(id, category, expected, ok, `findingsField=${ok}`, criterion);
    }
    case "rques.parser_findings_extract": {
      const parsed = parseResearchResponse(SAMPLE_RESEARCH_OUTPUT.replace(/RESEARCH_QUESTIONS:[\s\S]*?\n/, ""));
      const ok = parsed.ok && parsed.data.findings.includes("Structured question decomposition");
      return probe(
        id,
        category,
        expected,
        ok,
        parsed.ok ? `findingsLen=${parsed.data.findings.length}` : "parse failed",
        criterion,
      );
    }
    case "rques.presence_question_detect": {
      const presence = assessResearchQuestionDecompositionPresence(SAMPLE_RESEARCH_OUTPUT);
      const ok =
        hasProductionExport("assessResearchQuestionDecompositionPresence") &&
        presence.hasResearchQuestions &&
        presence.questionCount >= 2;
      return probe(
        id,
        category,
        expected,
        ok,
        `questionCount=${presence.questionCount}`,
        criterion,
      );
    }
    case "rques.decompose_research_questions_fn": {
      const ok = hasProductionExport("decomposeResearchQuestions");
      return probe(id, category, expected, ok, `decomposeFn=${ok}`, criterion);
    }
    case "rques.orchestrator_pre_research_decompose": {
      const ok =
        orchestrator.includes("decomposeResearchQuestions(") ||
        (orchestrator.includes("validateResearchQuestionDecomposition(") &&
          orchestrator.includes("stepWithPhase"));
      return probe(id, category, expected, ok, `orchestratorDecompose=${ok}`, criterion);
    }
    case "rques.research_engine_single_query": {
      const ok =
        researchEngine.includes("export async function research(") &&
        researchEngine.includes("query: string");
      return probe(id, category, expected, ok, `researchQueryParam=${ok}`, criterion);
    }
    case "rques.block_keyword_query_extract": {
      const ok =
        orchestrator.includes("searchTerms") &&
        orchestrator.includes("quickSearch") &&
        orchestrator.includes("best practices");
      return probe(id, category, expected, ok, `blockKeywordExtract=${ok}`, criterion);
    }
    case "rques.p03_phase_handoff_entry": {
      const handoff = getForgeP03ToP04PhaseHandoff();
      const ok =
        handoff.targetPhase.entryBlock === "P04-B01" &&
        handoff.targetPhase.entryAtom === "P04-B01-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `entryAtom=${handoff.targetPhase.entryAtom}`,
        criterion,
      );
    }
    case "rques.p03_sealed_provenance_probes": {
      const handoff = getForgeP03ToP04PhaseHandoff();
      const coverage = summarizeStrategistProvenanceCoverage(
        getActiveStrategistProvenanceContract(),
      );
      const ok =
        handoff.sealedArtifacts.strategistProvenanceProbeCount === coverage.totalProbes &&
        coverage.totalProbes > 0;
      return probe(
        id,
        category,
        expected,
        ok,
        `probeCount=${coverage.totalProbes}`,
        criterion,
      );
    }
    case "rques.source_phase_gate_ref": {
      const handoff = getForgeP03ToP04PhaseHandoff();
      const coverage = summarizeStrategistProvenanceCoverage(
        getActiveStrategistProvenanceContract(),
      );
      const ok =
        fixture.sourcePhaseGate.atom === handoff.atom &&
        fixture.sourcePhaseGate.strategistProvenanceProbeCount === coverage.totalProbes &&
        fixture.sourcePhaseGate.sealedBlockCount === EXPECTED_P03_PHASE_GATE_SEALED_BLOCK_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourcePhaseGate.atom}, probes=${fixture.sourcePhaseGate.strategistProvenanceProbeCount}`,
        criterion,
      );
    }
    case "rques.probe_runner_exported": {
      const ok = productionQuestionDecompositionSource().includes(
        "export function runResearcherQuestionDecompositionProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`, criterion);
    }
    case "rques.known_gaps_documented": {
      const contract = getActiveResearcherQuestionDecompositionContract();
      const expectedFail = contract.probes.filter(p => p.expected === "FAIL").length;
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = expectedFail > 0 && failCount === expectedFail;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}`,
        criterion,
      );
    }
    case "rques.empty_block_boundary": {
      const result = assessResearchQuestionInputBoundary("");
      const ok =
        hasProductionExport("assessResearchQuestionInputBoundary") &&
        result.disposition === "empty" &&
        result.acceptable === false;
      return probe(id, category, expected, ok, `disposition=${result.disposition}`, criterion);
    }
    case "rques.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateResearcherQuestionDecompositionBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`, criterion);
    }
    case "rques.malformed_block_guard": {
      const boundary = assessResearchQuestionInputBoundary("block\0task");
      const ok =
        hasProductionExport("assessResearchQuestionInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false;
      return probe(id, category, expected, ok, `disposition=${boundary.disposition}`, criterion);
    }
    case "rques.min_category_probes": {
      const underflow = {
        ...fixture,
        probes: fixture.probes.filter(p => p.category !== "nogo_path"),
      };
      const ok = validateResearcherQuestionDecompositionBaseline(underflow).valid === false;
      return probe(id, category, expected, ok, `rejectsUnderflow=${ok}`, criterion);
    }
    case "rques.researcher_memory_skip": {
      const ok = prompts.includes("Do NOT research things already in memory");
      return probe(id, category, expected, ok, `researcherSkipMemory=${ok}`, criterion);
    }
    case "rques.research_block_non_fatal": {
      const ok =
        orchestrator.includes("Research BLOCK") &&
        orchestrator.includes("non-fatal");
      return probe(id, category, expected, ok, `researchBlockNonFatal=${ok}`, criterion);
    }
    case "rques.nogo_empty_question_halt": {
      const ok =
        orchestrator.includes("missing_research_questions") ||
        orchestrator.includes("zero actionable sub-queries") ||
        orchestrator.includes("validateResearchQuestionDecomposition(");
      return probe(id, category, expected, ok, `emptyQuestionHalt=${ok}`, criterion);
    }
    case "rques.exported_orchestrator_question_validator": {
      const ok =
        hasProductionExport("validateResearchQuestionDecomposition") &&
        orchestrator.includes("validateResearchQuestionDecomposition(");
      return probe(id, category, expected, ok, `orchestratorValidator=${ok}`, criterion);
    }
    default:
      return probe(id, category, expected, false, "unknown probe id");
  }
}

export function runResearcherQuestionDecompositionProbes(
  fixture: ResearcherQuestionDecompositionBaseline = loadResearcherQuestionDecompositionBaseline(),
): ResearcherQuestionDecompositionProbeResult[] {
  const contract = getActiveResearcherQuestionDecompositionContract();
  return contract.probes.map(contractProbe =>
    runResearcherQuestionDecompositionProbe(
      contractProbe.id,
      contractProbe.category,
      contractProbe.expected,
      fixture,
    ),
  );
}
