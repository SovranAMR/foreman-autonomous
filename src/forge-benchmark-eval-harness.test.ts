import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadBenchmarkEvalHarnessFixture,
  runBenchmarkEvalHarnessProbes,
  runBenchmarkEvalProductionSlice,
  runBenchmarkEvalBoundarySlice,
  runBenchmarkEvalFailureRecoverySlice,
  runBenchmarkEvalFailureRecoverySliceWithRecord,
  summarizeBenchmarkEvalHarnessMatrix,
  validateBenchmarkEvalHarnessFixture,
  validateBenchmarkEvalHarnessFixtureAgainstContract,
  validateBenchmarkEvalProbeMatrix,
  validateBenchmarkEvalBoundaryProbeMatrix,
  validateBenchmarkEvalFailureRecoveryProbeMatrix,
  validateBenchmarkEvalFailureRecoveryRunRecord,
  validateBenchmarkEvalRunRecord,
  runBenchmarkEvalPropertyChecks,
  runBenchmarkEvalFuzzValidation,
  runBenchmarkEvalRunRecordFuzzValidation,
  createBenchmarkEvalFuzzRng,
  buildBenchmarkEvalProbeEvidence,
  buildBenchmarkEvalProbeTelemetry,
  buildBenchmarkEvalProvenance,
  buildBenchmarkEvalRunRecord,
  listBenchmarkEvalProbesByCategory,
  listBenchmarkEvalHarnessProbesByExpected,
  listBenchmarkEvalHarnessKnownGaps,
  listBenchmarkEvalContractProbeIds,
  listBenchmarkEvalProbesByDisposition,
  listBenchmarkEvalFailureRecoveryProbeIds,
  getActiveBenchmarkEvalContract,
  getBenchmarkEvalCategoryContract,
  summarizeBenchmarkEvalContractCoverage,
  FORGE_BENCHMARK_EVAL_CONTRACT_V1,
  BENCHMARK_EVAL_CATEGORIES,
  BENCHMARK_EVAL_FAILURE_RECOVERY_CATEGORIES,
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
    assert.equal(documentedFail.length, 6);
    assert.ok(documentedFail.some(p => p.id === "bench.phase_timing_collector"));
    assert.ok(documentedFail.some(p => p.id === "bench.deterministic_eval_seed"));
    assert.ok(documentedFail.some(p => p.id === "bench.fixture_hash_provenance"));

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
      "bench.deterministic_eval_seed",
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

  it("maps 26 probes with six documented gap dispositions from A01 baseline", () => {
    const contract = getActiveBenchmarkEvalContract();
    const summary = summarizeBenchmarkEvalContractCoverage(contract);

    assert.equal(summary.totalProbes, 26);
    assert.equal(summary.expectedPass, 20);
    assert.equal(summary.expectedFail, 6);
    assert.equal(summary.byDisposition.observed, 14);
    assert.equal(summary.byDisposition.gap, 6);
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

  it("lists six documented gap probes for benchmark eval harness wiring", () => {
    const gaps = listBenchmarkEvalProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, [
      "bench.deterministic_eval_seed",
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
    assert.equal(slice.matrixValidation.passAligned, 20);
    assert.equal(slice.matrixValidation.gapAligned, 6);

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
    assert.equal(slice.summary.knownGaps.length, 6);
    assert.deepEqual(
      slice.summary.knownGaps.map(g => g.id).sort(),
      [
        "bench.deterministic_eval_seed",
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
    assert.equal(boundary.filter(p => p.expected === "PASS").length, 3);
    assert.equal(boundary.filter(p => p.disposition === "gap").length, 0);
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
    assert.equal(slice.matrixValidation.passAligned, 3);
    assert.equal(slice.matrixValidation.gapAligned, 0);

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

  it("confirms boundary eval harness orchestrator wiring is PASS after A08 regression integration", () => {
    const results = runBenchmarkEvalHarnessProbes();
    const boundary = results.filter(r => r.category === "boundary");

    assert.equal(boundary.length, 3);
    assert.equal(boundary.every(r => r.aligned), true);

    const wiring = boundary.find(r => r.id === "bench.eval_harness_orchestrator_wired");
    assert.ok(wiring);
    assert.equal(wiring!.expected, "PASS");
    assert.equal(wiring!.actual, "PASS");

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

describe("Forge Benchmark Eval Harness Failure/Recovery Slice — P01-B06-A05", () => {
  it("defines failure, recovery and NO-GO categories with benchmark eval probes", () => {
    const failure = listBenchmarkEvalProbesByDisposition("failure");
    const recovery = listBenchmarkEvalProbesByDisposition("recovery");
    const nogo = listBenchmarkEvalProbesByDisposition("nogo");
    const failurePath = listBenchmarkEvalProbesByCategory("failure_path");
    const recoveryPath = listBenchmarkEvalProbesByCategory("recovery_path");
    const nogoPath = listBenchmarkEvalProbesByCategory("nogo_path");

    assert.ok(failure.some(p => p.id === "bench.failure_pipeline_timing_on_block"));
    assert.ok(failure.some(p => p.id === "bench.failure_cost_on_block"));
    assert.ok(recovery.some(p => p.id === "bench.recovery_resume_wired"));
    assert.ok(recovery.some(p => p.id === "bench.recovery_re_decompose"));
    assert.ok(nogo.some(p => p.id === "bench.nogo_reviewer_reject"));
    assert.ok(nogo.some(p => p.id === "bench.nogo_format_retry"));
    assert.equal(failurePath.length, 3);
    assert.equal(recoveryPath.length, 3);
    assert.equal(nogoPath.length, 3);
    assert.deepEqual(
      [...BENCHMARK_EVAL_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveBenchmarkEvalContract();
    const slice = runBenchmarkEvalFailureRecoverySlice();

    assert.equal(slice.atom, "P01-B06-A05");
    assert.equal(slice.failureRecoveryProbeCount, 9);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 9);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 3);

    for (const category of BENCHMARK_EVAL_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listBenchmarkEvalProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateBenchmarkEvalFailureRecoveryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves documented gaps while exercising failure/recovery/NO-GO paths", () => {
    const results = runBenchmarkEvalHarnessProbes();
    const summary = summarizeBenchmarkEvalHarnessMatrix(results);

    assert.equal(summary.total, 26);
    assert.equal(summary.knownGaps.length, 6);
    assert.equal(summary.mismatches.length, 0, formatMismatchReport(summary.mismatches));

    const probeIds = listBenchmarkEvalFailureRecoveryProbeIds();
    assert.equal(probeIds.length, 9);
    assert.ok(probeIds.every(id => results.find(r => r.id === id)?.aligned));

    const failureGap = results.find(r => r.id === "bench.failure_eval_harness_on_block");
    assert.ok(failureGap);
    assert.equal(failureGap!.expected, "FAIL");
    assert.equal(failureGap!.actual, "FAIL");

    const recoveryGap = results.find(r => r.id === "bench.recovery_eval_baseline_reset");
    assert.ok(recoveryGap);
    assert.equal(recoveryGap!.expected, "FAIL");
    assert.equal(recoveryGap!.actual, "FAIL");

    const nogoGap = results.find(r => r.id === "bench.nogo_eval_gate_on_reject");
    assert.ok(nogoGap);
    assert.equal(nogoGap!.expected, "FAIL");
    assert.equal(nogoGap!.actual, "FAIL");
  });
});

describe("Forge Benchmark Eval Harness Run Record — P01-B06-A06", () => {
  it("builds contract-wired failure/recovery run record from synthetic evidence", () => {
    const contract = getActiveBenchmarkEvalContract();
    const fixture = loadBenchmarkEvalHarnessFixture();
    const probeIds = listBenchmarkEvalFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-18T00:00:00.000Z";
    const completedAt = "2026-07-18T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildBenchmarkEvalProbeEvidence(
        probeId,
        contractProbe.category,
        contractProbe.expected,
        contractProbe.expected,
        true,
        contractProbe.criterion,
        "synthetic",
        contractProbe.disposition,
        completedAt,
      );
    });

    const telemetry = probeIds.map((probeId, index) => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildBenchmarkEvalProbeTelemetry(probeId, contractProbe.category, index, index * 0.5);
    });

    const provenance = buildBenchmarkEvalProvenance(
      "run-bench-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P01-B06-A06",
        sliceCategories: BENCHMARK_EVAL_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildBenchmarkEvalRunRecord(provenance, evidence, telemetry);
    const validation = validateBenchmarkEvalFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 9);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.gap >= 3);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(
      record.provenance.sourcePipelineInvariantEngineAtom,
      fixture.sourcePipelineInvariantEngine.atom,
    );
  });

  it("records evidence, telemetry and provenance for failure/recovery slice run", () => {
    const contract = getActiveBenchmarkEvalContract();
    const record = runBenchmarkEvalFailureRecoverySliceWithRecord();
    const validation = validateBenchmarkEvalFailureRecoveryRunRecord(record, contract);

    assert.equal(record.evidence.length, 9);
    assert.equal(record.telemetry.length, 9);
    assert.equal(record.provenance.totalProbes, 9);
    assert.equal(record.provenance.sliceAtom, "P01-B06-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);

    for (const item of record.telemetry) {
      assert.ok(item.durationMs >= 0, `${item.probeId} negative duration`);
      assert.ok(Number.isFinite(item.sequenceIndex));
    }

    for (const item of record.evidence) {
      const contractProbe = contract.probes.find(p => p.id === item.probeId)!;
      assert.ok(item.criterion.length > 0, `${item.probeId} missing criterion in evidence`);
      assert.equal(item.criterion, contractProbe.criterion);
      assert.equal(item.disposition, contractProbe.disposition);
      assert.equal(item.aligned, true);
      assert.ok(item.recordedAt.length > 10);
    }
  });
});

describe("Forge Benchmark Eval Harness Property/Fuzz — P01-B06-A07", () => {
  it("passes structural property checks on canonical contract", () => {
    const contract = getActiveBenchmarkEvalContract();
    const result = runBenchmarkEvalPropertyChecks(contract);
    assert.equal(result.allPassed, true, result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"));
    assert.equal(result.total, 8);
  });

  it("createBenchmarkEvalFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createBenchmarkEvalFuzzRng(1337);
    const rngB = createBenchmarkEvalFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createBenchmarkEvalFuzzRng(1338)()));
  });

  it("rejects fuzz-mutated fixtures and corrupted failure/recovery run records", () => {
    const fixture = loadBenchmarkEvalHarnessFixture();
    const contract = getActiveBenchmarkEvalContract();
    const record = runBenchmarkEvalFailureRecoverySliceWithRecord();

    const fuzz = runBenchmarkEvalFuzzValidation(fixture, contract, 42, 24);
    assert.equal(fuzz.allMutationsRejected, true);
    assert.equal(fuzz.rejected, 24);

    const runFuzz = runBenchmarkEvalRunRecordFuzzValidation(record, contract);
    assert.equal(runFuzz.validBaseline, true);
    assert.equal(runFuzz.mutationsAccepted, 0);
    assert.equal(runFuzz.mutationsRejected, 5);

    const validation = validateBenchmarkEvalFailureRecoveryRunRecord(record, contract);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveBenchmarkEvalContract();
    const fixture = loadBenchmarkEvalHarnessFixture();
    const probeIds = listBenchmarkEvalContractProbeIds(contract);
    const startedAt = "2026-07-18T23:00:00.000Z";
    const completedAt = "2026-07-18T23:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildBenchmarkEvalProbeEvidence(
        id,
        probe.category,
        probe.expected,
        probe.expected,
        true,
        probe.criterion,
        "synthetic",
        probe.disposition,
        startedAt,
      );
    });

    const telemetry = probeIds.map((id, index) => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildBenchmarkEvalProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildBenchmarkEvalProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildBenchmarkEvalRunRecord(provenance, evidence, telemetry);

    assert.equal(validateBenchmarkEvalRunRecord(record, contract).valid, true);

    const runFuzz = runBenchmarkEvalRunRecordFuzzValidation(record, contract);
    assert.equal(runFuzz.validBaseline, true);
    assert.equal(runFuzz.mutationsAccepted, 0);
    assert.equal(runFuzz.mutationsRejected, 3);
  });
});
