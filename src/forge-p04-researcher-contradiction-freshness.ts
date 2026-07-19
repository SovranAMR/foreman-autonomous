/**
 * FOREMAN — Researcher Contradiction & Freshness Resolution Baseline (P04-B06)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P04-B05 citation provenance graph block gate artifacts.
 */

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

export const FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_VERSION = "1.0.0-a01";

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

  const failGaps = fixture.probes.filter(p => p.expected === "FAIL");
  if (failGaps.length < 1) {
    issues.push({
      kind: "missing_category",
      detail: "fixture must document at least one measurable FAIL gap",
    });
  }

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
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount >= 1;
      return probe(id, category, expected, ok, `documentedFail=${failCount}`);
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
      const ok = hasProductionExport("resolveResearchContradictions");
      return probe(id, category, expected, ok, `resolveResearchContradictions=${ok}`);
    }
    case "rcfr.exported_freshness_validator": {
      const ok = hasProductionExport("validateResearchFreshness");
      return probe(id, category, expected, ok, `validateResearchFreshness=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown probe id");
  }
}

export function runResearcherContradictionFreshnessProbes(
  fixture: ResearcherContradictionFreshnessBaseline = loadResearcherContradictionFreshnessBaseline(),
): ResearcherContradictionFreshnessProbeResult[] {
  return fixture.probes.map(entry =>
    runSingleProbe(entry.id, entry.category, entry.expected, fixture),
  );
}
