import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadPipelineBehaviorMapFixture,
  runPipelineBehaviorMapProbes,
  runPipelineBehaviorMapProbesWithRecord,
  summarizeBehaviorMapMatrix,
  validateBehaviorMapFixtureAgainstContract,
  validateBehaviorMapRunRecord,
  getActivePipelineBehaviorMapContract,
  getBehaviorMapCategoryContract,
  listBehaviorMapProbeIds,
  listBehaviorMapProbesByDisposition,
  summarizeBehaviorMapContractCoverage,
  buildBehaviorMapProbeEvidence,
  buildBehaviorMapProbeTelemetry,
  buildBehaviorMapProvenance,
  buildBehaviorMapRunRecord,
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

    for (const cat of [
      "phase_presence",
      "state_sync",
      "checkpoint_type",
      "stream_seam",
      "baseline_link",
      "failure_path",
      "recovery_path",
      "nogo_path",
    ] as const) {
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
  it("defines typed acceptance for all eight behavior categories", () => {
    const contract = getActivePipelineBehaviorMapContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P01-B02-A07");

    for (const category of PIPELINE_BEHAVIOR_CATEGORIES) {
      const categoryContract = getBehaviorMapCategoryContract(category);
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

  it("maps 26 probes with failure/recovery/NO-GO disposition coverage", () => {
    const contract = getActivePipelineBehaviorMapContract();
    const summary = summarizeBehaviorMapContractCoverage(contract);

    assert.equal(summary.totalProbes, 26);
    assert.equal(summary.expectedPass, 26);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.ok(summary.byDisposition.failure >= 3, "failure disposition probes required");
    assert.ok(summary.byDisposition.recovery >= 3, "recovery disposition probes required");
    assert.ok(summary.byDisposition.nogo >= 3, "NO-GO disposition probes required");
    assert.equal(summary.byCategory.phase_presence.probeCount, 7);
    assert.equal(summary.byCategory.state_sync.probeCount, 7);
    assert.equal(summary.byCategory.checkpoint_type.probeCount, 1);
    assert.equal(summary.byCategory.stream_seam.probeCount, 1);
    assert.equal(summary.byCategory.baseline_link.probeCount, 1);
    assert.equal(summary.byCategory.failure_path.probeCount, 3);
    assert.equal(summary.byCategory.recovery_path.probeCount, 3);
    assert.equal(summary.byCategory.nogo_path.probeCount, 3);
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
    assert.equal(summary.total, 26);
    assert.equal(summary.aligned, 26);
    assert.equal(summary.mismatches.length, 0, formatMismatchReport(summary.mismatches));
  });
});

describe("Forge Pipeline Behavior Map Failure/Recovery/NO-GO — P01-B02-A05", () => {
  it("lists failure, recovery and NO-GO probes by disposition", () => {
    const failure = listBehaviorMapProbesByDisposition("failure");
    const recovery = listBehaviorMapProbesByDisposition("recovery");
    const nogo = listBehaviorMapProbesByDisposition("nogo");

    assert.ok(failure.some(p => p.id === "map.worker_blocked_handling"));
    assert.ok(failure.some(p => p.id === "map.atom_retry_loop"));
    assert.ok(recovery.some(p => p.id === "map.re_decompose_phase_presence"));
    assert.ok(recovery.some(p => p.id === "map.recovery_phase_runner"));
    assert.ok(nogo.some(p => p.id === "map.reviewer_reject_handling"));
    assert.ok(nogo.some(p => p.id === "map.hook_block_early_exit"));
  });

  it("exercises failure/recovery/NO-GO path probes with full alignment", () => {
    const results = runPipelineBehaviorMapProbes();
    const summary = summarizeBehaviorMapMatrix(results);

    assert.equal(summary.total, 26);
    assert.equal(summary.mismatches.length, 0, formatMismatchReport(summary.mismatches));
    assert.equal(summary.knownGaps.length, 0);

    for (const cat of ["failure_path", "recovery_path", "nogo_path"] as const) {
      const bucket = summary.byCategory[cat];
      assert.ok(bucket, `missing category summary: ${cat}`);
      assert.equal(bucket.total, 3);
      assert.equal(bucket.aligned, 3);
    }

    const failureProbes = results.filter(r => r.category === "failure_path");
    assert.equal(failureProbes.every(p => p.aligned), true);
    const recoveryProbes = results.filter(r => r.category === "recovery_path");
    assert.equal(recoveryProbes.every(p => p.aligned), true);
    const nogoProbes = results.filter(r => r.category === "nogo_path");
    assert.equal(nogoProbes.every(p => p.aligned), true);
  });
});

describe("Forge Pipeline Behavior Map Property/Fuzz — P01-B02-A07", () => {
  it("passes structural property checks on canonical contract", async () => {
    const { runBehaviorMapPropertyChecks, FORGE_PIPELINE_BEHAVIOR_MAP_CONTRACT_V1 } = await import(
      "./forge-pipeline-behavior-map.js"
    );
    const result = runBehaviorMapPropertyChecks(FORGE_PIPELINE_BEHAVIOR_MAP_CONTRACT_V1);
    assert.equal(result.allPassed, true, result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"));
  });

  it("rejects fuzz-mutated fixtures and corrupted run records", async () => {
    const fixture = loadPipelineBehaviorMapFixture();
    const contract = getActivePipelineBehaviorMapContract();
    const { runBehaviorMapFuzzValidation, runBehaviorMapRunRecordFuzzValidation } = await import(
      "./forge-pipeline-behavior-map.js"
    );
    const fuzz = runBehaviorMapFuzzValidation(fixture, contract, 42, 24);
    assert.equal(fuzz.allMutationsRejected, true);

    const record = runPipelineBehaviorMapProbesWithRecord();
    const recordFuzz = runBehaviorMapRunRecordFuzzValidation(record, contract);
    assert.equal(recordFuzz.validBaseline, true);
    assert.equal(recordFuzz.mutationsAccepted, 0);
  });
});

describe("Forge Pipeline Behavior Map Evidence — P01-B02-A06", () => {
  it("builds typed probe evidence with disposition and criterion", () => {
    const evidence = buildBehaviorMapProbeEvidence(
      "map.vision_phase_presence",
      "vision",
      "phase_presence",
      "PASS",
      "PASS",
      true,
      'orchestrator.ts contains phase_start with phase "vision"',
      "vision_start=true",
      "observed",
      "2026-07-18T22:00:00.000Z",
    );
    assert.equal(evidence.probeId, "map.vision_phase_presence");
    assert.equal(evidence.category, "phase_presence");
    assert.equal(evidence.disposition, "observed");
    assert.equal(evidence.aligned, true);
    assert.equal(evidence.recordedAt, "2026-07-18T22:00:00.000Z");
  });

  it("builds telemetry with non-negative duration and sequence index", () => {
    const telemetry = buildBehaviorMapProbeTelemetry("map.atom_retry_loop", "failure_path", 18, 4.2);
    assert.equal(telemetry.sequenceIndex, 18);
    assert.equal(telemetry.durationMs, 4.2);
    assert.equal(telemetry.category, "failure_path");
  });

  it("validates complete run record against contract probe count", () => {
    const fixture = loadPipelineBehaviorMapFixture();
    const contract = getActivePipelineBehaviorMapContract();
    const probeIds = listBehaviorMapProbeIds(contract);
    const startedAt = "2026-07-18T22:00:00.000Z";
    const completedAt = "2026-07-18T22:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildBehaviorMapProbeEvidence(
        id,
        probe.phase,
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
      return buildBehaviorMapProbeTelemetry(id, probe.category, index, index * 0.1);
    });

    const provenance = buildBehaviorMapProvenance(
      "test-run-id",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      "abc1234",
    );

    const record = buildBehaviorMapRunRecord(provenance, evidence, telemetry);
    const validation = validateBehaviorMapRunRecord(record, contract);

    assert.equal(record.summary.total, 26);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 3);
    assert.ok(record.summary.byDisposition.recovery >= 3);
    assert.ok(record.summary.byDisposition.nogo >= 3);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBaselineAtom, fixture.sourceBaseline.atom);
  });

  it("records evidence, telemetry and provenance for full behavior map run", () => {
    const record = runPipelineBehaviorMapProbesWithRecord();
    const validation = validateBehaviorMapRunRecord(record);

    assert.equal(record.evidence.length, 26);
    assert.equal(record.telemetry.length, 26);
    assert.equal(record.provenance.totalProbes, 26);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, "1.0.0");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);

    for (const item of record.telemetry) {
      assert.ok(item.durationMs >= 0, `${item.probeId} negative duration`);
      assert.ok(Number.isFinite(item.sequenceIndex));
    }

    for (const item of record.evidence) {
      assert.ok(item.criterion.length > 0, `${item.probeId} missing criterion in evidence`);
      assert.ok(item.recordedAt.length > 10);
      assert.ok(
        item.disposition === "observed" ||
          item.disposition === "gap" ||
          item.disposition === "failure" ||
          item.disposition === "recovery" ||
          item.disposition === "nogo",
      );
    }
  });
});
