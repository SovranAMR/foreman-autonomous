import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runResearcherSpikeFalsificationBlockGate,
  runForgeResearcherSpikeFalsificationRegressionGate,
  getForgeP04B08BlockGate,
  getForgeP04B08ToB09Handoff,
  validateResearcherSpikeFalsificationBlockHandoffContract,
  buildResearcherSpikeFalsificationBlockGateEvidence,
} from "./forge-p04-researcher-spike-falsification.probe.js";
import {
  summarizeResearcherSpikeFalsificationContractCoverage,
  getActiveResearcherSpikeFalsificationContract,
  RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES,
} from "./forge-p04-researcher-spike-falsification.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Researcher Spike Falsification Block Gate — P04-B08-A10", () => {
  it("FORGE_P04_B08_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP04B08BlockGate();
    assert.equal(gate.blockId, "P04-B08");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P04-B08-A10"));
  });

  it("FORGE_P04_B08_TO_B09_HANDOFF_V1 targets research-to-worker handoff block", () => {
    const handoff = getForgeP04B08ToB09Handoff();
    const coverage = summarizeResearcherSpikeFalsificationContractCoverage(
      getActiveResearcherSpikeFalsificationContract(),
    );

    assert.equal(handoff.targetBlock.blockId, "P04-B09");
    assert.equal(handoff.targetBlock.entryAtom, "P04-B09-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.spikeFalsificationCategories.length,
      RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.spikeFalsificationRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceBlockGateAtom, "P04-B07-A10");
  });

  it("validateResearcherSpikeFalsificationBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP04B08ToB09Handoff();
    const coverage = summarizeResearcherSpikeFalsificationContractCoverage();

    const ok = validateResearcherSpikeFalsificationBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateResearcherSpikeFalsificationBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeResearcherSpikeFalsificationRegressionGate passes with integrated guard", () => {
    const result = runForgeResearcherSpikeFalsificationRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runResearcherSpikeFalsificationBlockGate seals P04-B08 and prepares B09 handoff", () => {
    const result = runResearcherSpikeFalsificationBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P04-B08");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P04-B09"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P04-B09-A01");
  });

  it("buildResearcherSpikeFalsificationBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeResearcherSpikeFalsificationContractCoverage();
    const seals = [{ atomId: "P04-B08-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildResearcherSpikeFalsificationBlockGateEvidence(
      seals,
      true,
      false,
      coverage.totalProbes,
    );

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeResearcherSpikeFalsificationBlockGate emits researcher_spike_falsification_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rsf-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-spike-falsification" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherSpikeFalsificationBlockGate();
    const verification = events.find(
      event =>
        event.type === "verification" &&
        event.phase === "researcher_spike_falsification_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P04-B09"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runResearcherSpikeFalsificationBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
