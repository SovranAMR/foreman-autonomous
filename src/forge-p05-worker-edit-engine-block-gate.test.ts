import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runWorkerEditEngineBlockGate,
  runForgeWorkerEditEngineRegressionGate,
  runForgeWorkerEditEngineGuardGate,
  getForgeP05B03BlockGate,
  getForgeP05B03ToB04Handoff,
  validateWorkerEditEngineBlockHandoffContract,
  buildWorkerEditEngineBlockGateEvidence,
  validateForgeWorkerEditEngineBlockGate,
} from "./forge-p05-worker-edit-engine.probe.js";
import {
  summarizeWorkerEditEngineContractCoverage,
  getActiveWorkerEditEngineContract,
  WORKER_EDIT_ENGINE_CATEGORIES,
} from "./forge-p05-worker-edit-engine.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Worker Edit Engine Block Gate — P05-B03-A10", () => {
  it("FORGE_P05_B03_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP05B03BlockGate();
    assert.equal(gate.blockId, "P05-B03");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P05-B03-A10"));
  });

  it("FORGE_P05_B03_TO_B04_HANDOFF_V1 targets shell and process lifecycle block", () => {
    const handoff = getForgeP05B03ToB04Handoff();
    const coverage = summarizeWorkerEditEngineContractCoverage(
      getActiveWorkerEditEngineContract(),
    );

    assert.equal(handoff.targetBlock.blockId, "P05-B04");
    assert.equal(handoff.targetBlock.entryAtom, "P05-B04-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.workerEditEngineCategories.length,
      WORKER_EDIT_ENGINE_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.workerEditEngineRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceWorkerFilesystemGroundingBlockGateAtom, "P05-B02-A10");
  });

  it("validateWorkerEditEngineBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP05B03ToB04Handoff();
    const coverage = summarizeWorkerEditEngineContractCoverage();

    const ok = validateWorkerEditEngineBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateWorkerEditEngineBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("validateForgeWorkerEditEngineBlockGate rejects incomplete atom seals", () => {
    const coverage = summarizeWorkerEditEngineContractCoverage();
    const incomplete = [{ atomId: "P05-B03-A01", capability: "x", passed: true, detail: "ok" }];
    const result = validateForgeWorkerEditEngineBlockGate(incomplete, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });

    assert.equal(result.valid, false);
    assert.ok(result.issues.some(issue => issue.includes("missing atom seal")));
  });

  it("runForgeWorkerEditEngineRegressionGate passes with integrated guard", () => {
    const result = runForgeWorkerEditEngineRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runForgeWorkerEditEngineGuardGate passes adversarial controls", () => {
    const result = runForgeWorkerEditEngineGuardGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runWorkerEditEngineBlockGate seals P05-B03 and prepares B04 handoff", () => {
    const result = runWorkerEditEngineBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P05-B03");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P05-B04"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P05-B04-A01");
  });

  it("buildWorkerEditEngineBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeWorkerEditEngineContractCoverage();
    const seals = [{ atomId: "P05-B03-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildWorkerEditEngineBlockGateEvidence(
      seals,
      true,
      false,
      coverage.totalProbes,
    );

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeWorkerEditEngineBlockGate emits worker_edit_engine_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-wee-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "worker-edit-engine" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeWorkerEditEngineBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "worker_edit_engine_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P05-B04"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runWorkerEditEngineBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
