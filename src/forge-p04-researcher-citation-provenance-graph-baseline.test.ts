import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherCitationProvenanceGraphBaseline,
  runResearcherCitationProvenanceGraphProbes,
  runResearcherCitationProvenanceGraphProductionSlice,
  runResearcherCitationProvenanceGraphBoundarySlice,
  runResearcherCitationProvenanceGraphFailureRecoverySlice,
  validateResearcherCitationProvenanceGraphBaseline,
  validateResearcherCitationProvenanceGraphBoundaryProbeMatrix,
  validateResearcherCitationProvenanceGraphFailureRecoveryProbeMatrix,
  listResearcherCitationProvenanceGraphFailureRecoveryProbeIds,
  RESEARCHER_CITATION_PROVENANCE_GRAPH_FAILURE_RECOVERY_CATEGORIES,
  validateResearcherCitationProvenanceGraphProbeMatrix,
  listResearcherCitationProvenanceGraphContractProbesByCategory,
  summarizeResearcherCitationProvenanceGraphMatrix,
  listResearcherCitationProvenanceGraphProbesByExpected,
  listResearcherCitationProvenanceGraphKnownGaps,
  assessCitationProvenanceGraphInputBoundary,
  validateCitationProvenanceGraphCollection,
  recoverCitationProvenanceGraph,
  buildResearchCitationProvenanceGraph,
  getActiveResearcherCitationProvenanceGraphContract,
  RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES,
  RESEARCHER_CITATION_PROVENANCE_GRAPH_INPUT_MAX_LENGTH,
  FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_VERSION,
  buildResearcherCitationProvenanceGraphProbeEvidence,
  buildResearcherCitationProvenanceGraphProbeTelemetry,
  buildResearcherCitationProvenanceGraphProvenance,
  buildResearcherCitationProvenanceGraphRunRecord,
  runResearcherCitationProvenanceGraphEvidenceSlice,
  runResearcherCitationProvenanceGraphFailureRecoverySliceWithRecord,
  validateResearcherCitationProvenanceGraphEvidenceRunRecord,
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
    assert.equal(documentedFail.length, 2);
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
      "rcpg.exported_citation_graph_validator",
      "rcpg.parser_citation_edges",
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

