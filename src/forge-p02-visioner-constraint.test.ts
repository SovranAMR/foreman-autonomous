import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerConstraintBaseline,
  runVisionerConstraintProbes,
  runVisionerConstraintProductionSlice,
  runVisionerConstraintBoundarySlice,
  runVisionerConstraintFailureRecoverySlice,
  runVisionerConstraintFailureRecoverySliceWithRecord,
  runVisionerConstraintProbesWithRecord,
} from "./forge-p02-visioner-constraint.probe.js";
import {
  assessVisionerConstraintInputBoundary,
  extractVisionerConstraints,
  buildVisionConstraintSummary,
  getActiveVisionerConstraintContract,
  getVisionerConstraintCategoryContract,
  listVisionerConstraintContractProbeIds,
  listVisionerConstraintContractProbesByCategory,
  listVisionerConstraintProbesByDisposition,
  summarizeVisionerConstraintContractCoverage,
  validateVisionerConstraintContractCoverage,
  validateVisionerConstraintAgainstContract,
  validateVisionerConstraintProbeMatrix,
  validateVisionerConstraintBoundaryProbeMatrix,
  validateVisionerConstraintFailureRecoveryProbeMatrix,
  validateVisionerConstraintFailureRecoveryRunRecord,
  validateVisionerConstraintRunRecord,
  buildVisionerConstraintProbeEvidence,
  buildVisionerConstraintProbeTelemetry,
  buildVisionerConstraintProvenance,
  buildVisionerConstraintRunRecord,
  listVisionerConstraintFailureRecoveryProbeIds,
  VISIONER_CONSTRAINT_FAILURE_RECOVERY_CATEGORIES,
  VISIONER_CONSTRAINT_CATEGORIES,
  VISIONER_CONSTRAINT_VISION_MAX_LENGTH,
  FORGE_VISIONER_CONSTRAINT_VERSION,
} from "./forge-p02-visioner-constraint.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Constraint Contract — P02-B02-A02", () => {
  it("defines typed acceptance for all eight visioner constraint categories", () => {
    const contract = getActiveVisionerConstraintContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P02-B02-A05");

    for (const category of VISIONER_CONSTRAINT_CATEGORIES) {
      const categoryContract = getVisionerConstraintCategoryContract(category);
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

  it("maps 23 probes with one documented gap aligned to baseline fixture", () => {
    const contract = getActiveVisionerConstraintContract();
    const summary = summarizeVisionerConstraintContractCoverage(contract);
    const coverage = validateVisionerConstraintContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 22);
    assert.equal(summary.expectedFail, 1);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 1);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 1);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.constraint_versioning.probeCount, 3);
    assert.equal(summary.byCategory.constraint_signal.probeCount, 3);
    assert.equal(summary.byCategory.non_goal_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists one remaining gap probe for structured constraint recovery", () => {
    const gaps = listVisionerConstraintProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, ["vcon.structured_constraint_recovery"]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadVisionerConstraintBaseline();
    const contract = getActiveVisionerConstraintContract();
    const validation = validateVisionerConstraintAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listVisionerConstraintContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each visioner constraint probe id is globally unique", () => {
    const ids = listVisionerConstraintContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runVisionerConstraintProbes();
    const contract = getActiveVisionerConstraintContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveVisionerConstraintContract();
    const flatIds = listVisionerConstraintContractProbeIds(contract);
    const categoryIds = VISIONER_CONSTRAINT_CATEGORIES.flatMap(category =>
      listVisionerConstraintContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });
});

