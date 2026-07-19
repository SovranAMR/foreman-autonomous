import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runResearcherPhaseGateBlockGate,
  getForgeP04B10BlockGate,
  getForgeP04B10ToP05Handoff,
  validateResearcherPhaseGateBlockHandoffContract,
  buildResearcherPhaseGateBlockGateEvidence,
  summarizeResearcherPhaseGateContractCoverage,
  getActiveResearcherPhaseGateContract,
} from "./forge-p04-researcher-phase-gate.probe.js";
import {
  RESEARCHER_PHASE_GATE_CATEGORIES,
  EXPECTED_P04_RESEARCHER_PRIOR_BLOCK_GATE_COUNT,
} from "./forge-p04-researcher-phase-gate.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Researcher Phase Gate Block Gate — P04-B10-A10", () => {
  it("FORGE_P04_B10_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP04B10BlockGate();
    assert.equal(gate.blockId, "P04-B10");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P04-B10-A10"));
  });

  it("FORGE_P04_B10_TO_P05_HANDOFF_V1 targets worker phase entry", () => {
    const handoff = getForgeP04B10ToP05Handoff();
    const coverage = summarizeResearcherPhaseGateContractCoverage(getActiveResearcherPhaseGateContract());

    assert.equal(handoff.targetBlock.blockId, "P05-B01");
    assert.equal(handoff.targetBlock.entryAtom, "P05-B01-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.researcherPhaseGateCategories.length,
      RESEARCHER_PHASE_GATE_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.researcherPhaseGateRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceResearchToWorkerHandoffBlockGateAtom, "P04-B09-A10");
  });

  it("validateResearcherPhaseGateBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP04B10ToP05Handoff();
    const coverage = summarizeResearcherPhaseGateContractCoverage();

    const ok = validateResearcherPhaseGateBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
      sealedBlockCount: EXPECTED_P04_RESEARCHER_PRIOR_BLOCK_GATE_COUNT,
    });
    assert.equal(ok.valid, true);

    const bad = validateResearcherPhaseGateBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
      sealedBlockCount: EXPECTED_P04_RESEARCHER_PRIOR_BLOCK_GATE_COUNT,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runResearcherPhaseGateBlockGate seals P04-B10 and prepares P05 handoff", () => {
    const result = runResearcherPhaseGateBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P04-B10");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.evidence.sealedBlockCount, EXPECTED_P04_RESEARCHER_PRIOR_BLOCK_GATE_COUNT);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P05-B01"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P05-B01-A01");
  });

  it("buildResearcherPhaseGateBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeResearcherPhaseGateContractCoverage();
    const seals = [{ atomId: "P04-B10-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildResearcherPhaseGateBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeResearcherPhaseGateBlockGate emits researcher_phase_gate_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rpg-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-phase-gate" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherPhaseGateBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "researcher_phase_gate_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P05-B01"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runResearcherPhaseGateBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
