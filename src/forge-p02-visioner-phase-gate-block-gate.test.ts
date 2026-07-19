import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runVisionerPhaseGateBlockGate,
  getForgeP02B10BlockGate,
  getForgeP02B10ToP03Handoff,
  validateVisionerPhaseGateBlockHandoffContract,
  buildVisionerPhaseGateBlockGateEvidence,
  summarizeVisionerPhaseGateContractCoverage,
  getActiveVisionerPhaseGateContract,
} from "./forge-p02-visioner-phase-gate.probe.js";
import {
  VISIONER_PHASE_GATE_CATEGORIES,
  EXPECTED_P02_VISIONER_PRIOR_BLOCK_GATE_COUNT,
} from "./forge-p02-visioner-phase-gate.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Visioner Phase Gate Block Gate — P02-B10-A10", () => {
  it("FORGE_P02_B10_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP02B10BlockGate();
    assert.equal(gate.blockId, "P02-B10");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P02-B10-A10"));
  });

  it("FORGE_P02_B10_TO_P03_HANDOFF_V1 targets strategist phase entry", () => {
    const handoff = getForgeP02B10ToP03Handoff();
    const coverage = summarizeVisionerPhaseGateContractCoverage(getActiveVisionerPhaseGateContract());

    assert.equal(handoff.targetBlock.blockId, "P03-B01");
    assert.equal(handoff.targetBlock.entryAtom, "P03-B01-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.visionerPhaseGateCategories.length, VISIONER_PHASE_GATE_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.visionerPhaseGateRecordRequired, true);
  });

  it("validateVisionerPhaseGateBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP02B10ToP03Handoff();
    const coverage = summarizeVisionerPhaseGateContractCoverage();

    const ok = validateVisionerPhaseGateBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
      sealedBlockCount: EXPECTED_P02_VISIONER_PRIOR_BLOCK_GATE_COUNT,
    });
    assert.equal(ok.valid, true);

    const bad = validateVisionerPhaseGateBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
      sealedBlockCount: EXPECTED_P02_VISIONER_PRIOR_BLOCK_GATE_COUNT,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runVisionerPhaseGateBlockGate seals P02-B10 and prepares P03 handoff", () => {
    const result = runVisionerPhaseGateBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P02-B10");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.evidence.sealedBlockCount, EXPECTED_P02_VISIONER_PRIOR_BLOCK_GATE_COUNT);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P03-B01"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P03-B01-A01");
  });

  it("buildVisionerPhaseGateBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeVisionerPhaseGateContractCoverage();
    const seals = [
      { atomId: "P02-B10-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildVisionerPhaseGateBlockGateEvidence(
      seals,
      true,
      false,
      coverage.totalProbes,
    );

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeP02VisionerPhaseGateBlockGate emits visioner_phase_gate_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-vpg-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-phase-gate" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeP02VisionerPhaseGateBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_phase_gate_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P03-B01"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runVisionerPhaseGateBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
