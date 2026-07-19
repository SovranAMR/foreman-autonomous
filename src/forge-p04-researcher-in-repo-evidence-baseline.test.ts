import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherInRepoEvidenceBaseline,
  runResearcherInRepoEvidenceProbes,
  runResearcherInRepoEvidenceProductionSlice,
  validateResearcherInRepoEvidenceBaseline,
  validateResearcherInRepoEvidenceProbeMatrix,
  summarizeResearcherInRepoEvidenceMatrix,
  listResearcherInRepoEvidenceProbesByExpected,
  listResearcherInRepoEvidenceKnownGaps,
  assessInRepoEvidenceInputBoundary,
  validateInRepoEvidenceCollection,
  recoverInRepoEvidence,
  getActiveResearcherInRepoEvidenceContract,
  listResearcherInRepoEvidenceContractProbesByCategory,
  runResearcherInRepoEvidenceBoundarySlice,
  validateResearcherInRepoEvidenceBoundaryProbeMatrix,
  RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES,
  RESEARCHER_IN_REPO_EVIDENCE_QUERY_MAX_LENGTH,
} from "./forge-p04-researcher-in-repo-evidence.js";
import { searchFiles } from "./research-engine.js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = dirname(fileURLToPath(import.meta.url));

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Researcher In-Repo Evidence — P04-B02-A01", () => {
  it("loads versioned in-repo evidence baseline aligned with P04-B01 block gate handoff", () => {
    const fixture = loadResearcherInRepoEvidenceBaseline();
    const validation = validateResearcherInRepoEvidenceBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P04-B02-A01");
    assert.equal(fixture.contractAtom, "P04-B02-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P04-B01-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures in-repo evidence probes with zero unexpected mismatches after A03 slice", () => {
    const results = runResearcherInRepoEvidenceProbes();
    const summary = summarizeResearcherInRepoEvidenceMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listResearcherInRepoEvidenceProbesByExpected(
      "FAIL",
      loadResearcherInRepoEvidenceBaseline(),
    );
    assert.equal(documentedFail.length, 0);

    for (const cat of RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES) {
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

  it("documents no remaining in-repo evidence FAIL gaps after production slice", () => {
    const gaps = listResearcherInRepoEvidenceKnownGaps(runResearcherInRepoEvidenceProbes());
    assert.deepEqual(gaps, []);
  });

  it("assessInRepoEvidenceInputBoundary rejects empty and null-byte search queries", () => {
    const empty = assessInRepoEvidenceInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessInRepoEvidenceInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessInRepoEvidenceInputBoundary("task\0input");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessInRepoEvidenceInputBoundary truncates oversized search queries", () => {
    const longQuery = "x".repeat(RESEARCHER_IN_REPO_EVIDENCE_QUERY_MAX_LENGTH + 500);
    const truncated = assessInRepoEvidenceInputBoundary(longQuery);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedQuery.length, RESEARCHER_IN_REPO_EVIDENCE_QUERY_MAX_LENGTH);
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("validateInRepoEvidenceCollection accepts live repo hits with citation fields", () => {
    const hits = searchFiles(SRC_ROOT, "export function searchFiles", "*.ts", 3);
    const validation = validateInRepoEvidenceCollection("searchFiles", hits);

    assert.ok(hits.length > 0);
    assert.equal(validation.valid, true, validation.issues.join("; "));
    assert.equal(validation.fileHitCount, hits.length);
  });

  it("validateInRepoEvidenceCollection rejects zero-hit queries", () => {
    const validation = validateInRepoEvidenceCollection("valid query", []);
    assert.equal(validation.valid, false);
    assert.ok(validation.issues.some(issue => issue.includes("zero in-repo file hits")));
  });
});

describe("Forge Researcher In-Repo Evidence Production Slice — P04-B02-A03", () => {
  it("recoverInRepoEvidence restructures malformed repo citation parse into actionable evidence plan", () => {
    const recovery = recoverInRepoEvidence(
      'malformed repo citation: src/research-engine.ts:30 export function searchFiles {"file":"broken',
    );

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.evidencePlan.searchQueries.length >= 1);
    assert.ok(
      recovery.evidencePlan.citationTargets.some(target => target.file.includes("research-engine.ts")),
    );
    assert.ok(recovery.evidencePlan.searchQueries.some(query => query.includes("searchFiles")));
  });

  it("recoverInRepoEvidence rejects null-byte and empty citation parse safely", () => {
    const emptyRecovery = recoverInRepoEvidence("");
    assert.equal(emptyRecovery.recovered, false);
    assert.deepEqual(emptyRecovery.parseErrors, ["empty"]);

    const nullRecovery = recoverInRepoEvidence("citation\0parse");
    assert.equal(nullRecovery.recovered, false);
    assert.deepEqual(nullRecovery.parseErrors, ["contains_null_byte"]);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveResearcherInRepoEvidenceContract();
    const slice = runResearcherInRepoEvidenceProductionSlice();

    assert.equal(slice.atom, "P04-B02-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 23);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateResearcherInRepoEvidenceProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const recoveryProbe = slice.results.find(r => r.id === "riev.structured_repo_evidence_recovery");
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
  });
});

describe("Forge Researcher In-Repo Evidence Boundary Slice — P04-B02-A04", () => {
  it("defines boundary category with search query input edge-case probes", () => {
    const boundary = listResearcherInRepoEvidenceContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "riev.empty_query_boundary",
      "riev.known_gaps_documented",
      "riev.long_query_truncation_boundary",
      "riev.probe_runner_exported",
      "riev.source_block_gate_ref",
      "riev.whitespace_query_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveResearcherInRepoEvidenceContract();
    const slice = runResearcherInRepoEvidenceBoundarySlice();

    assert.equal(slice.atom, "P04-B02-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listResearcherInRepoEvidenceContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateResearcherInRepoEvidenceBoundaryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });
});
