import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runWorkerToolDispatchBlockGate,
  runForgeWorkerToolDispatchRegressionGate,
  runForgeWorkerToolDispatchGuardGate,
  getForgeP05B01BlockGate,
  getForgeP05B01ToB02Handoff,
  validateWorkerToolDispatchBlockHandoffContract,
  buildWorkerToolDispatchBlockGateEvidence,
  validateForgeWorkerToolDispatchBlockGate,
} from "./forge-p05-worker-tool-dispatch.probe.js";
import {
  summarizeWorkerToolDispatchContractCoverage,
  getActiveWorkerToolDispatchContract,
  WORKER_TOOL_DISPATCH_CATEGORIES,
} from "./forge-p05-worker-tool-dispatch.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Worker Tool Dispatch Block Gate — P05-B01-A10", () => {
  it("FORGE_P05_B01_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP05B01BlockGate();
    assert.equal(gate.blockId, "P05-B01");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P05-B01-A10"));
  });

  it("FORGE_P05_B01_TO_B02_HANDOFF_V1 targets filesystem grounding block", () => {
    const handoff = getForgeP05B01ToB02Handoff();
    const coverage = summarizeWorkerToolDispatchContractCoverage(
      getActiveWorkerToolDispatchContract(),
    );

    assert.equal(handoff.targetBlock.blockId, "P05-B02");
    assert.equal(handoff.targetBlock.entryAtom, "P05-B02-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.workerToolDispatchCategories.length,
      WORKER_TOOL_DISPATCH_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.workerToolDispatchRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourcePhaseGateAtom, "P04-B10-A10");
  });

  it("validateWorkerToolDispatchBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP05B01ToB02Handoff();
    const coverage = summarizeWorkerToolDispatchContractCoverage();

    const ok = validateWorkerToolDispatchBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateWorkerToolDispatchBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("validateForgeWorkerToolDispatchBlockGate rejects incomplete atom seals", () => {
    const coverage = summarizeWorkerToolDispatchContractCoverage();
    const incomplete = [{ atomId: "P05-B01-A01", capability: "x", passed: true, detail: "ok" }];
    const result = validateForgeWorkerToolDispatchBlockGate(incomplete, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });

    assert.equal(result.valid, false);
    assert.ok(result.issues.some(issue => issue.includes("missing atom seal")));
  });

  it("runForgeWorkerToolDispatchRegressionGate passes with integrated guard", () => {
    const result = runForgeWorkerToolDispatchRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runForgeWorkerToolDispatchGuardGate passes adversarial controls", () => {
    const result = runForgeWorkerToolDispatchGuardGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runWorkerToolDispatchBlockGate seals P05-B01 and prepares B02 handoff", () => {
    const result = runWorkerToolDispatchBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P05-B01");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P05-B02"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P05-B02-A01");
  });

  it("buildWorkerToolDispatchBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeWorkerToolDispatchContractCoverage();
    const seals = [{ atomId: "P05-B01-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildWorkerToolDispatchBlockGateEvidence(
      seals,
      true,
      false,
      coverage.totalProbes,
    );

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeWorkerToolDispatchBlockGate emits worker_tool_dispatch_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-wtd-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "worker-tool-dispatch" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeWorkerToolDispatchBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "worker_tool_dispatch_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P05-B02"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runWorkerToolDispatchBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
