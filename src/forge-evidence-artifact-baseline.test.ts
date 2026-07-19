import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadEvidenceArtifactBaseline,
  runEvidenceArtifactProbes,
  validateEvidenceArtifactBaseline,
  summarizeEvidenceArtifactMatrix,
  listEvidenceArtifactProbesByExpected,
  listEvidenceArtifactKnownGaps,
  EVIDENCE_ARTIFACT_CATEGORIES,
} from "./forge-evidence-artifact.probe.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Evidence Artifact Schema — P01-B08-A01", () => {
  it("loads versioned evidence artifact baseline aligned with B07 handoff", () => {
    const fixture = loadEvidenceArtifactBaseline();
    const validation = validateEvidenceArtifactBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P01-B08-A01");
    assert.equal(fixture.contractAtom, "P01-B08-A05");
    assert.equal(fixture.sourceReproducibleFixture.probeCount, 21);
    assert.equal(fixture.sourceReproducibleFixture.reproducibleFixtureCategories, 8);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 25);
  });

  it("measures evidence artifact probes with documented FAIL gaps from B07 sealed handoff", () => {
    const results = runEvidenceArtifactProbes();
    const summary = summarizeEvidenceArtifactMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 25);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listEvidenceArtifactProbesByExpected(
      "FAIL",
      loadEvidenceArtifactBaseline(),
    );
    assert.equal(documentedFail.length, 7);
    assert.ok(documentedFail.some(p => p.id === "eva.unified_category_dimension"));
    assert.ok(documentedFail.some(p => p.id === "eva.unified_schema_type_export"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of EVIDENCE_ARTIFACT_CATEGORIES) {
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

  it("documents evidence artifact schema gaps as measurable baseline debt", () => {
    const gaps = listEvidenceArtifactKnownGaps(runEvidenceArtifactProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "eva.cross_block_normalizer",
      "eva.nogo_cross_block_mismatch_gate",
      "eva.nogo_schema_drift_gate",
      "eva.recovery_baseline_reset",
      "eva.recovery_missing_schema_fallback",
      "eva.unified_category_dimension",
      "eva.unified_schema_type_export",
    ]);
    assert.ok(
      gaps.every(g => EVIDENCE_ARTIFACT_CATEGORIES.includes(g.category)),
      "documented gaps are evidence artifact schema probes",
    );
  });
});
