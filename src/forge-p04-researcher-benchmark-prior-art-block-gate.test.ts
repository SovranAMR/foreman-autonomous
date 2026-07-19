import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runResearcherBenchmarkPriorArtBlockGate,
  runForgeResearcherBenchmarkPriorArtRegressionGate,
  getForgeP04B04BlockGate,
  getForgeP04B04ToB05Handoff,
  validateResearcherBenchmarkPriorArtBlockHandoffContract,
  buildResearcherBenchmarkPriorArtBlockGateEvidence,
} from "./forge-p04-researcher-benchmark-prior-art.probe.js";
import {
  summarizeResearcherBenchmarkPriorArtContractCoverage,
  getActiveResearcherBenchmarkPriorArtContract,
  RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES,
} from "./forge-p04-researcher-benchmark-prior-art.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Researcher Benchmark Prior-Art Block Gate — P04-B04-A10", () => {
  it("FORGE_P04_B04_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP04B04BlockGate();
    assert.equal(gate.blockId, "P04-B04");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P04-B04-A10"));
  });

  it("FORGE_P04_B04_TO_B05_HANDOFF_V1 targets citation and provenance graph block", () => {
    const handoff = getForgeP04B04ToB05Handoff();
    const coverage = summarizeResearcherBenchmarkPriorArtContractCoverage(
      getActiveResearcherBenchmarkPriorArtContract(),
    );

    assert.equal(handoff.targetBlock.blockId, "P04-B05");
    assert.equal(handoff.targetBlock.entryAtom, "P04-B05-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.benchmarkPriorArtCategories.length,
      RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.benchmarkPriorArtRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceBlockGateAtom, "P04-B03-A10");
  });

  it("validateResearcherBenchmarkPriorArtBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP04B04ToB05Handoff();
    const coverage = summarizeResearcherBenchmarkPriorArtContractCoverage();

    const ok = validateResearcherBenchmarkPriorArtBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateResearcherBenchmarkPriorArtBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeResearcherBenchmarkPriorArtRegressionGate passes with integrated guard", () => {
    const result = runForgeResearcherBenchmarkPriorArtRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runResearcherBenchmarkPriorArtBlockGate seals P04-B04 and prepares B05 handoff", () => {
    const result = runResearcherBenchmarkPriorArtBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P04-B04");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P04-B05"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P04-B05-A01");
  });

  it("buildResearcherBenchmarkPriorArtBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeResearcherBenchmarkPriorArtContractCoverage();
    const seals = [{ atomId: "P04-B04-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildResearcherBenchmarkPriorArtBlockGateEvidence(
      seals,
      true,
      false,
      coverage.totalProbes,
    );

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeResearcherBenchmarkPriorArtBlockGate emits researcher_benchmark_prior_art_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rbpa-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-benchmark-prior-art" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherBenchmarkPriorArtBlockGate();
    const verification = events.find(
      event =>
        event.type === "verification" && event.phase === "researcher_benchmark_prior_art_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P04-B05"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runResearcherBenchmarkPriorArtBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
