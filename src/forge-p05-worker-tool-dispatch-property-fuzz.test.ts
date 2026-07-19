import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FORGE_WORKER_TOOL_DISPATCH_CONTRACT_V1,
  buildWorkerToolDispatchProbeEvidence,
  buildWorkerToolDispatchProbeRunTelemetry,
  buildWorkerToolDispatchProvenance,
  buildWorkerToolDispatchRunRecord,
  createWorkerToolDispatchFuzzRng,
  getActiveWorkerToolDispatchContract,
  listWorkerToolDispatchContractProbeIds,
  loadWorkerToolDispatchBaseline,
  runWorkerToolDispatchFailureRecoverySliceWithRecord,
  runWorkerToolDispatchFuzzValidation,
  runWorkerToolDispatchPropertyFuzzSlice,
  runWorkerToolDispatchPropertyValidation,
  runWorkerToolDispatchRunRecordFuzzValidation,
  validateWorkerToolDispatchEvidenceRunRecord,
  validateWorkerToolDispatchPropertyProbeMatrix,
  validateWorkerToolDispatchRunRecord,
  FORGE_WORKER_TOOL_DISPATCH_VERSION,
} from "./forge-p05-worker-tool-dispatch.js";

describe("Forge Worker Tool Dispatch — P05-B01-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runWorkerToolDispatchPropertyValidation(
      FORGE_WORKER_TOOL_DISPATCH_CONTRACT_V1,
    );
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createWorkerToolDispatchFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createWorkerToolDispatchFuzzRng(1337);
    const rngB = createWorkerToolDispatchFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(
      seqA,
      Array.from({ length: 5 }, () => createWorkerToolDispatchFuzzRng(1338)()),
    );
  });
});

describe("Forge Worker Tool Dispatch — P05-B01-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadWorkerToolDispatchBaseline();
    const contract = getActiveWorkerToolDispatchContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runWorkerToolDispatchFuzzValidation(fixture, contract, seed, 24);
      assert.equal(fuzz.iterations, 24);
      assert.equal(fuzz.rejected, 24, `seed=${seed} accepted=${fuzz.accepted}`);
      assert.equal(fuzz.allMutationsRejected, true);
      for (const item of fuzz.cases) {
        assert.equal(
          item.valid,
          false,
          `${item.mutation.kind}@${item.mutation.probeId} should fail`,
        );
        assert.ok(item.issueKinds.length > 0);
      }
    }
  });
});

describe("Forge Worker Tool Dispatch — P05-B01-A07 run record fuzz validation", () => {
  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveWorkerToolDispatchContract();
    const record = runWorkerToolDispatchFailureRecoverySliceWithRecord();

    assert.equal(
      validateWorkerToolDispatchEvidenceRunRecord(record, contract).valid,
      true,
      validateWorkerToolDispatchEvidenceRunRecord(record, contract)
        .issues.map(i => i.detail)
        .join("\n"),
    );

    const fuzz = runWorkerToolDispatchRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveWorkerToolDispatchContract();
    const fixture = loadWorkerToolDispatchBaseline();
    const probeIds = listWorkerToolDispatchContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildWorkerToolDispatchProbeEvidence(
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
      return buildWorkerToolDispatchProbeRunTelemetry(
        id,
        probe.category,
        index,
        index * 0.05,
      );
    });

    const provenance = buildWorkerToolDispatchProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildWorkerToolDispatchRunRecord(provenance, evidence, telemetry);

    assert.equal(validateWorkerToolDispatchRunRecord(record, contract).valid, true);

    const fuzz = runWorkerToolDispatchRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});

describe("Forge Worker Tool Dispatch Property/Fuzz Slice — P05-B01-A07", () => {
  it("executes property/fuzz slice with zero accepted mutations", () => {
    const slice = runWorkerToolDispatchPropertyFuzzSlice();

    assert.equal(slice.atom, "P05-B01-A07");
    assert.equal(slice.propertyChecksPassed, true);
    assert.equal(slice.contractFuzzRejected, true);
    assert.equal(slice.runRecordFuzzRejected, true);
    assert.equal(slice.propertyResult.allPassed, true);
    assert.equal(slice.propertyResult.total, 8);
    assert.equal(slice.contractFuzz.allMutationsRejected, true);
    assert.equal(slice.contractFuzz.accepted, 0);
    assert.equal(slice.runRecordFuzz.validBaseline, true);
    assert.equal(slice.runRecordFuzz.mutationsAccepted, 0);
    assert.equal(slice.runRecordFuzz.mutationsRejected, 5);
    assert.equal(FORGE_WORKER_TOOL_DISPATCH_VERSION, "1.0.0-a10");
  });

  it("maps property_checks + fuzz_mutations through validateWorkerToolDispatchPropertyProbeMatrix", () => {
    const slice = runWorkerToolDispatchPropertyFuzzSlice();
    const matrixValidation = validateWorkerToolDispatchPropertyProbeMatrix(slice);

    assert.equal(matrixValidation.valid, true, matrixValidation.issues.map(i => i.detail).join("\n"));
    assert.equal(matrixValidation.unexpectedMismatches, 0);
    assert.equal(matrixValidation.propertyChecksAligned, 8);
    assert.ok(matrixValidation.fuzzMutationsAligned > 0);
  });
});
