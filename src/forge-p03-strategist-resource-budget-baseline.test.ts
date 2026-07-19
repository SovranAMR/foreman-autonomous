import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistResourceBudgetBaseline,
  runStrategistResourceBudgetProbes,
  validateStrategistResourceBudgetBaseline,
  summarizeStrategistResourceBudgetMatrix,
  listStrategistResourceBudgetProbesByExpected,
  listStrategistResourceBudgetKnownGaps,
  STRATEGIST_RESOURCE_BUDGET_CATEGORIES,
} from "./forge-p03-strategist-resource-budget.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Resource Budget — P03-B06-A01", () => {
  it("loads versioned resource budget baseline aligned with P03-B05 block gate handoff", () => {
    const fixture = loadStrategistResourceBudgetBaseline();
    const validation = validateStrategistResourceBudgetBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P03-B06-A01");
    assert.equal(fixture.contractAtom, "P03-B06-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P03-B05-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.riskReversibilityProbeCount, 27);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 27);
  });

  it("measures resource budget probes with documented FAIL gaps from B05 sealed handoff", () => {
    const results = runStrategistResourceBudgetProbes();
    const summary = summarizeStrategistResourceBudgetMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 27);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listStrategistResourceBudgetProbesByExpected(
      "FAIL",
      loadStrategistResourceBudgetBaseline(),
    );
    assert.equal(documentedFail.length, 6);
    assert.ok(documentedFail.some(p => p.id === "sbudget.parser_resource_plan_fields"));
    assert.ok(documentedFail.some(p => p.id === "sbudget.exported_orchestrator_budget_validator"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of STRATEGIST_RESOURCE_BUDGET_CATEGORIES) {
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

  it("documents resource budget gaps as measurable baseline debt", () => {
    const gaps = listStrategistResourceBudgetKnownGaps(runStrategistResourceBudgetProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "sbudget.exported_orchestrator_budget_validator",
      "sbudget.nogo_budget_recovery_halt",
      "sbudget.orchestrator_pre_exec_budget_gate",
      "sbudget.parser_resource_plan_fields",
      "sbudget.prompt_atom_resource_estimate",
      "sbudget.prompt_decompose_resource_plan",
    ]);
    assert.ok(
      gaps.every(g => STRATEGIST_RESOURCE_BUDGET_CATEGORIES.includes(g.category)),
      "documented gaps are resource budget probes",
    );
  });
});
