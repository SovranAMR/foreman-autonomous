import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runEvidenceArtifactProbesWithRecord,
  runForgeEvidenceArtifactRegressionGate,
  loadEvidenceArtifactBaseline,
} from "./forge-evidence-artifact.probe.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildEvidenceArtifactAdversarialGuardScenarios,
  buildEvidenceArtifactProbeEvidence,
  buildEvidenceArtifactProbeTelemetry,
  buildEvidenceArtifactProvenance,
  buildEvidenceArtifactRunRecord,
  detectEvidenceArtifactEvidenceSummaryMismatch,
  detectEvidenceArtifactFalseAlignment,
  getActiveEvidenceArtifactContract,
  getForgeEvidenceArtifactGuardControls,
  listEvidenceArtifactContractProbeIds,
  runEvidenceArtifactAdversarialGuardChecks,
  validateEvidenceArtifactCost,
  validateEvidenceArtifactPerformance,
  validateEvidenceArtifactSafety,
  validateForgeEvidenceArtifactGuard,
} from "./forge-evidence-artifact.js";

describe("Forge Evidence Artifact Guard — P01-B08-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runEvidenceArtifactProbesWithRecord();
    const adversarial = runEvidenceArtifactAdversarialGuardChecks(record);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const contract = getActiveEvidenceArtifactContract();
    const contractProbe = contract.probes.find(p => p.id === "eva.version_tagged")!;
    const falsePassEvidence = buildEvidenceArtifactProbeEvidence(
      "eva.version_tagged",
      contractProbe.category,
      "PASS",
      "FAIL",
      true,
      contractProbe.criterion,
      "synthetic false pass",
      contractProbe.disposition,
    );
    const violations = detectEvidenceArtifactFalseAlignment({
      provenance: runEvidenceArtifactProbesWithRecord().provenance,
      evidence: [falsePassEvidence],
      telemetry: [],
      summary: { total: 1, aligned: 1, mismatches: 0, byCategory: {} as never, byDisposition: {} as never },
    });
    assert.ok(violations.length > 0);

    const record = runEvidenceArtifactProbesWithRecord();
    const tampered = structuredClone(record);
    tampered.summary = { ...tampered.summary, mismatches: 0, aligned: tampered.summary.total };
    tampered.evidence[0]!.aligned = false;
    assert.ok(detectEvidenceArtifactEvidenceSummaryMismatch(tampered));
  });

  it("validates performance, cost and safety guard domains", () => {
    const controls = getForgeEvidenceArtifactGuardControls();
    const record = runEvidenceArtifactProbesWithRecord();

    assert.deepEqual(validateEvidenceArtifactPerformance(record, controls), []);
    assert.deepEqual(validateEvidenceArtifactCost(0, 0, controls), []);
    assert.deepEqual(validateEvidenceArtifactSafety(record, controls), []);
  });

  it("buildEvidenceArtifactAdversarialGuardScenarios returns three tamper scenarios", () => {
    const scenarios = buildEvidenceArtifactAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.every(s => s.expectRejected === true));
  });
});

describe("Forge Evidence Artifact Guard — P01-B08-A08 regression gate guard wiring", () => {
  it("runForgeEvidenceArtifactRegressionGate includes guard PASS in detail", () => {
    const result = runForgeEvidenceArtifactRegressionGate();

    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial="));
  });

  it("orchestrator verifyForgeEvidenceArtifactRegression emits evidence_artifact_regression verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-evidence-artifact-regression-orch-"));
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

    const result = await orchestrator.verifyForgeEvidenceArtifactRegression();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "evidence_artifact_regression",
    );

    assert.equal(result.passed, true, result.detail);
    assert.ok(verification);
    assert.equal(verification?.type, "verification");
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("25/25 probes aligned"));
    }
  });
});
