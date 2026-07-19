import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgeBenchmarkEvalBlockGate,
  getForgeP01B06BlockGate,
  getForgeP01B06ToB07Handoff,
  validateBenchmarkEvalBlockHandoffContract,
  buildBenchmarkEvalBlockGateEvidence,
  summarizeBenchmarkEvalContractCoverage,
  getActiveBenchmarkEvalContract,
  BENCHMARK_EVAL_CATEGORIES,
} from "./forge-benchmark-eval-harness.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Benchmark Eval Block Gate — P01-B06-A10", () => {
  it("FORGE_P01_B06_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP01B06BlockGate();
    assert.equal(gate.blockId, "P01-B06");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P01-B06-A10"));
  });

  it("FORGE_P01_B06_TO_B07_HANDOFF_V1 targets reproducible fixture system block", () => {
    const handoff = getForgeP01B06ToB07Handoff();
    const coverage = summarizeBenchmarkEvalContractCoverage(getActiveBenchmarkEvalContract());

    assert.equal(handoff.targetBlock.blockId, "P01-B07");
    assert.equal(handoff.targetBlock.entryAtom, "P01-B07-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.benchmarkEvalCategories.length, BENCHMARK_EVAL_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.benchmarkEvalRecordRequired, true);
  });

  it("validateBenchmarkEvalBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP01B06ToB07Handoff();
    const coverage = summarizeBenchmarkEvalContractCoverage();

    const ok = validateBenchmarkEvalBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateBenchmarkEvalBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeBenchmarkEvalBlockGate seals P01-B06 and prepares B07 handoff", () => {
    const result = runForgeBenchmarkEvalBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P01-B06");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P01-B07"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P01-B07-A01");
  });

  it("buildBenchmarkEvalBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeBenchmarkEvalContractCoverage();
    const seals = [
      { atomId: "P01-B06-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildBenchmarkEvalBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeBenchmarkEvalBlockGate emits benchmark_eval_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-benchmark-eval-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "benchmark-eval" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeBenchmarkEvalBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "benchmark_eval_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P01-B07"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runForgeBenchmarkEvalBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
