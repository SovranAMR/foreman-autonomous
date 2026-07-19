import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistReplanBaseline,
  runStrategistReplanProbes,
  validateStrategistReplanBaseline,
  summarizeStrategistReplanMatrix,
  listStrategistReplanProbesByExpected,
  listStrategistReplanKnownGaps,
  STRATEGIST_REPLAN_CATEGORIES,
} from "./forge-p03-strategist-replan.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Replan — P03-B08-A01", () => {
  it("loads versioned replan baseline aligned with P03-B07 block gate handoff", () => {
    const fixture = loadStrategistReplanBaseline();
    const validation = validateStrategistReplanBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P03-B08-A01");
    assert.equal(fixture.contractAtom, "P03-B08-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P03-B07-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.parallelWaveProbeCount, 27);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 28);
  });

  it("measures replan probes with documented FAIL gaps from B07 sealed handoff", () => {
    const results = runStrategistReplanProbes();
    const summary = summarizeStrategistReplanMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 28);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listStrategistReplanProbesByExpected(
      "FAIL",
      loadStrategistReplanBaseline(),
    );
    assert.equal(documentedFail.length, 0);

    for (const cat of STRATEGIST_REPLAN_CATEGORIES) {
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

  it("documents replan gaps as measurable baseline debt", () => {
    const gaps = listStrategistReplanKnownGaps(runStrategistReplanProbes());
    assert.deepEqual(gaps.map(g => g.id).sort(), []);
  });
});
