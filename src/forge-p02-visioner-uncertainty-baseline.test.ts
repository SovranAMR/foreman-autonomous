import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerUncertaintyBaseline,
  runVisionerUncertaintyProbes,
  validateVisionerUncertaintyBaseline,
  summarizeVisionerUncertaintyMatrix,
  listVisionerUncertaintyProbesByExpected,
  listVisionerUncertaintyKnownGaps,
  VISIONER_UNCERTAINTY_CATEGORIES,
} from "./forge-p02-visioner-uncertainty.probe.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Uncertainty — P02-B06-A01", () => {
  it("loads versioned visioner uncertainty baseline aligned with P02-B05 block gate handoff", () => {
    const fixture = loadVisionerUncertaintyBaseline();
    const validation = validateVisionerUncertaintyBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P02-B06-A01");
    assert.equal(fixture.contractAtom, "P02-B06-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P02-B05-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures visioner uncertainty probes with documented FAIL gaps from P02-B05 sealed handoff", () => {
    const results = runVisionerUncertaintyProbes();
    const summary = summarizeVisionerUncertaintyMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listVisionerUncertaintyProbesByExpected(
      "FAIL",
      loadVisionerUncertaintyBaseline(),
    );
    assert.equal(documentedFail.length, 1);
    assert.ok(documentedFail.some(p => p.id === "vunc.structured_clarification_recovery"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of VISIONER_UNCERTAINTY_CATEGORIES) {
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

  it("documents remaining visioner uncertainty gaps as measurable baseline debt", () => {
    const gaps = listVisionerUncertaintyKnownGaps(runVisionerUncertaintyProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, ["vunc.structured_clarification_recovery"]);
    assert.ok(
      gaps.every(g => VISIONER_UNCERTAINTY_CATEGORIES.includes(g.category)),
      "documented gaps are visioner uncertainty probes",
    );
  });
});
