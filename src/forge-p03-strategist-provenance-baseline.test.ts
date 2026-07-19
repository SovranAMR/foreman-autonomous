import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistProvenanceBaseline,
  runStrategistProvenanceProbes,
  validateStrategistProvenanceBaseline,
  summarizeStrategistProvenanceMatrix,
  listStrategistProvenanceProbesByExpected,
  listStrategistProvenanceKnownGaps,
  STRATEGIST_PROVENANCE_CATEGORIES,
} from "./forge-p03-strategist-provenance.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Plan Provenance — P03-B09-A01", () => {
  it("loads versioned provenance baseline aligned with P03-B08 block gate handoff", () => {
    const fixture = loadStrategistProvenanceBaseline();
    const validation = validateStrategistProvenanceBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P03-B09-A01");
    assert.equal(fixture.contractAtom, "P03-B09-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P03-B08-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.replanProbeCount, 28);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 28);
  });

  it("measures provenance probes with documented FAIL gaps from B08 sealed handoff", () => {
    const results = runStrategistProvenanceProbes();
    const summary = summarizeStrategistProvenanceMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 28);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listStrategistProvenanceProbesByExpected(
      "FAIL",
      loadStrategistProvenanceBaseline(),
    );
    assert.equal(documentedFail.length, 6);
    assert.ok(documentedFail.some(p => p.id === "sprov.prompt_plan_provenance"));
    assert.ok(documentedFail.some(p => p.id === "sprov.orchestrator_pre_exec_drift_gate"));
    assert.ok(documentedFail.some(p => p.id === "sprov.parser_provenance_fields"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of STRATEGIST_PROVENANCE_CATEGORIES) {
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

  it("documents provenance gaps as measurable baseline debt", () => {
    const gaps = listStrategistProvenanceKnownGaps(runStrategistProvenanceProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "sprov.exported_plan_drift_validator",
      "sprov.nogo_undetected_drift",
      "sprov.orchestrator_pre_exec_drift_gate",
      "sprov.parser_provenance_fields",
      "sprov.plan_provenance_graph",
      "sprov.prompt_plan_provenance",
    ]);
    assert.ok(
      gaps.every(g => STRATEGIST_PROVENANCE_CATEGORIES.includes(g.category)),
      "documented gaps are provenance probes",
    );
  });
});
