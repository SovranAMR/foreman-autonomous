import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeP01PhaseGate,
  getForgeP01ToP02PhaseHandoff,
  validateP01PhaseHandoffContract,
  validateForgeP01PhaseGateEvidence,
  buildP01PhaseGateEvidence,
  P01_PHASE_BLOCK_COUNT,
  P01_PHASE_ATOM_COUNT,
  P01_PHASE_GATE_CHECKS,
} from "./forge-p01-phase-gate.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge P01 Phase Gate", () => {
  it("P01 phase gate declares four acceptance checks", () => {
    assert.equal(P01_PHASE_GATE_CHECKS.length, 4);
    assert.ok(P01_PHASE_GATE_CHECKS.some(check => check.id === "block_gates_pass"));
    assert.ok(P01_PHASE_GATE_CHECKS.some(check => check.id === "phase_handoff"));
  });

  it("FORGE_P01_TO_P02_PHASE_HANDOFF_V1 targets P02 visioner entry", () => {
    const handoff = getForgeP01ToP02PhaseHandoff();

    assert.equal(handoff.sourcePhase.phaseId, "P01");
    assert.equal(handoff.sourcePhase.completedBlocks.length, P01_PHASE_BLOCK_COUNT);
    assert.equal(handoff.sourcePhase.completedAtoms, P01_PHASE_ATOM_COUNT);
    assert.equal(handoff.targetPhase.phaseId, "P02");
    assert.equal(handoff.targetPhase.entryBlock, "P02-B01");
    assert.equal(handoff.targetPhase.entryAtom, "P02-B01-A01");
    assert.equal(handoff.sealedArtifacts.phaseGateMethod, "verifyForgeP01PhaseGate");
    assert.equal(handoff.entryCriteria.requiresPhaseGatePass, true);
  });

  it("validateP01PhaseHandoffContract rejects incomplete block gate evidence", () => {
    const handoff = getForgeP01ToP02PhaseHandoff();

    const ok = validateP01PhaseHandoffContract(handoff, {
      blockGatesPassed: P01_PHASE_BLOCK_COUNT,
      atomSealsPassed: P01_PHASE_ATOM_COUNT,
      integratedRegressionPassed: true,
      handoffValid: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateP01PhaseHandoffContract(handoff, {
      blockGatesPassed: P01_PHASE_BLOCK_COUNT - 1,
      atomSealsPassed: P01_PHASE_ATOM_COUNT,
      integratedRegressionPassed: true,
      handoffValid: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("blockGatesPassed")));
  });

  it("validateForgeP01PhaseGateEvidence rejects failed block seals", () => {
    const handoff = getForgeP01ToP02PhaseHandoff();
    const evidence = buildP01PhaseGateEvidence(
      [
        {
          blockId: "P01-B01",
          title: "x",
          runner: "runForgeBaselineBlockGate",
          passed: false,
          atomSealCount: 0,
          detail: "fail",
        },
      ],
      true,
      true,
    );

    const validation = validateForgeP01PhaseGateEvidence(evidence, handoff);
    assert.equal(validation.valid, false);
    assert.ok(validation.issues.some(issue => issue.includes("block gates failed")));
  });

  it("runForgeP01PhaseGate seals P01 and prepares P02 phase handoff", async () => {
    const result = await runForgeP01PhaseGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockGatesPassed, P01_PHASE_BLOCK_COUNT);
    assert.equal(result.evidence.atomSealsPassed, P01_PHASE_ATOM_COUNT);
    assert.equal(result.evidence.integratedRegressionPassed, true);
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.handoff.targetPhase.entryAtom, "P02-B01-A01");
    assert.ok(result.detail.includes("handoff=PASS→P02-B01"));
  });

  it("orchestrator verifyForgeP01PhaseGate emits p01_phase_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-p01-phase-gate-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "p01-phase-gate" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeP01PhaseGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "p01_phase_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P02-B01"));
    }
  });
});
