import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadBenchmarkEvalHarnessFixture,
  runBenchmarkEvalHarnessProbes,
  summarizeBenchmarkEvalHarnessMatrix,
  validateBenchmarkEvalHarnessFixture,
  listBenchmarkEvalHarnessProbesByExpected,
  listBenchmarkEvalHarnessKnownGaps,
  BENCHMARK_EVAL_CATEGORIES,
} from "./forge-benchmark-eval-harness.probe.js";

function formatMismatchReport(mismatches: { id: string; expected: string; actual: string; detail: string }[]): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Benchmark Eval Harness — P01-B06-A01", () => {
  it("loads versioned benchmark eval fixture aligned with B05 handoff", () => {
    const fixture = loadBenchmarkEvalHarnessFixture();
    const validation = validateBenchmarkEvalHarnessFixture(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P01-B06-A01");
    assert.equal(fixture.contractAtom, "P01-B06-A05");
    assert.equal(fixture.sourcePipelineInvariantEngine.probeCount, 32);
    assert.equal(fixture.sourcePipelineInvariantEngine.invariantCategories, 11);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 26);
  });

  it("measures orchestrator benchmark eval probes with documented FAIL gaps", () => {
    const results = runBenchmarkEvalHarnessProbes();
    const summary = summarizeBenchmarkEvalHarnessMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 26);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listBenchmarkEvalHarnessProbesByExpected("FAIL", loadBenchmarkEvalHarnessFixture());
    assert.equal(documentedFail.length, 8);
    assert.ok(documentedFail.some(p => p.id === "bench.phase_timing_collector"));
    assert.ok(documentedFail.some(p => p.id === "bench.benchmark_regression_export"));
    assert.ok(documentedFail.some(p => p.id === "bench.deterministic_eval_seed"));
    assert.ok(documentedFail.some(p => p.id === "bench.fixture_hash_provenance"));
    assert.ok(documentedFail.some(p => p.id === "bench.eval_harness_orchestrator_wired"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of BENCHMARK_EVAL_CATEGORIES) {
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

  it("documents benchmark eval harness gaps as measurable baseline debt", () => {
    const gaps = listBenchmarkEvalHarnessKnownGaps();
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "bench.benchmark_regression_export",
      "bench.deterministic_eval_seed",
      "bench.eval_harness_orchestrator_wired",
      "bench.failure_eval_harness_on_block",
      "bench.fixture_hash_provenance",
      "bench.nogo_eval_gate_on_reject",
      "bench.phase_timing_collector",
      "bench.recovery_eval_baseline_reset",
    ]);
    assert.ok(
      gaps.every(g => BENCHMARK_EVAL_CATEGORIES.includes(g.category)),
      "documented gaps are benchmark eval harness probes",
    );
  });
});
