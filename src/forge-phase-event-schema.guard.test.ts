import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runPhaseEventSchemaProbesWithRecord,
  runForgePhaseEventSchemaRegressionGate,
  loadPhaseEventSchemaFixture,
} from "./forge-phase-event-schema-harness.js";
import { Orchestrator } from "./orchestrator.js";
import type { OrchestratorEvent } from "./orchestrator.js";
import {
  buildPhaseEventSchemaAdversarialGuardScenarios,
  buildPhaseEventSchemaProbeEvidence,
  buildPhaseEventSchemaProbeTelemetry,
  buildPhaseEventSchemaProvenance,
  buildPhaseEventSchemaRunRecord,
  detectPhaseEventSchemaEvidenceSummaryMismatch,
  detectPhaseEventSchemaFalseAlignment,
  getActivePhaseEventSchemaContract,
  getForgePhaseEventSchemaGuardControls,
  listPhaseEventSchemaContractProbeIds,
  runPhaseEventSchemaAdversarialGuardChecks,
  validatePhaseEventSchemaCost,
  validatePhaseEventSchemaPerformance,
  validatePhaseEventSchemaSafety,
  validateForgePhaseEventSchemaGuard,
} from "./forge-phase-event-schema.js";

describe("Forge Phase/Event Schema Guard — P01-B04-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runPhaseEventSchemaProbesWithRecord();
    const adversarial = runPhaseEventSchemaAdversarialGuardChecks(record);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildPhaseEventSchemaProbeEvidence(
      "schema.orch_event_union_defined",
      "event_type_union",
      "PASS",
      "FAIL",
      true,
      "Orchestrator exports OrchestratorEvent discriminated union",
      "false pass claim",
      "observed",
      "2026-07-18T22:00:00.000Z",
    );
    const falsePassRecord = buildPhaseEventSchemaRunRecord(
      buildPhaseEventSchemaProvenance(
        "adv-false-pass",
        loadPhaseEventSchemaFixture(),
        getActivePhaseEventSchemaContract(),
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildPhaseEventSchemaProbeTelemetry("schema.orch_event_union_defined", "event_type_union", 0, 1)],
    );
    assert.ok(detectPhaseEventSchemaFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildPhaseEventSchemaProbeEvidence(
      "schema.orch_event_union_defined",
      "event_type_union",
      "PASS",
      "FAIL",
      false,
      "Orchestrator exports OrchestratorEvent discriminated union",
      "summary tamper",
      "observed",
      "2026-07-18T22:00:00.000Z",
    );
    const summaryRecord = buildPhaseEventSchemaRunRecord(
      buildPhaseEventSchemaProvenance(
        "adv-summary",
        loadPhaseEventSchemaFixture(),
        getActivePhaseEventSchemaContract(),
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildPhaseEventSchemaProbeTelemetry("schema.orch_event_union_defined", "event_type_union", 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectPhaseEventSchemaEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildPhaseEventSchemaAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildPhaseEventSchemaAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Phase/Event Schema Guard — P01-B04-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical phase/event schema run", () => {
    const record = runPhaseEventSchemaProbesWithRecord();
    const guard = validateForgePhaseEventSchemaGuard(record, { totalCostUsd: 0, llmCalls: 0 });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgePhaseEventSchemaGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadPhaseEventSchemaFixture();
    const contract = getActivePhaseEventSchemaContract();
    const probeIds = listPhaseEventSchemaContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.categories[
        Object.keys(contract.categories).find(cat =>
          contract.categories[cat as keyof typeof contract.categories].probes.some(p => p.id === id),
        ) as keyof typeof contract.categories
      ]!.probes.find(p => p.id === id)!;
      const category = Object.keys(contract.categories).find(cat =>
        contract.categories[cat as keyof typeof contract.categories].probes.some(p => p.id === id),
      )! as import("./forge-phase-event-schema.js").PhaseEventSchemaCategory;
      return buildPhaseEventSchemaProbeEvidence(
        id,
        category,
        probe.expected,
        probe.expected,
        true,
        probe.criterion,
        "ok",
        probe.disposition,
      );
    });
    const telemetry = probeIds.map((id, index) => {
      const category = Object.keys(contract.categories).find(cat =>
        contract.categories[cat as keyof typeof contract.categories].probes.some(p => p.id === id),
      )! as import("./forge-phase-event-schema.js").PhaseEventSchemaCategory;
      return buildPhaseEventSchemaProbeTelemetry(id, category, index, 10_000);
    });
    const record = buildPhaseEventSchemaRunRecord(
      buildPhaseEventSchemaProvenance(
        "perf-test",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        probeIds.length,
      ),
      evidence,
      telemetry,
    );

    const perfIssues = validatePhaseEventSchemaPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validatePhaseEventSchemaCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadPhaseEventSchemaFixture();
    const contract = getActivePhaseEventSchemaContract();
    const evidence = buildPhaseEventSchemaProbeEvidence(
      "schema.orch_event_union_defined",
      "event_type_union",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildPhaseEventSchemaRunRecord(
      buildPhaseEventSchemaProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-18T22:00:00.000Z",
        "2026-07-18T22:00:01.000Z",
        1,
      ),
      [evidence],
      [buildPhaseEventSchemaProbeTelemetry("schema.orch_event_union_defined", "event_type_union", 0, 1)],
    );

    const safetyIssues = validatePhaseEventSchemaSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Phase/Event Schema Guard — P01-B04-A09 integration", () => {
  it("runForgePhaseEventSchemaRegressionGate includes guard PASS in detail", () => {
    const result = runForgePhaseEventSchemaRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
  });

  it("orchestrator verifyForgePhaseEventSchemaGuard emits phase_event_schema_guard verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "forge-phase-event-schema-guard-orch-"));
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

    const result = await orchestrator.verifyForgePhaseEventSchemaGuard();
    const verification = events.find(
      event => event.type === "verification" && event.phase === "phase_event_schema_guard",
    );

    assert.equal(result.guard.passed, true);
    assert.ok(verification);
    if (verification?.type === "verification") {
      assert.equal(verification.passed, true);
      assert.ok(verification.detail.includes("guard PASS"));
    }
  });
});
