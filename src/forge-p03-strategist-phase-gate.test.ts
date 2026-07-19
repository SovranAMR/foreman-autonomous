import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistPhaseGateBaseline,
  runStrategistPhaseGateProbes,
  runStrategistPhaseGateProductionSlice,
  runStrategistPhaseGateBoundarySlice,
  runStrategistPhaseGateFailureRecoverySlice,
  runStrategistPhaseGateFailureRecoverySliceWithRecord,
  runStrategistPhaseGateProbesWithRecord,
  runStrategistPhaseGateEvidenceSlice,
  runStrategistPhaseGatePropertyFuzzSlice,
  runForgeStrategistPhaseGateRegressionGate,
  validateStrategistPhaseGateBaseline,
  buildStrategistPhaseGateProbeEvidence,
  buildStrategistPhaseGateProbeTelemetry,
  buildStrategistPhaseGateProvenance,
  buildStrategistPhaseGateRunRecord,
  validateStrategistPhaseGateFailureRecoveryRunRecord,
  validateStrategistPhaseGateRunRecord,
} from "./forge-p03-strategist-phase-gate.probe.js";
import {
  getActiveStrategistPhaseGateContract,
  getStrategistPhaseGateCategoryContract,
  listStrategistPhaseGateContractProbeIds,
  listStrategistPhaseGateContractProbesByCategory,
  listStrategistPhaseGateProbesByDisposition,
  summarizeStrategistPhaseGateCoverage,
  validateStrategistPhaseGateCoverage,
  validateStrategistPhaseGateAgainstContract,
  validateStrategistPhaseGateProbeMatrix,
  validateStrategistPhaseGateBoundaryProbeMatrix,
  validateStrategistPhaseGateFailureRecoveryProbeMatrix,
  listStrategistPhaseGateFailureRecoveryProbeIds,
  STRATEGIST_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES,
  recoverStrategistPhaseGateEvidence,
  assessStrategistPhaseGateInputBoundary,
  STRATEGIST_PHASE_GATE_MANIFEST_MAX_LENGTH,
  STRATEGIST_PHASE_GATE_CATEGORIES,
  FORGE_STRATEGIST_PHASE_GATE_CONTRACT_V1,
  FORGE_STRATEGIST_PHASE_GATE_VERSION,
  P03_STRATEGIST_PHASE_BLOCK_COUNT,
  detectStrategistPhaseGateProbeRegression,
  validateStrategistPhaseGateProbeRegression,
  runStrategistPhaseGateProbeRegression,
  applyStrategistPhaseGateRunRecordFuzzMutation,
} from "./forge-p03-strategist-phase-gate.js";

