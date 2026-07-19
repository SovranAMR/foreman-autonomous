import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadOrchestratorSeamBaseline,
  runOrchestratorSeamProbes,
  runOrchestratorSeamProductionSlice,
  runOrchestratorSeamBoundarySlice,
  runOrchestratorSeamFailureRecoverySlice,
  runOrchestratorSeamFailureRecoverySliceWithRecord,
} from "./forge-orchestrator-seam.probe.js";
import {
  getActiveOrchestratorSeamContract,
  getOrchestratorSeamCategoryContract,
  listOrchestratorSeamContractProbeIds,
  listOrchestratorSeamContractProbesByCategory,
  listOrchestratorSeamProbesByDisposition,
  listOrchestratorSeamFailureRecoveryProbeIds,
  summarizeOrchestratorSeamContractCoverage,
  validateOrchestratorSeamContractCoverage,
  validateOrchestratorSeamBaselineAgainstContract,
  validateOrchestratorSeamProbeMatrix,
  validateOrchestratorSeamBoundaryProbeMatrix,
  validateOrchestratorSeamFailureRecoveryProbeMatrix,
  validateOrchestratorSeamFailureRecoveryRunRecord,
  buildOrchestratorSeamProbeEvidence,
  buildOrchestratorSeamProbeTelemetry,
  buildOrchestratorSeamProvenance,
  buildOrchestratorSeamRunRecord,
  FORGE_ORCHESTRATOR_SEAM_VERSION,
  ORCHESTRATOR_SEAM_CATEGORIES,
  ORCHESTRATOR_SEAM_FAILURE_RECOVERY_CATEGORIES,
} from "./forge-orchestrator-seam.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Orchestrator Seam Contract — P01-B09-A02", () => {
  it("defines typed acceptance for all nine orchestrator seam categories", () => {
    const contract = getActiveOrchestratorSeamContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P01-B09-A05");

    for (const category of ORCHESTRATOR_SEAM_CATEGORIES) {
      const categoryContract = getOrchestratorSeamCategoryContract(category);
      assert.ok(categoryContract.acceptance.invariant.length > 20, `${category} invariant too short`);
      assert.ok(categoryContract.probes.length >= categoryContract.acceptance.minProbeCount);
      assert.equal(categoryContract.acceptance.requireFullAlignment, true);

      for (const probe of categoryContract.probes) {
        assert.ok(probe.criterion.length > 10, `${probe.id} missing measurable criterion`);
        assert.ok(probe.expected === "PASS" || probe.expected === "FAIL");
        assert.ok(
          probe.disposition === "observed" ||
            probe.disposition === "gap" ||
            probe.disposition === "failure" ||
            probe.disposition === "recovery" ||
            probe.disposition === "nogo",
          `${probe.id} missing disposition`,
        );
      }
    }
  });

  it("maps 23 probes with seven documented gap dispositions from A01 baseline", () => {
    const contract = getActiveOrchestratorSeamContract();
    const summary = summarizeOrchestratorSeamContractCoverage(contract);
    const coverage = validateOrchestratorSeamContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 16);
    assert.equal(summary.expectedFail, 7);
    assert.equal(summary.byDisposition.observed, 14);
    assert.equal(summary.byDisposition.gap, 3);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.seam_versioning.probeCount, 3);
    assert.equal(summary.byCategory.method_inventory.probeCount, 3);
    assert.equal(summary.byCategory.lazy_import_seam.probeCount, 3);
    assert.equal(summary.byCategory.composition_seam.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 3);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists three documented gap probes for orchestrator seam wiring", () => {
    const gaps = listOrchestratorSeamProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, [
      "oseam.extracted_seam_interface",
      "oseam.guard_methods_inventory",
      "oseam.unified_lazy_import_registry",
    ]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadOrchestratorSeamBaseline();
    const contract = getActiveOrchestratorSeamContract();
    const validation = validateOrchestratorSeamBaselineAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listOrchestratorSeamContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each orchestrator seam probe id is globally unique", () => {
    const ids = listOrchestratorSeamContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runOrchestratorSeamProbes();
    const contract = getActiveOrchestratorSeamContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});

