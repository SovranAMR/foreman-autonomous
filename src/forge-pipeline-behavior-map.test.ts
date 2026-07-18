import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadPipelineBehaviorMapFixture,
  runPipelineBehaviorMapProbes,
  summarizeBehaviorMapMatrix,
  validateBehaviorMapFixtureAgainstContract,
  getActivePipelineBehaviorMapContract,
} from "./forge-pipeline-behavior-map-harness.js";

describe("Forge Pipeline Behavior Map — P01-B02-A01", () => {
  it("loads versioned behavior map fixture aligned with B01 handoff baseline", () => {
    const fixture = loadPipelineBehaviorMapFixture();
    const contract = getActivePipelineBehaviorMapContract();
    const validation = validateBehaviorMapFixtureAgainstContract(fixture, contract);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P01-B02-A01");
    assert.equal(fixture.contractAtom, contract.atom);
    assert.equal(fixture.sourceBaseline.probeCount, 27);
    assert.equal(fixture.sourceBaseline.pathCategories, 6);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, contract.probes.length);
  });

  it("measures orchestrator phase→behavior map with documented known gaps as FAIL", async () => {
    const results = runPipelineBehaviorMapProbes();
    const summary = summarizeBehaviorMapMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.mismatches.length, 0, formatMismatchReport(summary.mismatches));
    assert.ok(summary.knownGaps.length >= 1, "expected at least one captured FAIL gap");

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    const registryGap = results.find(r => r.id === "map.registry_export");
    assert.ok(registryGap, "registry export gap probe missing");
    assert.equal(registryGap.expected, "FAIL");
    assert.equal(registryGap.actual, "FAIL");

    const atomizeGap = results.find(r => r.id === "map.atomize_state_sync");
    assert.ok(atomizeGap, "atomize state sync gap probe missing");
    assert.equal(atomizeGap.expected, "FAIL");
    assert.equal(atomizeGap.actual, "FAIL");

    for (const cat of ["phase_presence", "state_sync", "checkpoint_type", "stream_seam", "baseline_link"] as const) {
      assert.ok(summary.byCategory[cat], `missing category summary: ${cat}`);
    }
  });
});

function formatMismatchReport(mismatches: ReturnType<typeof runPipelineBehaviorMapProbes>): string {
  if (mismatches.length === 0) return "";
  return mismatches
    .map(m => `${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}
