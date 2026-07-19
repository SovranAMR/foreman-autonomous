import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runResearcherResearchToWorkerHandoffBlockGate,
  runForgeResearcherResearchToWorkerHandoffRegressionGate,
  getForgeP04B09BlockGate,
  getForgeP04B09ToB10Handoff,
  validateResearcherResearchToWorkerHandoffBlockHandoffContract,
  buildResearcherResearchToWorkerHandoffBlockGateEvidence,
} from "./forge-p04-researcher-research-to-worker-handoff.probe.js";
import {
  summarizeResearcherResearchToWorkerHandoffContractCoverage,
  getActiveResearcherResearchToWorkerHandoffContract,
  RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES,
} from "./forge-p04-researcher-research-to-worker-handoff.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Researcher Research-to-Worker Handoff Block Gate — P04-B09-A10", () => {
  it("FORGE_P04_B09_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP04B09BlockGate();
    assert.equal(gate.blockId, "P04-B09");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P04-B09-A10"));
  });

  it("FORGE_P04_B09_TO_B10_HANDOFF_V1 targets researcher phase gate block", () => {
    const handoff = getForgeP04B09ToB10Handoff();
    const coverage = summarizeResearcherResearchToWorkerHandoffContractCoverage(
      getActiveResearcherResearchToWorkerHandoffContract(),
    );

    assert.equal(handoff.targetBlock.blockId, "P04-B10");
    assert.equal(handoff.targetBlock.entryAtom, "P04-B10-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.researchToWorkerHandoffCategories.length,
      RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.researchToWorkerHandoffRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceBlockGateAtom, "P04-B08-A10");
  });

  it("validateResearcherResearchToWorkerHandoffBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP04B09ToB10Handoff();
    const coverage = summarizeResearcherResearchToWorkerHandoffContractCoverage();

    const ok = validateResearcherResearchToWorkerHandoffBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateResearcherResearchToWorkerHandoffBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeResearcherResearchToWorkerHandoffRegressionGate passes with integrated guard", () => {
    const result = runForgeResearcherResearchToWorkerHandoffRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runResearcherResearchToWorkerHandoffBlockGate seals P04-B09 and prepares B10 handoff", () => {
    const result = runResearcherResearchToWorkerHandoffBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P04-B09");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P04-B10"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P04-B10-A01");
  });

  it("buildResearcherResearchToWorkerHandoffBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeResearcherResearchToWorkerHandoffContractCoverage();
    const seals = [{ atomId: "P04-B09-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildResearcherResearchToWorkerHandoffBlockGateEvidence(
      seals,
      true,
      false,
      coverage.totalProbes,
    );

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeResearcherResearchToWorkerHandoffBlockGate emits researcher_research_to_worker_handoff_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rtwh-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-research-to-worker-handoff" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherResearchToWorkerHandoffBlockGate();
    const verification = events.find(
      event =>
        event.type === "verification" &&
        event.phase === "researcher_research_to_worker_handoff_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P04-B10"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runResearcherResearchToWorkerHandoffBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
