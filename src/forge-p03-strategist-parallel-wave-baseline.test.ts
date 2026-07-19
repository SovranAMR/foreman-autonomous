import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistParallelWaveBaseline,
  runStrategistParallelWaveProbes,
  validateStrategistParallelWaveBaseline,
  summarizeStrategistParallelWaveMatrix,
  listStrategistParallelWaveProbesByExpected,
  listStrategistParallelWaveKnownGaps,
  STRATEGIST_PARALLEL_WAVE_CATEGORIES,
} from "./forge-p03-strategist-parallel-wave.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Parallel Wave — P03-B07-A01", () => {
  it("loads versioned parallel wave baseline aligned with P03-B06 block gate handoff", () => {
    const fixture = loadStrategistParallelWaveBaseline();
    const validation = validateStrategistParallelWaveBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P03-B07-A01");
    assert.equal(fixture.contractAtom, "P03-B07-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P03-B06-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.resourceBudgetProbeCount, 27);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 27);
  });

  it("measures parallel wave probes with documented FAIL gaps from B06 sealed handoff", () => {
    const results = runStrategistParallelWaveProbes();
    const summary = summarizeStrategistParallelWaveMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 27);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listStrategistParallelWaveProbesByExpected(
      "FAIL",
      loadStrategistParallelWaveBaseline(),
    );
    assert.equal(documentedFail.length, 6);
    assert.ok(documentedFail.some(p => p.id === "swave.prompt_parallel_wave_plan"));
    assert.ok(documentedFail.some(p => p.id === "swave.orchestrator_pre_exec_wave_gate"));
    assert.ok(documentedFail.some(p => p.id === "swave.exported_wave_validator"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of STRATEGIST_PARALLEL_WAVE_CATEGORIES) {
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

  it("documents parallel wave gaps as measurable baseline debt", () => {
    const gaps = listStrategistParallelWaveKnownGaps(runStrategistParallelWaveProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "swave.exported_wave_validator",
      "swave.nogo_invalid_wave_plan",
      "swave.orchestrator_atom_waves",
      "swave.orchestrator_pre_exec_wave_gate",
      "swave.parser_wave_plan_fields",
      "swave.prompt_parallel_wave_plan",
    ]);
    assert.ok(
      gaps.every(g => STRATEGIST_PARALLEL_WAVE_CATEGORIES.includes(g.category)),
      "documented gaps are parallel wave probes",
    );
  });
});
