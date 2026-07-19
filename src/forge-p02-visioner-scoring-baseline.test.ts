import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerScoringBaseline,
  runVisionerScoringProbes,
  validateVisionerScoringBaseline,
  summarizeVisionerScoringMatrix,
  listVisionerScoringProbesByExpected,
  listVisionerScoringKnownGaps,
  VISIONER_SCORING_CATEGORIES,
} from "./forge-p02-visioner-scoring.probe.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Scoring — P02-B08-A01", () => {
  it("loads versioned visioner scoring baseline aligned with P02-B07 block gate handoff", () => {
    const fixture = loadVisionerScoringBaseline();
    const validation = validateVisionerScoringBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P02-B08-A01");
    assert.equal(fixture.contractAtom, "P02-B08-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P02-B07-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.visionerAlternativeProbeCount, 23);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures visioner scoring probes with full alignment after A03 recovery slice", () => {
    const results = runVisionerScoringProbes();
    const summary = summarizeVisionerScoringMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listVisionerScoringProbesByExpected(
      "FAIL",
      loadVisionerScoringBaseline(),
    );
    assert.equal(documentedFail.length, 0);

    for (const cat of VISIONER_SCORING_CATEGORIES) {
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

  it("documents zero remaining visioner scoring gaps after structured recovery slice", () => {
    const gaps = listVisionerScoringKnownGaps(runVisionerScoringProbes());
    assert.deepEqual(gaps.map(g => g.id).sort(), []);
  });
});
