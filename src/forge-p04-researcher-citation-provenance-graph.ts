/**
 * FOREMAN — Researcher Citation & Provenance Graph Baseline (P04-B05)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P04-B04 benchmark prior-art block gate artifacts.
 * A04: boundary-category slice gate for citation input edge cases and probe matrix alignment.
 * A05: failure/recovery/NO-GO slice gate for failure_path, recovery_path and nogo_path probes.
 * A06: evidence, telemetry and provenance run record for failure/recovery slice gate.
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import researcherCitationProvenanceGraphBaseline from "./fixtures/forge-researcher-citation-provenance-graph-v1.json" with { type: "json" };
import type {
  ForgeAcceptanceOutcome,
  ForgeBlockAtomSeal,
  ForgeBlockGateCheck,
  ForgeBlockGateDefinition,
} from "./forge-baseline-contract.js";
import {
  getForgeP04B04ToB05Handoff,
  getActiveResearcherBenchmarkPriorArtContract,
  loadResearcherBenchmarkPriorArtBaseline,
  summarizeResearcherBenchmarkPriorArtContractCoverage,
  recoverBenchmarkPriorArtEvidence,
  buildResearcherBenchmarkPriorArtProvenance,
  FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_CONTRACT_V1,
} from "./forge-p04-researcher-benchmark-prior-art.js";
import { validateInRepoEvidenceCollection } from "./forge-p04-researcher-in-repo-evidence.js";
import { buildPlanProvenanceGraph } from "./plan-provenance-graph.js";

export const FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_VERSION = "1.0.0-a06";

export const EXPECTED_P04_B04_SEALED_ATOM_COUNT = 10;

/** Maximum normalized citation parse input length before truncation (P04-B05-A01 boundary). */
export const RESEARCHER_CITATION_PROVENANCE_GRAPH_INPUT_MAX_LENGTH = 8192;

export const RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES = [
  "evidence_versioning",
  "citation_signal",
  "provenance_graph_signal",
  "baseline_link",
  "boundary",
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const;

export type ResearcherCitationProvenanceGraphCategory =
  (typeof RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES)[number];

export type CitationProvenanceGraphInputDisposition =
  | "valid"
  | "empty"
  | "whitespace_only"
  | "contains_null_byte"
  | "exceeds_max_length";

export interface CitationProvenanceGraphInputBoundary {
  disposition: CitationProvenanceGraphInputDisposition;
  acceptable: boolean;
  normalizedInput: string;
  truncated: boolean;
  detail: string;
}

/**
 * Assess citation parse input boundary conditions before graph construction (P04-B05-A01).
 */
export function assessCitationProvenanceGraphInputBoundary(
  citationInput: string,
): CitationProvenanceGraphInputBoundary {
  if (citationInput.includes("\0")) {
    return {
      disposition: "contains_null_byte",
      acceptable: false,
      normalizedInput: "",
      truncated: false,
      detail: "null byte detected in citation input",
    };
  }

  const trimmed = citationInput.trim();
  if (trimmed.length === 0) {
    const disposition: CitationProvenanceGraphInputDisposition =
      citationInput.length === 0 ? "empty" : "whitespace_only";
    return {
      disposition,
      acceptable: false,
      normalizedInput: "",
      truncated: false,
      detail: disposition === "empty" ? "empty citation input" : "whitespace-only citation input",
    };
  }

  let normalizedInput = citationInput;
  let truncated = false;
  if (normalizedInput.length > RESEARCHER_CITATION_PROVENANCE_GRAPH_INPUT_MAX_LENGTH) {
    normalizedInput = normalizedInput.slice(0, RESEARCHER_CITATION_PROVENANCE_GRAPH_INPUT_MAX_LENGTH);
    truncated = true;
  }

  return {
    disposition: truncated ? "exceeds_max_length" : "valid",
    acceptable: true,
    normalizedInput,
    truncated,
    detail: truncated
      ? `citation input truncated to ${RESEARCHER_CITATION_PROVENANCE_GRAPH_INPUT_MAX_LENGTH} characters`
      : "valid citation input",
  };
}

export interface CitationProvenanceGraphNode {
  id: string;
  kind: "claim" | "source" | "artifact";
  label: string;
  sourceRef?: string;
}

export interface CitationProvenanceGraphEdge {
  from: string;
  to: string;
  kind: "cites" | "derives" | "lineage";
}

export interface CitationProvenanceGraph {
  version: string;
  nodes: CitationProvenanceGraphNode[];
  edges: CitationProvenanceGraphEdge[];
}

export interface CitationProvenanceGraphCollectionValidationOutcome {
  valid: boolean;
  nodeCount: number;
  edgeCount: number;
  issues: string[];
}

/**
 * Validate citation provenance graph collection before orchestrator wiring (P04-B05-A01).
 */
export function validateCitationProvenanceGraphCollection(
  graph: CitationProvenanceGraph,
): CitationProvenanceGraphCollectionValidationOutcome {
  const issues: string[] = [];
  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;

  if (nodeCount === 0) {
    return {
      valid: false,
      nodeCount,
      edgeCount,
      issues: ["zero citation graph nodes"],
    };
  }

  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (!node.id || node.id.trim().length === 0) {
      issues.push("citation graph node missing id");
      continue;
    }
    if (nodeIds.has(node.id)) {
      issues.push(`duplicate citation graph node id: ${node.id}`);
    }
    nodeIds.add(node.id);
    if (!node.label || node.label.trim().length === 0) {
      issues.push(`citation graph node ${node.id} missing label`);
    }
  }

  for (const edge of graph.edges) {
    if (!edge.from || !edge.to) {
      issues.push("citation graph edge missing from/to");
      continue;
    }
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push(`citation graph edge references unknown node: ${edge.from}→${edge.to}`);
    }
  }

  const hasSourceNode = graph.nodes.some(
    node => node.kind === "source" && (node.sourceRef?.length ?? 0) > 0,
  );
  if (!hasSourceNode) {
    issues.push("citation graph missing source node with sourceRef");
  }

  return {
    valid: issues.length === 0,
    nodeCount,
    edgeCount,
    issues,
  };
}

export interface CitationProvenanceGraphRecoveryHints {
  topic?: string;
  defaultClaimId?: string;
}

export interface CitationProvenanceGraphRecoveryResult {
  recovered: boolean;
  graph: CitationProvenanceGraph;
  parseErrors: string[];
  detail: string;
}

const CITATION_HTTP_URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const CITATION_REPO_PATH_LINE_PATTERN = /(?:src\/[^\s:]+\.(?:ts|tsx|js|jsx|md))(?::(\d+))?/gi;
const CITATION_MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi;

/**
 * Restructure failed citation parse into actionable provenance graph plan (P04-B05-A01 recovery).
 */
export function recoverCitationProvenanceGraph(
  failedParse: string,
  hints: CitationProvenanceGraphRecoveryHints = {},
): CitationProvenanceGraphRecoveryResult {
  const parseErrors: string[] = [];
  const boundary = assessCitationProvenanceGraphInputBoundary(failedParse);

  if (!boundary.acceptable) {
    return {
      recovered: false,
      graph: { version: "1.0.0", nodes: [], edges: [] },
      parseErrors: [boundary.disposition],
      detail: `cannot recover ${boundary.disposition.replace(/_/g, "-")} citation parse`,
    };
  }

  const raw = boundary.normalizedInput;
  const nodes: CitationProvenanceGraphNode[] = [];
  const edges: CitationProvenanceGraphEdge[] = [];
  const claimId = hints.defaultClaimId ?? "claim:0";

  nodes.push({
    id: claimId,
    kind: "claim",
    label: (hints.topic ?? "research finding").slice(0, 120),
  });

  let sourceIndex = 0;
  for (const match of raw.matchAll(CITATION_MARKDOWN_LINK_PATTERN)) {
    const title = match[1]?.trim();
    const sourceRef = match[2]?.trim();
    if (!sourceRef) continue;
    const nodeId = `source:${sourceIndex++}`;
    nodes.push({
      id: nodeId,
      kind: "source",
      label: title || sourceRef.slice(0, 80),
      sourceRef,
    });
    edges.push({ from: claimId, to: nodeId, kind: "cites" });
  }

  for (const match of raw.matchAll(CITATION_HTTP_URL_PATTERN)) {
    const sourceRef = match[0]?.trim();
    if (!sourceRef) continue;
    if (nodes.some(node => node.sourceRef === sourceRef)) continue;
    const nodeId = `source:${sourceIndex++}`;
    nodes.push({
      id: nodeId,
      kind: "source",
      label: sourceRef.slice(0, 80),
      sourceRef,
    });
    edges.push({ from: claimId, to: nodeId, kind: "cites" });
  }

  for (const match of raw.matchAll(CITATION_REPO_PATH_LINE_PATTERN)) {
    const file = match[0]?.trim();
    if (!file) continue;
    const nodeId = `artifact:${sourceIndex++}`;
    nodes.push({
      id: nodeId,
      kind: "artifact",
      label: file.slice(0, 80),
      sourceRef: file,
    });
    edges.push({ from: claimId, to: nodeId, kind: "lineage" });
  }

  if (edges.length === 0) {
    const priorArtRecovery = recoverBenchmarkPriorArtEvidence(raw, { topic: hints.topic });
    for (const target of priorArtRecovery.evidencePlan.citationTargets) {
      const nodeId = `source:${sourceIndex++}`;
      nodes.push({
        id: nodeId,
        kind: "source",
        label: (target.title ?? target.source).slice(0, 80),
        sourceRef: target.source,
      });
      edges.push({ from: claimId, to: nodeId, kind: "cites" });
    }
  }

  const graph: CitationProvenanceGraph = {
    version: "1.0.0",
    nodes,
    edges,
  };

  if (edges.length === 0) {
    return {
      recovered: false,
      graph,
      parseErrors,
      detail: "no actionable citation edges extracted from failed parse",
    };
  }

  if (edges.length === 1 && !raw.includes("CITES:")) {
    parseErrors.push("missing_cites_inferred");
  }

  const validation = validateCitationProvenanceGraphCollection(graph);
  return {
    recovered: validation.valid,
    graph,
    parseErrors,
    detail: validation.valid
      ? `recovered ${graph.nodes.length} nodes and ${graph.edges.length} edges from failed citation parse`
      : validation.issues.join("; "),
  };
}

export interface ResearchCitationProvenanceGraphBuildResult {
  graph: CitationProvenanceGraph;
  validation: CitationProvenanceGraphCollectionValidationOutcome;
  recovered: boolean;
  parseErrors: string[];
  detail: string;
}

/**
 * Build researcher citation→provenance graph from researcher output (P04-B05-A03).
 */
export function buildResearchCitationProvenanceGraph(
  researcherOutput: string,
  hints: CitationProvenanceGraphRecoveryHints = {},
): ResearchCitationProvenanceGraphBuildResult {
  const recovery = recoverCitationProvenanceGraph(researcherOutput, hints);
  const validation = validateCitationProvenanceGraphCollection(recovery.graph);
  return {
    graph: recovery.graph,
    validation,
    recovered: recovery.recovered && validation.valid,
    parseErrors: recovery.parseErrors,
    detail: recovery.detail,
  };
}

export interface ResearcherCitationProvenanceGraphFixtureEntry {
  id: string;
  category: ResearcherCitationProvenanceGraphCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
}

export interface ResearcherCitationProvenanceGraphBaseline {
  version: string;
  atom: string;
  contractAtom?: string;
  purpose: string;
  sourceBlockGate: {
    version: string;
    atom: string;
    contractVersion: string;
    benchmarkPriorArtProbeCount: number;
    sealedAtomCount: number;
  };
  probes: ResearcherCitationProvenanceGraphFixtureEntry[];
}

export interface ResearcherCitationProvenanceGraphProbeResult {
  id: string;
  category: ResearcherCitationProvenanceGraphCategory;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  detail: string;
  criterion?: string;
}

