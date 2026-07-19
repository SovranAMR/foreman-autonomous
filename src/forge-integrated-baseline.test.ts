import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadIntegratedBaseline,
  runIntegratedBaselineProbes,
  runIntegratedBaselineProductionSlice,
  runIntegratedBaselineBoundarySlice,
  runIntegratedBaselineFailureRecoverySlice,
  runIntegratedBaselineFailureRecoverySliceWithRecord,
  runIntegratedBaselineProbesWithRecord,
  runForgeIntegratedBaselineRegressionGate,
  runIntegratedBaselineRegressionIntegration,
  validateIntegratedBaseline,
  summarizeIntegratedBaselineMatrix,
  listIntegratedBaselineProbesByExpected,
  listIntegratedBaselineKnownGaps,
  INTEGRATED_BASELINE_CATEGORIES,
  getActiveIntegratedBaselineContract,
  getIntegratedBaselineCategoryContract,
  listIntegratedBaselineContractProbeIds,
  listIntegratedBaselineProbesByDisposition,
  listIntegratedBaselineContractProbesByCategory,
  summarizeIntegratedBaselineContractCoverage,
  validateIntegratedBaselineContractCoverage,
  validateIntegratedBaselineAgainstContract,
  validateIntegratedBaselineProbeMatrix,
  validateIntegratedBaselineBoundaryProbeMatrix,
  validateIntegratedBaselineFailureRecoveryProbeMatrix,
  INTEGRATED_BASELINE_FAILURE_RECOVERY_CATEGORIES,
  listIntegratedBaselineFailureRecoveryProbeIds,
} from "./forge-integrated-baseline.probe.js";
import {
  FORGE_INTEGRATED_BASELINE_VERSION,
  buildIntegratedBaselineProbeEvidence,
  buildIntegratedBaselineProbeTelemetry,
  buildIntegratedBaselineProvenance,
  buildIntegratedBaselineRunRecord,
  validateIntegratedBaselineFailureRecoveryRunRecord,
  detectIntegratedBaselineProbeRegression,
} from "./forge-integrated-baseline.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Integrated Baseline Contract — P01-B10-A02", () => {
  it("defines typed acceptance for all ten integrated baseline categories", () => {
    const contract = getActiveIntegratedBaselineContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P01-B10-A05");

    for (const category of INTEGRATED_BASELINE_CATEGORIES) {
      const categoryContract = getIntegratedBaselineCategoryContract(category);
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

  it("maps 24 probes with six documented gap dispositions from A01 baseline", () => {
    const contract = getActiveIntegratedBaselineContract();
    const summary = summarizeIntegratedBaselineContractCoverage(contract);
    const coverage = validateIntegratedBaselineContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 24);
    assert.equal(summary.expectedPass, 18);
    assert.equal(summary.expectedFail, 6);
    assert.equal(summary.byDisposition.observed, 16);
    assert.equal(summary.byDisposition.gap, 2);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.gate_versioning.probeCount, 3);
    assert.equal(summary.byCategory.block_inventory.probeCount, 3);
    assert.equal(summary.byCategory.regression_integration.probeCount, 3);
    assert.equal(summary.byCategory.guard_integration.probeCount, 2);
    assert.equal(summary.byCategory.block_gate_integration.probeCount, 2);
    assert.equal(summary.byCategory.orchestrator_seam_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 3);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists two documented gap probes for integrated gate wiring", () => {
    const gaps = listIntegratedBaselineProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, [
      "ibase.integrated_block_gate_method",
      "ibase.unified_block_catalog",
    ]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadIntegratedBaseline();
    const contract = getActiveIntegratedBaselineContract();
    const validation = validateIntegratedBaselineAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listIntegratedBaselineContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each integrated baseline probe id is globally unique", () => {
    const ids = listIntegratedBaselineContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runIntegratedBaselineProbes();
    const contract = getActiveIntegratedBaselineContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});

describe("Forge Integrated Baseline Gate — P01-B10-A01", () => {
  it("loads versioned integrated baseline aligned with B09 handoff", () => {
    const fixture = loadIntegratedBaseline();
    const validation = validateIntegratedBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P01-B10-A01");
    assert.equal(fixture.contractAtom, "P01-B10-A05");
    assert.equal(fixture.sourceOrchestratorSeam.probeCount, 23);
    assert.equal(fixture.sourceOrchestratorSeam.orchestratorSeamCategories, 9);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 24);
  });

  it("measures integrated baseline probes with documented FAIL gaps from B09 sealed handoff", () => {
    const results = runIntegratedBaselineProbes();
    const summary = summarizeIntegratedBaselineMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 24);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listIntegratedBaselineProbesByExpected(
      "FAIL",
      loadIntegratedBaseline(),
    );
    assert.equal(documentedFail.length, 6);
    assert.ok(documentedFail.some(p => p.id === "ibase.unified_block_catalog"));
    assert.ok(!documentedFail.some(p => p.id === "ibase.unified_regression_runner"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of INTEGRATED_BASELINE_CATEGORIES) {
      assert.ok(summary.byCategory[cat], `missing category summary: ${cat}`);
      assert.ok(summary.byCategory[cat].total > 0, `${cat} has no probes`);
    }

    const passMismatches = results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(
      passMismatches.length,
      0,
      formatMismatchReport(passMismatches),
    );
  });

  it("documents integrated baseline gaps as measurable baseline debt", () => {
    const gaps = listIntegratedBaselineKnownGaps(runIntegratedBaselineProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "ibase.integrated_block_gate_method",
      "ibase.nogo_block_inventory_drift",
      "ibase.nogo_integrated_gate_mismatch",
      "ibase.recovery_integrated_state_reset",
      "ibase.recovery_missing_b09_handoff_fallback",
      "ibase.unified_block_catalog",
    ]);
    assert.ok(
      gaps.every(g => INTEGRATED_BASELINE_CATEGORIES.includes(g.category)),
      "documented gaps are integrated baseline probes",
    );
  });
});

