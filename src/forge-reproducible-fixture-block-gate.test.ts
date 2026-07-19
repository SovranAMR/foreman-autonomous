import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runReproducibleFixtureBlockGate,
  getForgeP01B07BlockGate,
  getForgeP01B07ToB08Handoff,
  validateReproducibleFixtureBlockHandoffContract,
  buildReproducibleFixtureBlockGateEvidence,
  summarizeReproducibleFixtureContractCoverage,
  getActiveReproducibleFixtureContract,
  REPRODUCIBLE_FIXTURE_CATEGORIES,
} from "./forge-reproducible-fixture.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";

describe("Forge Reproducible Fixture Block Gate — P01-B07-A10", () => {
  it("FORGE_P01_B07_BLOCK_GATE_V1 declares all ten atom seals", () => {
    const gate = getForgeP01B07BlockGate();
    assert.equal(gate.blockId, "P01-B07");
    assert.equal(gate.requiredAtomIds.length, 10);
    assert.equal(gate.checks.length, 10);
    assert.ok(gate.requiredAtomIds.includes("P01-B07-A10"));
  });

  it("FORGE_P01_B07_TO_B08_HANDOFF_V1 targets evidence and artifact schema block", () => {
    const handoff = getForgeP01B07ToB08Handoff();
    const coverage = summarizeReproducibleFixtureContractCoverage(getActiveReproducibleFixtureContract());

    assert.equal(handoff.targetBlock.blockId, "P01-B08");
    assert.equal(handoff.targetBlock.entryAtom, "P01-B08-A01");
    assert.equal(handoff.sealedArtifacts.probeCount, coverage.totalProbes);
    assert.equal(handoff.sealedArtifacts.reproducibleFixtureCategories.length, REPRODUCIBLE_FIXTURE_CATEGORIES.length);
    assert.equal(handoff.entryCriteria.requiresBlockGatePass, true);
    assert.equal(handoff.entryCriteria.reproducibleFixtureRecordRequired, true);
  });

  it("validateReproducibleFixtureBlockHandoffContract rejects stale regression or guard state", () => {
    const handoff = getForgeP01B07ToB08Handoff();
    const coverage = summarizeReproducibleFixtureContractCoverage();

    const ok = validateReproducibleFixtureBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: true,
      guardPassed: true,
    });
    assert.equal(ok.valid, true);

    const bad = validateReproducibleFixtureBlockHandoffContract(handoff, {
      probeCount: coverage.totalProbes,
      regressionPassed: false,
      guardPassed: true,
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.issues.some(issue => issue.includes("regression")));
  });

  it("runReproducibleFixtureBlockGate seals P01-B07 and prepares B08 handoff", () => {
    const result = runReproducibleFixtureBlockGate();

    assert.equal(result.passed, true, result.detail);
    assert.equal(result.evidence.blockId, "P01-B07");
    assert.equal(result.evidence.handoffValid, true);
    assert.equal(result.evidence.regressionPassed, true);
    assert.equal(result.evidence.guardPassed, true);
    assert.equal(result.atomSeals.length, 10);
    assert.ok(result.atomSeals.every(seal => seal.passed), formatSealFailures(result.atomSeals));
    assert.ok(result.detail.includes("handoff=PASS→P01-B08"));
    assert.equal(result.handoff.targetBlock.entryAtom, "P01-B08-A01");
  });

  it("buildReproducibleFixtureBlockGateEvidence marks handoff invalid when guard fails", () => {
    const coverage = summarizeReproducibleFixtureContractCoverage();
    const seals = [
      { atomId: "P01-B07-A01", capability: "x", passed: true, detail: "ok" },
    ];
    const evidence = buildReproducibleFixtureBlockGateEvidence(seals, true, false, coverage.totalProbes);

    assert.equal(evidence.handoffValid, false);
    assert.equal(evidence.guardPassed, false);
  });

  it("orchestrator verifyForgeReproducibleFixtureBlockGate emits reproducible_fixture_block_gate verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-reproducible-fixture-block-gate-orch-"));
    const engine = {
      config: { projectRoot: root },
      state: { snapshot: () => ({ projectName: "reproducible-fixture" }) },
      streaming: { on: () => {}, pipelineStart: () => {}, pipelineEnd: () => {} },
      hooks: {
        register: () => () => {},
        run: async () => ({ block: false }),
      },
    } as Parameters<typeof Orchestrator>[0];

    const orchestrator = new Orchestrator(engine);
    const events: OrchestratorEvent[] = [];
    orchestrator.on(event => events.push(event));

    const result = await orchestrator.verifyForgeReproducibleFixtureBlockGate();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "reproducible_fixture_block_gate",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("handoff=PASS→P01-B08"));
    }
  });
});

function formatSealFailures(
  seals: Awaited<ReturnType<typeof runReproducibleFixtureBlockGate>>["atomSeals"],
): string {
  return seals
    .filter(seal => !seal.passed)
    .map(seal => `${seal.atomId}: ${seal.detail}`)
    .join("\n");
}
