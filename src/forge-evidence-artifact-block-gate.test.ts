import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runEvidenceArtifactBlockGate,
  getForgeP01B08BlockGate,
  getForgeP01B08ToB09Handoff,
  validateEvidenceArtifactBlockHandoffContract,
  buildEvidenceArtifactBlockGateEvidence,
  summarizeEvidenceArtifactContractCoverage,
  getActiveEvidenceArtifactContract,
  EVIDENCE_ARTIFACT_CATEGORIES,
} from "./forge-evidence-artifact.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Evidence Artifact Block Gate — P01-B08-A10", () => {
  it("FORGE_P01_B08_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP01B08BlockGate();
    assert.equal(gate.blockId, "P01-B08");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P01-B08-A10"));
  });

  it("FORGE_P01_B08_TO_B09_HANDOFF_V1 targets orchestrator seam block", () => {
    const handoff = getForgeP01B08ToB09Handoff();
    const coverage = summarizeEvidenceArtifactContractCoverage(getActiveEvidenceArtifactContract());

    assert.equal(handoff.targetBlock.blockId, "P01-B09");
    assert.equal(handoff.targetBlock.entryAtom, "P01-B09-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.evidenceArtifactCategories.length, EVIDENCE_ARTIFACT_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.evidenceArtifactRecordRequired, true);
  });

  it("validateEvidenceArtifactBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP01B08ToB09Handoff();
    const coverage = summarizeEvidenceArtifactContractCoverage();

    const ok = validateEvidenceArtifactBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateEvidenceArtifactBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runEvidenceArtifactBlockGate seals P01-B08 and prepares B09 handoff", () => {
    const result = runEvidenceArtifactBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P01-B08");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P01-B09"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P01-B09-A01");
  });

  it("buildEvidenceArtifactBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeEvidenceArtifactContractCoverage();
    const seals = [
      { atomId: "P01-B08-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildEvidenceArtifactBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeEvidenceArtifactBlockGate emits evidence_artifact_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-evidence-artifact-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "evidence-artifact" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeEvidenceArtifactBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "evidence_artifact_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P01-B09"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runEvidenceArtifactBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
