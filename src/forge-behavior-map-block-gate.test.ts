import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeBehaviorMapBlockGate,
  getForgeP01B02BlockGate,
  getForgeP01B02ToB03Handoff,
  validateBehaviorMapBlockHandoffContract,
  buildBehaviorMapBlockGateEvidence,
  summarizeBehaviorMapContractCoverage,
  getActivePipelineBehaviorMapContract,
  PIPELINE_BEHAVIOR_CATEGORIES,
} from "./forge-pipeline-behavior-map-harness.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Behavior Map Block Gate — P01-B02-A10", () => {
  it("FORGE_P01_B02_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP01B02BlockGate();
    assert.equal(gate.blockId, "P01-B02");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P01-B02-A10"));
  });

  it("FORGE_P01_B02_TO_B03_HANDOFF_V1 targets formal state machine block", () => {
    const handoff = getForgeP01B02ToB03Handoff();
    const coverage = summarizeBehaviorMapContractCoverage(getActivePipelineBehaviorMapContract());

    assert.equal(handoff.targetBlock.blockId, "P01-B03");
    assert.equal(handoff.targetBlock.entryAtom, "P01-B03-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.behaviorCategories.length, PIPELINE_BEHAVIOR_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.behaviorMapRecordRequired, true);
  });

  it("validateBehaviorMapBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP01B02ToB03Handoff();
    const coverage = summarizeBehaviorMapContractCoverage();

    const ok = validateBehaviorMapBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateBehaviorMapBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeBehaviorMapBlockGate seals P01-B02 and prepares B03 handoff", () => {
    const result = runForgeBehaviorMapBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P01-B02");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P01-B03"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P01-B03-A01");
  });

  it("buildBehaviorMapBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeBehaviorMapContractCoverage();
    const seals = [
      { atomId: "P01-B02-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildBehaviorMapBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeBehaviorMapBlockGate emits behavior_map_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-behavior-map-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "behavior-map" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeBehaviorMapBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "behavior_map_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P01-B03"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runForgeBehaviorMapBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
