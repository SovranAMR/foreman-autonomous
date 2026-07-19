import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerUncertaintyBaseline,
  runVisionerUncertaintyProbes,
  runVisionerUncertaintyProductionSlice,
  runVisionerUncertaintyBoundarySlice,
  runVisionerUncertaintyFailureRecoverySlice,
} from "./forge-p02-visioner-uncertainty.probe.js";
import {
  getActiveVisionerUncertaintyContract,
  getVisionerUncertaintyCategoryContract,
  listVisionerUncertaintyContractProbeIds,
  listVisionerUncertaintyContractProbesByCategory,
  listVisionerUncertaintyProbesByDisposition,
  summarizeVisionerUncertaintyContractCoverage,
  validateVisionerUncertaintyContractCoverage,
  validateVisionerUncertaintyAgainstContract,
  validateVisionerUncertaintyProbeMatrix,
  validateVisionerUncertaintyBoundaryProbeMatrix,
  recoverVisionerUncertaintyClarification,
  assessVisionerUncertaintyInputBoundary,
  assessVisionerUncertaintyPresence,
  validateVisionerUncertaintyFailureRecoveryProbeMatrix,
  listVisionerUncertaintyFailureRecoveryProbeIds,
  VISIONER_UNCERTAINTY_FAILURE_RECOVERY_CATEGORIES,
  VISIONER_UNCERTAINTY_CATEGORIES,
  VISIONER_UNCERTAINTY_VISION_MAX_LENGTH,
  FORGE_VISIONER_UNCERTAINTY_VERSION,
} from "./forge-p02-visioner-uncertainty.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Uncertainty Contract — P02-B06-A02", () => {
  it("defines typed acceptance for all eight visioner uncertainty categories", () => {
    const contract = getActiveVisionerUncertaintyContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P02-B06-A06");

    for (const category of VISIONER_UNCERTAINTY_CATEGORIES) {
      const categoryContract = getVisionerUncertaintyCategoryContract(category);
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

  it("maps 23 probes with zero documented gaps after A03 recovery slice", () => {
    const contract = getActiveVisionerUncertaintyContract();
    const summary = summarizeVisionerUncertaintyContractCoverage(contract);
    const coverage = validateVisionerUncertaintyContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.uncertainty_versioning.probeCount, 3);
    assert.equal(summary.byCategory.uncertainty_signal.probeCount, 3);
    assert.equal(summary.byCategory.clarification_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists no remaining gap probes after A03 structured clarification recovery", () => {
    const gaps = listVisionerUncertaintyProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadVisionerUncertaintyBaseline();
    const contract = getActiveVisionerUncertaintyContract();
    const validation = validateVisionerUncertaintyAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listVisionerUncertaintyContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each visioner uncertainty probe id is globally unique", () => {
    const ids = listVisionerUncertaintyContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runVisionerUncertaintyProbes();
    const contract = getActiveVisionerUncertaintyContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveVisionerUncertaintyContract();
    const flatIds = listVisionerUncertaintyContractProbeIds(contract);
    const categoryIds = VISIONER_UNCERTAINTY_CATEGORIES.flatMap(category =>
      listVisionerUncertaintyContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("validates probe matrix with full alignment after A03 recovery slice", () => {
    const contract = getActiveVisionerUncertaintyContract();
    const results = runVisionerUncertaintyProbes();
    const matrixValidation = validateVisionerUncertaintyProbeMatrix(results, contract);

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

  it("exports A01 harness version for uncertainty contract gate", () => {
    assert.equal(FORGE_VISIONER_UNCERTAINTY_VERSION, "1.0.0-a01");
  });
});

describe("Forge Visioner Uncertainty Production Slice — P02-B06-A03", () => {
  it("recoverVisionerUncertaintyClarification restructures malformed vision into actionable clarification request", () => {
    const malformed = `REASONING: Task scope is unclear for dental product landing page
OUTPUT: **GOAL**: Build premium landing page
confidence: 0.45
need clarification: what conversion metrics and brand tone?
uncertain about target audience demographics`;
    const recovery = recoverVisionerUncertaintyClarification(malformed);

    assert.equal(recovery.recovered, true);
    assert.match(recovery.composedVision, /CONFIDENCE: 0\.45/);
    assert.match(recovery.composedVision, /\*\*CLARIFICATION REQUEST\*\*:/);
    assert.equal(recovery.presence.hasConfidence, true);
    assert.equal(recovery.presence.needsClarification, true);
    assert.ok(recovery.presence.confidence < 0.7);
    assert.ok(recovery.clarificationRequest.includes("conversion metrics"));
  });

  it("recoverVisionerUncertaintyClarification rejects null-byte vision output safely", () => {
    const recovery = recoverVisionerUncertaintyClarification("vision\0output");
    assert.equal(recovery.recovered, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_vision"]);
  });

  it("executes contract-wired probes with zero unexpected mismatches after recovery slice", () => {
    const contract = getActiveVisionerUncertaintyContract();
    const slice = runVisionerUncertaintyProductionSlice();

    assert.equal(slice.atom, "P02-B06-A03");
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

describe("Forge Visioner Uncertainty Boundary Slice — P02-B06-A04", () => {
  it("assessVisionerUncertaintyInputBoundary handles empty, whitespace-only and oversized vision output", () => {
    const empty = assessVisionerUncertaintyInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessVisionerUncertaintyInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessVisionerUncertaintyInputBoundary("vision\x00output");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const longVision = "x".repeat(VISIONER_UNCERTAINTY_VISION_MAX_LENGTH + 200);
    const truncated = assessVisionerUncertaintyInputBoundary(longVision);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedVision.length, VISIONER_UNCERTAINTY_VISION_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("assessVisionerUncertaintyPresence returns clarification need for unacceptable boundary inputs", () => {
    const presence = assessVisionerUncertaintyPresence("   ");
    assert.equal(presence.hasConfidence, false);
    assert.equal(presence.needsClarification, true);
    assert.equal(presence.confidence, 0);
  });

  it("recoverVisionerUncertaintyClarification rejects empty and whitespace-only vision output safely", () => {
    const emptyRecovery = recoverVisionerUncertaintyClarification("");
    assert.equal(emptyRecovery.recovered, false);
    assert.deepEqual(emptyRecovery.parseErrors, ["empty_vision"]);

    const whitespaceRecovery = recoverVisionerUncertaintyClarification("   \t\n  ");
    assert.equal(whitespaceRecovery.recovered, false);
    assert.deepEqual(whitespaceRecovery.parseErrors, ["whitespace_only_vision"]);
  });

  it("defines boundary category with vision input edge-case probes", () => {
    const boundary = listVisionerUncertaintyContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "vunc.empty_vision_uncertainty_presence",
      "vunc.known_gaps_documented",
      "vunc.long_vision_truncation_boundary",
      "vunc.probe_runner_exported",
      "vunc.source_block_gate_ref",
      "vunc.whitespace_vision_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveVisionerUncertaintyContract();
    const slice = runVisionerUncertaintyBoundarySlice();

    assert.equal(slice.atom, "P02-B06-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listVisionerUncertaintyContractProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateVisionerUncertaintyBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves full probe alignment while boundary slice passes", () => {
    const slice = runVisionerUncertaintyBoundarySlice();
    const recoveryProbe = slice.results.find(r => r.id === "vunc.structured_clarification_recovery");

    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(slice.results.filter(r => !r.aligned).length, 0);
  });
});

describe("Forge Visioner Uncertainty Failure/Recovery Slice — P02-B06-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveVisionerUncertaintyContract();
    const failure = listVisionerUncertaintyContractProbesByCategory("failure_path", contract);
    const recovery = listVisionerUncertaintyContractProbesByCategory("recovery_path", contract);
    const nogo = listVisionerUncertaintyContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...VISIONER_UNCERTAINTY_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveVisionerUncertaintyContract();
    const slice = runVisionerUncertaintyFailureRecoverySlice();

    assert.equal(slice.atom, "P02-B06-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of VISIONER_UNCERTAINTY_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listVisionerUncertaintyContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateVisionerUncertaintyFailureRecoveryProbeMatrix(
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
    const slice = runVisionerUncertaintyFailureRecoverySlice();
    const probeIds = listVisionerUncertaintyFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "vunc.malformed_vision_uncertainty_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const structuredRecovery = slice.failureRecoveryResults.find(
      r => r.id === "vunc.structured_clarification_recovery",
    );
    assert.ok(structuredRecovery);
    assert.equal(structuredRecovery!.expected, "PASS");
    assert.equal(structuredRecovery!.actual, "PASS");

    const confidenceNogo = slice.failureRecoveryResults.find(
      r => r.id === "vunc.visioner_confidence_block_gate",
    );
    assert.ok(confidenceNogo);
    assert.equal(confidenceNogo!.expected, "PASS");
    assert.equal(confidenceNogo!.actual, "PASS");
  });
});
