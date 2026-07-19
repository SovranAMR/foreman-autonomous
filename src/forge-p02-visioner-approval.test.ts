import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerApprovalBaseline,
  runVisionerApprovalProbes,
  runVisionerApprovalProductionSlice,
  runVisionerApprovalBoundarySlice,
  runVisionerApprovalFailureRecoverySlice,
  runVisionerApprovalFailureRecoverySliceWithRecord,
  loadVisionerApprovalBaseline,
} from "./forge-p02-visioner-approval.probe.js";
import {
  assessVisionerApprovalInputBoundary,
  assessVisionerApprovalPresence,
  getActiveVisionerApprovalContract,
  getVisionerApprovalCategoryContract,
  listVisionerApprovalContractProbeIds,
  listVisionerApprovalContractProbesByCategory,
  listVisionerApprovalFailureRecoveryProbeIds,
  listVisionerApprovalProbesByDisposition,
  summarizeVisionerApprovalContractCoverage,
  validateVisionerApprovalContractCoverage,
  validateVisionerApprovalAgainstContract,
  validateVisionerApprovalProbeMatrix,
  validateVisionerApprovalBoundaryProbeMatrix,
  validateVisionerApprovalFailureRecoveryProbeMatrix,
  validateVisionerApprovalFailureRecoveryRunRecord,
  buildVisionerApprovalProbeEvidence,
  buildVisionerApprovalProbeTelemetry,
  buildVisionerApprovalProvenance,
  buildVisionerApprovalRunRecord,
  recoverVisionerSteering,
  VISIONER_APPROVAL_CATEGORIES,
  VISIONER_APPROVAL_FAILURE_RECOVERY_CATEGORIES,
  VISIONER_APPROVAL_VISION_MAX_LENGTH,
  FORGE_VISIONER_APPROVAL_VERSION,
} from "./forge-p02-visioner-approval.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Approval Contract — P02-B09-A02", () => {
  it("defines typed acceptance for all eight visioner approval categories", () => {
    const contract = getActiveVisionerApprovalContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P02-B09-A06");

    for (const category of VISIONER_APPROVAL_CATEGORIES) {
      const categoryContract = getVisionerApprovalCategoryContract(category);
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

  it("maps 23 probes with full alignment after A03 recovery slice", () => {
    const contract = getActiveVisionerApprovalContract();
    const summary = summarizeVisionerApprovalContractCoverage(contract);
    const coverage = validateVisionerApprovalContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.approval_versioning.probeCount, 3);
    assert.equal(summary.byCategory.approval_signal.probeCount, 3);
    assert.equal(summary.byCategory.steering_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists zero remaining gap probes after structured steering recovery", () => {
    const gaps = listVisionerApprovalProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadVisionerApprovalBaseline();
    const contract = getActiveVisionerApprovalContract();
    const validation = validateVisionerApprovalAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listVisionerApprovalContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each visioner approval probe id is globally unique", () => {
    const ids = listVisionerApprovalContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runVisionerApprovalProbes();
    const contract = getActiveVisionerApprovalContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveVisionerApprovalContract();
    const flatIds = listVisionerApprovalContractProbeIds(contract);
    const categoryIds = VISIONER_APPROVAL_CATEGORIES.flatMap(category =>
      listVisionerApprovalContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("validates probe matrix with full alignment after A03 recovery slice", () => {
    const contract = getActiveVisionerApprovalContract();
    const results = runVisionerApprovalProbes();
    const matrixValidation = validateVisionerApprovalProbeMatrix(results, contract);

    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
    assert.equal(matrixValidation.passAligned, 23);
    assert.equal(matrixValidation.gapAligned, 0);
    assert.equal(matrixValidation.unexpectedMismatches, 0);

    const passMismatches = results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));
  });

  it("exports A01 harness version for approval contract gate", () => {
    assert.equal(FORGE_VISIONER_APPROVAL_VERSION, "1.0.0-a01");
  });
});

describe("Forge Visioner Approval Production Slice — P02-B09-A03", () => {
  it("recoverVisionerSteering restructures malformed vision into actionable approval revision", () => {
    const malformed = `REASONING: Vision document pending user review before decomposition
OUTPUT: **GOAL**: Dental clinic booking platform
user feedback: emphasize mobile-first UX and simplify onboarding flow
modify vision: focus on speed-to-value messaging over feature breadth
approval needed: pending user review
steering: prioritize conversion metrics and reduce scope to MVP landing page`;
    const recovery = recoverVisionerSteering(malformed);

    assert.equal(recovery.recovered, true);
    assert.match(recovery.composedVision, /\*\*APPROVAL\*\*:/);
    assert.match(recovery.composedVision, /\*\*STEERING\*\*:/);
    assert.equal(recovery.presence.hasApproval, true);
    assert.equal(recovery.presence.hasSteering, true);
    assert.ok(recovery.approvalRevision.includes("pending"));
    assert.ok(recovery.steeringPoints.some(point => point.includes("mobile-first")));
    assert.ok(recovery.steeringPoints.some(point => point.includes("conversion metrics")));
  });

  it("recoverVisionerSteering rejects null-byte vision output safely", () => {
    const recovery = recoverVisionerSteering("vision\0output");
    assert.equal(recovery.recovered, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_vision"]);
  });

  it("executes contract-wired probes with zero unexpected mismatches after recovery slice", () => {
    const contract = getActiveVisionerApprovalContract();
    const slice = runVisionerApprovalProductionSlice();

    assert.equal(slice.atom, "P02-B09-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 23);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }
  });
});

describe("Forge Visioner Approval Boundary Slice — P02-B09-A04", () => {
  it("assessVisionerApprovalInputBoundary handles empty, whitespace-only and oversized vision output", () => {
    const empty = assessVisionerApprovalInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessVisionerApprovalInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessVisionerApprovalInputBoundary("vision\x00output");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const longVision = "x".repeat(VISIONER_APPROVAL_VISION_MAX_LENGTH + 200);
    const truncated = assessVisionerApprovalInputBoundary(longVision);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedVision.length, VISIONER_APPROVAL_VISION_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("assessVisionerApprovalPresence returns non-approval for unacceptable boundary inputs", () => {
    const empty = assessVisionerApprovalPresence("");
    assert.equal(empty.hasApproval, false);
    assert.equal(empty.hasSteering, false);

    const whitespace = assessVisionerApprovalPresence("   ");
    assert.equal(whitespace.hasApproval, false);
    assert.equal(whitespace.hasSteering, false);

    const nullByte = assessVisionerApprovalPresence("bad\0vision");
    assert.equal(nullByte.hasApproval, false);
    assert.equal(nullByte.hasSteering, false);
  });

  it("recoverVisionerSteering rejects whitespace-only malformed approval input", () => {
    const whitespaceRecovery = recoverVisionerSteering("   \t\n  ");
    assert.equal(whitespaceRecovery.recovered, false);
    assert.deepEqual(whitespaceRecovery.parseErrors, ["whitespace_only_vision"]);
  });

  it("defines boundary category with approval input edge-case probes", () => {
    const boundary = listVisionerApprovalContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "vapp.empty_vision_approval_boundary",
      "vapp.known_gaps_documented",
      "vapp.long_vision_truncation_boundary",
      "vapp.probe_runner_exported",
      "vapp.source_block_gate_ref",
      "vapp.whitespace_vision_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveVisionerApprovalContract();
    const slice = runVisionerApprovalBoundarySlice();

    assert.equal(slice.atom, "P02-B09-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listVisionerApprovalContractProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateVisionerApprovalBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves full probe alignment while boundary slice passes", () => {
    const slice = runVisionerApprovalBoundarySlice();
    const recoveryProbe = slice.results.find(r => r.id === "vapp.structured_steering_recovery");

    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(slice.results.filter(r => !r.aligned).length, 0);
  });
});

describe("Forge Visioner Approval Failure/Recovery Slice — P02-B09-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveVisionerApprovalContract();
    const failure = listVisionerApprovalContractProbesByCategory("failure_path", contract);
    const recovery = listVisionerApprovalContractProbesByCategory("recovery_path", contract);
    const nogo = listVisionerApprovalContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...VISIONER_APPROVAL_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveVisionerApprovalContract();
    const slice = runVisionerApprovalFailureRecoverySlice();

    assert.equal(slice.atom, "P02-B09-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of VISIONER_APPROVAL_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listVisionerApprovalContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateVisionerApprovalFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure/recovery/NO-GO paths with full alignment after A03 recovery slice", () => {
    const slice = runVisionerApprovalFailureRecoverySlice();
    const probeIds = listVisionerApprovalFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "vapp.malformed_vision_approval_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const structuredRecovery = slice.failureRecoveryResults.find(
      r => r.id === "vapp.structured_steering_recovery",
    );
    assert.ok(structuredRecovery);
    assert.equal(structuredRecovery!.expected, "PASS");
    assert.equal(structuredRecovery!.actual, "PASS");

    const visionRejection = slice.failureRecoveryResults.find(
      r => r.id === "vapp.vision_rejection_abort",
    );
    assert.ok(visionRejection);
    assert.equal(visionRejection!.expected, "PASS");
    assert.equal(visionRejection!.actual, "PASS");
  });
});

describe("Forge Visioner Approval Evidence — P02-B09-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadVisionerApprovalBaseline();
    const contract = getActiveVisionerApprovalContract();
    const probeIds = listVisionerApprovalFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildVisionerApprovalProbeEvidence(
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
      return buildVisionerApprovalProbeTelemetry(probeId, contractProbe.category, index, index * 0.5);
    });

    const provenance = buildVisionerApprovalProvenance(
      "run-vapp-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P02-B09-A06",
        sliceCategories: VISIONER_APPROVAL_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildVisionerApprovalRunRecord(provenance, evidence, telemetry);
    const validation = validateVisionerApprovalFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 6);
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.byDisposition.gap, 0);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBlockGateAtom, fixture.sourceBlockGate.atom);
  });

  it("records evidence, telemetry and provenance for failure/recovery slice run", () => {
    const contract = getActiveVisionerApprovalContract();
    const record = runVisionerApprovalFailureRecoverySliceWithRecord();
    const validation = validateVisionerApprovalFailureRecoveryRunRecord(record, contract);

    assert.equal(record.evidence.length, 6);
    assert.equal(record.telemetry.length, 6);
    assert.equal(record.provenance.totalProbes, 6);
    assert.equal(record.provenance.sliceAtom, "P02-B09-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_VISIONER_APPROVAL_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a01");
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
      e => e.probeId === "vapp.structured_steering_recovery",
    );
    assert.ok(structuredRecovery);
    assert.equal(structuredRecovery!.aligned, true);
    assert.equal(structuredRecovery!.expected, "PASS");
    assert.equal(structuredRecovery!.actual, "PASS");
    assert.equal(structuredRecovery!.disposition, "recovery");
  });
});