describe("Forge Integrated Baseline Production Slice — P01-B10-A03", () => {
  it("executes contract-wired probes with zero unexpected mismatches", () => {
    const contract = getActiveIntegratedBaselineContract();
    const slice = runIntegratedBaselineProductionSlice();

    assert.equal(slice.atom, "P01-B10-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 24);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 18);
    assert.equal(slice.matrixValidation.gapAligned, 6);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateIntegratedBaselineProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(slice.summary.mismatches.length, 0);
    assert.equal(slice.summary.knownGaps.length, 6);
    assert.deepEqual(
      slice.summary.knownGaps.map(g => g.id).sort(),
      [
        "ibase.integrated_block_gate_method",
        "ibase.nogo_block_inventory_drift",
        "ibase.nogo_integrated_gate_mismatch",
        "ibase.recovery_integrated_state_reset",
        "ibase.recovery_missing_b09_handoff_fallback",
        "ibase.unified_block_catalog",
      ],
    );
  });
});

describe("Forge Integrated Baseline Boundary Slice — P01-B10-A04", () => {
  it("defines three boundary probes wired to sealed B09 sourceOrchestratorSeam", () => {
    const boundary = listIntegratedBaselineContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 3);
    assert.deepEqual(ids, [
      "ibase.known_gaps_documented",
      "ibase.probe_runner_exported",
      "ibase.source_orchestrator_seam_ref",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
    assert.ok(boundary.every(p => p.disposition === "observed"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveIntegratedBaselineContract();
    const slice = runIntegratedBaselineBoundarySlice();

    assert.equal(slice.atom, "P01-B10-A04");
    assert.equal(slice.boundaryProbeCount, 3);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 3);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 3);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listIntegratedBaselineContractProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateIntegratedBaselineBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("confirms boundary probes validate sealed B09 handoff and documented FAIL gaps", () => {
    const slice = runIntegratedBaselineBoundarySlice();
    const sourceRef = slice.boundaryResults.find(r => r.id === "ibase.source_orchestrator_seam_ref");
    const probeRunner = slice.boundaryResults.find(r => r.id === "ibase.probe_runner_exported");
    const knownGaps = slice.boundaryResults.find(r => r.id === "ibase.known_gaps_documented");

    assert.ok(sourceRef);
    assert.equal(sourceRef!.expected, "PASS");
    assert.equal(sourceRef!.actual, "PASS");
    assert.match(sourceRef!.detail, /sourceAtom=P01-B09-A10/);

    assert.ok(probeRunner);
    assert.equal(probeRunner!.expected, "PASS");
    assert.equal(probeRunner!.actual, "PASS");

    assert.ok(knownGaps);
    assert.equal(knownGaps!.expected, "PASS");
    assert.equal(knownGaps!.actual, "PASS");
    assert.match(knownGaps!.detail, /documentedFailGaps=6/);
  });
});

describe("Forge Integrated Baseline Failure/Recovery Slice — P01-B10-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveIntegratedBaselineContract();
    const failure = listIntegratedBaselineContractProbesByCategory("failure_path", contract);
    const recovery = listIntegratedBaselineContractProbesByCategory("recovery_path", contract);
    const nogo = listIntegratedBaselineContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...INTEGRATED_BASELINE_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveIntegratedBaselineContract();
    const slice = runIntegratedBaselineFailureRecoverySlice();

    assert.equal(slice.atom, "P01-B10-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 2);
    assert.equal(slice.matrixValidation.gapAligned, 4);

    for (const category of INTEGRATED_BASELINE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listIntegratedBaselineContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateIntegratedBaselineFailureRecoveryProbeMatrix(
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
    const slice = runIntegratedBaselineFailureRecoverySlice();
    const probeIds = listIntegratedBaselineFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const invalidVersion = slice.failureRecoveryResults.find(
      r => r.id === "ibase.invalid_version_rejected",
    );
    assert.ok(invalidVersion);
    assert.equal(invalidVersion!.expected, "PASS");
    assert.equal(invalidVersion!.actual, "PASS");

    const recoveryGap = slice.failureRecoveryResults.find(
      r => r.id === "ibase.recovery_integrated_state_reset",
    );
    assert.ok(recoveryGap);
    assert.equal(recoveryGap!.expected, "FAIL");
    assert.equal(recoveryGap!.actual, "FAIL");

    const nogoGap = slice.failureRecoveryResults.find(
      r => r.id === "ibase.nogo_block_inventory_drift",
    );
    assert.ok(nogoGap);
    assert.equal(nogoGap!.expected, "FAIL");
    assert.equal(nogoGap!.actual, "FAIL");
  });
});

describe("Forge Integrated Baseline Evidence — P01-B10-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadIntegratedBaseline();
    const contract = getActiveIntegratedBaselineContract();
    const probeIds = listIntegratedBaselineFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildIntegratedBaselineProbeEvidence(
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
      return buildIntegratedBaselineProbeTelemetry(probeId, contractProbe.category, index, index * 0.5);
    });

    const provenance = buildIntegratedBaselineProvenance(
      "run-ibase-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P01-B10-A06",
        sliceCategories: INTEGRATED_BASELINE_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildIntegratedBaselineRunRecord(provenance, evidence, telemetry);
    const validation = validateIntegratedBaselineFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 6);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(
      record.provenance.sourceOrchestratorSeamAtom,
      fixture.sourceOrchestratorSeam.atom,
    );
  });

  it("records evidence, telemetry and provenance for failure/recovery slice run", () => {
    const contract = getActiveIntegratedBaselineContract();
    const record = runIntegratedBaselineFailureRecoverySliceWithRecord();
    const validation = validateIntegratedBaselineFailureRecoveryRunRecord(record, contract);

    assert.equal(record.evidence.length, 6);
    assert.equal(record.telemetry.length, 6);
    assert.equal(record.provenance.totalProbes, 6);
    assert.equal(record.provenance.sliceAtom, "P01-B10-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_INTEGRATED_BASELINE_VERSION);
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

describe("Forge Integrated Baseline Regression — P01-B10-A08", () => {
  it("runForgeIntegratedBaselineRegressionGate passes on canonical integrated baseline matrix", () => {
    const result = runForgeIntegratedBaselineRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 24);
    assert.equal(result.probeRegression, null);
    assert.ok(result.propertyFuzz.passed);
    assert.ok(result.detail.includes("24/24 probes aligned"));
    assert.ok(result.detail.includes("propertyFuzz:"));
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
  });

  it("detectIntegratedBaselineProbeRegression flags newly misaligned probes", () => {
    const prior = runIntegratedBaselineProbesWithRecord();
    const current = structuredClone(prior);
    const target = current.evidence.find(item => item.aligned);
    assert.ok(target, "expected at least one aligned probe");

    target!.aligned = false;
    target!.actual = target!.expected === "PASS" ? "FAIL" : "PASS";
    current.summary = {
      ...current.summary,
      aligned: current.summary.aligned - 1,
      mismatches: current.summary.mismatches + 1,
    };

    const report = detectIntegratedBaselineProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeIntegratedBaselineRegressionGate compares against prior record without false regression", () => {
    const prior = runIntegratedBaselineProbesWithRecord();
    const result = runForgeIntegratedBaselineRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runIntegratedBaselineRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeIntegratedBaselineRegressionGate();
    const integration = runIntegratedBaselineRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.guard.passed, gate.guard.passed);
    assert.equal(integration.propertyFuzz.passed, gate.propertyFuzz.passed);
    assert.ok(integration.detail.includes("24/24 probes aligned"));
    assert.equal(integration.record.summary.total, 24);
  });
});
