import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadReproducibleFixtureBaseline,
  runReproducibleFixtureProbes,
  runReproducibleFixtureProductionSlice,
  runReproducibleFixtureBoundarySlice,
  validateReproducibleFixtureBaseline,
  summarizeReproducibleFixtureMatrix,
  listReproducibleFixtureProbesByExpected,
  listReproducibleFixtureKnownGaps,
  getActiveReproducibleFixtureContract,
  getReproducibleFixtureCategoryContract,
  listReproducibleFixtureContractProbeIds,
  listReproducibleFixtureProbesByDisposition,
  listReproducibleFixtureProbesByCategory,
  summarizeReproducibleFixtureContractCoverage,
  validateReproducibleFixtureContractCoverage,
  validateReproducibleFixtureBaselineAgainstContract,
  validateReproducibleFixtureProbeMatrix,
  validateReproducibleFixtureBoundaryProbeMatrix,
  canonicalFixtureHash,
  REPRODUCIBLE_FIXTURE_CATEGORIES,
} from "./forge-reproducible-fixture.probe.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Reproducible Fixture — P01-B07-A01", () => {
  it("loads versioned reproducible fixture baseline aligned with B06 handoff", () => {
    const fixture = loadReproducibleFixtureBaseline();
    const validation = validateReproducibleFixtureBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P01-B07-A01");
    assert.equal(fixture.contractAtom, "P01-B07-A05");
    assert.equal(fixture.sourceBenchmarkEval.probeCount, 26);
    assert.equal(fixture.sourceBenchmarkEval.benchmarkEvalCategories, 9);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 21);
  });

  it("measures reproducible fixture probes with documented FAIL gaps from B06 sealed handoff", () => {
    const results = runReproducibleFixtureProbes();
    const summary = summarizeReproducibleFixtureMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 21);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listReproducibleFixtureProbesByExpected(
      "FAIL",
      loadReproducibleFixtureBaseline(),
    );
    assert.equal(documentedFail.length, 6);
    assert.ok(documentedFail.some(p => p.id === "fix.content_addressable_store"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of REPRODUCIBLE_FIXTURE_CATEGORIES) {
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

  it("documents reproducible fixture gaps as measurable baseline debt", () => {
    const gaps = listReproducibleFixtureKnownGaps(runReproducibleFixtureProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "fix.content_addressable_store",
      "fix.deterministic_eval_seed",
      "fix.nogo_fixture_drift_gate",
      "fix.nogo_hash_mismatch_gate",
      "fix.recovery_baseline_reset",
      "fix.recovery_missing_fixture_file",
    ]);
    assert.ok(
      gaps.every(g => REPRODUCIBLE_FIXTURE_CATEGORIES.includes(g.category)),
      "documented gaps are reproducible fixture probes",
    );
  });
});

