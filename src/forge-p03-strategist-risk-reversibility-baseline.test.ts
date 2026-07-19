import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistRiskReversibilityBaseline,
  runStrategistRiskReversibilityProbes,
  validateStrategistRiskReversibilityBaseline,
  summarizeStrategistRiskReversibilityMatrix,
  listStrategistRiskReversibilityProbesByExpected,
  listStrategistRiskReversibilityKnownGaps,
  STRATEGIST_RISK_REVERSIBILITY_CATEGORIES,
} from "./forge-p03-strategist-risk-reversibility.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Risk Reversibility — P03-B05-A01", () => {
  it("loads versioned risk reversibility baseline aligned with P03-B04 block gate handoff", () => {
    const fixture = loadStrategistRiskReversibilityBaseline();
    const validation = validateStrategistRiskReversibilityBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P03-B05-A01");
    assert.equal(fixture.contractAtom, "P03-B05-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P03-B04-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.dependencyDagProbeCount, 27);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 27);
  });

  it("measures risk reversibility probes with documented FAIL gaps from B04 sealed handoff", () => {
    const results = runStrategistRiskReversibilityProbes();
    const summary = summarizeStrategistRiskReversibilityMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 27);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listStrategistRiskReversibilityProbesByExpected(
      "FAIL",
      loadStrategistRiskReversibilityBaseline(),
    );
    assert.equal(documentedFail.length, 6);
    assert.ok(documentedFail.some(p => p.id === "srisk.parser_risk_plan_fields"));
    assert.ok(documentedFail.some(p => p.id === "srisk.nogo_irreversible_halt"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of STRATEGIST_RISK_REVERSIBILITY_CATEGORIES) {
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

  it("documents risk reversibility gaps as measurable baseline debt", () => {
    const gaps = listStrategistRiskReversibilityKnownGaps(runStrategistRiskReversibilityProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "srisk.exported_orchestrator_risk_validator",
      "srisk.nogo_irreversible_halt",
      "srisk.orchestrator_pre_exec_risk_gate",
      "srisk.parser_risk_plan_fields",
      "srisk.prompt_atom_blast_radius",
      "srisk.prompt_decompose_risk_plan",
    ]);
    assert.ok(
      gaps.every(g => STRATEGIST_RISK_REVERSIBILITY_CATEGORIES.includes(g.category)),
      "documented gaps are risk reversibility probes",
    );
  });
});
