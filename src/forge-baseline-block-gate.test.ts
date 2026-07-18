import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeBaselineBlockGate,
  getForgeP01B01BlockGate,
  getForgeP01B01ToB02Handoff,
  validateBlockHandoffContract,
} from "./forge-baseline-harness.js";
import {
  buildBlockGateEvidence,
  summarizeContractCoverage,
  getActiveForgeBaselineContract,
} from "./forge-baseline-contract.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Baseline Block Gate — P01-B01-A10", () => {
  it("FORGE_P01_B01_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP01B01BlockGate();
    assert.equal(gate.blockId, "P01-B01");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P01-B01-A10"));
  });

  it("FORGE_P01_B01_TO_B02_HANDOFF_V1 targets pipeline behavior map block", () => {
    const handoff = getForgeP01B01ToB02Handoff();
    const coverage = summarizeContractCoverage(getActiveForgeBaselineContract());

    assert.equal(handoff.targetBlock.blockId, "P01-B02");
    assert.equal(handoff.targetBlock.entryAtom, "P01-B02-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.pathCategories.length, 6);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
  });

  it("validateBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP01B01ToB02Handoff();
    const coverage = summarizeContractCoverage();

    const ok = validateBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeBaselineBlockGate seals P01-B01 and prepares B02 handoff", async () => {
    const result = await runForgeBaselineBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P01-B01");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P01-B02"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P01-B02-A01");
  });

  it("buildBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeContractCoverage();
    const seals = [
      { atomId: "P01-B01-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeBaselineBlockGate emits baseline_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "baseline" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeBaselineBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "baseline_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P01-B02"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runForgeBaselineBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
