import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runIntegratedBaselineBlockGate,
  getForgeP01B10BlockGate,
  getForgeP01B10ToP02Handoff,
  validateIntegratedBaselineBlockHandoffContract,
  buildIntegratedBaselineBlockGateEvidence,
  validateForgeIntegratedBaselineBlockGate,
  summarizeIntegratedBaselineContractCoverage,
  getActiveIntegratedBaselineContract,
  INTEGRATED_BASELINE_CATEGORIES,
  EXPECTED_SEALED_BLOCK_COUNT,
} from "./forge-integrated-baseline.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Integrated Baseline Block Gate — P01-B10-A10", () => {
  it("FORGE_P01_B10_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP01B10BlockGate();
    assert.equal(gate.blockId, "P01-B10");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P01-B10-A10"));
  });

  it("FORGE_P01_B10_TO_P02_HANDOFF_V1 targets visioner intent block", () => {
    const handoff = getForgeP01B10ToP02Handoff();
    const coverage = summarizeIntegratedBaselineContractCoverage(getActiveIntegratedBaselineContract());

    assert.equal(handoff.targetBlock.blockId, "P02-B01");
    assert.equal(handoff.targetBlock.entryAtom, "P02-B01-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.integratedBaselineCategories.length, INTEGRATED_BASELINE_CATEGORIES.length);
    assert.equal(handoff.sealedArtifacts.sealedBlockCount, EXPECTED_SEALED_BLOCK_COUNT);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.integratedBaselineRecordRequired, true);
  });

  it("validateIntegratedBaselineBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP01B10ToP02Handoff();
    const coverage = summarizeIntegratedBaselineContractCoverage();

    const ok = validateIntegratedBaselineBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
      sealedBlockCount: EXPECTED_SEALED_BLOCK_COUNT,
    });
    assert.equal(ok.valid, true);

    const bad = validateIntegratedBaselineBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
      sealedBlockCount: EXPECTED_SEALED_BLOCK_COUNT,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("validateForgeIntegratedBaselineBlockGate rejects evidence with failed atom seals", () => {
    const handoff = getForgeP01B10ToP02Handoff();
    const coverage = summarizeIntegratedBaselineContractCoverage();
    const evidence = buildIntegratedBaselineBlockGateEvidence(
      [{ atomId: "P01-B10-A01", capability: "x", passed: false, detail: "fail" }],
      true,
      true,
      coverage.totalProbes,
    );

    const validation = validateForgeIntegratedBaselineBlockGate(evidence, handoff);
    assert.equal(validation.valid, false);
    assert.ok(validation.issues.some(issue => issue.includes("atom seals failed")));
  });

  it("runIntegratedBaselineBlockGate seals P01-B10 and prepares P02 handoff", () => {
    const result = runIntegratedBaselineBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P01-B10");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.evidence.sealedBlockCount, EXPECTED_SEALED_BLOCK_COUNT);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P02-B01"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P02-B01-A01");
  });

  it("buildIntegratedBaselineBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeIntegratedBaselineContractCoverage();
    const seals = [
      { atomId: "P01-B10-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildIntegratedBaselineBlockGateEvidence(
      seals,
      true,
      false,
      coverage.totalProbes,
    );

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeIntegratedBlockGate emits integrated_baseline_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-ibase-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "integrated-baseline" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeIntegratedBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "integrated_baseline_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P02-B01"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runIntegratedBaselineBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
