import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runVisionerSynthesisBlockGate,
  getForgeP02B03BlockGate,
  getForgeP02B03ToB04Handoff,
  validateVisionerSynthesisBlockHandoffContract,
  buildVisionerSynthesisBlockGateEvidence,
  summarizeVisionerSynthesisContractCoverage,
  getActiveVisionerSynthesisContract,
  VISIONER_SYNTHESIS_CATEGORIES,
} from "./forge-p02-visioner-synthesis.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Visioner Synthesis Block Gate — P02-B03-A10", () => {
  it("FORGE_P02_B03_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP02B03BlockGate();
    assert.equal(gate.blockId, "P02-B03");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P02-B03-A10"));
  });

  it("FORGE_P02_B03_TO_B04_HANDOFF_V1 targets repo and user context grounding block", () => {
    const handoff = getForgeP02B03ToB04Handoff();
    const coverage = summarizeVisionerSynthesisContractCoverage(getActiveVisionerSynthesisContract());

    assert.equal(handoff.targetBlock.blockId, "P02-B04");
    assert.equal(handoff.targetBlock.entryAtom, "P02-B04-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.visionerSynthesisCategories.length, VISIONER_SYNTHESIS_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.visionerSynthesisRecordRequired, true);
  });

  it("validateVisionerSynthesisBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP02B03ToB04Handoff();
    const coverage = summarizeVisionerSynthesisContractCoverage();

    const ok = validateVisionerSynthesisBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateVisionerSynthesisBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runVisionerSynthesisBlockGate seals P02-B03 and prepares B04 handoff", () => {
    const result = runVisionerSynthesisBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P02-B03");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P02-B04"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P02-B04-A01");
  });

  it("buildVisionerSynthesisBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeVisionerSynthesisContractCoverage();
    const seals = [
      { atomId: "P02-B03-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildVisionerSynthesisBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeVisionerSynthesisBlockGate emits visioner_synthesis_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-vsyn-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-synthesis" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerSynthesisBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_synthesis_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P02-B04"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runVisionerSynthesisBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
