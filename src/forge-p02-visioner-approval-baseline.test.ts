import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerApprovalBaseline,
  runVisionerApprovalProbes,
  validateVisionerApprovalBaseline,
  summarizeVisionerApprovalMatrix,
  listVisionerApprovalProbesByExpected,
  listVisionerApprovalKnownGaps,
  VISIONER_APPROVAL_CATEGORIES,
} from "./forge-p02-visioner-approval.probe.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Approval — P02-B09-A01", () => {
  it("loads versioned visioner approval baseline aligned with P02-B08 block gate handoff", () => {
    const fixture = loadVisionerApprovalBaseline();
    const validation = validateVisionerApprovalBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P02-B09-A01");
    assert.equal(fixture.contractAtom, "P02-B09-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P02-B08-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures visioner approval probes with documented FAIL gaps from P02-B08 sealed handoff", () => {
    const results = runVisionerApprovalProbes();
    const summary = summarizeVisionerApprovalMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listVisionerApprovalProbesByExpected(
      "FAIL",
      loadVisionerApprovalBaseline(),
    );
    assert.equal(documentedFail.length, 1);
    assert.ok(documentedFail.some(p => p.id === "vapp.structured_steering_recovery"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of VISIONER_APPROVAL_CATEGORIES) {
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

  it("documents remaining visioner approval gaps as measurable baseline debt", () => {
    const gaps = listVisionerApprovalKnownGaps(runVisionerApprovalProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, ["vapp.structured_steering_recovery"]);
    assert.ok(
      gaps.every(g => VISIONER_APPROVAL_CATEGORIES.includes(g.category)),
      "documented gaps are visioner approval probes",
    );
  });
});
