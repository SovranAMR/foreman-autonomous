import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FORGE_WORKER_SHELL_PROCESS_CONTRACT_V1,
  buildWorkerShellProcessProbeEvidence,
  buildWorkerShellProcessProbeRunTelemetry,
  buildWorkerShellProcessProvenance,
  buildWorkerShellProcessRunRecord,
  createWorkerShellProcessFuzzRng,
  getActiveWorkerShellProcessContract,
  listWorkerShellProcessContractProbeIds,
  loadWorkerShellProcessBaseline,
  runWorkerShellProcessFailureRecoverySliceWithRecord,
  runWorkerShellProcessFuzzValidation,
  runWorkerShellProcessPropertyFuzzSlice,
  runWorkerShellProcessPropertyValidation,
  runWorkerShellProcessRunRecordFuzzValidation,
  validateWorkerShellProcessEvidenceRunRecord,
  validateWorkerShellProcessPropertyProbeMatrix,
  validateWorkerShellProcessRunRecord,
  FORGE_WORKER_SHELL_PROCESS_VERSION,
} from "./forge-p05-worker-shell-process.js";

describe("Forge Worker Shell Process — P05-B04-A07 property checks", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runWorkerShellProcessPropertyValidation(
      FORGE_WORKER_SHELL_PROCESS_CONTRACT_V1,
    );
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createWorkerShellProcessFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createWorkerShellProcessFuzzRng(1337);
    const rngB = createWorkerShellProcessFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(
      seqA,
      Array.from({ length: 5 }, () => createWorkerShellProcessFuzzRng(1338)()),
    );
  });
});

describe("Forge Worker Shell Process — P05-B04-A07 fixture fuzz validation", () => {
  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadWorkerShellProcessBaseline();
    const contract = getActiveWorkerShellProcessContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runWorkerShellProcessFuzzValidation(fixture, contract, seed, 24);
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

describe("Forge Worker Shell Process — P05-B04-A07 run record fuzz validation", () => {
  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveWorkerShellProcessContract();
    const record = runWorkerShellProcessFailureRecoverySliceWithRecord();

    assert.equal(
      validateWorkerShellProcessEvidenceRunRecord(record, contract).valid,
      true,
      validateWorkerShellProcessEvidenceRunRecord(record, contract)
        .issues.map(i => i.detail)
        .join("\n"),
    );

    const fuzz = runWorkerShellProcessRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveWorkerShellProcessContract();
    const fixture = loadWorkerShellProcessBaseline();
    const probeIds = listWorkerShellProcessContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildWorkerShellProcessProbeEvidence(
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
      return buildWorkerShellProcessProbeRunTelemetry(
        id,
        probe.category,
        index,
        index * 0.05,
      );
    });

    const provenance = buildWorkerShellProcessProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildWorkerShellProcessRunRecord(provenance, evidence, telemetry);

    assert.equal(validateWorkerShellProcessRunRecord(record, contract).valid, true);

    const fuzz = runWorkerShellProcessRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });
});

describe("Forge Worker Shell Process Property/Fuzz Slice — P05-B04-A07", () => {
  it("executes property/fuzz slice with zero accepted mutations", () => {
    const slice = runWorkerShellProcessPropertyFuzzSlice();

    assert.equal(slice.atom, "P05-B04-A07");
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
    assert.equal(FORGE_WORKER_SHELL_PROCESS_VERSION, "1.0.0-a07");
  });

  it("maps property_checks + fuzz_mutations through validateWorkerShellProcessPropertyProbeMatrix", () => {
    const slice = runWorkerShellProcessPropertyFuzzSlice();
    const matrixValidation = validateWorkerShellProcessPropertyProbeMatrix(slice);

    assert.equal(matrixValidation.valid, true, matrixValidation.issues.map(i => i.detail).join("\n"));
    assert.equal(matrixValidation.unexpectedMismatches, 0);
    assert.equal(matrixValidation.propertyChecksAligned, 8);
    assert.ok(matrixValidation.fuzzMutationsAligned > 0);
  });
});
