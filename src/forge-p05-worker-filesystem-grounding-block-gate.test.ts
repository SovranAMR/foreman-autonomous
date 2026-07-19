import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runWorkerFilesystemGroundingBlockGate,
  runForgeWorkerFilesystemGroundingRegressionGate,
  runForgeWorkerFilesystemGroundingGuardGate,
  getForgeP05B02BlockGate,
  getForgeP05B02ToB03Handoff,
  validateWorkerFilesystemGroundingBlockHandoffContract,
  buildWorkerFilesystemGroundingBlockGateEvidence,
  validateForgeWorkerFilesystemGroundingBlockGate,
} from "./forge-p05-worker-filesystem-grounding.probe.js";
import {
  summarizeWorkerFilesystemGroundingContractCoverage,
  getActiveWorkerFilesystemGroundingContract,
  WORKER_FILESYSTEM_GROUNDING_CATEGORIES,
} from "./forge-p05-worker-filesystem-grounding.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Worker Filesystem Grounding Block Gate — P05-B02-A10", () => {
  it("FORGE_P05_B02_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP05B02BlockGate();
    assert.equal(gate.blockId, "P05-B02");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P05-B02-A10"));
  });

  it("FORGE_P05_B02_TO_B03_HANDOFF_V1 targets surgical edit engine block", () => {
    const handoff = getForgeP05B02ToB03Handoff();
    const coverage = summarizeWorkerFilesystemGroundingContractCoverage(
      getActiveWorkerFilesystemGroundingContract(),
    );

    assert.equal(handoff.targetBlock.blockId, "P05-B03");
    assert.equal(handoff.targetBlock.entryAtom, "P05-B03-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.workerFilesystemGroundingCategories.length,
      WORKER_FILESYSTEM_GROUNDING_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.workerFilesystemGroundingRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceWorkerToolDispatchBlockGateAtom, "P05-B01-A10");
  });

  it("validateWorkerFilesystemGroundingBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP05B02ToB03Handoff();
    const coverage = summarizeWorkerFilesystemGroundingContractCoverage();

    const ok = validateWorkerFilesystemGroundingBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateWorkerFilesystemGroundingBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("validateForgeWorkerFilesystemGroundingBlockGate rejects incomplete atom seals", () => {
    const coverage = summarizeWorkerFilesystemGroundingContractCoverage();
    const incomplete = [{ atomId: "P05-B02-A01", capability: "x", passed: true, detail: "ok" }];
    const result = validateForgeWorkerFilesystemGroundingBlockGate(incomplete, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });

    assert.equal(result.valid, false);
    assert.ok(result.issues.some(issue => issue.includes("missing atom seal")));
  });

  it("runForgeWorkerFilesystemGroundingRegressionGate passes with integrated guard", () => {
    const result = runForgeWorkerFilesystemGroundingRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runForgeWorkerFilesystemGroundingGuardGate passes adversarial controls", () => {
    const result = runForgeWorkerFilesystemGroundingGuardGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runWorkerFilesystemGroundingBlockGate seals P05-B02 and prepares B03 handoff", () => {
    const result = runWorkerFilesystemGroundingBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P05-B02");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P05-B03"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P05-B03-A01");
  });

  it("buildWorkerFilesystemGroundingBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeWorkerFilesystemGroundingContractCoverage();
    const seals = [{ atomId: "P05-B02-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildWorkerFilesystemGroundingBlockGateEvidence(
      seals,
      true,
      false,
      coverage.totalProbes,
    );

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeWorkerFilesystemGroundingBlockGate emits worker_filesystem_grounding_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-wfg-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "worker-filesystem-grounding" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeWorkerFilesystemGroundingBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "worker_filesystem_grounding_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P05-B03"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runWorkerFilesystemGroundingBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
