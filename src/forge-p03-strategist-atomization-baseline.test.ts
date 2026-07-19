import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistAtomizationBaseline,
  runStrategistAtomizationProbes,
  validateStrategistAtomizationBaseline,
  summarizeStrategistAtomizationMatrix,
  listStrategistAtomizationProbesByExpected,
  listStrategistAtomizationKnownGaps,
  getStrategistAtomizationA01ExpectedFailCount,
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
    assert.equal(fixture.probes.length, 23);
  });

  it("measures atomization probes with documented FAIL gaps from P03-B02 sealed handoff", () => {
    const results = runStrategistAtomizationProbes();
    const summary = summarizeStrategistAtomizationMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listStrategistAtomizationProbesByExpected(
      "FAIL",
      loadStrategistAtomizationBaseline(),
    );
    assert.equal(documentedFail.length, getStrategistAtomizationA01ExpectedFailCount());
    assert.ok(documentedFail.some(p => p.id === "satom.structured_atom_recovery"));
    assert.ok(documentedFail.some(p => p.id === "satom.empty_atomize_boundary"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

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

  it("documents remaining atomization gaps as measurable baseline debt", () => {
    const gaps = listStrategistAtomizationKnownGaps(runStrategistAtomizationProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "satom.empty_atomize_boundary",
      "satom.malformed_atomize_guard",
      "satom.structured_atom_recovery",
      "satom.whitespace_atomize_boundary",
    ]);
    assert.ok(
      gaps.every(g => STRATEGIST_ATOMIZATION_CATEGORIES.includes(g.category)),
      "documented gaps are atomization probes",
    );
  });
});
