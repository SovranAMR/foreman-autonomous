import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherSpikeFalsificationBaseline,
  runResearcherSpikeFalsificationProbes,
  validateResearcherSpikeFalsificationBaseline,
  summarizeResearcherSpikeFalsificationMatrix,
  listResearcherSpikeFalsificationProbesByExpected,
  listResearcherSpikeFalsificationKnownGaps,
  assessSpikeFalsificationInputBoundary,
  validateSpikeFalsificationCollection,
  recoverSpikeFalsificationEvidence,
  getActiveResearcherSpikeFalsificationContract,
  listResearcherSpikeFalsificationContractProbesByCategory,
  runResearcherSpikeFalsificationBoundarySlice,
  validateResearcherSpikeFalsificationBoundaryProbeMatrix,
  validateSpikeFalsificationCollection,
  validateSpikeFalsificationExperiment,
  RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES,
  RESEARCHER_SPIKE_FALSIFICATION_INPUT_MAX_LENGTH,
  FORGE_RESEARCHER_SPIKE_FALSIFICATION_VERSION,
} from "./forge-p04-researcher-spike-falsification.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Researcher Spike Falsification — P04-B08-A01", () => {
  it("loads versioned spike falsification baseline aligned with P04-B07 block gate handoff", () => {
    const fixture = loadResearcherSpikeFalsificationBaseline();
    const validation = validateResearcherSpikeFalsificationBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P04-B08-A01");
    assert.equal(fixture.contractAtom, "P04-B08-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P04-B07-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.riskTradeoffProbeCount, 23);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures spike falsification probes with full alignment after A03 production slice", () => {
    const results = runResearcherSpikeFalsificationProbes();
    const summary = summarizeResearcherSpikeFalsificationMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listResearcherSpikeFalsificationProbesByExpected(
      "FAIL",
      loadResearcherSpikeFalsificationBaseline(),
    );
    assert.equal(documentedFail.length, 0);

    for (const cat of RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES) {
      assert.ok(summary.byCategory[cat], `missing category summary: ${cat}`);
      assert.ok(summary.byCategory[cat].total > 0, `${cat} has no probes`);
    }

    const passMismatches = results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(
      passMismatches.length,
      0,
      formatMismatchReport(passMismatches),
    );
  });

  it("documents zero remaining spike falsification gaps after production slice", () => {
    const gaps = listResearcherSpikeFalsificationKnownGaps(
      runResearcherSpikeFalsificationProbes(),
    );
    assert.deepEqual(gaps.map(g => g.id).sort(), []);
  });

  it("assessSpikeFalsificationInputBoundary rejects empty and null-byte experiment inputs", () => {
    const empty = assessSpikeFalsificationInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessSpikeFalsificationInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessSpikeFalsificationInputBoundary("experiment\0parse");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessSpikeFalsificationInputBoundary truncates oversized experiment inputs", () => {
    const longInput = "x".repeat(RESEARCHER_SPIKE_FALSIFICATION_INPUT_MAX_LENGTH + 500);
    const truncated = assessSpikeFalsificationInputBoundary(longInput);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(
      truncated.normalizedInput.length,
      RESEARCHER_SPIKE_FALSIFICATION_INPUT_MAX_LENGTH,
    );
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("validateSpikeFalsificationCollection accepts experiments with hypothesis fields", () => {
    const validation = validateSpikeFalsificationCollection("async worker pool spike", [
      {
        hypothesis: "Bounded concurrency reduces p99 latency under burst load",
        scope: "worker pool sizing",
        timeboxMinutes: 30,
        successCriteria: "p99 latency below 500ms",
      },
    ]);

    assert.equal(validation.valid, true, validation.issues.join("; "));
    assert.equal(validation.experimentCount, 1);
  });

  it("validateSpikeFalsificationCollection rejects zero-experiment topics", () => {
    const validation = validateSpikeFalsificationCollection("valid topic", []);
    assert.equal(validation.valid, false);
    assert.ok(
      validation.issues.some(issue => issue.includes("zero spike/falsification experiments")),
    );
  });

  it("recoverSpikeFalsificationEvidence restructures malformed spike parse into experiment plan", () => {
    const recovery = recoverSpikeFalsificationEvidence(
      "SPIKE: async worker pool sizing under burst load\ntimebox: 30 minutes",
    );

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.experimentPlan.spikes.length >= 1);
    assert.equal(recovery.experimentPlan.spikes[0].timeboxMinutes, 30);
  });

  it("recoverSpikeFalsificationEvidence rejects null-byte and empty parse safely", () => {
    const emptyRecovery = recoverSpikeFalsificationEvidence("");
    assert.equal(emptyRecovery.recovered, false);
    assert.deepEqual(emptyRecovery.parseErrors, ["empty"]);

    const nullRecovery = recoverSpikeFalsificationEvidence("experiment\0parse");
    assert.equal(nullRecovery.recovered, false);
    assert.deepEqual(nullRecovery.parseErrors, ["contains_null_byte"]);
  });

  it("contract declares spike falsification categories with measurable criteria", () => {
    const contract = getActiveResearcherSpikeFalsificationContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P04-B08-A06");
    assert.equal(contract.probes.length, 23);
    assert.equal(FORGE_RESEARCHER_SPIKE_FALSIFICATION_VERSION.startsWith("1.0.0"), true);

    for (const category of RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES) {
      const categoryContract = contract.categories[category];
      assert.ok(categoryContract.acceptance.invariant.length > 20, `${category} invariant too short`);
      assert.ok(categoryContract.probes.length >= categoryContract.acceptance.minProbeCount);
    }
  });
});

describe("Forge Researcher Spike Falsification Boundary Slice — P04-B08-A04", () => {
  it("assessSpikeFalsificationInputBoundary edge cases align with boundary probe matrix", () => {
    const slice = runResearcherSpikeFalsificationBoundarySlice();
    const experimentProbes = [
      "rsf.empty_experiment_input_boundary",
      "rsf.whitespace_experiment_input_boundary",
      "rsf.long_experiment_input_truncation_boundary",
    ] as const;

    for (const probeId of experimentProbes) {
      const result = slice.boundaryResults.find(r => r.id === probeId);
      assert.ok(result, `missing ${probeId}`);
      assert.equal(result!.actual, "PASS");
      assert.equal(result!.aligned, true);
    }
  });

  it("validateSpikeFalsificationCollection rejects whitespace-only topic at boundary", () => {
    const validation = validateSpikeFalsificationCollection("   \t\n  ", [
      {
        hypothesis: "Bounded concurrency reduces p99 latency",
        scope: "worker pool sizing",
      },
    ]);
    assert.equal(validation.valid, false);
    assert.equal(validation.experimentCount, 0);
    assert.ok(validation.issues.some(issue => issue.includes("whitespace-only")));
  });

  it("recoverSpikeFalsificationEvidence rejects whitespace-only parse at boundary", () => {
    const recovery = recoverSpikeFalsificationEvidence("  \t  ");
    assert.equal(recovery.recovered, false);
    assert.deepEqual(recovery.parseErrors, ["whitespace_only"]);
    assert.equal(recovery.detail, "cannot recover whitespace-only experiment parse");
  });

  it("boundary slice matrix validation passes with contract-wired probes", () => {
    const contract = getActiveResearcherSpikeFalsificationContract();
    const slice = runResearcherSpikeFalsificationBoundarySlice();
    const boundary = listResearcherSpikeFalsificationContractProbesByCategory(
      "boundary",
      contract,
    );

    assert.equal(boundary.length, slice.boundaryProbeCount);
    assert.equal(slice.matrixValid, true);

    const matrixValidation = validateResearcherSpikeFalsificationBoundaryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(matrixValidation.unexpectedMismatches, 0);
    assert.equal(matrixValidation.valid, true);
  });

  it("validateSpikeFalsificationExperiment rejects null-byte input at boundary", () => {
    const validation = validateSpikeFalsificationExperiment("SPIKE\0experiment");
    assert.equal(validation.valid, false);
    assert.equal(validation.falsificationPresent, false);
    assert.ok(validation.issues.some(i => i.includes("null byte")));
  });
});