describe("Forge Strategist Phase Gate Contract — P03-B10-A02", () => {
  it("defines typed acceptance for all eight strategist phase gate categories", () => {
    const contract = getActiveStrategistPhaseGateContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B10-A02");

    for (const category of STRATEGIST_PHASE_GATE_CATEGORIES) {
      const categoryContract = getStrategistPhaseGateCategoryContract(category);
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

  it("maps 24 probes with full PASS alignment after A03 production slice", () => {
    const contract = getActiveStrategistPhaseGateContract();
    const summary = summarizeStrategistPhaseGateCoverage(contract);
    const coverage = validateStrategistPhaseGateCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 24);
    assert.equal(summary.expectedPass, 24);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 3);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.phase_versioning.probeCount, 3);
    assert.equal(summary.byCategory.block_gate_signal.probeCount, 3);
    assert.equal(summary.byCategory.phase_inventory.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 3);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("documents zero remaining strategist phase gate gap probes after A03", () => {
    const gaps = listStrategistPhaseGateProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistPhaseGateBaseline();
    const contract = getActiveStrategistPhaseGateContract();
    const validation = validateStrategistPhaseGateAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistPhaseGateContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("baseline validation includes contract alignment from A02", () => {
    const fixture = loadStrategistPhaseGateBaseline();
    const validation = validateStrategistPhaseGateBaseline(fixture);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_PHASE_GATE_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_PHASE_GATE_CONTRACT_V1.probes.length, 24);
    assert.equal(FORGE_STRATEGIST_PHASE_GATE_CONTRACT_V1.atom, "P03-B10-A02");
  });

  it("each strategist phase gate probe id is globally unique", () => {
    const ids = listStrategistPhaseGateContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistPhaseGateContract();
    const flatIds = listStrategistPhaseGateContractProbeIds(contract);
    const categoryIds = STRATEGIST_PHASE_GATE_CATEGORIES.flatMap(category =>
      listStrategistPhaseGateContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runStrategistPhaseGateProbes();
    const contract = getActiveStrategistPhaseGateContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("exports FORGE_STRATEGIST_PHASE_GATE_VERSION aligned with contract semver", () => {
    const contract = getActiveStrategistPhaseGateContract();
    assert.equal(FORGE_STRATEGIST_PHASE_GATE_VERSION, contract.version);
  });
});

describe("Forge Strategist Phase Gate Production Slice — P03-B10-A03", () => {
  it("recoverStrategistPhaseGateEvidence restructures malformed block seal manifest", () => {
    const malformed = `block gates incomplete
P03-B01: PASS atoms=10
P03-B02: pass atoms=10
provenance regression: pass
handoff: valid`;
    const recovery = recoverStrategistPhaseGateEvidence(malformed, {
      provenanceRegressionPassed: true,
      handoffValid: true,
    });

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.evidence);
    assert.equal(recovery.blockSeals.length, P03_STRATEGIST_PHASE_BLOCK_COUNT);
    assert.equal(recovery.provenanceRegressionPassed, true);
    assert.equal(recovery.handoffValid, true);
    assert.ok(recovery.blockSeals.every(seal => seal.passed));
  });

  it("recoverStrategistPhaseGateEvidence rejects null-byte manifest safely", () => {
    const recovery = recoverStrategistPhaseGateEvidence("manifest\0corrupt");
    assert.equal(recovery.recovered, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_manifest"]);
  });

  it("assessStrategistPhaseGateInputBoundary handles empty and whitespace-only manifest", () => {
    const empty = assessStrategistPhaseGateInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistPhaseGateInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveStrategistPhaseGateContract();
    const slice = runStrategistPhaseGateProductionSlice();

    assert.equal(slice.atom, "P03-B10-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 24);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 24);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const matrixValidation = validateStrategistPhaseGateProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });
});

describe("Forge Strategist Phase Gate Boundary Slice — P03-B10-A04", () => {
  it("assessStrategistPhaseGateInputBoundary handles null-byte and truncation edge cases", () => {
    const nullByte = assessStrategistPhaseGateInputBoundary("manifest\0corrupt");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const longManifest = "x".repeat(STRATEGIST_PHASE_GATE_MANIFEST_MAX_LENGTH + 200);
    const truncated = assessStrategistPhaseGateInputBoundary(longManifest);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedManifest.length, STRATEGIST_PHASE_GATE_MANIFEST_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("recoverStrategistPhaseGateEvidence rejects whitespace-only malformed manifest input", () => {
    const whitespaceRecovery = recoverStrategistPhaseGateEvidence("   \t\n  ");
    assert.equal(whitespaceRecovery.recovered, false);
    assert.deepEqual(whitespaceRecovery.parseErrors, ["whitespace_only_manifest"]);
  });

  it("defines boundary category with manifest input edge-case probes", () => {
    const boundary = listStrategistPhaseGateContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "spg.empty_manifest_boundary",
      "spg.known_gaps_documented",
      "spg.long_manifest_truncation_boundary",
      "spg.probe_runner_exported",
      "spg.source_block_gate_ref",
      "spg.whitespace_manifest_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveStrategistPhaseGateContract();
    const slice = runStrategistPhaseGateBoundarySlice();

    assert.equal(slice.atom, "P03-B10-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listStrategistPhaseGateContractProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateStrategistPhaseGateBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves full probe alignment while boundary slice passes", () => {
    const slice = runStrategistPhaseGateBoundarySlice();
    const recoveryProbe = slice.results.find(r => r.id === "spg.structured_phase_gate_recovery");

    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(slice.results.filter(r => !r.aligned).length, 0);
  });
});

describe("Forge Strategist Phase Gate Failure/Recovery Slice — P03-B10-A05", () => {
  it("defines seven failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveStrategistPhaseGateContract();
    const failure = listStrategistPhaseGateContractProbesByCategory("failure_path", contract);
    const recovery = listStrategistPhaseGateContractProbesByCategory("recovery_path", contract);
    const nogo = listStrategistPhaseGateContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 3);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...STRATEGIST_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveStrategistPhaseGateContract();
    const slice = runStrategistPhaseGateFailureRecoverySlice();

    assert.equal(slice.atom, "P03-B10-A05");
    assert.equal(slice.failureRecoveryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of STRATEGIST_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistPhaseGateContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateStrategistPhaseGateFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure/recovery/NO-GO paths with full alignment after A04 boundary slice", () => {
    const slice = runStrategistPhaseGateFailureRecoverySlice();
    const probeIds = listStrategistPhaseGateFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 7);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const invalidVersion = slice.failureRecoveryResults.find(
      r => r.id === "spg.invalid_version_rejected",
    );
    assert.ok(invalidVersion);
    assert.equal(invalidVersion!.expected, "PASS");
    assert.equal(invalidVersion!.actual, "PASS");

    const structuredRecovery = slice.failureRecoveryResults.find(
      r => r.id === "spg.structured_phase_gate_recovery",
    );
    assert.ok(structuredRecovery);
    assert.equal(structuredRecovery!.expected, "PASS");
    assert.equal(structuredRecovery!.actual, "PASS");

    const evidenceNogo = slice.failureRecoveryResults.find(
      r => r.id === "spg.phase_gate_evidence_nogo",
    );
    assert.ok(evidenceNogo);
    assert.equal(evidenceNogo!.expected, "PASS");
    assert.equal(evidenceNogo!.actual, "PASS");
  });
});

describe("Forge Strategist Phase Gate Evidence — P03-B10-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadStrategistPhaseGateBaseline();
    const contract = getActiveStrategistPhaseGateContract();
    const probeIds = listStrategistPhaseGateFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildStrategistPhaseGateProbeEvidence(
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
      return buildStrategistPhaseGateProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildStrategistPhaseGateProvenance(
      "run-spg-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P03-B10-A06",
        sliceCategories: STRATEGIST_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildStrategistPhaseGateRunRecord(provenance, evidence, telemetry);
    const validation = validateStrategistPhaseGateFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 7);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 3);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBlockGateAtom, fixture.sourceBlockGate.atom);
  });

  it("records evidence, telemetry and provenance for failure/recovery slice run", () => {
    const contract = getActiveStrategistPhaseGateContract();
    const record = runStrategistPhaseGateFailureRecoverySliceWithRecord();
    const validation = validateStrategistPhaseGateFailureRecoveryRunRecord(record, contract);

    assert.equal(record.evidence.length, 7);
    assert.equal(record.telemetry.length, 7);
    assert.equal(record.provenance.totalProbes, 7);
    assert.equal(record.provenance.sliceAtom, "P03-B10-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_STRATEGIST_PHASE_GATE_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0");
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
      assert.ok(item.recordedAt.length > 10);
    }

    const structuredRecovery = record.evidence.find(
      e => e.probeId === "spg.structured_phase_gate_recovery",
    );
    assert.ok(structuredRecovery);
    assert.equal(structuredRecovery!.aligned, true);
    assert.equal(structuredRecovery!.expected, "PASS");
    assert.equal(structuredRecovery!.actual, "PASS");
    assert.equal(structuredRecovery!.disposition, "recovery");
  });

  it("records evidence, telemetry and provenance for full strategist phase gate run", () => {
    const contract = getActiveStrategistPhaseGateContract();
    const record = runStrategistPhaseGateProbesWithRecord();
    const validation = validateStrategistPhaseGateRunRecord(record, contract);

    assert.equal(record.evidence.length, 24);
    assert.equal(record.telemetry.length, 24);
    assert.equal(record.provenance.totalProbes, 24);
    assert.equal(record.provenance.harnessVersion, "1.0.0");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 24);
  });

  it("executes evidence slice with zero unexpected mismatches and valid run record", () => {
    const contract = getActiveStrategistPhaseGateContract();
    const slice = runStrategistPhaseGateEvidenceSlice();

    assert.equal(slice.atom, "P03-B10-A06");
    assert.equal(slice.evidenceProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(
      slice.recordValidation.valid,
      true,
      slice.recordValidation.issues.map(i => i.detail).join("\n"),
    );

    for (const category of STRATEGIST_PHASE_GATE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistPhaseGateContractProbesByCategory(category, contract)) {
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
    assert.equal(record.provenance.sliceAtom, "P03-B10-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.equal(record.summary.mismatches, 0);
  });
});

describe("Forge Strategist Phase Gate Property/Fuzz — P03-B10-A07", () => {
  it("property checks pass on canonical strategist phase gate contract", () => {
    const slice = runStrategistPhaseGatePropertyFuzzSlice();
    assert.equal(slice.atom, "P03-B10-A07");
    assert.equal(slice.propertyChecksPassed, true);
    assert.equal(slice.propertyResult.passed, 8);
    assert.equal(slice.propertyResult.failed.length, 0);
  });

  it("rejects fixture fuzz mutations and run record tampering", () => {
    const slice = runStrategistPhaseGatePropertyFuzzSlice();
    assert.equal(slice.contractFuzzRejected, true);
    assert.equal(slice.contractFuzz.accepted, 0);
    assert.equal(slice.runRecordFuzzRejected, true);
    assert.equal(slice.runRecordFuzz.mutationsAccepted, 0);
  });
});

describe("Forge Strategist Phase Gate Regression — P03-B10-A08", () => {
  it("runForgeStrategistPhaseGateRegressionGate passes on canonical strategist phase gate matrix", () => {
    const result = runForgeStrategistPhaseGateRegressionGate();

    assert.equal(result.atom, "P03-B10-A08");
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 24);
    assert.equal(result.probeRegression, null);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.propertyFuzzSlice.propertyChecksPassed, true);
    assert.equal(result.propertyFuzzSlice.contractFuzzRejected, true);
    assert.equal(result.propertyFuzzSlice.runRecordFuzzRejected, true);
    assert.ok(result.detail.includes("24/24 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
  });

  it("detectStrategistPhaseGateProbeRegression flags newly misaligned probes", () => {
    const prior = runStrategistPhaseGateProbesWithRecord();
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

    const report = detectStrategistPhaseGateProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runStrategistPhaseGateProbeRegression alias matches detect helper", () => {
    const prior = runStrategistPhaseGateProbesWithRecord();
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

    const detectReport = detectStrategistPhaseGateProbeRegression(prior, current);
    const runReport = runStrategistPhaseGateProbeRegression(prior, current);
    assert.deepEqual(runReport, detectReport);
  });

  it("validateStrategistPhaseGateProbeRegression rejects probe drift", () => {
    const prior = runStrategistPhaseGateProbesWithRecord();
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

    const validation = validateStrategistPhaseGateProbeRegression(prior, current);
    assert.equal(validation.valid, false);
    assert.equal(validation.report.hasRegression, true);
  });

  it("runForgeStrategistPhaseGateRegressionGate compares against prior record without false regression", () => {
    const prior = runStrategistPhaseGateProbesWithRecord();
    const result = runForgeStrategistPhaseGateRegressionGate(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runForgeStrategistPhaseGateRegressionGate rejects tampered prior records", () => {
    const prior = runStrategistPhaseGateProbesWithRecord();
    const tamperedPrior = applyStrategistPhaseGateRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateStrategistPhaseGateRunRecord(tamperedPrior).valid, false);

    const result = runForgeStrategistPhaseGateRegressionGate(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runForgeStrategistPhaseGateRegressionGate fails when probe alignment regresses", () => {
    const prior = runStrategistPhaseGateProbesWithRecord();
    const tamperedCurrent = structuredClone(prior);
    const target = tamperedCurrent.evidence[0]!;
    target.aligned = false;
    target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
    tamperedCurrent.summary = {
      ...tamperedCurrent.summary,
      aligned: tamperedCurrent.summary.aligned - 1,
      mismatches: tamperedCurrent.summary.mismatches + 1,
    };

    const report = detectStrategistPhaseGateProbeRegression(prior, tamperedCurrent);
    assert.equal(report.hasRegression, true);
  });
});
