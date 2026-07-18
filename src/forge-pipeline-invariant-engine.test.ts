import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadPipelineInvariantEngineFixture,
  runPipelineInvariantEngineProbes,
  validatePipelineInvariantEngineFixture,
  summarizePipelineInvariantEngineMatrix,
  listPipelineInvariantEngineKnownGaps,
  listPipelineInvariantEngineProbesByExpected,
  PIPELINE_INVARIANT_ENGINE_CATEGORIES,
} from "./forge-pipeline-invariant-engine-harness.js";

function formatMismatchReport(mismatches: { id: string; expected: string; actual: string; detail: string }[]): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Pipeline Invariant Engine — P01-B05-A01", () => {
  it("loads versioned pipeline invariant engine fixture aligned with B04 handoff", () => {
    const fixture = loadPipelineInvariantEngineFixture();
    const validation = validatePipelineInvariantEngineFixture(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P01-B05-A01");
    assert.equal(fixture.contractAtom, "P01-B05-A05");
    assert.equal(fixture.sourcePhaseEventSchema.probeCount, 35);
    assert.equal(fixture.sourcePhaseEventSchema.schemaCategories, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures orchestrator pipeline invariant probes with documented FAIL gaps", () => {
    const results = runPipelineInvariantEngineProbes();
    const summary = summarizePipelineInvariantEngineMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listPipelineInvariantEngineProbesByExpected("FAIL", loadPipelineInvariantEngineFixture());
    assert.equal(documentedFail.length, 7);
    assert.ok(documentedFail.some(p => p.id === "inv.runtime_phase_balance_checker"));
    assert.ok(documentedFail.some(p => p.id === "inv.event_order_validator"));
    assert.ok(documentedFail.some(p => p.id === "inv.reflection_cadence_invariant"));
    assert.ok(documentedFail.some(p => p.id === "inv.state_phase_coherence_checker"));
    assert.ok(documentedFail.some(p => p.id === "inv.block_invariant_module"));
    assert.ok(documentedFail.some(p => p.id === "inv.verification_gate_invariant"));
    assert.ok(documentedFail.some(p => p.id === "inv.invariant_engine_orchestrator_wired"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of PIPELINE_INVARIANT_ENGINE_CATEGORIES) {
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

  it("documents runtime invariant engine gaps as measurable baseline debt", () => {
    const gaps = listPipelineInvariantEngineKnownGaps();
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "inv.block_invariant_module",
      "inv.event_order_validator",
      "inv.invariant_engine_orchestrator_wired",
      "inv.reflection_cadence_invariant",
      "inv.runtime_phase_balance_checker",
      "inv.state_phase_coherence_checker",
      "inv.verification_gate_invariant",
    ]);
    assert.ok(
      gaps.every(
        g =>
          g.category === "phase_lifecycle" ||
          g.category === "event_ordering" ||
          g.category === "reflection_cadence" ||
          g.category === "state_coherence" ||
          g.category === "block_halt" ||
          g.category === "verification_gate" ||
          g.category === "boundary",
      ),
      "documented gaps are runtime invariant engine probes",
    );
  });
});
