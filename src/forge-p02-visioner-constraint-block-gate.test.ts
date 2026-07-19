import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runVisionerConstraintBlockGate,
  getForgeP02B02BlockGate,
  getForgeP02B02ToB03Handoff,
  validateVisionerConstraintBlockHandoffContract,
  buildVisionerConstraintBlockGateEvidence,
} from "./forge-p02-visioner-constraint.probe.js";
import {
  summarizeVisionerConstraintContractCoverage,
  getActiveVisionerConstraintContract,
  VISIONER_CONSTRAINT_CATEGORIES,
} from "./forge-p02-visioner-constraint.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Visioner Constraint Block Gate — P02-B02-A10", () => {
  it("FORGE_P02_B02_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP02B02BlockGate();
    assert.equal(gate.blockId, "P02-B02");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P02-B02-A10"));
  });

  it("FORGE_P02_B02_TO_B03_HANDOFF_V1 targets product vision synthesis block", () => {
    const handoff = getForgeP02B02ToB03Handoff();
    const coverage = summarizeVisionerConstraintContractCoverage(getActiveVisionerConstraintContract());

    assert.equal(handoff.targetBlock.blockId, "P02-B03");
    assert.equal(handoff.targetBlock.entryAtom, "P02-B03-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.visionerConstraintCategories.length, VISIONER_CONSTRAINT_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.visionerConstraintRecordRequired, true);
  });

  it("validateVisionerConstraintBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP02B02ToB03Handoff();
    const coverage = summarizeVisionerConstraintContractCoverage();

    const ok = validateVisionerConstraintBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateVisionerConstraintBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runVisionerConstraintBlockGate seals P02-B02 and prepares B03 handoff", () => {
    const result = runVisionerConstraintBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P02-B02");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P02-B03"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P02-B03-A01");
  });

  it("buildVisionerConstraintBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeVisionerConstraintContractCoverage();
    const seals = [
      { atomId: "P02-B02-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildVisionerConstraintBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeVisionerConstraintBlockGate emits visioner_constraint_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-vcon-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "visioner-constraint" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeVisionerConstraintBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "visioner_constraint_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P02-B03"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runVisionerConstraintBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
