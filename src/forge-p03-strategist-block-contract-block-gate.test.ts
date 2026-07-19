import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runStrategistBlockContractBlockGate,
  runForgeStrategistBlockContractRegressionGate,
  getForgeP03B02BlockGate,
  getForgeP03B02ToB03Handoff,
  validateStrategistBlockContractBlockHandoffContract,
  buildStrategistBlockContractBlockGateEvidence,
} from "./forge-p03-strategist-block-contract.probe.js";
import {
  summarizeStrategistBlockContractCoverage,
  getActiveStrategistBlockContract,
  STRATEGIST_BLOCK_CONTRACT_CATEGORIES,
} from "./forge-p03-strategist-block-contract.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Strategist Block Contract Block Gate — P03-B02-A10", () => {
  it("FORGE_P03_B02_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP03B02BlockGate();
    assert.equal(gate.blockId, "P03-B02");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P03-B02-A10"));
  });

  it("FORGE_P03_B02_TO_B03_HANDOFF_V1 targets atomization block", () => {
    const handoff = getForgeP03B02ToB03Handoff();
    const coverage = summarizeStrategistBlockContractCoverage(getActiveStrategistBlockContract());

    assert.equal(handoff.targetBlock.blockId, "P03-B03");
    assert.equal(handoff.targetBlock.entryAtom, "P03-B03-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.blockContractCategories.length, STRATEGIST_BLOCK_CONTRACT_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.blockContractRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceBlockGateAtom, "P03-B01-A10");
  });

  it("validateStrategistBlockContractBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP03B02ToB03Handoff();
    const coverage = summarizeStrategistBlockContractCoverage();

    const ok = validateStrategistBlockContractBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateStrategistBlockContractBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeStrategistBlockContractRegressionGate passes with integrated guard", () => {
    const result = runForgeStrategistBlockContractRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runStrategistBlockContractBlockGate seals P03-B02 and prepares B03 handoff", () => {
    const result = runStrategistBlockContractBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P03-B02");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P03-B03"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P03-B03-A01");
  });

  it("buildStrategistBlockContractBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeStrategistBlockContractCoverage();
    const seals = [
      { atomId: "P03-B02-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildStrategistBlockContractBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeStrategistBlockContractBlockGate emits strategist_block_contract_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-sblk-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "strategist-block-contract" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeStrategistBlockContractBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "strategist_block_contract_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P03-B03"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runStrategistBlockContractBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
