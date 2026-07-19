import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runVisionerAlternativeBlockGate,
  getForgeP02B07BlockGate,
  getForgeP02B07ToB08Handoff,
  validateVisionerAlternativeBlockHandoffContract,
  buildVisionerAlternativeBlockGateEvidence,
  summarizeVisionerAlternativeContractCoverage,
  getActiveVisionerAlternativeContract,
} from "./forge-p02-visioner-alternative.probe.js";
import { VISIONER_ALTERNATIVE_CATEGORIES } from "./forge-p02-visioner-alternative.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Visioner Alternative Block Gate — P02-B07-A10", () => {
  it("FORGE_P02_B07_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP02B07BlockGate();
    assert.equal(gate.blockId, "P02-B07");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P02-B07-A10"));
  });

  it("FORGE_P02_B07_TO_B08_HANDOFF_V1 targets vision scoring block", () => {
    const handoff = getForgeP02B07ToB08Handoff();
    const coverage = summarizeVisionerAlternativeContractCoverage(getActiveVisionerAlternativeContract());

    assert.equal(handoff.targetBlock.blockId, "P02-B08");
    assert.equal(handoff.targetBlock.entryAtom, "P02-B08-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.visionerAlternativeCategories.length, VISIONER_ALTERNATIVE_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.visionerAlternativeRecordRequired, true);
  });

  it("validateVisionerAlternativeBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP02B07ToB08Handoff();
    const coverage = summarizeVisionerAlternativeContractCoverage();

    const ok = validateVisionerAlternativeBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateVisionerAlternativeBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runVisionerAlternativeBlockGate seals P02-B07 and prepares B08 handoff", () => {
    const result = runVisionerAlternativeBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P02-B07");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P02-B08"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P02-B08-A01");
  });

  it("buildVisionerAlternativeBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeVisionerAlternativeContractCoverage();
    const seals = [
      { atomId: "P02-B07-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildVisionerAlternativeBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeVisionerAlternativeBlockGate emits visioner_alternative_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-valt-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-alternative" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerAlternativeBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_alternative_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P02-B08"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runVisionerAlternativeBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
