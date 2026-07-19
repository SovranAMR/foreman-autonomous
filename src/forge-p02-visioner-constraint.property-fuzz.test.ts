import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerConstraintBaseline,
  runVisionerConstraintFailureRecoverySliceWithRecord,
} from "./forge-p02-visioner-constraint.probe.js";
import {
  FORGE_VISIONER_CONSTRAINT_CONTRACT_V1,
  buildVisionerConstraintProbeEvidence,
  buildVisionerConstraintProbeTelemetry,
  buildVisionerConstraintProvenance,
  buildVisionerConstraintRunRecord,
  createVisionerConstraintFuzzRng,
  getActiveVisionerConstraintContract,
  listVisionerConstraintContractProbeIds,
  runVisionerConstraintFuzzValidation,
  runVisionerConstraintPropertyChecks,
  runVisionerConstraintRunRecordFuzzValidation,
  validateVisionerConstraintFailureRecoveryRunRecord,
  validateVisionerConstraintRunRecord,
} from "./forge-p02-visioner-constraint.js";

describe("Forge Visioner Constraint — P02-B02-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runVisionerConstraintPropertyChecks(FORGE_VISIONER_CONSTRAINT_CONTRACT_V1);
    assert.equal(result.allPassed, true, result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"));
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createVisionerConstraintFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createVisionerConstraintFuzzRng(1337);
    const rngB = createVisionerConstraintFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createVisionerConstraintFuzzRng(1338)()));
  });
});

describe("Forge Visioner Constraint — P02-B02-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadVisionerConstraintBaseline();
    const contract = getActiveVisionerConstraintContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runVisionerConstraintFuzzValidation(fixture, contract, seed, 24);
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

describe("Forge Visioner Constraint — P02-B02-A07 run record fuzz validation", () => {
  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveVisionerConstraintContract();
    const record = runVisionerConstraintFailureRecoverySliceWithRecord();

    assert.equal(
      validateVisionerConstraintFailureRecoveryRunRecord(record, contract).valid,
      true,
      validateVisionerConstraintFailureRecoveryRunRecord(record, contract).issues.map(i => i.detail).join("\n"),
    );

    const fuzz = runVisionerConstraintRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveVisionerConstraintContract();
    const fixture = loadVisionerConstraintBaseline();
    const probeIds = listVisionerConstraintContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildVisionerConstraintProbeEvidence(
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
      return buildVisionerConstraintProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildVisionerConstraintProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildVisionerConstraintRunRecord(provenance, evidence, telemetry);

    assert.equal(validateVisionerConstraintRunRecord(record, contract).valid, true);

    const fuzz = runVisionerConstraintRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});
