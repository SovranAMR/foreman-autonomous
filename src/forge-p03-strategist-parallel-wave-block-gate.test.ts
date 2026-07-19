import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runStrategistParallelWaveBlockGate,
  runForgeStrategistParallelWaveRegressionGate,
  getForgeP03B07BlockGate,
  getForgeP03B07ToB08Handoff,
  validateStrategistParallelWaveBlockHandoffContract,
  buildStrategistParallelWaveBlockGateEvidence,
} from "./forge-p03-strategist-parallel-wave.probe.js";
import {
  summarizeStrategistParallelWaveCoverage,
  getActiveStrategistParallelWaveContract,
  STRATEGIST_PARALLEL_WAVE_CATEGORIES,
} from "./forge-p03-strategist-parallel-wave.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Strategist Parallel Wave Block Gate — P03-B07-A10", () => {
  it("FORGE_P03_B07_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP03B07BlockGate();
    assert.equal(gate.blockId, "P03-B07");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P03-B07-A10"));
  });

  it("FORGE_P03_B07_TO_B08_HANDOFF_V1 targets replan and plan repair block", () => {
    const handoff = getForgeP03B07ToB08Handoff();
    const coverage = summarizeStrategistParallelWaveCoverage(getActiveStrategistParallelWaveContract());

    assert.equal(handoff.targetBlock.blockId, "P03-B08");
    assert.equal(handoff.targetBlock.entryAtom, "P03-B08-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.parallelWaveCategories.length,
      STRATEGIST_PARALLEL_WAVE_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.parallelWaveRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceBlockGateAtom, "P03-B06-A10");
  });

  it("validateStrategistParallelWaveBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP03B07ToB08Handoff();
    const coverage = summarizeStrategistParallelWaveCoverage();

    const ok = validateStrategistParallelWaveBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateStrategistParallelWaveBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeStrategistParallelWaveRegressionGate passes with integrated guard", () => {
    const result = runForgeStrategistParallelWaveRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runStrategistParallelWaveBlockGate seals P03-B07 and prepares B08 handoff", () => {
    const result = runStrategistParallelWaveBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P03-B07");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P03-B08"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P03-B08-A01");
  });

  it("buildStrategistParallelWaveBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeStrategistParallelWaveCoverage();
    const seals = [{ atomId: "P03-B07-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildStrategistParallelWaveBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeStrategistParallelWaveBlockGate emits strategist_parallel_wave_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-spwave-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "strategist-parallel-wave" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeStrategistParallelWaveBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "strategist_parallel_wave_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P03-B08"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runStrategistParallelWaveBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
