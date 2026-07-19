import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runResearcherWebPrimarySourceBlockGate,
  runForgeResearcherWebPrimarySourceRegressionGate,
  getForgeP04B03BlockGate,
  getForgeP04B03ToB04Handoff,
  validateResearcherWebPrimarySourceBlockHandoffContract,
  buildResearcherWebPrimarySourceBlockGateEvidence,
} from "./forge-p04-researcher-web-primary-source.probe.js";
import {
  summarizeResearcherWebPrimarySourceContractCoverage,
  getActiveResearcherWebPrimarySourceContract,
  RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORIES,
} from "./forge-p04-researcher-web-primary-source.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Researcher Web Primary-Source Block Gate — P04-B03-A10", () => {
  it("FORGE_P04_B03_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP04B03BlockGate();
    assert.equal(gate.blockId, "P04-B03");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P04-B03-A10"));
  });

  it("FORGE_P04_B03_TO_B04_HANDOFF_V1 targets benchmark and prior-art analysis block", () => {
    const handoff = getForgeP04B03ToB04Handoff();
    const coverage = summarizeResearcherWebPrimarySourceContractCoverage(
      getActiveResearcherWebPrimarySourceContract(),
    );

    assert.equal(handoff.targetBlock.blockId, "P04-B04");
    assert.equal(handoff.targetBlock.entryAtom, "P04-B04-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.webPrimarySourceCategories.length,
      RESEARCHER_WEB_PRIMARY_SOURCE_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.webPrimarySourceRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceBlockGateAtom, "P04-B02-A10");
  });

  it("validateResearcherWebPrimarySourceBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP04B03ToB04Handoff();
    const coverage = summarizeResearcherWebPrimarySourceContractCoverage();

    const ok = validateResearcherWebPrimarySourceBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateResearcherWebPrimarySourceBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeResearcherWebPrimarySourceRegressionGate passes with integrated guard", () => {
    const result = runForgeResearcherWebPrimarySourceRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runResearcherWebPrimarySourceBlockGate seals P04-B03 and prepares B04 handoff", () => {
    const result = runResearcherWebPrimarySourceBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P04-B03");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P04-B04"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P04-B04-A01");
  });

  it("buildResearcherWebPrimarySourceBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeResearcherWebPrimarySourceContractCoverage();
    const seals = [{ atomId: "P04-B03-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildResearcherWebPrimarySourceBlockGateEvidence(
      seals,
      true,
      false,
      coverage.totalProbes,
    );

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeResearcherWebPrimarySourceBlockGate emits researcher_web_primary_source_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-wps-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-web-primary-source" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherWebPrimarySourceBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "researcher_web_primary_source_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P04-B04"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runResearcherWebPrimarySourceBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
