import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runVisionerUncertaintyBlockGate,
  getForgeP02B06BlockGate,
  getForgeP02B06ToB07Handoff,
  validateVisionerUncertaintyBlockHandoffContract,
  buildVisionerUncertaintyBlockGateEvidence,
  summarizeVisionerUncertaintyContractCoverage,
  getActiveVisionerUncertaintyContract,
  VISIONER_UNCERTAINTY_CATEGORIES,
} from "./forge-p02-visioner-uncertainty.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Visioner Uncertainty Block Gate — P02-B06-A10", () => {
  it("FORGE_P02_B06_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP02B06BlockGate();
    assert.equal(gate.blockId, "P02-B06");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P02-B06-A10"));
  });

  it("FORGE_P02_B06_TO_B07_HANDOFF_V1 targets alternative vision block", () => {
    const handoff = getForgeP02B06ToB07Handoff();
    const coverage = summarizeVisionerUncertaintyContractCoverage(getActiveVisionerUncertaintyContract());

    assert.equal(handoff.targetBlock.blockId, "P02-B07");
    assert.equal(handoff.targetBlock.entryAtom, "P02-B07-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.visionerUncertaintyCategories.length, VISIONER_UNCERTAINTY_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.visionerUncertaintyRecordRequired, true);
  });

  it("validateVisionerUncertaintyBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP02B06ToB07Handoff();
    const coverage = summarizeVisionerUncertaintyContractCoverage();

    const ok = validateVisionerUncertaintyBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateVisionerUncertaintyBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runVisionerUncertaintyBlockGate seals P02-B06 and prepares B07 handoff", () => {
    const result = runVisionerUncertaintyBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P02-B06");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P02-B07"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P02-B07-A01");
  });

  it("buildVisionerUncertaintyBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeVisionerUncertaintyContractCoverage();
    const seals = [
      { atomId: "P02-B06-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildVisionerUncertaintyBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeVisionerUncertaintyBlockGate emits visioner_uncertainty_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-vunc-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-uncertainty" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerUncertaintyBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_uncertainty_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P02-B07"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runVisionerUncertaintyBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
