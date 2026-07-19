import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runStrategistReplanBlockGate,
  runForgeStrategistReplanRegressionGate,
  getForgeP03B08BlockGate,
  getForgeP03B08ToB09Handoff,
  validateStrategistReplanBlockHandoffContract,
  buildStrategistReplanBlockGateEvidence,
} from "./forge-p03-strategist-replan.probe.js";
import {
  summarizeStrategistReplanCoverage,
  getActiveStrategistReplanContract,
  STRATEGIST_REPLAN_CATEGORIES,
} from "./forge-p03-strategist-replan.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Strategist Replan Block Gate — P03-B08-A10", () => {
  it("FORGE_P03_B08_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP03B08BlockGate();
    assert.equal(gate.blockId, "P03-B08");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P03-B08-A10"));
  });

  it("FORGE_P03_B08_TO_B09_HANDOFF_V1 targets plan provenance and drift block", () => {
    const handoff = getForgeP03B08ToB09Handoff();
    const coverage = summarizeStrategistReplanCoverage(getActiveStrategistReplanContract());

    assert.equal(handoff.targetBlock.blockId, "P03-B09");
    assert.equal(handoff.targetBlock.entryAtom, "P03-B09-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.replanCategories.length, STRATEGIST_REPLAN_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.replanRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceBlockGateAtom, "P03-B07-A10");
  });

  it("validateStrategistReplanBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP03B08ToB09Handoff();
    const coverage = summarizeStrategistReplanCoverage();

    const ok = validateStrategistReplanBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateStrategistReplanBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeStrategistReplanRegressionGate passes with integrated guard", () => {
    const result = runForgeStrategistReplanRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runStrategistReplanBlockGate seals P03-B08 and prepares B09 handoff", () => {
    const result = runStrategistReplanBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P03-B08");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P03-B09"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P03-B09-A01");
  });

  it("buildStrategistReplanBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeStrategistReplanCoverage();
    const seals = [{ atomId: "P03-B08-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildStrategistReplanBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeStrategistReplanBlockGate emits strategist_replan_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-sreplan-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "strategist-replan" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeStrategistReplanBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "strategist_replan_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P03-B09"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runStrategistReplanBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
