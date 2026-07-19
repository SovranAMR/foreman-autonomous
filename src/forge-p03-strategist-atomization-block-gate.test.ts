import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runStrategistAtomizationBlockGate,
  runForgeStrategistAtomizationRegressionGate,
  getForgeP03B03BlockGate,
  getForgeP03B03ToB04Handoff,
  validateStrategistAtomizationBlockHandoffContract,
  buildStrategistAtomizationBlockGateEvidence,
} from "./forge-p03-strategist-atomization.probe.js";
import {
  summarizeStrategistAtomizationCoverage,
  getActiveStrategistAtomizationContract,
  STRATEGIST_ATOMIZATION_CATEGORIES,
} from "./forge-p03-strategist-atomization.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Strategist Atomization Block Gate — P03-B03-A10", () => {
  it("FORGE_P03_B03_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP03B03BlockGate();
    assert.equal(gate.blockId, "P03-B03");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P03-B03-A10"));
  });

  it("FORGE_P03_B03_TO_B04_HANDOFF_V1 targets dependency DAG block", () => {
    const handoff = getForgeP03B03ToB04Handoff();
    const coverage = summarizeStrategistAtomizationCoverage(getActiveStrategistAtomizationContract());

    assert.equal(handoff.targetBlock.blockId, "P03-B04");
    assert.equal(handoff.targetBlock.entryAtom, "P03-B04-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.atomizationCategories.length, STRATEGIST_ATOMIZATION_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.atomizationRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceBlockGateAtom, "P03-B02-A10");
  });

  it("validateStrategistAtomizationBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP03B03ToB04Handoff();
    const coverage = summarizeStrategistAtomizationCoverage();

    const ok = validateStrategistAtomizationBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateStrategistAtomizationBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeStrategistAtomizationRegressionGate passes with integrated guard", () => {
    const result = runForgeStrategistAtomizationRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runStrategistAtomizationBlockGate seals P03-B03 and prepares B04 handoff", () => {
    const result = runStrategistAtomizationBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P03-B03");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P03-B04"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P03-B04-A01");
  });

  it("buildStrategistAtomizationBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeStrategistAtomizationCoverage();
    const seals = [
      { atomId: "P03-B03-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildStrategistAtomizationBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeStrategistAtomizationBlockGate emits strategist_atomization_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-satom-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "strategist-atomization" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeStrategistAtomizationBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "strategist_atomization_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P03-B04"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runStrategistAtomizationBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
