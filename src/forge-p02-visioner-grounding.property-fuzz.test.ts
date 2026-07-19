import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerGroundingBaseline,
  runVisionerGroundingFailureRecoverySliceWithRecord,
} from "./forge-p02-visioner-grounding.probe.js";
import {
  FORGE_VISIONER_GROUNDING_CONTRACT_V1,
  buildVisionerGroundingProbeEvidence,
  buildVisionerGroundingProbeTelemetry,
  buildVisionerGroundingProvenance,
  buildVisionerGroundingRunRecord,
  createVisionerGroundingFuzzRng,
  getActiveVisionerGroundingContract,
  listVisionerGroundingContractProbeIds,
  runVisionerGroundingFuzzValidation,
  runVisionerGroundingPropertyChecks,
  runVisionerGroundingRunRecordFuzzValidation,
  validateVisionerGroundingFailureRecoveryRunRecord,
  validateVisionerGroundingRunRecord,
} from "./forge-p02-visioner-grounding.js";

describe("Forge Visioner Grounding — P02-B04-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runVisionerGroundingPropertyChecks(FORGE_VISIONER_GROUNDING_CONTRACT_V1);
    assert.equal(result.allPassed, true, result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"));
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createVisionerGroundingFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createVisionerGroundingFuzzRng(1337);
    const rngB = createVisionerGroundingFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createVisionerGroundingFuzzRng(1338)()));
  });
});

describe("Forge Visioner Grounding — P02-B04-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadVisionerGroundingBaseline();
    const contract = getActiveVisionerGroundingContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runVisionerGroundingFuzzValidation(fixture, contract, seed, 24);
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

describe("Forge Visioner Grounding — P02-B04-A07 run record fuzz validation", () => {
  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveVisionerGroundingContract();
    const record = runVisionerGroundingFailureRecoverySliceWithRecord();

    assert.equal(
      validateVisionerGroundingFailureRecoveryRunRecord(record, contract).valid,
      true,
      validateVisionerGroundingFailureRecoveryRunRecord(record, contract).issues.map(i => i.detail).join("\n"),
    );

    const fuzz = runVisionerGroundingRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveVisionerGroundingContract();
    const fixture = loadVisionerGroundingBaseline();
    const probeIds = listVisionerGroundingContractProbeIds(contract);
    const startedAt = "2026-07-19T03:00:00.000Z";
    const completedAt = "2026-07-19T03:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildVisionerGroundingProbeEvidence(
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
      return buildVisionerGroundingProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildVisionerGroundingProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildVisionerGroundingRunRecord(provenance, evidence, telemetry);

    assert.equal(validateVisionerGroundingRunRecord(record, contract).valid, true);

    const fuzz = runVisionerGroundingRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});
