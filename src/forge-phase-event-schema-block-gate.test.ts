import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runForgePhaseEventSchemaBlockGate,
  getForgeP01B04BlockGate,
  getForgeP01B04ToB05Handoff,
  validatePhaseEventSchemaBlockHandoffContract,
  buildPhaseEventSchemaBlockGateEvidence,
  summarizePhaseEventSchemaContractCoverage,
  getActivePhaseEventSchemaContract,
  PHASE_EVENT_SCHEMA_CATEGORIES,
} from "./forge-phase-event-schema-harness.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Phase/Event Schema Block Gate — P01-B04-A10", () => {
  it("FORGE_P01_B04_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP01B04BlockGate();
    assert.equal(gate.blockId, "P01-B04");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P01-B04-A10"));
  });

  it("FORGE_P01_B04_TO_B05_HANDOFF_V1 targets pipeline invariant engine block", () => {
    const handoff = getForgeP01B04ToB05Handoff();
    const coverage = summarizePhaseEventSchemaContractCoverage(getActivePhaseEventSchemaContract());

    assert.equal(handoff.targetBlock.blockId, "P01-B05");
    assert.equal(handoff.targetBlock.entryAtom, "P01-B05-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.schemaCategories.length, PHASE_EVENT_SCHEMA_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.phaseEventSchemaRecordRequired, true);
  });

  it("validatePhaseEventSchemaBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP01B04ToB05Handoff();
    const coverage = summarizePhaseEventSchemaContractCoverage();

    const ok = validatePhaseEventSchemaBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validatePhaseEventSchemaBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runForgePhaseEventSchemaBlockGate seals P01-B04 and prepares B05 handoff", () => {
    const result = runForgePhaseEventSchemaBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P01-B04");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P01-B05"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P01-B05-A01");
  });

  it("buildPhaseEventSchemaBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizePhaseEventSchemaContractCoverage();
    const seals = [
      { atomId: "P01-B04-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildPhaseEventSchemaBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgePhaseEventSchemaBlockGate emits phase_event_schema_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-schema-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "phase-event-schema" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgePhaseEventSchemaBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "phase_event_schema_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P01-B05"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runForgePhaseEventSchemaBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
