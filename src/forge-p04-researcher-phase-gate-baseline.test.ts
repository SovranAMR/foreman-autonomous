import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherPhaseGateBaseline,
  runResearcherPhaseGateProbes,
  validateResearcherPhaseGateBaseline,
  summarizeResearcherPhaseGateMatrix,
  listResearcherPhaseGateProbesByExpected,
  listResearcherPhaseGateKnownGaps,
  RESEARCHER_PHASE_GATE_CATEGORIES,
} from "./forge-p04-researcher-phase-gate.probe.js";
import {
  assessResearcherPhaseGateInputBoundary,
  recoverResearcherPhaseGateEvidence,
  validateForgeP04ResearcherPhaseGateEvidence,
  buildP04ResearcherPhaseGateEvidence,
  P04_RESEARCHER_PHASE_BLOCK_INVENTORY,
  RESEARCHER_PHASE_GATE_MANIFEST_MAX_LENGTH,
  FORGE_RESEARCHER_PHASE_GATE_VERSION,
} from "./forge-p04-researcher-phase-gate.js";
import { getForgeP04B09ToB10Handoff } from "./forge-p04-researcher-research-to-worker-handoff.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Researcher Phase Gate — P04-B10-A01", () => {
  it("loads versioned researcher phase gate baseline aligned with P04-B09 block gate handoff", () => {
    const fixture = loadResearcherPhaseGateBaseline();
    const validation = validateResearcherPhaseGateBaseline(fixture);
    const handoff = getForgeP04B09ToB10Handoff();

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P04-B10-A01");
    assert.equal(fixture.contractAtom, "P04-B10-A02");
    assert.equal(fixture.sourceBlockGate.atom, "P04-B09-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.researchToWorkerHandoffProbeCount, 23);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 24);
    assert.equal(handoff.targetBlock.entryAtom, "P04-B10-A01");
  });

  it("measures researcher phase gate probes with full alignment after A03 production slice", () => {
    const results = runResearcherPhaseGateProbes();
    const summary = summarizeResearcherPhaseGateMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 24);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listResearcherPhaseGateProbesByExpected(
      "FAIL",
      loadResearcherPhaseGateBaseline(),
    );
    assert.equal(documentedFail.length, 0);

    for (const cat of RESEARCHER_PHASE_GATE_CATEGORIES) {
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

  it("documents zero remaining researcher phase gate gaps after A03 orchestrator wiring", () => {
    const gaps = listResearcherPhaseGateKnownGaps(runResearcherPhaseGateProbes());
    assert.deepEqual(gaps.map(g => g.id).sort(), []);
  });

  it("assessResearcherPhaseGateInputBoundary rejects empty and null-byte manifests", () => {
    const empty = assessResearcherPhaseGateInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessResearcherPhaseGateInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessResearcherPhaseGateInputBoundary("manifest\0parse");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessResearcherPhaseGateInputBoundary truncates oversized manifests", () => {
    const longInput = "x".repeat(RESEARCHER_PHASE_GATE_MANIFEST_MAX_LENGTH + 500);
    const truncated = assessResearcherPhaseGateInputBoundary(longInput);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(
      truncated.normalizedManifest.length,
      RESEARCHER_PHASE_GATE_MANIFEST_MAX_LENGTH,
    );
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("recoverResearcherPhaseGateEvidence restructures informal manifest into validated evidence", () => {
    const recovery = recoverResearcherPhaseGateEvidence(
      `P04-B01: PASS atoms=10
P04-B09: pass atoms=10
handoff regression: pass
handoff: valid`,
      { handoffRegressionPassed: true, handoffValid: true },
    );

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.evidence);
    assert.equal(recovery.blockSeals.length, P04_RESEARCHER_PHASE_BLOCK_INVENTORY.length);
    assert.equal(
      validateForgeP04ResearcherPhaseGateEvidence(recovery.evidence!).valid,
      true,
    );
  });

  it("validateForgeP04ResearcherPhaseGateEvidence rejects failed block gate seals", () => {
    const evidence = buildP04ResearcherPhaseGateEvidence(
      P04_RESEARCHER_PHASE_BLOCK_INVENTORY.map((block, index) => ({
        blockId: block.blockId,
        title: block.title,
        runner: block.runner,
        passed: index !== 8,
        atomSealCount: 10,
        detail: index === 8 ? "failed seal" : "mock seal",
      })),
      true,
      true,
    );

    assert.equal(validateForgeP04ResearcherPhaseGateEvidence(evidence).valid, false);
  });

  it("exports harness version for researcher phase gate baseline", () => {
    assert.equal(FORGE_RESEARCHER_PHASE_GATE_VERSION, "1.0.0");
  });
});