describe("Forge Visioner Constraint Production Slice — P02-B02-A03", () => {
  const SAMPLE_VISION = `**GOAL**: Ship feature
**CONSTRAINTS**: TypeScript strict mode only
**FORBIDDEN**: No jQuery`;

  it("extractVisionerConstraints exports structured constraints and non-goals", () => {
    const extracted = extractVisionerConstraints(SAMPLE_VISION);
    assert.equal(extracted.hasConstraints, true);
    assert.equal(extracted.hasNonGoals, true);
    assert.ok(extracted.constraints.some(c => /TypeScript strict mode/i.test(c)));
    assert.ok(extracted.nonGoals.some(g => /jQuery/i.test(g)));
  });

  it("buildVisionConstraintSummary preserves constraint sections for worker injection", () => {
    const summary = buildVisionConstraintSummary(SAMPLE_VISION);
    assert.match(summary, /CONSTRAINT/i);
    assert.match(summary, /FORBIDDEN/i);
    assert.match(summary, /TypeScript strict mode/i);
  });

  it("executes contract-wired probes with zero unexpected mismatches after extraction slice", () => {
    const contract = getActiveVisionerConstraintContract();
    const slice = runVisionerConstraintProductionSlice();

    assert.equal(slice.atom, "P02-B02-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 22);
    assert.equal(slice.matrixValidation.gapAligned, 1);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateVisionerConstraintProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(slice.summary.mismatches.length, 0);
    assert.equal(slice.summary.knownGaps.length, 1);
    assert.deepEqual(
      slice.summary.knownGaps.map(g => g.id).sort(),
      ["vcon.structured_constraint_recovery"],
    );

    for (const id of ["vcon.vision_summary_constraint_extract", "vcon.non_goal_forbidden_extract"]) {
      const result = slice.results.find(r => r.id === id);
      assert.ok(result, `${id} missing`);
      assert.equal(result!.expected, "PASS");
      assert.equal(result!.actual, "PASS");
      assert.equal(result!.aligned, true);
    }
  });
});

describe("Forge Visioner Constraint Boundary Slice — P02-B02-A04", () => {
  it("assessVisionerConstraintInputBoundary handles empty, whitespace-only and oversized vision output", () => {
    const empty = assessVisionerConstraintInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessVisionerConstraintInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessVisionerConstraintInputBoundary("vision\x00output");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const longVision = "x".repeat(VISIONER_CONSTRAINT_VISION_MAX_LENGTH + 200);
    const truncated = assessVisionerConstraintInputBoundary(longVision);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedVision.length, VISIONER_CONSTRAINT_VISION_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("extractVisionerConstraints returns empty arrays for unacceptable boundary inputs", () => {
    const extracted = extractVisionerConstraints("   ");
    assert.equal(extracted.hasConstraints, false);
    assert.equal(extracted.hasNonGoals, false);
    assert.deepEqual(extracted.constraints, []);
    assert.deepEqual(extracted.nonGoals, []);
  });

  it("defines boundary category with vision output edge-case probes", () => {
    const boundary = listVisionerConstraintContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "vcon.empty_vision_constraint_presence",
      "vcon.known_gaps_documented",
      "vcon.long_vision_truncation_boundary",
      "vcon.probe_runner_exported",
      "vcon.source_block_gate_ref",
      "vcon.whitespace_vision_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveVisionerConstraintContract();
    const slice = runVisionerConstraintBoundarySlice();

    assert.equal(slice.atom, "P02-B02-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listVisionerConstraintContractProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateVisionerConstraintBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves structured_constraint_recovery gap while boundary probes pass", () => {
    const slice = runVisionerConstraintBoundarySlice();
    const recoveryGap = slice.results.find(r => r.id === "vcon.structured_constraint_recovery");

    assert.ok(recoveryGap);
    assert.equal(recoveryGap!.expected, "FAIL");
    assert.equal(recoveryGap!.actual, "FAIL");
    assert.equal(recoveryGap!.aligned, true);
  });
});

describe("Forge Visioner Constraint Failure/Recovery Slice — P02-B02-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveVisionerConstraintContract();
    const failure = listVisionerConstraintContractProbesByCategory("failure_path", contract);
    const recovery = listVisionerConstraintContractProbesByCategory("recovery_path", contract);
    const nogo = listVisionerConstraintContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...VISIONER_CONSTRAINT_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveVisionerConstraintContract();
    const slice = runVisionerConstraintFailureRecoverySlice();

    assert.equal(slice.atom, "P02-B02-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 5);
    assert.equal(slice.matrixValidation.gapAligned, 1);

    for (const category of VISIONER_CONSTRAINT_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listVisionerConstraintContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateVisionerConstraintFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves structured_constraint_recovery gap while exercising failure/recovery/NO-GO paths", () => {
    const slice = runVisionerConstraintFailureRecoverySlice();
    const probeIds = listVisionerConstraintFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "vcon.malformed_vision_presence_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const recoveryGap = slice.failureRecoveryResults.find(
      r => r.id === "vcon.structured_constraint_recovery",
    );
    assert.ok(recoveryGap);
    assert.equal(recoveryGap!.expected, "FAIL");
    assert.equal(recoveryGap!.actual, "FAIL");

    const workerNogo = slice.failureRecoveryResults.find(r => r.id === "vcon.worker_constraint_nogo");
    assert.ok(workerNogo);
    assert.equal(workerNogo!.expected, "PASS");
    assert.equal(workerNogo!.actual, "PASS");
  });
});

describe("Forge Visioner Constraint Evidence — P02-B02-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadVisionerConstraintBaseline();
    const contract = getActiveVisionerConstraintContract();
    const probeIds = listVisionerConstraintFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildVisionerConstraintProbeEvidence(
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
      return buildVisionerConstraintProbeTelemetry(probeId, contractProbe.category, index, index * 0.5);
    });

    const provenance = buildVisionerConstraintProvenance(
      "run-vcon-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P02-B02-A06",
        sliceCategories: VISIONER_CONSTRAINT_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildVisionerConstraintRunRecord(provenance, evidence, telemetry);
    const validation = validateVisionerConstraintFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 6);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.gap >= 1);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 1);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBlockGateAtom, fixture.sourceBlockGate.atom);
  });

  it("records evidence, telemetry and provenance for failure/recovery slice run", () => {
    const contract = getActiveVisionerConstraintContract();
    const record = runVisionerConstraintFailureRecoverySliceWithRecord();
    const validation = validateVisionerConstraintFailureRecoveryRunRecord(record, contract);

    assert.equal(record.evidence.length, 6);
    assert.equal(record.telemetry.length, 6);
    assert.equal(record.provenance.totalProbes, 6);
    assert.equal(record.provenance.sliceAtom, "P02-B02-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_VISIONER_CONSTRAINT_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a07");
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

    const recoveryGap = record.evidence.find(e => e.probeId === "vcon.structured_constraint_recovery");
    assert.ok(recoveryGap);
    assert.equal(recoveryGap!.aligned, true);
    assert.equal(recoveryGap!.expected, "FAIL");
    assert.equal(recoveryGap!.actual, "FAIL");
    assert.equal(recoveryGap!.disposition, "gap");
  });

  it("records evidence, telemetry and provenance for full visioner constraint run", () => {
    const contract = getActiveVisionerConstraintContract();
    const record = runVisionerConstraintProbesWithRecord();
    const validation = validateVisionerConstraintRunRecord(record, contract);

    assert.equal(record.evidence.length, 23);
    assert.equal(record.telemetry.length, 23);
    assert.equal(record.provenance.totalProbes, 23);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a07");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
  });
});
