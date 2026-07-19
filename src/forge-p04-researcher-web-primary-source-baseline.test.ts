import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherWebPrimarySourceBaseline,
  runResearcherWebPrimarySourceProbes,
  runResearcherWebPrimarySourceProductionSlice,
  runResearcherWebPrimarySourceBoundarySlice,
  runResearcherWebPrimarySourceFailureRecoverySlice,
  validateResearcherWebPrimarySourceBaseline,
  validateResearcherWebPrimarySourceProbeMatrix,
  validateResearcherWebPrimarySourceBoundaryProbeMatrix,
  validateResearcherWebPrimarySourceFailureRecoveryProbeMatrix,
  listResearcherWebPrimarySourceFailureRecoveryProbeIds,
  RESEARCHER_WEB_PRIMARY_SOURCE_FAILURE_RECOVERY_CATEGORIES,
  listResearcherWebPrimarySourceContractProbesByCategory,
  summarizeResearcherWebPrimarySourceMatrix,
  listResearcherWebPrimarySourceProbesByExpected,
  listResearcherWebPrimarySourceKnownGaps,
  assessWebPrimarySourceInputBoundary,
  validateWebPrimarySourceCollection,
  recoverWebPrimarySourceEvidence,
  getActiveResearcherWebPrimarySourceContract,
  RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORIES,
  RESEARCHER_WEB_PRIMARY_SOURCE_URL_MAX_LENGTH,
  buildResearcherWebPrimarySourceProbeEvidence,
  buildResearcherWebPrimarySourceProbeTelemetry,
  buildResearcherWebPrimarySourceProvenance,
  buildResearcherWebPrimarySourceRunRecord,
  validateResearcherWebPrimarySourceEvidenceRunRecord,
  validateResearcherWebPrimarySourceRunRecord,
  runResearcherWebPrimarySourceEvidenceSlice,
  runResearcherWebPrimarySourceProbesWithRecord,
  runResearcherWebPrimarySourceFailureRecoverySliceWithRecord,
  FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_VERSION,
} from "./forge-p04-researcher-web-primary-source.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Researcher Web Primary-Source — P04-B03-A01", () => {
  it("loads versioned web primary-source baseline aligned with P04-B02 block gate handoff", () => {
    const fixture = loadResearcherWebPrimarySourceBaseline();
    const validation = validateResearcherWebPrimarySourceBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P04-B03-A01");
    assert.equal(fixture.contractAtom, "P04-B03-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P04-B02-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures web primary-source probes with zero unexpected mismatches after A03 slice", () => {
    const results = runResearcherWebPrimarySourceProbes();
    const summary = summarizeResearcherWebPrimarySourceMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listResearcherWebPrimarySourceProbesByExpected(
      "FAIL",
      loadResearcherWebPrimarySourceBaseline(),
    );
    assert.equal(documentedFail.length, 0);

    for (const cat of RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORIES) {
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

  it("documents no remaining web primary-source FAIL gaps after production slice", () => {
    const gaps = listResearcherWebPrimarySourceKnownGaps(runResearcherWebPrimarySourceProbes());
    assert.deepEqual(gaps, []);
  });

  it("assessWebPrimarySourceInputBoundary rejects empty and null-byte URL inputs", () => {
    const empty = assessWebPrimarySourceInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessWebPrimarySourceInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessWebPrimarySourceInputBoundary("https://example.com\0/evil");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessWebPrimarySourceInputBoundary truncates oversized URLs", () => {
    const longUrl = "https://example.com/" + "x".repeat(RESEARCHER_WEB_PRIMARY_SOURCE_URL_MAX_LENGTH);
    const truncated = assessWebPrimarySourceInputBoundary(longUrl);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedUrl.length, RESEARCHER_WEB_PRIMARY_SOURCE_URL_MAX_LENGTH);
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("validateWebPrimarySourceCollection accepts fetch hits with url and text citation fields", () => {
    const validation = validateWebPrimarySourceCollection("https://example.com/docs", [
      {
        url: "https://example.com/docs",
        text: "Primary source documentation excerpt",
        title: "Example Docs",
      },
    ]);

    assert.equal(validation.valid, true, validation.issues.join("; "));
    assert.equal(validation.fetchHitCount, 1);
  });

  it("validateWebPrimarySourceCollection rejects zero-hit URL fetches", () => {
    const validation = validateWebPrimarySourceCollection("https://example.com/missing", []);
    assert.equal(validation.valid, false);
    assert.ok(validation.issues.some(issue => issue.includes("zero primary-source fetch hits")));
  });
});

describe("Forge Researcher Web Primary-Source Production Slice — P04-B03-A03", () => {
  it("recoverWebPrimarySourceEvidence restructures malformed URL citation parse into actionable fetch plan", () => {
    const recovery = recoverWebPrimarySourceEvidence(
      'malformed URL citation: https://docs.example.com/guide#section export function fetchPrimary {"url":"broken',
    );

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.fetchPlan.fetchUrls.length >= 1);
    assert.ok(
      recovery.fetchPlan.citationTargets.some(target => target.url.includes("docs.example.com")),
    );
    assert.ok(recovery.fetchPlan.fetchUrls.some(url => url.includes("docs.example.com")));
  });

  it("recoverWebPrimarySourceEvidence rejects null-byte and empty citation parse safely", () => {
    const emptyRecovery = recoverWebPrimarySourceEvidence("");
    assert.equal(emptyRecovery.recovered, false);
    assert.deepEqual(emptyRecovery.parseErrors, ["empty"]);

    const nullRecovery = recoverWebPrimarySourceEvidence("citation\0parse");
    assert.equal(nullRecovery.recovered, false);
    assert.deepEqual(nullRecovery.parseErrors, ["contains_null_byte"]);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveResearcherWebPrimarySourceContract();
    const slice = runResearcherWebPrimarySourceProductionSlice();

    assert.equal(slice.atom, "P04-B03-A03");
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

    const matrixValidation = validateResearcherWebPrimarySourceProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const recoveryProbe = slice.results.find(
      r => r.id === "rwps.structured_web_primary_source_recovery",
    );
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
  });
});

describe("Forge Researcher Web Primary-Source Boundary Slice — P04-B03-A04", () => {
  it("defines boundary category with URL input edge-case probes", () => {
    const boundary = listResearcherWebPrimarySourceContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "rwps.empty_url_boundary",
      "rwps.known_gaps_documented",
      "rwps.long_url_truncation_boundary",
      "rwps.probe_runner_exported",
      "rwps.source_block_gate_ref",
      "rwps.whitespace_url_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on URL edge probes", () => {
    const contract = getActiveResearcherWebPrimarySourceContract();
    const slice = runResearcherWebPrimarySourceBoundarySlice();

    assert.equal(slice.atom, "P04-B03-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listResearcherWebPrimarySourceContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateResearcherWebPrimarySourceBoundaryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("validateWebPrimarySourceCollection rejects whitespace-only URL before fetch", () => {
    const validation = validateWebPrimarySourceCollection("   \t\n  ", [
      { url: "https://example.com", text: "should not reach fetch validation" },
    ]);
    assert.equal(validation.valid, false);
    assert.equal(validation.fetchHitCount, 0);
    assert.ok(validation.issues.some(issue => issue.includes("whitespace-only")));
  });

  it("recoverWebPrimarySourceEvidence rejects whitespace-only citation parse at boundary", () => {
    const recovery = recoverWebPrimarySourceEvidence("  \t  ");
    assert.equal(recovery.recovered, false);
    assert.deepEqual(recovery.parseErrors, ["whitespace_only"]);
    assert.equal(recovery.detail, "cannot recover whitespace-only URL citation parse");
  });
});

describe("Forge Researcher Web Primary-Source Failure/Recovery Slice — P04-B03-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveResearcherWebPrimarySourceContract();
    const failure = listResearcherWebPrimarySourceContractProbesByCategory(
      "failure_path",
      contract,
    );
    const recovery = listResearcherWebPrimarySourceContractProbesByCategory(
      "recovery_path",
      contract,
    );
    const nogo = listResearcherWebPrimarySourceContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...RESEARCHER_WEB_PRIMARY_SOURCE_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveResearcherWebPrimarySourceContract();
    const slice = runResearcherWebPrimarySourceFailureRecoverySlice();

    assert.equal(slice.atom, "P04-B03-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of RESEARCHER_WEB_PRIMARY_SOURCE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listResearcherWebPrimarySourceContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateResearcherWebPrimarySourceFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure/recovery/NO-GO paths with validator export and URL citation recovery", () => {
    const slice = runResearcherWebPrimarySourceFailureRecoverySlice();
    const probeIds = listResearcherWebPrimarySourceFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const invalidVersion = slice.failureRecoveryResults.find(
      r => r.id === "rwps.invalid_version_rejected",
    );
    assert.ok(invalidVersion);
    assert.equal(invalidVersion!.expected, "PASS");
    assert.equal(invalidVersion!.actual, "PASS");

    const malformedUrl = slice.failureRecoveryResults.find(r => r.id === "rwps.malformed_url_guard");
    assert.ok(malformedUrl);
    assert.equal(malformedUrl!.expected, "PASS");
    assert.equal(malformedUrl!.actual, "PASS");

    const researchBlockNonFatal = slice.failureRecoveryResults.find(
      r => r.id === "rwps.research_block_non_fatal",
    );
    assert.ok(researchBlockNonFatal);
    assert.equal(researchBlockNonFatal!.expected, "PASS");
    assert.equal(researchBlockNonFatal!.actual, "PASS");

    const structuredRecovery = slice.failureRecoveryResults.find(
      r => r.id === "rwps.structured_web_primary_source_recovery",
    );
    assert.ok(structuredRecovery);
    assert.equal(structuredRecovery!.expected, "PASS");
    assert.equal(structuredRecovery!.actual, "PASS");

    const researcherCriticalBlock = slice.failureRecoveryResults.find(
      r => r.id === "rwps.researcher_critical_block",
    );
    assert.ok(researcherCriticalBlock);
    assert.equal(researcherCriticalBlock!.expected, "PASS");
    assert.equal(researcherCriticalBlock!.actual, "PASS");

    const exportedValidator = slice.failureRecoveryResults.find(
      r => r.id === "rwps.exported_web_primary_source_validator",
    );
    assert.ok(exportedValidator);
    assert.equal(exportedValidator!.expected, "PASS");
    assert.equal(exportedValidator!.actual, "PASS");
  });
});

describe("Forge Researcher Web Primary-Source Evidence — P04-B03-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadResearcherWebPrimarySourceBaseline();
    const contract = getActiveResearcherWebPrimarySourceContract();
    const probeIds = listResearcherWebPrimarySourceFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildResearcherWebPrimarySourceProbeEvidence(
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
      return buildResearcherWebPrimarySourceProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildResearcherWebPrimarySourceProvenance(
      "run-rwps-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P04-B03-A06",
        sliceCategories: RESEARCHER_WEB_PRIMARY_SOURCE_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildResearcherWebPrimarySourceRunRecord(provenance, evidence, telemetry);
    const validation = validateResearcherWebPrimarySourceEvidenceRunRecord(record, contract);

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
    const contract = getActiveResearcherWebPrimarySourceContract();
    const slice = runResearcherWebPrimarySourceEvidenceSlice();

    assert.equal(slice.atom, "P04-B03-A06");
    assert.equal(slice.evidenceProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.recordValidation.valid, true, slice.recordValidation.issues.map(i => i.detail).join("\n"));

    for (const category of RESEARCHER_WEB_PRIMARY_SOURCE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listResearcherWebPrimarySourceContractProbesByCategory(
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
    assert.equal(record.provenance.sliceAtom, "P04-B03-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_RESEARCHER_WEB_PRIMARY_SOURCE_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a07");
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

    const researchBlockNonFatal = record.evidence.find(e => e.probeId === "rwps.research_block_non_fatal");
    assert.ok(researchBlockNonFatal);
    assert.equal(researchBlockNonFatal!.aligned, true);
    assert.equal(researchBlockNonFatal!.expected, "PASS");
    assert.equal(researchBlockNonFatal!.actual, "PASS");
    assert.equal(researchBlockNonFatal!.disposition, "recovery");
  });

  it("records evidence, telemetry and provenance for full web primary-source run", () => {
    const contract = getActiveResearcherWebPrimarySourceContract();
    const record = runResearcherWebPrimarySourceProbesWithRecord();
    const validation = validateResearcherWebPrimarySourceRunRecord(record, contract);

    assert.equal(record.evidence.length, 23);
    assert.equal(record.telemetry.length, 23);
    assert.equal(record.provenance.totalProbes, 23);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a07");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 23);
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveResearcherWebPrimarySourceContract();
    const record = runResearcherWebPrimarySourceFailureRecoverySliceWithRecord();
    const validation = validateResearcherWebPrimarySourceEvidenceRunRecord(record, contract);

    assert.equal(record.evidence.length, 6);
    assert.equal(record.provenance.sliceAtom, "P04-B03-A06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
  });
});
