import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runStrategistResourceBudgetBlockGate,
  runForgeStrategistResourceBudgetRegressionGate,
  getForgeP03B06BlockGate,
  getForgeP03B06ToB07Handoff,
  validateStrategistResourceBudgetBlockHandoffContract,
  buildStrategistResourceBudgetBlockGateEvidence,
} from "./forge-p03-strategist-resource-budget.probe.js";
import {
  summarizeStrategistResourceBudgetCoverage,
  getActiveStrategistResourceBudgetContract,
  STRATEGIST_RESOURCE_BUDGET_CATEGORIES,
} from "./forge-p03-strategist-resource-budget.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Strategist Resource Budget Block Gate — P03-B06-A10", () => {
  it("FORGE_P03_B06_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP03B06BlockGate();
    assert.equal(gate.blockId, "P03-B06");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P03-B06-A10"));
  });

  it("FORGE_P03_B06_TO_B07_HANDOFF_V1 targets parallel execution wave block", () => {
    const handoff = getForgeP03B06ToB07Handoff();
    const coverage = summarizeStrategistResourceBudgetCoverage(getActiveStrategistResourceBudgetContract());

    assert.equal(handoff.targetBlock.blockId, "P03-B07");
    assert.equal(handoff.targetBlock.entryAtom, "P03-B07-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.resourceBudgetCategories.length,
      STRATEGIST_RESOURCE_BUDGET_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.resourceBudgetRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceBlockGateAtom, "P03-B05-A10");
  });

  it("validateStrategistResourceBudgetBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP03B06ToB07Handoff();
    const coverage = summarizeStrategistResourceBudgetCoverage();

    const ok = validateStrategistResourceBudgetBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateStrategistResourceBudgetBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeStrategistResourceBudgetRegressionGate passes with integrated guard", () => {
    const result = runForgeStrategistResourceBudgetRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runStrategistResourceBudgetBlockGate seals P03-B06 and prepares B07 handoff", () => {
    const result = runStrategistResourceBudgetBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P03-B06");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P03-B07"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P03-B07-A01");
  });

  it("buildStrategistResourceBudgetBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeStrategistResourceBudgetCoverage();
    const seals = [{ atomId: "P03-B06-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildStrategistResourceBudgetBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeStrategistResourceBudgetBlockGate emits strategist_resource_budget_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-sbudget-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "strategist-resource-budget" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeStrategistResourceBudgetBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "strategist_resource_budget_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P03-B07"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runStrategistResourceBudgetBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
