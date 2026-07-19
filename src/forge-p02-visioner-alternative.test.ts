import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerAlternativeBaseline,
  runVisionerAlternativeProbes,
  runVisionerAlternativeProductionSlice,
  runVisionerAlternativeBoundarySlice,
  runVisionerAlternativeFailureRecoverySlice,
  runVisionerAlternativeProbesWithRecord,
  runVisionerAlternativeFailureRecoverySliceWithRecord,
} from "./forge-p02-visioner-alternative.probe.js";
import {
  getActiveVisionerAlternativeContract,
  getVisionerAlternativeCategoryContract,
  listVisionerAlternativeContractProbeIds,
  listVisionerAlternativeContractProbesByCategory,
  listVisionerAlternativeProbesByDisposition,
  summarizeVisionerAlternativeContractCoverage,
  validateVisionerAlternativeContractCoverage,
  validateVisionerAlternativeAgainstContract,
  validateVisionerAlternativeProbeMatrix,
  validateVisionerAlternativeBoundaryProbeMatrix,
  validateVisionerAlternativeFailureRecoveryProbeMatrix,
  validateVisionerAlternativeRunRecord,
  validateVisionerAlternativeFailureRecoveryRunRecord,
  buildVisionerAlternativeProbeEvidence,
  buildVisionerAlternativeProbeTelemetry,
  buildVisionerAlternativeProvenance,
  buildVisionerAlternativeRunRecord,
  listVisionerAlternativeFailureRecoveryProbeIds,
  VISIONER_ALTERNATIVE_FAILURE_RECOVERY_CATEGORIES,
  recoverVisionerAlternatives,
  assessVisionerAlternativeInputBoundary,
  assessVisionerAlternativePresence,
  VISIONER_ALTERNATIVE_CATEGORIES,
  VISIONER_ALTERNATIVE_VISION_MAX_LENGTH,
  FORGE_VISIONER_ALTERNATIVE_VERSION,
} from "./forge-p02-visioner-alternative.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Alternative Contract — P02-B07-A02", () => {
  it("defines typed acceptance for all eight visioner alternative categories", () => {
    const contract = getActiveVisionerAlternativeContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P02-B07-A06");

    for (const category of VISIONER_ALTERNATIVE_CATEGORIES) {
      const categoryContract = getVisionerAlternativeCategoryContract(category);
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
    const contract = getActiveVisionerAlternativeContract();
    const summary = summarizeVisionerAlternativeContractCoverage(contract);
    const coverage = validateVisionerAlternativeContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.alternative_versioning.probeCount, 3);
    assert.equal(summary.byCategory.alternative_signal.probeCount, 3);
    assert.equal(summary.byCategory.divergence_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists no remaining gap probes after A03 structured alternative recovery", () => {
    const gaps = listVisionerAlternativeProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadVisionerAlternativeBaseline();
    const contract = getActiveVisionerAlternativeContract();
    const validation = validateVisionerAlternativeAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listVisionerAlternativeContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each visioner alternative probe id is globally unique", () => {
    const ids = listVisionerAlternativeContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runVisionerAlternativeProbes();
    const contract = getActiveVisionerAlternativeContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveVisionerAlternativeContract();
    const flatIds = listVisionerAlternativeContractProbeIds(contract);
    const categoryIds = VISIONER_ALTERNATIVE_CATEGORIES.flatMap(category =>
      listVisionerAlternativeContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("validates probe matrix with full alignment after A03 recovery slice", () => {
    const contract = getActiveVisionerAlternativeContract();
    const results = runVisionerAlternativeProbes();
    const matrixValidation = validateVisionerAlternativeProbeMatrix(results, contract);

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

  it("exports A06 harness version for alternative contract gate", () => {
    assert.equal(FORGE_VISIONER_ALTERNATIVE_VERSION, "1.0.0-a06");
  });
});

describe("Forge Visioner Alternative Production Slice — P02-B07-A03", () => {
  it("recoverVisionerAlternatives restructures malformed vision into selectable variants", () => {
    const malformed = `REASONING: Two viable product directions for dental clinic
OUTPUT: **GOAL**: Dental clinic platform
alternative a: Premium concierge booking experience
alternative b: Self-serve patient portal
CONFIDENCE: 0.78`;
    const recovery = recoverVisionerAlternatives(malformed);

    assert.equal(recovery.recovered, true);
    assert.match(recovery.composedVision, /\*\*ALTERNATIVE VISION A\*\*:/);
    assert.match(recovery.composedVision, /\*\*ALTERNATIVE VISION B\*\*:/);
    assert.equal(recovery.presence.hasAlternatives, true);
    assert.ok(recovery.presence.alternativeCount >= 2);
    assert.ok(recovery.alternatives.some(alt => alt.includes("concierge booking")));
    assert.ok(recovery.alternatives.some(alt => alt.includes("patient portal")));
  });

  it("recoverVisionerAlternatives rejects null-byte vision output safely", () => {
    const recovery = recoverVisionerAlternatives("vision\0output");
    assert.equal(recovery.recovered, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_vision"]);
  });

  it("executes contract-wired probes with zero unexpected mismatches after recovery slice", () => {
    const contract = getActiveVisionerAlternativeContract();
    const slice = runVisionerAlternativeProductionSlice();

    assert.equal(slice.atom, "P02-B07-A03");
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

describe("Forge Visioner Alternative Boundary Slice — P02-B07-A04", () => {
  it("assessVisionerAlternativeInputBoundary handles empty, whitespace-only and oversized vision output", () => {
    const empty = assessVisionerAlternativeInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessVisionerAlternativeInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessVisionerAlternativeInputBoundary("vision\x00output");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const longVision = "x".repeat(VISIONER_ALTERNATIVE_VISION_MAX_LENGTH + 200);
    const truncated = assessVisionerAlternativeInputBoundary(longVision);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedVision.length, VISIONER_ALTERNATIVE_VISION_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("assessVisionerAlternativePresence returns no alternatives for unacceptable boundary inputs", () => {
    const presence = assessVisionerAlternativePresence("   ");
    assert.equal(presence.hasAlternatives, false);
    assert.equal(presence.alternativeCount, 0);
    assert.deepEqual(presence.alternatives, []);
  });

  it("recoverVisionerAlternatives rejects empty and whitespace-only vision output safely", () => {
    const emptyRecovery = recoverVisionerAlternatives("");
    assert.equal(emptyRecovery.recovered, false);
    assert.deepEqual(emptyRecovery.parseErrors, ["empty_vision"]);

    const whitespaceRecovery = recoverVisionerAlternatives("   \t\n  ");
    assert.equal(whitespaceRecovery.recovered, false);
    assert.deepEqual(whitespaceRecovery.parseErrors, ["whitespace_only_vision"]);
  });

  it("defines boundary category with vision input edge-case probes", () => {
    const boundary = listVisionerAlternativeContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "valt.empty_vision_alternative_presence",
      "valt.known_gaps_documented",
      "valt.long_vision_truncation_boundary",
      "valt.probe_runner_exported",
      "valt.source_block_gate_ref",
      "valt.whitespace_vision_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveVisionerAlternativeContract();
    const slice = runVisionerAlternativeBoundarySlice();

    assert.equal(slice.atom, "P02-B07-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listVisionerAlternativeContractProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateVisionerAlternativeBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves full probe alignment while boundary slice passes", () => {
    const slice = runVisionerAlternativeBoundarySlice();
    const recoveryProbe = slice.results.find(r => r.id === "valt.structured_alternative_recovery");

    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(slice.results.filter(r => !r.aligned).length, 0);
  });
});

describe("Forge Visioner Alternative Failure/Recovery Slice — P02-B07-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveVisionerAlternativeContract();
    const failure = listVisionerAlternativeContractProbesByCategory("failure_path", contract);
    const recovery = listVisionerAlternativeContractProbesByCategory("recovery_path", contract);
    const nogo = listVisionerAlternativeContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...VISIONER_ALTERNATIVE_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveVisionerAlternativeContract();
    const slice = runVisionerAlternativeFailureRecoverySlice();

    assert.equal(slice.atom, "P02-B07-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of VISIONER_ALTERNATIVE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listVisionerAlternativeContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateVisionerAlternativeFailureRecoveryProbeMatrix(
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
    const slice = runVisionerAlternativeFailureRecoverySlice();
    const probeIds = listVisionerAlternativeFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "valt.malformed_vision_presence_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const structuredRecovery = slice.failureRecoveryResults.find(
      r => r.id === "valt.structured_alternative_recovery",
    );
    assert.ok(structuredRecovery);
    assert.equal(structuredRecovery!.expected, "PASS");
    assert.equal(structuredRecovery!.actual, "PASS");

    const clarificationNogo = slice.failureRecoveryResults.find(
      r => r.id === "valt.uncertainty_clarification_nogo",
    );
    assert.ok(clarificationNogo);
    assert.equal(clarificationNogo!.expected, "PASS");
    assert.equal(clarificationNogo!.actual, "PASS");
  });
});

describe("Forge Visioner Alternative Evidence — P02-B07-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadVisionerAlternativeBaseline();
    const contract = getActiveVisionerAlternativeContract();
    const probeIds = listVisionerAlternativeFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildVisionerAlternativeProbeEvidence(
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
      return buildVisionerAlternativeProbeTelemetry(probeId, contractProbe.category, index, index * 0.5);
    });

    const provenance = buildVisionerAlternativeProvenance(
      "run-valt-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P02-B07-A06",
        sliceCategories: VISIONER_ALTERNATIVE_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildVisionerAlternativeRunRecord(provenance, evidence, telemetry);
    const validation = validateVisionerAlternativeFailureRecoveryRunRecord(record, contract);

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
    const contract = getActiveVisionerAlternativeContract();
    const record = runVisionerAlternativeFailureRecoverySliceWithRecord();
    const validation = validateVisionerAlternativeFailureRecoveryRunRecord(record, contract);

    assert.equal(record.evidence.length, 6);
    assert.equal(record.telemetry.length, 6);
    assert.equal(record.provenance.totalProbes, 6);
    assert.equal(record.provenance.sliceAtom, "P02-B07-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_VISIONER_ALTERNATIVE_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a06");
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
      e => e.probeId === "valt.structured_alternative_recovery",
    );
    assert.ok(structuredRecovery);
    assert.equal(structuredRecovery!.aligned, true);
    assert.equal(structuredRecovery!.expected, "PASS");
    assert.equal(structuredRecovery!.actual, "PASS");
    assert.equal(structuredRecovery!.disposition, "recovery");
  });

  it("records evidence, telemetry and provenance for full visioner alternative run", () => {
    const contract = getActiveVisionerAlternativeContract();
    const record = runVisionerAlternativeProbesWithRecord();
    const validation = validateVisionerAlternativeRunRecord(record, contract);

    assert.equal(record.evidence.length, 23);
    assert.equal(record.telemetry.length, 23);
    assert.equal(record.provenance.totalProbes, 23);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 23);
  });
});
