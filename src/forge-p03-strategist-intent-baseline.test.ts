import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistIntentBaseline,
  runStrategistIntentProbes,
  validateStrategistIntentBaseline,
  summarizeStrategistIntentMatrix,
  listStrategistIntentProbesByExpected,
  listStrategistIntentKnownGaps,
  recoverStrategistDecompose,
  runStrategistIntentProductionSlice,
  validateStrategistIntentProbeMatrix,
  getActiveStrategistIntentContract,
  STRATEGIST_INTENT_CATEGORIES,
} from "./forge-p03-strategist-intent.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Intent — P03-B01-A01", () => {
  it("loads versioned strategist intent baseline aligned with P02 phase gate handoff", () => {
    const fixture = loadStrategistIntentBaseline();
    const validation = validateStrategistIntentBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P03-B01-A01");
    assert.equal(fixture.contractAtom, "P03-B01-A05");
    assert.equal(fixture.sourcePhaseGate.atom, "P02-PHASE-GATE");
    assert.equal(fixture.sourcePhaseGate.sealedBlockCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures strategist intent probes with full alignment after A03 recovery slice", () => {
    const results = runStrategistIntentProbes();
    const summary = summarizeStrategistIntentMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listStrategistIntentProbesByExpected(
      "FAIL",
      loadStrategistIntentBaseline(),
    );
    assert.equal(documentedFail.length, 0);

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of STRATEGIST_INTENT_CATEGORIES) {
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

  it("documents zero remaining strategist intent gaps after structured recovery slice", () => {
    const gaps = listStrategistIntentKnownGaps(runStrategistIntentProbes());
    assert.deepEqual(gaps.map(g => g.id).sort(), []);
  });
});

describe("Forge Strategist Intent Production Slice — P03-B01-A03", () => {
  it("recoverStrategistDecompose restructures malformed decompose into actionable block plan", () => {
    const malformed = `REASONING: Need implementation plan
Here are the steps:
Block 1: Setup core types
Block 2: Wire orchestrator seam
Block 3: Add strategist intent tests
CONFIDENCE: 0.8`;
    const recovery = recoverStrategistDecompose(malformed);

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.blockCount >= 3);
    assert.match(recovery.composedDecompose, /REASONING:/);
    assert.match(recovery.composedDecompose, /OUTPUT:/);
    assert.ok(recovery.blocks.some(block => block.includes("core types")));
    assert.ok(recovery.blocks.some(block => block.includes("orchestrator seam")));
    assert.ok(recovery.blocks.some(block => block.includes("intent tests")));
  });

  it("recoverStrategistDecompose rejects null-byte decompose output safely", () => {
    const recovery = recoverStrategistDecompose("decompose\0output");
    assert.equal(recovery.recovered, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_decompose"]);
  });

  it("executes contract-wired probes with zero unexpected mismatches after recovery slice", () => {
    const contract = getActiveStrategistIntentContract();
    const slice = runStrategistIntentProductionSlice();

    assert.equal(slice.atom, "P03-B01-A03");
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

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateStrategistIntentProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const recoveryProbe = slice.results.find(r => r.id === "sint.structured_decompose_recovery");
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
  });
});
