import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistProvenanceBaseline,
  runStrategistProvenanceProbes,
  validateStrategistProvenanceBaseline,
  summarizeStrategistProvenanceMatrix,
  listStrategistProvenanceProbesByExpected,
  listStrategistProvenanceKnownGaps,
  STRATEGIST_PROVENANCE_CATEGORIES,
} from "./forge-p03-strategist-provenance.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Plan Provenance — P03-B09-A01", () => {
  it("loads versioned provenance baseline aligned with P03-B08 block gate handoff", () => {
    const fixture = loadStrategistProvenanceBaseline();
    const validation = validateStrategistProvenanceBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P03-B09-A01");
    assert.equal(fixture.contractAtom, "P03-B09-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P03-B08-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.replanProbeCount, 28);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 28);
  });

  it("measures provenance probes with full alignment after A03 production slice", () => {
    const results = runStrategistProvenanceProbes();
    const summary = summarizeStrategistProvenanceMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 28);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listStrategistProvenanceProbesByExpected(
      "FAIL",
      loadStrategistProvenanceBaseline(),
    );
    assert.equal(documentedFail.length, 0);

    for (const cat of STRATEGIST_PROVENANCE_CATEGORIES) {
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

  it("documents provenance gaps as measurable baseline debt", () => {
    const gaps = listStrategistProvenanceKnownGaps(runStrategistProvenanceProbes());
    assert.deepEqual(gaps.map(g => g.id).sort(), []);
  });
});
