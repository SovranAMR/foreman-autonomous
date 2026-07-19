import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runStrategistDependencyDagBlockGate,
  runForgeStrategistDependencyDagRegressionGate,
  getForgeP03B04BlockGate,
  getForgeP03B04ToB05Handoff,
  validateStrategistDependencyDagBlockHandoffContract,
  buildStrategistDependencyDagBlockGateEvidence,
} from "./forge-p03-strategist-dependency-dag.probe.js";
import {
  summarizeStrategistDependencyDagCoverage,
  getActiveStrategistDependencyDagContract,
  STRATEGIST_DEPENDENCY_DAG_CATEGORIES,
} from "./forge-p03-strategist-dependency-dag.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Strategist Dependency DAG Block Gate — P03-B04-A10", () => {
  it("FORGE_P03_B04_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP03B04BlockGate();
    assert.equal(gate.blockId, "P03-B04");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P03-B04-A10"));
  });

  it("FORGE_P03_B04_TO_B05_HANDOFF_V1 targets risk and reversibility block", () => {
    const handoff = getForgeP03B04ToB05Handoff();
    const coverage = summarizeStrategistDependencyDagCoverage(getActiveStrategistDependencyDagContract());

    assert.equal(handoff.targetBlock.blockId, "P03-B05");
    assert.equal(handoff.targetBlock.entryAtom, "P03-B05-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.dependencyDagCategories.length,
      STRATEGIST_DEPENDENCY_DAG_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.dependencyDagRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceBlockGateAtom, "P03-B03-A10");
  });

  it("validateStrategistDependencyDagBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP03B04ToB05Handoff();
    const coverage = summarizeStrategistDependencyDagCoverage();

    const ok = validateStrategistDependencyDagBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateStrategistDependencyDagBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeStrategistDependencyDagRegressionGate passes with integrated guard", () => {
    const result = runForgeStrategistDependencyDagRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runStrategistDependencyDagBlockGate seals P03-B04 and prepares B05 handoff", () => {
    const result = runStrategistDependencyDagBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P03-B04");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P03-B05"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P03-B05-A01");
  });

  it("buildStrategistDependencyDagBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeStrategistDependencyDagCoverage();
    const seals = [{ atomId: "P03-B04-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildStrategistDependencyDagBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeStrategistDependencyDagBlockGate emits strategist_dependency_dag_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-sdag-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "strategist-dependency-dag" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeStrategistDependencyDagBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "strategist_dependency_dag_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P03-B05"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runStrategistDependencyDagBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
