import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgePipelineInvariantEngineBlockGate,
  getForgeP01B05BlockGate,
  getForgeP01B05ToB06Handoff,
  validatePipelineInvariantEngineBlockHandoffContract,
  buildPipelineInvariantEngineBlockGateEvidence,
  summarizePipelineInvariantEngineContractCoverage,
  getActivePipelineInvariantEngineContract,
  PIPELINE_INVARIANT_ENGINE_CATEGORIES,
} from "./forge-pipeline-invariant-engine-harness.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Pipeline Invariant Engine Block Gate — P01-B05-A10", () => {
  it("FORGE_P01_B05_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP01B05BlockGate();
    assert.equal(gate.blockId, "P01-B05");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P01-B05-A10"));
  });

  it("FORGE_P01_B05_TO_B06_HANDOFF_V1 targets benchmark and eval harness block", () => {
    const handoff = getForgeP01B05ToB06Handoff();
    const coverage = summarizePipelineInvariantEngineContractCoverage(getActivePipelineInvariantEngineContract());

    assert.equal(handoff.targetBlock.blockId, "P01-B06");
    assert.equal(handoff.targetBlock.entryAtom, "P01-B06-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.invariantCategories.length, PIPELINE_INVARIANT_ENGINE_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.pipelineInvariantEngineRecordRequired, true);
  });

  it("validatePipelineInvariantEngineBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP01B05ToB06Handoff();
    const coverage = summarizePipelineInvariantEngineContractCoverage();

    const ok = validatePipelineInvariantEngineBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validatePipelineInvariantEngineBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgePipelineInvariantEngineBlockGate seals P01-B05 and prepares B06 handoff", () => {
    const result = runForgePipelineInvariantEngineBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P01-B05");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P01-B06"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P01-B06-A01");
  });

  it("buildPipelineInvariantEngineBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizePipelineInvariantEngineContractCoverage();
    const seals = [
      { atomId: "P01-B05-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildPipelineInvariantEngineBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgePipelineInvariantEngineBlockGate emits pipeline_invariant_engine_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-invariant-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "pipeline-invariant-engine" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgePipelineInvariantEngineBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "pipeline_invariant_engine_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P01-B06"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runForgePipelineInvariantEngineBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
