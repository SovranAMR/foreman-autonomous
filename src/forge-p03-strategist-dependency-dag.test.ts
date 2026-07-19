import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistDependencyDagBaseline,
  getActiveStrategistDependencyDagContract,
  getStrategistDependencyDagCategoryContract,
  listStrategistDependencyDagContractProbeIds,
  listStrategistDependencyDagContractProbesByCategory,
  listStrategistDependencyDagProbesByDisposition,
  summarizeStrategistDependencyDagCoverage,
  validateStrategistDependencyDagCoverage,
  validateStrategistDependencyDagAgainstContract,
  validateStrategistDependencyDagBaseline,
  recoverStrategistDependencyDag,
  inferBlockDependenciesFromOrder,
  assessStrategistDependencyDagInputBoundary,
  runStrategistDependencyDagProductionSlice,
  runStrategistDependencyDagBoundarySlice,
  runStrategistDependencyDagFailureRecoverySlice,
  runStrategistDependencyDagFailureRecoverySliceWithRecord,
  runStrategistDependencyDagEvidenceSlice,
  runStrategistDependencyDagProbesWithRecord,
  buildStrategistDependencyDagRunRecord,
  buildStrategistDependencyDagProbeEvidence,
  buildStrategistDependencyDagProbeTelemetry,
  buildStrategistDependencyDagProvenance,
  validateStrategistDependencyDagFailureRecoveryRunRecord,
  validateStrategistDependencyDagRunRecord,
  validateStrategistDependencyDagProbeMatrix,
  validateStrategistDependencyDagBoundaryProbeMatrix,
  validateStrategistDependencyDagFailureRecoveryProbeMatrix,
  listStrategistDependencyDagFailureRecoveryProbeIds,
  runStrategistDependencyDagPropertyChecks,
  runStrategistDependencyDagFuzzValidation,
  runStrategistDependencyDagRunRecordFuzzValidation,
  runStrategistDependencyDagPropertyFuzzSlice,
  runStrategistDependencyDagForgeRegression,
  detectStrategistDependencyDagProbeRegression,
  runStrategistDependencyDagProbeRegression,
  applyStrategistDependencyDagRunRecordFuzzMutation,
  createStrategistDependencyDagFuzzRng,
  buildStrategistDependencyDagAdversarialGuardScenarios,
  detectStrategistDependencyDagFalseAlignment,
  detectStrategistDependencyDagEvidenceSummaryMismatch,
  runStrategistDependencyDagAdversarialGuardChecks,
  validateForgeStrategistDependencyDagGuard,
  validateStrategistDependencyDagPerformance,
  validateStrategistDependencyDagCost,
  validateStrategistDependencyDagSafety,
  getForgeStrategistDependencyDagGuardControls,
  STRATEGIST_DEPENDENCY_DAG_FAILURE_RECOVERY_CATEGORIES,
  STRATEGIST_DEPENDENCY_DAG_DECOMPOSE_MAX_LENGTH,
  STRATEGIST_DEPENDENCY_DAG_CATEGORIES,
  FORGE_STRATEGIST_DEPENDENCY_DAG_VERSION,
  FORGE_STRATEGIST_DEPENDENCY_DAG_CONTRACT_V1,
} from "./forge-p03-strategist-dependency-dag.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Dependency DAG Contract — P03-B04-A02", () => {
  it("defines typed acceptance for all eight dependency DAG categories", () => {
    const contract = getActiveStrategistDependencyDagContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B04-A06");

    for (const category of STRATEGIST_DEPENDENCY_DAG_CATEGORIES) {
      const categoryContract = getStrategistDependencyDagCategoryContract(category);
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

  it("maps 27 probes with six documented FAIL gaps aligned to A01 baseline", () => {
    const contract = getActiveStrategistDependencyDagContract();
    const summary = summarizeStrategistDependencyDagCoverage(contract);
    const coverage = validateStrategistDependencyDagCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 27);
    assert.equal(summary.expectedPass, 21);
    assert.equal(summary.expectedFail, 6);
    assert.equal(summary.byDisposition.observed, 16);
    assert.equal(summary.byDisposition.gap, 6);
    assert.equal(summary.byDisposition.failure, 3);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 0);
    assert.equal(summary.byCategory.dag_versioning.probeCount, 3);
    assert.equal(summary.byCategory.block_dag.probeCount, 4);
    assert.equal(summary.byCategory.atom_dag.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 7);
    assert.equal(summary.byCategory.failure_path.probeCount, 3);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 3);
  });

  it("lists six gap probes matching documented dependency DAG debt", () => {
    const gaps = listStrategistDependencyDagProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), [
      "sdag.exported_dag_validator",
      "sdag.nogo_cycle_block_halt",
      "sdag.nogo_invalid_dep_graph",
      "sdag.orchestrator_atom_waves",
      "sdag.parser_atom_deps",
      "sdag.prompt_atom_dependencies",
    ]);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistDependencyDagBaseline();
    const contract = getActiveStrategistDependencyDagContract();
    const validation = validateStrategistDependencyDagAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistDependencyDagContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("baseline validation includes contract alignment from A02", () => {
    const fixture = loadStrategistDependencyDagBaseline();
    const validation = validateStrategistDependencyDagBaseline(fixture);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_DEPENDENCY_DAG_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_DEPENDENCY_DAG_CONTRACT_V1.probes.length, 27);
  });

  it("each dependency DAG probe id is globally unique", () => {
    const ids = listStrategistDependencyDagContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistDependencyDagContract();
    const flatIds = listStrategistDependencyDagContractProbeIds(contract);
    const categoryIds = STRATEGIST_DEPENDENCY_DAG_CATEGORIES.flatMap(category =>
      listStrategistDependencyDagContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });
});

