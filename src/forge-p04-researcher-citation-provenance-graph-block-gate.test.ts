import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runResearcherCitationProvenanceGraphBlockGate,
  runForgeResearcherCitationProvenanceGraphRegressionGate,
  getForgeP04B05BlockGate,
  getForgeP04B05ToB06Handoff,
  validateResearcherCitationProvenanceGraphBlockHandoffContract,
  buildResearcherCitationProvenanceGraphBlockGateEvidence,
} from "./forge-p04-researcher-citation-provenance-graph.probe.js";
import {
  summarizeResearcherCitationProvenanceGraphContractCoverage,
  getActiveResearcherCitationProvenanceGraphContract,
  RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES,
} from "./forge-p04-researcher-citation-provenance-graph.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Researcher Citation Provenance Graph Block Gate — P04-B05-A10", () => {
  it("FORGE_P04_B05_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP04B05BlockGate();
    assert.equal(gate.blockId, "P04-B05");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P04-B05-A10"));
  });

  it("FORGE_P04_B05_TO_B06_HANDOFF_V1 targets contradiction and freshness block", () => {
    const handoff = getForgeP04B05ToB06Handoff();
    const coverage = summarizeResearcherCitationProvenanceGraphContractCoverage(
      getActiveResearcherCitationProvenanceGraphContract(),
    );

    assert.equal(handoff.targetBlock.blockId, "P04-B06");
    assert.equal(handoff.targetBlock.entryAtom, "P04-B06-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.citationProvenanceGraphCategories.length,
      RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.citationProvenanceGraphRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceBlockGateAtom, "P04-B04-A10");
  });

  it("validateResearcherCitationProvenanceGraphBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP04B05ToB06Handoff();
    const coverage = summarizeResearcherCitationProvenanceGraphContractCoverage();

    const ok = validateResearcherCitationProvenanceGraphBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateResearcherCitationProvenanceGraphBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeResearcherCitationProvenanceGraphRegressionGate passes with integrated guard", () => {
    const result = runForgeResearcherCitationProvenanceGraphRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runResearcherCitationProvenanceGraphBlockGate seals P04-B05 and prepares B06 handoff", () => {
    const result = runResearcherCitationProvenanceGraphBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P04-B05");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P04-B06"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P04-B06-A01");
  });

  it("buildResearcherCitationProvenanceGraphBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeResearcherCitationProvenanceGraphContractCoverage();
    const seals = [{ atomId: "P04-B05-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildResearcherCitationProvenanceGraphBlockGateEvidence(
      seals,
      true,
      false,
      coverage.totalProbes,
    );

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeResearcherCitationProvenanceGraphBlockGate emits researcher_citation_provenance_graph_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-rcpg-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-citation-provenance-graph" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherCitationProvenanceGraphBlockGate();
    const verification = events.find(
      event =>
        event.type === "verification" &&
        event.phase === "researcher_citation_provenance_graph_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P04-B06"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runResearcherCitationProvenanceGraphBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
