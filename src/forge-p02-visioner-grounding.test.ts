import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerGroundingBaseline,
  runVisionerGroundingProbes,
  runVisionerGroundingProductionSlice,
  runVisionerGroundingBoundarySlice,
  runVisionerGroundingFailureRecoverySlice,
} from "./forge-p02-visioner-grounding.probe.js";
import {
  getActiveVisionerGroundingContract,
  getVisionerGroundingCategoryContract,
  listVisionerGroundingContractProbeIds,
  listVisionerGroundingContractProbesByCategory,
  listVisionerGroundingProbesByDisposition,
  listVisionerGroundingFailureRecoveryProbeIds,
  summarizeVisionerGroundingContractCoverage,
  validateVisionerGroundingAgainstContract,
  validateVisionerGroundingContractCoverage,
  validateVisionerGroundingProbeMatrix,
  validateVisionerGroundingBoundaryProbeMatrix,
  validateVisionerGroundingFailureRecoveryProbeMatrix,
  VISIONER_GROUNDING_FAILURE_RECOVERY_CATEGORIES,
  recoverVisionerGrounding,
  assessVisionerGroundingInputBoundary,
  assessVisionerGroundingPresence,
  VISIONER_GROUNDING_CATEGORIES,
  VISIONER_GROUNDING_CONTEXT_MAX_LENGTH,
} from "./forge-p02-visioner-grounding.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Grounding Contract — P02-B04-A02", () => {
  it("defines typed acceptance for all eight visioner grounding categories", () => {
    const contract = getActiveVisionerGroundingContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P02-B04-A05");

    for (const category of VISIONER_GROUNDING_CATEGORIES) {
      const categoryContract = getVisionerGroundingCategoryContract(category);
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
    const contract = getActiveVisionerGroundingContract();
    const summary = summarizeVisionerGroundingContractCoverage(contract);
    const coverage = validateVisionerGroundingContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.grounding_versioning.probeCount, 3);
    assert.equal(summary.byCategory.repo_signal.probeCount, 3);
    assert.equal(summary.byCategory.user_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists no remaining gap probes after A03 structured grounding recovery", () => {
    const gaps = listVisionerGroundingProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadVisionerGroundingBaseline();
    const contract = getActiveVisionerGroundingContract();
    const validation = validateVisionerGroundingAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listVisionerGroundingContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each visioner grounding probe id is globally unique", () => {
    const ids = listVisionerGroundingContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runVisionerGroundingProbes();
    const contract = getActiveVisionerGroundingContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveVisionerGroundingContract();
    const flatIds = listVisionerGroundingContractProbeIds(contract);
    const categoryIds = VISIONER_GROUNDING_CATEGORIES.flatMap(category =>
      listVisionerGroundingContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });
});

describe("Forge Visioner Grounding Production Slice — P02-B04-A03", () => {
  it("recoverVisionerGrounding restructures malformed context into repo/user grounding", () => {
    const malformed = '{"project": "foreman", "user": "dev", "session": "checkpoint-42"';
    const recovery = recoverVisionerGrounding(malformed);

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.parseErrors.includes("json_parse_failed"));
    assert.match(recovery.composedPrompt, /Project: foreman/);
    assert.match(recovery.composedPrompt, /Project Context:/);
    assert.match(recovery.composedPrompt, /IDENTITY CONTEXT/);
    assert.match(recovery.composedPrompt, /SESSION CONTEXT/);
    assert.equal(recovery.presence.hasProjectAnchor, true);
    assert.equal(recovery.presence.hasProjectContext, true);
    assert.equal(recovery.presence.hasIdentityContext, true);
    assert.equal(recovery.presence.hasSessionContext, true);
  });

  it("recoverVisionerGrounding rejects null-byte context safely", () => {
    const recovery = recoverVisionerGrounding("project\x00name");
    assert.equal(recovery.recovered, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_context"]);
  });

  it("executes contract-wired probes with zero unexpected mismatches after recovery slice", () => {
    const contract = getActiveVisionerGroundingContract();
    const slice = runVisionerGroundingProductionSlice();

    assert.equal(slice.atom, "P02-B04-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 23);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateVisionerGroundingProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(slice.summary.mismatches.length, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    const recoveryProbe = slice.results.find(r => r.id === "vgrd.structured_grounding_recovery");
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
  });
});

describe("Forge Visioner Grounding Boundary Slice — P02-B04-A04", () => {
  it("assessVisionerGroundingInputBoundary handles empty, whitespace-only and oversized context input", () => {
    const empty = assessVisionerGroundingInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessVisionerGroundingInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessVisionerGroundingInputBoundary("context\x00input");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const longContext = "x".repeat(VISIONER_GROUNDING_CONTEXT_MAX_LENGTH + 200);
    const truncated = assessVisionerGroundingInputBoundary(longContext);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedContext.length, VISIONER_GROUNDING_CONTEXT_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("assessVisionerGroundingPresence returns no signals for unacceptable boundary inputs", () => {
    const presence = assessVisionerGroundingPresence("   ");
    assert.equal(presence.hasProjectAnchor, false);
    assert.equal(presence.hasProjectContext, false);
    assert.equal(presence.hasIdentityContext, false);
    assert.equal(presence.hasSessionContext, false);
  });

  it("defines boundary category with context input edge-case probes", () => {
    const boundary = listVisionerGroundingContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "vgrd.empty_context_boundary",
      "vgrd.known_gaps_documented",
      "vgrd.long_context_truncation_boundary",
      "vgrd.probe_runner_exported",
      "vgrd.source_block_gate_ref",
      "vgrd.whitespace_context_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveVisionerGroundingContract();
    const slice = runVisionerGroundingBoundarySlice();

    assert.equal(slice.atom, "P02-B04-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listVisionerGroundingContractProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateVisionerGroundingBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves full probe alignment while boundary slice passes", () => {
    const slice = runVisionerGroundingBoundarySlice();
    const recoveryProbe = slice.results.find(r => r.id === "vgrd.structured_grounding_recovery");

    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(slice.results.filter(r => !r.aligned).length, 0);
  });
});

describe("Forge Visioner Grounding Failure/Recovery Slice — P02-B04-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveVisionerGroundingContract();
    const failure = listVisionerGroundingContractProbesByCategory("failure_path", contract);
    const recovery = listVisionerGroundingContractProbesByCategory("recovery_path", contract);
    const nogo = listVisionerGroundingContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...VISIONER_GROUNDING_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveVisionerGroundingContract();
    const slice = runVisionerGroundingFailureRecoverySlice();

    assert.equal(slice.atom, "P02-B04-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of VISIONER_GROUNDING_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listVisionerGroundingContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateVisionerGroundingFailureRecoveryProbeMatrix(
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
    const slice = runVisionerGroundingFailureRecoverySlice();
    const probeIds = listVisionerGroundingFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "vgrd.malformed_context_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const structuredRecovery = slice.failureRecoveryResults.find(
      r => r.id === "vgrd.structured_grounding_recovery",
    );
    assert.ok(structuredRecovery);
    assert.equal(structuredRecovery!.expected, "PASS");
    assert.equal(structuredRecovery!.actual, "PASS");

    const ambiguityNogo = slice.failureRecoveryResults.find(
      r => r.id === "vgrd.intent_ambiguity_nogo",
    );
    assert.ok(ambiguityNogo);
    assert.equal(ambiguityNogo!.expected, "PASS");
    assert.equal(ambiguityNogo!.actual, "PASS");
  });
});
