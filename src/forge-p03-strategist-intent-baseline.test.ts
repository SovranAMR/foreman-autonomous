import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistIntentBaseline,
  runStrategistIntentProbes,
  validateStrategistIntentBaseline,
  summarizeStrategistIntentMatrix,
  listStrategistIntentProbesByExpected,
  listStrategistIntentKnownGaps,
  STRATEGIST_INTENT_CATEGORIES,
} from "./forge-p03-strategist-intent.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Intent — P03-B01-A01", () => {
  it("loads versioned strategist intent baseline aligned with P02 phase gate handoff", () => {
    const fixture = loadStrategistIntentBaseline();
    const validation = validateStrategistIntentBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P03-B01-A01");
    assert.equal(fixture.contractAtom, "P03-B01-A05");
    assert.equal(fixture.sourcePhaseGate.atom, "P02-PHASE-GATE");
    assert.equal(fixture.sourcePhaseGate.sealedBlockCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures strategist intent probes with documented FAIL gaps from P02 sealed handoff", () => {
    const results = runStrategistIntentProbes();
    const summary = summarizeStrategistIntentMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listStrategistIntentProbesByExpected(
      "FAIL",
      loadStrategistIntentBaseline(),
    );
    assert.equal(documentedFail.length, 1);
    assert.ok(documentedFail.some(p => p.id === "sint.structured_decompose_recovery"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of STRATEGIST_INTENT_CATEGORIES) {
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

  it("documents remaining strategist intent gaps as measurable baseline debt", () => {
    const gaps = listStrategistIntentKnownGaps(runStrategistIntentProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, ["sint.structured_decompose_recovery"]);
    assert.ok(
      gaps.every(g => STRATEGIST_INTENT_CATEGORIES.includes(g.category)),
      "documented gaps are strategist intent probes",
    );
  });
});
