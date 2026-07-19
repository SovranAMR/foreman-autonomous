import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherBenchmarkPriorArtBaseline,
  runResearcherBenchmarkPriorArtProbes,
  validateResearcherBenchmarkPriorArtBaseline,
  summarizeResearcherBenchmarkPriorArtMatrix,
  listResearcherBenchmarkPriorArtProbesByExpected,
  listResearcherBenchmarkPriorArtKnownGaps,
  assessBenchmarkPriorArtInputBoundary,
  validateBenchmarkPriorArtCollection,
  RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES,
  RESEARCHER_BENCHMARK_PRIOR_ART_TOPIC_MAX_LENGTH,
} from "./forge-p04-researcher-benchmark-prior-art.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Researcher Benchmark Prior-Art — P04-B04-A01", () => {
  it("loads versioned benchmark prior-art baseline aligned with P04-B03 block gate handoff", () => {
    const fixture = loadResearcherBenchmarkPriorArtBaseline();
    const validation = validateResearcherBenchmarkPriorArtBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P04-B04-A01");
    assert.equal(fixture.contractAtom, "P04-B04-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P04-B03-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures benchmark prior-art probes with documented FAIL gaps from P04-B03 sealed handoff", () => {
    const results = runResearcherBenchmarkPriorArtProbes();
    const summary = summarizeResearcherBenchmarkPriorArtMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listResearcherBenchmarkPriorArtProbesByExpected(
      "FAIL",
      loadResearcherBenchmarkPriorArtBaseline(),
    );
    assert.equal(documentedFail.length, 1);
    assert.ok(
      documentedFail.some(p => p.id === "rbpa.structured_benchmark_prior_art_recovery"),
    );

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES) {
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

  it("documents remaining benchmark prior-art gaps as measurable baseline debt", () => {
    const gaps = listResearcherBenchmarkPriorArtKnownGaps(runResearcherBenchmarkPriorArtProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, ["rbpa.structured_benchmark_prior_art_recovery"]);
    assert.ok(
      gaps.every(g => RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES.includes(g.category)),
      "documented gaps are benchmark prior-art probes",
    );
  });

  it("assessBenchmarkPriorArtInputBoundary rejects empty and null-byte topics", () => {
    const empty = assessBenchmarkPriorArtInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessBenchmarkPriorArtInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessBenchmarkPriorArtInputBoundary("task\0input");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessBenchmarkPriorArtInputBoundary truncates oversized topics", () => {
    const longTopic = "x".repeat(RESEARCHER_BENCHMARK_PRIOR_ART_TOPIC_MAX_LENGTH + 500);
    const truncated = assessBenchmarkPriorArtInputBoundary(longTopic);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedTopic.length, RESEARCHER_BENCHMARK_PRIOR_ART_TOPIC_MAX_LENGTH);
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("validateBenchmarkPriorArtCollection accepts hits with source and text citation fields", () => {
    const validation = validateBenchmarkPriorArtCollection("agent orchestration benchmarks", [
      {
        source: "https://example.com/benchmark",
        text: "Prior-art benchmark excerpt with measurable regression criteria",
        title: "Example Benchmark",
      },
    ]);

    assert.equal(validation.valid, true, validation.issues.join("; "));
    assert.equal(validation.hitCount, 1);
  });

  it("validateBenchmarkPriorArtCollection rejects zero-hit topics", () => {
    const validation = validateBenchmarkPriorArtCollection("valid topic", []);
    assert.equal(validation.valid, false);
    assert.ok(validation.issues.some(issue => issue.includes("zero benchmark prior-art hits")));
  });
});
