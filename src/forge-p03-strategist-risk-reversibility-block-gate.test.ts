import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runStrategistRiskReversibilityBlockGate,
  runForgeStrategistRiskReversibilityRegressionGate,
  getForgeP03B05BlockGate,
  getForgeP03B05ToB06Handoff,
  validateStrategistRiskReversibilityBlockHandoffContract,
  buildStrategistRiskReversibilityBlockGateEvidence,
} from "./forge-p03-strategist-risk-reversibility.probe.js";
import {
  summarizeStrategistRiskReversibilityCoverage,
  getActiveStrategistRiskReversibilityContract,
  STRATEGIST_RISK_REVERSIBILITY_CATEGORIES,
} from "./forge-p03-strategist-risk-reversibility.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Strategist Risk Reversibility Block Gate — P03-B05-A10", () => {
  it("FORGE_P03_B05_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP03B05BlockGate();
    assert.equal(gate.blockId, "P03-B05");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P03-B05-A10"));
  });

  it("FORGE_P03_B05_TO_B06_HANDOFF_V1 targets resource and budget block", () => {
    const handoff = getForgeP03B05ToB06Handoff();
    const coverage = summarizeStrategistRiskReversibilityCoverage(getActiveStrategistRiskReversibilityContract());

    assert.equal(handoff.targetBlock.blockId, "P03-B06");
    assert.equal(handoff.targetBlock.entryAtom, "P03-B06-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.riskReversibilityCategories.length,
      STRATEGIST_RISK_REVERSIBILITY_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.riskReversibilityRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceBlockGateAtom, "P03-B04-A10");
  });

  it("validateStrategistRiskReversibilityBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP03B05ToB06Handoff();
    const coverage = summarizeStrategistRiskReversibilityCoverage();

    const ok = validateStrategistRiskReversibilityBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateStrategistRiskReversibilityBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeStrategistRiskReversibilityRegressionGate passes with integrated guard", () => {
    const result = runForgeStrategistRiskReversibilityRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runStrategistRiskReversibilityBlockGate seals P03-B05 and prepares B06 handoff", () => {
    const result = runStrategistRiskReversibilityBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P03-B05");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P03-B06"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P03-B06-A01");
  });

  it("buildStrategistRiskReversibilityBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeStrategistRiskReversibilityCoverage();
    const seals = [{ atomId: "P03-B05-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildStrategistRiskReversibilityBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeStrategistRiskReversibilityBlockGate emits strategist_risk_reversibility_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-srisk-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "strategist-risk-reversibility" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeStrategistRiskReversibilityBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "strategist_risk_reversibility_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P03-B06"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runStrategistRiskReversibilityBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
