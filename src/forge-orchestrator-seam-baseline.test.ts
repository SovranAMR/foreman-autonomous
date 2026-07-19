import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadOrchestratorSeamBaseline,
  runOrchestratorSeamProbes,
  validateOrchestratorSeamBaseline,
  summarizeOrchestratorSeamMatrix,
  listOrchestratorSeamProbesByExpected,
  listOrchestratorSeamKnownGaps,
  ORCHESTRATOR_SEAM_CATEGORIES,
} from "./forge-orchestrator-seam.probe.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Orchestrator Seam — P01-B09-A01", () => {
  it("loads versioned orchestrator seam baseline aligned with B08 handoff", () => {
    const fixture = loadOrchestratorSeamBaseline();
    const validation = validateOrchestratorSeamBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P01-B09-A01");
    assert.equal(fixture.contractAtom, "P01-B09-A05");
    assert.equal(fixture.sourceEvidenceArtifact.probeCount, 25);
    assert.equal(fixture.sourceEvidenceArtifact.evidenceArtifactCategories, 11);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures orchestrator seam probes with documented FAIL gaps from B08 sealed handoff", () => {
    const results = runOrchestratorSeamProbes();
    const summary = summarizeOrchestratorSeamMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listOrchestratorSeamProbesByExpected(
      "FAIL",
      loadOrchestratorSeamBaseline(),
    );
    assert.equal(documentedFail.length, 7);
    assert.ok(documentedFail.some(p => p.id === "oseam.guard_methods_inventory"));
    assert.ok(documentedFail.some(p => p.id === "oseam.extracted_seam_interface"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of ORCHESTRATOR_SEAM_CATEGORIES) {
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

  it("documents orchestrator seam gaps as measurable baseline debt", () => {
    const gaps = listOrchestratorSeamKnownGaps(runOrchestratorSeamProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "oseam.extracted_seam_interface",
      "oseam.guard_methods_inventory",
      "oseam.nogo_seam_inventory_drift",
      "oseam.nogo_verification_method_mismatch",
      "oseam.recovery_missing_handoff_fallback",
      "oseam.recovery_seam_state_reset",
      "oseam.unified_lazy_import_registry",
    ]);
    assert.ok(
      gaps.every(g => ORCHESTRATOR_SEAM_CATEGORIES.includes(g.category)),
      "documented gaps are orchestrator seam probes",
    );
  });
});
