import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runVisionerScoringBlockGate,
  getForgeP02B08BlockGate,
  getForgeP02B08ToB09Handoff,
  validateVisionerScoringBlockHandoffContract,
  buildVisionerScoringBlockGateEvidence,
  summarizeVisionerScoringContractCoverage,
  getActiveVisionerScoringContract,
} from "./forge-p02-visioner-scoring.probe.js";
import { VISIONER_SCORING_CATEGORIES } from "./forge-p02-visioner-scoring.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Visioner Scoring Block Gate — P02-B08-A10", () => {
  it("FORGE_P02_B08_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP02B08BlockGate();
    assert.equal(gate.blockId, "P02-B08");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P02-B08-A10"));
  });

  it("FORGE_P02_B08_TO_B09_HANDOFF_V1 targets user approval block", () => {
    const handoff = getForgeP02B08ToB09Handoff();
    const coverage = summarizeVisionerScoringContractCoverage(getActiveVisionerScoringContract());

    assert.equal(handoff.targetBlock.blockId, "P02-B09");
    assert.equal(handoff.targetBlock.entryAtom, "P02-B09-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.visionerScoringCategories.length, VISIONER_SCORING_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.visionerScoringRecordRequired, true);
  });

  it("validateVisionerScoringBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP02B08ToB09Handoff();
    const coverage = summarizeVisionerScoringContractCoverage();

    const ok = validateVisionerScoringBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateVisionerScoringBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runVisionerScoringBlockGate seals P02-B08 and prepares B09 handoff", () => {
    const result = runVisionerScoringBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P02-B08");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P02-B09"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P02-B09-A01");
  });

  it("buildVisionerScoringBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeVisionerScoringContractCoverage();
    const seals = [
      { atomId: "P02-B08-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildVisionerScoringBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeVisionerScoringBlockGate emits visioner_scoring_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-vsco-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-scoring" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerScoringBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_scoring_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P02-B09"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runVisionerScoringBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
