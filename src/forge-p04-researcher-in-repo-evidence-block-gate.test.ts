import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runResearcherInRepoEvidenceBlockGate,
  runForgeResearcherInRepoEvidenceRegressionGate,
  getForgeP04B02BlockGate,
  getForgeP04B02ToB03Handoff,
  validateResearcherInRepoEvidenceBlockHandoffContract,
  buildResearcherInRepoEvidenceBlockGateEvidence,
} from "./forge-p04-researcher-in-repo-evidence.probe.js";
import {
  summarizeResearcherInRepoEvidenceContractCoverage,
  getActiveResearcherInRepoEvidenceContract,
  RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES,
} from "./forge-p04-researcher-in-repo-evidence.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Researcher In-Repo Evidence Block Gate — P04-B02-A10", () => {
  it("FORGE_P04_B02_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP04B02BlockGate();
    assert.equal(gate.blockId, "P04-B02");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P04-B02-A10"));
  });

  it("FORGE_P04_B02_TO_B03_HANDOFF_V1 targets web and primary-source research block", () => {
    const handoff = getForgeP04B02ToB03Handoff();
    const coverage = summarizeResearcherInRepoEvidenceContractCoverage(
      getActiveResearcherInRepoEvidenceContract(),
    );

    assert.equal(handoff.targetBlock.blockId, "P04-B03");
    assert.equal(handoff.targetBlock.entryAtom, "P04-B03-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(
      handoff.sealedArtifacts.inRepoEvidenceCategories.length,
      RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES.length,
    );
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.inRepoEvidenceRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceBlockGateAtom, "P04-B01-A10");
  });

  it("validateResearcherInRepoEvidenceBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP04B02ToB03Handoff();
    const coverage = summarizeResearcherInRepoEvidenceContractCoverage();

    const ok = validateResearcherInRepoEvidenceBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateResearcherInRepoEvidenceBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeResearcherInRepoEvidenceRegressionGate passes with integrated guard", () => {
    const result = runForgeResearcherInRepoEvidenceRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runResearcherInRepoEvidenceBlockGate seals P04-B02 and prepares B03 handoff", () => {
    const result = runResearcherInRepoEvidenceBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P04-B02");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P04-B03"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P04-B03-A01");
  });

  it("buildResearcherInRepoEvidenceBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeResearcherInRepoEvidenceContractCoverage();
    const seals = [{ atomId: "P04-B02-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildResearcherInRepoEvidenceBlockGateEvidence(
      seals,
      true,
      false,
      coverage.totalProbes,
    );

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeResearcherInRepoEvidenceBlockGate emits researcher_in_repo_evidence_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-riev-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "researcher-in-repo-evidence" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeResearcherInRepoEvidenceBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "researcher_in_repo_evidence_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P04-B03"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runResearcherInRepoEvidenceBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
