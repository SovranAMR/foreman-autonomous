import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherCitationProvenanceGraphBaseline,
  runResearcherCitationProvenanceGraphProbes,
  validateResearcherCitationProvenanceGraphBaseline,
  summarizeResearcherCitationProvenanceGraphMatrix,
  listResearcherCitationProvenanceGraphProbesByExpected,
  listResearcherCitationProvenanceGraphKnownGaps,
  assessCitationProvenanceGraphInputBoundary,
  validateCitationProvenanceGraphCollection,
  recoverCitationProvenanceGraph,
  RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES,
  RESEARCHER_CITATION_PROVENANCE_GRAPH_INPUT_MAX_LENGTH,
} from "./forge-p04-researcher-citation-provenance-graph.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Researcher Citation Provenance Graph — P04-B05-A01", () => {
  it("loads versioned citation provenance graph baseline aligned with P04-B04 block gate handoff", () => {
    const fixture = loadResearcherCitationProvenanceGraphBaseline();
    const validation = validateResearcherCitationProvenanceGraphBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P04-B05-A01");
    assert.equal(fixture.contractAtom, "P04-B05-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P04-B04-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures citation provenance graph probes with documented FAIL gaps from B04 sealed handoff", () => {
    const results = runResearcherCitationProvenanceGraphProbes();
    const summary = summarizeResearcherCitationProvenanceGraphMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listResearcherCitationProvenanceGraphProbesByExpected(
      "FAIL",
      loadResearcherCitationProvenanceGraphBaseline(),
    );
    assert.equal(documentedFail.length, 4);
    assert.ok(documentedFail.some(p => p.id === "rcpg.researcher_sources_prompt"));
    assert.ok(documentedFail.some(p => p.id === "rcpg.build_research_citation_graph"));
    assert.ok(documentedFail.some(p => p.id === "rcpg.parser_citation_edges"));
    assert.ok(documentedFail.some(p => p.id === "rcpg.exported_citation_graph_validator"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES) {
      assert.ok(summary.byCategory[cat], `missing category summary: ${cat}`);
      assert.ok(summary.byCategory[cat].total > 0, `${cat} has no probes`);
    }

    const passMismatches = results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(
      passMismatches.length,
      0,
      formatMismatchReport(passMismatches),
    );
  });

  it("documents citation provenance graph gaps as measurable baseline debt", () => {
    const gaps = listResearcherCitationProvenanceGraphKnownGaps(
      runResearcherCitationProvenanceGraphProbes(),
    );
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "rcpg.build_research_citation_graph",
      "rcpg.exported_citation_graph_validator",
      "rcpg.parser_citation_edges",
      "rcpg.researcher_sources_prompt",
    ]);
    assert.ok(
      gaps.every(g => RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES.includes(g.category)),
      "documented gaps are citation provenance graph probes",
    );
  });

  it("assessCitationProvenanceGraphInputBoundary rejects empty and null-byte citation inputs", () => {
    const empty = assessCitationProvenanceGraphInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessCitationProvenanceGraphInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessCitationProvenanceGraphInputBoundary("citation\0parse");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessCitationProvenanceGraphInputBoundary truncates oversized citation inputs", () => {
    const longInput = "x".repeat(RESEARCHER_CITATION_PROVENANCE_GRAPH_INPUT_MAX_LENGTH + 500);
    const truncated = assessCitationProvenanceGraphInputBoundary(longInput);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(
      truncated.normalizedInput.length,
      RESEARCHER_CITATION_PROVENANCE_GRAPH_INPUT_MAX_LENGTH,
    );
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("validateCitationProvenanceGraphCollection accepts graphs with source nodes and edges", () => {
    const validation = validateCitationProvenanceGraphCollection({
      version: "1.0.0",
      nodes: [
        { id: "claim:0", kind: "claim", label: "finding" },
        { id: "source:0", kind: "source", label: "Example", sourceRef: "https://example.com/doc" },
      ],
      edges: [{ from: "claim:0", to: "source:0", kind: "cites" }],
    });

    assert.equal(validation.valid, true, validation.issues.join("; "));
    assert.equal(validation.nodeCount, 2);
    assert.equal(validation.edgeCount, 1);
  });

  it("recoverCitationProvenanceGraph restructures malformed citation parse into actionable graph plan", () => {
    const recovery = recoverCitationProvenanceGraph(
      'malformed citation: [Spec](https://docs.example.com/spec) src/research-engine.ts:30 export function searchFiles {"source":"broken',
      { topic: "citation provenance graph" },
    );

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.graph.nodes.length >= 2);
    assert.ok(recovery.graph.edges.length >= 1);
    assert.ok(recovery.graph.nodes.some(node => node.kind === "source"));
  });
});
