import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadPipelineBehaviorMapFixture } from "./forge-pipeline-behavior-map-harness.js";
import {
  FORGE_PIPELINE_BEHAVIOR_MAP_CONTRACT_V1,
  buildBehaviorMapProbeEvidence,
  buildBehaviorMapProbeTelemetry,
  buildBehaviorMapProvenance,
  buildBehaviorMapRunRecord,
  createBehaviorMapFuzzRng,
  getActivePipelineBehaviorMapContract,
  listBehaviorMapProbeIds,
  runBehaviorMapFuzzValidation,
  runBehaviorMapPropertyChecks,
  runBehaviorMapRunRecordFuzzValidation,
  validateBehaviorMapRunRecord,
} from "./forge-pipeline-behavior-map.js";

describe("Forge Pipeline Behavior Map — P01-B02-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runBehaviorMapPropertyChecks(FORGE_PIPELINE_BEHAVIOR_MAP_CONTRACT_V1);
    assert.equal(result.allPassed, true, result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"));
    assert.equal(result.passed, result.total);
    assert.ok(result.total >= 7);
  });

  it("createBehaviorMapFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createBehaviorMapFuzzRng(1337);
    const rngB = createBehaviorMapFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createBehaviorMapFuzzRng(1338)()));
  });
});

describe("Forge Pipeline Behavior Map — P01-B02-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadPipelineBehaviorMapFixture();
    const contract = getActivePipelineBehaviorMapContract();

    for (const seed of [42, 99, 20260718]) {
      const fuzz = runBehaviorMapFuzzValidation(fixture, contract, seed, 24);
      assert.equal(fuzz.iterations, 24);
      assert.equal(fuzz.rejected, 24, `seed=${seed} accepted=${fuzz.accepted}`);
      assert.equal(fuzz.allMutationsRejected, true);
      for (const item of fuzz.cases) {
        assert.equal(item.valid, false, `${item.mutation.kind}@${item.mutation.probeId} should fail`);
        assert.ok(item.issueKinds.length > 0);
      }
    }
  });
});

describe("Forge Pipeline Behavior Map — P01-B02-A07 run record fuzz validation", () => {
  it("accepts valid behavior map record and rejects corrupted mutations", () => {
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
      return buildBehaviorMapProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildBehaviorMapProvenance(
      "property-fuzz-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildBehaviorMapRunRecord(provenance, evidence, telemetry);

    assert.equal(validateBehaviorMapRunRecord(record, contract).valid, true);

    const fuzz = runBehaviorMapRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});
