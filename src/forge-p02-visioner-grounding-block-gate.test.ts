import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runVisionerGroundingBlockGate,
  getForgeP02B04BlockGate,
  getForgeP02B04ToB05Handoff,
  validateVisionerGroundingBlockHandoffContract,
  buildVisionerGroundingBlockGateEvidence,
  summarizeVisionerGroundingContractCoverage,
  getActiveVisionerGroundingContract,
  VISIONER_GROUNDING_CATEGORIES,
} from "./forge-p02-visioner-grounding.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Visioner Grounding Block Gate — P02-B04-A10", () => {
  it("FORGE_P02_B04_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP02B04BlockGate();
    assert.equal(gate.blockId, "P02-B04");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P02-B04-A10"));
  });

  it("FORGE_P02_B04_TO_B05_HANDOFF_V1 targets research trigger block", () => {
    const handoff = getForgeP02B04ToB05Handoff();
    const coverage = summarizeVisionerGroundingContractCoverage(getActiveVisionerGroundingContract());

    assert.equal(handoff.targetBlock.blockId, "P02-B05");
    assert.equal(handoff.targetBlock.entryAtom, "P02-B05-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.visionerGroundingCategories.length, VISIONER_GROUNDING_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.visionerGroundingRecordRequired, true);
  });

  it("validateVisionerGroundingBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP02B04ToB05Handoff();
    const coverage = summarizeVisionerGroundingContractCoverage();

    const ok = validateVisionerGroundingBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateVisionerGroundingBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runVisionerGroundingBlockGate seals P02-B04 and prepares B05 handoff", () => {
    const result = runVisionerGroundingBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P02-B04");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P02-B05"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P02-B05-A01");
  });

  it("buildVisionerGroundingBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeVisionerGroundingContractCoverage();
    const seals = [
      { atomId: "P02-B04-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildVisionerGroundingBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeVisionerGroundingBlockGate emits visioner_grounding_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-vgrd-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-grounding" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerGroundingBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_grounding_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P02-B05"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runVisionerGroundingBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
