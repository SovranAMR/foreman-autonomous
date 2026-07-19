import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadEvidenceArtifactBaseline,
  runEvidenceArtifactProbes,
  runEvidenceArtifactProductionSlice,
  runEvidenceArtifactBoundarySlice,
  runEvidenceArtifactFailureRecoverySlice,
  runEvidenceArtifactFailureRecoverySliceWithRecord,
  runEvidenceArtifactProbesWithRecord,
  runForgeEvidenceArtifactRegressionGate,
  runEvidenceArtifactRegressionIntegration,
  validateEvidenceArtifactProbeMatrix,
  validateEvidenceArtifactBoundaryProbeMatrix,
  validateEvidenceArtifactFailureRecoveryProbeMatrix,
} from "./forge-evidence-artifact.probe.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}
import {
  getActiveEvidenceArtifactContract,
  getEvidenceArtifactCategoryContract,
  listEvidenceArtifactContractProbeIds,
  listEvidenceArtifactContractProbesByCategory,
  listEvidenceArtifactProbesByDisposition,
  listEvidenceArtifactFailureRecoveryProbeIds,
  summarizeEvidenceArtifactContractCoverage,
  validateEvidenceArtifactContractCoverage,
  validateEvidenceArtifactBaselineAgainstContract,
  EVIDENCE_ARTIFACT_CATEGORIES,
  EVIDENCE_ARTIFACT_FAILURE_RECOVERY_CATEGORIES,
  buildEvidenceArtifactProbeEvidence,
  buildEvidenceArtifactProbeTelemetry,
  buildEvidenceArtifactProvenance,
  buildEvidenceArtifactRunRecord,
  validateEvidenceArtifactFailureRecoveryRunRecord,
  validateEvidenceArtifactRunRecord,
  detectEvidenceArtifactProbeRegression,
} from "./forge-evidence-artifact.js";

