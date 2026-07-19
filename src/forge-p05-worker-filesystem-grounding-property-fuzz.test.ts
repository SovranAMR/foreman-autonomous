import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FORGE_WORKER_FILESYSTEM_GROUNDING_CONTRACT_V1,
  buildWorkerFilesystemGroundingProbeEvidence,
  buildWorkerFilesystemGroundingProbeRunTelemetry,
  buildWorkerFilesystemGroundingProvenance,
  buildWorkerFilesystemGroundingRunRecord,
  createWorkerFilesystemGroundingFuzzRng,
  getActiveWorkerFilesystemGroundingContract,
  listWorkerFilesystemGroundingContractProbeIds,
  loadWorkerFilesystemGroundingBaseline,
  runWorkerFilesystemGroundingFailureRecoverySliceWithRecord,
  runWorkerFilesystemGroundingFuzzValidation,
  runWorkerFilesystemGroundingPropertyFuzzSlice,
  runWorkerFilesystemGroundingPropertyValidation,
  runWorkerFilesystemGroundingRunRecordFuzzValidation,
  validateWorkerFilesystemGroundingEvidenceRunRecord,
  validateWorkerFilesystemGroundingPropertyProbeMatrix,
  validateWorkerFilesystemGroundingRunRecord,
  FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION,
} from "./forge-p05-worker-filesystem-grounding.js";

describe("Forge Worker Filesystem Grounding — P05-B02-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runWorkerFilesystemGroundingPropertyValidation(
      FORGE_WORKER_FILESYSTEM_GROUNDING_CONTRACT_V1,
    );
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createWorkerFilesystemGroundingFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createWorkerFilesystemGroundingFuzzRng(1337);
    const rngB = createWorkerFilesystemGroundingFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(
      seqA,
      Array.from({ length: 5 }, () => createWorkerFilesystemGroundingFuzzRng(1338)()),
    );
  });
});

describe("Forge Worker Filesystem Grounding — P05-B02-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadWorkerFilesystemGroundingBaseline();
    const contract = getActiveWorkerFilesystemGroundingContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runWorkerFilesystemGroundingFuzzValidation(fixture, contract, seed, 24);
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

describe("Forge Worker Filesystem Grounding — P05-B02-A07 run record fuzz validation", () => {
  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveWorkerFilesystemGroundingContract();
    const record = runWorkerFilesystemGroundingFailureRecoverySliceWithRecord();

    assert.equal(
      validateWorkerFilesystemGroundingEvidenceRunRecord(record, contract).valid,
      true,
      validateWorkerFilesystemGroundingEvidenceRunRecord(record, contract)
        .issues.map(i => i.detail)
        .join("\n"),
    );

    const fuzz = runWorkerFilesystemGroundingRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveWorkerFilesystemGroundingContract();
    const fixture = loadWorkerFilesystemGroundingBaseline();
    const probeIds = listWorkerFilesystemGroundingContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildWorkerFilesystemGroundingProbeEvidence(
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
      return buildWorkerFilesystemGroundingProbeRunTelemetry(
        id,
        probe.category,
        index,
        index * 0.05,
      );
    });

    const provenance = buildWorkerFilesystemGroundingProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildWorkerFilesystemGroundingRunRecord(provenance, evidence, telemetry);

    assert.equal(validateWorkerFilesystemGroundingRunRecord(record, contract).valid, true);

    const fuzz = runWorkerFilesystemGroundingRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});

describe("Forge Worker Filesystem Grounding Property/Fuzz Slice — P05-B02-A07", () => {
  it("executes property/fuzz slice with zero accepted mutations", () => {
    const slice = runWorkerFilesystemGroundingPropertyFuzzSlice();

    assert.equal(slice.atom, "P05-B02-A07");
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
    assert.equal(FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION, "1.0.0-a09");
  });

  it("maps property_checks + fuzz_mutations through validateWorkerFilesystemGroundingPropertyProbeMatrix", () => {
    const slice = runWorkerFilesystemGroundingPropertyFuzzSlice();
    const matrixValidation = validateWorkerFilesystemGroundingPropertyProbeMatrix(slice);

    assert.equal(matrixValidation.valid, true, matrixValidation.issues.map(i => i.detail).join("\n"));
    assert.equal(matrixValidation.unexpectedMismatches, 0);
    assert.equal(matrixValidation.propertyChecksAligned, 8);
    assert.ok(matrixValidation.fuzzMutationsAligned > 0);
  });
});
