import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkerShellProcessProbeEvidence,
  buildWorkerShellProcessProbeRunTelemetry,
  buildWorkerShellProcessProvenance,
  buildWorkerShellProcessRunRecord,
  loadWorkerShellProcessBaseline,
  runWorkerShellProcessEvidenceSlice,
  runWorkerShellProcessFailureRecoverySliceWithRecord,
  runWorkerShellProcessProbesWithRecord,
  validateWorkerShellProcessEvidenceProbeMatrix,
  validateWorkerShellProcessEvidenceRunRecord,
  validateWorkerShellProcessRunRecord,
  listWorkerShellProcessFailureRecoveryProbeIds,
  listWorkerShellProcessContractProbesByCategory,
  getActiveWorkerShellProcessContract,
  WORKER_SHELL_PROCESS_FAILURE_RECOVERY_CATEGORIES,
  FORGE_WORKER_SHELL_PROCESS_VERSION,
} from "./forge-p05-worker-shell-process.js";

describe("Forge Worker Shell Process Evidence — P05-B04-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadWorkerShellProcessBaseline();
    const contract = getActiveWorkerShellProcessContract();
    const probeIds = listWorkerShellProcessFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildWorkerShellProcessProbeEvidence(
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
      return buildWorkerShellProcessProbeRunTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildWorkerShellProcessProvenance(
      "run-wsp-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P05-B04-A06",
        sliceCategories: WORKER_SHELL_PROCESS_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildWorkerShellProcessRunRecord(provenance, evidence, telemetry);
    const validation = validateWorkerShellProcessEvidenceRunRecord(record, contract);

    assert.equal(record.summary.total, 7);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.nogo >= 0);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBlockGateAtom, fixture.sourceBlockGate.atom);
  });

  it("executes evidence slice with zero unexpected mismatches and valid run record", () => {
    const contract = getActiveWorkerShellProcessContract();
    const slice = runWorkerShellProcessEvidenceSlice();

    assert.equal(slice.atom, "P05-B04-A06");
    assert.equal(slice.evidenceProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(
      slice.recordValidation.valid,
      true,
      slice.recordValidation.issues.map(i => i.detail).join("\n"),
    );

    for (const category of WORKER_SHELL_PROCESS_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listWorkerShellProcessContractProbesByCategory(category, contract)) {
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
    assert.equal(record.provenance.sliceAtom, "P05-B04-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_WORKER_SHELL_PROCESS_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a08");
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

    const shellValidatorEvidence = record.evidence.find(
      e => e.probeId === "wsp.exported_shell_validator",
    );
    assert.ok(shellValidatorEvidence);
    assert.equal(shellValidatorEvidence!.aligned, true);
    assert.equal(shellValidatorEvidence!.expected, "PASS");
    assert.equal(shellValidatorEvidence!.actual, "PASS");
    assert.equal(shellValidatorEvidence!.disposition, "observed");
  });

  it("records evidence, telemetry and provenance for full worker shell process run", () => {
    const contract = getActiveWorkerShellProcessContract();
    const record = runWorkerShellProcessProbesWithRecord();
    const validation = validateWorkerShellProcessRunRecord(record, contract);

    assert.equal(record.evidence.length, 27);
    assert.equal(record.telemetry.length, 27);
    assert.equal(record.provenance.totalProbes, 27);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a08");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 27);
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveWorkerShellProcessContract();
    const record = runWorkerShellProcessFailureRecoverySliceWithRecord();
    const validation = validateWorkerShellProcessEvidenceRunRecord(record, contract);

    assert.equal(record.evidence.length, 7);
    assert.equal(record.telemetry.length, 7);
    assert.equal(record.provenance.sliceAtom, "P05-B04-A06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
  });

  it("maps evidence_path probes through validateWorkerShellProcessEvidenceProbeMatrix", () => {
    const contract = getActiveWorkerShellProcessContract();
    const slice = runWorkerShellProcessEvidenceSlice();
    const matrixValidation = validateWorkerShellProcessEvidenceProbeMatrix(
      slice.results,
      contract,
    );

    assert.equal(matrixValidation.valid, true);
    assert.equal(matrixValidation.unexpectedMismatches, 0);
    assert.equal(matrixValidation.passAligned, 7);
  });
});
