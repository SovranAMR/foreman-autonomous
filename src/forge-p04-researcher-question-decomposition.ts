/**
 * FOREMAN — Researcher Question Decomposition Baseline (P04-B01)
 *
 * A01 slice: load, validate, run probes, contract alignment against sealed
 * P03 strategist phase gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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

export const FORGE_RESEARCHER_QUESTION_DECOMPOSITION_VERSION = "1.0.0-a08";

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

export interface ResearchQuestionDecompositionResult {
  acceptable: boolean;
  questions: string[];
  questionCount: number;
  detail: string;
}

const RESEARCH_STOP_WORDS =
  /^(the|and|for|with|from|into|that|this|will|should|must|have|been|were|when|where|what|which|about)$/i;

/**
 * Split block task into measurable research sub-queries before unified research (P04-B01-A03).
 */
export function decomposeResearchQuestions(blockTask: string): ResearchQuestionDecompositionResult {
  const boundary = assessResearchQuestionInputBoundary(blockTask);
  if (!boundary.acceptable) {
    return {
      acceptable: false,
      questions: [],
      questionCount: 0,
      detail: boundary.detail,
    };
  }

  const normalized = boundary.normalizedBlock.trim();
  const questions: string[] = [];
  const segments = normalized
    .split(/\n+|(?<=[.!?])\s+/)
    .map(segment => segment.trim())
    .filter(segment => segment.length > 10);

  for (const segment of segments) {
    if (questions.length >= 6) break;
    if (segment.endsWith("?")) {
      questions.push(segment);
      continue;
    }
    if (/^(implement|create|build|add|wire|update|refactor)\b/i.test(segment)) {
      questions.push(`What are best practices, risks, and tradeoffs for: ${segment}?`);
    }
  }

  if (questions.length === 0) {
    const topic = normalized.replace(/\s+/g, " ").slice(0, 180);
    questions.push(
      `What are current best practices and industry standards for: ${topic}?`,
      `What examples exist — what worked and what failed for: ${topic}?`,
      `What technical constraints, performance implications, and risks apply to: ${topic}?`,
    );
  }

  const keywords = normalized
    .split(/\s+/)
    .filter(word => word.length > 3 && !RESEARCH_STOP_WORDS.test(word))
    .slice(0, 4);
  if (keywords.length >= 2 && questions.length < 4) {
    questions.push(`How do established projects handle ${keywords.join(" ")}?`);
  }

  const unique = [...new Set(questions.map(question => question.trim()).filter(question => question.length > 10))];
  return {
    acceptable: unique.length > 0,
    questions: unique,
    questionCount: unique.length,
    detail: `decomposed ${unique.length} actionable sub-queries`,
  };
}