export interface ResearcherCitationProvenanceGraphProbeSummary {
  total: number;
  aligned: number;
  mismatches: ResearcherCitationProvenanceGraphProbeResult[];
  knownGaps: ResearcherCitationProvenanceGraphProbeResult[];
  byCategory: Record<
    ResearcherCitationProvenanceGraphCategory,
    { total: number; aligned: number; expectedFail: number }
  >;
}

export interface ResearcherCitationProvenanceGraphValidationIssue {
  kind: "missing_probe" | "extra_probe" | "missing_category" | "underflow";
  probeId?: string;
  category?: ResearcherCitationProvenanceGraphCategory;
  detail: string;
}

export interface ResearcherCitationProvenanceGraphValidationResult {
  valid: boolean;
  issues: ResearcherCitationProvenanceGraphValidationIssue[];
}

export type ResearcherCitationProvenanceGraphProbeDisposition =
  | "observed"
  | "gap"
  | "failure"
  | "recovery"
  | "nogo";

export interface ResearcherCitationProvenanceGraphProbeContract {
  id: string;
  category: ResearcherCitationProvenanceGraphCategory;
  description: string;
  expected: ForgeAcceptanceOutcome;
  disposition: ResearcherCitationProvenanceGraphProbeDisposition;
  criterion: string;
}

export interface ResearcherCitationProvenanceGraphCategoryAcceptance {
  invariant: string;
  minProbeCount: number;
  requireFullAlignment: boolean;
}

export interface ResearcherCitationProvenanceGraphCategoryContract {
  category: ResearcherCitationProvenanceGraphCategory;
  acceptance: ResearcherCitationProvenanceGraphCategoryAcceptance;
  probes: readonly ResearcherCitationProvenanceGraphProbeContract[];
}

export interface ResearcherCitationProvenanceGraphContract {
  version: string;
  atom: string;
  purpose: string;
  categories: Record<
    ResearcherCitationProvenanceGraphCategory,
    ResearcherCitationProvenanceGraphCategoryContract
  >;
  probes: readonly ResearcherCitationProvenanceGraphProbeContract[];
}

export const RESEARCHER_CITATION_PROVENANCE_GRAPH_A01_MIN_PROBES: Readonly<
  Record<ResearcherCitationProvenanceGraphCategory, number>
> = {
  evidence_versioning: 3,
  citation_signal: 3,
  provenance_graph_signal: 3,
  baseline_link: 2,
  boundary: 6,
  failure_path: 2,
  recovery_path: 2,
  nogo_path: 2,
};

function flattenCitationProvenanceGraphCategoryProbes(
  categories: Record<
    ResearcherCitationProvenanceGraphCategory,
    ResearcherCitationProvenanceGraphCategoryContract
  >,
): readonly ResearcherCitationProvenanceGraphProbeContract[] {
  return RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES.flatMap(
    category => categories[category].probes,
  );
}

const RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORY_CONTRACTS: Record<
  ResearcherCitationProvenanceGraphCategory,
  ResearcherCitationProvenanceGraphCategoryContract
> = {
  evidence_versioning: {
    category: "evidence_versioning",
    acceptance: {
      invariant:
        "Citation provenance graph baseline declares semver version, atom id and exported harness version.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rcpg.version_tagged",
        category: "evidence_versioning",
        description: "Citation provenance graph baseline declares semver version field",
        expected: "PASS",
        disposition: "observed",
        criterion: "Citation provenance graph baseline declares semver version field",
      },
      {
        id: "rcpg.atom_tagged",
        category: "evidence_versioning",
        description: "Citation provenance graph baseline declares P04-B05-A01 atom id",
        expected: "PASS",
        disposition: "observed",
        criterion: "Citation provenance graph baseline declares P04-B05-A01 atom id",
      },
      {
        id: "rcpg.harness_version_exported",
        category: "evidence_versioning",
        description:
          "FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_VERSION exported for citation graph harness",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_VERSION exported for citation graph harness",
      },
    ],
  },
  citation_signal: {
    category: "citation_signal",
    acceptance: {
      invariant:
        "Researcher citation signals link claims to repo, web and benchmark prior-art sources.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rcpg.benchmark_citation_targets",
        category: "citation_signal",
        description:
          "recoverBenchmarkPriorArtEvidence exposes citationTargets for prior-art source linkage",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "recoverBenchmarkPriorArtEvidence exposes citationTargets for prior-art source linkage",
      },
      {
        id: "rcpg.in_repo_path_line_citations",
        category: "citation_signal",
        description:
          "validateInRepoEvidenceCollection accepts repo hits with path:line citation fields",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "validateInRepoEvidenceCollection accepts repo hits with path:line citation fields",
      },
      {
        id: "rcpg.researcher_sources_prompt",
        category: "citation_signal",
        description:
          "RESEARCHER_SYSTEM prompt requires SOURCES or CITATIONS section in output format",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "RESEARCHER_SYSTEM prompt requires SOURCES or CITATIONS section in output format",
      },
    ],
  },
  provenance_graph_signal: {
    category: "provenance_graph_signal",
    acceptance: {
      invariant:
        "Provenance graph signals connect researcher citations to auditable lineage graphs.",
      minProbeCount: 3,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rcpg.plan_provenance_graph",
        category: "provenance_graph_signal",
        description: "buildPlanProvenanceGraph links vision→blocks with auditable lineage edges",
        expected: "PASS",
        disposition: "observed",
        criterion: "buildPlanProvenanceGraph links vision→blocks with auditable lineage edges",
      },
      {
        id: "rcpg.benchmark_prior_art_provenance",
        category: "provenance_graph_signal",
        description:
          "buildResearcherBenchmarkPriorArtProvenance records sealed prior-art run lineage",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "buildResearcherBenchmarkPriorArtProvenance records sealed prior-art run lineage",
      },
      {
        id: "rcpg.build_research_citation_graph",
        category: "provenance_graph_signal",
        description:
          "buildResearchCitationProvenanceGraph exports researcher citation→provenance graph builder",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "buildResearchCitationProvenanceGraph exports researcher citation→provenance graph builder",
      },
    ],
  },
  baseline_link: {
    category: "baseline_link",
    acceptance: {
      invariant:
        "Citation graph baseline links to sealed P04-B04 benchmark prior-art block gate and B05 handoff.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rcpg.b04_block_handoff_entry",
        category: "baseline_link",
        description: "FORGE_P04_B04_TO_B05_HANDOFF_V1 targets P04-B05-A01 entry atom",
        expected: "PASS",
        disposition: "observed",
        criterion: "FORGE_P04_B04_TO_B05_HANDOFF_V1 targets P04-B05-A01 entry atom",
      },
      {
        id: "rcpg.b04_sealed_benchmark_probes",
        category: "baseline_link",
        description:
          "P04-B04→B05 handoff sealed probeCount matches active benchmark prior-art contract",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "P04-B04→B05 handoff sealed probeCount matches active benchmark prior-art contract",
      },
    ],
  },
  boundary: {
    category: "boundary",
    acceptance: {
      invariant:
        "Citation boundary assessment rejects invalid input; probe runner and documented gaps wired.",
      minProbeCount: 6,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rcpg.source_block_gate_ref",
        category: "boundary",
        description:
          "Baseline fixture references sealed P04-B04 benchmark prior-art block gate source artifacts",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "Baseline fixture references sealed P04-B04 benchmark prior-art block gate source artifacts",
      },
      {
        id: "rcpg.probe_runner_exported",
        category: "boundary",
        description: "runResearcherCitationProvenanceGraphProbes executes contract-wired probe matrix",
        expected: "PASS",
        disposition: "observed",
        criterion: "runResearcherCitationProvenanceGraphProbes executes contract-wired probe matrix",
      },
      {
        id: "rcpg.known_gaps_documented",
        category: "boundary",
        description: "Baseline fixture documents at least one measurable FAIL citation graph gap",
        expected: "PASS",
        disposition: "observed",
        criterion: "Baseline fixture documents at least one measurable FAIL citation graph gap",
      },
      {
        id: "rcpg.empty_citation_input_boundary",
        category: "boundary",
        description: "assessCitationProvenanceGraphInputBoundary rejects empty citation parse input",
        expected: "PASS",
        disposition: "observed",
        criterion: "assessCitationProvenanceGraphInputBoundary rejects empty citation parse input",
      },
      {
        id: "rcpg.whitespace_citation_input_boundary",
        category: "boundary",
        description:
          "assessCitationProvenanceGraphInputBoundary rejects whitespace-only citation parse input",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessCitationProvenanceGraphInputBoundary rejects whitespace-only citation parse input",
      },
      {
        id: "rcpg.long_citation_input_truncation_boundary",
        category: "boundary",
        description:
          "assessCitationProvenanceGraphInputBoundary truncates citation input exceeding max length",
        expected: "PASS",
        disposition: "observed",
        criterion:
          "assessCitationProvenanceGraphInputBoundary truncates citation input exceeding max length",
      },
    ],
  },
  failure_path: {
    category: "failure_path",
    acceptance: {
      invariant: "Invalid fixture versions and null-byte citation input are rejected safely.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rcpg.invalid_version_rejected",
        category: "failure_path",
        description:
          "validateResearcherCitationProvenanceGraphBaseline rejects unexpected fixture version",
        expected: "PASS",
        disposition: "failure",
        criterion:
          "validateResearcherCitationProvenanceGraphBaseline rejects unexpected fixture version",
      },
      {
        id: "rcpg.malformed_citation_input_guard",
        category: "failure_path",
        description:
          "assessCitationProvenanceGraphInputBoundary rejects null-byte citation input safely",
        expected: "PASS",
        disposition: "failure",
        criterion:
          "assessCitationProvenanceGraphInputBoundary rejects null-byte citation input safely",
      },
    ],
  },
  recovery_path: {
    category: "recovery_path",
    acceptance: {
      invariant:
        "Recovery paths restructure malformed citation parses into actionable provenance graphs.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rcpg.recovery_citation_graph_repair",
        category: "recovery_path",
        description:
          "recoverCitationProvenanceGraph restructures malformed citation parse into actionable graph plan",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "recoverCitationProvenanceGraph restructures malformed citation parse into actionable graph plan",
      },
      {
        id: "rcpg.recovery_missing_edges_fallback",
        category: "recovery_path",
        description: "Citation graph recovery infers lineage edges when explicit CITES field is missing",
        expected: "PASS",
        disposition: "recovery",
        criterion:
          "Citation graph recovery infers lineage edges when explicit CITES field is missing",
      },
    ],
  },
  nogo_path: {
    category: "nogo_path",
    acceptance: {
      invariant:
        "Citation graph parser and validator exports gate orchestrator NO-GO wiring.",
      minProbeCount: 2,
      requireFullAlignment: true,
    },
    probes: [
      {
        id: "rcpg.parser_citation_edges",
        category: "nogo_path",
        description: "parseResearchCitationGraph exports citation→source edges from researcher output",
        expected: "FAIL",
        disposition: "nogo",
        criterion:
          "parseResearchCitationGraph exports citation→source edges from researcher output",
      },
      {
        id: "rcpg.exported_citation_graph_validator",
        category: "nogo_path",
        description:
          "validateCitationProvenanceGraph exported for orchestrator citation graph checks",
        expected: "FAIL",
        disposition: "nogo",
        criterion:
          "validateCitationProvenanceGraph exported for orchestrator citation graph checks",
      },
    ],
  },
};

export const FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_CONTRACT_V1: ResearcherCitationProvenanceGraphContract =
  {
    version: "1.0.0",
    atom: "P04-B05-A06",
    purpose:
      "Typed citation provenance graph contract declaring measurable citation, lineage and guard probes.",
    categories: RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORY_CONTRACTS,
    probes: flattenCitationProvenanceGraphCategoryProbes(
      RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORY_CONTRACTS,
    ),
  };

export function getActiveResearcherCitationProvenanceGraphContract(): ResearcherCitationProvenanceGraphContract {
  return FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_CONTRACT_V1;
}

export function getResearcherCitationProvenanceGraphCategoryContract(
  category: ResearcherCitationProvenanceGraphCategory,
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): ResearcherCitationProvenanceGraphCategoryContract {
  return contract.categories[category];
}

