import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerUncertaintyBaseline,
  runVisionerUncertaintyFailureRecoverySliceWithRecord,
} from "./forge-p02-visioner-uncertainty.probe.js";
import {
  FORGE_VISIONER_UNCERTAINTY_CONTRACT_V1,
  buildVisionerUncertaintyProbeEvidence,
  buildVisionerUncertaintyProbeTelemetry,
  buildVisionerUncertaintyProvenance,
  buildVisionerUncertaintyRunRecord,
  createVisionerUncertaintyFuzzRng,
  getActiveVisionerUncertaintyContract,
  listVisionerUncertaintyContractProbeIds,
  runVisionerUncertaintyFuzzValidation,
  runVisionerUncertaintyPropertyChecks,
  runVisionerUncertaintyRunRecordFuzzValidation,
  validateVisionerUncertaintyFailureRecoveryRunRecord,
  validateVisionerUncertaintyRunRecord,
} from "./forge-p02-visioner-uncertainty.js";

describe("Forge Visioner Uncertainty — P02-B06-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runVisionerUncertaintyPropertyChecks(FORGE_VISIONER_UNCERTAINTY_CONTRACT_V1);
    assert.equal(result.allPassed, true, result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"));
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createVisionerUncertaintyFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createVisionerUncertaintyFuzzRng(1337);
    const rngB = createVisionerUncertaintyFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createVisionerUncertaintyFuzzRng(1338)()));
  });
});

describe("Forge Visioner Uncertainty — P02-B06-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadVisionerUncertaintyBaseline();
    const contract = getActiveVisionerUncertaintyContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runVisionerUncertaintyFuzzValidation(fixture, contract, seed, 24);
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

describe("Forge Visioner Uncertainty — P02-B06-A07 run record fuzz validation", () => {
  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveVisionerUncertaintyContract();
    const record = runVisionerUncertaintyFailureRecoverySliceWithRecord();

    assert.equal(
      validateVisionerUncertaintyFailureRecoveryRunRecord(record, contract).valid,
      true,
      validateVisionerUncertaintyFailureRecoveryRunRecord(record, contract).issues.map(i => i.detail).join("\n"),
    );

    const fuzz = runVisionerUncertaintyRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveVisionerUncertaintyContract();
    const fixture = loadVisionerUncertaintyBaseline();
    const probeIds = listVisionerUncertaintyContractProbeIds(contract);
    const startedAt = "2026-07-19T03:00:00.000Z";
    const completedAt = "2026-07-19T03:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildVisionerUncertaintyProbeEvidence(
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
      return buildVisionerUncertaintyProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildVisionerUncertaintyProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildVisionerUncertaintyRunRecord(provenance, evidence, telemetry);

    assert.equal(validateVisionerUncertaintyRunRecord(record, contract).valid, true);

    const fuzz = runVisionerUncertaintyRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});