export interface ResearcherQuestionDecompositionProbeMatrixValidationIssue {
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

export interface ResearcherQuestionDecompositionProbeMatrixValidationResult {
  valid: boolean;
  issues: ResearcherQuestionDecompositionProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 */
export function validateResearcherQuestionDecompositionProbeMatrix(
  results: ResearcherQuestionDecompositionProbeResult[],
  contract: ResearcherQuestionDecompositionContract = getActiveResearcherQuestionDecompositionContract(),
): ResearcherQuestionDecompositionProbeMatrixValidationResult {
  const issues: ResearcherQuestionDecompositionProbeMatrixValidationIssue[] = [];
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

export interface ResearcherQuestionDecompositionProductionSliceResult {
  atom: "P04-B01-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: ResearcherQuestionDecompositionProbeResult[];
  summary: ResearcherQuestionDecompositionProbeSummary;
  matrixValidation: ResearcherQuestionDecompositionProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: decomposeResearchQuestions wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runResearcherQuestionDecompositionProductionSlice(
  fixture: ResearcherQuestionDecompositionBaseline = loadResearcherQuestionDecompositionBaseline(),
): ResearcherQuestionDecompositionProductionSliceResult {
  const contract = getActiveResearcherQuestionDecompositionContract();
  const fixtureValidation = validateResearcherQuestionDecompositionBaseline(fixture);
  const contractValidation = validateResearcherQuestionDecompositionAgainstContract(fixture, contract);
  const results = runResearcherQuestionDecompositionProbes(fixture);
  const summary = summarizeResearcherQuestionDecompositionMatrix(results);
  const matrixValidation = validateResearcherQuestionDecompositionProbeMatrix(results, contract);

  return {
    atom: "P04-B01-A03",
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
export function validateResearcherQuestionDecompositionBoundaryProbeMatrix(
  results: ResearcherQuestionDecompositionProbeResult[],
  contract: ResearcherQuestionDecompositionContract = getActiveResearcherQuestionDecompositionContract(),
): ResearcherQuestionDecompositionProbeMatrixValidationResult {
  const boundaryProbes = listResearcherQuestionDecompositionContractProbesByCategory(
    "boundary",
    contract,
  );
  const boundaryContract: ResearcherQuestionDecompositionContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateResearcherQuestionDecompositionProbeMatrix(boundaryResults, boundaryContract);
}

export interface ResearcherQuestionDecompositionBoundarySliceResult {
  atom: "P04-B01-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherQuestionDecompositionProbeResult[];
  boundaryResults: ResearcherQuestionDecompositionProbeResult[];
  matrixValidation: ResearcherQuestionDecompositionProbeMatrixValidationResult;
}

/**
 * A04 boundary slice: contract-wired boundary probes (block task input edge cases, probe runner,
 * documented gaps) with zero unexpected mismatches.
 */
export function runResearcherQuestionDecompositionBoundarySlice(
  fixture: ResearcherQuestionDecompositionBaseline = loadResearcherQuestionDecompositionBaseline(),
): ResearcherQuestionDecompositionBoundarySliceResult {
  const contract = getActiveResearcherQuestionDecompositionContract();
  const results = runResearcherQuestionDecompositionProbes(fixture);
  const boundaryProbes = listResearcherQuestionDecompositionContractProbesByCategory(
    "boundary",
    contract,
  );
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateResearcherQuestionDecompositionBoundaryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B01-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const RESEARCHER_QUESTION_DECOMPOSITION_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly ResearcherQuestionDecompositionCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes must align; zero unexpected mismatches.
 */
export function validateResearcherQuestionDecompositionFailureRecoveryProbeMatrix(
  results: ResearcherQuestionDecompositionProbeResult[],
  contract: ResearcherQuestionDecompositionContract = getActiveResearcherQuestionDecompositionContract(),
): ResearcherQuestionDecompositionProbeMatrixValidationResult {
  const failureRecoveryProbes = RESEARCHER_QUESTION_DECOMPOSITION_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherQuestionDecompositionContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: ResearcherQuestionDecompositionContract = {
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
  return validateResearcherQuestionDecompositionProbeMatrix(
    failureRecoveryResults,
    failureRecoveryContract,
  );
}

export function listResearcherQuestionDecompositionFailureRecoveryProbeIds(
  contract: ResearcherQuestionDecompositionContract = getActiveResearcherQuestionDecompositionContract(),
): string[] {
  return RESEARCHER_QUESTION_DECOMPOSITION_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listResearcherQuestionDecompositionContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface ResearcherQuestionDecompositionFailureRecoverySliceResult {
  atom: "P04-B01-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherQuestionDecompositionProbeResult[];
  failureRecoveryResults: ResearcherQuestionDecompositionProbeResult[];
  matrixValidation: ResearcherQuestionDecompositionProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes (orchestrator halt, non-fatal research BLOCK, validator export) with zero
 * unexpected mismatches.
 */
export function runResearcherQuestionDecompositionFailureRecoverySlice(
  fixture: ResearcherQuestionDecompositionBaseline = loadResearcherQuestionDecompositionBaseline(),
): ResearcherQuestionDecompositionFailureRecoverySliceResult {
  const contract = getActiveResearcherQuestionDecompositionContract();
  const results = runResearcherQuestionDecompositionProbes(fixture);
  const failureRecoveryProbes = RESEARCHER_QUESTION_DECOMPOSITION_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherQuestionDecompositionContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateResearcherQuestionDecompositionFailureRecoveryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B01-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

/** Per-probe evidence artifact — disposition, criterion and aligned outcomes (P04-B01-A06). */
export interface ResearcherQuestionDecompositionProbeEvidence {
  probeId: string;
  category: ResearcherQuestionDecompositionCategory;
  disposition: ResearcherQuestionDecompositionProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for question decomposition runs (P04-B01-A06). */
export interface ResearcherQuestionDecompositionProbeTelemetry {
  probeId: string;
  category: ResearcherQuestionDecompositionCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P04-B01-A06). */
export interface ResearcherQuestionDecompositionProvenance {
  runId: string;
  harnessVersion: string;
  contractVersion: string;
  contractAtom: string;
  fixtureVersion: string;
  fixtureAtom: string;
  sourcePhaseGateVersion: string;
  sourcePhaseGateAtom: string;
  /** Slice atom when record covers a subset (e.g. evidence gate). */
  sliceAtom?: string;
  /** Categories included when sliceAtom is set. */
  sliceCategories?: readonly ResearcherQuestionDecompositionCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated question decomposition run record bundling evidence, telemetry and provenance. */
export interface ResearcherQuestionDecompositionRunRecord {
  provenance: ResearcherQuestionDecompositionProvenance;
  evidence: ResearcherQuestionDecompositionProbeEvidence[];
  telemetry: ResearcherQuestionDecompositionProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<ResearcherQuestionDecompositionCategory, number>;
    byDisposition: Record<ResearcherQuestionDecompositionProbeDisposition, number>;
  };
}

export interface ResearcherQuestionDecompositionRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface ResearcherQuestionDecompositionRunValidationResult {
  valid: boolean;
  issues: ResearcherQuestionDecompositionRunValidationIssue[];
}

export function buildResearcherQuestionDecompositionProbeEvidence(
  probeId: string,
  category: ResearcherQuestionDecompositionCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: ResearcherQuestionDecompositionProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): ResearcherQuestionDecompositionProbeEvidence {
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

export function buildResearcherQuestionDecompositionProbeTelemetry(
  probeId: string,
  category: ResearcherQuestionDecompositionCategory,
  sequenceIndex: number,
  durationMs: number,
): ResearcherQuestionDecompositionProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildResearcherQuestionDecompositionProvenance(
  runId: string,
  fixture: ResearcherQuestionDecompositionBaseline,
  contract: ResearcherQuestionDecompositionContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly ResearcherQuestionDecompositionCategory[];
  },
): ResearcherQuestionDecompositionProvenance {
  return {
    runId,
    harnessVersion: FORGE_RESEARCHER_QUESTION_DECOMPOSITION_VERSION,
    contractVersion: contract.version,
    contractAtom: contract.atom,
    fixtureVersion: fixture.version,
    fixtureAtom: fixture.atom,
    sourcePhaseGateVersion: fixture.sourcePhaseGate.version,
    sourcePhaseGateAtom: fixture.sourcePhaseGate.atom,
    startedAt,
    completedAt,
    totalProbes,
    ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
    ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    ...(options?.gitCommit ? { gitCommit: options.gitCommit } : {}),
  };
}

export function buildResearcherQuestionDecompositionRunRecord(
  provenance: ResearcherQuestionDecompositionProvenance,
  evidence: ResearcherQuestionDecompositionProbeEvidence[],
  telemetry: ResearcherQuestionDecompositionProbeTelemetry[],
): ResearcherQuestionDecompositionRunRecord {
  const byCategory = {} as Record<ResearcherQuestionDecompositionCategory, number>;
  const byDisposition: Record<ResearcherQuestionDecompositionProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES) {
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

function validateResearcherQuestionDecompositionRunRecordAgainstProbeIds(
  record: ResearcherQuestionDecompositionRunRecord,
  expectedProbeIds: string[],
  contract: ResearcherQuestionDecompositionContract,
): ResearcherQuestionDecompositionRunValidationResult {
  const issues: ResearcherQuestionDecompositionRunValidationIssue[] = [];
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

export function validateResearcherQuestionDecompositionRunRecord(
  record: ResearcherQuestionDecompositionRunRecord,
  contract: ResearcherQuestionDecompositionContract = getActiveResearcherQuestionDecompositionContract(),
): ResearcherQuestionDecompositionRunValidationResult {
  return validateResearcherQuestionDecompositionRunRecordAgainstProbeIds(
    record,
    listResearcherQuestionDecompositionContractProbeIds(contract),
    contract,
  );
}

/** Validate evidence slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateResearcherQuestionDecompositionEvidenceRunRecord(
  record: ResearcherQuestionDecompositionRunRecord,
  contract: ResearcherQuestionDecompositionContract = getActiveResearcherQuestionDecompositionContract(),
): ResearcherQuestionDecompositionRunValidationResult {
  const issues: ResearcherQuestionDecompositionRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P04-B01-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P04-B01-A06`,
    });
  }

  const expectedCategories = [...RESEARCHER_QUESTION_DECOMPOSITION_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateResearcherQuestionDecompositionRunRecordAgainstProbeIds(
    record,
    listResearcherQuestionDecompositionFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

export interface ResearcherQuestionDecompositionEvidenceSliceResult {
  atom: "P04-B01-A06";
  evidenceProbeCount: number;
  matrixValid: boolean;
  recordValid: boolean;
  results: ResearcherQuestionDecompositionProbeResult[];
  evidenceResults: ResearcherQuestionDecompositionProbeResult[];
  matrixValidation: ResearcherQuestionDecompositionProbeMatrixValidationResult;
  record: ResearcherQuestionDecompositionRunRecord;
  recordValidation: ResearcherQuestionDecompositionRunValidationResult;
}

export const RESEARCHER_QUESTION_DECOMPOSITION_A01_MIN_PROBES: Readonly<
  Record<ResearcherQuestionDecompositionCategory, number>
> = {
  question_versioning: 3,
  question_signal: 5,
  subquery_signal: 4,
  baseline_link: 2,
  boundary: 6,
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
        expected: "PASS",
        disposition: "observed",
        criterion: "RESEARCHER_SYSTEM prompt declares RESEARCH_QUESTIONS output field before findings",
      },
      {
        id: "rques.parser_research_questions_extract",
        category: "question_signal",
        description: "parseResearchResponse extracts RESEARCH_QUESTIONS list from researcher output",
        expected: "PASS",
        disposition: "observed",
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
        expected: "PASS",
        disposition: "observed",
        criterion: "decomposeResearchQuestions splits block task into measurable sub-queries",
      },
      {
        id: "rques.orchestrator_pre_research_decompose",
        category: "subquery_signal",
        description: "Orchestrator decomposes research questions before researcher stepWithPhase",
        expected: "PASS",
        disposition: "observed",
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
        "Block task input boundary assessment handles empty, whitespace-only and oversized inputs; probe runner and documented gaps wired.",
      minProbeCount: 6,
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
      {
        id: "rques.whitespace_block_boundary",
        category: "boundary",
        description: "assessResearchQuestionInputBoundary rejects whitespace-only block task input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessResearchQuestionInputBoundary rejects whitespace-only block task input",
      },
      {
        id: "rques.long_block_truncation_boundary",
        category: "boundary",
        description: "assessResearchQuestionInputBoundary truncates block task exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessResearchQuestionInputBoundary truncates block task exceeding max length",
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
        expected: "PASS",
        disposition: "nogo",
        criterion:
          "Pipeline halts research when question decomposition yields zero actionable sub-queries",
      },
      {
        id: "rques.exported_orchestrator_question_validator",
        category: "nogo_path",
        description:
          "validateResearchQuestionDecomposition exported for orchestrator pre-research checks",
        expected: "PASS",
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
      const parsed = parseResearchResponse(SAMPLE_RESEARCH_OUTPUT);
      const ok =
        parser.includes("researchQuestions") &&
        parser.includes("RESEARCH_QUESTIONS") &&
        /parseResearchResponse[\s\S]*researchQuestions/.test(parser) &&
        parsed.ok &&
        parsed.data.researchQuestions.length >= 2;
      return probe(
        id,
        category,
        expected,
        ok,
        parsed.ok
          ? `researchQuestionsLen=${parsed.data.researchQuestions.length}`
          : "parse failed",
        criterion,
      );
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
      const decomposition = decomposeResearchQuestions(
        "Implement research question decomposition in orchestrator before researcher stepWithPhase.",
      );
      const ok =
        hasProductionExport("decomposeResearchQuestions") &&
        decomposition.acceptable &&
        decomposition.questionCount >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `decomposeFn=${ok}, questionCount=${decomposition.questionCount}`,
        criterion,
      );
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
      const ok = failCount === expectedFail;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, expectedFail=${expectedFail}`,
        criterion,
      );
    }
    case "rques.empty_block_boundary": {
      const result = assessResearchQuestionInputBoundary("");
      const ok =
        hasProductionExport("assessResearchQuestionInputBoundary") &&
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
    case "rques.whitespace_block_boundary": {
      const result = assessResearchQuestionInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessResearchQuestionInputBoundary") &&
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
    case "rques.long_block_truncation_boundary": {
      const longBlock = "x".repeat(RESEARCHER_QUESTION_BLOCK_MAX_LENGTH + 500);
      const result = assessResearchQuestionInputBoundary(longBlock);
      const ok =
        hasProductionExport("assessResearchQuestionInputBoundary") &&
        result.truncated === true &&
        result.normalizedBlock.length === RESEARCHER_QUESTION_BLOCK_MAX_LENGTH &&
        result.acceptable === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `truncated=${result.truncated}, length=${result.normalizedBlock.length}`,
        criterion,
      );
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

function resolveResearcherQuestionDecompositionGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function runResearcherQuestionDecompositionProbeWithTiming(
  entry: ResearcherQuestionDecompositionFixtureEntry,
  fixture: ResearcherQuestionDecompositionBaseline,
  contractProbe:
    | { criterion: string; disposition: ResearcherQuestionDecompositionProbeDisposition }
    | undefined,
): {
  result: ResearcherQuestionDecompositionProbeResult;
  durationMs: number;
  disposition: ResearcherQuestionDecompositionProbeDisposition;
} {
  const start = performance.now();
  const result = runResearcherQuestionDecompositionProbe(
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

function buildResearcherQuestionDecompositionRecordFromEntries(
  entries: ResearcherQuestionDecompositionFixtureEntry[],
  fixture: ResearcherQuestionDecompositionBaseline,
  contract: ResearcherQuestionDecompositionContract,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly ResearcherQuestionDecompositionCategory[];
  },
): ResearcherQuestionDecompositionRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ResearcherQuestionDecompositionProbeEvidence[] = [];
  const telemetry: ResearcherQuestionDecompositionProbeTelemetry[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runResearcherQuestionDecompositionProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildResearcherQuestionDecompositionProbeEvidence(
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
      buildResearcherQuestionDecompositionProbeTelemetry(
        result.id,
        result.category,
        sequenceIndex,
        durationMs,
      ),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildResearcherQuestionDecompositionProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveResearcherQuestionDecompositionGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildResearcherQuestionDecompositionRunRecord(provenance, evidence, telemetry);
}

/** Run all question decomposition probes and emit auditable evidence, telemetry and provenance (P04-B01-A06). */
export function runResearcherQuestionDecompositionProbesWithRecord(
  fixture: ResearcherQuestionDecompositionBaseline = loadResearcherQuestionDecompositionBaseline(),
): ResearcherQuestionDecompositionRunRecord {
  const contract = getActiveResearcherQuestionDecompositionContract();
  return buildResearcherQuestionDecompositionRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P04-B01-A06). */
export function runResearcherQuestionDecompositionFailureRecoverySliceWithRecord(
  fixture: ResearcherQuestionDecompositionBaseline = loadResearcherQuestionDecompositionBaseline(),
): ResearcherQuestionDecompositionRunRecord {
  const contract = getActiveResearcherQuestionDecompositionContract();
  const failureRecoveryIds = new Set(listResearcherQuestionDecompositionFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildResearcherQuestionDecompositionRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P04-B01-A06",
    sliceCategories: RESEARCHER_QUESTION_DECOMPOSITION_FAILURE_RECOVERY_CATEGORIES,
  });
}

/**
 * A06 evidence slice: contract-wired failure_path, recovery_path, and nogo_path probes
 * with auditable evidence, telemetry and provenance — zero unexpected mismatches.
 */
export function runResearcherQuestionDecompositionEvidenceSlice(
  fixture: ResearcherQuestionDecompositionBaseline = loadResearcherQuestionDecompositionBaseline(),
): ResearcherQuestionDecompositionEvidenceSliceResult {
  const contract = getActiveResearcherQuestionDecompositionContract();
  const results = runResearcherQuestionDecompositionProbes(fixture);
  const failureRecoveryProbes = RESEARCHER_QUESTION_DECOMPOSITION_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherQuestionDecompositionContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const evidenceResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateResearcherQuestionDecompositionFailureRecoveryProbeMatrix(
    results,
    contract,
  );
  const record = runResearcherQuestionDecompositionFailureRecoverySliceWithRecord(fixture);
  const recordValidation = validateResearcherQuestionDecompositionEvidenceRunRecord(record, contract);

  return {
    atom: "P04-B01-A06",
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

// ─── Property and fuzz validation (P04-B01-A07) ─────────────────────────────

export interface ResearcherQuestionDecompositionPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface ResearcherQuestionDecompositionPropertyResult {
  passed: number;
  failed: ResearcherQuestionDecompositionPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type ResearcherQuestionDecompositionPropertyCheck = {
  id: string;
  description: string;
  check: (contract: ResearcherQuestionDecompositionContract) => string | null;
};

const RESEARCHER_QUESTION_DECOMPOSITION_STRUCTURAL_PROPERTIES: readonly ResearcherQuestionDecompositionPropertyCheck[] =
  [
    {
      id: "categories_complete",
      description: "All eight researcher question decomposition categories are declared",
      check: contract => {
        for (const category of RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES) {
          if (!contract.categories[category]) return `missing category: ${category}`;
        }
        return null;
      },
    },
    {
      id: "probe_ids_unique",
      description: "Probe ids are globally unique",
      check: contract => {
        const ids = listResearcherQuestionDecompositionContractProbeIds(contract);
        if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
        return null;
      },
    },
    {
      id: "min_probe_count",
      description: "Each category meets contract minProbeCount",
      check: contract => {
        for (const category of RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES) {
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
        "summarizeResearcherQuestionDecompositionContractCoverage totals match listResearcherQuestionDecompositionContractProbeIds",
      check: contract => {
        const summary = summarizeResearcherQuestionDecompositionContractCoverage(contract);
        const ids = listResearcherQuestionDecompositionContractProbeIds(contract);
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
      description: "Probe ids are namespaced with rques. prefix",
      check: contract => {
        for (const probe of contract.probes) {
          if (!probe.id.startsWith("rques.")) {
            return `${probe.id} missing rques. prefix`;
          }
        }
        return null;
      },
    },
    {
      id: "run_record_summary_invariant",
      description: "Run record summary aligned + mismatches equals total",
      check: contract => {
        const fixture = loadResearcherQuestionDecompositionBaseline();
        const probeIds = listResearcherQuestionDecompositionContractProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildResearcherQuestionDecompositionProbeEvidence(
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
          return buildResearcherQuestionDecompositionProbeTelemetry(
            id,
            probe.category,
            index,
            index,
          );
        });
        const record = buildResearcherQuestionDecompositionRunRecord(
          buildResearcherQuestionDecompositionProvenance(
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
        "Synthetic failure/recovery slice record passes validateResearcherQuestionDecompositionEvidenceRunRecord",
      check: contract => {
        const fixture = loadResearcherQuestionDecompositionBaseline();
        const probeIds = listResearcherQuestionDecompositionFailureRecoveryProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildResearcherQuestionDecompositionProbeEvidence(
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
          return buildResearcherQuestionDecompositionProbeTelemetry(
            id,
            probe.category,
            index,
            index * 0.5,
          );
        });
        const record = buildResearcherQuestionDecompositionRunRecord(
          buildResearcherQuestionDecompositionProvenance(
            "property-check-failure-recovery",
            fixture,
            contract,
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T00:00:01.000Z",
            probeIds.length,
            {
              sliceAtom: "P04-B01-A06",
              sliceCategories: RESEARCHER_QUESTION_DECOMPOSITION_FAILURE_RECOVERY_CATEGORIES,
            },
          ),
          evidence,
          telemetry,
        );
        const validation = validateResearcherQuestionDecompositionEvidenceRunRecord(record, contract);
        if (!validation.valid) {
          return validation.issues.map(i => i.detail).join("; ");
        }
        return null;
      },
    },
  ] as const;

export function runResearcherQuestionDecompositionPropertyChecks(
  contract: ResearcherQuestionDecompositionContract = getActiveResearcherQuestionDecompositionContract(),
): ResearcherQuestionDecompositionPropertyResult {
  const failed: ResearcherQuestionDecompositionPropertyViolation[] = [];
  for (const property of RESEARCHER_QUESTION_DECOMPOSITION_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = RESEARCHER_QUESTION_DECOMPOSITION_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type ResearcherQuestionDecompositionFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface ResearcherQuestionDecompositionFuzzMutationCase {
  seed: number;
  kind: ResearcherQuestionDecompositionFuzzMutationKind;
  probeId?: string;
  category?: ResearcherQuestionDecompositionCategory;
}

export interface ResearcherQuestionDecompositionFuzzValidationCaseResult {
  mutation: ResearcherQuestionDecompositionFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface ResearcherQuestionDecompositionFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: ResearcherQuestionDecompositionFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createResearcherQuestionDecompositionFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneResearcherQuestionDecompositionBaseline(
  fixture: ResearcherQuestionDecompositionBaseline,
): ResearcherQuestionDecompositionBaseline {
  return {
    ...fixture,
    sourcePhaseGate: { ...fixture.sourcePhaseGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickResearcherQuestionDecompositionFuzzTarget(
  fixture: ResearcherQuestionDecompositionBaseline,
  rng: () => number,
): {
  category: ResearcherQuestionDecompositionCategory;
  index: number;
  entry: ResearcherQuestionDecompositionFixtureEntry;
} {
  const category =
    RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES[
      Math.floor(rng() * RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES.length)
    ]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyResearcherQuestionDecompositionFuzzMutation(
  fixture: ResearcherQuestionDecompositionBaseline,
  mutation: ResearcherQuestionDecompositionFuzzMutationCase,
): ResearcherQuestionDecompositionBaseline {
  const mutated = cloneResearcherQuestionDecompositionBaseline(fixture);
  const targetCategory = mutation.category ?? RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES[0]!;
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
          id: `rques.fuzz.extra.${mutation.seed}`,
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
      const other = RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateResearcherQuestionDecompositionFuzzMutationCases(
  fixture: ResearcherQuestionDecompositionBaseline,
  seed: number,
  iterations: number,
): ResearcherQuestionDecompositionFuzzMutationCase[] {
  const rng = createResearcherQuestionDecompositionFuzzRng(seed);
  const kinds: ResearcherQuestionDecompositionFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: ResearcherQuestionDecompositionFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickResearcherQuestionDecompositionFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P04-B01-A07). */
export function runResearcherQuestionDecompositionFuzzValidation(
  fixture: ResearcherQuestionDecompositionBaseline,
  contract: ResearcherQuestionDecompositionContract = getActiveResearcherQuestionDecompositionContract(),
  seed = 42,
  iterations = 24,
): ResearcherQuestionDecompositionFuzzValidationResult {
  const cases = generateResearcherQuestionDecompositionFuzzMutationCases(fixture, seed, iterations);
  const results: ResearcherQuestionDecompositionFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyResearcherQuestionDecompositionFuzzMutation(fixture, mutation);
    const validation = validateResearcherQuestionDecompositionAgainstContract(mutated, contract);
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

export type ResearcherQuestionDecompositionRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface ResearcherQuestionDecompositionRunRecordFuzzCase {
  kind: ResearcherQuestionDecompositionRunRecordFuzzKind;
  probeId?: string;
}

export function applyResearcherQuestionDecompositionRunRecordFuzzMutation(
  record: ResearcherQuestionDecompositionRunRecord,
  mutation: ResearcherQuestionDecompositionRunRecordFuzzCase,
): ResearcherQuestionDecompositionRunRecord {
  const cloned: ResearcherQuestionDecompositionRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P04-B01-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["question_versioning"],
      };
      break;
  }

  cloned.summary = buildResearcherQuestionDecompositionRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveResearcherQuestionDecompositionRunRecordValidator(
  record: ResearcherQuestionDecompositionRunRecord,
): (
  record: ResearcherQuestionDecompositionRunRecord,
  contract: ResearcherQuestionDecompositionContract,
) => ResearcherQuestionDecompositionRunValidationResult {
  return record.provenance.sliceAtom === "P04-B01-A06"
    ? validateResearcherQuestionDecompositionEvidenceRunRecord
    : validateResearcherQuestionDecompositionRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P04-B01-A07). */
export function runResearcherQuestionDecompositionRunRecordFuzzValidation(
  record: ResearcherQuestionDecompositionRunRecord,
  contract: ResearcherQuestionDecompositionContract = getActiveResearcherQuestionDecompositionContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveResearcherQuestionDecompositionRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: ResearcherQuestionDecompositionRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P04-B01-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyResearcherQuestionDecompositionRunRecordFuzzMutation(record, mutation);
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

export interface ResearcherQuestionDecompositionPropertyFuzzSliceResult {
  atom: "P04-B01-A07";
  propertyChecksPassed: boolean;
  contractFuzzRejected: boolean;
  runRecordFuzzRejected: boolean;
  propertyResult: ResearcherQuestionDecompositionPropertyResult;
  contractFuzz: ResearcherQuestionDecompositionFuzzValidationResult;
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
export function runResearcherQuestionDecompositionPropertyFuzzSlice(
  fixture: ResearcherQuestionDecompositionBaseline = loadResearcherQuestionDecompositionBaseline(),
): ResearcherQuestionDecompositionPropertyFuzzSliceResult {
  const contract = getActiveResearcherQuestionDecompositionContract();
  const propertyResult = runResearcherQuestionDecompositionPropertyChecks(contract);
  const contractFuzz = runResearcherQuestionDecompositionFuzzValidation(fixture, contract);
  const record = runResearcherQuestionDecompositionFailureRecoverySliceWithRecord(fixture);
  const runRecordFuzz = runResearcherQuestionDecompositionRunRecordFuzzValidation(record, contract);

  return {
    atom: "P04-B01-A07",
    propertyChecksPassed: propertyResult.allPassed,
    contractFuzzRejected: contractFuzz.allMutationsRejected,
    runRecordFuzzRejected: runRecordFuzz.mutationsAccepted === 0,
    propertyResult,
    contractFuzz,
    runRecordFuzz,
  };
}

// ─── Probe regression detection (P04-B01-A08) ────────────────────────────────

export interface ResearcherQuestionDecompositionProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare question decomposition run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectResearcherQuestionDecompositionProbeRegression(
  prior: ResearcherQuestionDecompositionRunRecord,
  current: ResearcherQuestionDecompositionRunRecord,
): ResearcherQuestionDecompositionProbeRegressionReport {
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

export interface ResearcherQuestionDecompositionForgeRegressionResult {
  atom: "P04-B01-A08";
  passed: boolean;
  productionSlice: ResearcherQuestionDecompositionProductionSliceResult;
  propertyFuzzSlice: ResearcherQuestionDecompositionPropertyFuzzSliceResult;
  record: ResearcherQuestionDecompositionRunRecord;
  recordValid: boolean;
  priorRecordValid: boolean;
  validationIssues: string[];
  priorValidationIssues: string[];
  probeRegression: ResearcherQuestionDecompositionProbeRegressionReport | null;
  detail: string;
}

/**
 * Execute question decomposition probes, validate production slice + run record, property/fuzz gates,
 * and optionally detect regression vs prior run. Forge pipeline integration gate (P04-B01-A08).
 */
export function runResearcherQuestionDecompositionForgeRegression(
  priorRecord?: ResearcherQuestionDecompositionRunRecord,
): ResearcherQuestionDecompositionForgeRegressionResult {
  const fixture = loadResearcherQuestionDecompositionBaseline();
  const contract = getActiveResearcherQuestionDecompositionContract();
  const productionSlice = runResearcherQuestionDecompositionProductionSlice(fixture);
  const propertyFuzzSlice = runResearcherQuestionDecompositionPropertyFuzzSlice(fixture);
  const record = runResearcherQuestionDecompositionProbesWithRecord(fixture);
  const validation = validateResearcherQuestionDecompositionRunRecord(record, contract);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  let priorRecordValid = true;
  let priorValidationIssues: string[] = [];
  if (priorRecord) {
    const priorValidation = validateResearcherQuestionDecompositionRunRecord(priorRecord, contract);
    priorRecordValid = priorValidation.valid && priorRecord.summary.mismatches === 0;
    priorValidationIssues = priorValidation.issues.map(issue => issue.detail);
  }

  const probeRegression = priorRecord
    ? detectResearcherQuestionDecompositionProbeRegression(priorRecord, record)
    : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;

  const productionSliceOk =
    productionSlice.matrixValid && productionSlice.matrixValidation.unexpectedMismatches === 0;
  const propertyFuzzOk =
    propertyFuzzSlice.propertyChecksPassed &&
    propertyFuzzSlice.contractFuzzRejected &&
    propertyFuzzSlice.runRecordFuzzRejected;

  const passed =
    productionSliceOk && recordValid && priorRecordValid && !alignmentRegression && propertyFuzzOk;

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

  return {
    atom: "P04-B01-A08",
    passed,
    productionSlice,
    propertyFuzzSlice,
    record,
    recordValid,
    priorRecordValid,
    validationIssues,
    priorValidationIssues,
    probeRegression,
    detail: detailParts.join(" | "),
  };
}
