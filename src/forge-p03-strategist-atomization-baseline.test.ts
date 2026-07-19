import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistAtomizationBaseline,
  runStrategistAtomizationProbes,
  validateStrategistAtomizationBaseline,
  summarizeStrategistAtomizationMatrix,
  listStrategistAtomizationProbesByExpected,
  listStrategistAtomizationKnownGaps,
  STRATEGIST_ATOMIZATION_CATEGORIES,
} from "./forge-p03-strategist-atomization.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Atomization — P03-B03-A01", () => {
  it("loads versioned atomization baseline aligned with P03-B02 block gate handoff", () => {
    const fixture = loadStrategistAtomizationBaseline();
    const validation = validateStrategistAtomizationBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P03-B03-A01");
    assert.equal(fixture.contractAtom, "P03-B03-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P03-B02-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 24);
  });

  it("measures atomization probes with full alignment after A03 recovery slice", () => {
    const results = runStrategistAtomizationProbes();
    const summary = summarizeStrategistAtomizationMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 24);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listStrategistAtomizationProbesByExpected(
      "FAIL",
      loadStrategistAtomizationBaseline(),
    );
    assert.equal(documentedFail.length, 0);

    for (const cat of STRATEGIST_ATOMIZATION_CATEGORIES) {
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

  it("documents zero remaining atomization gaps after structured recovery slice", () => {
    const gaps = listStrategistAtomizationKnownGaps(runStrategistAtomizationProbes());
    assert.deepEqual(gaps.map(g => g.id).sort(), []);
  });
});
