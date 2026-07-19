import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerApprovalBaseline,
  runVisionerApprovalProbes,
  runVisionerApprovalProductionSlice,
  runVisionerApprovalBoundarySlice,
} from "./forge-p02-visioner-approval.probe.js";
import {
  assessVisionerApprovalInputBoundary,
  assessVisionerApprovalPresence,
  getActiveVisionerApprovalContract,
  getVisionerApprovalCategoryContract,
  listVisionerApprovalContractProbeIds,
  listVisionerApprovalContractProbesByCategory,
  listVisionerApprovalProbesByDisposition,
  summarizeVisionerApprovalContractCoverage,
  validateVisionerApprovalContractCoverage,
  validateVisionerApprovalAgainstContract,
  validateVisionerApprovalProbeMatrix,
  validateVisionerApprovalBoundaryProbeMatrix,
  recoverVisionerSteering,
  VISIONER_APPROVAL_CATEGORIES,
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
