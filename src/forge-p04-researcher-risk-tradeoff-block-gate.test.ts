import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runResearcherRiskTradeoffBlockGate,
  runForgeResearcherRiskTradeoffRegressionGate,
  getForgeP04B07BlockGate,
  getForgeP04B07ToB08Handoff,
  validateResearcherRiskTradeoffBlockHandoffContract,
  buildResearcherRiskTradeoffBlockGateEvidence,
} from "./forge-p04-researcher-risk-tradeoff.probe.js";
import {
  summarizeResearcherRiskTradeoffContractCoverage,
  getActiveResearcherRiskTradeoffContract,
  RESEARCHER_RISK_TRADEOFF_CATEGORIES,
} from "./forge-p04-researcher-risk-tradeoff.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Researcher Risk Trade-off Block Gate — P04-B07-A10", () => {
  it("FORGE_P04_B07_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP04B07BlockGate();
    assert.equal(gate.blockId, "P04-B07");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P04-B07-A10"));
  });

  it("FORGE_P04_B07_TO_B08_HANDOFF_V1 targets spike and falsification block", () => {
    const handoff = getForgeP04B07ToB08Handoff();
    const coverage = summarizeResearcherRiskTradeoffContractCoverage(
      getActiveResearcherRiskTradeoffContract(),
    );

    assert.equal(handoff.targetBlock.blockId, "P04-B08");
    assert.equal(handoff.targetBlock.entryAtom, "P04-B08-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.riskTradeoffCategories.length,
      RESEARCHER_RISK_TRADEOFF_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.riskTradeoffRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceBlockGateAtom, "P04-B06-A10");
  });

  it("validateResearcherRiskTradeoffBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP04B07ToB08Handoff();
    const coverage = summarizeResearcherRiskTradeoffContractCoverage();

    const ok = validateResearcherRiskTradeoffBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateResearcherRiskTradeoffBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeResearcherRiskTradeoffRegressionGate passes with integrated guard", () => {
    const result = runForgeResearcherRiskTradeoffRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runResearcherRiskTradeoffBlockGate seals P04-B07 and prepares B08 handoff", () => {
    const result = runResearcherRiskTradeoffBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P04-B07");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P04-B08"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P04-B08-A01");
  });

  it("buildResearcherRiskTradeoffBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeResearcherRiskTradeoffContractCoverage();
    const seals = [{ atomId: "P04-B07-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildResearcherRiskTradeoffBlockGateEvidence(
      seals,
      true,
      false,
      coverage.totalProbes,
    );

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeResearcherRiskTradeoffBlockGate emits researcher_risk_tradeoff_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rrt-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-risk-tradeoff" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherRiskTradeoffBlockGate();
    const verification = events.find(
      event =>
        event.type === "verification" &&
        event.phase === "researcher_risk_tradeoff_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P04-B08"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runResearcherRiskTradeoffBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
