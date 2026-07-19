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
  runResearcherInRepoEvidenceFailureRecoverySlice,
  validateResearcherInRepoEvidenceFailureRecoveryProbeMatrix,
  listResearcherInRepoEvidenceFailureRecoveryProbeIds,
  RESEARCHER_IN_REPO_EVIDENCE_FAILURE_RECOVERY_CATEGORIES,
  RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES,
  RESEARCHER_IN_REPO_EVIDENCE_QUERY_MAX_LENGTH,
  buildResearcherInRepoEvidenceProbeEvidence,
  buildResearcherInRepoEvidenceProbeTelemetry,
  buildResearcherInRepoEvidenceProvenance,
  buildResearcherInRepoEvidenceRunRecord,
  runResearcherInRepoEvidenceEvidenceSlice,
  runResearcherInRepoEvidenceProbesWithRecord,
  runResearcherInRepoEvidenceFailureRecoverySliceWithRecord,
  validateResearcherInRepoEvidenceEvidenceRunRecord,
  validateResearcherInRepoEvidenceRunRecord,
  FORGE_RESEARCHER_IN_REPO_EVIDENCE_VERSION,
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

describe("Forge Researcher In-Repo Evidence Failure/Recovery Slice — P04-B02-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveResearcherInRepoEvidenceContract();
    const failure = listResearcherInRepoEvidenceContractProbesByCategory(
      "failure_path",
      contract,
    );
    const recovery = listResearcherInRepoEvidenceContractProbesByCategory(
      "recovery_path",
      contract,
    );
    const nogo = listResearcherInRepoEvidenceContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...RESEARCHER_IN_REPO_EVIDENCE_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveResearcherInRepoEvidenceContract();
    const slice = runResearcherInRepoEvidenceFailureRecoverySlice();

    assert.equal(slice.atom, "P04-B02-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of RESEARCHER_IN_REPO_EVIDENCE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listResearcherInRepoEvidenceContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateResearcherInRepoEvidenceFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure/recovery/NO-GO paths with validator export and citation recovery", () => {
    const slice = runResearcherInRepoEvidenceFailureRecoverySlice();
    const probeIds = listResearcherInRepoEvidenceFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const invalidVersion = slice.failureRecoveryResults.find(
      r => r.id === "riev.invalid_version_rejected",
    );
    assert.ok(invalidVersion);
    assert.equal(invalidVersion!.expected, "PASS");
    assert.equal(invalidVersion!.actual, "PASS");

    const malformedQuery = slice.failureRecoveryResults.find(
      r => r.id === "riev.malformed_query_guard",
    );
    assert.ok(malformedQuery);
    assert.equal(malformedQuery!.expected, "PASS");
    assert.equal(malformedQuery!.actual, "PASS");

    const researchBlockNonFatal = slice.failureRecoveryResults.find(
      r => r.id === "riev.research_block_non_fatal",
    );
    assert.ok(researchBlockNonFatal);
    assert.equal(researchBlockNonFatal!.expected, "PASS");
    assert.equal(researchBlockNonFatal!.actual, "PASS");

    const structuredRecovery = slice.failureRecoveryResults.find(
      r => r.id === "riev.structured_repo_evidence_recovery",
    );
    assert.ok(structuredRecovery);
    assert.equal(structuredRecovery!.expected, "PASS");
    assert.equal(structuredRecovery!.actual, "PASS");

    const researcherCriticalBlock = slice.failureRecoveryResults.find(
      r => r.id === "riev.researcher_critical_block",
    );
    assert.ok(researcherCriticalBlock);
    assert.equal(researcherCriticalBlock!.expected, "PASS");
    assert.equal(researcherCriticalBlock!.actual, "PASS");

    const exportedValidator = slice.failureRecoveryResults.find(
      r => r.id === "riev.exported_repo_evidence_validator",
    );
    assert.ok(exportedValidator);
    assert.equal(exportedValidator!.expected, "PASS");
    assert.equal(exportedValidator!.actual, "PASS");
  });
});

describe("Forge Researcher In-Repo Evidence Evidence — P04-B02-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadResearcherInRepoEvidenceBaseline();
    const contract = getActiveResearcherInRepoEvidenceContract();
    const probeIds = listResearcherInRepoEvidenceFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildResearcherInRepoEvidenceProbeEvidence(
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
      return buildResearcherInRepoEvidenceProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildResearcherInRepoEvidenceProvenance(
      "run-riev-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P04-B02-A06",
        sliceCategories: RESEARCHER_IN_REPO_EVIDENCE_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildResearcherInRepoEvidenceRunRecord(provenance, evidence, telemetry);
    const validation = validateResearcherInRepoEvidenceEvidenceRunRecord(record, contract);

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
    const contract = getActiveResearcherInRepoEvidenceContract();
    const slice = runResearcherInRepoEvidenceEvidenceSlice();

    assert.equal(slice.atom, "P04-B02-A06");
    assert.equal(slice.evidenceProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.recordValidation.valid, true, slice.recordValidation.issues.map(i => i.detail).join("\n"));

    for (const category of RESEARCHER_IN_REPO_EVIDENCE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listResearcherInRepoEvidenceContractProbesByCategory(
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
    assert.equal(record.provenance.sliceAtom, "P04-B02-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_RESEARCHER_IN_REPO_EVIDENCE_VERSION);
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

    const researchBlockNonFatal = record.evidence.find(e => e.probeId === "riev.research_block_non_fatal");
    assert.ok(researchBlockNonFatal);
    assert.equal(researchBlockNonFatal!.aligned, true);
    assert.equal(researchBlockNonFatal!.expected, "PASS");
    assert.equal(researchBlockNonFatal!.actual, "PASS");
    assert.equal(researchBlockNonFatal!.disposition, "recovery");
  });

  it("records evidence, telemetry and provenance for full in-repo evidence run", () => {
    const contract = getActiveResearcherInRepoEvidenceContract();
    const record = runResearcherInRepoEvidenceProbesWithRecord();
    const validation = validateResearcherInRepoEvidenceRunRecord(record, contract);

    assert.equal(record.evidence.length, 23);
    assert.equal(record.telemetry.length, 23);
    assert.equal(record.provenance.totalProbes, 23);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 23);
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveResearcherInRepoEvidenceContract();
    const record = runResearcherInRepoEvidenceFailureRecoverySliceWithRecord();
    const validation = validateResearcherInRepoEvidenceEvidenceRunRecord(record, contract);

    assert.equal(record.evidence.length, 6);
    assert.equal(record.telemetry.length, 6);
    assert.equal(record.provenance.sliceAtom, "P04-B02-A06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
  });
});
