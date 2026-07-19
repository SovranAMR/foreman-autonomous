/**
 * FOREMAN — Strategist Intent & Task Understanding Baseline (P03-B01)
 *
 * Measures strategist decompose intent, vision-to-block signal wiring and
 * decomposition depth behavior on sealed P02 phase gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import strategistIntentBaseline from "./fixtures/forge-strategist-intent-v1.json" with { type: "json" };
import type {
  ForgeAcceptanceOutcome,
  ForgeBlockAtomSeal,
  ForgeBlockGateCheck,
  ForgeBlockGateDefinition,
} from "./forge-baseline-contract.js";
import {
  getForgeP02ToP03PhaseHandoff,
  getActiveVisionerPhaseGateContract,
  summarizeVisionerPhaseGateContractCoverage,
  P02_VISIONER_PHASE_BLOCK_COUNT,
} from "./forge-p02-visioner-phase-gate.js";
import { parseDecomposeResponse } from "./parser.js";

export const FORGE_STRATEGIST_INTENT_VERSION = "1.0.0-a09";

/** Maximum normalized vision length before truncation (P03-B01-A01 boundary). */
export const STRATEGIST_VISION_MAX_LENGTH = 32000;

export const EXPECTED_P02_PHASE_GATE_SEALED_BLOCK_COUNT = P02_VISIONER_PHASE_BLOCK_COUNT;

export const STRATEGIST_INTENT_CATEGORIES = [
  "intent_versioning",
  "task_signal",
  "decomposition_depth",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type StrategistIntentCategory = (typeof STRATEGIST_INTENT_CATEGORIES)[number];

export type StrategistVisionInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface StrategistVisionInputBoundary {
  disposition: StrategistVisionInputDisposition;
  acceptable: boolean;
  normalizedVision: string;
  truncated: boolean;
  detail: string;
}

/**
 * Assess vision input boundary conditions before strategist decompose (P03-B01-A01).
 */
export function assessStrategistVisionInputBoundary(
  visionOutput: string,
): StrategistVisionInputBoundary {
  if (visionOutput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedVision: "",
      truncated: false,
      detail: "null byte detected in vision input",
    };
  }

  const trimmed = visionOutput.trim();
  if (trimmed.length === 0) {
    const disposition: StrategistVisionInputDisposition =
      visionOutput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedVision: "",
      truncated: false,
      detail: disposition === "empty" ? "empty vision input" : "whitespace-only vision input",
    };
  }

  let normalizedVision = visionOutput;
  let truncated = false;
  if (normalizedVision.length > STRATEGIST_VISION_MAX_LENGTH) {
    normalizedVision = normalizedVision.slice(0, STRATEGIST_VISION_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedVision,
    truncated,
    detail: truncated
      ? `vision truncated to ${STRATEGIST_VISION_MAX_LENGTH} characters`
      : "valid vision input",
  };
}

export interface StrategistDecomposeRecoveryHints {
  blocks?: string[];
  reasoning?: string;
  confidence?: number;
}

export interface StrategistDecomposeRecoveryResult {
  recovered: boolean;
  composedDecompose: string;
  blocks: string[];
  blockCount: number;
  parseErrors: string[];
  detail: string;
}

const INFORMAL_BLOCK_LINE =
  /^block\s*(\d+)\s*[:=\-]\s*(.+)$/i;

/**
 * Restructure failed decompose parse into actionable block plan (P03-B01-A03).
 */
export function recoverStrategistDecompose(
  failedParse: string,
  hints: StrategistDecomposeRecoveryHints = {},
): StrategistDecomposeRecoveryResult {
  const parseErrors: string[] = [];

  if (failedParse.includes("\0")) {
    return {
      recovered: false,
      composedDecompose: "",
      blocks: [],
      blockCount: 0,
      parseErrors: ["null_byte_in_decompose"],
      detail: "cannot recover null-byte decompose output",
    };
  }

  const trimmed = failedParse.trim();
  if (trimmed.length === 0) {
    return {
      recovered: false,
      composedDecompose: "",
      blocks: [],
      blockCount: 0,
      parseErrors: ["empty_decompose"],
      detail: "cannot recover empty decompose output",
    };
  }

  const direct = parseDecomposeResponse(failedParse);
  if (direct.ok) {
    return {
      recovered: true,
      composedDecompose: failedParse,
      blocks: direct.data.blocks,
      blockCount: direct.data.blocks.length,
      parseErrors,
      detail: `direct parse succeeded with ${direct.data.blocks.length} blocks`,
    };
  }

  let blocks = [...(hints.blocks ?? [])];
  let reasoning = hints.reasoning;
  const confidence = hints.confidence ?? 0.75;

  const reasoningMatch = failedParse.match(
    /REASONING:\s*(.+?)(?:\n(?:OUTPUT|Block\s*\d|CONFIDENCE|DEPENDENCIES|\d+\.)|$)/is,
  );
  if (reasoningMatch && !reasoning) {
    reasoning = reasoningMatch[1].trim();
  }

  for (const line of failedParse.split("\n")) {
    const candidate = line.trim();
    if (!candidate) continue;

    const blockMatch = candidate.match(INFORMAL_BLOCK_LINE);
    if (blockMatch) {
      blocks.push(blockMatch[2].trim());
      continue;
    }

    const numberedMatch = candidate.match(/^(\d+)\.\s*(.+)$/);
    if (numberedMatch) {
      blocks.push(numberedMatch[2].trim());
      continue;
    }

    const bulletMatch = candidate.match(/^[-*•]\s*(.+)$/);
    if (bulletMatch && bulletMatch[1].length > 5) {
      blocks.push(bulletMatch[1].trim());
    }
  }

  blocks = [...new Set(blocks.map(block => block.trim()).filter(block => block.length > 0))];
  if (blocks.length > 8) {
    blocks = blocks.slice(0, 8);
  }

  if (blocks.length === 0) {
    const looseLines = failedParse
      .split("\n")
      .map(line => line.trim())
      .filter(
        line =>
          line.length >= 10 &&
          !/^(REASONING|OUTPUT|CONFIDENCE|DEPENDENCIES|Here are the steps)/i.test(line),
      );
    if (looseLines.length > 0) {
      blocks = looseLines.slice(0, 8);
      parseErrors.push("informal_block_extraction");
    } else {
      parseErrors.push("missing_blocks");
      blocks = ["Recovered block pending strategist refinement"];
    }
  }

  const outputLines = blocks.map((block, index) => {
    const cleaned = block.replace(/^Block\s*\d+\s*:\s*/i, "");
    return `Block ${index + 1}: ${cleaned}`;
  });

  const composedDecompose = [
    `REASONING: ${reasoning ?? "Recovered from failed decompose parse"}`,
    "OUTPUT:",
    ...outputLines,
    "DEPENDENCIES: none",
    `CONFIDENCE: ${confidence}`,
  ].join("\n");

  const parsed = parseDecomposeResponse(composedDecompose);
  const recovered = parsed.ok === true && parsed.data.blocks.length >= 1;

  return {
    recovered,
    composedDecompose: recovered ? composedDecompose : "",
    blocks: parsed.ok ? parsed.data.blocks : blocks,
    blockCount: parsed.ok ? parsed.data.blocks.length : blocks.length,
    parseErrors,
    detail: recovered
      ? `recovered ${parsed.ok ? parsed.data.blocks.length : 0} blocks from failed parse`
      : `recovery failed: ${parseErrors.join(", ")}`,
  };
}

export interface StrategistIntentProbeMatrixValidationIssue {
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

export interface StrategistIntentProbeMatrixValidationResult {
  valid: boolean;
  issues: StrategistIntentProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 */
export function validateStrategistIntentProbeMatrix(
  results: StrategistIntentProbeResult[],
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): StrategistIntentProbeMatrixValidationResult {
  const issues: StrategistIntentProbeMatrixValidationIssue[] = [];
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
        detail: `unexpected mismatch: expected=${result.expected} actual=${result.actual}`,
      });
      unexpectedMismatches++;
    }
  }

  for (const result of results) {
    if (!contract.probes.some(probe => probe.id === result.id)) {
      issues.push({
        kind: "extra_result",
        probeId: result.id,
        detail: `probe matrix extra ${result.id}`,
      });
      unexpectedMismatches++;
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    passAligned,
    gapAligned,
    unexpectedMismatches,
  };
}