describe("Forge Strategist Dependency DAG Production Slice — P03-B04-A03", () => {
  it("recoverStrategistDependencyDag restructures malformed dependency graph into valid DAG plan", () => {
    const malformed = `REASONING: Need dependency DAG plan
Here are the steps:
Block 1: Setup dependency DAG types
Block 2: Wire block dependency parser seam
Block 3: Add dependency DAG baseline tests
DEPENDENCIES: 2→99, 3→3, 4→1
CONFIDENCE: 0.8`;
    const recovery = recoverStrategistDependencyDag(malformed);

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.dagValid, true);
    assert.ok(recovery.blockCount >= 3);
    assert.match(recovery.composedDecompose, /DEPENDENCIES:/);
    assert.ok(recovery.blocks.some(block => block.includes("dependency DAG types")));
    assert.ok(recovery.blocks.some(block => block.includes("dependency parser seam")));
    assert.ok(recovery.blocks.some(block => block.includes("dependency DAG baseline")));
  });

  it("recoverStrategistDependencyDag rejects null-byte decompose output safely", () => {
    const recovery = recoverStrategistDependencyDag("decompose\0output");
    assert.equal(recovery.recovered, false);
    assert.equal(recovery.dagValid, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_decompose"]);
  });

  it("inferBlockDependenciesFromOrder provides sequential fallback when DEPENDENCIES missing", () => {
    const missingDeps = `REASONING: Blocks without explicit deps
OUTPUT:
Block 1: Root dependency block
Block 2: Depends on prior work implicitly
Block 3: Final dependency integration
CONFIDENCE: 0.75`;
    const recovery = recoverStrategistDependencyDag(missingDeps);
    const inferred = inferBlockDependenciesFromOrder(3);

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.dagValid, true);
    assert.deepEqual(inferred[0], []);
    assert.deepEqual(inferred[1], [0]);
    assert.deepEqual(inferred[2], [1]);
    assert.ok(recovery.parseErrors.includes("missing_deps_inferred"));
  });

  it("executes contract-wired probes with zero unexpected mismatches after recovery slice", () => {
    const contract = getActiveStrategistDependencyDagContract();
    const slice = runStrategistDependencyDagProductionSlice();

    assert.equal(slice.atom, "P03-B04-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 27);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 21);
    assert.equal(slice.matrixValidation.gapAligned, 6);
    assert.equal(slice.summary.knownGaps.length, 6);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateStrategistDependencyDagProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const recoveryProbe = slice.results.find(r => r.id === "sdag.recovery_dag_repair");
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);

    const fallbackProbe = slice.results.find(r => r.id === "sdag.recovery_missing_deps_fallback");
    assert.ok(fallbackProbe);
    assert.equal(fallbackProbe!.expected, "PASS");
    assert.equal(fallbackProbe!.actual, "PASS");
    assert.equal(fallbackProbe!.aligned, true);
  });
});