describe("Forge Researcher Citation Provenance Graph Production Slice — P04-B05-A03", () => {
  it("buildResearchCitationProvenanceGraph builds actionable graph from researcher output", () => {
    const build = buildResearchCitationProvenanceGraph(
      "FINDINGS: citation graph wiring supports provenance export\nSOURCES: https://docs.example.com/spec\nCITATIONS: src/research-engine.ts:30 export function searchFiles",
      { topic: "citation provenance graph" },
    );

    assert.equal(build.recovered, true);
    assert.equal(build.validation.valid, true);
    assert.ok(build.graph.nodes.length >= 2);
    assert.ok(build.graph.edges.length >= 1);
    assert.ok(build.graph.nodes.some(node => node.kind === "source"));
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveResearcherCitationProvenanceGraphContract();
    const slice = runResearcherCitationProvenanceGraphProductionSlice();

    assert.equal(slice.atom, "P04-B05-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 21);
    assert.equal(slice.matrixValidation.gapAligned, 2);
    assert.equal(slice.summary.knownGaps.length, 2);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateResearcherCitationProvenanceGraphProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const sourcesPromptProbe = slice.results.find(r => r.id === "rcpg.researcher_sources_prompt");
    assert.ok(sourcesPromptProbe);
    assert.equal(sourcesPromptProbe!.expected, "PASS");
    assert.equal(sourcesPromptProbe!.actual, "PASS");
    assert.equal(sourcesPromptProbe!.aligned, true);

    const buildGraphProbe = slice.results.find(r => r.id === "rcpg.build_research_citation_graph");
    assert.ok(buildGraphProbe);
    assert.equal(buildGraphProbe!.expected, "PASS");
    assert.equal(buildGraphProbe!.actual, "PASS");
    assert.equal(buildGraphProbe!.aligned, true);
  });
});

describe("Forge Researcher Citation Provenance Graph Boundary Slice — P04-B05-A04", () => {
  it("defines six boundary probes with citation input edge-case criteria", () => {
    const boundary = listResearcherCitationProvenanceGraphContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "rcpg.empty_citation_input_boundary",
      "rcpg.known_gaps_documented",
      "rcpg.long_citation_input_truncation_boundary",
      "rcpg.probe_runner_exported",
      "rcpg.source_block_gate_ref",
      "rcpg.whitespace_citation_input_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on citation edge probes", () => {
    const contract = getActiveResearcherCitationProvenanceGraphContract();
    const slice = runResearcherCitationProvenanceGraphBoundarySlice();

    assert.equal(slice.atom, "P04-B05-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listResearcherCitationProvenanceGraphContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateResearcherCitationProvenanceGraphBoundaryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("assessCitationProvenanceGraphInputBoundary edge cases align with boundary probe matrix", () => {
    const slice = runResearcherCitationProvenanceGraphBoundarySlice();
    const citationProbes = [
      "rcpg.empty_citation_input_boundary",
      "rcpg.whitespace_citation_input_boundary",
      "rcpg.long_citation_input_truncation_boundary",
    ] as const;

    for (const probeId of citationProbes) {
      const result = slice.boundaryResults.find(r => r.id === probeId);
      assert.ok(result, `missing ${probeId}`);
      assert.equal(result!.actual, "PASS");
      assert.equal(result!.aligned, true);
    }
  });
});

describe("Forge Researcher Citation Provenance Graph Failure Recovery Slice — P04-B05-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveResearcherCitationProvenanceGraphContract();
    const failure = listResearcherCitationProvenanceGraphContractProbesByCategory(
      "failure_path",
      contract,
    );
    const recovery = listResearcherCitationProvenanceGraphContractProbesByCategory(
      "recovery_path",
      contract,
    );
    const nogo = listResearcherCitationProvenanceGraphContractProbesByCategory(
      "nogo_path",
      contract,
    );

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...RESEARCHER_CITATION_PROVENANCE_GRAPH_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveResearcherCitationProvenanceGraphContract();
    const slice = runResearcherCitationProvenanceGraphFailureRecoverySlice();

    assert.equal(slice.atom, "P04-B05-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 4);
    assert.equal(slice.matrixValidation.gapAligned, 2);

    for (const category of RESEARCHER_CITATION_PROVENANCE_GRAPH_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listResearcherCitationProvenanceGraphContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateResearcherCitationProvenanceGraphFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure/recovery/NO-GO paths with citation recovery and documented parser debt", () => {
    const slice = runResearcherCitationProvenanceGraphFailureRecoverySlice();
    const probeIds = listResearcherCitationProvenanceGraphFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const invalidVersion = slice.failureRecoveryResults.find(
      r => r.id === "rcpg.invalid_version_rejected",
    );
    assert.ok(invalidVersion);
    assert.equal(invalidVersion!.expected, "PASS");
    assert.equal(invalidVersion!.actual, "PASS");

    const malformedInput = slice.failureRecoveryResults.find(
      r => r.id === "rcpg.malformed_citation_input_guard",
    );
    assert.ok(malformedInput);
    assert.equal(malformedInput!.expected, "PASS");
    assert.equal(malformedInput!.actual, "PASS");

    const graphRepair = slice.failureRecoveryResults.find(
      r => r.id === "rcpg.recovery_citation_graph_repair",
    );
    assert.ok(graphRepair);
    assert.equal(graphRepair!.expected, "PASS");
    assert.equal(graphRepair!.actual, "PASS");

    const missingEdgesFallback = slice.failureRecoveryResults.find(
      r => r.id === "rcpg.recovery_missing_edges_fallback",
    );
    assert.ok(missingEdgesFallback);
    assert.equal(missingEdgesFallback!.expected, "PASS");
    assert.equal(missingEdgesFallback!.actual, "PASS");

    const parserCitationEdges = slice.failureRecoveryResults.find(
      r => r.id === "rcpg.parser_citation_edges",
    );
    assert.ok(parserCitationEdges);
    assert.equal(parserCitationEdges!.expected, "FAIL");
    assert.equal(parserCitationEdges!.actual, "FAIL");

    const exportedValidator = slice.failureRecoveryResults.find(
      r => r.id === "rcpg.exported_citation_graph_validator",
    );
    assert.ok(exportedValidator);
    assert.equal(exportedValidator!.expected, "FAIL");
    assert.equal(exportedValidator!.actual, "FAIL");
  });
});

describe("Forge Researcher Citation Provenance Graph Evidence — P04-B05-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadResearcherCitationProvenanceGraphBaseline();
    const contract = getActiveResearcherCitationProvenanceGraphContract();
    const probeIds = listResearcherCitationProvenanceGraphFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildResearcherCitationProvenanceGraphProbeEvidence(
        probeId,
        contractProbe.category,
        contractProbe.expected,
        contractProbe.expected,
        true,
        contractProbe.criterion,
        "synthetic",
        contractProbe.disposition,
        completedAt,
      );
    });

    const telemetry = probeIds.map((probeId, index) => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildResearcherCitationProvenanceGraphProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildResearcherCitationProvenanceGraphProvenance(
      "run-rcpg-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P04-B05-A06",
        sliceCategories: RESEARCHER_CITATION_PROVENANCE_GRAPH_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildResearcherCitationProvenanceGraphRunRecord(provenance, evidence, telemetry);
    const validation = validateResearcherCitationProvenanceGraphEvidenceRunRecord(record, contract);

    assert.equal(record.summary.total, 6);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBlockGateAtom, fixture.sourceBlockGate.atom);
  });

  it("executes evidence slice with zero unexpected mismatches and valid run record", () => {
    const contract = getActiveResearcherCitationProvenanceGraphContract();
    const slice = runResearcherCitationProvenanceGraphEvidenceSlice();

    assert.equal(slice.atom, "P04-B05-A06");
    assert.equal(slice.evidenceProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 4);
    assert.equal(slice.matrixValidation.gapAligned, 2);
    assert.equal(
      slice.recordValidation.valid,
      true,
      slice.recordValidation.issues.map(i => i.detail).join("\n"),
    );

    for (const category of RESEARCHER_CITATION_PROVENANCE_GRAPH_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listResearcherCitationProvenanceGraphContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.evidenceResults.find(r => r.id === probe.id);
        assert.ok(result, `missing evidence result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const record = slice.record;
    assert.equal(record.evidence.length, 6);
    assert.equal(record.telemetry.length, 6);
    assert.equal(record.provenance.totalProbes, 6);
    assert.equal(record.provenance.sliceAtom, "P04-B05-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a06");
    assert.equal(record.summary.mismatches, 0);

    for (const item of record.telemetry) {
      assert.ok(item.durationMs >= 0, `${item.probeId} negative duration`);
      assert.ok(Number.isFinite(item.sequenceIndex));
    }

    for (const item of record.evidence) {
      const contractProbe = contract.probes.find(p => p.id === item.probeId)!;
      assert.ok(item.criterion.length > 0, `${item.probeId} missing criterion in evidence`);
      assert.equal(item.criterion, contractProbe.criterion);
      assert.equal(item.disposition, contractProbe.disposition);
      assert.ok(item.recordedAt.length > 10);
    }

    const graphRepair = record.evidence.find(e => e.probeId === "rcpg.recovery_citation_graph_repair");
    assert.ok(graphRepair);
    assert.equal(graphRepair!.aligned, true);
    assert.equal(graphRepair!.expected, "PASS");
    assert.equal(graphRepair!.actual, "PASS");
    assert.equal(graphRepair!.disposition, "recovery");
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveResearcherCitationProvenanceGraphContract();
    const record = runResearcherCitationProvenanceGraphFailureRecoverySliceWithRecord();
    const validation = validateResearcherCitationProvenanceGraphEvidenceRunRecord(record, contract);

    assert.equal(record.evidence.length, 6);
    assert.equal(record.provenance.sliceAtom, "P04-B05-A06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
  });
});
