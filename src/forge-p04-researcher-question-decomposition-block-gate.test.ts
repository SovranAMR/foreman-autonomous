import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runResearcherQuestionDecompositionBlockGate,
  runForgeResearcherQuestionDecompositionRegressionGate,
  getForgeP04B01BlockGate,
  getForgeP04B01ToB02Handoff,
  validateResearcherQuestionDecompositionBlockHandoffContract,
  buildResearcherQuestionDecompositionBlockGateEvidence,
} from "./forge-p04-researcher-question-decomposition.probe.js";
import {
  summarizeResearcherQuestionDecompositionContractCoverage,
  getActiveResearcherQuestionDecompositionContract,
  RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES,
} from "./forge-p04-researcher-question-decomposition.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Researcher Question Decomposition Block Gate — P04-B01-A10", () => {
  it("FORGE_P04_B01_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP04B01BlockGate();
    assert.equal(gate.blockId, "P04-B01");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P04-B01-A10"));
  });

  it("FORGE_P04_B01_TO_B02_HANDOFF_V1 targets in-repo evidence collection block", () => {
    const handoff = getForgeP04B01ToB02Handoff();
    const coverage = summarizeResearcherQuestionDecompositionContractCoverage(
      getActiveResearcherQuestionDecompositionContract(),
    );

    assert.equal(handoff.targetBlock.blockId, "P04-B02");
    assert.equal(handoff.targetBlock.entryAtom, "P04-B02-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.questionDecompositionCategories.length,
      RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.questionDecompositionRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourcePhaseGateAtom, "P03-PHASE-GATE");
  });

  it("validateResearcherQuestionDecompositionBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP04B01ToB02Handoff();
    const coverage = summarizeResearcherQuestionDecompositionContractCoverage();

    const ok = validateResearcherQuestionDecompositionBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateResearcherQuestionDecompositionBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeResearcherQuestionDecompositionRegressionGate passes with integrated guard", () => {
    const result = runForgeResearcherQuestionDecompositionRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runResearcherQuestionDecompositionBlockGate seals P04-B01 and prepares B02 handoff", () => {
    const result = runResearcherQuestionDecompositionBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P04-B01");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P04-B02"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P04-B02-A01");
  });

  it("buildResearcherQuestionDecompositionBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeResearcherQuestionDecompositionContractCoverage();
    const seals = [{ atomId: "P04-B01-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildResearcherQuestionDecompositionBlockGateEvidence(
      seals,
      true,
      false,
      coverage.totalProbes,
    );

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeResearcherQuestionDecompositionBlockGate emits researcher_question_decomposition_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rques-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-question-decomposition" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherQuestionDecompositionBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "researcher_question_decomposition_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P04-B02"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runResearcherQuestionDecompositionBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