describe("Forge Evidence Artifact Contract — P01-B08-A02", () => {
  it("defines typed acceptance for all eleven evidence artifact categories", () => {
    const contract = getActiveEvidenceArtifactContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P01-B08-A05");

    for (const category of EVIDENCE_ARTIFACT_CATEGORIES) {
      const categoryContract = getEvidenceArtifactCategoryContract(category);
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

  it("maps 25 probes with seven documented gap dispositions from A01 baseline", () => {
    const contract = getActiveEvidenceArtifactContract();
    const summary = summarizeEvidenceArtifactContractCoverage(contract);
    const coverage = validateEvidenceArtifactContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 25);
    assert.equal(summary.expectedPass, 18);
    assert.equal(summary.expectedFail, 7);
    assert.equal(summary.byDisposition.observed, 16);
    assert.equal(summary.byDisposition.gap, 3);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.schema_versioning.probeCount, 3);
    assert.equal(summary.byCategory.evidence_shape.probeCount, 3);
    assert.equal(summary.byCategory.telemetry_shape.probeCount, 2);
    assert.equal(summary.byCategory.provenance_lineage.probeCount, 2);
    assert.equal(summary.byCategory.run_record_bundle.probeCount, 2);
    assert.equal(summary.byCategory.schema_registry.probeCount, 2);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 3);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists three documented gap probes for evidence artifact schema wiring", () => {
    const gaps = listEvidenceArtifactProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, [
      "eva.cross_block_normalizer",
      "eva.unified_category_dimension",
      "eva.unified_schema_type_export",
    ]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadEvidenceArtifactBaseline();
    const contract = getActiveEvidenceArtifactContract();
    const validation = validateEvidenceArtifactBaselineAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listEvidenceArtifactContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each evidence artifact probe id is globally unique", () => {
    const ids = listEvidenceArtifactContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runEvidenceArtifactProbes();
    const contract = getActiveEvidenceArtifactContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});

describe("Forge Evidence Artifact Production Slice — P01-B08-A03", () => {
  it("executes contract-wired probes with zero unexpected mismatches", () => {
    const contract = getActiveEvidenceArtifactContract();
    const slice = runEvidenceArtifactProductionSlice();

    assert.equal(slice.atom, "P01-B08-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 25);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 18);
    assert.equal(slice.matrixValidation.gapAligned, 7);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateEvidenceArtifactProbeMatrix(slice.results, contract);
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
        "eva.cross_block_normalizer",
        "eva.nogo_cross_block_mismatch_gate",
        "eva.nogo_schema_drift_gate",
        "eva.recovery_baseline_reset",
        "eva.recovery_missing_schema_fallback",
        "eva.unified_category_dimension",
        "eva.unified_schema_type_export",
      ],
    );
  });
});

describe("Forge Evidence Artifact Boundary Slice — P01-B08-A04", () => {
  it("defines boundary category with sourceReproducibleFixture ref and probe runner probes", () => {
    const contract = getActiveEvidenceArtifactContract();
    const boundary = listEvidenceArtifactContractProbesByCategory("boundary", contract);
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 3);
    assert.deepEqual(ids, [
      "eva.known_gaps_documented",
      "eva.probe_runner_exported",
      "eva.source_reproducible_fixture_ref",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
    assert.ok(boundary.every(p => p.disposition === "observed"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveEvidenceArtifactContract();
    const slice = runEvidenceArtifactBoundarySlice();

    assert.equal(slice.atom, "P01-B08-A04");
    assert.equal(slice.boundaryProbeCount, 3);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 3);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 3);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listEvidenceArtifactContractProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateEvidenceArtifactBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("confirms boundary probes validate sealed B07 handoff and documented FAIL gaps", () => {
    const slice = runEvidenceArtifactBoundarySlice();
    const sourceRef = slice.boundaryResults.find(r => r.id === "eva.source_reproducible_fixture_ref");
    const probeRunner = slice.boundaryResults.find(r => r.id === "eva.probe_runner_exported");
    const knownGaps = slice.boundaryResults.find(r => r.id === "eva.known_gaps_documented");

    assert.ok(sourceRef);
    assert.equal(sourceRef!.expected, "PASS");
    assert.equal(sourceRef!.actual, "PASS");
    assert.match(sourceRef!.detail, /probes=21/);

    assert.ok(probeRunner);
    assert.equal(probeRunner!.expected, "PASS");
    assert.equal(probeRunner!.actual, "PASS");

    assert.ok(knownGaps);
    assert.equal(knownGaps!.expected, "PASS");
    assert.equal(knownGaps!.actual, "PASS");
    assert.match(knownGaps!.detail, /documentedFail=7/);
  });
});

describe("Forge Evidence Artifact Failure/Recovery Slice — P01-B08-A05", () => {
  it("defines failure/recovery/NO-GO categories with disposition probes", () => {
    const contract = getActiveEvidenceArtifactContract();
    const failure = listEvidenceArtifactProbesByDisposition("failure");
    const recovery = listEvidenceArtifactContractProbesByCategory("recovery_path", contract);
    const nogo = listEvidenceArtifactContractProbesByCategory("nogo_path", contract);
    const failurePath = listEvidenceArtifactContractProbesByCategory("failure_path", contract);

    assert.ok(failure.some(p => p.id === "eva.invalid_version_rejected"));
    assert.ok(failure.some(p => p.id === "eva.min_category_probes"));
    assert.ok(recovery.some(p => p.id === "eva.recovery_missing_schema_fallback"));
    assert.ok(recovery.some(p => p.id === "eva.recovery_baseline_reset"));
    assert.ok(nogo.some(p => p.id === "eva.nogo_schema_drift_gate"));
    assert.ok(nogo.some(p => p.id === "eva.nogo_cross_block_mismatch_gate"));
    assert.equal(failurePath.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...EVIDENCE_ARTIFACT_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveEvidenceArtifactContract();
    const slice = runEvidenceArtifactFailureRecoverySlice();

    assert.equal(slice.atom, "P01-B08-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 2);
    assert.equal(slice.matrixValidation.gapAligned, 4);

    for (const category of EVIDENCE_ARTIFACT_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listEvidenceArtifactContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateEvidenceArtifactFailureRecoveryProbeMatrix(
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
    const slice = runEvidenceArtifactFailureRecoverySlice();
    const probeIds = listEvidenceArtifactFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const invalidVersion = slice.failureRecoveryResults.find(r => r.id === "eva.invalid_version_rejected");
    assert.ok(invalidVersion);
    assert.equal(invalidVersion!.expected, "PASS");
    assert.equal(invalidVersion!.actual, "PASS");

    const recoveryGap = slice.failureRecoveryResults.find(
      r => r.id === "eva.recovery_missing_schema_fallback",
    );
    assert.ok(recoveryGap);
    assert.equal(recoveryGap!.expected, "FAIL");
    assert.equal(recoveryGap!.actual, "FAIL");

    const nogoGap = slice.failureRecoveryResults.find(r => r.id === "eva.nogo_schema_drift_gate");
    assert.ok(nogoGap);
    assert.equal(nogoGap!.expected, "FAIL");
    assert.equal(nogoGap!.actual, "FAIL");
  });
});

describe("Forge Evidence Artifact Evidence — P01-B08-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadEvidenceArtifactBaseline();
    const contract = getActiveEvidenceArtifactContract();
    const probeIds = listEvidenceArtifactFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-18T00:00:00.000Z";
    const completedAt = "2026-07-18T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildEvidenceArtifactProbeEvidence(
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
      return buildEvidenceArtifactProbeTelemetry(probeId, contractProbe.category, index, index * 0.5);
    });

    const provenance = buildEvidenceArtifactProvenance(
      "run-eva-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P01-B08-A06",
        sliceCategories: EVIDENCE_ARTIFACT_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildEvidenceArtifactRunRecord(provenance, evidence, telemetry);
    const validation = validateEvidenceArtifactFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 6);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(
      record.provenance.sourceReproducibleFixtureAtom,
      fixture.sourceReproducibleFixture.atom,
    );
  });

  it("records evidence, telemetry and provenance for failure/recovery slice run", () => {
    const contract = getActiveEvidenceArtifactContract();
    const record = runEvidenceArtifactFailureRecoverySliceWithRecord();
    const validation = validateEvidenceArtifactFailureRecoveryRunRecord(record, contract);

    assert.equal(record.evidence.length, 6);
    assert.equal(record.telemetry.length, 6);
    assert.equal(record.provenance.totalProbes, 6);
    assert.equal(record.provenance.sliceAtom, "P01-B08-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a08");
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

describe("Forge Evidence Artifact Regression — P01-B08-A08", () => {
  it("runForgeEvidenceArtifactRegressionGate passes on canonical evidence artifact matrix", () => {
    const result = runForgeEvidenceArtifactRegressionGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 25);
    assert.equal(result.probeRegression, null);
    assert.equal(result.guard.passed, true);
    assert.equal(result.propertyFuzz.passed, true);
    assert.ok(result.detail.includes("25/25 probes aligned"));
    assert.ok(result.detail.includes("propertyFuzz:"));
    assert.ok(result.detail.includes("guard:"));
  });

  it("runEvidenceArtifactRegressionIntegration alias matches regression gate", () => {
    const gate = runForgeEvidenceArtifactRegressionGate();
    const integration = runEvidenceArtifactRegressionIntegration();

    assert.equal(integration.passed, gate.passed);
    assert.equal(integration.recordValid, gate.recordValid);
    assert.equal(integration.guard.passed, gate.guard.passed);
    assert.equal(integration.propertyFuzz.passed, gate.propertyFuzz.passed);
    assert.ok(integration.detail.includes("25/25 probes aligned"));
    assert.ok(integration.detail.includes("propertyFuzz:"));
    assert.equal(integration.record.summary.total, 25);
  });

  it("detectEvidenceArtifactProbeRegression flags newly misaligned probes", () => {
    const prior = runEvidenceArtifactProbesWithRecord();
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

    const report = detectEvidenceArtifactProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runForgeEvidenceArtifactRegressionGate compares against prior record without false regression", () => {
    const prior = runEvidenceArtifactProbesWithRecord();
    const result = runForgeEvidenceArtifactRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("regression gate rejects pass probe mismatches on canonical matrix", () => {
    const results = runEvidenceArtifactProbes();
    const passMismatches = results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));
  });
});
