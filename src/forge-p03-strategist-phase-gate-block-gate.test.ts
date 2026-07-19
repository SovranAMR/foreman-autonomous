import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runStrategistPhaseGateBlockGate,
  getForgeP03B10BlockGate,
  getForgeP03B10ToP04Handoff,
  validateStrategistPhaseGateBlockHandoffContract,
  buildStrategistPhaseGateBlockGateEvidence,
  summarizeStrategistPhaseGateCoverage,
  getActiveStrategistPhaseGateContract,
} from "./forge-p03-strategist-phase-gate.probe.js";
import {
  STRATEGIST_PHASE_GATE_CATEGORIES,
  EXPECTED_P03_STRATEGIST_PRIOR_BLOCK_GATE_COUNT,
} from "./forge-p03-strategist-phase-gate.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Strategist Phase Gate Block Gate — P03-B10-A10", () => {
  it("FORGE_P03_B10_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP03B10BlockGate();
    assert.equal(gate.blockId, "P03-B10");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P03-B10-A10"));
  });

  it("FORGE_P03_B10_TO_P04_HANDOFF_V1 targets researcher phase entry", () => {
    const handoff = getForgeP03B10ToP04Handoff();
    const coverage = summarizeStrategistPhaseGateCoverage(getActiveStrategistPhaseGateContract());

    assert.equal(handoff.targetBlock.blockId, "P04-B01");
    assert.equal(handoff.targetBlock.entryAtom, "P04-B01-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.strategistPhaseGateCategories.length,
      STRATEGIST_PHASE_GATE_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.strategistPhaseGateRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceStrategistProvenanceBlockGateAtom, "P03-B09-A10");
  });

  it("validateStrategistPhaseGateBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP03B10ToP04Handoff();
    const coverage = summarizeStrategistPhaseGateCoverage();

    const ok = validateStrategistPhaseGateBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
      sealedBlockCount: EXPECTED_P03_STRATEGIST_PRIOR_BLOCK_GATE_COUNT,
    });
    assert.equal(ok.valid, true);

    const bad = validateStrategistPhaseGateBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
      sealedBlockCount: EXPECTED_P03_STRATEGIST_PRIOR_BLOCK_GATE_COUNT,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runStrategistPhaseGateBlockGate seals P03-B10 and prepares P04 handoff", () => {
    const result = runStrategistPhaseGateBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P03-B10");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.evidence.sealedBlockCount, EXPECTED_P03_STRATEGIST_PRIOR_BLOCK_GATE_COUNT);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P04-B01"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P04-B01-A01");
  });

  it("buildStrategistPhaseGateBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeStrategistPhaseGateCoverage();
    const seals = [{ atomId: "P03-B10-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildStrategistPhaseGateBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeStrategistPhaseGateBlockGate emits strategist_phase_gate_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-spg-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "strategist-phase-gate" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeStrategistPhaseGateBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "strategist_phase_gate_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P04-B01"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runStrategistPhaseGateBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
