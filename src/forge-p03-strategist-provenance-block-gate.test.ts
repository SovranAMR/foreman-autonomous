import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runStrategistProvenanceBlockGate,
  runForgeStrategistProvenanceRegressionGate,
  getForgeP03B09BlockGate,
  getForgeP03B09ToB10Handoff,
  validateStrategistProvenanceBlockHandoffContract,
  buildStrategistProvenanceBlockGateEvidence,
} from "./forge-p03-strategist-provenance.probe.js";
import {
  summarizeStrategistProvenanceCoverage,
  getActiveStrategistProvenanceContract,
  STRATEGIST_PROVENANCE_CATEGORIES,
} from "./forge-p03-strategist-provenance.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Strategist Provenance Block Gate — P03-B09-A10", () => {
  it("FORGE_P03_B09_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP03B09BlockGate();
    assert.equal(gate.blockId, "P03-B09");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P03-B09-A10"));
  });

  it("FORGE_P03_B09_TO_B10_HANDOFF_V1 targets strategist phase gate block", () => {
    const handoff = getForgeP03B09ToB10Handoff();
    const coverage = summarizeStrategistProvenanceCoverage(getActiveStrategistProvenanceContract());

    assert.equal(handoff.targetBlock.blockId, "P03-B10");
    assert.equal(handoff.targetBlock.entryAtom, "P03-B10-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.provenanceCategories.length, STRATEGIST_PROVENANCE_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.provenanceRecordRequired, true);
    assert.equal(handoff.sealedArtifacts.sourceBlockGateAtom, "P03-B08-A10");
  });

  it("validateStrategistProvenanceBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP03B09ToB10Handoff();
    const coverage = summarizeStrategistProvenanceCoverage();

    const ok = validateStrategistProvenanceBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateStrategistProvenanceBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgeStrategistProvenanceRegressionGate passes with integrated guard", () => {
    const result = runForgeStrategistProvenanceRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.equal(result.guard.metrics.adversarialScenariosRejected, 3);
  });

  it("runStrategistProvenanceBlockGate seals P03-B09 and prepares B10 handoff", () => {
    const result = runStrategistProvenanceBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P03-B09");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P03-B10"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P03-B10-A01");
  });

  it("buildStrategistProvenanceBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeStrategistProvenanceCoverage();
    const seals = [{ atomId: "P03-B09-A01", capability: "x", passed: true, detail: "ok" }];
    const evidence = buildStrategistProvenanceBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeStrategistProvenanceBlockGate emits strategist_provenance_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-sprov-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "strategist-provenance" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeStrategistProvenanceBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "strategist_provenance_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P03-B10"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runStrategistProvenanceBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
