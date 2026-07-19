/**
 * FOREMAN — Researcher Research-to-Worker Handoff Baseline (P04-B09)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P04-B08 spike falsification block gate artifacts.
 */

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
import { parseResearchResponse } from "./parser.js";

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

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length === 0) {
    issues.push({
      kind: "missing_category",
      detail: "fixture must document known FAIL gaps for A01 baseline debt",
    });
  }

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
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount >= 1;
      return probe(id, category, expected, ok, `documentedFailGaps=${failCount}`);
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
      const ok = /\bexport function parseResearchToWorkerHandoff\b/.test(parserSource());
      return probe(id, category, expected, ok, `parseResearchToWorkerHandoff=${ok}`);
    }
    case "rtwh.exported_handoff_validator": {
      const ok = hasProductionExport("validateResearchToWorkerHandoff");
      const riskSample = validateResearchRiskTradeoff(SAMPLE_RESEARCH_OUTPUT);
      return probe(
        id,
        category,
        expected,
        ok,
        `handoffValidator=${ok}, riskTradeoffSample=${riskSample.valid}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown probe");
  }
}

export function runResearcherResearchToWorkerHandoffProbes(
  fixture: ResearcherResearchToWorkerHandoffBaseline = loadResearcherResearchToWorkerHandoffBaseline(),
): ResearcherResearchToWorkerHandoffProbeResult[] {
  return fixture.probes.map(entry =>
    runSingleProbe(entry.id, entry.category, entry.expected, fixture),
  );
}
