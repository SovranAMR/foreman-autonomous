import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeFormalStateMachineBlockGate,
  getForgeP01B03BlockGate,
  getForgeP01B03ToB04Handoff,
  validateFormalStateMachineBlockHandoffContract,
  buildFormalStateMachineBlockGateEvidence,
  summarizeFormalStateMachineContractCoverage,
  getActiveFormalStateMachineContract,
  FORMAL_STATE_MACHINE_CATEGORIES,
} from "./forge-formal-state-machine-harness.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Formal State Machine Block Gate — P01-B03-A10", () => {
  it("FORGE_P01_B03_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP01B03BlockGate();
    assert.equal(gate.blockId, "P01-B03");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P01-B03-A10"));
  });

  it("FORGE_P01_B03_TO_B04_HANDOFF_V1 targets typed phase/event schema block", () => {
    const handoff = getForgeP01B03ToB04Handoff();
    const coverage = summarizeFormalStateMachineContractCoverage(getActiveFormalStateMachineContract());

    assert.equal(handoff.targetBlock.blockId, "P01-B04");
    assert.equal(handoff.targetBlock.entryAtom, "P01-B04-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.fsmCategories.length, FORMAL_STATE_MACHINE_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.formalStateMachineRecordRequired, true);
  });

  it("validateFormalStateMachineBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP01B03ToB04Handoff();
    const coverage = summarizeFormalStateMachineContractCoverage();

    const ok = validateFormalStateMachineBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateFormalStateMachineBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeFormalStateMachineBlockGate seals P01-B03 and prepares B04 handoff", () => {
    const result = runForgeFormalStateMachineBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P01-B03");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P01-B04"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P01-B04-A01");
  });

  it("buildFormalStateMachineBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeFormalStateMachineContractCoverage();
    const seals = [
      { atomId: "P01-B03-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildFormalStateMachineBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeFormalStateMachineBlockGate emits formal_state_machine_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-fsm-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "formal-state-machine" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeFormalStateMachineBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "formal_state_machine_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P01-B04"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runForgeFormalStateMachineBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