describe("Forge Reproducible Fixture Contract — P01-B07-A02", () => {
  it("defines typed acceptance for all eight reproducible fixture categories", () => {
    const contract = getActiveReproducibleFixtureContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P01-B07-A05");

    for (const category of REPRODUCIBLE_FIXTURE_CATEGORIES) {
      const categoryContract = getReproducibleFixtureCategoryContract(category);
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

  it("maps 21 probes with six documented gap dispositions from A01 baseline", () => {
    const contract = getActiveReproducibleFixtureContract();
    const summary = summarizeReproducibleFixtureContractCoverage(contract);
    const coverage = validateReproducibleFixtureContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 21);
    assert.equal(summary.expectedPass, 15);
    assert.equal(summary.expectedFail, 6);
    assert.equal(summary.byDisposition.observed, 13);
    assert.equal(summary.byDisposition.gap, 6);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 0);
    assert.equal(summary.byDisposition.nogo, 0);
    assert.equal(summary.byCategory.fixture_versioning.probeCount, 3);
    assert.equal(summary.byCategory.fixture_integrity.probeCount, 3);
    assert.equal(summary.byCategory.deterministic_load.probeCount, 4);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 3);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists six documented gap probes for reproducible fixture wiring", () => {
    const gaps = listReproducibleFixtureProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, [
      "fix.content_addressable_store",
      "fix.deterministic_eval_seed",
      "fix.nogo_fixture_drift_gate",
      "fix.nogo_hash_mismatch_gate",
      "fix.recovery_baseline_reset",
      "fix.recovery_missing_fixture_file",
    ]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadReproducibleFixtureBaseline();
    const contract = getActiveReproducibleFixtureContract();
    const validation = validateReproducibleFixtureBaselineAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listReproducibleFixtureContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each reproducible fixture probe id is globally unique", () => {
    const ids = listReproducibleFixtureContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runReproducibleFixtureProbes();
    const contract = getActiveReproducibleFixtureContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});

describe("Forge Reproducible Fixture Production Slice — P01-B07-A03", () => {
  it("computes stable SHA-256 via canonicalFixtureHash", () => {
    const sample = { version: "1.0.0", atom: "P01-B07-A03" };
    const hash1 = canonicalFixtureHash(sample);
    const hash2 = canonicalFixtureHash(sample);

    assert.equal(hash1.length, 64);
    assert.equal(hash1, hash2);
    assert.match(hash1, /^[a-f0-9]+$/);
    assert.notEqual(canonicalFixtureHash("a"), canonicalFixtureHash("b"));
  });

  it("executes contract-wired probes with zero unexpected mismatches", () => {
    const contract = getActiveReproducibleFixtureContract();
    const slice = runReproducibleFixtureProductionSlice();

    assert.equal(slice.atom, "P01-B07-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 21);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 15);
    assert.equal(slice.matrixValidation.gapAligned, 6);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateReproducibleFixtureProbeMatrix(slice.results, contract);
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
        "fix.content_addressable_store",
        "fix.deterministic_eval_seed",
        "fix.nogo_fixture_drift_gate",
        "fix.nogo_hash_mismatch_gate",
        "fix.recovery_baseline_reset",
        "fix.recovery_missing_fixture_file",
      ],
    );

    const closedGap = slice.results.find(r => r.id === "fix.canonical_fixture_hash");
    assert.ok(closedGap);
    assert.equal(closedGap!.expected, "PASS");
    assert.equal(closedGap!.actual, "PASS");
    assert.equal(closedGap!.aligned, true);
  });
});

describe("Forge Reproducible Fixture Boundary Slice — P01-B07-A04", () => {
  it("defines boundary category with sourceBenchmarkEval ref and probe runner probes", () => {
    const contract = getActiveReproducibleFixtureContract();
    const boundary = listReproducibleFixtureProbesByCategory("boundary", contract);
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 3);
    assert.deepEqual(ids, [
      "fix.known_gaps_documented",
      "fix.probe_runner_exported",
      "fix.source_benchmark_eval_ref",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
    assert.ok(boundary.every(p => p.disposition === "observed"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveReproducibleFixtureContract();
    const slice = runReproducibleFixtureBoundarySlice();

    assert.equal(slice.atom, "P01-B07-A04");
    assert.equal(slice.boundaryProbeCount, 3);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 3);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 3);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listReproducibleFixtureProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateReproducibleFixtureBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("confirms boundary probes validate sealed B06 handoff and documented FAIL gaps", () => {
    const slice = runReproducibleFixtureBoundarySlice();
    const sourceRef = slice.boundaryResults.find(r => r.id === "fix.source_benchmark_eval_ref");
    const probeRunner = slice.boundaryResults.find(r => r.id === "fix.probe_runner_exported");
    const knownGaps = slice.boundaryResults.find(r => r.id === "fix.known_gaps_documented");

    assert.ok(sourceRef);
    assert.equal(sourceRef!.expected, "PASS");
    assert.equal(sourceRef!.actual, "PASS");
    assert.match(sourceRef!.detail, /probes=26/);

    assert.ok(probeRunner);
    assert.equal(probeRunner!.expected, "PASS");
    assert.equal(probeRunner!.actual, "PASS");

    assert.ok(knownGaps);
    assert.equal(knownGaps!.expected, "PASS");
    assert.equal(knownGaps!.actual, "PASS");
    assert.match(knownGaps!.detail, /documentedFail=6/);
  });
});
