import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerApprovalBaseline,
  runVisionerApprovalProbes,
  runVisionerApprovalProductionSlice,
} from "./forge-p02-visioner-approval.probe.js";
import {
  getActiveVisionerApprovalContract,
  getVisionerApprovalCategoryContract,
  listVisionerApprovalContractProbeIds,
  listVisionerApprovalContractProbesByCategory,
  listVisionerApprovalProbesByDisposition,
  summarizeVisionerApprovalContractCoverage,
  validateVisionerApprovalContractCoverage,
  validateVisionerApprovalAgainstContract,
  validateVisionerApprovalProbeMatrix,
  recoverVisionerSteering,
  VISIONER_APPROVAL_CATEGORIES,
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