export function listResearcherCitationProvenanceGraphContractProbeIds(
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listResearcherCitationProvenanceGraphProbesByDisposition(
  disposition: ResearcherCitationProvenanceGraphProbeDisposition,
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): ResearcherCitationProvenanceGraphProbeContract[] {
  return contract.probes.filter(p => p.disposition === disposition);
}

export function listResearcherCitationProvenanceGraphContractProbesByCategory(
  category: ResearcherCitationProvenanceGraphCategory,
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): readonly ResearcherCitationProvenanceGraphProbeContract[] {
  return [...contract.categories[category].probes];
}

export function summarizeResearcherCitationProvenanceGraphContractCoverage(
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): {
  totalProbes: number;
  expectedPass: number;
  expectedFail: number;
  byCategory: Record<
    ResearcherCitationProvenanceGraphCategory,
    { probeCount: number; invariant: string }
  >;
  byDisposition: Record<ResearcherCitationProvenanceGraphProbeDisposition, number>;
} {
  const byCategory = {} as Record<
    ResearcherCitationProvenanceGraphCategory,
    { probeCount: number; invariant: string }
  >;
  const byDisposition: Record<ResearcherCitationProvenanceGraphProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  let totalProbes = 0;
  let expectedPass = 0;
  let expectedFail = 0;

  for (const category of RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES) {
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

export interface ResearcherCitationProvenanceGraphContractCoverageIssue {
  kind:
    | "missing_category"
    | "underflow"
    | "missing_criterion"
    | "duplicate_probe"
    | "coverage_mismatch";
  probeId?: string;
  category?: ResearcherCitationProvenanceGraphCategory;
  detail: string;
}

export interface ResearcherCitationProvenanceGraphContractCoverageResult {
  valid: boolean;
  issues: ResearcherCitationProvenanceGraphContractCoverageIssue[];
}

export function validateResearcherCitationProvenanceGraphContractCoverage(
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): ResearcherCitationProvenanceGraphContractCoverageResult {
  const issues: ResearcherCitationProvenanceGraphContractCoverageIssue[] = [];

  for (const category of RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES) {
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
      RESEARCHER_CITATION_PROVENANCE_GRAPH_A01_MIN_PROBES[category]
    ) {
      issues.push({
        kind: "underflow",
        category,
        detail:
          `${category} minProbeCount=${categoryContract.acceptance.minProbeCount} ` +
          `below A01 baseline ${RESEARCHER_CITATION_PROVENANCE_GRAPH_A01_MIN_PROBES[category]}`,
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

  const ids = listResearcherCitationProvenanceGraphContractProbeIds(contract);
  if (new Set(ids).size !== ids.length) {
    issues.push({ kind: "duplicate_probe", detail: "duplicate probe id detected in contract" });
  }

  const summary = summarizeResearcherCitationProvenanceGraphContractCoverage(contract);
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
    if (!probe.id.startsWith("rcpg.")) {
      issues.push({
        kind: "missing_criterion",
        probeId: probe.id,
        detail: `${probe.id} missing rcpg. prefix`,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateResearcherCitationProvenanceGraphContract(
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): ResearcherCitationProvenanceGraphContractCoverageResult {
  return validateResearcherCitationProvenanceGraphContractCoverage(contract);
}

export function validateResearcherCitationProvenanceGraphAgainstContract(
  fixture: ResearcherCitationProvenanceGraphBaseline,
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): ResearcherCitationProvenanceGraphValidationResult {
  const issues: ResearcherCitationProvenanceGraphValidationIssue[] = [];
  const fixtureIds = new Set(fixture.probes.map(p => p.id));
  const contractIds = new Set(contract.probes.map(p => p.id));

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const category of RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES) {
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

export const FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_A01_PROBE_MATRIX: readonly ResearcherCitationProvenanceGraphFixtureEntry[] =
  researcherCitationProvenanceGraphBaseline.probes as ResearcherCitationProvenanceGraphFixtureEntry[];

export function loadResearcherCitationProvenanceGraphBaseline(): ResearcherCitationProvenanceGraphBaseline {
  return researcherCitationProvenanceGraphBaseline as ResearcherCitationProvenanceGraphBaseline;
}

export function validateResearcherCitationProvenanceGraphBaseline(
  fixture: ResearcherCitationProvenanceGraphBaseline,
): ResearcherCitationProvenanceGraphValidationResult {
  const issues: ResearcherCitationProvenanceGraphValidationIssue[] = [];

  if (fixture.version !== "1.0.0") {
    issues.push({ kind: "missing_probe", detail: `unexpected fixture version: ${fixture.version}` });
  }
  if (fixture.atom !== "P04-B05-A01") {
    issues.push({ kind: "missing_probe", detail: `unexpected atom: ${fixture.atom}` });
  }

  const ids = new Set<string>();
  const byCategory = Object.fromEntries(
    RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES.map(category => [category, 0]),
  ) as Record<ResearcherCitationProvenanceGraphCategory, number>;

  for (const entry of fixture.probes) {
    if (ids.has(entry.id)) {
      issues.push({ kind: "extra_probe", probeId: entry.id, detail: "duplicate probe id" });
    }
    ids.add(entry.id);
    byCategory[entry.category]++;
  }

  for (const category of RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES) {
    const min = RESEARCHER_CITATION_PROVENANCE_GRAPH_A01_MIN_PROBES[category];
    if (byCategory[category] < min) {
      issues.push({
        kind: "underflow",
        category,
        detail: `${category} has ${byCategory[category]} probes, minimum ${min}`,
      });
    }
  }

  if (fixture.probes.length !== FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_A01_PROBE_MATRIX.length) {
    issues.push({
      kind: "missing_probe",
      detail:
        `fixture probe count=${fixture.probes.length} matrix=${FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_A01_PROBE_MATRIX.length}`,
    });
  }

  for (const expected of FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_A01_PROBE_MATRIX) {
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

  const handoff = getForgeP04B04ToB05Handoff();
  const benchmarkCoverage = summarizeResearcherBenchmarkPriorArtContractCoverage(
    getActiveResearcherBenchmarkPriorArtContract(),
  );

  if (fixture.sourceBlockGate.atom !== "P04-B04-A10") {
    issues.push({
      kind: "missing_probe",
      detail: `sourceBlockGate.atom=${fixture.sourceBlockGate.atom} expected=P04-B04-A10`,
    });
  }
  if (
    fixture.sourceBlockGate.contractVersion !==
    FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_CONTRACT_V1.version
  ) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.contractVersion=${fixture.sourceBlockGate.contractVersion} ` +
        `expected=${FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_CONTRACT_V1.version}`,
    });
  }
  if (fixture.sourceBlockGate.benchmarkPriorArtProbeCount !== benchmarkCoverage.totalProbes) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.benchmarkPriorArtProbeCount=${fixture.sourceBlockGate.benchmarkPriorArtProbeCount} ` +
        `contract=${benchmarkCoverage.totalProbes}`,
    });
  }
  if (fixture.sourceBlockGate.sealedAtomCount !== EXPECTED_P04_B04_SEALED_ATOM_COUNT) {
    issues.push({
      kind: "missing_probe",
      detail:
        `sourceBlockGate.sealedAtomCount=${fixture.sourceBlockGate.sealedAtomCount} ` +
        `expected=${EXPECTED_P04_B04_SEALED_ATOM_COUNT}`,
    });
  }
  if (handoff.targetBlock.entryAtom !== "P04-B05-A01") {
    issues.push({
      kind: "missing_probe",
      detail: `B04 handoff entryAtom=${handoff.targetBlock.entryAtom} expected=P04-B05-A01`,
    });
  }

  const contractAlignment = validateResearcherCitationProvenanceGraphAgainstContract(
    fixture,
    getActiveResearcherCitationProvenanceGraphContract(),
  );
  issues.push(...contractAlignment.issues);

  return { valid: issues.length === 0, issues };
}

export function summarizeResearcherCitationProvenanceGraphMatrix(
  results: ResearcherCitationProvenanceGraphProbeResult[],
): ResearcherCitationProvenanceGraphProbeSummary {
  const mismatches = results.filter(r => !r.aligned);
  const knownGaps = results.filter(
    r => r.expected === "FAIL" && r.actual === "FAIL" && r.aligned,
  );

  const byCategory = {} as ResearcherCitationProvenanceGraphProbeSummary["byCategory"];
  for (const category of RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES) {
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

export function listResearcherCitationProvenanceGraphProbesByExpected(
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherCitationProvenanceGraphBaseline = loadResearcherCitationProvenanceGraphBaseline(),
): ResearcherCitationProvenanceGraphFixtureEntry[] {
  return fixture.probes.filter(p => p.expected === expected);
}

export function listResearcherCitationProvenanceGraphKnownGaps(
  results: ResearcherCitationProvenanceGraphProbeResult[],
): ResearcherCitationProvenanceGraphProbeResult[] {
  return summarizeResearcherCitationProvenanceGraphMatrix(results).knownGaps;
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
  category: ResearcherCitationProvenanceGraphCategory,
  expected: ForgeAcceptanceOutcome,
  ok: boolean,
  detail: string,
  criterion?: string,
): ResearcherCitationProvenanceGraphProbeResult {
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

function productionCitationGraphSource(): string {
  return readSrc("forge-p04-researcher-citation-provenance-graph.ts");
}

function promptsSource(): string {
  return readSrc("prompts.ts");
}

function parserSource(): string {
  return readSrc("parser.ts");
}

function hasProductionExport(functionName: string): boolean {
  return new RegExp(`export function ${functionName}\\b`).test(productionCitationGraphSource());
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

function probeEvidenceVersioning(
  id: string,
  category: ResearcherCitationProvenanceGraphCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherCitationProvenanceGraphBaseline,
): ResearcherCitationProvenanceGraphProbeResult {
  switch (id) {
    case "rcpg.version_tagged": {
      const ok = fixture.version === "1.0.0";
      return probe(id, category, expected, ok, `version=${fixture.version}`);
    }
    case "rcpg.atom_tagged": {
      const ok = fixture.atom === "P04-B05-A01";
      return probe(id, category, expected, ok, `atom=${fixture.atom}`);
    }
    case "rcpg.harness_version_exported": {
      const ok = FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_VERSION.startsWith("1.0.0");
      return probe(
        id,
        category,
        expected,
        ok,
        `harnessVersion=${FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_VERSION}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown evidence_versioning probe");
  }
}

function probeCitationSignal(
  id: string,
  category: ResearcherCitationProvenanceGraphCategory,
  expected: ForgeAcceptanceOutcome,
): ResearcherCitationProvenanceGraphProbeResult {
  switch (id) {
    case "rcpg.benchmark_citation_targets": {
      const recovery = recoverBenchmarkPriorArtEvidence(
        "prior-art citation: https://benchmark.example.com/report export function runBenchmark",
      );
      const ok =
        recovery.recovered === true &&
        recovery.evidencePlan.citationTargets.some(target =>
          target.source.includes("benchmark.example.com"),
        );
      return probe(id, category, expected, ok, `citationTargets=${recovery.evidencePlan.citationTargets.length}`);
    }
    case "rcpg.in_repo_path_line_citations": {
      const validation = validateInRepoEvidenceCollection("searchFiles", [
        { file: "src/research-engine.ts", line: 30, text: "export function searchFiles" },
      ]);
      const ok = validation.valid === true && validation.fileHitCount === 1;
      return probe(id, category, expected, ok, `fileHitCount=${validation.fileHitCount}`);
    }
    case "rcpg.researcher_sources_prompt": {
      const section = researcherFormatSection();
      const ok =
        section.includes("SOURCES:") ||
        section.includes("CITATIONS:") ||
        section.includes("CITATION GRAPH:");
      return probe(id, category, expected, ok, `sourcesSection=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown citation_signal probe");
  }
}

function probeProvenanceGraphSignal(
  id: string,
  category: ResearcherCitationProvenanceGraphCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherCitationProvenanceGraphBaseline,
): ResearcherCitationProvenanceGraphProbeResult {
  switch (id) {
    case "rcpg.plan_provenance_graph": {
      const planGraph = buildPlanProvenanceGraph({
        visionSummary: "Forge citation provenance",
        decompose: {
          blocks: ["Block 1: citation graph", "Block 2: provenance wiring"],
          blockDeps: [[], [0]],
          confidence: 0.8,
          reasoning: "test",
        },
      });
      const ok =
        readSrc("plan-provenance-graph.ts").includes("export function buildPlanProvenanceGraph") &&
        planGraph.nodes.length >= 2 &&
        planGraph.edges.length >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `nodes=${planGraph.nodes.length}, edges=${planGraph.edges.length}`,
      );
    }
    case "rcpg.benchmark_prior_art_provenance": {
      const contract = getActiveResearcherBenchmarkPriorArtContract();
      const provenance = buildResearcherBenchmarkPriorArtProvenance(
        "probe-rcpg-benchmark",
        loadResearcherBenchmarkPriorArtBaseline(),
        contract,
        "2026-07-19T00:00:00.000Z",
        "2026-07-19T00:00:01.000Z",
        1,
      );
      const ok =
        typeof buildResearcherBenchmarkPriorArtProvenance === "function" &&
        provenance.harnessVersion.length > 0;
      return probe(id, category, expected, ok, `harnessVersion=${provenance.harnessVersion}`);
    }
    case "rcpg.build_research_citation_graph": {
      const sample =
        "FINDINGS: citation graph wiring\nSOURCES: https://docs.example.com/spec\nCITATIONS: src/research-engine.ts:30";
      const build = buildResearchCitationProvenanceGraph(sample, { topic: "citation graph" });
      const ok =
        hasProductionExport("buildResearchCitationProvenanceGraph") &&
        build.recovered === true &&
        build.graph.nodes.length >= 2 &&
        build.graph.edges.length >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `researchCitationGraph=${ok}, nodes=${build.graph.nodes.length}, edges=${build.graph.edges.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown provenance_graph_signal probe");
  }
}

function probeBaselineLink(
  id: string,
  category: ResearcherCitationProvenanceGraphCategory,
  expected: ForgeAcceptanceOutcome,
): ResearcherCitationProvenanceGraphProbeResult {
  switch (id) {
    case "rcpg.b04_block_handoff_entry": {
      const handoff = getForgeP04B04ToB05Handoff();
      const ok =
        handoff.targetBlock.blockId === "P04-B05" &&
        handoff.targetBlock.entryAtom === "P04-B05-A01";
      return probe(
        id,
        category,
        expected,
        ok,
        `target=${handoff.targetBlock.blockId}/${handoff.targetBlock.entryAtom}`,
      );
    }
    case "rcpg.b04_sealed_benchmark_probes": {
      const handoff = getForgeP04B04ToB05Handoff();
      const coverage = summarizeResearcherBenchmarkPriorArtContractCoverage(
        getActiveResearcherBenchmarkPriorArtContract(),
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
    default:
      return probe(id, category, expected, false, "unknown baseline_link probe");
  }
}

function probeBoundary(
  id: string,
  category: ResearcherCitationProvenanceGraphCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherCitationProvenanceGraphBaseline,
): ResearcherCitationProvenanceGraphProbeResult {
  switch (id) {
    case "rcpg.source_block_gate_ref": {
      const handoff = getForgeP04B04ToB05Handoff();
      const coverage = summarizeResearcherBenchmarkPriorArtContractCoverage(
        getActiveResearcherBenchmarkPriorArtContract(),
      );
      const ok =
        fixture.sourceBlockGate.atom === "P04-B04-A10" &&
        fixture.sourceBlockGate.benchmarkPriorArtProbeCount === coverage.totalProbes &&
        fixture.sourceBlockGate.sealedAtomCount === EXPECTED_P04_B04_SEALED_ATOM_COUNT &&
        handoff.atom === "P04-B04-A10";
      return probe(
        id,
        category,
        expected,
        ok,
        `source=${fixture.sourceBlockGate.atom}, probes=${fixture.sourceBlockGate.benchmarkPriorArtProbeCount}`,
      );
    }
    case "rcpg.probe_runner_exported": {
      const ok = productionCitationGraphSource().includes(
        "export function runResearcherCitationProvenanceGraphProbes",
      );
      return probe(id, category, expected, ok, `probeRunner=${ok}`);
    }
    case "rcpg.known_gaps_documented": {
      const contract = getActiveResearcherCitationProvenanceGraphContract();
      const expectedFail = contract.probes.filter(p => p.expected === "FAIL").length;
      const failCount = fixture.probes.filter(p => p.expected === "FAIL").length;
      const ok = failCount === expectedFail && failCount >= 1;
      return probe(
        id,
        category,
        expected,
        ok,
        `documentedFail=${failCount}, contractExpectedFail=${expectedFail}`,
      );
    }
    case "rcpg.empty_citation_input_boundary": {
      const result = assessCitationProvenanceGraphInputBoundary("");
      const ok =
        hasProductionExport("assessCitationProvenanceGraphInputBoundary") &&
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
    case "rcpg.whitespace_citation_input_boundary": {
      const result = assessCitationProvenanceGraphInputBoundary("   \t\n  ");
      const ok =
        hasProductionExport("assessCitationProvenanceGraphInputBoundary") &&
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
    case "rcpg.long_citation_input_truncation_boundary": {
      const longInput = "x".repeat(RESEARCHER_CITATION_PROVENANCE_GRAPH_INPUT_MAX_LENGTH + 500);
      const result = assessCitationProvenanceGraphInputBoundary(longInput);
      const ok =
        hasProductionExport("assessCitationProvenanceGraphInputBoundary") &&
        result.disposition === "exceeds_max_length" &&
        result.truncated === true &&
        result.normalizedInput.length === RESEARCHER_CITATION_PROVENANCE_GRAPH_INPUT_MAX_LENGTH &&
        result.acceptable === true;
      return probe(
        id,
        category,
        expected,
        ok,
        `disposition=${result.disposition}, truncated=${result.truncated}, len=${result.normalizedInput.length}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown boundary probe");
  }
}

function probeFailurePath(
  id: string,
  category: ResearcherCitationProvenanceGraphCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherCitationProvenanceGraphBaseline,
): ResearcherCitationProvenanceGraphProbeResult {
  switch (id) {
    case "rcpg.invalid_version_rejected": {
      const invalid = { ...fixture, version: "9.9.9" };
      const ok = validateResearcherCitationProvenanceGraphBaseline(invalid).valid === false;
      return probe(id, category, expected, ok, `rejectsInvalidVersion=${ok}`);
    }
    case "rcpg.malformed_citation_input_guard": {
      const boundary = assessCitationProvenanceGraphInputBoundary("bad\0citation");
      const ok =
        hasProductionExport("assessCitationProvenanceGraphInputBoundary") &&
        boundary.disposition === "contains_null_byte" &&
        boundary.acceptable === false;
      return probe(id, category, expected, ok, `detail=${boundary.detail}`);
    }
    default:
      return probe(id, category, expected, false, "unknown failure_path probe");
  }
}

function probeRecoveryPath(
  id: string,
  category: ResearcherCitationProvenanceGraphCategory,
  expected: ForgeAcceptanceOutcome,
): ResearcherCitationProvenanceGraphProbeResult {
  switch (id) {
    case "rcpg.recovery_citation_graph_repair": {
      const malformed =
        'malformed citation: [Benchmark](https://benchmark.example.com/report) src/research-engine.ts:30 export function searchFiles {"source":"broken';
      const recovery = recoverCitationProvenanceGraph(malformed, {
        topic: "agent citation provenance",
      });
      const ok =
        recovery.recovered === true &&
        recovery.graph.nodes.length >= 2 &&
        recovery.graph.edges.length >= 1 &&
        recovery.graph.nodes.some(node => node.kind === "source");
      return probe(
        id,
        category,
        expected,
        ok,
        `recovered=${recovery.recovered}, nodes=${recovery.graph.nodes.length}, ${recovery.detail}`,
      );
    }
    case "rcpg.recovery_missing_edges_fallback": {
      const missingCites =
        "FINDINGS: benchmark prior-art supports citation graph wiring\nRELEVANCE: 0.85\nhttps://docs.example.com/spec";
      const recovery = recoverCitationProvenanceGraph(missingCites, {
        topic: "missing cites fallback",
      });
      const ok =
        recovery.recovered === true &&
        recovery.graph.edges.length >= 1 &&
        recovery.parseErrors.includes("missing_cites_inferred");
      return probe(
        id,
        category,
        expected,
        ok,
        `recovered=${recovery.recovered}, edges=${recovery.graph.edges.length}, ${recovery.detail}`,
      );
    }
    default:
      return probe(id, category, expected, false, "unknown recovery_path probe");
  }
}

function probeNogoPath(
  id: string,
  category: ResearcherCitationProvenanceGraphCategory,
  expected: ForgeAcceptanceOutcome,
): ResearcherCitationProvenanceGraphProbeResult {
  switch (id) {
    case "rcpg.parser_citation_edges": {
      const ok = /\bexport function parseResearchCitationGraph\b/.test(parserSource());
      return probe(id, category, expected, ok, `parseResearchCitationGraph=${ok}`);
    }
    case "rcpg.exported_citation_graph_validator": {
      const ok = /export function validateCitationProvenanceGraph\s*\(/.test(
        productionCitationGraphSource(),
      );
      return probe(id, category, expected, ok, `citationGraphValidator=${ok}`);
    }
    default:
      return probe(id, category, expected, false, "unknown nogo_path probe");
  }
}

function runSingleProbe(
  id: string,
  category: ResearcherCitationProvenanceGraphCategory,
  expected: ForgeAcceptanceOutcome,
  fixture: ResearcherCitationProvenanceGraphBaseline,
): ResearcherCitationProvenanceGraphProbeResult {
  switch (category) {
    case "evidence_versioning":
      return probeEvidenceVersioning(id, category, expected, fixture);
    case "citation_signal":
      return probeCitationSignal(id, category, expected);
    case "provenance_graph_signal":
      return probeProvenanceGraphSignal(id, category, expected, fixture);
    case "baseline_link":
      return probeBaselineLink(id, category, expected);
    case "boundary":
      return probeBoundary(id, category, expected, fixture);
    case "failure_path":
      return probeFailurePath(id, category, expected, fixture);
    case "recovery_path":
      return probeRecoveryPath(id, category, expected);
    case "nogo_path":
      return probeNogoPath(id, category, expected);
    default:
      return probe(id, category, expected, false, "unknown category");
  }
}

export function runResearcherCitationProvenanceGraphProbes(
  fixture: ResearcherCitationProvenanceGraphBaseline = loadResearcherCitationProvenanceGraphBaseline(),
): ResearcherCitationProvenanceGraphProbeResult[] {
  const contract = getActiveResearcherCitationProvenanceGraphContract();
  return fixture.probes.map(entry => {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const expected = contractProbe?.expected ?? entry.expected;
    const result = runSingleProbe(entry.id, entry.category, expected, fixture);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}

export interface ResearcherCitationProvenanceGraphProbeMatrixValidationIssue {
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

export interface ResearcherCitationProvenanceGraphProbeMatrixValidationResult {
  valid: boolean;
  issues: ResearcherCitationProvenanceGraphProbeMatrixValidationIssue[];
  passAligned: number;
  gapAligned: number;
  unexpectedMismatches: number;
}

/**
 * Validate probe matrix against typed contract — A03 production slice gate.
 */
export function validateResearcherCitationProvenanceGraphProbeMatrix(
  results: ResearcherCitationProvenanceGraphProbeResult[],
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): ResearcherCitationProvenanceGraphProbeMatrixValidationResult {
  const issues: ResearcherCitationProvenanceGraphProbeMatrixValidationIssue[] = [];
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

export interface ResearcherCitationProvenanceGraphProductionSliceResult {
  atom: "P04-B05-A03";
  fixtureValid: boolean;
  contractAligned: boolean;
  matrixValid: boolean;
  results: ResearcherCitationProvenanceGraphProbeResult[];
  summary: ResearcherCitationProvenanceGraphProbeSummary;
  matrixValidation: ResearcherCitationProvenanceGraphProbeMatrixValidationResult;
}

/**
 * A03 production vertical slice: buildResearchCitationProvenanceGraph and researcher SOURCES
 * prompt wired to contract probe execution with zero unexpected mismatches.
 */
export function runResearcherCitationProvenanceGraphProductionSlice(
  fixture: ResearcherCitationProvenanceGraphBaseline = loadResearcherCitationProvenanceGraphBaseline(),
): ResearcherCitationProvenanceGraphProductionSliceResult {
  const contract = getActiveResearcherCitationProvenanceGraphContract();
  const fixtureValidation = validateResearcherCitationProvenanceGraphBaseline(fixture);
  const contractValidation = validateResearcherCitationProvenanceGraphAgainstContract(
    fixture,
    contract,
  );
  const results = runResearcherCitationProvenanceGraphProbes(fixture);
  const summary = summarizeResearcherCitationProvenanceGraphMatrix(results);
  const matrixValidation = validateResearcherCitationProvenanceGraphProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B05-A03",
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
export function validateResearcherCitationProvenanceGraphBoundaryProbeMatrix(
  results: ResearcherCitationProvenanceGraphProbeResult[],
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): ResearcherCitationProvenanceGraphProbeMatrixValidationResult {
  const boundaryProbes = listResearcherCitationProvenanceGraphContractProbesByCategory(
    "boundary",
    contract,
  );
  const boundaryContract: ResearcherCitationProvenanceGraphContract = {
    ...contract,
    probes: boundaryProbes,
    categories: {
      ...contract.categories,
      boundary: contract.categories.boundary,
    },
  };
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  return validateResearcherCitationProvenanceGraphProbeMatrix(boundaryResults, boundaryContract);
}

export interface ResearcherCitationProvenanceGraphBoundarySliceResult {
  atom: "P04-B05-A04";
  boundaryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherCitationProvenanceGraphProbeResult[];
  boundaryResults: ResearcherCitationProvenanceGraphProbeResult[];
  matrixValidation: ResearcherCitationProvenanceGraphProbeMatrixValidationResult;
}

/**
 * A04 boundary slice: contract-wired boundary probes (citation input edge cases, probe runner,
 * documented gaps) with zero unexpected mismatches.
 */
export function runResearcherCitationProvenanceGraphBoundarySlice(
  fixture: ResearcherCitationProvenanceGraphBaseline = loadResearcherCitationProvenanceGraphBaseline(),
): ResearcherCitationProvenanceGraphBoundarySliceResult {
  const contract = getActiveResearcherCitationProvenanceGraphContract();
  const results = runResearcherCitationProvenanceGraphProbes(fixture);
  const boundaryProbes = listResearcherCitationProvenanceGraphContractProbesByCategory(
    "boundary",
    contract,
  );
  const boundaryIds = new Set(boundaryProbes.map(p => p.id));
  const boundaryResults = results.filter(r => boundaryIds.has(r.id));
  const matrixValidation = validateResearcherCitationProvenanceGraphBoundaryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B05-A04",
    boundaryProbeCount: boundaryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    boundaryResults,
    matrixValidation,
  };
}

/** Categories exercised by the A05 failure/recovery/NO-GO slice gate. */
export const RESEARCHER_CITATION_PROVENANCE_GRAPH_FAILURE_RECOVERY_CATEGORIES = [
  "failure_path",
  "recovery_path",
  "nogo_path",
] as const satisfies readonly ResearcherCitationProvenanceGraphCategory[];

/**
 * Validate failure_path + recovery_path + nogo_path probe matrix — A05 slice gate.
 * PASS failure/recovery probes and documented FAIL NO-GO gaps must align; zero unexpected mismatches.
 */
export function validateResearcherCitationProvenanceGraphFailureRecoveryProbeMatrix(
  results: ResearcherCitationProvenanceGraphProbeResult[],
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): ResearcherCitationProvenanceGraphProbeMatrixValidationResult {
  const failureRecoveryProbes = RESEARCHER_CITATION_PROVENANCE_GRAPH_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherCitationProvenanceGraphContractProbesByCategory(category, contract),
  );
  const failureRecoveryContract: ResearcherCitationProvenanceGraphContract = {
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
  return validateResearcherCitationProvenanceGraphProbeMatrix(
    failureRecoveryResults,
    failureRecoveryContract,
  );
}

export function listResearcherCitationProvenanceGraphFailureRecoveryProbeIds(
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): string[] {
  return RESEARCHER_CITATION_PROVENANCE_GRAPH_FAILURE_RECOVERY_CATEGORIES.flatMap(category =>
    listResearcherCitationProvenanceGraphContractProbesByCategory(category, contract).map(p => p.id),
  );
}

export interface ResearcherCitationProvenanceGraphFailureRecoverySliceResult {
  atom: "P04-B05-A05";
  failureRecoveryProbeCount: number;
  matrixValid: boolean;
  results: ResearcherCitationProvenanceGraphProbeResult[];
  failureRecoveryResults: ResearcherCitationProvenanceGraphProbeResult[];
  matrixValidation: ResearcherCitationProvenanceGraphProbeMatrixValidationResult;
}

/**
 * A05 failure/recovery slice: contract-wired failure_path, recovery_path, and nogo_path
 * probes (invalid fixture rejection, null-byte guard, recoverCitationProvenanceGraph,
 * missing CITES fallback, parseResearchCitationGraph and validateCitationProvenanceGraph
 * documented NO-GO debt) with zero unexpected mismatches.
 */
export function runResearcherCitationProvenanceGraphFailureRecoverySlice(
  fixture: ResearcherCitationProvenanceGraphBaseline = loadResearcherCitationProvenanceGraphBaseline(),
): ResearcherCitationProvenanceGraphFailureRecoverySliceResult {
  const contract = getActiveResearcherCitationProvenanceGraphContract();
  const results = runResearcherCitationProvenanceGraphProbes(fixture);
  const failureRecoveryProbes = RESEARCHER_CITATION_PROVENANCE_GRAPH_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherCitationProvenanceGraphContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const failureRecoveryResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateResearcherCitationProvenanceGraphFailureRecoveryProbeMatrix(
    results,
    contract,
  );

  return {
    atom: "P04-B05-A05",
    failureRecoveryProbeCount: failureRecoveryProbes.length,
    matrixValid: matrixValidation.valid && matrixValidation.unexpectedMismatches === 0,
    results,
    failureRecoveryResults,
    matrixValidation,
  };
}

/** Per-probe evidence artifact — disposition, criterion and aligned outcomes (P04-B05-A06). */
export interface ResearcherCitationProvenanceGraphProbeEvidence {
  probeId: string;
  category: ResearcherCitationProvenanceGraphCategory;
  disposition: ResearcherCitationProvenanceGraphProbeDisposition;
  expected: ForgeAcceptanceOutcome;
  actual: ForgeAcceptanceOutcome;
  aligned: boolean;
  criterion: string;
  detail: string;
  recordedAt: string;
}

/** Per-probe runtime telemetry — timing and ordering for citation graph runs (P04-B05-A06). */
export interface ResearcherCitationProvenanceGraphProbeTelemetry {
  probeId: string;
  category: ResearcherCitationProvenanceGraphCategory;
  sequenceIndex: number;
  durationMs: number;
}

/** Run-level provenance — contract/fixture lineage and execution context (P04-B05-A06). */
export interface ResearcherCitationProvenanceGraphProvenance {
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
  sliceCategories?: readonly ResearcherCitationProvenanceGraphCategory[];
  startedAt: string;
  completedAt: string;
  totalProbes: number;
  gitCommit?: string;
}

/** Aggregated citation provenance graph run record bundling evidence, telemetry and provenance. */
export interface ResearcherCitationProvenanceGraphRunRecord {
  provenance: ResearcherCitationProvenanceGraphProvenance;
  evidence: ResearcherCitationProvenanceGraphProbeEvidence[];
  telemetry: ResearcherCitationProvenanceGraphProbeTelemetry[];
  summary: {
    total: number;
    aligned: number;
    mismatches: number;
    byCategory: Record<ResearcherCitationProvenanceGraphCategory, number>;
    byDisposition: Record<ResearcherCitationProvenanceGraphProbeDisposition, number>;
  };
}

export interface ResearcherCitationProvenanceGraphRunValidationIssue {
  kind: "missing_evidence" | "missing_telemetry" | "provenance_mismatch" | "count_mismatch";
  probeId?: string;
  detail: string;
}

export interface ResearcherCitationProvenanceGraphRunValidationResult {
  valid: boolean;
  issues: ResearcherCitationProvenanceGraphRunValidationIssue[];
}

export function buildResearcherCitationProvenanceGraphProbeEvidence(
  probeId: string,
  category: ResearcherCitationProvenanceGraphCategory,
  expected: ForgeAcceptanceOutcome,
  actual: ForgeAcceptanceOutcome,
  aligned: boolean,
  criterion: string,
  detail: string,
  disposition: ResearcherCitationProvenanceGraphProbeDisposition,
  recordedAt: string = new Date().toISOString(),
): ResearcherCitationProvenanceGraphProbeEvidence {
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

export function buildResearcherCitationProvenanceGraphProbeTelemetry(
  probeId: string,
  category: ResearcherCitationProvenanceGraphCategory,
  sequenceIndex: number,
  durationMs: number,
): ResearcherCitationProvenanceGraphProbeTelemetry {
  return {
    probeId,
    category,
    sequenceIndex,
    durationMs: Math.max(0, durationMs),
  };
}

export function buildResearcherCitationProvenanceGraphProvenance(
  runId: string,
  fixture: ResearcherCitationProvenanceGraphBaseline,
  contract: ResearcherCitationProvenanceGraphContract,
  startedAt: string,
  completedAt: string,
  totalProbes: number,
  options?: {
    gitCommit?: string;
    sliceAtom?: string;
    sliceCategories?: readonly ResearcherCitationProvenanceGraphCategory[];
  },
): ResearcherCitationProvenanceGraphProvenance {
  return {
    runId,
    harnessVersion: FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_VERSION,
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

export function buildResearcherCitationProvenanceGraphRunRecord(
  provenance: ResearcherCitationProvenanceGraphProvenance,
  evidence: ResearcherCitationProvenanceGraphProbeEvidence[],
  telemetry: ResearcherCitationProvenanceGraphProbeTelemetry[],
): ResearcherCitationProvenanceGraphRunRecord {
  const byCategory = {} as Record<ResearcherCitationProvenanceGraphCategory, number>;
  const byDisposition: Record<ResearcherCitationProvenanceGraphProbeDisposition, number> = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  };
  for (const category of RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES) {
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

function validateResearcherCitationProvenanceGraphRunRecordAgainstProbeIds(
  record: ResearcherCitationProvenanceGraphRunRecord,
  expectedProbeIds: string[],
  contract: ResearcherCitationProvenanceGraphContract,
): ResearcherCitationProvenanceGraphRunValidationResult {
  const issues: ResearcherCitationProvenanceGraphRunValidationIssue[] = [];
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

export function validateResearcherCitationProvenanceGraphRunRecord(
  record: ResearcherCitationProvenanceGraphRunRecord,
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): ResearcherCitationProvenanceGraphRunValidationResult {
  return validateResearcherCitationProvenanceGraphRunRecordAgainstProbeIds(
    record,
    listResearcherCitationProvenanceGraphContractProbeIds(contract),
    contract,
  );
}

/** Validate evidence slice run record — A06 gate for failure_path + recovery_path + nogo_path probes. */
export function validateResearcherCitationProvenanceGraphEvidenceRunRecord(
  record: ResearcherCitationProvenanceGraphRunRecord,
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): ResearcherCitationProvenanceGraphRunValidationResult {
  const issues: ResearcherCitationProvenanceGraphRunValidationIssue[] = [];

  if (record.provenance.sliceAtom !== "P04-B05-A06") {
    issues.push({
      kind: "provenance_mismatch",
      detail: `sliceAtom=${record.provenance.sliceAtom ?? "missing"} expected=P04-B05-A06`,
    });
  }

  const expectedCategories = [...RESEARCHER_CITATION_PROVENANCE_GRAPH_FAILURE_RECOVERY_CATEGORIES];
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

  const probeValidation = validateResearcherCitationProvenanceGraphRunRecordAgainstProbeIds(
    record,
    listResearcherCitationProvenanceGraphFailureRecoveryProbeIds(contract),
    contract,
  );

  return {
    valid: issues.length === 0 && probeValidation.valid,
    issues: [...issues, ...probeValidation.issues],
  };
}

export interface ResearcherCitationProvenanceGraphEvidenceSliceResult {
  atom: "P04-B05-A06";
  evidenceProbeCount: number;
  matrixValid: boolean;
  recordValid: boolean;
  results: ResearcherCitationProvenanceGraphProbeResult[];
  evidenceResults: ResearcherCitationProvenanceGraphProbeResult[];
  matrixValidation: ResearcherCitationProvenanceGraphProbeMatrixValidationResult;
  record: ResearcherCitationProvenanceGraphRunRecord;
  recordValidation: ResearcherCitationProvenanceGraphRunValidationResult;
}

function resolveResearcherCitationProvenanceGraphGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function runResearcherCitationProvenanceGraphProbeWithTiming(
  entry: ResearcherCitationProvenanceGraphFixtureEntry,
  fixture: ResearcherCitationProvenanceGraphBaseline,
  contractProbe: ResearcherCitationProvenanceGraphProbeContract | undefined,
): {
  result: ResearcherCitationProvenanceGraphProbeResult;
  durationMs: number;
  disposition: ResearcherCitationProvenanceGraphProbeDisposition;
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

function buildResearcherCitationProvenanceGraphRecordFromEntries(
  entries: ResearcherCitationProvenanceGraphFixtureEntry[],
  fixture: ResearcherCitationProvenanceGraphBaseline,
  contract: ResearcherCitationProvenanceGraphContract,
  options?: {
    sliceAtom?: string;
    sliceCategories?: readonly ResearcherCitationProvenanceGraphCategory[];
  },
): ResearcherCitationProvenanceGraphRunRecord {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const evidence: ResearcherCitationProvenanceGraphProbeEvidence[] = [];
  const telemetry: ResearcherCitationProvenanceGraphProbeTelemetry[] = [];
  let sequenceIndex = 0;

  for (const entry of entries) {
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    const { result, durationMs, disposition } = runResearcherCitationProvenanceGraphProbeWithTiming(
      entry,
      fixture,
      contractProbe,
    );
    const criterion = contractProbe?.criterion ?? result.criterion ?? "";

    evidence.push(
      buildResearcherCitationProvenanceGraphProbeEvidence(
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
      buildResearcherCitationProvenanceGraphProbeTelemetry(
        result.id,
        result.category,
        sequenceIndex,
        durationMs,
      ),
    );
    sequenceIndex++;
  }

  const completedAt = new Date().toISOString();
  const provenance = buildResearcherCitationProvenanceGraphProvenance(
    runId,
    fixture,
    contract,
    startedAt,
    completedAt,
    evidence.length,
    {
      gitCommit: resolveResearcherCitationProvenanceGraphGitCommit(),
      ...(options?.sliceAtom ? { sliceAtom: options.sliceAtom } : {}),
      ...(options?.sliceCategories ? { sliceCategories: options.sliceCategories } : {}),
    },
  );

  return buildResearcherCitationProvenanceGraphRunRecord(provenance, evidence, telemetry);
}

/** Run all citation provenance graph probes and emit auditable evidence, telemetry and provenance (P04-B05-A06). */
export function runResearcherCitationProvenanceGraphProbesWithRecord(
  fixture: ResearcherCitationProvenanceGraphBaseline = loadResearcherCitationProvenanceGraphBaseline(),
): ResearcherCitationProvenanceGraphRunRecord {
  const contract = getActiveResearcherCitationProvenanceGraphContract();
  return buildResearcherCitationProvenanceGraphRecordFromEntries(fixture.probes, fixture, contract);
}

/** Run failure/recovery slice probes with evidence, telemetry and provenance (P04-B05-A06). */
export function runResearcherCitationProvenanceGraphFailureRecoverySliceWithRecord(
  fixture: ResearcherCitationProvenanceGraphBaseline = loadResearcherCitationProvenanceGraphBaseline(),
): ResearcherCitationProvenanceGraphRunRecord {
  const contract = getActiveResearcherCitationProvenanceGraphContract();
  const failureRecoveryIds = new Set(
    listResearcherCitationProvenanceGraphFailureRecoveryProbeIds(contract),
  );
  const entries = fixture.probes.filter(entry => failureRecoveryIds.has(entry.id));

  return buildResearcherCitationProvenanceGraphRecordFromEntries(entries, fixture, contract, {
    sliceAtom: "P04-B05-A06",
    sliceCategories: RESEARCHER_CITATION_PROVENANCE_GRAPH_FAILURE_RECOVERY_CATEGORIES,
  });
}

/**
 * A06 evidence slice: contract-wired failure_path, recovery_path, and nogo_path probes
 * with auditable evidence, telemetry and provenance — zero unexpected mismatches.
 */
export function runResearcherCitationProvenanceGraphEvidenceSlice(
  fixture: ResearcherCitationProvenanceGraphBaseline = loadResearcherCitationProvenanceGraphBaseline(),
): ResearcherCitationProvenanceGraphEvidenceSliceResult {
  const contract = getActiveResearcherCitationProvenanceGraphContract();
  const results = runResearcherCitationProvenanceGraphProbes(fixture);
  const failureRecoveryProbes = RESEARCHER_CITATION_PROVENANCE_GRAPH_FAILURE_RECOVERY_CATEGORIES.flatMap(
    category => listResearcherCitationProvenanceGraphContractProbesByCategory(category, contract),
  );
  const failureRecoveryIds = new Set(failureRecoveryProbes.map(p => p.id));
  const evidenceResults = results.filter(r => failureRecoveryIds.has(r.id));
  const matrixValidation = validateResearcherCitationProvenanceGraphFailureRecoveryProbeMatrix(
    results,
    contract,
  );
  const record = runResearcherCitationProvenanceGraphFailureRecoverySliceWithRecord(fixture);
  const recordValidation = validateResearcherCitationProvenanceGraphEvidenceRunRecord(
    record,
    contract,
  );

  return {
    atom: "P04-B05-A06",
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

// ─── Property and fuzz validation (P04-B05-A07) ─────────────────────────────

export interface ResearcherCitationProvenanceGraphPropertyViolation {
  propertyId: string;
  detail: string;
}

export interface ResearcherCitationProvenanceGraphPropertyResult {
  passed: number;
  failed: ResearcherCitationProvenanceGraphPropertyViolation[];
  total: number;
  allPassed: boolean;
}

export type ResearcherCitationProvenanceGraphPropertyCheck = {
  id: string;
  description: string;
  check: (contract: ResearcherCitationProvenanceGraphContract) => string | null;
};

const RESEARCHER_CITATION_PROVENANCE_GRAPH_STRUCTURAL_PROPERTIES: readonly ResearcherCitationProvenanceGraphPropertyCheck[] =
  [
    {
      id: "categories_complete",
      description: "All eight citation provenance graph categories are declared",
      check: contract => {
        for (const category of RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES) {
          if (!contract.categories[category]) return `missing category: ${category}`;
        }
        return null;
      },
    },
    {
      id: "probe_ids_unique",
      description: "Probe ids are globally unique",
      check: contract => {
        const ids = listResearcherCitationProvenanceGraphContractProbeIds(contract);
        if (new Set(ids).size !== ids.length) return "duplicate probe id detected";
        return null;
      },
    },
    {
      id: "min_probe_count",
      description: "Each category meets contract minProbeCount",
      check: contract => {
        for (const category of RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES) {
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
        "summarizeResearcherCitationProvenanceGraphContractCoverage totals match listResearcherCitationProvenanceGraphContractProbeIds",
      check: contract => {
        const summary = summarizeResearcherCitationProvenanceGraphContractCoverage(contract);
        const ids = listResearcherCitationProvenanceGraphContractProbeIds(contract);
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
      description: "Probe ids are namespaced with rcpg. prefix",
      check: contract => {
        for (const probe of contract.probes) {
          if (!probe.id.startsWith("rcpg.")) {
            return `${probe.id} missing rcpg. prefix`;
          }
        }
        return null;
      },
    },
    {
      id: "run_record_summary_invariant",
      description: "Run record summary aligned + mismatches equals total",
      check: contract => {
        const fixture = loadResearcherCitationProvenanceGraphBaseline();
        const probeIds = listResearcherCitationProvenanceGraphContractProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildResearcherCitationProvenanceGraphProbeEvidence(
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
          return buildResearcherCitationProvenanceGraphProbeTelemetry(
            id,
            probe.category,
            index,
            index,
          );
        });
        const record = buildResearcherCitationProvenanceGraphRunRecord(
          buildResearcherCitationProvenanceGraphProvenance(
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
        "Synthetic failure/recovery slice record passes validateResearcherCitationProvenanceGraphEvidenceRunRecord",
      check: contract => {
        const fixture = loadResearcherCitationProvenanceGraphBaseline();
        const probeIds = listResearcherCitationProvenanceGraphFailureRecoveryProbeIds(contract);
        const evidence = probeIds.map(id => {
          const probe = contract.probes.find(p => p.id === id)!;
          return buildResearcherCitationProvenanceGraphProbeEvidence(
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
          return buildResearcherCitationProvenanceGraphProbeTelemetry(
            id,
            probe.category,
            index,
            index * 0.5,
          );
        });
        const record = buildResearcherCitationProvenanceGraphRunRecord(
          buildResearcherCitationProvenanceGraphProvenance(
            "property-check-failure-recovery",
            fixture,
            contract,
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T00:00:01.000Z",
            probeIds.length,
            {
              sliceAtom: "P04-B05-A06",
              sliceCategories: RESEARCHER_CITATION_PROVENANCE_GRAPH_FAILURE_RECOVERY_CATEGORIES,
            },
          ),
          evidence,
          telemetry,
        );
        const validation = validateResearcherCitationProvenanceGraphEvidenceRunRecord(record, contract);
        if (!validation.valid) {
          return validation.issues.map(i => i.detail).join("; ");
        }
        return null;
      },
    },
  ] as const;

export function runResearcherCitationProvenanceGraphPropertyValidation(
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): ResearcherCitationProvenanceGraphPropertyResult {
  const failed: ResearcherCitationProvenanceGraphPropertyViolation[] = [];
  for (const property of RESEARCHER_CITATION_PROVENANCE_GRAPH_STRUCTURAL_PROPERTIES) {
    const detail = property.check(contract);
    if (detail) failed.push({ propertyId: property.id, detail });
  }
  const total = RESEARCHER_CITATION_PROVENANCE_GRAPH_STRUCTURAL_PROPERTIES.length;
  return {
    passed: total - failed.length,
    failed,
    total,
    allPassed: failed.length === 0,
  };
}

export type ResearcherCitationProvenanceGraphFuzzMutationKind =
  | "flip_expected"
  | "drop_probe"
  | "extra_probe"
  | "rename_probe"
  | "flip_category";

export interface ResearcherCitationProvenanceGraphFuzzMutationCase {
  seed: number;
  kind: ResearcherCitationProvenanceGraphFuzzMutationKind;
  probeId?: string;
  category?: ResearcherCitationProvenanceGraphCategory;
}

export interface ResearcherCitationProvenanceGraphFuzzValidationCaseResult {
  mutation: ResearcherCitationProvenanceGraphFuzzMutationCase;
  valid: boolean;
  issueKinds: string[];
}

export interface ResearcherCitationProvenanceGraphFuzzValidationResult {
  seed: number;
  iterations: number;
  rejected: number;
  accepted: number;
  cases: ResearcherCitationProvenanceGraphFuzzValidationCaseResult[];
  allMutationsRejected: boolean;
}

/** Deterministic PRNG for reproducible fuzz cases (mulberry32). */
export function createResearcherCitationProvenanceGraphFuzzRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneResearcherCitationProvenanceGraphBaseline(
  fixture: ResearcherCitationProvenanceGraphBaseline,
): ResearcherCitationProvenanceGraphBaseline {
  return {
    ...fixture,
    sourceBlockGate: { ...fixture.sourceBlockGate },
    probes: fixture.probes.map(entry => ({ ...entry })),
  };
}

function pickResearcherCitationProvenanceGraphFuzzTarget(
  fixture: ResearcherCitationProvenanceGraphBaseline,
  rng: () => number,
): {
  category: ResearcherCitationProvenanceGraphCategory;
  index: number;
  entry: ResearcherCitationProvenanceGraphFixtureEntry;
} {
  const category =
    RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES[
      Math.floor(rng() * RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES.length)
    ]!;
  const entries = fixture.probes.filter(p => p.category === category);
  const index = Math.floor(rng() * entries.length);
  return { category, index, entry: entries[index]! };
}

export function applyResearcherCitationProvenanceGraphFuzzMutation(
  fixture: ResearcherCitationProvenanceGraphBaseline,
  mutation: ResearcherCitationProvenanceGraphFuzzMutationCase,
): ResearcherCitationProvenanceGraphBaseline {
  const mutated = cloneResearcherCitationProvenanceGraphBaseline(fixture);
  const targetCategory = mutation.category ?? RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES[0]!;
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
          id: `rcpg.fuzz.extra.${mutation.seed}`,
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
      const other = RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES.find(c => c !== entry.category)!;
      entry.category = other;
      break;
    }
  }

  return mutated;
}

export function generateResearcherCitationProvenanceGraphFuzzMutationCases(
  fixture: ResearcherCitationProvenanceGraphBaseline,
  seed: number,
  iterations: number,
): ResearcherCitationProvenanceGraphFuzzMutationCase[] {
  const rng = createResearcherCitationProvenanceGraphFuzzRng(seed);
  const kinds: ResearcherCitationProvenanceGraphFuzzMutationKind[] = [
    "flip_expected",
    "drop_probe",
    "extra_probe",
    "rename_probe",
    "flip_category",
  ];
  const cases: ResearcherCitationProvenanceGraphFuzzMutationCase[] = [];

  for (let i = 0; i < iterations; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)]!;
    const target = pickResearcherCitationProvenanceGraphFuzzTarget(fixture, rng);
    cases.push({
      seed: seed + i,
      kind,
      probeId: target.entry.id,
      category: target.category,
    });
  }

  return cases;
}

/** Fuzz harness: mutated fixtures must fail contract validation (P04-B05-A07). */
export function runResearcherCitationProvenanceGraphFuzzValidation(
  fixture: ResearcherCitationProvenanceGraphBaseline,
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
  seed = 42,
  iterations = 24,
): ResearcherCitationProvenanceGraphFuzzValidationResult {
  const cases = generateResearcherCitationProvenanceGraphFuzzMutationCases(fixture, seed, iterations);
  const results: ResearcherCitationProvenanceGraphFuzzValidationCaseResult[] = [];
  let rejected = 0;
  let accepted = 0;

  for (const mutation of cases) {
    const mutated = applyResearcherCitationProvenanceGraphFuzzMutation(fixture, mutation);
    const validation = validateResearcherCitationProvenanceGraphAgainstContract(mutated, contract);
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

export type ResearcherCitationProvenanceGraphRunRecordFuzzKind =
  | "drop_evidence"
  | "drop_telemetry"
  | "wrong_total"
  | "wrong_slice_atom"
  | "wrong_slice_categories";

export interface ResearcherCitationProvenanceGraphRunRecordFuzzCase {
  kind: ResearcherCitationProvenanceGraphRunRecordFuzzKind;
  probeId?: string;
}

export function applyResearcherCitationProvenanceGraphRunRecordFuzzMutation(
  record: ResearcherCitationProvenanceGraphRunRecord,
  mutation: ResearcherCitationProvenanceGraphRunRecordFuzzCase,
): ResearcherCitationProvenanceGraphRunRecord {
  const cloned: ResearcherCitationProvenanceGraphRunRecord = {
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
      cloned.provenance = { ...cloned.provenance, sliceAtom: "P04-B05-A99" };
      break;
    case "wrong_slice_categories":
      cloned.provenance = {
        ...cloned.provenance,
        sliceCategories: ["evidence_versioning"],
      };
      break;
  }

  cloned.summary = buildResearcherCitationProvenanceGraphRunRecord(
    cloned.provenance,
    cloned.evidence,
    cloned.telemetry,
  ).summary;
  return cloned;
}

function resolveResearcherCitationProvenanceGraphRunRecordValidator(
  record: ResearcherCitationProvenanceGraphRunRecord,
): (
  record: ResearcherCitationProvenanceGraphRunRecord,
  contract: ResearcherCitationProvenanceGraphContract,
) => ResearcherCitationProvenanceGraphRunValidationResult {
  return record.provenance.sliceAtom === "P04-B05-A06"
    ? validateResearcherCitationProvenanceGraphEvidenceRunRecord
    : validateResearcherCitationProvenanceGraphRunRecord;
}

/** Fuzz harness: tampered run records must fail validation deterministically (P04-B05-A07). */
export function runResearcherCitationProvenanceGraphRunRecordFuzzValidation(
  record: ResearcherCitationProvenanceGraphRunRecord,
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): { validBaseline: boolean; mutationsRejected: number; mutationsAccepted: number } {
  const validate = resolveResearcherCitationProvenanceGraphRunRecordValidator(record);
  const baseline = validate(record, contract);
  const probeId = record.evidence[0]?.probeId;
  const mutations: ResearcherCitationProvenanceGraphRunRecordFuzzCase[] = [
    { kind: "drop_evidence", probeId },
    { kind: "drop_telemetry", probeId },
    { kind: "wrong_total" },
  ];

  if (record.provenance.sliceAtom === "P04-B05-A06") {
    mutations.push({ kind: "wrong_slice_atom" }, { kind: "wrong_slice_categories" });
  }

  let mutationsRejected = 0;
  let mutationsAccepted = 0;
  for (const mutation of mutations) {
    const mutated = applyResearcherCitationProvenanceGraphRunRecordFuzzMutation(record, mutation);
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

export interface ResearcherCitationProvenanceGraphPropertyFuzzSliceResult {
  atom: "P04-B05-A07";
  propertyChecksPassed: boolean;
  contractFuzzRejected: boolean;
  runRecordFuzzRejected: boolean;
  propertyResult: ResearcherCitationProvenanceGraphPropertyResult;
  contractFuzz: ResearcherCitationProvenanceGraphFuzzValidationResult;
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
export function runResearcherCitationProvenanceGraphPropertyFuzzSlice(
  fixture: ResearcherCitationProvenanceGraphBaseline = loadResearcherCitationProvenanceGraphBaseline(),
): ResearcherCitationProvenanceGraphPropertyFuzzSliceResult {
  const contract = getActiveResearcherCitationProvenanceGraphContract();
  const propertyResult = runResearcherCitationProvenanceGraphPropertyValidation(contract);
  const contractFuzz = runResearcherCitationProvenanceGraphFuzzValidation(fixture, contract);
  const record = runResearcherCitationProvenanceGraphFailureRecoverySliceWithRecord(fixture);
  const runRecordFuzz = runResearcherCitationProvenanceGraphRunRecordFuzzValidation(record, contract);

  return {
    atom: "P04-B05-A07",
    propertyChecksPassed: propertyResult.allPassed,
    contractFuzzRejected: contractFuzz.allMutationsRejected,
    runRecordFuzzRejected: runRecordFuzz.mutationsAccepted === 0,
    propertyResult,
    contractFuzz,
    runRecordFuzz,
  };
}

// ─── Probe regression detection (P04-B05-A08) ────────────────────────────────

export interface ResearcherCitationProvenanceGraphProbeRegressionReport {
  hasRegression: boolean;
  regressions: string[];
  fixed: string[];
  newMismatches: string[];
  summary: string;
}

/**
 * Compare citation provenance graph run records and detect probe alignment regressions.
 * A regression = probe aligned in prior run but misaligned in current run.
 */
export function detectResearcherCitationProvenanceGraphProbeRegression(
  prior: ResearcherCitationProvenanceGraphRunRecord,
  current: ResearcherCitationProvenanceGraphRunRecord,
): ResearcherCitationProvenanceGraphProbeRegressionReport {
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

export interface ResearcherCitationProvenanceGraphForgeRegressionResult {
  atom: "P04-B05-A08";
  passed: boolean;
  productionSlice: ResearcherCitationProvenanceGraphProductionSliceResult;
  propertyFuzzSlice: ResearcherCitationProvenanceGraphPropertyFuzzSliceResult;
  record: ResearcherCitationProvenanceGraphRunRecord;
  recordValid: boolean;
  priorRecordValid: boolean;
  validationIssues: string[];
  priorValidationIssues: string[];
  probeRegression: ResearcherCitationProvenanceGraphProbeRegressionReport | null;
  guard: ResearcherCitationProvenanceGraphGuardCheckResult;
  detail: string;
}

/**
 * Execute citation provenance graph probes, validate production slice + run record,
 * property/fuzz gates, and optionally detect regression vs prior run (P04-B05-A08).
 */
export function runResearcherCitationProvenanceGraphForgeRegression(
  priorRecord?: ResearcherCitationProvenanceGraphRunRecord,
): ResearcherCitationProvenanceGraphForgeRegressionResult {
  const fixture = loadResearcherCitationProvenanceGraphBaseline();
  const contract = getActiveResearcherCitationProvenanceGraphContract();
  const productionSlice = runResearcherCitationProvenanceGraphProductionSlice(fixture);
  const propertyFuzzSlice = runResearcherCitationProvenanceGraphPropertyFuzzSlice(fixture);
  const record = runResearcherCitationProvenanceGraphProbesWithRecord(fixture);
  const validation = validateResearcherCitationProvenanceGraphRunRecord(record, contract);
  const recordValid = validation.valid && record.summary.mismatches === 0;
  const validationIssues = validation.issues.map(issue => issue.detail);

  let priorRecordValid = true;
  let priorValidationIssues: string[] = [];
  if (priorRecord) {
    const priorValidation = validateResearcherCitationProvenanceGraphRunRecord(priorRecord, contract);
    priorRecordValid = priorValidation.valid && priorRecord.summary.mismatches === 0;
    priorValidationIssues = priorValidation.issues.map(issue => issue.detail);
  }

  const probeRegression = priorRecord
    ? detectResearcherCitationProvenanceGraphProbeRegression(priorRecord, record)
    : null;
  const alignmentRegression = probeRegression?.hasRegression ?? false;
  const guard = validateForgeResearcherCitationProvenanceGraphGuard(record, {
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
    atom: "P04-B05-A08",
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

// ─── Guard controls (P04-B05-A09 foundation, used by A08 regression gate) ────

export interface ForgeResearcherCitationProvenanceGraphGuardControls {
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

export interface ResearcherCitationProvenanceGraphGuardCheckIssue {
  domain: "adversarial" | "performance" | "cost" | "safety";
  code: string;
  detail: string;
}

export interface ResearcherCitationProvenanceGraphGuardCheckResult {
  passed: boolean;
  issues: ResearcherCitationProvenanceGraphGuardCheckIssue[];
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

export interface ResearcherCitationProvenanceGraphAdversarialGuardScenario {
  id: string;
  description: string;
  build: (
    record: ResearcherCitationProvenanceGraphRunRecord,
  ) => ResearcherCitationProvenanceGraphRunRecord;
  expectRejected: true;
}

export const FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_GUARD_CONTROLS_V1: ForgeResearcherCitationProvenanceGraphGuardControls =
  {
    atom: "P04-B05-A09",
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

export function getForgeResearcherCitationProvenanceGraphGuardControls(): ForgeResearcherCitationProvenanceGraphGuardControls {
  return FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_GUARD_CONTROLS_V1;
}

function parseResearcherCitationProvenanceGraphIsoDurationMs(
  startedAt: string,
  completedAt: string,
): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

export function summarizeResearcherCitationProvenanceGraphTelemetry(
  telemetry: ResearcherCitationProvenanceGraphProbeTelemetry[],
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

export function detectResearcherCitationProvenanceGraphEvidenceSummaryMismatch(
  record: ResearcherCitationProvenanceGraphRunRecord,
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

export function detectResearcherCitationProvenanceGraphFalseAlignment(
  record: ResearcherCitationProvenanceGraphRunRecord,
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

export function validateResearcherCitationProvenanceGraphSafety(
  record: ResearcherCitationProvenanceGraphRunRecord,
  controls: ForgeResearcherCitationProvenanceGraphGuardControls = getForgeResearcherCitationProvenanceGraphGuardControls(),
): ResearcherCitationProvenanceGraphGuardCheckIssue[] {
  const issues: ResearcherCitationProvenanceGraphGuardCheckIssue[] = [];
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

export function validateResearcherCitationProvenanceGraphPerformance(
  record: ResearcherCitationProvenanceGraphRunRecord,
  controls: ForgeResearcherCitationProvenanceGraphGuardControls = getForgeResearcherCitationProvenanceGraphGuardControls(),
): ResearcherCitationProvenanceGraphGuardCheckIssue[] {
  const issues: ResearcherCitationProvenanceGraphGuardCheckIssue[] = [];
  const { suiteDurationMs, maxProbeDurationMs } = summarizeResearcherCitationProvenanceGraphTelemetry(
    record.telemetry,
  );
  const wallClockMs = parseResearcherCitationProvenanceGraphIsoDurationMs(
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

export function validateResearcherCitationProvenanceGraphCost(
  totalCostUsd: number,
  llmCalls: number,
  controls: ForgeResearcherCitationProvenanceGraphGuardControls = getForgeResearcherCitationProvenanceGraphGuardControls(),
): ResearcherCitationProvenanceGraphGuardCheckIssue[] {
  const issues: ResearcherCitationProvenanceGraphGuardCheckIssue[] = [];
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

export function buildResearcherCitationProvenanceGraphAdversarialGuardScenarios(): ResearcherCitationProvenanceGraphAdversarialGuardScenario[] {
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

export function runResearcherCitationProvenanceGraphAdversarialGuardChecks(
  fixtureRecord: ResearcherCitationProvenanceGraphRunRecord,
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): { rejected: number; total: number; failures: string[] } {
  const scenarios = buildResearcherCitationProvenanceGraphAdversarialGuardScenarios();
  const failures: string[] = [];
  let rejected = 0;

  for (const scenario of scenarios) {
    const tampered = scenario.build(fixtureRecord);
    const validation = validateResearcherCitationProvenanceGraphRunRecord(tampered, contract);
    const falseAlignment = detectResearcherCitationProvenanceGraphFalseAlignment(tampered);
    const summaryMismatch = detectResearcherCitationProvenanceGraphEvidenceSummaryMismatch(tampered);
    const rejectedByGuard =
      !validation.valid || falseAlignment.length > 0 || summaryMismatch !== null;

    if (rejectedByGuard) rejected++;
    else failures.push(`${scenario.id}: tampered record was not rejected`);
  }

  return { rejected, total: scenarios.length, failures };
}

export function validateForgeResearcherCitationProvenanceGraphGuard(
  record: ResearcherCitationProvenanceGraphRunRecord,
  options: {
    totalCostUsd?: number;
    llmCalls?: number;
    contract?: ResearcherCitationProvenanceGraphContract;
    controls?: ForgeResearcherCitationProvenanceGraphGuardControls;
  } = {},
): ResearcherCitationProvenanceGraphGuardCheckResult {
  const controls = options.controls ?? getForgeResearcherCitationProvenanceGraphGuardControls();
  const contract = options.contract ?? getActiveResearcherCitationProvenanceGraphContract();
  const totalCostUsd = options.totalCostUsd ?? 0;
  const llmCalls = options.llmCalls ?? 0;
  const issues: ResearcherCitationProvenanceGraphGuardCheckIssue[] = [];

  issues.push(...validateResearcherCitationProvenanceGraphPerformance(record, controls));
  issues.push(...validateResearcherCitationProvenanceGraphCost(totalCostUsd, llmCalls, controls));
  issues.push(...validateResearcherCitationProvenanceGraphSafety(record, controls));

  const falseAlignment = detectResearcherCitationProvenanceGraphFalseAlignment(record);
  if (falseAlignment.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "false_alignment",
      detail: falseAlignment.join("; "),
    });
  }
  const summaryMismatch = detectResearcherCitationProvenanceGraphEvidenceSummaryMismatch(record);
  if (summaryMismatch) {
    issues.push({
      domain: "adversarial",
      code: "summary_evidence_mismatch",
      detail: summaryMismatch,
    });
  }

  const adversarial = runResearcherCitationProvenanceGraphAdversarialGuardChecks(record, contract);
  if (adversarial.failures.length > 0) {
    issues.push({
      domain: "adversarial",
      code: "scenario_not_rejected",
      detail: adversarial.failures.join("; "),
    });
  }

  const telemetrySummary = summarizeResearcherCitationProvenanceGraphTelemetry(record.telemetry);
  const wallClockMs = parseResearcherCitationProvenanceGraphIsoDurationMs(
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

// ─── Block gate and handoff (P04-B05-A10) ─────────────────────────────────────

export interface ResearcherCitationProvenanceGraphBlockGateEvidence {
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

export interface ResearcherCitationProvenanceGraphBlockHandoffContract {
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
    citationProvenanceGraphCategories: readonly ResearcherCitationProvenanceGraphCategory[];
    sourceBlockGateAtom: string;
  };
  prerequisites: readonly string[];
  entryCriteria: {
    description: string;
    requiresBlockGatePass: true;
    citationProvenanceGraphRecordRequired: true;
  };
}

export const FORGE_P04_B05_BLOCK_GATE_V1: ForgeBlockGateDefinition = {
  version: "1.0.0",
  atom: "P04-B05-A10",
  blockId: "P04-B05",
  title: "Citation ve provenance graph",
  requiredAtomIds: [
    "P04-B05-A01",
    "P04-B05-A02",
    "P04-B05-A03",
    "P04-B05-A04",
    "P04-B05-A05",
    "P04-B05-A06",
    "P04-B05-A07",
    "P04-B05-A08",
    "P04-B05-A09",
    "P04-B05-A10",
  ],
  checks: [
    {
      id: "fixture_contract_alignment",
      atomId: "P04-B05-A01",
      description:
        "Citation provenance graph baseline aligns with typed contract and P04-B04 block gate handoff",
    },
    {
      id: "typed_contract_coverage",
      atomId: "P04-B05-A02",
      description: "Contract declares measurable probes for all citation provenance graph categories",
    },
    {
      id: "probe_matrix_aligned",
      atomId: "P04-B05-A03",
      description: "Citation provenance graph probe matrix executes with zero unexpected mismatches",
    },
    {
      id: "boundary_disposition_coverage",
      atomId: "P04-B05-A04",
      description:
        "Contract covers observed, failure, recovery and NO-GO dispositions with boundary probes",
    },
    {
      id: "failure_recovery_nogo",
      atomId: "P04-B05-A05",
      description: "Failure, recovery and NO-GO probes are declared and exercised",
    },
    {
      id: "evidence_telemetry_provenance",
      atomId: "P04-B05-A06",
      description: "Run record carries evidence, telemetry and provenance",
    },
    {
      id: "property_and_fuzz",
      atomId: "P04-B05-A07",
      description: "Structural property and fuzz validation reject tampered inputs",
    },
    {
      id: "regression_gate",
      atomId: "P04-B05-A08",
      description: "Regression gate passes on canonical citation provenance graph matrix",
    },
    {
      id: "guard_controls",
      atomId: "P04-B05-A09",
      description: "Adversarial, performance, cost and safety guard controls pass",
    },
    {
      id: "block_gate_sealed",
      atomId: "P04-B05-A10",
      description: "Block gate evidence sealed with valid B06 handoff contract",
    },
  ] satisfies readonly ForgeBlockGateCheck[],
};

export const FORGE_P04_B05_TO_B06_HANDOFF_V1: ResearcherCitationProvenanceGraphBlockHandoffContract = {
  version: "1.0.0",
  atom: "P04-B05-A10",
  sourceBlock: {
    blockId: "P04-B05",
    title: "Citation ve provenance graph",
    completedAtoms: FORGE_P04_B05_BLOCK_GATE_V1.requiredAtomIds,
  },
  targetBlock: {
    blockId: "P04-B06",
    title: "Contradiction ve freshness çözümü",
    entryAtom: "P04-B06-A01",
  },
  sealedArtifacts: {
    fixtureVersion: "1.0.0",
    contractVersion: FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_CONTRACT_V1.version,
    harnessVersion: FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_VERSION,
    probeCount: summarizeResearcherCitationProvenanceGraphContractCoverage(
      FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_CONTRACT_V1,
    ).totalProbes,
    citationProvenanceGraphCategories: RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES,
    sourceBlockGateAtom: "P04-B04-A10",
  },
  prerequisites: [
    "Citation provenance graph contract v1 with measurable citation, provenance and guard probes",
    "Versioned citation provenance graph baseline aligned to contract probe matrix and sealed P04-B04 block gate",
    "Evidence, telemetry and provenance run records",
    "Regression and guard gates integrated with orchestrator verification",
    "Sealed P04-B04 benchmark prior-art block gate referenced by sourceBlockGateAtom",
  ],
  entryCriteria: {
    description:
      "P04-B06-A01 formalizes contradiction and freshness resolution using sealed citation provenance graph artifacts",
    requiresBlockGatePass: true,
    citationProvenanceGraphRecordRequired: true,
  },
};

export function getForgeP04B05BlockGate(): ForgeBlockGateDefinition {
  return FORGE_P04_B05_BLOCK_GATE_V1;
}

export function getForgeP04B05ToB06Handoff(): ResearcherCitationProvenanceGraphBlockHandoffContract {
  return FORGE_P04_B05_TO_B06_HANDOFF_V1;
}

export function validateResearcherCitationProvenanceGraphBlockHandoffContract(
  handoff: ResearcherCitationProvenanceGraphBlockHandoffContract,
  evidence: Pick<
    ResearcherCitationProvenanceGraphBlockGateEvidence,
    "probeCount" | "regressionPassed" | "guardPassed"
  >,
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const coverage = summarizeResearcherCitationProvenanceGraphContractCoverage(contract);

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
  if (handoff.sealedArtifacts.harnessVersion !== FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_VERSION) {
    issues.push(
      `handoff harnessVersion=${handoff.sealedArtifacts.harnessVersion} active=${FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_VERSION}`,
    );
  }
  if (
    handoff.sealedArtifacts.citationProvenanceGraphCategories.length !==
    RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES.length
  ) {
    issues.push("handoff citationProvenanceGraphCategories incomplete");
  }
  if (handoff.sealedArtifacts.sourceBlockGateAtom !== "P04-B04-A10") {
    issues.push(`unexpected source block gate atom: ${handoff.sealedArtifacts.sourceBlockGateAtom}`);
  }
  if (handoff.targetBlock.entryAtom !== "P04-B06-A01") {
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

export function buildResearcherCitationProvenanceGraphBlockGateEvidence(
  atomSeals: ForgeBlockAtomSeal[],
  regressionPassed: boolean,
  guardPassed: boolean,
  probeCount: number,
  gitCommit?: string,
  blockId = FORGE_P04_B05_BLOCK_GATE_V1.blockId,
): ResearcherCitationProvenanceGraphBlockGateEvidence {
  const handoff = getForgeP04B05ToB06Handoff();
  const handoffValid = validateResearcherCitationProvenanceGraphBlockHandoffContract(handoff, {
    probeCount,
    regressionPassed,
    guardPassed,
  }).valid;

  return {
    blockId,
    atom: "P04-B05-A10",
    sealedAt: new Date().toISOString(),
    atomSeals,
    regressionPassed,
    guardPassed,
    handoffValid,
    probeCount,
    ...(gitCommit ? { gitCommit } : {}),
  };
}
