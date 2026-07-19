import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherPhaseGateBaseline,
  runResearcherPhaseGateProbes,
  runResearcherPhaseGateProductionSlice,
} from "./forge-p04-researcher-phase-gate.probe.js";
import {
  getActiveResearcherPhaseGateContract,
  getForgeP04ToP05PhaseHandoff,
  validateP04PhaseHandoffContract,
  validateResearcherPhaseGateProbeMatrix,
  recoverResearcherPhaseGateEvidence,
  assessResearcherPhaseGateInputBoundary,
  buildP04ResearcherPhaseGateEvidence,
  P04_RESEARCHER_PHASE_BLOCK_COUNT,
  P04_RESEARCHER_PHASE_BLOCK_INVENTORY,
  P05_WORKER_PHASE_ID,
} from "./forge-p04-researcher-phase-gate.js";

describe("Forge Researcher Phase Gate Production Slice — P04-B10-A03", () => {
  it("getForgeP04ToP05PhaseHandoff exports sealed P04→P05 phase handoff contract", () => {
    const handoff = getForgeP04ToP05PhaseHandoff();

    assert.equal(handoff.version, "1.0.0");
    assert.equal(handoff.atom, "P04-PHASE-GATE");
    assert.equal(handoff.targetPhase.phaseId, P05_WORKER_PHASE_ID);
    assert.equal(handoff.targetPhase.entryAtom, "P05-B01-A01");
    assert.equal(handoff.sealedArtifacts.blockGateMethod, "verifyForgeResearcherResearchToWorkerHandoffBlockGate");
    assert.equal(handoff.sealedArtifacts.phaseGateMethod, "verifyForgeP04ResearcherPhaseGate");
    assert.equal(handoff.sourcePhase.completedBlocks.length, P04_RESEARCHER_PHASE_BLOCK_COUNT);
  });

  it("validateP04PhaseHandoffContract accepts complete phase gate evidence", () => {
    const handoff = getForgeP04ToP05PhaseHandoff();
    const evidence = buildP04ResearcherPhaseGateEvidence(
      P04_RESEARCHER_PHASE_BLOCK_INVENTORY.map(block => ({
        blockId: block.blockId,
        title: block.title,
        runner: block.runner,
        passed: true,
        atomSealCount: 10,
        detail: "mock seal",
      })),
      true,
      true,
    );

    const validation = validateP04PhaseHandoffContract(handoff, evidence);
    assert.equal(validation.valid, true, validation.issues.join("\n"));
  });

  it("recoverResearcherPhaseGateEvidence restructures malformed block seal manifest", () => {
    const malformed = `block gates incomplete
P04-B01: PASS atoms=10
P04-B02: pass atoms=10
handoff regression: pass
handoff: valid`;
    const recovery = recoverResearcherPhaseGateEvidence(malformed, {
      handoffRegressionPassed: true,
      handoffValid: true,
    });

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.evidence);
    assert.equal(recovery.blockSeals.length, P04_RESEARCHER_PHASE_BLOCK_COUNT);
    assert.equal(recovery.handoffRegressionPassed, true);
    assert.equal(recovery.handoffValid, true);
    assert.ok(recovery.blockSeals.every(seal => seal.passed));
  });

  it("recoverResearcherPhaseGateEvidence rejects null-byte manifest safely", () => {
    const recovery = recoverResearcherPhaseGateEvidence("manifest\0corrupt");
    assert.equal(recovery.recovered, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_manifest"]);
  });

  it("assessResearcherPhaseGateInputBoundary handles empty and whitespace-only manifest", () => {
    const empty = assessResearcherPhaseGateInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessResearcherPhaseGateInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveResearcherPhaseGateContract();
    const slice = runResearcherPhaseGateProductionSlice();

    assert.equal(slice.atom, "P04-B10-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 24);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 24);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const matrixValidation = validateResearcherPhaseGateProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("baseline fixture aligns with post-A03 contract with zero FAIL gaps", () => {
    const fixture = loadResearcherPhaseGateBaseline();
    const failProbes = fixture.probes.filter(p => p.expected === "FAIL");
    assert.equal(failProbes.length, 0);
    assert.equal(runResearcherPhaseGateProbes(fixture).every(r => r.aligned), true);
  });
});
