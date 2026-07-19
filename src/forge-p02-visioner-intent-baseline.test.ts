import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerIntentBaseline,
  runVisionerIntentProbes,
  validateVisionerIntentBaseline,
  summarizeVisionerIntentMatrix,
  listVisionerIntentProbesByExpected,
  listVisionerIntentKnownGaps,
  VISIONER_INTENT_CATEGORIES,
} from "./forge-p02-visioner-intent.probe.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Intent — P02-B01-A01", () => {
  it("loads versioned visioner intent baseline aligned with P01 phase gate handoff", () => {
    const fixture = loadVisionerIntentBaseline();
    const validation = validateVisionerIntentBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P02-B01-A01");
    assert.equal(fixture.contractAtom, "P02-B01-A05");
    assert.equal(fixture.sourcePhaseGate.atom, "P01-PHASE-GATE");
    assert.equal(fixture.sourcePhaseGate.sealedBlockCount, 9);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 20);
  });

  it("measures visioner intent probes with documented FAIL gaps from P01 sealed handoff", () => {
    const results = runVisionerIntentProbes();
    const summary = summarizeVisionerIntentMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 20);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listVisionerIntentProbesByExpected(
      "FAIL",
      loadVisionerIntentBaseline(),
    );
    assert.equal(documentedFail.length, 2);
    assert.ok(documentedFail.some(p => p.id === "vint.structured_intent_recovery"));
    assert.ok(documentedFail.some(p => p.id === "vint.intent_ambiguity_nogo"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of VISIONER_INTENT_CATEGORIES) {
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

  it("documents remaining visioner intent gaps as measurable baseline debt", () => {
    const gaps = listVisionerIntentKnownGaps(runVisionerIntentProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "vint.intent_ambiguity_nogo",
      "vint.structured_intent_recovery",
    ]);
    assert.ok(
      gaps.every(g => VISIONER_INTENT_CATEGORIES.includes(g.category)),
      "documented gaps are visioner intent probes",
    );
  });
});
