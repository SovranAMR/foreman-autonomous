import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherWebPrimarySourceBaseline,
  runResearcherWebPrimarySourceProbes,
  runResearcherWebPrimarySourceProductionSlice,
  validateResearcherWebPrimarySourceBaseline,
  validateResearcherWebPrimarySourceProbeMatrix,
  summarizeResearcherWebPrimarySourceMatrix,
  listResearcherWebPrimarySourceProbesByExpected,
  listResearcherWebPrimarySourceKnownGaps,
  assessWebPrimarySourceInputBoundary,
  validateWebPrimarySourceCollection,
  recoverWebPrimarySourceEvidence,
  getActiveResearcherWebPrimarySourceContract,
  RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORIES,
  RESEARCHER_WEB_PRIMARY_SOURCE_URL_MAX_LENGTH,
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
