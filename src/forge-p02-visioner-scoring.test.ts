import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerScoringBaseline,
  runVisionerScoringProbes,
  runVisionerScoringProductionSlice,
  runVisionerScoringBoundarySlice,
} from "./forge-p02-visioner-scoring.probe.js";
import {
  getActiveVisionerScoringContract,
  getVisionerScoringCategoryContract,
  listVisionerScoringContractProbeIds,
  listVisionerScoringContractProbesByCategory,
  listVisionerScoringProbesByDisposition,
  summarizeVisionerScoringContractCoverage,
  validateVisionerScoringContractCoverage,
  validateVisionerScoringAgainstContract,
  validateVisionerScoringBoundaryProbeMatrix,
  validateVisionerScoringProbeMatrix,
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