describe("Forge Strategist Dependency DAG Boundary Slice — P03-B04-A04", () => {
  it("assessStrategistDependencyDagInputBoundary handles decompose edge cases including truncation", () => {
    const empty = assessStrategistDependencyDagInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistDependencyDagInputBoundary("   \t\n  ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessStrategistDependencyDagInputBoundary("bad\0decompose");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const valid = assessStrategistDependencyDagInputBoundary(
      "REASONING: valid\nOUTPUT:\nBlock 1: task\nDEPENDENCIES: none\nCONFIDENCE: 0.8",
    );
    assert.equal(valid.disposition, "valid");
    assert.equal(valid.acceptable, true);

    const longDecompose = "x".repeat(STRATEGIST_DEPENDENCY_DAG_DECOMPOSE_MAX_LENGTH + 500);
    const truncated = assessStrategistDependencyDagInputBoundary(longDecompose);
    assert.equal(truncated.disposition, "exceeds_max_length");
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedDecompose.length, STRATEGIST_DEPENDENCY_DAG_DECOMPOSE_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("defines boundary category with decompose input edge-case probes", () => {
    const boundary = listStrategistDependencyDagContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 7);
    assert.deepEqual(ids, [
      "sdag.empty_decompose_boundary",
      "sdag.known_gaps_documented",
      "sdag.long_decompose_truncation_boundary",
      "sdag.out_of_range_dep_filtered",
      "sdag.probe_runner_exported",
      "sdag.source_block_gate_ref",
      "sdag.whitespace_decompose_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveStrategistDependencyDagContract();
    const slice = runStrategistDependencyDagBoundarySlice();

    assert.equal(slice.atom, "P03-B04-A04");
    assert.equal(slice.boundaryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listStrategistDependencyDagContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateStrategistDependencyDagBoundaryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });
});

describe("Forge Strategist Dependency DAG Failure/Recovery Slice — P03-B04-A05", () => {
  it("defines eight failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveStrategistDependencyDagContract();
    const failure = listStrategistDependencyDagContractProbesByCategory("failure_path", contract);
    const recovery = listStrategistDependencyDagContractProbesByCategory("recovery_path", contract);
    const nogo = listStrategistDependencyDagContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 3);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 3);
    assert.deepEqual(
      [...STRATEGIST_DEPENDENCY_DAG_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveStrategistDependencyDagContract();
    const slice = runStrategistDependencyDagFailureRecoverySlice();

    assert.equal(slice.atom, "P03-B04-A05");
    assert.equal(slice.failureRecoveryProbeCount, 8);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 8);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 5);
    assert.equal(slice.matrixValidation.gapAligned, 3);

    for (const category of STRATEGIST_DEPENDENCY_DAG_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistDependencyDagContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateStrategistDependencyDagFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves NO-GO gaps while exercising failure/recovery paths", () => {
    const slice = runStrategistDependencyDagFailureRecoverySlice();
    const probeIds = listStrategistDependencyDagFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 8);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "sdag.malformed_decompose_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const dagRepair = slice.failureRecoveryResults.find(r => r.id === "sdag.recovery_dag_repair");
    assert.ok(dagRepair);
    assert.equal(dagRepair!.expected, "PASS");
    assert.equal(dagRepair!.actual, "PASS");

    const cycleNogo = slice.failureRecoveryResults.find(r => r.id === "sdag.nogo_cycle_block_halt");
    assert.ok(cycleNogo);
    assert.equal(cycleNogo!.expected, "FAIL");
    assert.equal(cycleNogo!.actual, "FAIL");

    const dagValidatorGap = slice.failureRecoveryResults.find(
      r => r.id === "sdag.exported_dag_validator",
    );
    assert.ok(dagValidatorGap);
    assert.equal(dagValidatorGap!.expected, "FAIL");
    assert.equal(dagValidatorGap!.actual, "FAIL");
  });
});

describe("Forge Strategist Dependency DAG Evidence — P03-B04-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadStrategistDependencyDagBaseline();
    const contract = getActiveStrategistDependencyDagContract();
    const probeIds = listStrategistDependencyDagFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildStrategistDependencyDagProbeEvidence(
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
      return buildStrategistDependencyDagProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildStrategistDependencyDagProvenance(
      "run-sdag-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P03-B04-A06",
        sliceCategories: STRATEGIST_DEPENDENCY_DAG_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildStrategistDependencyDagRunRecord(provenance, evidence, telemetry);
    const validation = validateStrategistDependencyDagFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 8);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 3);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.gap >= 3);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBlockGateAtom, fixture.sourceBlockGate.atom);
  });

  it("executes evidence slice with zero unexpected mismatches and valid run record", () => {
    const contract = getActiveStrategistDependencyDagContract();
    const slice = runStrategistDependencyDagEvidenceSlice();

    assert.equal(slice.atom, "P03-B04-A06");
    assert.equal(slice.evidenceProbeCount, 8);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 8);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 5);
    assert.equal(slice.matrixValidation.gapAligned, 3);
    assert.equal(
      slice.recordValidation.valid,
      true,
      slice.recordValidation.issues.map(i => i.detail).join("\n"),
    );

    for (const category of STRATEGIST_DEPENDENCY_DAG_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistDependencyDagContractProbesByCategory(category, contract)) {
        const result = slice.evidenceResults.find(r => r.id === probe.id);
        assert.ok(result, `missing evidence result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const record = slice.record;
    assert.equal(record.evidence.length, 8);
    assert.equal(record.telemetry.length, 8);
    assert.equal(record.provenance.totalProbes, 8);
    assert.equal(record.provenance.sliceAtom, "P03-B04-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_STRATEGIST_DEPENDENCY_DAG_VERSION);
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

    const recoveryProbe = record.evidence.find(e => e.probeId === "sdag.recovery_dag_repair");
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.disposition, "recovery");
  });

  it("records evidence, telemetry and provenance for full dependency DAG run", () => {
    const contract = getActiveStrategistDependencyDagContract();
    const record = runStrategistDependencyDagProbesWithRecord();
    const validation = validateStrategistDependencyDagRunRecord(record, contract);

    assert.equal(record.evidence.length, 27);
    assert.equal(record.telemetry.length, 27);
    assert.equal(record.provenance.totalProbes, 27);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a09");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 27);
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveStrategistDependencyDagContract();
    const record = runStrategistDependencyDagFailureRecoverySliceWithRecord();
    const validation = validateStrategistDependencyDagFailureRecoveryRunRecord(record, contract);

    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.aligned, 8);
  });
});

describe("Forge Strategist Dependency DAG Property/Fuzz — P03-B04-A07", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runStrategistDependencyDagPropertyChecks(FORGE_STRATEGIST_DEPENDENCY_DAG_CONTRACT_V1);
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createStrategistDependencyDagFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createStrategistDependencyDagFuzzRng(1337);
    const rngB = createStrategistDependencyDagFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createStrategistDependencyDagFuzzRng(1338)()));
  });

  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadStrategistDependencyDagBaseline();
    const contract = getActiveStrategistDependencyDagContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runStrategistDependencyDagFuzzValidation(fixture, contract, seed, 24);
      assert.equal(fuzz.iterations, 24);
      assert.equal(fuzz.rejected, 24, `seed=${seed} accepted=${fuzz.accepted}`);
      assert.equal(fuzz.allMutationsRejected, true);
      for (const item of fuzz.cases) {
        assert.equal(item.valid, false, `${item.mutation.kind}@${item.mutation.probeId} should fail`);
        assert.ok(item.issueKinds.length > 0);
      }
    }
  });

  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveStrategistDependencyDagContract();
    const record = runStrategistDependencyDagFailureRecoverySliceWithRecord();

    assert.equal(
      validateStrategistDependencyDagFailureRecoveryRunRecord(record, contract).valid,
      true,
      validateStrategistDependencyDagFailureRecoveryRunRecord(record, contract).issues.map(i => i.detail).join("\n"),
    );

    const fuzz = runStrategistDependencyDagRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveStrategistDependencyDagContract();
    const fixture = loadStrategistDependencyDagBaseline();
    const probeIds = listStrategistDependencyDagContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistDependencyDagProbeEvidence(
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
      return buildStrategistDependencyDagProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildStrategistDependencyDagProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildStrategistDependencyDagRunRecord(provenance, evidence, telemetry);

    assert.equal(validateStrategistDependencyDagRunRecord(record, contract).valid, true);

    const fuzz = runStrategistDependencyDagRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });

  it("executes property/fuzz slice with zero accepted mutations", () => {
    const slice = runStrategistDependencyDagPropertyFuzzSlice();

    assert.equal(slice.atom, "P03-B04-A07");
    assert.equal(slice.propertyChecksPassed, true);
    assert.equal(slice.contractFuzzRejected, true);
    assert.equal(slice.runRecordFuzzRejected, true);
    assert.equal(slice.propertyResult.allPassed, true);
    assert.equal(slice.contractFuzz.allMutationsRejected, true);
    assert.equal(slice.contractFuzz.accepted, 0);
    assert.equal(slice.runRecordFuzz.mutationsAccepted, 0);
  });
});

describe("Forge Strategist Dependency DAG Regression — P03-B04-A08", () => {
  it("runStrategistDependencyDagForgeRegression passes on canonical dependency DAG matrix", () => {
    const result = runStrategistDependencyDagForgeRegression();

    assert.equal(result.atom, "P03-B04-A08");
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 27);
    assert.equal(result.probeRegression, null);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.propertyFuzzSlice.propertyChecksPassed, true);
    assert.equal(result.propertyFuzzSlice.contractFuzzRejected, true);
    assert.equal(result.propertyFuzzSlice.runRecordFuzzRejected, true);
    assert.ok(result.detail.includes("27/27 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
  });

  it("detectStrategistDependencyDagProbeRegression flags newly misaligned probes", () => {
    const prior = runStrategistDependencyDagProbesWithRecord();
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

    const report = detectStrategistDependencyDagProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runStrategistDependencyDagProbeRegression alias matches detect helper", () => {
    const prior = runStrategistDependencyDagProbesWithRecord();
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

    const detectReport = detectStrategistDependencyDagProbeRegression(prior, current);
    const runReport = runStrategistDependencyDagProbeRegression(prior, current);
    assert.deepEqual(runReport, detectReport);
  });

  it("runStrategistDependencyDagForgeRegression compares against prior record without false regression", () => {
    const prior = runStrategistDependencyDagProbesWithRecord();
    const result = runStrategistDependencyDagForgeRegression(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runStrategistDependencyDagForgeRegression rejects tampered prior records", () => {
    const prior = runStrategistDependencyDagProbesWithRecord();
    const tamperedPrior = applyStrategistDependencyDagRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateStrategistDependencyDagRunRecord(tamperedPrior).valid, false);

    const result = runStrategistDependencyDagForgeRegression(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runStrategistDependencyDagForgeRegression fails when probe alignment regresses", () => {
    const prior = runStrategistDependencyDagProbesWithRecord();
    const tamperedCurrent = structuredClone(prior);
    const target = tamperedCurrent.evidence[0]!;
    target.aligned = false;
    target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
    tamperedCurrent.summary = {
      ...tamperedCurrent.summary,
      aligned: tamperedCurrent.summary.aligned - 1,
      mismatches: tamperedCurrent.summary.mismatches + 1,
    };

    const report = detectStrategistDependencyDagProbeRegression(prior, tamperedCurrent);
    assert.equal(report.hasRegression, true);
  });
});

describe("Forge Strategist Dependency DAG Guard — P03-B04-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runStrategistDependencyDagProbesWithRecord();
    const contract = getActiveStrategistDependencyDagContract();
    const adversarial = runStrategistDependencyDagAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildStrategistDependencyDagProbeEvidence(
      "sdag.version_tagged",
      "dag_versioning",
      "PASS",
      "FAIL",
      true,
      "test",
      "false pass claim",
      "observed",
      "2026-07-19T06:00:00.000Z",
    );
    const fixture = loadStrategistDependencyDagBaseline();
    const contract = getActiveStrategistDependencyDagContract();
    const falsePassRecord = buildStrategistDependencyDagRunRecord(
      buildStrategistDependencyDagProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T06:00:00.000Z",
        "2026-07-19T06:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildStrategistDependencyDagProbeTelemetry("sdag.version_tagged", "dag_versioning", 0, 1)],
    );
    assert.ok(detectStrategistDependencyDagFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildStrategistDependencyDagProbeEvidence(
      "sdag.version_tagged",
      "dag_versioning",
      "PASS",
      "FAIL",
      false,
      "test",
      "summary tamper",
      "observed",
      "2026-07-19T06:00:00.000Z",
    );
    const summaryRecord = buildStrategistDependencyDagRunRecord(
      buildStrategistDependencyDagProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T06:00:00.000Z",
        "2026-07-19T06:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildStrategistDependencyDagProbeTelemetry("sdag.version_tagged", "dag_versioning", 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectStrategistDependencyDagEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildStrategistDependencyDagAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildStrategistDependencyDagAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Strategist Dependency DAG Guard — P03-B04-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical dependency DAG run", () => {
    const record = runStrategistDependencyDagProbesWithRecord();
    const contract = getActiveStrategistDependencyDagContract();
    const guard = validateForgeStrategistDependencyDagGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeStrategistDependencyDagGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadStrategistDependencyDagBaseline();
    const contract = getActiveStrategistDependencyDagContract();
    const probeIds = listStrategistDependencyDagContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistDependencyDagProbeEvidence(
        id,
        probe.category,
        probe.expected,
        probe.expected,
        true,
        probe.criterion,
        "ok",
        probe.disposition,
      );
    });
    const telemetry = probeIds.map((id, index) => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistDependencyDagProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildStrategistDependencyDagRunRecord(
      buildStrategistDependencyDagProvenance(
        "perf-test",
        fixture,
        contract,
        "2026-07-19T06:00:00.000Z",
        "2026-07-19T06:00:01.000Z",
        probeIds.length,
      ),
      evidence,
      telemetry,
    );

    const perfIssues = validateStrategistDependencyDagPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateStrategistDependencyDagCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadStrategistDependencyDagBaseline();
    const contract = getActiveStrategistDependencyDagContract();
    const evidence = buildStrategistDependencyDagProbeEvidence(
      "sdag.version_tagged",
      "dag_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildStrategistDependencyDagRunRecord(
      buildStrategistDependencyDagProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T06:00:00.000Z",
        "2026-07-19T06:00:01.000Z",
        1,
      ),
      [evidence],
      [buildStrategistDependencyDagProbeTelemetry("sdag.version_tagged", "dag_versioning", 0, 1)],
    );

    const safetyIssues = validateStrategistDependencyDagSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});
