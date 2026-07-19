import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkerToolDispatchProbeEvidence,
  buildWorkerToolDispatchProbeRunTelemetry,
  buildWorkerToolDispatchProvenance,
  buildWorkerToolDispatchRunRecord,
  loadWorkerToolDispatchBaseline,
  runWorkerToolDispatchEvidenceSlice,
  runWorkerToolDispatchFailureRecoverySliceWithRecord,
  runWorkerToolDispatchProbesWithRecord,
  validateWorkerToolDispatchEvidenceProbeMatrix,
  validateWorkerToolDispatchEvidenceRunRecord,
  validateWorkerToolDispatchRunRecord,
  listWorkerToolDispatchFailureRecoveryProbeIds,
  listWorkerToolDispatchContractProbesByCategory,
  getActiveWorkerToolDispatchContract,
  WORKER_TOOL_DISPATCH_FAILURE_RECOVERY_CATEGORIES,
  FORGE_WORKER_TOOL_DISPATCH_VERSION,
} from "./forge-p05-worker-tool-dispatch.js";

describe("Forge Worker Tool Dispatch Evidence — P05-B01-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadWorkerToolDispatchBaseline();
    const contract = getActiveWorkerToolDispatchContract();
    const probeIds = listWorkerToolDispatchFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildWorkerToolDispatchProbeEvidence(
        probeId,
        contractProbe.category,
        contractProbe.expected,
        contractProbe.expected,
        true,
        contractProbe.criterion,
        "synthetic",
        contractProbe.disposition,
        completedAt,
      );
    });

    const telemetry = probeIds.map((probeId, index) => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildWorkerToolDispatchProbeRunTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildWorkerToolDispatchProvenance(
      "run-wtd-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P05-B01-A06",
        sliceCategories: WORKER_TOOL_DISPATCH_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildWorkerToolDispatchRunRecord(provenance, evidence, telemetry);
    const validation = validateWorkerToolDispatchEvidenceRunRecord(record, contract);

    assert.equal(record.summary.total, 7);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.nogo >= 3);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBlockGateAtom, fixture.sourceBlockGate.atom);
  });

  it("executes evidence slice with zero unexpected mismatches and valid run record", () => {
    const contract = getActiveWorkerToolDispatchContract();
    const slice = runWorkerToolDispatchEvidenceSlice();

    assert.equal(slice.atom, "P05-B01-A06");
    assert.equal(slice.evidenceProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.recordValidation.valid, true, slice.recordValidation.issues.map(i => i.detail).join("\n"));

    for (const category of WORKER_TOOL_DISPATCH_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listWorkerToolDispatchContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.evidenceResults.find(r => r.id === probe.id);
        assert.ok(result, `missing evidence result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const record = slice.record;
    assert.equal(record.evidence.length, 7);
    assert.equal(record.telemetry.length, 7);
    assert.equal(record.provenance.totalProbes, 7);
    assert.equal(record.provenance.sliceAtom, "P05-B01-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_WORKER_TOOL_DISPATCH_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a09");
    assert.equal(record.summary.mismatches, 0);

    for (const item of record.telemetry) {
      assert.ok(item.durationMs >= 0, `${item.probeId} negative duration`);
      assert.ok(Number.isFinite(item.sequenceIndex));
    }

    for (const item of record.evidence) {
      const contractProbe = contract.probes.find(p => p.id === item.probeId)!;
      assert.ok(item.criterion.length > 0, `${item.probeId} missing criterion in evidence`);
      assert.equal(item.criterion, contractProbe.criterion);
      assert.equal(item.disposition, contractProbe.disposition);
      assert.ok(item.recordedAt.length > 10);
    }

    const dispatchTelemetry = record.evidence.find(e => e.probeId === "wtd.dispatch_telemetry_record");
    assert.ok(dispatchTelemetry);
    assert.equal(dispatchTelemetry!.aligned, true);
    assert.equal(dispatchTelemetry!.expected, "PASS");
    assert.equal(dispatchTelemetry!.actual, "PASS");
    assert.equal(dispatchTelemetry!.disposition, "nogo");
  });

  it("records evidence, telemetry and provenance for full worker tool dispatch run", () => {
    const contract = getActiveWorkerToolDispatchContract();
    const record = runWorkerToolDispatchProbesWithRecord();
    const validation = validateWorkerToolDispatchRunRecord(record, contract);

    assert.equal(record.evidence.length, 27);
    assert.equal(record.telemetry.length, 27);
    assert.equal(record.provenance.totalProbes, 27);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a09");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 27);
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveWorkerToolDispatchContract();
    const record = runWorkerToolDispatchFailureRecoverySliceWithRecord();
    const validation = validateWorkerToolDispatchEvidenceRunRecord(record, contract);

    assert.equal(record.evidence.length, 7);
    assert.equal(record.telemetry.length, 7);
    assert.equal(record.provenance.sliceAtom, "P05-B01-A06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
  });

  it("maps evidence_path probes through validateWorkerToolDispatchEvidenceProbeMatrix", () => {
    const contract = getActiveWorkerToolDispatchContract();
    const slice = runWorkerToolDispatchEvidenceSlice();
    const matrixValidation = validateWorkerToolDispatchEvidenceProbeMatrix(
      slice.results,
      contract,
    );

    assert.equal(matrixValidation.valid, true);
    assert.equal(matrixValidation.unexpectedMismatches, 0);
    assert.equal(matrixValidation.passAligned, 7);
  });
});
