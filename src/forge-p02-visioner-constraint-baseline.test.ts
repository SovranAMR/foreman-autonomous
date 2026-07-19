import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerConstraintBaseline,
  runVisionerConstraintProbes,
  validateVisionerConstraintBaseline,
  summarizeVisionerConstraintMatrix,
  listVisionerConstraintProbesByExpected,
  listVisionerConstraintKnownGaps,
  VISIONER_CONSTRAINT_CATEGORIES,
} from "./forge-p02-visioner-constraint.probe.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Constraint — P02-B02-A01", () => {
  it("loads versioned visioner constraint baseline aligned with P02-B01 block gate handoff", () => {
    const fixture = loadVisionerConstraintBaseline();
    const validation = validateVisionerConstraintBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P02-B02-A01");
    assert.equal(fixture.contractAtom, "P02-B02-A05");
    assert.equal(fixture.sourceBlockGate.atom, "P02-B01-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures visioner constraint probes with documented FAIL gaps from P02-B01 sealed handoff", () => {
    const results = runVisionerConstraintProbes();
    const summary = summarizeVisionerConstraintMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listVisionerConstraintProbesByExpected(
      "FAIL",
      loadVisionerConstraintBaseline(),
    );
    assert.equal(documentedFail.length, 1);
    assert.ok(documentedFail.some(p => p.id === "vcon.structured_constraint_recovery"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of VISIONER_CONSTRAINT_CATEGORIES) {
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

  it("documents remaining visioner constraint gaps as measurable baseline debt", () => {
    const gaps = listVisionerConstraintKnownGaps(runVisionerConstraintProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, ["vcon.structured_constraint_recovery"]);
    assert.ok(
      gaps.every(g => VISIONER_CONSTRAINT_CATEGORIES.includes(g.category)),
      "documented gaps are visioner constraint probes",
    );
  });
});