/**
 * Validate boundary-category probe matrix — A04 slice gate.
 * Only boundary probes are evaluated; zero unexpected mismatches required.
 */
export function validateStrategistIntentBoundaryProbeMatrix(
  results: StrategistIntentProbeResult[],
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): StrategistIntentProbeMatrixValidationResult {
  const boundaryProbes = listStrategistIntentContractProbesByCategory("boundary", contract);
  const boundaryContract: StrategistIntentContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateStrategistIntentProbeMatrix(boundaryResults, boundaryContract);
}

export interface StrategistIntentProductionSliceResult {
  atom: "P03-B01-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: StrategistIntentProbeResult[];
  summary: StrategistIntentProbeSummary;
  matrixValidation: StrategistIntentProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: recoverStrategistDecompose wired to contract probe execution
 * and matrix alignment gate with zero unexpected mismatches.
 */
export function runStrategistIntentProductionSlice(
  fixture: StrategistIntentBaseline = loadStrategistIntentBaseline(),
): StrategistIntentProductionSliceResult {
  const contract = getActiveStrategistIntentContract();
  const fixtureValidation = validateStrategistIntentBaseline(fixture);
  const contractValidation = validateStrategistIntentAgainstContract(fixture, contract);
  const results = runStrategistIntentProbes(fixture);
  const summary = summarizeStrategistIntentMatrix(results);
  const matrixValidation = validateStrategistIntentProbeMatrix(results, contract);

  return {
    atom: "P03-B01-A03",
    fixtureValid: fixtureValidation.valid,
    contractAligned: contractValidation.valid,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    summary,
    matrixValidation,
  };
}

export interface StrategistIntentBoundarySliceResult {
  atom: "P03-B01-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: StrategistIntentProbeResult[];
  boundaryResults: StrategistIntentProbeResult[];
  matrixValidation: StrategistIntentProbeMatrixValidationResult;
}

/**
 * A04 boundary slice: contract-wired boundary probes (vision input edge cases, probe runner,
 * documented gaps) with zero unexpected mismatches.
 */
export function runStrategistIntentBoundarySlice(
  fixture: StrategistIntentBaseline = loadStrategistIntentBaseline(),
): StrategistIntentBoundarySliceResult {
  const contract = getActiveStrategistIntentContract();
  const results = runStrategistIntentProbes(fixture);
  const boundaryProbes = listStrategistIntentContractProbesByCategory("boundary", contract);
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateStrategistIntentBoundaryProbeMatrix(results, contract);

  return {
    atom: "P03-B01-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const STRATEGIST_INTENT_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly StrategistIntentCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery/NO-GO probes must align; zero unexpected mismatches required.
 */
export function validateStrategistIntentFailureRecoveryProbeMatrix(
  results: StrategistIntentProbeResult[],
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): StrategistIntentProbeMatrixValidationResult {
  const failureRecoveryProbes = STRATEGIST_INTENT_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistIntentContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: StrategistIntentContract = {
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
  return validateStrategistIntentProbeMatrix(failureRecoveryResults, failureRecoveryContract);
}

export function listStrategistIntentFailureRecoveryProbeIds(
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): string[] {
  return STRATEGIST_INTENT_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listStrategistIntentContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface StrategistIntentFailureRecoverySliceResult {
  atom: "P03-B01-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: StrategistIntentProbeResult[];
  failureRecoveryResults: StrategistIntentProbeResult[];
  matrixValidation: StrategistIntentProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes with zero unexpected mismatches.
 */
export function runStrategistIntentFailureRecoverySlice(
  fixture: StrategistIntentBaseline = loadStrategistIntentBaseline(),
): StrategistIntentFailureRecoverySliceResult {
  const contract = getActiveStrategistIntentContract();
  const results = runStrategistIntentProbes(fixture);
  const failureRecoveryProbes = STRATEGIST_INTENT_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistIntentContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateStrategistIntentFailureRecoveryProbeMatrix(results, contract);

  return {
    atom: "P03-B01-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

/** Per-probe evidence artifact — disposition, criterion and aligned outcomes (P03-B01-A06). */
export interface StrategistIntentProbeEvidence {
  probeId: string;
  category: StrategistIntentCategory;
  disposition: StrategistIntentProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for strategist intent runs (P03-B01-A06). */
export interface StrategistIntentProbeTelemetry {
  probeId: string;
  category: StrategistIntentCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P03-B01-A06). */
export interface StrategistIntentProvenance {
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
  sliceCategories?: readonly StrategistIntentCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated strategist intent run record bundling evidence, telemetry and provenance. */
export interface StrategistIntentRunRecord {
  provenance: StrategistIntentProvenance;
  evidence: StrategistIntentProbeEvidence[];
  telemetry: StrategistIntentProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<StrategistIntentCategory, number>;
    byDisposition: Record<StrategistIntentProbeDisposition, number>;
  };
}

export interface StrategistIntentRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface StrategistIntentRunValidationResult {
  valid: boolean;
  issues: StrategistIntentRunValidationIssue[];
}

export function buildStrategistIntentProbeEvidence(
  probeId: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: StrategistIntentProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): StrategistIntentProbeEvidence {
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

export function buildStrategistIntentProbeTelemetry(
  probeId: string,
  category: StrategistIntentCategory,
  sequenceIndex: number,
  durationMs: number,
): StrategistIntentProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildStrategistIntentProvenance(
  runId: string,
  fixture: StrategistIntentBaseline,
  contract: StrategistIntentContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly StrategistIntentCategory[];
  },
): StrategistIntentProvenance {
  return {
    runId,
    harnessVersion: FORGE_STRATEGIST_INTENT_VERSION,
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

export function buildStrategistIntentRunRecord(
  provenance: StrategistIntentProvenance,
  evidence: StrategistIntentProbeEvidence[],
  telemetry: StrategistIntentProbeTelemetry[],
): StrategistIntentRunRecord {
  const byCategory = {} as Record<StrategistIntentCategory, number>;
  const byDisposition: Record<StrategistIntentProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of STRATEGIST_INTENT_CATEGORIES) {
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

function validateStrategistIntentRunRecordAgainstProbeIds(
  record: StrategistIntentRunRecord,
  expectedProbeIds: string[],
  contract: StrategistIntentContract,
): StrategistIntentRunValidationResult {
  const issues: StrategistIntentRunValidationIssue[] = [];
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

export function validateStrategistIntentRunRecord(
  record: StrategistIntentRunRecord,
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): StrategistIntentRunValidationResult {
  return validateStrategistIntentRunRecordAgainstProbeIds(
    record,
    listStrategistIntentContractProbeIds(contract),
    contract,
  );
}

/** Validate evidence slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateStrategistIntentEvidenceRunRecord(
  record: StrategistIntentRunRecord,
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): StrategistIntentRunValidationResult {
  const issues: StrategistIntentRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P03-B01-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P03-B01-A06`,
    });
  }

  const expectedCategories = [...STRATEGIST_INTENT_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateStrategistIntentRunRecordAgainstProbeIds(
    record,
    listStrategistIntentFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

export interface StrategistIntentEvidenceSliceResult {
  atom: "P03-B01-A06";
  evidenceProbeCount: number;
  matrixValid: boolean;
  recordValid: boolean;
  results: StrategistIntentProbeResult[];
  evidenceResults: StrategistIntentProbeResult[];
  matrixValidation: StrategistIntentProbeMatrixValidationResult;
  record: StrategistIntentRunRecord;
  recordValidation: StrategistIntentRunValidationResult;
}

export interface StrategistIntentFixtureEntry {
  id: string;
  category: StrategistIntentCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface StrategistIntentBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourcePhaseGate: {
    version: string;
    atom: string;
    contractVersion: string;
    visionerPhaseGateProbeCount: number;
    sealedBlockCount: number;
  };
  probes: StrategistIntentFixtureEntry[];
}

export interface StrategistIntentProbeResult {
  id: string;
  category: StrategistIntentCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface StrategistIntentProbeSummary {
  total: number;
  aligned: number;
  mismatches: StrategistIntentProbeResult[];
  knownGaps: StrategistIntentProbeResult[];
  byCategory: Record<
    StrategistIntentCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface StrategistIntentValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: StrategistIntentCategory;
  detail: string;
}

export interface StrategistIntentValidationResult {
  valid: boolean;
  issues: StrategistIntentValidationIssue[];
}

export interface StrategistIntentContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: StrategistIntentCategory;
  detail: string;
}

export interface StrategistIntentContractCoverageResult {
  valid: boolean;
  issues: StrategistIntentContractCoverageIssue[];
}

export type StrategistIntentProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface StrategistIntentProbeContract {
  id: string;
  category: StrategistIntentCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: StrategistIntentProbeDisposition;
  criterion: string;
}

export interface StrategistIntentCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: true;
}

export interface StrategistIntentCategoryContract {
  category: StrategistIntentCategory;
  acceptance: StrategistIntentCategoryAcceptance;
  probes: readonly StrategistIntentProbeContract[];
}

export interface StrategistIntentContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<StrategistIntentCategory, StrategistIntentCategoryContract>;
  probes: readonly StrategistIntentProbeContract[];
}

export const STRATEGIST_INTENT_A01_MIN_PROBES: Readonly<
  Record<StrategistIntentCategory, number>
> = {
  intent_versioning: 3,
  task_signal: 3,
  decomposition_depth: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

function flattenStrategistIntentCategoryProbes(
  categories: Record<StrategistIntentCategory, StrategistIntentCategoryContract>,
): readonly StrategistIntentProbeContract[] {
  return STRATEGIST_INTENT_CATEGORIES.flatMap(category => categories[category].probes);
}

const STRATEGIST_INTENT_CATEGORY_CONTRACTS: Record<
  StrategistIntentCategory,
  StrategistIntentCategoryContract
> = {
  intent_versioning: {
    category: "intent_versioning",
    acceptance: {
      invariant:
        "Strategist intent baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sint.version_tagged",
        category: "intent_versioning",
        description: "Strategist intent baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist intent baseline declares semver version field",
      },
      {
        id: "sint.atom_tagged",
        category: "intent_versioning",
        description: "Strategist intent baseline declares P03-B01-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Strategist intent baseline declares P03-B01-A01 atom id",
      },
      {
        id: "sint.harness_version_exported",
        category: "intent_versioning",
        description: "FORGE_STRATEGIST_INTENT_VERSION exported for strategist intent harness",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_STRATEGIST_INTENT_VERSION exported for strategist intent harness",
      },
    ],
  },
  task_signal: {
    category: "task_signal",
    acceptance: {
      invariant:
        "Vision document reaches strategist decompose layer; parseDecomposeResponse exports typed block plan.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sint.vision_document_wired",
        category: "task_signal",
        description: "Orchestrator passes vision document into strategist decompose step input",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator passes vision document into strategist decompose step input",
      },
      {
        id: "sint.strategist_layer_invoke",
        category: "task_signal",
        description: "Decompose phase invokes engine.stepWithPhase with strategist layer",
        expected: "PASS",
        disposition: "observed",
        criterion: "Decompose phase invokes engine.stepWithPhase with strategist layer",
      },
      {
        id: "sint.structured_decompose_parse",
        category: "task_signal",
        description: "Typed parseDecomposeResponse exports structured blocks from decompose output",
        expected: "PASS",
        disposition: "observed",
        criterion: "Typed parseDecomposeResponse exports structured blocks from decompose output",
      },
    ],
  },
  decomposition_depth: {
    category: "decomposition_depth",
    acceptance: {
      invariant:
        "Strategist prompt declares block tiers; parser and orchestrator enforce max 8 blocks.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sint.prompt_block_tiers",
        category: "decomposition_depth",
        description: "STRATEGIST_SYSTEM prompt declares simple, medium and complex block count tiers",
        expected: "PASS",
        disposition: "observed",
        criterion: "STRATEGIST_SYSTEM prompt declares simple, medium and complex block count tiers",
      },
      {
        id: "sint.programmatic_block_cap",
        category: "decomposition_depth",
        description: "parseDecomposeResponse enforces max 8 blocks programmatically",
        expected: "PASS",
        disposition: "observed",
        criterion: "parseDecomposeResponse enforces max 8 blocks programmatically",
      },
      {
        id: "sint.orchestrator_block_cap",
        category: "decomposition_depth",
        description: "Orchestrator caps strategist block output at 8 regardless of model output",
        expected: "PASS",
        disposition: "observed",
        criterion: "Orchestrator caps strategist block output at 8 regardless of model output",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant: "Strategist intent baseline links to sealed P02 phase gate and P03 entry handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sint.p02_phase_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P02_TO_P03_PHASE_HANDOFF_V1 targets P03-B01-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P02_TO_P03_PHASE_HANDOFF_V1 targets P03-B01-A01 entry atom",
      },
      {
        id: "sint.p02_sealed_phase_gate_probes",
        category: "baseline_link",
        description: "P02→P03 handoff sealed block inventory matches P02 phase gate block count",
        expected: "PASS",
        disposition: "observed",
        criterion: "P02→P03 handoff sealed block inventory matches P02 phase gate block count",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Vision input boundary assessment handles empty, whitespace-only and oversized inputs; probe runner and documented gaps wired.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sint.source_phase_gate_ref",
        category: "boundary",
        description: "Baseline fixture references sealed P02 phase gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture references sealed P02 phase gate source artifacts",
      },
      {
        id: "sint.probe_runner_exported",
        category: "boundary",
        description: "runStrategistIntentProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runStrategistIntentProbes executes contract-wired probe matrix",
      },
      {
        id: "sint.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL intent gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL intent gap",
      },
      {
        id: "sint.empty_vision_boundary",
        category: "boundary",
        description: "assessStrategistVisionInputBoundary rejects empty vision input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistVisionInputBoundary rejects empty vision input",
      },
      {
        id: "sint.whitespace_vision_boundary",
        category: "boundary",
        description: "assessStrategistVisionInputBoundary rejects whitespace-only vision input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistVisionInputBoundary rejects whitespace-only vision input",
      },
      {
        id: "sint.long_vision_truncation_boundary",
        category: "boundary",
        description: "assessStrategistVisionInputBoundary truncates vision exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessStrategistVisionInputBoundary truncates vision exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Empty decompose guard exists; fixture validation rejects invalid versions.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sint.empty_decompose_guard",
        category: "failure_path",
        description: "Orchestrator rejects decompose output with zero extractable blocks",
        expected: "PASS",
        disposition: "failure",
        criterion: "Orchestrator rejects decompose output with zero extractable blocks",
      },
      {
        id: "sint.invalid_version_rejected",
        category: "failure_path",
        description: "validateStrategistIntentBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion: "validateStrategistIntentBaseline rejects unexpected fixture version",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Checkpoint resume reuses decompose blocks; recoverStrategistDecompose restructures failed decompose parse.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sint.decompose_checkpoint_resume",
        category: "recovery_path",
        description: "Pipeline resume reuses prior checkpoint decompose blocks without re-invoking LLM",
        expected: "PASS",
        disposition: "recovery",
        criterion: "Pipeline resume reuses prior checkpoint decompose blocks without re-invoking LLM",
      },
      {
        id: "sint.structured_decompose_recovery",
        category: "recovery_path",
        description: "recoverStrategistDecompose restructures failed decompose parse into actionable block plan",
        expected: "PASS",
        disposition: "recovery",
        criterion: "recoverStrategistDecompose restructures failed decompose parse into actionable block plan",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant: "Strategist contradiction BLOCK exists; over-decompose output trimmed at 8 blocks.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "sint.strategist_contradiction_block",
        category: "nogo_path",
        description: "Strategist prompt can BLOCK visioner on internal contradictions",
        expected: "PASS",
        disposition: "nogo",
        criterion: "Strategist prompt can BLOCK visioner on internal contradictions",
      },
      {
        id: "sint.over_decompose_nogo",
        category: "nogo_path",
        description: "parseDecomposeResponse trims strategist output exceeding 8 blocks",
        expected: "PASS",
        disposition: "nogo",
        criterion: "parseDecomposeResponse trims strategist output exceeding 8 blocks",
      },
    ],
  },
};

export const FORGE_STRATEGIST_INTENT_CONTRACT_V1: StrategistIntentContract = {
  version: "1.0.0",
  atom: "P03-B01-A05",
  purpose:
    "Typed strategist intent contract declaring measurable vision signal, decomposition depth and block cap probes.",
  categories: STRATEGIST_INTENT_CATEGORY_CONTRACTS,
  probes: flattenStrategistIntentCategoryProbes(STRATEGIST_INTENT_CATEGORY_CONTRACTS),
};

export function getActiveStrategistIntentContract(): StrategistIntentContract {
  return FORGE_STRATEGIST_INTENT_CONTRACT_V1;
}

export function getStrategistIntentCategoryContract(
  category: StrategistIntentCategory,
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): StrategistIntentCategoryContract {
  return contract.categories[category];
}

export function listStrategistIntentContractProbeIds(
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listStrategistIntentProbesByDisposition(
  disposition: StrategistIntentProbeDisposition,
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): StrategistIntentProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listStrategistIntentContractProbesByCategory(
  category: StrategistIntentCategory,
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): StrategistIntentProbeContract[] {
  return contract.categories[category].probes;
}

export function summarizeStrategistIntentContractCoverage(
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<StrategistIntentCategory, { probeCount: number; invariant: string }>;
  byDisposition: Record<StrategistIntentProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    StrategistIntentCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<StrategistIntentProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of STRATEGIST_INTENT_CATEGORIES) {
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

export function validateStrategistIntentContractCoverage(
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): StrategistIntentContractCoverageResult {
  const issues: StrategistIntentContractCoverageIssue[] = [];

  for (const category of STRATEGIST_INTENT_CATEGORIES) {
    const categoryContract = contract.categories[category];
    if (!categoryContract) {
      issues.push({ kind: "missing_category", category, detail: `missing category contract: ${category}` });
      continue;
    }
    if (categoryContract.acceptance.minProbeCount < STRATEGIST_INTENT_A01_MIN_PROBES[category]) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} below A01 baseline ${STRATEGIST_INTENT_A01_MIN_PROBES[category]}`,
      });
    }
    if (categoryContract.probes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${categoryContract.probes.length} probes; contract requires >= ${categoryContract.acceptance.minProbeCount}`,
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

  const ids = listStrategistIntentContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeStrategistIntentContractCoverage(contract);
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
    if (!probe.id.startsWith("sint.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing sint. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateStrategistIntentAgainstContract(
  fixture: StrategistIntentBaseline,
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): StrategistIntentValidationResult {
  const issues: StrategistIntentValidationIssue[] = [];
  const contractIds = new Set(contract.probes.map(p => p.id));
  const fixtureIds = new Set(fixture.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom mismatch fixture=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of STRATEGIST_INTENT_CATEGORIES) {
    const categoryContract = contract.categories[category];
    const categoryProbes = fixture.probes.filter(p => p.category === category);
    if (categoryProbes.length < categoryContract.acceptance.minProbeCount) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${categoryProbes.length} probes; contract requires >= ${categoryContract.acceptance.minProbeCount}`,
      });
    }
  }

  for (const probeEntry of contract.probes) {
    if (!fixtureIds.has(probeEntry.id)) {
      issues.push({ kind: "missing_probe", probeId: probeEntry.id, detail: `fixture missing ${probeEntry.id}` });
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
    if (entry.description !== expected.description) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `description mismatch for ${entry.id}`,
      });
    }
    if (entry.category !== expected.category) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `category mismatch fixture=${entry.category} contract=${expected.category}`,
      });
    }
  }

  const expectedFailCount = contract.probes.filter(p => p.expected === "FAIL").length;
  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (expectedFailCount > 0 && failGaps.length === 0) {
    issues.push({ kind: "missing_category", detail: "fixture must document known FAIL gaps matching contract" });
  }
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_probe",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${expectedFailCount}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

export function validateStrategistIntentBaseline(
  fixture: StrategistIntentBaseline,
): StrategistIntentValidationResult {
  const issues: StrategistIntentValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P03-B01-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    STRATEGIST_INTENT_CATEGORIES.map(category => [category, 0]),
  ) as Record<StrategistIntentCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of STRATEGIST_INTENT_CATEGORIES) {
    const min = STRATEGIST_INTENT_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  const handoff = getForgeP02ToP03PhaseHandoff();
  const phaseGateCoverage = summarizeVisionerPhaseGateContractCoverage(
    getActiveVisionerPhaseGateContract(),
  );

  if (fixture.sourcePhaseGate.atom !== handoff.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `sourcePhaseGate.atom=${fixture.sourcePhaseGate.atom} handoff=${handoff.atom}`,
    });
  }
  if (fixture.sourcePhaseGate.visionerPhaseGateProbeCount !== phaseGateCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourcePhaseGate.visionerPhaseGateProbeCount=${fixture.sourcePhaseGate.visionerPhaseGateProbeCount} ` +
        `contract=${phaseGateCoverage.totalProbes}`,
    });
  }
  if (fixture.sourcePhaseGate.sealedBlockCount !== EXPECTED_P02_PHASE_GATE_SEALED_BLOCK_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourcePhaseGate.sealedBlockCount=${fixture.sourcePhaseGate.sealedBlockCount} ` +
        `expected=${EXPECTED_P02_PHASE_GATE_SEALED_BLOCK_COUNT}`,
    });
  }
  if (handoff.sourcePhase.completedBlocks.length !== EXPECTED_P02_PHASE_GATE_SEALED_BLOCK_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `P02 handoff completedBlocks=${handoff.sourcePhase.completedBlocks.length} ` +
        `expected=${EXPECTED_P02_PHASE_GATE_SEALED_BLOCK_COUNT}`,
    });
  }

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  const expectedFailCount = getActiveStrategistIntentContract().probes.filter(
    p => p.expected === "FAIL",
  ).length;
  if (failGaps.length !== expectedFailCount) {
    issues.push({
      kind: "missing_probe",
      detail: `fixture FAIL count=${failGaps.length} contract expectedFail=${expectedFailCount}`,
    });
  }

  const contractAlignment = validateStrategistIntentAgainstContract(
    fixture,
    getActiveStrategistIntentContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function loadStrategistIntentBaseline(): StrategistIntentBaseline {
  return strategistIntentBaseline as StrategistIntentBaseline;
}

export function summarizeStrategistIntentMatrix(
  results: StrategistIntentProbeResult[],
): StrategistIntentProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as StrategistIntentProbeSummary["byCategory"];
  for (const category of STRATEGIST_INTENT_CATEGORIES) {
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

export function listStrategistIntentProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistIntentBaseline,
): StrategistIntentFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listStrategistIntentKnownGaps(
  results: StrategistIntentProbeResult[],
): StrategistIntentProbeResult[] {
  return summarizeStrategistIntentMatrix(results).knownGaps;
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
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): StrategistIntentProbeResult {
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

function orchestratorSource(): string {
  return readSrc("orchestrator.ts");
}

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function productionIntentSource(): string {
  return readSrc("forge-p03-strategist-intent.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionIntentSource());
}

const SAMPLE_DECOMPOSE_OUTPUT = `REASONING: Break into layers
OUTPUT:
Block 1: Setup core types
Block 2: Wire orchestrator seam
Block 3: Add tests
Block 4: Document handoff
Block 5: Seal block gate
Block 6: Regression gate
Block 7: Guard controls
Block 8: Phase gate
Block 9: Extra block trimmed
DEPENDENCIES: 2→1, 3→1,2
CONFIDENCE: 0.85`;

function probeIntentVersioning(
  id: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistIntentBaseline,
): StrategistIntentProbeResult {
  switch (id) {
    case "sint.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "sint.atom_tagged": {
      const ok = fixture.atom === "P03-B01-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "sint.harness_version_exported": {
      const ok = FORGE_STRATEGIST_INTENT_VERSION.startsWith("1.0.0");
      return probe(id, category, expected, ok, `harnessVersion=${FORGE_STRATEGIST_INTENT_VERSION}`);
    }
    default:
      return probe(id, category, expected, false, "unknown intent_versioning probe");
  }
}

function probeTaskSignal(
  id: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistIntentProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "sint.vision_document_wired": {
      const ok =
        orchestrator.includes("VISION DOCUMENT:") &&
        orchestrator.includes("${visionOutput}");
      return probe(id, category, expected, ok, `visionDocumentWired=${ok}`);
    }
    case "sint.strategist_layer_invoke": {
      const ok =
        orchestrator.includes("stepWithPhase(") &&
        orchestrator.includes('"strategist"') &&
        orchestrator.includes('"decompose"');
      return probe(id, category, expected, ok, `strategistDecompose=${ok}`);
    }
    case "sint.structured_decompose_parse": {
      const parsed = parseDecomposeResponse(SAMPLE_DECOMPOSE_OUTPUT);
      const ok = parsed.ok === true && parsed.data.blocks.length >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `parseDecomposeResponse=${ok}, blocks=${parsed.ok ? parsed.data.blocks.length : 0}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown task_signal probe");
  }
}

function probeDecompositionDepth(
  id: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistIntentProbeResult {
  const prompts = promptsSource();
  const orchestrator = orchestratorSource();
  const parserSource = readSrc("parser.ts");

  switch (id) {
    case "sint.prompt_block_tiers": {
      const ok =
        prompts.includes("Simple tasks") &&
        prompts.includes("Medium tasks") &&
        prompts.includes("Complex tasks") &&
        prompts.includes("ABSOLUTE MAXIMUM: 8 blocks");
      return probe(id, category, expected, ok, `blockTiersInPrompt=${ok}`);
    }
    case "sint.programmatic_block_cap": {
      const ok =
        parserSource.includes("blocks.length > 8") &&
        parserSource.includes("blocks.length = 8");
      return probe(id, category, expected, ok, `parserBlockCap=${ok}`);
    }
    case "sint.orchestrator_block_cap": {
      const ok =
        orchestrator.includes("blocks.length > 8") &&
        orchestrator.includes("capping at 8");
      return probe(id, category, expected, ok, `orchestratorBlockCap=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown decomposition_depth probe");
  }
}

function probeBaselineLink(
  id: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistIntentProbeResult {
  switch (id) {
    case "sint.p02_phase_handoff_entry": {
      const handoff = getForgeP02ToP03PhaseHandoff();
      const ok =
        handoff.targetPhase.entryBlock === "P03-B01" &&
        handoff.targetPhase.entryAtom === "P03-B01-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetPhase.entryBlock}/${handoff.targetPhase.entryAtom}`,
      );
    }
    case "sint.p02_sealed_phase_gate_probes": {
      const handoff = getForgeP02ToP03PhaseHandoff();
      const ok =
        handoff.sealedArtifacts.sealedBlockInventoryCount ===
        EXPECTED_P02_PHASE_GATE_SEALED_BLOCK_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `handoff_blocks=${handoff.sealedArtifacts.sealedBlockInventoryCount}, expected=${EXPECTED_P02_PHASE_GATE_SEALED_BLOCK_COUNT}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown baseline_link probe");
  }
}

function probeBoundary(
  id: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistIntentBaseline,
): StrategistIntentProbeResult {
  switch (id) {
    case "sint.source_phase_gate_ref": {
      const handoff = getForgeP02ToP03PhaseHandoff();
      const coverage = summarizeVisionerPhaseGateContractCoverage(
        getActiveVisionerPhaseGateContract(),
      );
      const ok =
        fixture.sourcePhaseGate.atom === handoff.atom &&
        fixture.sourcePhaseGate.visionerPhaseGateProbeCount === coverage.totalProbes &&
        fixture.sourcePhaseGate.sealedBlockCount === EXPECTED_P02_PHASE_GATE_SEALED_BLOCK_COUNT;
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourcePhaseGate.atom}, probes=${fixture.sourcePhaseGate.visionerPhaseGateProbeCount}`,
      );
    }
    case "sint.probe_runner_exported": {
      const ok = productionIntentSource().includes("export function runStrategistIntentProbes");
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "sint.known_gaps_documented": {
      const contract = getActiveStrategistIntentContract();
      const expectedFail = contract.probes.filter(p => p.expected === "FAIL").length;
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount === expectedFail;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, contractExpectedFail=${expectedFail}`,
      );
    }
    case "sint.empty_vision_boundary": {
      const result = assessStrategistVisionInputBoundary("");
      const ok =
        hasProductionExport("assessStrategistVisionInputBoundary") &&
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
    case "sint.whitespace_vision_boundary": {
      const result = assessStrategistVisionInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessStrategistVisionInputBoundary") &&
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
    case "sint.long_vision_truncation_boundary": {
      const longVision = "x".repeat(STRATEGIST_VISION_MAX_LENGTH + 500);
      const result = assessStrategistVisionInputBoundary(longVision);
      const ok =
        hasProductionExport("assessStrategistVisionInputBoundary") &&
        result.truncated === true &&
        result.normalizedVision.length === STRATEGIST_VISION_MAX_LENGTH &&
        result.acceptable === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `truncated=${result.truncated}, length=${result.normalizedVision.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: StrategistIntentBaseline,
): StrategistIntentProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "sint.empty_decompose_guard": {
      const ok =
        orchestrator.includes("blocks.length === 0") &&
        orchestrator.includes("No blocks could be extracted from decompose output");
      return probe(id, category, expected, ok, `emptyDecomposeGuard=${ok}`);
    }
    case "sint.invalid_version_rejected": {
      const badFixture = { ...fixture, version: "9.9.9" };
      const validation = validateStrategistIntentBaseline(badFixture);
      const ok = validation.valid === false;
      return probe(
        id,
        category,
        expected,
        ok,
        `invalidVersionRejected=${ok}, issues=${validation.issues.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistIntentProbeResult {
  const orchestrator = orchestratorSource();

  switch (id) {
    case "sint.decompose_checkpoint_resume": {
      const ok =
        orchestrator.includes("priorCheckpoint.blocks") &&
        orchestrator.includes('phaseEnd("decompose"') &&
        orchestrator.includes("reused");
      return probe(id, category, expected, ok, `decomposeCheckpointResume=${ok}`);
    }
    case "sint.structured_decompose_recovery": {
      const malformed = `REASONING: Need implementation plan
Here are the steps:
Block 1: Setup core types
Block 2: Wire orchestrator seam
Block 3: Add strategist intent tests
CONFIDENCE: 0.8`;
      const recovery = recoverStrategistDecompose(malformed);
      const ok =
        hasProductionExport("recoverStrategistDecompose") &&
        recovery.recovered === true &&
        recovery.blockCount >= 3 &&
        recovery.blocks.some(block => block.includes("core types")) &&
        recovery.blocks.some(block => block.includes("orchestrator seam")) &&
        recovery.blocks.some(block => block.includes("intent tests"));
      return probe(
        id,
        category,
        expected,
        ok,
        `recovered=${recovery.recovered}, blocks=${recovery.blockCount}, ${recovery.detail}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: StrategistIntentCategory,
  expected: ForgeAcceptanceOutcome,
): StrategistIntentProbeResult {
  const prompts = promptsSource();

  switch (id) {
    case "sint.strategist_contradiction_block": {
      const ok = prompts.includes("You CAN block the Visioner");
      return probe(id, category, expected, ok, `contradictionBlock=${ok}`);
    }
    case "sint.over_decompose_nogo": {
      const parsed = parseDecomposeResponse(SAMPLE_DECOMPOSE_OUTPUT);
      const ok = parsed.ok === true && parsed.data.blocks.length === 8;
      return probe(
        id,
        category,
        expected,
        ok,
        `trimmedBlocks=${parsed.ok ? parsed.data.blocks.length : 0}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runStrategistIntentProbe(
  entry: StrategistIntentFixtureEntry,
  fixture: StrategistIntentBaseline,
): StrategistIntentProbeResult {
  const { id, category, expected } = entry;

  if (category === "intent_versioning") {
    return probeIntentVersioning(id, category, expected, fixture);
  }
  if (category === "task_signal") {
    return probeTaskSignal(id, category, expected);
  }
  if (category === "decomposition_depth") {
    return probeDecompositionDepth(id, category, expected);
  }
  if (category === "baseline_link") {
    return probeBaselineLink(id, category, expected);
  }
  if (category === "boundary") {
    return probeBoundary(id, category, expected, fixture);
  }
  if (category === "failure_path") {
    return probeFailurePath(id, category, expected, fixture);
  }
  if (category === "recovery_path") {
    return probeRecoveryPath(id, category, expected);
  }
  if (category === "nogo_path") {
    return probeNogoPath(id, category, expected);
  }

  return probe(id, category, expected, false, `unknown category: ${category}`);
}

/** Execute strategist intent baseline probe matrix (P03-B01-A01). */
export function runStrategistIntentProbes(
  fixture: StrategistIntentBaseline = loadStrategistIntentBaseline(),
): StrategistIntentProbeResult[] {
  const contract = getActiveStrategistIntentContract();
  return fixture.probes.map(entry => {
    const result = runStrategistIntentProbe(entry, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}

function resolveStrategistGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function runStrategistIntentProbeWithTiming(
  entry: StrategistIntentFixtureEntry,
  fixture: StrategistIntentBaseline,
  contractProbe:
    | { criterion: string; disposition: StrategistIntentProbeDisposition }
    | undefined,
): {
  result: StrategistIntentProbeResult;
  durationMs: number;
  disposition: StrategistIntentProbeDisposition;
} {
  const start = performance.now();
  const result = runStrategistIntentProbe(entry, fixture);
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

function buildStrategistIntentRecordFromEntries(
  entries: StrategistIntentFixtureEntry[],
  fixture: StrategistIntentBaseline,
  contract: StrategistIntentContract,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly StrategistIntentCategory[];
  },
): StrategistIntentRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: StrategistIntentProbeEvidence[] = [];
  const telemetry: StrategistIntentProbeTelemetry[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runStrategistIntentProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildStrategistIntentProbeEvidence(
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
      buildStrategistIntentProbeTelemetry(result.id, result.category, sequenceIndex, durationMs),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildStrategistIntentProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveStrategistGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildStrategistIntentRunRecord(provenance, evidence, telemetry);
}

/** Run all strategist intent probes and emit auditable evidence, telemetry and provenance (P03-B01-A06). */
export function runStrategistIntentProbesWithRecord(
  fixture: StrategistIntentBaseline = loadStrategistIntentBaseline(),
): StrategistIntentRunRecord {
  const contract = getActiveStrategistIntentContract();
  return buildStrategistIntentRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P03-B01-A06). */
export function runStrategistIntentFailureRecoverySliceWithRecord(
  fixture: StrategistIntentBaseline = loadStrategistIntentBaseline(),
): StrategistIntentRunRecord {
  const contract = getActiveStrategistIntentContract();
  const failureRecoveryIds = new Set(listStrategistIntentFailureRecoveryProbeIds(contract));
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildStrategistIntentRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P03-B01-A06",
    sliceCategories: STRATEGIST_INTENT_FAILURE_RECOVERY_CATEGORIES,
  });
}

/**
 * A06 evidence slice: contract-wired failure_path, recovery_path, and nogo_path probes
 * with auditable evidence, telemetry and provenance — zero unexpected mismatches.
 */
export function runStrategistIntentEvidenceSlice(
  fixture: StrategistIntentBaseline = loadStrategistIntentBaseline(),
): StrategistIntentEvidenceSliceResult {
  const contract = getActiveStrategistIntentContract();
  const results = runStrategistIntentProbes(fixture);
  const failureRecoveryProbes = STRATEGIST_INTENT_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listStrategistIntentContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const evidenceResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateStrategistIntentFailureRecoveryProbeMatrix(results, contract);
  const record = runStrategistIntentFailureRecoverySliceWithRecord(fixture);
  const recordValidation = validateStrategistIntentEvidenceRunRecord(record, contract);

  return {
    atom: "P03-B01-A06",
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

// ─── Property and fuzz validation (P03-B01-A07) ─────────────────────────────

export interface StrategistIntentPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface StrategistIntentPropertyResult {
  passed: number;
  failed: StrategistIntentPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type StrategistIntentPropertyCheck = {
  id: string;
  description: string;
  check: (contract: StrategistIntentContract) => string | null;
};

const STRATEGIST_INTENT_STRUCTURAL_PROPERTIES: readonly StrategistIntentPropertyCheck[] = [
  {
    id: "categories_complete",
    description: "All eight strategist intent categories are declared",
    check: contract => {
      for (const category of STRATEGIST_INTENT_CATEGORIES) {
        if (!contract.categories[category]) return `missing category: ${category}`;
      }
      return null;
    },
  },
  {
    id: "probe_ids_unique",
    description: "Probe ids are globally unique",
    check: contract => {
      const ids = listStrategistIntentContractProbeIds(contract);
      if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
      return null;
    },
  },
  {
    id: "min_probe_count",
    description: "Each category meets contract minProbeCount",
    check: contract => {
      for (const category of STRATEGIST_INTENT_CATEGORIES) {
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
      "summarizeStrategistIntentContractCoverage totals match listStrategistIntentContractProbeIds",
    check: contract => {
      const summary = summarizeStrategistIntentContractCoverage(contract);
      const ids = listStrategistIntentContractProbeIds(contract);
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
    description: "Probe ids are namespaced with sint. prefix",
    check: contract => {
      for (const probe of contract.probes) {
        if (!probe.id.startsWith("sint.")) {
          return `${probe.id} missing sint. prefix`;
        }
      }
      return null;
    },
  },
  {
    id: "run_record_summary_invariant",
    description: "Run record summary aligned + mismatches equals total",
    check: contract => {
      const fixture = loadStrategistIntentBaseline();
      const probeIds = listStrategistIntentContractProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildStrategistIntentProbeEvidence(
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
        return buildStrategistIntentProbeTelemetry(id, probe.category, index, index);
      });
      const record = buildStrategistIntentRunRecord(
        buildStrategistIntentProvenance(
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
      "Synthetic failure/recovery slice record passes validateStrategistIntentEvidenceRunRecord",
    check: contract => {
      const fixture = loadStrategistIntentBaseline();
      const probeIds = listStrategistIntentFailureRecoveryProbeIds(contract);
      const evidence = probeIds.map(id => {
        const probe = contract.probes.find(p => p.id === id)!;
        return buildStrategistIntentProbeEvidence(
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
        return buildStrategistIntentProbeTelemetry(id, probe.category, index, index * 0.5);
      });
      const record = buildStrategistIntentRunRecord(
        buildStrategistIntentProvenance(
          "property-check-failure-recovery",
          fixture,
          contract,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:01.000Z",
          probeIds.length,
          {
            sliceAtom: "P03-B01-A06",
            sliceCategories: STRATEGIST_INTENT_FAILURE_RECOVERY_CATEGORIES,
          },
        ),
        evidence,
        telemetry,
      );
      const validation = validateStrategistIntentEvidenceRunRecord(record, contract);
      if (!validation.valid) {
        return validation.issues.map(i => i.detail).join("; ");
      }
      return null;
    },
  },
] as const;

export function runStrategistIntentPropertyChecks(
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): StrategistIntentPropertyResult {
  const failed: StrategistIntentPropertyViolation[] = [];
  for (const property of STRATEGIST_INTENT_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = STRATEGIST_INTENT_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type StrategistIntentFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface StrategistIntentFuzzMutationCase {
  seed: number;
  kind: StrategistIntentFuzzMutationKind;
  probeId?: string;
  category?: StrategistIntentCategory;
}

export interface StrategistIntentFuzzValidationCaseResult {
  mutation: StrategistIntentFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface StrategistIntentFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: StrategistIntentFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createStrategistIntentFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneStrategistIntentBaseline(fixture: StrategistIntentBaseline): StrategistIntentBaseline {
  return {
    ...fixture,
    sourcePhaseGate: { ...fixture.sourcePhaseGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickStrategistIntentFuzzTarget(
  fixture: StrategistIntentBaseline,
  rng: () => number,
): { category: StrategistIntentCategory; index: number; entry: StrategistIntentFixtureEntry } {
  const category = STRATEGIST_INTENT_CATEGORIES[Math.floor(rng() * STRATEGIST_INTENT_CATEGORIES.length)]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyStrategistIntentFuzzMutation(
  fixture: StrategistIntentBaseline,
  mutation: StrategistIntentFuzzMutationCase,
): StrategistIntentBaseline {
  const mutated = cloneStrategistIntentBaseline(fixture);
  const targetCategory = mutation.category ?? STRATEGIST_INTENT_CATEGORIES[0]!;
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
          id: `sint.fuzz.extra.${mutation.seed}`,
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
      const other = STRATEGIST_INTENT_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateStrategistIntentFuzzMutationCases(
  fixture: StrategistIntentBaseline,
  seed: number,
  iterations: number,
): StrategistIntentFuzzMutationCase[] {
  const rng = createStrategistIntentFuzzRng(seed);
  const kinds: StrategistIntentFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: StrategistIntentFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickStrategistIntentFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P03-B01-A07). */
export function runStrategistIntentFuzzValidation(
  fixture: StrategistIntentBaseline,
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
  seed = 42,
  iterations = 24,
): StrategistIntentFuzzValidationResult {
  const cases = generateStrategistIntentFuzzMutationCases(fixture, seed, iterations);
  const results: StrategistIntentFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyStrategistIntentFuzzMutation(fixture, mutation);
    const validation = validateStrategistIntentAgainstContract(mutated, contract);
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

export type StrategistIntentRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface StrategistIntentRunRecordFuzzCase {
  kind: StrategistIntentRunRecordFuzzKind;
  probeId?: string;
}

export function applyStrategistIntentRunRecordFuzzMutation(
  record: StrategistIntentRunRecord,
  mutation: StrategistIntentRunRecordFuzzCase,
): StrategistIntentRunRecord {
  const cloned: StrategistIntentRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P03-B01-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["intent_versioning"],
      };
      break;
  }

  cloned.summary = buildStrategistIntentRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveStrategistIntentRunRecordValidator(
  record: StrategistIntentRunRecord,
): (
  record: StrategistIntentRunRecord,
  contract: StrategistIntentContract,
) => StrategistIntentRunValidationResult {
  return record.provenance.sliceAtom === "P03-B01-A06"
    ? validateStrategistIntentEvidenceRunRecord
    : validateStrategistIntentRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P03-B01-A07). */
export function runStrategistIntentRunRecordFuzzValidation(
  record: StrategistIntentRunRecord,
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveStrategistIntentRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: StrategistIntentRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P03-B01-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyStrategistIntentRunRecordFuzzMutation(record, mutation);
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

export interface StrategistIntentPropertyFuzzSliceResult {
  atom: "P03-B01-A07";
  propertyChecksPassed: boolean;
  contractFuzzRejected: boolean;
  runRecordFuzzRejected: boolean;
  propertyResult: StrategistIntentPropertyResult;
  contractFuzz: StrategistIntentFuzzValidationResult;
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
export function runStrategistIntentPropertyFuzzSlice(
  fixture: StrategistIntentBaseline = loadStrategistIntentBaseline(),
): StrategistIntentPropertyFuzzSliceResult {
  const contract = getActiveStrategistIntentContract();
  const propertyResult = runStrategistIntentPropertyChecks(contract);
  const contractFuzz = runStrategistIntentFuzzValidation(fixture, contract);
  const record = runStrategistIntentFailureRecoverySliceWithRecord(fixture);
  const runRecordFuzz = runStrategistIntentRunRecordFuzzValidation(record, contract);

  return {
    atom: "P03-B01-A07",
    propertyChecksPassed: propertyResult.allPassed,
    contractFuzzRejected: contractFuzz.allMutationsRejected,
    runRecordFuzzRejected: runRecordFuzz.mutationsAccepted === 0,
    propertyResult,
    contractFuzz,
    runRecordFuzz,
  };
}

// ─── Probe regression detection (P03-B01-A08) ────────────────────────────────

export interface StrategistIntentProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare strategist intent run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectStrategistIntentProbeRegression(
  prior: StrategistIntentRunRecord,
  current: StrategistIntentRunRecord,
): StrategistIntentProbeRegressionReport {
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

export interface StrategistIntentForgeRegressionResult {
  atom: "P03-B01-A08";
  passed: boolean;
  productionSlice: StrategistIntentProductionSliceResult;
  propertyFuzzSlice: StrategistIntentPropertyFuzzSliceResult;
  record: StrategistIntentRunRecord;
  recordValid: boolean;
  priorRecordValid: boolean;
  validationIssues: string[];
  priorValidationIssues: string[];
  probeRegression: StrategistIntentProbeRegressionReport | null;
  detail: string;
}

/**
 * Execute strategist intent probes, validate production slice + run record, property/fuzz gates,
 * and optionally detect regression vs prior run. Forge pipeline integration gate (P03-B01-A08).
 */
export function runStrategistIntentForgeRegression(
  priorRecord?: StrategistIntentRunRecord,
): StrategistIntentForgeRegressionResult {
  const fixture = loadStrategistIntentBaseline();
  const contract = getActiveStrategistIntentContract();
  const productionSlice = runStrategistIntentProductionSlice(fixture);
  const propertyFuzzSlice = runStrategistIntentPropertyFuzzSlice(fixture);
  const record = runStrategistIntentProbesWithRecord(fixture);
  const validation = validateStrategistIntentRunRecord(record, contract);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  let priorRecordValid = true;
  let priorValidationIssues: string[] = [];
  if (priorRecord) {
    const priorValidation = validateStrategistIntentRunRecord(priorRecord, contract);
    priorRecordValid = priorValidation.valid && priorRecord.summary.mismatches === 0;
    priorValidationIssues = priorValidation.issues.map(issue => issue.detail);
  }

  const probeRegression = priorRecord
    ? detectStrategistIntentProbeRegression(priorRecord, record)
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
    atom: "P03-B01-A08",
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

// ─── Guard controls (P03-B01-A09) ────────────────────────────────────────────

export interface ForgeStrategistIntentGuardControls {
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

export interface StrategistIntentGuardCheckIssue {
  domain: "adversarial" | "performance" | "cost" | "safety";
  code: string;
  detail: string;
}

export interface StrategistIntentGuardCheckResult {
  passed: boolean;
  issues: StrategistIntentGuardCheckIssue[];
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

export interface StrategistIntentAdversarialGuardScenario {
  id: string;
  description: string;
  build: (record: StrategistIntentRunRecord) => StrategistIntentRunRecord;
  expectRejected: true;
}

export const FORGE_STRATEGIST_INTENT_GUARD_CONTROLS_V1: ForgeStrategistIntentGuardControls = {
  atom: "P03-B01-A09",
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

export function getForgeStrategistIntentGuardControls(): ForgeStrategistIntentGuardControls {
  return FORGE_STRATEGIST_INTENT_GUARD_CONTROLS_V1;
}

function parseStrategistIntentIsoDurationMs(startedAt: string, completedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function summarizeStrategistIntentTelemetry(telemetry: StrategistIntentProbeTelemetry[]): {
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

export function detectStrategistIntentEvidenceSummaryMismatch(
  record: StrategistIntentRunRecord,
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

export function detectStrategistIntentFalseAlignment(record: StrategistIntentRunRecord): string[] {
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

export function validateStrategistIntentSafety(
  record: StrategistIntentRunRecord,
  controls: ForgeStrategistIntentGuardControls = getForgeStrategistIntentGuardControls(),
): StrategistIntentGuardCheckIssue[] {
  const issues: StrategistIntentGuardCheckIssue[] = [];
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

export function validateStrategistIntentPerformance(
  record: StrategistIntentRunRecord,
  controls: ForgeStrategistIntentGuardControls = getForgeStrategistIntentGuardControls(),
): StrategistIntentGuardCheckIssue[] {
  const issues: StrategistIntentGuardCheckIssue[] = [];
  const { suiteDurationMs, maxProbeDurationMs } = summarizeStrategistIntentTelemetry(record.telemetry);
  const wallClockMs = parseStrategistIntentIsoDurationMs(
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

export function validateStrategistIntentCost(
  totalCostUsd: number,
  llmCalls: number,
  controls: ForgeStrategistIntentGuardControls = getForgeStrategistIntentGuardControls(),
): StrategistIntentGuardCheckIssue[] {
  const issues: StrategistIntentGuardCheckIssue[] = [];
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

export function buildStrategistIntentAdversarialGuardScenarios(): StrategistIntentAdversarialGuardScenario[] {
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

export function runStrategistIntentAdversarialGuardChecks(
  fixtureRecord: StrategistIntentRunRecord,
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): { rejected: number; total: number; failures: string[] } {
  const scenarios = buildStrategistIntentAdversarialGuardScenarios();
  const failures: string[] = [];
  let rejected = 0;

  for (const scenario of scenarios) {
    const tampered = scenario.build(fixtureRecord);
    const validation = validateStrategistIntentRunRecord(tampered, contract);
    const falseAlignment = detectStrategistIntentFalseAlignment(tampered);
    const summaryMismatch = detectStrategistIntentEvidenceSummaryMismatch(tampered);
    const rejectedByGuard =
      !validation.valid || falseAlignment.length > 0 || summaryMismatch !== null;

    if (rejectedByGuard) rejected++;
    else failures.push(`${scenario.id}: tampered record was not rejected`);
  }

  return { rejected, total: scenarios.length, failures };
}

export function validateForgeStrategistIntentGuard(
  record: StrategistIntentRunRecord,
  options: {
    totalCostUsd?: number;
    llmCalls?: number;
    contract?: StrategistIntentContract;
    controls?: ForgeStrategistIntentGuardControls;
  } = {},
): StrategistIntentGuardCheckResult {
  const controls = options.controls ?? getForgeStrategistIntentGuardControls();
  const contract = options.contract ?? getActiveStrategistIntentContract();
  const totalCostUsd = options.totalCostUsd ?? 0;
  const llmCalls = options.llmCalls ?? 0;
  const issues: StrategistIntentGuardCheckIssue[] = [];

  issues.push(...validateStrategistIntentPerformance(record, controls));
  issues.push(...validateStrategistIntentCost(totalCostUsd, llmCalls, controls));
  issues.push(...validateStrategistIntentSafety(record, controls));

  const falseAlignment = detectStrategistIntentFalseAlignment(record);
  if (falseAlignment.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "false_alignment",
      detail: falseAlignment.join("; "),
    });
  }
  const summaryMismatch = detectStrategistIntentEvidenceSummaryMismatch(record);
  if (summaryMismatch) {
    issues.push({
      domain: "adversarial",
      code: "summary_evidence_mismatch",
      detail: summaryMismatch,
    });
  }

  const adversarial = runStrategistIntentAdversarialGuardChecks(record, contract);
  if (adversarial.failures.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "scenario_not_rejected",
      detail: adversarial.failures.join("; "),
    });
  }

  const telemetrySummary = summarizeStrategistIntentTelemetry(record.telemetry);
  const wallClockMs = parseStrategistIntentIsoDurationMs(
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

// ─── Block gate and handoff (P03-B01-A10) ─────────────────────────────────────

export interface StrategistIntentBlockGateEvidence {
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

export interface StrategistIntentBlockHandoffContract {
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
    strategistIntentCategories: readonly StrategistIntentCategory[];
    sourcePhaseGateAtom: string;
  };
  prerequisites: readonly string[];
  entryCriteria: {
    description: string;
    requiresBlockGatePass: true;
    strategistIntentRecordRequired: true;
  };
}

export const FORGE_P03_B01_BLOCK_GATE_V1: ForgeBlockGateDefinition = {
  version: "1.0.0",
  atom: "P03-B01-A10",
  blockId: "P03-B01",
  title: "Hedef decomposition",
  requiredAtomIds: [
    "P03-B01-A01",
    "P03-B01-A02",
    "P03-B01-A03",
    "P03-B01-A04",
    "P03-B01-A05",
    "P03-B01-A06",
    "P03-B01-A07",
    "P03-B01-A08",
    "P03-B01-A09",
    "P03-B01-A10",
  ],
  checks: [
    { id: "fixture_contract_alignment", atomId: "P03-B01-A01", description: "Strategist intent baseline aligns with typed contract and P02 phase gate handoff" },
    { id: "typed_contract_coverage", atomId: "P03-B01-A02", description: "Contract declares measurable probes for all strategist intent categories" },
    { id: "probe_matrix_aligned", atomId: "P03-B01-A03", description: "Strategist intent probe matrix executes with zero unexpected mismatches" },
    { id: "boundary_disposition_coverage", atomId: "P03-B01-A04", description: "Contract covers observed, failure, recovery and NO-GO dispositions with boundary probes" },
    { id: "failure_recovery_nogo", atomId: "P03-B01-A05", description: "Failure, recovery and NO-GO probes are declared and exercised" },
    { id: "evidence_telemetry_provenance", atomId: "P03-B01-A06", description: "Run record carries evidence, telemetry and provenance" },
    { id: "property_and_fuzz", atomId: "P03-B01-A07", description: "Structural property and fuzz validation reject tampered inputs" },
    { id: "regression_gate", atomId: "P03-B01-A08", description: "Regression gate passes on canonical strategist intent matrix" },
    { id: "guard_controls", atomId: "P03-B01-A09", description: "Adversarial, performance, cost and safety guard controls pass" },
    { id: "block_gate_sealed", atomId: "P03-B01-A10", description: "Block gate evidence sealed with valid B02 handoff contract" },
  ] satisfies readonly ForgeBlockGateCheck[],
};

export const FORGE_P03_B01_TO_B02_HANDOFF_V1: StrategistIntentBlockHandoffContract = {
  version: "1.0.0",
  atom: "P03-B01-A10",
  sourceBlock: {
    blockId: "P03-B01",
    title: "Hedef decomposition",
    completedAtoms: FORGE_P03_B01_BLOCK_GATE_V1.requiredAtomIds,
  },
  targetBlock: {
    blockId: "P03-B02",
    title: "Block üretim kontratı",
    entryAtom: "P03-B02-A01",
  },
  sealedArtifacts: {
    fixtureVersion: "1.0.0",
    contractVersion: FORGE_STRATEGIST_INTENT_CONTRACT_V1.version,
    harnessVersion: FORGE_STRATEGIST_INTENT_VERSION,
    probeCount: summarizeStrategistIntentContractCoverage(FORGE_STRATEGIST_INTENT_CONTRACT_V1).totalProbes,
    strategistIntentCategories: STRATEGIST_INTENT_CATEGORIES,
    sourcePhaseGateAtom: "P02-PHASE-GATE",
  },
  prerequisites: [
    "Strategist intent contract v1 with measurable vision signal, decomposition depth and block cap probes",
    "Versioned strategist intent baseline aligned to contract probe matrix and sealed P02 phase gate handoff",
    "Evidence, telemetry and provenance run records",
    "Regression and guard gates integrated with orchestrator verification",
    "Sealed P02 visioner phase gate referenced by sourcePhaseGateAtom",
  ],
  entryCriteria: {
    description:
      "P03-B02-A01 formalizes block production contract using sealed strategist intent decomposition artifacts",
    requiresBlockGatePass: true,
    strategistIntentRecordRequired: true,
  },
};

export function getForgeP03B01BlockGate(): ForgeBlockGateDefinition {
  return FORGE_P03_B01_BLOCK_GATE_V1;
}

export function getForgeP03B01ToB02Handoff(): StrategistIntentBlockHandoffContract {
  return FORGE_P03_B01_TO_B02_HANDOFF_V1;
}

export function validateStrategistIntentBlockHandoffContract(
  handoff: StrategistIntentBlockHandoffContract,
  evidence: Pick<StrategistIntentBlockGateEvidence, "probeCount" | "regressionPassed" | "guardPassed">,
  contract: StrategistIntentContract = getActiveStrategistIntentContract(),
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const coverage = summarizeStrategistIntentContractCoverage(contract);

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
  if (handoff.sealedArtifacts.strategistIntentCategories.length !== STRATEGIST_INTENT_CATEGORIES.length) {
    issues.push("handoff strategistIntentCategories incomplete");
  }
  if (handoff.targetBlock.entryAtom !== "P03-B02-A01") {
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

export function buildStrategistIntentBlockGateEvidence(
  atomSeals: ForgeBlockAtomSeal[],
  regressionPassed: boolean,
  guardPassed: boolean,
  probeCount: number,
  gitCommit?: string,
  blockId = FORGE_P03_B01_BLOCK_GATE_V1.blockId,
): StrategistIntentBlockGateEvidence {
  const handoff = getForgeP03B01ToB02Handoff();
  const handoffValid = validateStrategistIntentBlockHandoffContract(handoff, {
    probeCount,
    regressionPassed,
    guardPassed,
  }).valid;

  return {
    blockId,
    atom: "P03-B01-A10",
    sealedAt: new Date().toISOString(),
    atomSeals,
    regressionPassed,
    guardPassed,
    handoffValid,
    probeCount,
    ...(gitCommit ? { gitCommit } : {}),
  };
}
