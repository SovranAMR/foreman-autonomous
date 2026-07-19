import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherContradictionFreshnessBaseline,
  runResearcherContradictionFreshnessProbes,
  validateResearcherContradictionFreshnessBaseline,
  summarizeResearcherContradictionFreshnessMatrix,
  listResearcherContradictionFreshnessProbesByExpected,
  listResearcherContradictionFreshnessKnownGaps,
  assessContradictionFreshnessInputBoundary,
  validateContradictionFreshnessCollection,
  recoverContradictionFreshnessEvidence,
  RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES,
  RESEARCHER_CONTRADICTION_FRESHNESS_INPUT_MAX_LENGTH,
} from "./forge-p04-researcher-contradiction-freshness.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Researcher Contradiction Freshness — P04-B06-A01", () => {
  it("loads versioned contradiction freshness baseline aligned with P04-B05 block gate handoff", () => {
    const fixture = loadResearcherContradictionFreshnessBaseline();
    const validation = validateResearcherContradictionFreshnessBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P04-B06-A01");
    assert.equal(fixture.contractAtom, "P04-B06-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P04-B05-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures contradiction freshness probes with documented FAIL gaps from B05 sealed handoff", () => {
    const results = runResearcherContradictionFreshnessProbes();
    const summary = summarizeResearcherContradictionFreshnessMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listResearcherContradictionFreshnessProbesByExpected(
      "FAIL",
      loadResearcherContradictionFreshnessBaseline(),
    );
    assert.equal(documentedFail.length, 2);
    assert.ok(documentedFail.some(p => p.id === "rcfr.resolve_contradiction_conflicts"));
    assert.ok(documentedFail.some(p => p.id === "rcfr.exported_freshness_validator"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES) {
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

  it("documents contradiction freshness gaps as measurable baseline debt", () => {
    const gaps = listResearcherContradictionFreshnessKnownGaps(
      runResearcherContradictionFreshnessProbes(),
    );
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "rcfr.exported_freshness_validator",
      "rcfr.resolve_contradiction_conflicts",
    ]);
    assert.ok(
      gaps.every(g => RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES.includes(g.category)),
      "documented gaps are contradiction freshness probes",
    );
  });

  it("assessContradictionFreshnessInputBoundary rejects empty and null-byte evidence inputs", () => {
    const empty = assessContradictionFreshnessInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessContradictionFreshnessInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessContradictionFreshnessInputBoundary("evidence\0parse");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessContradictionFreshnessInputBoundary truncates oversized evidence inputs", () => {
    const longInput = "x".repeat(RESEARCHER_CONTRADICTION_FRESHNESS_INPUT_MAX_LENGTH + 500);
    const truncated = assessContradictionFreshnessInputBoundary(longInput);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(
      truncated.normalizedInput.length,
      RESEARCHER_CONTRADICTION_FRESHNESS_INPUT_MAX_LENGTH,
    );
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("validateContradictionFreshnessCollection accepts findings with claim and source citations", () => {
    const validation = validateContradictionFreshnessCollection("agent orchestration freshness", [
      {
        claim: "Tool-calling latency improved with caching",
        source: "https://example.com/benchmark",
        freshness: "pm",
      },
    ]);

    assert.equal(validation.valid, true, validation.issues.join("; "));
    assert.equal(validation.findingCount, 1);
  });

  it("recoverContradictionFreshnessEvidence restructures malformed parse into actionable resolution plan", () => {
    const recovery = recoverContradictionFreshnessEvidence(
      'CONTRADICTION: claim A vs claim B\nSTALE SOURCE: https://legacy.example.com/report (2020)',
      { topic: "contradiction freshness" },
    );

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.resolutionPlan.contradictions.length >= 1);
    assert.ok(recovery.resolutionPlan.staleSources.length >= 1);
  });
});
