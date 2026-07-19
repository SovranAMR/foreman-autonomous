import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadReproducibleFixtureBaseline,
  runReproducibleFixtureProbes,
  validateReproducibleFixtureBaseline,
  summarizeReproducibleFixtureMatrix,
  listReproducibleFixtureProbesByExpected,
  listReproducibleFixtureKnownGaps,
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
    assert.equal(documentedFail.length, 7);
    assert.ok(documentedFail.some(p => p.id === "fix.canonical_fixture_hash"));
    assert.ok(documentedFail.some(p => p.id === "fix.deterministic_eval_seed"));
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
      "fix.canonical_fixture_hash",
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
