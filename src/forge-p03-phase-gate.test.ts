import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeP03PhaseGate,
  getForgeP03ToP04PhaseHandoff,
  validateP03PhaseHandoffContract,
  validateForgeP03StrategistPhaseGateEvidence,
  buildP03StrategistPhaseGateEvidence,
  P03_STRATEGIST_PHASE_BLOCK_COUNT,
  P03_STRATEGIST_PHASE_ATOM_COUNT,
  P03_STRATEGIST_PHASE_GATE_CHECKS,
} from "./forge-p03-phase-gate.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge P03 Phase Gate", () => {
  it("P03 phase gate declares four acceptance checks", () => {
    assert.equal(P03_STRATEGIST_PHASE_GATE_CHECKS.length, 4);
    assert.ok(P03_STRATEGIST_PHASE_GATE_CHECKS.some(check => check.id === "block_gates_pass"));
    assert.ok(P03_STRATEGIST_PHASE_GATE_CHECKS.some(check => check.id === "phase_handoff"));
  });

  it("FORGE_P03_TO_P04_PHASE_HANDOFF_V1 targets P04 researcher entry", () => {
    const handoff = getForgeP03ToP04PhaseHandoff();

    assert.equal(handoff.sourcePhase.phaseId, "P03");
    assert.equal(handoff.sourcePhase.completedBlocks.length, P03_STRATEGIST_PHASE_BLOCK_COUNT);
    assert.equal(handoff.sourcePhase.completedAtoms, P03_STRATEGIST_PHASE_ATOM_COUNT);
    assert.equal(handoff.targetPhase.phaseId, "P04");
    assert.equal(handoff.targetPhase.entryBlock, "P04-B01");
    assert.equal(handoff.targetPhase.entryAtom, "P04-B01-A01");
    assert.equal(handoff.sealedArtifacts.phaseGateMethod, "verifyForgeP03PhaseGate");
    assert.equal(handoff.entryCriteria.requiresPhaseGatePass, true);
  });

  it("validateP03PhaseHandoffContract rejects incomplete block gate evidence", () => {
    const handoff = getForgeP03ToP04PhaseHandoff();

    const ok = validateP03PhaseHandoffContract(handoff, {
      blockGatesPassed: P03_STRATEGIST_PHASE_BLOCK_COUNT,
      atomSealsPassed: P03_STRATEGIST_PHASE_ATOM_COUNT,
      provenanceRegressionPassed: true,
      handoffValid: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateP03PhaseHandoffContract(handoff, {
      blockGatesPassed: P03_STRATEGIST_PHASE_BLOCK_COUNT - 1,
      atomSealsPassed: P03_STRATEGIST_PHASE_ATOM_COUNT,
      provenanceRegressionPassed: true,
      handoffValid: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("blockGatesPassed")));
  });

  it("validateForgeP03StrategistPhaseGateEvidence rejects failed block seals", () => {
    const handoff = getForgeP03ToP04PhaseHandoff();
    const evidence = buildP03StrategistPhaseGateEvidence(
      [
        {
          blockId: "P03-B01",
          title: "x",
          runner: "runForgeStrategistIntentBlockGate",
          passed: false,
          atomSealCount: 0,
          detail: "fail",
        },
      ],
      true,
      true,
    );

    const validation = validateForgeP03StrategistPhaseGateEvidence(evidence, handoff);
    assert.equal(validation.valid, false);
    assert.ok(validation.issues.some(issue => issue.includes("block gates failed")));
  });

  it("runForgeP03PhaseGate seals P03 and prepares P04 phase handoff", () => {
    const result = runForgeP03PhaseGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockGatesPassed, P03_STRATEGIST_PHASE_BLOCK_COUNT);
    assert.equal(result.evidence.atomSealsPassed, P03_STRATEGIST_PHASE_ATOM_COUNT);
    assert.equal(result.evidence.provenanceRegressionPassed, true);
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.atom, "P03-PHASE-GATE");
    assert.equal(result.handoff.targetPhase.entryAtom, "P04-B01-A01");
    assert.ok(result.detail.includes("handoff=PASS→P04-B01"));
  });

  it("orchestrator verifyForgeP03PhaseGate emits p03_phase_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-p03-phase-gate-int-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "p03-phase-gate" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeP03PhaseGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "p03_phase_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P04-B01"));
    }
  });
});
