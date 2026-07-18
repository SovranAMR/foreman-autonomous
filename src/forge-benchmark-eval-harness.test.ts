import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadBenchmarkEvalHarnessFixture,
  runBenchmarkEvalHarnessProbes,
  runBenchmarkEvalProductionSlice,
  runBenchmarkEvalBoundarySlice,
  summarizeBenchmarkEvalHarnessMatrix,
  validateBenchmarkEvalHarnessFixture,
  validateBenchmarkEvalHarnessFixtureAgainstContract,
  validateBenchmarkEvalProbeMatrix,
  validateBenchmarkEvalBoundaryProbeMatrix,
  listBenchmarkEvalProbesByCategory,
  listBenchmarkEvalHarnessProbesByExpected,
  listBenchmarkEvalHarnessKnownGaps,
  listBenchmarkEvalContractProbeIds,
  listBenchmarkEvalProbesByDisposition,
  getActiveBenchmarkEvalContract,
  getBenchmarkEvalCategoryContract,
  summarizeBenchmarkEvalContractCoverage,
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

describe("Forge Benchmark Eval Harness Contract — P01-B06-A02", () => {
  it("defines typed acceptance for all nine benchmark eval categories", () => {
    const contract = getActiveBenchmarkEvalContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P01-B06-A05");

    for (const category of BENCHMARK_EVAL_CATEGORIES) {
      const categoryContract = getBenchmarkEvalCategoryContract(category);
      assert.ok(categoryContract.acceptance.invariant.length > 20, `${category} invariant too short`);
      assert.ok(categoryContract.probes.length >= categoryContract.acceptance.minProbeCount);
      assert.equal(categoryContract.acceptance.requireFullAlignment, true);

      for (const probe of categoryContract.probes) {
        assert.ok(probe.criterion.length > 10, `${probe.id} missing measurable criterion`);
        assert.ok(probe.expected === "PASS" || probe.expected === "FAIL");
        assert.ok(
          probe.disposition === "observed" ||
            probe.disposition === "gap" ||
            probe.disposition === "failure" ||
            probe.disposition === "recovery" ||
            probe.disposition === "nogo",
          `${probe.id} missing disposition`,
        );
      }
    }
  });

  it("maps 26 probes with eight documented gap dispositions from A01 baseline", () => {
    const contract = getActiveBenchmarkEvalContract();
    const summary = summarizeBenchmarkEvalContractCoverage(contract);

    assert.equal(summary.totalProbes, 26);
    assert.equal(summary.expectedPass, 18);
    assert.equal(summary.expectedFail, 8);
    assert.equal(summary.byDisposition.observed, 12);
    assert.equal(summary.byDisposition.gap, 8);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.latency_timing.probeCount, 3);
    assert.equal(summary.byCategory.token_cost.probeCount, 3);
    assert.equal(summary.byCategory.eval_suite.probeCount, 3);
    assert.equal(summary.byCategory.reproducibility.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 3);
    assert.equal(summary.byCategory.failure_path.probeCount, 3);
    assert.equal(summary.byCategory.recovery_path.probeCount, 3);
    assert.equal(summary.byCategory.nogo_path.probeCount, 3);
  });

  it("lists eight documented gap probes for benchmark eval harness wiring", () => {
    const gaps = listBenchmarkEvalProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
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
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadBenchmarkEvalHarnessFixture();
    const contract = getActiveBenchmarkEvalContract();
    const validation = validateBenchmarkEvalHarnessFixtureAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listBenchmarkEvalContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each benchmark eval probe id is globally unique", () => {
    const ids = listBenchmarkEvalContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runBenchmarkEvalHarnessProbes();
    const contract = getActiveBenchmarkEvalContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});

describe("Forge Benchmark Eval Harness Production Slice — P01-B06-A03", () => {
  it("executes contract-wired probes with zero unexpected mismatches", () => {
    const contract = getActiveBenchmarkEvalContract();
    const slice = runBenchmarkEvalProductionSlice();

    assert.equal(slice.atom, "P01-B06-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 26);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 18);
    assert.equal(slice.matrixValidation.gapAligned, 8);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateBenchmarkEvalProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(slice.summary.mismatches.length, 0);
    assert.equal(slice.summary.knownGaps.length, 8);
    assert.deepEqual(
      slice.summary.knownGaps.map(g => g.id).sort(),
      [
        "bench.benchmark_regression_export",
        "bench.deterministic_eval_seed",
        "bench.eval_harness_orchestrator_wired",
        "bench.failure_eval_harness_on_block",
        "bench.fixture_hash_provenance",
        "bench.nogo_eval_gate_on_reject",
        "bench.phase_timing_collector",
        "bench.recovery_eval_baseline_reset",
      ],
    );
  });
});

describe("Forge Benchmark Eval Harness Boundary Slice — P01-B06-A04", () => {
  it("defines boundary category with quality metrics, observer and wiring edge probes", () => {
    const boundary = listBenchmarkEvalProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 3);
    assert.deepEqual(ids, [
      "bench.eval_harness_orchestrator_wired",
      "bench.observer_wired",
      "bench.quality_metrics_tracked",
    ]);
    assert.equal(boundary.filter(p => p.expected === "PASS").length, 2);
    assert.equal(boundary.filter(p => p.disposition === "gap").length, 1);
    assert.ok(boundary.some(p => p.id === "bench.quality_metrics_tracked"));
    assert.ok(boundary.some(p => p.id === "bench.observer_wired"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveBenchmarkEvalContract();
    const slice = runBenchmarkEvalBoundarySlice();

    assert.equal(slice.atom, "P01-B06-A04");
    assert.equal(slice.boundaryProbeCount, 3);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 3);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 2);
    assert.equal(slice.matrixValidation.gapAligned, 1);

    for (const boundaryProbe of listBenchmarkEvalProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateBenchmarkEvalBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves documented boundary gap for eval harness orchestrator wiring", () => {
    const results = runBenchmarkEvalHarnessProbes();
    const boundary = results.filter(r => r.category === "boundary");

    assert.equal(boundary.length, 3);
    assert.equal(boundary.every(r => r.aligned), true);

    const wiringGap = boundary.find(r => r.id === "bench.eval_harness_orchestrator_wired");
    assert.ok(wiringGap);
    assert.equal(wiringGap!.expected, "FAIL");
    assert.equal(wiringGap!.actual, "FAIL");

    const qualityMetrics = boundary.find(r => r.id === "bench.quality_metrics_tracked");
    assert.ok(qualityMetrics);
    assert.equal(qualityMetrics!.expected, "PASS");
    assert.equal(qualityMetrics!.actual, "PASS");

    const observerWired = boundary.find(r => r.id === "bench.observer_wired");
    assert.ok(observerWired);
    assert.equal(observerWired!.expected, "PASS");
    assert.equal(observerWired!.actual, "PASS");
  });
});
