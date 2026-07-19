import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runVisionerIntentBlockGate,
  getForgeP02B01BlockGate,
  getForgeP02B01ToB02Handoff,
  validateVisionerIntentBlockHandoffContract,
  buildVisionerIntentBlockGateEvidence,
  summarizeVisionerIntentContractCoverage,
  getActiveVisionerIntentContract,
  VISIONER_INTENT_CATEGORIES,
} from "./forge-p02-visioner-intent.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Visioner Intent Block Gate — P02-B01-A10", () => {
  it("FORGE_P02_B01_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP02B01BlockGate();
    assert.equal(gate.blockId, "P02-B01");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P02-B01-A10"));
  });

  it("FORGE_P02_B01_TO_B02_HANDOFF_V1 targets constraint and non-goal extraction block", () => {
    const handoff = getForgeP02B01ToB02Handoff();
    const coverage = summarizeVisionerIntentContractCoverage(getActiveVisionerIntentContract());

    assert.equal(handoff.targetBlock.blockId, "P02-B02");
    assert.equal(handoff.targetBlock.entryAtom, "P02-B02-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.visionerIntentCategories.length, VISIONER_INTENT_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.visionerIntentRecordRequired, true);
  });

  it("validateVisionerIntentBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP02B01ToB02Handoff();
    const coverage = summarizeVisionerIntentContractCoverage();

    const ok = validateVisionerIntentBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateVisionerIntentBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runVisionerIntentBlockGate seals P02-B01 and prepares B02 handoff", () => {
    const result = runVisionerIntentBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P02-B01");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P02-B02"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P02-B02-A01");
  });

  it("buildVisionerIntentBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeVisionerIntentContractCoverage();
    const seals = [
      { atomId: "P02-B01-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildVisionerIntentBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeVisionerIntentBlockGate emits visioner_intent_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-vint-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-intent" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerIntentBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_intent_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P02-B02"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runVisionerIntentBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
