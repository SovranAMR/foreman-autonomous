/**
 * FOREMAN — Researcher Citation & Provenance Graph Baseline (P04-B05)
 *
 * A01 slice: load, validate, run probes with documented FAIL gaps against sealed
 * P04-B04 benchmark prior-art block gate artifacts.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import researcherCitationProvenanceGraphBaseline from "./fixtures/forge-researcher-citation-provenance-graph-v1.json" with { type: "json" };
import type { ForgeAcceptanceOutcome } from "./forge-baseline-contract.js";
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

export const FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_VERSION = "1.0.0";

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
        expected: "FAIL",
        disposition: "gap",
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
        expected: "FAIL",
        disposition: "gap",
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
        disposition: "gap",
        criterion:
          "parseResearchCitationGraph exports citation→source edges from researcher output",
      },
      {
        id: "rcpg.exported_citation_graph_validator",
        category: "nogo_path",
        description:
          "validateCitationProvenanceGraph exported for orchestrator citation graph checks",
        expected: "FAIL",
        disposition: "gap",
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

export function listResearcherCitationProvenanceGraphContractProbeIds(
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): string[] {
  return contract.probes.map(p => p.id);
}

export function listResearcherCitationProvenanceGraphContractProbesByCategory(
  category: ResearcherCitationProvenanceGraphCategory,
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): readonly ResearcherCitationProvenanceGraphProbeContract[] {
  return contract.categories[category]?.probes ?? [];
}

export function summarizeResearcherCitationProvenanceGraphContractCoverage(
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): {
  totalProbes: number;
  expectedFail: number;
  byCategory: Record<ResearcherCitationProvenanceGraphCategory, number>;
  byDisposition: Record<ResearcherCitationProvenanceGraphProbeDisposition, number>;
} {
  const byCategory = {} as Record<ResearcherCitationProvenanceGraphCategory, number>;
  const byDisposition = {
    observed: 0,
    gap: 0,
    failure: 0,
    recovery: 0,
    nogo: 0,
  } satisfies Record<ResearcherCitationProvenanceGraphProbeDisposition, number>;

  for (const category of RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES) {
    byCategory[category] = contract.categories[category]?.probes.length ?? 0;
  }

  for (const probeEntry of contract.probes) {
    byDisposition[probeEntry.disposition]++;
  }

  return {
    totalProbes: contract.probes.length,
    expectedFail: contract.probes.filter(p => p.expected === "FAIL").length,
    byCategory,
    byDisposition,
  };
}

export function validateResearcherCitationProvenanceGraphAgainstContract(
  fixture: ResearcherCitationProvenanceGraphBaseline,
  contract: ResearcherCitationProvenanceGraphContract = getActiveResearcherCitationProvenanceGraphContract(),
): ResearcherCitationProvenanceGraphValidationResult {
  const issues: ResearcherCitationProvenanceGraphValidationIssue[] = [];

  if (fixture.contractAtom && fixture.contractAtom !== contract.atom) {
    issues.push({
      kind: "missing_probe",
      detail: `contractAtom=${fixture.contractAtom} contract=${contract.atom}`,
    });
  }

  for (const contractProbe of contract.probes) {
    const entry = fixture.probes.find(p => p.id === contractProbe.id);
    if (!entry) {
      issues.push({
        kind: "missing_probe",
        probeId: contractProbe.id,
        detail: `missing probe ${contractProbe.id}`,
      });
      continue;
    }
    if (entry.expected !== contractProbe.expected) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `expected mismatch fixture=${entry.expected} contract=${contractProbe.expected}`,
      });
    }
    if (entry.category !== contractProbe.category) {
      issues.push({
        kind: "missing_probe",
        probeId: entry.id,
        detail: `category mismatch fixture=${entry.category} contract=${contractProbe.category}`,
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
      const ok = hasProductionExport("buildResearchCitationProvenanceGraph");
      return probe(id, category, expected, ok, `researchCitationGraph=${ok}`);
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
    const result = runSingleProbe(entry.id, entry.category, entry.expected, fixture);
    const contractProbe = contract.probes.find(p => p.id === entry.id);
    return contractProbe?.criterion
      ? { ...result, criterion: contractProbe.criterion }
      : result;
  });
}
