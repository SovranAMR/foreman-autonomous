import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runVisionerApprovalBlockGate,
  getForgeP02B09BlockGate,
  getForgeP02B09ToB10Handoff,
  validateVisionerApprovalBlockHandoffContract,
  buildVisionerApprovalBlockGateEvidence,
  summarizeVisionerApprovalContractCoverage,
  getActiveVisionerApprovalContract,
} from "./forge-p02-visioner-approval.probe.js";
import { VISIONER_APPROVAL_CATEGORIES } from "./forge-p02-visioner-approval.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Visioner Approval Block Gate — P02-B09-A10", () => {
  it("FORGE_P02_B09_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP02B09BlockGate();
    assert.equal(gate.blockId, "P02-B09");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P02-B09-A10"));
  });

  it("FORGE_P02_B09_TO_B10_HANDOFF_V1 targets visioner phase gate block", () => {
    const handoff = getForgeP02B09ToB10Handoff();
    const coverage = summarizeVisionerApprovalContractCoverage(getActiveVisionerApprovalContract());

    assert.equal(handoff.targetBlock.blockId, "P02-B10");
    assert.equal(handoff.targetBlock.entryAtom, "P02-B10-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.visionerApprovalCategories.length, VISIONER_APPROVAL_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.visionerApprovalRecordRequired, true);
  });

  it("validateVisionerApprovalBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP02B09ToB10Handoff();
    const coverage = summarizeVisionerApprovalContractCoverage();

    const ok = validateVisionerApprovalBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateVisionerApprovalBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runVisionerApprovalBlockGate seals P02-B09 and prepares B10 handoff", () => {
    const result = runVisionerApprovalBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P02-B09");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P02-B10"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P02-B10-A01");
  });

  it("buildVisionerApprovalBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeVisionerApprovalContractCoverage();
    const seals = [
      { atomId: "P02-B09-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildVisionerApprovalBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeVisionerApprovalBlockGate emits visioner_approval_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-vapp-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-approval" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerApprovalBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_approval_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P02-B10"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runVisionerApprovalBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
