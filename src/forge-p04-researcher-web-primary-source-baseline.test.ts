import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherWebPrimarySourceBaseline,
  runResearcherWebPrimarySourceProbes,
  validateResearcherWebPrimarySourceBaseline,
  summarizeResearcherWebPrimarySourceMatrix,
  listResearcherWebPrimarySourceProbesByExpected,
  listResearcherWebPrimarySourceKnownGaps,
  assessWebPrimarySourceInputBoundary,
  validateWebPrimarySourceCollection,
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

  it("measures web primary-source probes with documented FAIL gaps from P04-B02 sealed handoff", () => {
    const results = runResearcherWebPrimarySourceProbes();
    const summary = summarizeResearcherWebPrimarySourceMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listResearcherWebPrimarySourceProbesByExpected(
      "FAIL",
      loadResearcherWebPrimarySourceBaseline(),
    );
    assert.equal(documentedFail.length, 1);
    assert.ok(documentedFail.some(p => p.id === "rwps.structured_web_primary_source_recovery"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

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

  it("documents remaining web primary-source gaps as measurable baseline debt", () => {
    const gaps = listResearcherWebPrimarySourceKnownGaps(runResearcherWebPrimarySourceProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, ["rwps.structured_web_primary_source_recovery"]);
    assert.ok(
      gaps.every(g => RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORIES.includes(g.category)),
      "documented gaps are web primary-source probes",
    );
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
