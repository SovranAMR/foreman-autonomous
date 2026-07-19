import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runResearcherContradictionFreshnessBlockGate,
  runForgeResearcherContradictionFreshnessRegressionGate,
  getForgeP04B06BlockGate,
  getForgeP04B06ToB07Handoff,
  validateResearcherContradictionFreshnessBlockHandoffContract,
  buildResearcherContradictionFreshnessBlockGateEvidence,
} from "./forge-p04-researcher-contradiction-freshness.probe.js";
import {
  summarizeResearcherContradictionFreshnessContractCoverage,
  getActiveResearcherContradictionFreshnessContract,
  RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES,
} from "./forge-p04-researcher-contradiction-freshness.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Researcher Contradiction Freshness Block Gate — P04-B06-A10", () => {
  it("FORGE_P04_B06_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP04B06BlockGate();
    assert.equal(gate.blockId, "P04-B06");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P04-B06-A10"));
  });

  it("FORGE_P04_B06_TO_B07_HANDOFF_V1 targets risk and trade-off research block", () => {
    const handoff = getForgeP04B06ToB07Handoff();
    const coverage = summarizeResearcherContradictionFreshnessContractCoverage(
      getActiveResearcherContradictionFreshnessContract(),
    );

    assert.equal(handoff.targetBlock.blockId, "P04-B07");
    assert.equal(handoff.targetBlock.entryAtom, "P04-B07-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.contradictionFreshnessCategories.length,
      RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.contradictionFreshnessRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceBlockGateAtom, "P04-B05-A10");
  });

  it("validateResearcherContradictionFreshnessBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP04B06ToB07Handoff();
    const coverage = summarizeResearcherContradictionFreshnessContractCoverage();

    const ok = validateResearcherContradictionFreshnessBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateResearcherContradictionFreshnessBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeResearcherContradictionFreshnessRegressionGate passes with integrated guard", () => {
    const result = runForgeResearcherContradictionFreshnessRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runResearcherContradictionFreshnessBlockGate seals P04-B06 and prepares B07 handoff", () => {
    const result = runResearcherContradictionFreshnessBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P04-B06");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P04-B07"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P04-B07-A01");
  });

  it("buildResearcherContradictionFreshnessBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeResearcherContradictionFreshnessContractCoverage();
    const seals = [{ atomId: "P04-B06-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildResearcherContradictionFreshnessBlockGateEvidence(
      seals,
      true,
      false,
      coverage.totalProbes,
    );

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeResearcherContradictionFreshnessBlockGate emits researcher_contradiction_freshness_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rcfr-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-contradiction-freshness" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherContradictionFreshnessBlockGate();
    const verification = events.find(
      event =>
        event.type === "verification" &&
        event.phase === "researcher_contradiction_freshness_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P04-B07"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runResearcherContradictionFreshnessBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
