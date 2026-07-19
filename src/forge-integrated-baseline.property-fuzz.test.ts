import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadIntegratedBaseline, runIntegratedBaselineFailureRecoverySliceWithRecord } from "./forge-integrated-baseline.probe.js";
import {
  FORGE_INTEGRATED_BASELINE_CONTRACT_V1,
  buildIntegratedBaselineProbeEvidence,
  buildIntegratedBaselineProbeTelemetry,
  buildIntegratedBaselineProvenance,
  buildIntegratedBaselineRunRecord,
  createIntegratedBaselineFuzzRng,
  getActiveIntegratedBaselineContract,
  listIntegratedBaselineContractProbeIds,
  runIntegratedBaselineFuzzValidation,
  runIntegratedBaselinePropertyChecks,
  runIntegratedBaselineRunRecordFuzzValidation,
  validateIntegratedBaselineFailureRecoveryRunRecord,
  validateIntegratedBaselineRunRecord,
} from "./forge-integrated-baseline.js";

describe("Forge Integrated Baseline — P01-B10-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runIntegratedBaselinePropertyChecks(FORGE_INTEGRATED_BASELINE_CONTRACT_V1);
    assert.equal(result.allPassed, true, result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"));
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createIntegratedBaselineFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createIntegratedBaselineFuzzRng(1337);
    const rngB = createIntegratedBaselineFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createIntegratedBaselineFuzzRng(1338)()));
  });
});

describe("Forge Integrated Baseline — P01-B10-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadIntegratedBaseline();
    const contract = getActiveIntegratedBaselineContract();

    for (const seed of [42, 99, 20260718]) {
      const fuzz = runIntegratedBaselineFuzzValidation(fixture, contract, seed, 24);
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

describe("Forge Integrated Baseline — P01-B10-A07 run record fuzz validation", () => {
  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveIntegratedBaselineContract();
    const record = runIntegratedBaselineFailureRecoverySliceWithRecord();

    assert.equal(
      validateIntegratedBaselineFailureRecoveryRunRecord(record, contract).valid,
      true,
      validateIntegratedBaselineFailureRecoveryRunRecord(record, contract).issues.map(i => i.detail).join("\n"),
    );

    const fuzz = runIntegratedBaselineRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveIntegratedBaselineContract();
    const fixture = loadIntegratedBaseline();
    const probeIds = listIntegratedBaselineContractProbeIds(contract);
    const startedAt = "2026-07-18T23:00:00.000Z";
    const completedAt = "2026-07-18T23:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildIntegratedBaselineProbeEvidence(
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
      return buildIntegratedBaselineProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildIntegratedBaselineProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildIntegratedBaselineRunRecord(provenance, evidence, telemetry);

    assert.equal(validateIntegratedBaselineRunRecord(record, contract).valid, true);

    const fuzz = runIntegratedBaselineRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});
