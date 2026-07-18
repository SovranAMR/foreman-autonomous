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

    const registryExport = results.find(r => r.id === "map.registry_export");
    assert.ok(registryExport, "registry export probe missing");
    assert.equal(registryExport.expected, "PASS");
    assert.equal(registryExport.actual, "PASS");
    assert.equal(registryExport.aligned, true);

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

describe("Forge Pipeline Behavior Map Contract — P01-B02-A02", () => {
  it("defines typed acceptance for all five behavior categories", () => {
    const contract = getActivePipelineBehaviorMapContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P01-B02-A03");

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

  it("maps 16 probes with observed/gap disposition and category coverage", () => {
    const contract = getActivePipelineBehaviorMapContract();
    const summary = summarizeBehaviorMapContractCoverage(contract);

    assert.equal(summary.totalProbes, 16);
    assert.equal(summary.expectedPass, 15);
    assert.equal(summary.expectedFail, 1);
    assert.ok(summary.byDisposition.observed >= 15, "observed probes required");
    assert.ok(summary.byDisposition.gap >= 1, "documented gap probes required");
    assert.equal(summary.byCategory.phase_presence.probeCount, 7);
    assert.equal(summary.byCategory.state_sync.probeCount, 6);
    assert.equal(summary.byCategory.checkpoint_type.probeCount, 1);
    assert.equal(summary.byCategory.stream_seam.probeCount, 1);
    assert.equal(summary.byCategory.baseline_link.probeCount, 1);
  });

  it("lists documented FAIL gaps by gap disposition", () => {
    const gaps = listBehaviorMapProbesByDisposition("gap");
    const gapIds = gaps.map(p => p.id).sort();

    assert.deepEqual(gapIds, ["map.atomize_state_sync"]);
    for (const gap of gaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.disposition, "gap");
    }
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
    assert.equal(summary.knownGaps.length, 1);
    assert.equal(summary.knownGaps[0]?.id, "map.atomize_state_sync");
  });
});
