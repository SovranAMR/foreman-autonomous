import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadPhaseEventSchemaFixture } from "./forge-phase-event-schema-harness.js";
import {
  FORGE_PHASE_EVENT_SCHEMA_CONTRACT_V1,
  buildPhaseEventSchemaProbeEvidence,
  buildPhaseEventSchemaProbeTelemetry,
  buildPhaseEventSchemaProvenance,
  buildPhaseEventSchemaRunRecord,
  createPhaseEventSchemaFuzzRng,
  getActivePhaseEventSchemaContract,
  listPhaseEventSchemaContractProbeIds,
  runPhaseEventSchemaFuzzValidation,
  runPhaseEventSchemaPropertyChecks,
  runPhaseEventSchemaRunRecordFuzzValidation,
  validatePhaseEventSchemaRunRecord,
} from "./forge-phase-event-schema.js";

describe("Forge Phase/Event Schema — P01-B04-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runPhaseEventSchemaPropertyChecks(FORGE_PHASE_EVENT_SCHEMA_CONTRACT_V1);
    assert.equal(result.allPassed, true, result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"));
    assert.equal(result.passed, result.total);
    assert.ok(result.total >= 7);
  });

  it("createPhaseEventSchemaFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createPhaseEventSchemaFuzzRng(1337);
    const rngB = createPhaseEventSchemaFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createPhaseEventSchemaFuzzRng(1338)()));
  });
});

describe("Forge Phase/Event Schema — P01-B04-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadPhaseEventSchemaFixture();
    const contract = getActivePhaseEventSchemaContract();

    for (const seed of [42, 99, 20260718]) {
      const fuzz = runPhaseEventSchemaFuzzValidation(fixture, contract, seed, 24);
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

describe("Forge Phase/Event Schema — P01-B04-A07 run record fuzz validation", () => {
  it("accepts valid phase/event schema record and rejects corrupted mutations", () => {
    const fixture = loadPhaseEventSchemaFixture();
    const contract = getActivePhaseEventSchemaContract();
    const probeIds = listPhaseEventSchemaContractProbeIds(contract);
    const startedAt = "2026-07-18T22:00:00.000Z";
    const completedAt = "2026-07-18T22:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildPhaseEventSchemaProbeEvidence(
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
      return buildPhaseEventSchemaProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildPhaseEventSchemaProvenance(
      "property-fuzz-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildPhaseEventSchemaRunRecord(provenance, evidence, telemetry);

    assert.equal(validatePhaseEventSchemaRunRecord(record, contract).valid, true);

    const fuzz = runPhaseEventSchemaRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});
