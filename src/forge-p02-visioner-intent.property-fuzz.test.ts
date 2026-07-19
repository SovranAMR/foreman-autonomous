import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerIntentBaseline,
  runVisionerIntentFailureRecoverySliceWithRecord,
} from "./forge-p02-visioner-intent.probe.js";
import {
  FORGE_VISIONER_INTENT_CONTRACT_V1,
  buildVisionerIntentProbeEvidence,
  buildVisionerIntentProbeTelemetry,
  buildVisionerIntentProvenance,
  buildVisionerIntentRunRecord,
  createVisionerIntentFuzzRng,
  getActiveVisionerIntentContract,
  listVisionerIntentContractProbeIds,
  runVisionerIntentFuzzValidation,
  runVisionerIntentPropertyChecks,
  runVisionerIntentRunRecordFuzzValidation,
  validateVisionerIntentFailureRecoveryRunRecord,
  validateVisionerIntentRunRecord,
} from "./forge-p02-visioner-intent.js";

describe("Forge Visioner Intent — P02-B01-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runVisionerIntentPropertyChecks(FORGE_VISIONER_INTENT_CONTRACT_V1);
    assert.equal(result.allPassed, true, result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"));
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createVisionerIntentFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createVisionerIntentFuzzRng(1337);
    const rngB = createVisionerIntentFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createVisionerIntentFuzzRng(1338)()));
  });
});

describe("Forge Visioner Intent — P02-B01-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadVisionerIntentBaseline();
    const contract = getActiveVisionerIntentContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runVisionerIntentFuzzValidation(fixture, contract, seed, 24);
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

describe("Forge Visioner Intent — P02-B01-A07 run record fuzz validation", () => {
  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveVisionerIntentContract();
    const record = runVisionerIntentFailureRecoverySliceWithRecord();

    assert.equal(
      validateVisionerIntentFailureRecoveryRunRecord(record, contract).valid,
      true,
      validateVisionerIntentFailureRecoveryRunRecord(record, contract).issues.map(i => i.detail).join("\n"),
    );

    const fuzz = runVisionerIntentRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveVisionerIntentContract();
    const fixture = loadVisionerIntentBaseline();
    const probeIds = listVisionerIntentContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildVisionerIntentProbeEvidence(
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
      return buildVisionerIntentProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildVisionerIntentProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildVisionerIntentRunRecord(provenance, evidence, telemetry);

    assert.equal(validateVisionerIntentRunRecord(record, contract).valid, true);

    const fuzz = runVisionerIntentRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});
