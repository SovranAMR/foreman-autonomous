import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerScoringBaseline,
  runVisionerScoringFailureRecoverySliceWithRecord,
} from "./forge-p02-visioner-scoring.probe.js";
import {
  FORGE_VISIONER_SCORING_CONTRACT_V1,
  buildVisionerScoringProbeEvidence,
  buildVisionerScoringProbeTelemetry,
  buildVisionerScoringProvenance,
  buildVisionerScoringRunRecord,
  createVisionerScoringFuzzRng,
  getActiveVisionerScoringContract,
  listVisionerScoringContractProbeIds,
  runVisionerScoringFuzzValidation,
  runVisionerScoringPropertyChecks,
  runVisionerScoringRunRecordFuzzValidation,
  validateVisionerScoringFailureRecoveryRunRecord,
  validateVisionerScoringRunRecord,
} from "./forge-p02-visioner-scoring.js";

describe("Forge Visioner Scoring — P02-B08-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runVisionerScoringPropertyChecks(FORGE_VISIONER_SCORING_CONTRACT_V1);
    assert.equal(result.allPassed, true, result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"));
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createVisionerScoringFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createVisionerScoringFuzzRng(1337);
    const rngB = createVisionerScoringFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createVisionerScoringFuzzRng(1338)()));
  });
});

describe("Forge Visioner Scoring — P02-B08-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadVisionerScoringBaseline();
    const contract = getActiveVisionerScoringContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runVisionerScoringFuzzValidation(fixture, contract, seed, 24);
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

describe("Forge Visioner Scoring — P02-B08-A07 run record fuzz validation", () => {
  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveVisionerScoringContract();
    const record = runVisionerScoringFailureRecoverySliceWithRecord();

    assert.equal(
      validateVisionerScoringFailureRecoveryRunRecord(record, contract).valid,
      true,
      validateVisionerScoringFailureRecoveryRunRecord(record, contract).issues.map(i => i.detail).join("\n"),
    );

    const fuzz = runVisionerScoringRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveVisionerScoringContract();
    const fixture = loadVisionerScoringBaseline();
    const probeIds = listVisionerScoringContractProbeIds(contract);
    const startedAt = "2026-07-19T03:00:00.000Z";
    const completedAt = "2026-07-19T03:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildVisionerScoringProbeEvidence(
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
      return buildVisionerScoringProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildVisionerScoringProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildVisionerScoringRunRecord(provenance, evidence, telemetry);

    assert.equal(validateVisionerScoringRunRecord(record, contract).valid, true);

    const fuzz = runVisionerScoringRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});
