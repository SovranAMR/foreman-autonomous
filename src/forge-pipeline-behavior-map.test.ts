import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadPipelineBehaviorMapFixture,
  runPipelineBehaviorMapProbes,
  summarizeBehaviorMapMatrix,
  validateBehaviorMapFixtureAgainstContract,
  getActivePipelineBehaviorMapContract,
  getBehaviorMapCategoryContract,
  listBehaviorMapProbeIds,
  listBehaviorMapProbesByDisposition,
  summarizeBehaviorMapContractCoverage,
  PIPELINE_BEHAVIOR_CATEGORIES,
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

  it("measures orchestrator phase→behavior map with full probe alignment", async () => {
    const results = runPipelineBehaviorMapProbes();
    const summary = summarizeBehaviorMapMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.mismatches.length, 0, formatMismatchReport(summary.mismatches));
    assert.equal(summary.knownGaps.length, 0, "all documented gaps should be closed");

    const registryExport = results.find(r => r.id === "map.registry_export");
    assert.ok(registryExport, "registry export probe missing");
    assert.equal(registryExport.expected, "PASS");
    assert.equal(registryExport.actual, "PASS");
    assert.equal(registryExport.aligned, true);

    const atomizeSync = results.find(r => r.id === "map.atomize_state_sync");
    assert.ok(atomizeSync, "atomize state sync probe missing");
    assert.equal(atomizeSync.expected, "PASS");
    assert.equal(atomizeSync.actual, "PASS");
    assert.equal(atomizeSync.aligned, true);

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

describe("Forge Pipeline Behavior Map Contract — P01-B02-A02", () => {
  it("defines typed acceptance for all five behavior categories", () => {
    const contract = getActivePipelineBehaviorMapContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P01-B02-A04");

    for (const category of PIPELINE_BEHAVIOR_CATEGORIES) {
      const categoryContract = getBehaviorMapCategoryContract(category);
      assert.ok(categoryContract.acceptance.invariant.length > 20, `${category} invariant too short`);
      assert.ok(categoryContract.probes.length >= categoryContract.acceptance.minProbeCount);
      assert.equal(categoryContract.acceptance.requireFullAlignment, true);

      for (const probe of categoryContract.probes) {
        assert.ok(probe.criterion.length > 10, `${probe.id} missing measurable criterion`);
        assert.ok(probe.expected === "PASS" || probe.expected === "FAIL");
        assert.ok(
          probe.disposition === "observed" || probe.disposition === "gap",
          `${probe.id} missing disposition`,
        );
      }
    }
  });

  it("maps 17 probes with observed disposition and category coverage", () => {
    const contract = getActivePipelineBehaviorMapContract();
    const summary = summarizeBehaviorMapContractCoverage(contract);

    assert.equal(summary.totalProbes, 17);
    assert.equal(summary.expectedPass, 17);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byCategory.phase_presence.probeCount, 7);
    assert.equal(summary.byCategory.state_sync.probeCount, 7);
    assert.equal(summary.byCategory.checkpoint_type.probeCount, 1);
    assert.equal(summary.byCategory.stream_seam.probeCount, 1);
    assert.equal(summary.byCategory.baseline_link.probeCount, 1);
  });

  it("lists no documented FAIL gaps when boundary state sync is sealed", () => {
    const gaps = listBehaviorMapProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadPipelineBehaviorMapFixture();
    const contract = getActivePipelineBehaviorMapContract();
    const validation = validateBehaviorMapFixtureAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listBehaviorMapProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each behavior map probe id is globally unique", () => {
    const ids = listBehaviorMapProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("Forge Pipeline Behavior Map Production Slice — P01-B02-A03", () => {
  it("closes registry_export gap by exporting FORGE_PIPELINE_PHASES from orchestrator", async () => {
    const { FORGE_PIPELINE_PHASES } = await import("./orchestrator.js");
    const { FORGE_PIPELINE_CORE_PHASES } = await import("./forge-pipeline-behavior-map.js");
    const results = runPipelineBehaviorMapProbes();
    const registryExport = results.find(r => r.id === "map.registry_export");

    assert.deepEqual(FORGE_PIPELINE_PHASES, FORGE_PIPELINE_CORE_PHASES);
    assert.ok(registryExport, "registry export probe missing");
    assert.equal(registryExport.expected, "PASS");
    assert.equal(registryExport.actual, "PASS");
    assert.equal(registryExport.aligned, true);

    const summary = summarizeBehaviorMapMatrix(results);
    assert.equal(summary.mismatches.length, 0, formatMismatchReport(summary.mismatches));
    assert.equal(summary.knownGaps.length, 0);
  });
});

describe("Forge Pipeline Behavior Map Boundary Slice — P01-B02-A04", () => {
  it("closes atomize_state_sync with dedicated atomizing SystemState", async () => {
    const { VALID_TRANSITIONS } = await import("./types.js");
    const results = runPipelineBehaviorMapProbes();

    assert.ok("atomizing" in VALID_TRANSITIONS);
    assert.deepEqual([...(VALID_TRANSITIONS.researching ?? [])], [
      "decomposing",
      "executing",
      "atomizing",
      "blocked",
    ]);

    const atomizeSync = results.find(r => r.id === "map.atomize_state_sync");
    assert.ok(atomizeSync);
    assert.equal(atomizeSync.expected, "PASS");
    assert.equal(atomizeSync.actual, "PASS");
    assert.equal(atomizeSync.aligned, true);

    const verifySync = results.find(r => r.id === "map.verify_state_sync");
    assert.ok(verifySync, "verify state sync boundary probe missing");
    assert.equal(verifySync.expected, "PASS");
    assert.equal(verifySync.actual, "PASS");
    assert.equal(verifySync.aligned, true);

    const summary = summarizeBehaviorMapMatrix(results);
    assert.equal(summary.total, 17);
    assert.equal(summary.aligned, 17);
    assert.equal(summary.mismatches.length, 0, formatMismatchReport(summary.mismatches));
  });
});
