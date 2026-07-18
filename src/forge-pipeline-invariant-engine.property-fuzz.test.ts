import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadPipelineInvariantEngineFixture } from "./forge-pipeline-invariant-engine-harness.js";
import {
  FORGE_PIPELINE_INVARIANT_ENGINE_CONTRACT_V1,
  buildPipelineInvariantEngineProbeEvidence,
  buildPipelineInvariantEngineProbeTelemetry,
  buildPipelineInvariantEngineProvenance,
  buildPipelineInvariantEngineRunRecord,
  createPipelineInvariantEngineFuzzRng,
  getActivePipelineInvariantEngineContract,
  listPipelineInvariantEngineContractProbeIds,
  runPipelineInvariantEngineFuzzValidation,
  runPipelineInvariantEnginePropertyChecks,
  runPipelineInvariantEngineRunRecordFuzzValidation,
  validatePipelineInvariantEngineRunRecord,
} from "./forge-pipeline-invariant-engine.js";

describe("Forge Pipeline Invariant Engine — P01-B05-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runPipelineInvariantEnginePropertyChecks(FORGE_PIPELINE_INVARIANT_ENGINE_CONTRACT_V1);
    assert.equal(result.allPassed, true, result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"));
    assert.equal(result.passed, result.total);
    assert.ok(result.total >= 7);
  });

  it("createPipelineInvariantEngineFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createPipelineInvariantEngineFuzzRng(1337);
    const rngB = createPipelineInvariantEngineFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createPipelineInvariantEngineFuzzRng(1338)()));
  });
});

describe("Forge Pipeline Invariant Engine — P01-B05-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadPipelineInvariantEngineFixture();
    const contract = getActivePipelineInvariantEngineContract();

    for (const seed of [42, 99, 20260718]) {
      const fuzz = runPipelineInvariantEngineFuzzValidation(fixture, contract, seed, 24);
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

describe("Forge Pipeline Invariant Engine — P01-B05-A07 run record fuzz validation", () => {
  it("accepts valid invariant engine record and rejects corrupted mutations", () => {
    const fixture = loadPipelineInvariantEngineFixture();
    const contract = getActivePipelineInvariantEngineContract();
    const probeIds = listPipelineInvariantEngineContractProbeIds(contract);
    const startedAt = "2026-07-18T22:00:00.000Z";
    const completedAt = "2026-07-18T22:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildPipelineInvariantEngineProbeEvidence(
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
      return buildPipelineInvariantEngineProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildPipelineInvariantEngineProvenance(
      "property-fuzz-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildPipelineInvariantEngineRunRecord(provenance, evidence, telemetry);

    assert.equal(validatePipelineInvariantEngineRunRecord(record, contract).valid, true);

    const fuzz = runPipelineInvariantEngineRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});