describe("Forge Orchestrator Seam Production Slice — P01-B09-A03", () => {
  it("executes contract-wired probes with zero unexpected mismatches", () => {
    const contract = getActiveOrchestratorSeamContract();
    const slice = runOrchestratorSeamProductionSlice();

    assert.equal(slice.atom, "P01-B09-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 16);
    assert.equal(slice.matrixValidation.gapAligned, 7);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateOrchestratorSeamProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(slice.summary.mismatches.length, 0);
    assert.equal(slice.summary.knownGaps.length, 7);
    assert.deepEqual(
      slice.summary.knownGaps.map(g => g.id).sort(),
      [
        "oseam.extracted_seam_interface",
        "oseam.guard_methods_inventory",
        "oseam.nogo_seam_inventory_drift",
        "oseam.nogo_verification_method_mismatch",
        "oseam.recovery_missing_handoff_fallback",
        "oseam.recovery_seam_state_reset",
        "oseam.unified_lazy_import_registry",
      ],
    );
  });
});

describe("Forge Orchestrator Seam Boundary Slice — P01-B09-A04", () => {
  it("defines three boundary probes wired to sealed B08 sourceEvidenceArtifact", () => {
    const boundary = listOrchestratorSeamContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 3);
    assert.deepEqual(ids, [
      "oseam.known_gaps_documented",
      "oseam.probe_runner_exported",
      "oseam.source_evidence_artifact_ref",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
    assert.ok(boundary.every(p => p.disposition === "observed"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveOrchestratorSeamContract();
    const slice = runOrchestratorSeamBoundarySlice();

    assert.equal(slice.atom, "P01-B09-A04");
    assert.equal(slice.boundaryProbeCount, 3);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 3);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 3);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listOrchestratorSeamContractProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateOrchestratorSeamBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("confirms boundary probes validate sealed B08 handoff and documented FAIL gaps", () => {
    const slice = runOrchestratorSeamBoundarySlice();
    const sourceRef = slice.boundaryResults.find(r => r.id === "oseam.source_evidence_artifact_ref");
    const probeRunner = slice.boundaryResults.find(r => r.id === "oseam.probe_runner_exported");
    const knownGaps = slice.boundaryResults.find(r => r.id === "oseam.known_gaps_documented");

    assert.ok(sourceRef);
    assert.equal(sourceRef!.expected, "PASS");
    assert.equal(sourceRef!.actual, "PASS");
    assert.match(sourceRef!.detail, /probes=25/);

    assert.ok(probeRunner);
    assert.equal(probeRunner!.expected, "PASS");
    assert.equal(probeRunner!.actual, "PASS");

    assert.ok(knownGaps);
    assert.equal(knownGaps!.expected, "PASS");
    assert.equal(knownGaps!.actual, "PASS");
    assert.match(knownGaps!.detail, /documentedFail=7/);
  });
});

describe("Forge Orchestrator Seam Failure/Recovery Slice — P01-B09-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveOrchestratorSeamContract();
    const failure = listOrchestratorSeamContractProbesByCategory("failure_path", contract);
    const recovery = listOrchestratorSeamContractProbesByCategory("recovery_path", contract);
    const nogo = listOrchestratorSeamContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...ORCHESTRATOR_SEAM_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveOrchestratorSeamContract();
    const slice = runOrchestratorSeamFailureRecoverySlice();

    assert.equal(slice.atom, "P01-B09-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 2);
    assert.equal(slice.matrixValidation.gapAligned, 4);

    for (const category of ORCHESTRATOR_SEAM_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listOrchestratorSeamContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateOrchestratorSeamFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves documented gaps while exercising failure/recovery/NO-GO paths", () => {
    const slice = runOrchestratorSeamFailureRecoverySlice();
    const probeIds = listOrchestratorSeamFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const invalidVersion = slice.failureRecoveryResults.find(
      r => r.id === "oseam.invalid_version_rejected",
    );
    assert.ok(invalidVersion);
    assert.equal(invalidVersion!.expected, "PASS");
    assert.equal(invalidVersion!.actual, "PASS");

    const recoveryGap = slice.failureRecoveryResults.find(
      r => r.id === "oseam.recovery_seam_state_reset",
    );
    assert.ok(recoveryGap);
    assert.equal(recoveryGap!.expected, "FAIL");
    assert.equal(recoveryGap!.actual, "FAIL");

    const nogoGap = slice.failureRecoveryResults.find(
      r => r.id === "oseam.nogo_seam_inventory_drift",
    );
    assert.ok(nogoGap);
    assert.equal(nogoGap!.expected, "FAIL");
    assert.equal(nogoGap!.actual, "FAIL");
  });
});

describe("Forge Orchestrator Seam Evidence — P01-B09-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadOrchestratorSeamBaseline();
    const contract = getActiveOrchestratorSeamContract();
    const probeIds = listOrchestratorSeamFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-18T00:00:00.000Z";
    const completedAt = "2026-07-18T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildOrchestratorSeamProbeEvidence(
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
      return buildOrchestratorSeamProbeTelemetry(probeId, contractProbe.category, index, index * 0.5);
    });

    const provenance = buildOrchestratorSeamProvenance(
      "run-oseam-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P01-B09-A06",
        sliceCategories: ORCHESTRATOR_SEAM_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildOrchestratorSeamRunRecord(provenance, evidence, telemetry);
    const validation = validateOrchestratorSeamFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 6);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(
      record.provenance.sourceEvidenceArtifactAtom,
      fixture.sourceEvidenceArtifact.atom,
    );
  });

  it("records evidence, telemetry and provenance for failure/recovery slice run", () => {
    const contract = getActiveOrchestratorSeamContract();
    const record = runOrchestratorSeamFailureRecoverySliceWithRecord();
    const validation = validateOrchestratorSeamFailureRecoveryRunRecord(record, contract);

    assert.equal(record.evidence.length, 6);
    assert.equal(record.telemetry.length, 6);
    assert.equal(record.provenance.totalProbes, 6);
    assert.equal(record.provenance.sliceAtom, "P01-B09-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_ORCHESTRATOR_SEAM_VERSION);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
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
      assert.equal(item.aligned, true);
      assert.ok(item.recordedAt.length > 10);
    }
  });
});
