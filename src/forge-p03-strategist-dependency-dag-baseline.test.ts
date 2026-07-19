import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistDependencyDagBaseline,
  runStrategistDependencyDagProbes,
  validateStrategistDependencyDagBaseline,
  summarizeStrategistDependencyDagMatrix,
  listStrategistDependencyDagProbesByExpected,
  listStrategistDependencyDagKnownGaps,
  STRATEGIST_DEPENDENCY_DAG_CATEGORIES,
} from "./forge-p03-strategist-dependency-dag.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Dependency DAG — P03-B04-A01", () => {
  it("loads versioned dependency DAG baseline aligned with P03-B03 block gate handoff", () => {
    const fixture = loadStrategistDependencyDagBaseline();
    const validation = validateStrategistDependencyDagBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P03-B04-A01");
    assert.equal(fixture.contractAtom, "P03-B04-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P03-B03-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures dependency DAG probes with documented FAIL gaps from B03 sealed handoff", () => {
    const results = runStrategistDependencyDagProbes();
    const summary = summarizeStrategistDependencyDagMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listStrategistDependencyDagProbesByExpected(
      "FAIL",
      loadStrategistDependencyDagBaseline(),
    );
    assert.equal(documentedFail.length, 6);
    assert.ok(documentedFail.some(p => p.id === "sdag.parser_atom_deps"));
    assert.ok(documentedFail.some(p => p.id === "sdag.nogo_cycle_block_halt"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of STRATEGIST_DEPENDENCY_DAG_CATEGORIES) {
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

  it("documents dependency DAG gaps as measurable baseline debt", () => {
    const gaps = listStrategistDependencyDagKnownGaps(runStrategistDependencyDagProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "sdag.exported_dag_validator",
      "sdag.nogo_cycle_block_halt",
      "sdag.nogo_invalid_dep_graph",
      "sdag.orchestrator_atom_waves",
      "sdag.parser_atom_deps",
      "sdag.prompt_atom_dependencies",
    ]);
    assert.ok(
      gaps.every(g => STRATEGIST_DEPENDENCY_DAG_CATEGORIES.includes(g.category)),
      "documented gaps are dependency DAG probes",
    );
  });
});
