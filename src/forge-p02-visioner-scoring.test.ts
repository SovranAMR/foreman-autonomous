import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerScoringBaseline,
  runVisionerScoringProbes,
  runVisionerScoringProductionSlice,
  runVisionerScoringBoundarySlice,
  runVisionerScoringFailureRecoverySlice,
  runVisionerScoringProbesWithRecord,
  runVisionerScoringFailureRecoverySliceWithRecord,
} from "./forge-p02-visioner-scoring.probe.js";
import {
  getActiveVisionerScoringContract,
  getVisionerScoringCategoryContract,
  listVisionerScoringContractProbeIds,
  listVisionerScoringContractProbesByCategory,
  listVisionerScoringFailureRecoveryProbeIds,
  listVisionerScoringProbesByDisposition,
  summarizeVisionerScoringContractCoverage,
  validateVisionerScoringContractCoverage,
  validateVisionerScoringAgainstContract,
  validateVisionerScoringBoundaryProbeMatrix,
  validateVisionerScoringFailureRecoveryProbeMatrix,
  validateVisionerScoringProbeMatrix,
  validateVisionerScoringRunRecord,
  validateVisionerScoringFailureRecoveryRunRecord,
  buildVisionerScoringProbeEvidence,
  buildVisionerScoringProbeTelemetry,
  buildVisionerScoringProvenance,
  buildVisionerScoringRunRecord,
  VISIONER_SCORING_FAILURE_RECOVERY_CATEGORIES,
  recoverVisionerTradeoff,
  assessVisionerScoringInputBoundary,
  assessVisionerScoringPresence,
  VISIONER_SCORING_CATEGORIES,
  VISIONER_SCORING_VISION_MAX_LENGTH,
  FORGE_VISIONER_SCORING_VERSION,
} from "./forge-p02-visioner-scoring.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Scoring Contract — P02-B08-A02", () => {
  it("defines typed acceptance for all eight visioner scoring categories", () => {
    const contract = getActiveVisionerScoringContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P02-B08-A06");

    for (const category of VISIONER_SCORING_CATEGORIES) {
      const categoryContract = getVisionerScoringCategoryContract(category);
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
    const contract = getActiveVisionerScoringContract();
    const summary = summarizeVisionerScoringContractCoverage(contract);
    const coverage = validateVisionerScoringContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.scoring_versioning.probeCount, 3);
    assert.equal(summary.byCategory.scoring_signal.probeCount, 3);
    assert.equal(summary.byCategory.tradeoff_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists zero remaining gap probes after A03 recovery slice", () => {
    const gaps = listVisionerScoringProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadVisionerScoringBaseline();
    const contract = getActiveVisionerScoringContract();
    const validation = validateVisionerScoringAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listVisionerScoringContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each visioner scoring probe id is globally unique", () => {
    const ids = listVisionerScoringContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runVisionerScoringProbes();
    const contract = getActiveVisionerScoringContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveVisionerScoringContract();
    const flatIds = listVisionerScoringContractProbeIds(contract);
    const categoryIds = VISIONER_SCORING_CATEGORIES.flatMap(category =>
      listVisionerScoringContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("validates probe matrix with full alignment after A03 recovery slice", () => {
    const contract = getActiveVisionerScoringContract();
    const results = runVisionerScoringProbes();
    const matrixValidation = validateVisionerScoringProbeMatrix(results, contract);

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

  it("exports B07 harness version for scoring baseline handoff", () => {
    assert.equal(FORGE_VISIONER_SCORING_VERSION, "1.0.0-b07");
  });
});

describe("Forge Visioner Scoring Production Slice — P02-B08-A03", () => {
  it("recoverVisionerTradeoff restructures malformed vision into actionable scoring input", () => {
    const malformed = `REASONING: Two product directions with trade-off analysis needed
OUTPUT: **GOAL**: Dental clinic platform
option A (speed): Rapid MVP launch
option B (cost): Lean self-serve portal
tradeoff: speed vs implementation cost
CONFIDENCE: 0.78`;
    const recovery = recoverVisionerTradeoff(malformed);

    assert.equal(recovery.recovered, true);
    assert.match(recovery.composedVision, /\*\*ALTERNATIVE VISION A\*\*:/);
    assert.match(recovery.composedVision, /\*\*ALTERNATIVE VISION B\*\*:/);
    assert.match(recovery.composedVision, /\*\*TRADE-OFF\*\*:/);
    assert.equal(recovery.presence.scoreable, true);
    assert.ok(recovery.presence.alternativeCount >= 2);
    assert.ok(recovery.tradeoffs.some(t => t.includes("speed")));
    assert.ok(recovery.alternatives.some(alt => alt.includes("MVP launch")));
    assert.ok(recovery.alternatives.some(alt => alt.includes("self-serve portal")));
  });

  it("recoverVisionerTradeoff rejects null-byte vision output safely", () => {
    const recovery = recoverVisionerTradeoff("vision\0output");
    assert.equal(recovery.recovered, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_vision"]);
  });

  it("executes contract-wired probes with zero unexpected mismatches after recovery slice", () => {
    const contract = getActiveVisionerScoringContract();
    const slice = runVisionerScoringProductionSlice();

    assert.equal(slice.atom, "P02-B08-A03");
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

describe("Forge Visioner Scoring Boundary Slice — P02-B08-A04", () => {
  it("assessVisionerScoringInputBoundary handles empty, whitespace-only and oversized vision output", () => {
    const empty = assessVisionerScoringInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessVisionerScoringInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessVisionerScoringInputBoundary("vision\x00output");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const longVision = "x".repeat(VISIONER_SCORING_VISION_MAX_LENGTH + 200);
    const truncated = assessVisionerScoringInputBoundary(longVision);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedVision.length, VISIONER_SCORING_VISION_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("assessVisionerScoringPresence returns non-scoreable for unacceptable boundary inputs", () => {
    const empty = assessVisionerScoringPresence("");
    assert.equal(empty.scoreable, false);
    assert.equal(empty.hasAlternatives, false);

    const whitespace = assessVisionerScoringPresence("   ");
    assert.equal(whitespace.scoreable, false);
    assert.equal(whitespace.hasAlternatives, false);

    const nullByte = assessVisionerScoringPresence("bad\0vision");
    assert.equal(nullByte.scoreable, false);
    assert.equal(nullByte.hasAlternatives, false);
  });

  it("recoverVisionerTradeoff rejects whitespace-only malformed trade-off input", () => {
    const whitespaceRecovery = recoverVisionerTradeoff("   \t\n  ");
    assert.equal(whitespaceRecovery.recovered, false);
    assert.deepEqual(whitespaceRecovery.parseErrors, ["whitespace_only_vision"]);
  });

  it("defines boundary category with scoring input edge-case probes", () => {
    const boundary = listVisionerScoringContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "vsco.empty_vision_scoring_boundary",
      "vsco.known_gaps_documented",
      "vsco.long_vision_truncation_boundary",
      "vsco.probe_runner_exported",
      "vsco.source_block_gate_ref",
      "vsco.whitespace_vision_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveVisionerScoringContract();
    const slice = runVisionerScoringBoundarySlice();

    assert.equal(slice.atom, "P02-B08-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listVisionerScoringContractProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateVisionerScoringBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves full probe alignment while boundary slice passes", () => {
    const slice = runVisionerScoringBoundarySlice();
    const recoveryProbe = slice.results.find(r => r.id === "vsco.structured_tradeoff_recovery");

    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(slice.results.filter(r => !r.aligned).length, 0);
  });
});

describe("Forge Visioner Scoring Failure/Recovery Slice — P02-B08-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveVisionerScoringContract();
    const failure = listVisionerScoringContractProbesByCategory("failure_path", contract);
    const recovery = listVisionerScoringContractProbesByCategory("recovery_path", contract);
    const nogo = listVisionerScoringContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...VISIONER_SCORING_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveVisionerScoringContract();
    const slice = runVisionerScoringFailureRecoverySlice();

    assert.equal(slice.atom, "P02-B08-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of VISIONER_SCORING_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listVisionerScoringContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateVisionerScoringFailureRecoveryProbeMatrix(
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
    const slice = runVisionerScoringFailureRecoverySlice();
    const probeIds = listVisionerScoringFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "vsco.malformed_vision_scoring_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const structuredRecovery = slice.failureRecoveryResults.find(
      r => r.id === "vsco.structured_tradeoff_recovery",
    );
    assert.ok(structuredRecovery);
    assert.equal(structuredRecovery!.expected, "PASS");
    assert.equal(structuredRecovery!.actual, "PASS");

    const tieBreakNogo = slice.failureRecoveryResults.find(
      r => r.id === "vsco.scoring_tiebreak_nogo",
    );
    assert.ok(tieBreakNogo);
    assert.equal(tieBreakNogo!.expected, "PASS");
    assert.equal(tieBreakNogo!.actual, "PASS");
  });
});

describe("Forge Visioner Scoring Evidence — P02-B08-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadVisionerScoringBaseline();
    const contract = getActiveVisionerScoringContract();
    const probeIds = listVisionerScoringFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildVisionerScoringProbeEvidence(
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
      return buildVisionerScoringProbeTelemetry(probeId, contractProbe.category, index, index * 0.5);
    });

    const provenance = buildVisionerScoringProvenance(
      "run-vsco-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P02-B08-A06",
        sliceCategories: VISIONER_SCORING_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildVisionerScoringRunRecord(provenance, evidence, telemetry);
    const validation = validateVisionerScoringFailureRecoveryRunRecord(record, contract);

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
    const contract = getActiveVisionerScoringContract();
    const record = runVisionerScoringFailureRecoverySliceWithRecord();
    const validation = validateVisionerScoringFailureRecoveryRunRecord(record, contract);

    assert.equal(record.evidence.length, 6);
    assert.equal(record.telemetry.length, 6);
    assert.equal(record.provenance.totalProbes, 6);
    assert.equal(record.provenance.sliceAtom, "P02-B08-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_VISIONER_SCORING_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0-b07");
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
      e => e.probeId === "vsco.structured_tradeoff_recovery",
    );
    assert.ok(structuredRecovery);
    assert.equal(structuredRecovery!.aligned, true);
    assert.equal(structuredRecovery!.expected, "PASS");
    assert.equal(structuredRecovery!.actual, "PASS");
    assert.equal(structuredRecovery!.disposition, "recovery");
  });

  it("records evidence, telemetry and provenance for full visioner scoring run", () => {
    const contract = getActiveVisionerScoringContract();
    const record = runVisionerScoringProbesWithRecord();
    const validation = validateVisionerScoringRunRecord(record, contract);

    assert.equal(record.evidence.length, 23);
    assert.equal(record.telemetry.length, 23);
    assert.equal(record.provenance.totalProbes, 23);
    assert.equal(record.provenance.harnessVersion, "1.0.0-b07");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 23);
  });
});
