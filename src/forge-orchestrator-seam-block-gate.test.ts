import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runOrchestratorSeamBlockGate,
  getForgeP01B09BlockGate,
  getForgeP01B09ToB10Handoff,
  validateOrchestratorSeamBlockHandoffContract,
  buildOrchestratorSeamBlockGateEvidence,
  summarizeOrchestratorSeamContractCoverage,
  getActiveOrchestratorSeamContract,
  ORCHESTRATOR_SEAM_CATEGORIES,
} from "./forge-orchestrator-seam.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Orchestrator Seam Block Gate — P01-B09-A10", () => {
  it("FORGE_P01_B09_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP01B09BlockGate();
    assert.equal(gate.blockId, "P01-B09");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P01-B09-A10"));
  });

  it("FORGE_P01_B09_TO_B10_HANDOFF_V1 targets integrated Forge baseline gate block", () => {
    const handoff = getForgeP01B09ToB10Handoff();
    const coverage = summarizeOrchestratorSeamContractCoverage(getActiveOrchestratorSeamContract());

    assert.equal(handoff.targetBlock.blockId, "P01-B10");
    assert.equal(handoff.targetBlock.entryAtom, "P01-B10-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.orchestratorSeamCategories.length, ORCHESTRATOR_SEAM_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.orchestratorSeamRecordRequired, true);
  });

  it("validateOrchestratorSeamBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP01B09ToB10Handoff();
    const coverage = summarizeOrchestratorSeamContractCoverage();

    const ok = validateOrchestratorSeamBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateOrchestratorSeamBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runOrchestratorSeamBlockGate seals P01-B09 and prepares B10 handoff", () => {
    const result = runOrchestratorSeamBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P01-B09");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P01-B10"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P01-B10-A01");
  });

  it("buildOrchestratorSeamBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeOrchestratorSeamContractCoverage();
    const seals = [
      { atomId: "P01-B09-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildOrchestratorSeamBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeOrchestratorSeamBlockGate emits orchestrator_seam_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-oseam-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "orchestrator-seam" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeOrchestratorSeamBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "orchestrator_seam_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P01-B10"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runOrchestratorSeamBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
