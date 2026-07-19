import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistResourceBudgetBaseline,
  runStrategistResourceBudgetProbes,
  validateStrategistResourceBudgetBaseline,
  summarizeStrategistResourceBudgetMatrix,
  listStrategistResourceBudgetProbesByExpected,
  listStrategistResourceBudgetKnownGaps,
  recoverStrategistResourceBudget,
  validateStrategistResourceBudget,
  runStrategistResourceBudgetProductionSlice,
  runStrategistResourceBudgetBoundarySlice,
  runStrategistResourceBudgetFailureRecoverySlice,
  runStrategistResourceBudgetFailureRecoverySliceWithRecord,
  runStrategistResourceBudgetEvidenceSlice,
  runStrategistResourceBudgetProbesWithRecord,
  buildStrategistResourceBudgetProbeEvidence,
  buildStrategistResourceBudgetProbeTelemetry,
  buildStrategistResourceBudgetProvenance,
  buildStrategistResourceBudgetRunRecord,
  validateStrategistResourceBudgetFailureRecoveryRunRecord,
  validateStrategistResourceBudgetRunRecord,
  FORGE_STRATEGIST_RESOURCE_BUDGET_VERSION,
  FORGE_STRATEGIST_RESOURCE_BUDGET_CONTRACT_V1,
  validateStrategistResourceBudgetProbeMatrix,
  validateStrategistResourceBudgetBoundaryProbeMatrix,
  validateStrategistResourceBudgetFailureRecoveryProbeMatrix,
  listStrategistResourceBudgetFailureRecoveryProbeIds,
  getActiveStrategistResourceBudgetContract,
  listStrategistResourceBudgetContractProbesByCategory,
  listStrategistResourceBudgetContractProbeIds,
  STRATEGIST_RESOURCE_BUDGET_FAILURE_RECOVERY_CATEGORIES,
  assessStrategistResourceBudgetInputBoundary,
  STRATEGIST_RESOURCE_BUDGET_CATEGORIES,
  STRATEGIST_RESOURCE_BUDGET_DECOMPOSE_MAX_LENGTH,
  runStrategistResourceBudgetPropertyChecks,
  runStrategistResourceBudgetFuzzValidation,
  runStrategistResourceBudgetRunRecordFuzzValidation,
  runStrategistResourceBudgetPropertyFuzzSlice,
  runStrategistResourceBudgetForgeRegression,
  detectStrategistResourceBudgetProbeRegression,
  runStrategistResourceBudgetProbeRegression,
  validateStrategistResourceBudgetProbeRegression,
  applyStrategistResourceBudgetRunRecordFuzzMutation,
  createStrategistResourceBudgetFuzzRng,
  buildStrategistResourceBudgetAdversarialGuardScenarios,
  runStrategistResourceBudgetAdversarialGuardChecks,
  validateForgeStrategistResourceBudgetGuard,
  validateStrategistResourceBudgetPerformance,
  validateStrategistResourceBudgetCost,
  validateStrategistResourceBudgetSafety,
  detectStrategistResourceBudgetFalseAlignment,
  detectStrategistResourceBudgetEvidenceSummaryMismatch,
  getForgeStrategistResourceBudgetGuardControls,
  runForgeStrategistResourceBudgetRegressionGate,
} from "./forge-p03-strategist-resource-budget.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Strategist Resource Budget — P03-B06-A01", () => {
  it("loads versioned resource budget baseline aligned with P03-B05 block gate handoff", () => {
    const fixture = loadStrategistResourceBudgetBaseline();
    const validation = validateStrategistResourceBudgetBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P03-B06-A01");
    assert.equal(fixture.contractAtom, "P03-B06-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P03-B05-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.riskReversibilityProbeCount, 27);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 27);
  });

  it("measures resource budget probes with documented FAIL gaps from B05 sealed handoff", () => {
    const results = runStrategistResourceBudgetProbes();
    const summary = summarizeStrategistResourceBudgetMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 27);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listStrategistResourceBudgetProbesByExpected(
      "FAIL",
      loadStrategistResourceBudgetBaseline(),
    );
    assert.equal(documentedFail.length, 4);
    assert.ok(documentedFail.some(p => p.id === "sbudget.orchestrator_pre_exec_budget_gate"));
    assert.ok(documentedFail.some(p => p.id === "sbudget.exported_orchestrator_budget_validator"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of STRATEGIST_RESOURCE_BUDGET_CATEGORIES) {
      assert.ok(summary.byCategory[cat], `missing category summary: ${cat}`);
      assert.ok(summary.byCategory[cat].total > 0, `${cat} has no probes`);
    }

    const passMismatches = results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(
      passMismatches.length,
      0,
      formatMismatchReport(passMismatches),
    );
  });

  it("documents resource budget gaps as measurable baseline debt", () => {
    const gaps = listStrategistResourceBudgetKnownGaps(runStrategistResourceBudgetProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "sbudget.exported_orchestrator_budget_validator",
      "sbudget.nogo_budget_recovery_halt",
      "sbudget.orchestrator_pre_exec_budget_gate",
      "sbudget.prompt_atom_resource_estimate",
    ]);
    assert.ok(
      gaps.every(g => STRATEGIST_RESOURCE_BUDGET_CATEGORIES.includes(g.category)),
      "documented gaps are resource budget probes",
    );
  });
});

describe("Forge Strategist Resource Budget Production Slice — P03-B06-A03", () => {
  it("recoverStrategistResourceBudget restructures malformed decompose into resource-budget plan", () => {
    const malformed = `REASONING: Need resource-aware decomposition
Here are the steps:
Block 1: Setup resource budget baseline types
Block 2: Wire token budget seam
Block 3: Add resource budget tests
DEPENDENCIES: 2→1, 3→1,2
CONFIDENCE: 0.8`;
    const recovery = recoverStrategistResourceBudget(malformed);

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.resourceBudgetCompliant, true);
    assert.ok(recovery.blockCount >= 3);
    assert.match(recovery.composedDecompose, /RESOURCE PLAN:/i);
    assert.match(recovery.composedDecompose, /TOKEN BUDGET:/i);
    assert.ok(recovery.blocks.some(block => block.includes("resource budget baseline types")));
    assert.ok(recovery.blocks.some(block => block.includes("token budget seam")));
    assert.ok(recovery.blocks.some(block => block.includes("resource budget tests")));
  });

  it("recoverStrategistResourceBudget rejects null-byte decompose output safely", () => {
    const recovery = recoverStrategistResourceBudget("decompose\0output");
    assert.equal(recovery.recovered, false);
    assert.equal(recovery.resourceBudgetCompliant, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_decompose"]);
  });

  it("recoverStrategistResourceBudget injects resource plan when strategist omits RESOURCE PLAN and TOKEN BUDGET", () => {
    const missingResourcePlan = `REASONING: Blocks without explicit resource metadata
OUTPUT:
Block 1: Root resource baseline block
Block 2: Wire token budget seam
Block 3: Final budget integration
DEPENDENCIES: none
CONFIDENCE: 0.75`;
    const recovery = recoverStrategistResourceBudget(missingResourcePlan);

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.resourceBudgetCompliant, true);
    assert.equal(recovery.hasResourcePlan, true);
    assert.equal(recovery.hasTokenBudget, true);
    assert.ok(recovery.parseErrors.includes("resource_plan_injected"));
    assert.ok(recovery.parseErrors.includes("token_budget_injected"));
  });

  it("validateStrategistResourceBudget accepts decompose with resource plan and token budget", () => {
    const valid = `REASONING: Resource-aware plan
OUTPUT:
Block 1: Setup types
DEPENDENCIES: none
RESOURCE PLAN: Block 1 lightweight
TOKEN BUDGET: perThought=4096
CONFIDENCE: 0.9`;
    const validation = validateStrategistResourceBudget(valid);
    assert.equal(validation.valid, true);
    assert.equal(validation.hasResourcePlan, true);
    assert.equal(validation.hasTokenBudget, true);
    assert.equal(validation.blockCount, 1);
  });

  it("executes contract-wired probes with zero unexpected mismatches after recovery slice", () => {
    const contract = getActiveStrategistResourceBudgetContract();
    const slice = runStrategistResourceBudgetProductionSlice();

    assert.equal(slice.atom, "P03-B06-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 27);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 23);
    assert.equal(slice.matrixValidation.gapAligned, 4);
    assert.equal(slice.summary.knownGaps.length, 4);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const flippedGaps = slice.results.filter(
      r =>
        (r.id === "sbudget.prompt_decompose_resource_plan" ||
          r.id === "sbudget.parser_resource_plan_fields") &&
        r.expected === "PASS" &&
        r.actual === "PASS",
    );
    assert.equal(flippedGaps.length, 2, "A03 closes prompt and parser resource budget gaps");

    const matrixValidation = validateStrategistResourceBudgetProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("assessStrategistResourceBudgetInputBoundary handles decompose edge cases", () => {
    const empty = assessStrategistResourceBudgetInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistResourceBudgetInputBoundary("   \t\n  ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessStrategistResourceBudgetInputBoundary("bad\0decompose");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);
  });
});

describe("Forge Strategist Resource Budget Boundary Slice — P03-B06-A04", () => {
  it("assessStrategistResourceBudgetInputBoundary handles decompose edge cases including truncation", () => {
    const empty = assessStrategistResourceBudgetInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistResourceBudgetInputBoundary("   \t\n  ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessStrategistResourceBudgetInputBoundary("bad\0decompose");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const valid = assessStrategistResourceBudgetInputBoundary(
      "REASONING: valid\nOUTPUT:\nBlock 1: task\nDEPENDENCIES: none\nRESOURCE PLAN: lightweight\nTOKEN BUDGET: perThought=4096\nCONFIDENCE: 0.8",
    );
    assert.equal(valid.disposition, "valid");
    assert.equal(valid.acceptable, true);

    const longDecompose = "x".repeat(STRATEGIST_RESOURCE_BUDGET_DECOMPOSE_MAX_LENGTH + 500);
    const truncated = assessStrategistResourceBudgetInputBoundary(longDecompose);
    assert.equal(truncated.disposition, "exceeds_max_length");
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedDecompose.length, STRATEGIST_RESOURCE_BUDGET_DECOMPOSE_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("recoverStrategistResourceBudget rejects empty and whitespace-only decompose at boundary", () => {
    const emptyRecovery = recoverStrategistResourceBudget("");
    assert.equal(emptyRecovery.recovered, false);
    assert.equal(emptyRecovery.resourceBudgetCompliant, false);
    assert.deepEqual(emptyRecovery.parseErrors, ["empty_decompose"]);

    const whitespaceRecovery = recoverStrategistResourceBudget("   \t\n  ");
    assert.equal(whitespaceRecovery.recovered, false);
    assert.equal(whitespaceRecovery.resourceBudgetCompliant, false);
    assert.deepEqual(whitespaceRecovery.parseErrors, ["whitespace_only_decompose"]);

    const emptyValidation = validateStrategistResourceBudget("");
    assert.equal(emptyValidation.valid, false);
    assert.ok(emptyValidation.issues.includes("empty decompose output"));
  });

  it("defines boundary category with decompose input edge-case probes", () => {
    const boundary = listStrategistResourceBudgetContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "sbudget.empty_decompose_boundary",
      "sbudget.known_gaps_documented",
      "sbudget.long_decompose_truncation_boundary",
      "sbudget.probe_runner_exported",
      "sbudget.source_block_gate_ref",
      "sbudget.whitespace_decompose_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveStrategistResourceBudgetContract();
    const slice = runStrategistResourceBudgetBoundarySlice();

    assert.equal(slice.atom, "P03-B06-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listStrategistResourceBudgetContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateStrategistResourceBudgetBoundaryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });
});

describe("Forge Strategist Resource Budget Failure/Recovery Slice — P03-B06-A05", () => {
  it("defines seven failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveStrategistResourceBudgetContract();
    const probeIds = listStrategistResourceBudgetFailureRecoveryProbeIds(contract);

    assert.equal(STRATEGIST_RESOURCE_BUDGET_FAILURE_RECOVERY_CATEGORIES.length, 3);
    assert.equal(probeIds.length, 7);
    assert.deepEqual(probeIds.sort(), [
      "sbudget.exported_orchestrator_budget_validator",
      "sbudget.invalid_version_rejected",
      "sbudget.malformed_decompose_guard",
      "sbudget.min_category_probes",
      "sbudget.nogo_budget_recovery_halt",
      "sbudget.recovery_cost_alert",
      "sbudget.recovery_rate_limit_backoff",
    ].sort());

    assert.equal(
      listStrategistResourceBudgetContractProbesByCategory("failure_path", contract).length,
      3,
    );
    assert.equal(
      listStrategistResourceBudgetContractProbesByCategory("recovery_path", contract).length,
      2,
    );
    assert.equal(
      listStrategistResourceBudgetContractProbesByCategory("nogo_path", contract).length,
      2,
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveStrategistResourceBudgetContract();
    const slice = runStrategistResourceBudgetFailureRecoverySlice();

    assert.equal(slice.atom, "P03-B06-A05");
    assert.equal(slice.failureRecoveryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 5);
    assert.equal(slice.matrixValidation.gapAligned, 2);

    for (const category of STRATEGIST_RESOURCE_BUDGET_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistResourceBudgetContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateStrategistResourceBudgetFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves NO-GO gaps while exercising failure and recovery paths", () => {
    const slice = runStrategistResourceBudgetFailureRecoverySlice();
    const probeIds = listStrategistResourceBudgetFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 7);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "sbudget.malformed_decompose_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const rateLimitBackoff = slice.failureRecoveryResults.find(
      r => r.id === "sbudget.recovery_rate_limit_backoff",
    );
    assert.ok(rateLimitBackoff);
    assert.equal(rateLimitBackoff!.expected, "PASS");
    assert.equal(rateLimitBackoff!.actual, "PASS");

    const costAlert = slice.failureRecoveryResults.find(r => r.id === "sbudget.recovery_cost_alert");
    assert.ok(costAlert);
    assert.equal(costAlert!.expected, "PASS");
    assert.equal(costAlert!.actual, "PASS");

    const nogoHalt = slice.failureRecoveryResults.find(
      r => r.id === "sbudget.nogo_budget_recovery_halt",
    );
    assert.ok(nogoHalt);
    assert.equal(nogoHalt!.expected, "FAIL");
    assert.equal(nogoHalt!.actual, "FAIL");
    assert.equal(nogoHalt!.aligned, true);

    const budgetValidator = slice.failureRecoveryResults.find(
      r => r.id === "sbudget.exported_orchestrator_budget_validator",
    );
    assert.ok(budgetValidator);
    assert.equal(budgetValidator!.expected, "FAIL");
    assert.equal(budgetValidator!.actual, "FAIL");
    assert.equal(budgetValidator!.aligned, true);
  });
});

describe("Forge Strategist Resource Budget Evidence — P03-B06-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadStrategistResourceBudgetBaseline();
    const contract = getActiveStrategistResourceBudgetContract();
    const probeIds = listStrategistResourceBudgetFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildStrategistResourceBudgetProbeEvidence(
        probeId,
        contractProbe.category,
        contractProbe.expected,
        contractProbe.expected,
        true,
        contractProbe.criterion,
        "synthetic",
        contractProbe.disposition,
        startedAt,
      );
    });

    const telemetry = probeIds.map((probeId, index) => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildStrategistResourceBudgetProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildStrategistResourceBudgetProvenance(
      "run-sbudget-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P03-B06-A06",
        sliceCategories: STRATEGIST_RESOURCE_BUDGET_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildStrategistResourceBudgetRunRecord(provenance, evidence, telemetry);
    const validation = validateStrategistResourceBudgetFailureRecoveryRunRecord(record, contract);

    assert.equal(record.summary.total, 7);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 3);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBlockGateAtom, fixture.sourceBlockGate.atom);
  });

  it("executes evidence slice with zero unexpected mismatches and valid run record", () => {
    const contract = getActiveStrategistResourceBudgetContract();
    const slice = runStrategistResourceBudgetEvidenceSlice();

    assert.equal(slice.atom, "P03-B06-A06");
    assert.equal(slice.evidenceProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 5);
    assert.equal(slice.matrixValidation.gapAligned, 2);
    assert.equal(
      slice.recordValidation.valid,
      true,
      slice.recordValidation.issues.map(i => i.detail).join("\n"),
    );

    for (const category of STRATEGIST_RESOURCE_BUDGET_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistResourceBudgetContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.evidenceResults.find(r => r.id === probe.id);
        assert.ok(result, `missing evidence result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const record = slice.record;
    assert.equal(record.evidence.length, 7);
    assert.equal(record.telemetry.length, 7);
    assert.equal(record.provenance.totalProbes, 7);
    assert.equal(record.provenance.sliceAtom, "P03-B06-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_STRATEGIST_RESOURCE_BUDGET_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a07");
    assert.equal(record.summary.mismatches, 0);

    for (const item of record.telemetry) {
      assert.ok(item.durationMs >= 0, `${item.probeId} negative duration`);
      assert.ok(Number.isFinite(item.sequenceIndex));
    }

    for (const item of record.evidence) {
      const contractProbe = contract.probes.find(p => p.id === item.probeId)!;
      assert.ok(item.criterion.length > 0, `${item.probeId} missing criterion in evidence`);
      assert.equal(item.criterion, contractProbe.criterion);
      assert.equal(item.disposition, contractProbe.disposition);
      assert.ok(item.recordedAt.length > 10);
    }

    const recoveryProbe = record.evidence.find(
      e => e.probeId === "sbudget.recovery_rate_limit_backoff",
    );
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.disposition, "recovery");
  });

  it("records evidence, telemetry and provenance for full resource budget run", () => {
    const contract = getActiveStrategistResourceBudgetContract();
    const record = runStrategistResourceBudgetProbesWithRecord();
    const validation = validateStrategistResourceBudgetRunRecord(record, contract);

    assert.equal(record.evidence.length, 27);
    assert.equal(record.telemetry.length, 27);
    assert.equal(record.provenance.totalProbes, 27);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a07");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 27);
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveStrategistResourceBudgetContract();
    const record = runStrategistResourceBudgetFailureRecoverySliceWithRecord();
    const validation = validateStrategistResourceBudgetFailureRecoveryRunRecord(record, contract);

    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.aligned, 7);
  });
});

describe("Forge Strategist Resource Budget Property/Fuzz — P03-B06-A07", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runStrategistResourceBudgetPropertyChecks(FORGE_STRATEGIST_RESOURCE_BUDGET_CONTRACT_V1);
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createStrategistResourceBudgetFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createStrategistResourceBudgetFuzzRng(1337);
    const rngB = createStrategistResourceBudgetFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => createStrategistResourceBudgetFuzzRng(1338)()));
  });

  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadStrategistResourceBudgetBaseline();
    const contract = getActiveStrategistResourceBudgetContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runStrategistResourceBudgetFuzzValidation(fixture, contract, seed, 24);
      assert.equal(fuzz.iterations, 24);
      assert.equal(fuzz.rejected, 24, `seed=${seed} accepted=${fuzz.accepted}`);
      assert.equal(fuzz.allMutationsRejected, true);
      for (const item of fuzz.cases) {
        assert.equal(item.valid, false, `${item.mutation.kind}@${item.mutation.probeId} should fail`);
        assert.ok(item.issueKinds.length > 0);
      }
    }
  });

  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveStrategistResourceBudgetContract();
    const record = runStrategistResourceBudgetFailureRecoverySliceWithRecord();

    assert.equal(
      validateStrategistResourceBudgetFailureRecoveryRunRecord(record, contract).valid,
      true,
      validateStrategistResourceBudgetFailureRecoveryRunRecord(record, contract).issues.map(i => i.detail).join("\n"),
    );

    const fuzz = runStrategistResourceBudgetRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("validates full contract run record and rejects tampered evidence/telemetry/provenance", () => {
    const contract = getActiveStrategistResourceBudgetContract();
    const fixture = loadStrategistResourceBudgetBaseline();
    const probeIds = listStrategistResourceBudgetContractProbeIds(contract);
    const startedAt = "2026-07-19T02:00:00.000Z";
    const completedAt = "2026-07-19T02:00:01.000Z";

    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistResourceBudgetProbeEvidence(
        id,
        probe.category,
        probe.expected,
        probe.expected,
        true,
        probe.criterion,
        "synthetic",
        probe.disposition,
        startedAt,
      );
    });

    const telemetry = probeIds.map((id, index) => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistResourceBudgetProbeTelemetry(id, probe.category, index, index * 0.05);
    });

    const provenance = buildStrategistResourceBudgetProvenance(
      "property-fuzz-full-run",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
    );
    const record = buildStrategistResourceBudgetRunRecord(provenance, evidence, telemetry);

    assert.equal(validateStrategistResourceBudgetRunRecord(record, contract).valid, true);

    const fuzz = runStrategistResourceBudgetRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 3);
  });

  it("executes property/fuzz slice with zero accepted mutations", () => {
    const slice = runStrategistResourceBudgetPropertyFuzzSlice();

    assert.equal(slice.atom, "P03-B06-A07");
    assert.equal(slice.propertyChecksPassed, true);
    assert.equal(slice.contractFuzzRejected, true);
    assert.equal(slice.runRecordFuzzRejected, true);
    assert.equal(slice.propertyResult.allPassed, true);
    assert.equal(slice.contractFuzz.allMutationsRejected, true);
    assert.equal(slice.contractFuzz.accepted, 0);
    assert.equal(slice.runRecordFuzz.mutationsAccepted, 0);
  });
});

describe("Forge Strategist Resource Budget Regression — P03-B06-A08", () => {
  it("runStrategistResourceBudgetForgeRegression passes on canonical resource budget matrix", () => {
    const result = runStrategistResourceBudgetForgeRegression();

    assert.equal(result.atom, "P03-B06-A08");
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 27);
    assert.equal(result.probeRegression, null);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.propertyFuzzSlice.propertyChecksPassed, true);
    assert.equal(result.propertyFuzzSlice.contractFuzzRejected, true);
    assert.equal(result.propertyFuzzSlice.runRecordFuzzRejected, true);
    assert.ok(result.detail.includes("27/27 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
  });

  it("detectStrategistResourceBudgetProbeRegression flags newly misaligned probes", () => {
    const prior = runStrategistResourceBudgetProbesWithRecord();
    const current = structuredClone(prior);
    const target = current.evidence.find(item => item.aligned);
    assert.ok(target, "expected at least one aligned probe");

    target!.aligned = false;
    target!.actual = target!.expected === "PASS" ? "FAIL" : "PASS";
    current.summary = {
      ...current.summary,
      aligned: current.summary.aligned - 1,
      mismatches: current.summary.mismatches + 1,
    };

    const report = detectStrategistResourceBudgetProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runStrategistResourceBudgetProbeRegression alias matches detect helper", () => {
    const prior = runStrategistResourceBudgetProbesWithRecord();
    const current = structuredClone(prior);
    const target = current.evidence.find(item => item.aligned);
    assert.ok(target, "expected at least one aligned probe");

    target!.aligned = false;
    target!.actual = target!.expected === "PASS" ? "FAIL" : "PASS";
    current.summary = {
      ...current.summary,
      aligned: current.summary.aligned - 1,
      mismatches: current.summary.mismatches + 1,
    };

    const detectReport = detectStrategistResourceBudgetProbeRegression(prior, current);
    const runReport = runStrategistResourceBudgetProbeRegression(prior, current);
    assert.deepEqual(runReport, detectReport);
  });

  it("validateStrategistResourceBudgetProbeRegression rejects probe drift", () => {
    const prior = runStrategistResourceBudgetProbesWithRecord();
    const current = structuredClone(prior);
    const target = current.evidence.find(item => item.aligned);
    assert.ok(target, "expected at least one aligned probe");

    target!.aligned = false;
    target!.actual = target!.expected === "PASS" ? "FAIL" : "PASS";
    current.summary = {
      ...current.summary,
      aligned: current.summary.aligned - 1,
      mismatches: current.summary.mismatches + 1,
    };

    const validation = validateStrategistResourceBudgetProbeRegression(prior, current);
    assert.equal(validation.valid, false);
    assert.equal(validation.report.hasRegression, true);
  });

  it("runStrategistResourceBudgetForgeRegression compares against prior record without false regression", () => {
    const prior = runStrategistResourceBudgetProbesWithRecord();
    const result = runStrategistResourceBudgetForgeRegression(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runStrategistResourceBudgetForgeRegression rejects tampered prior records", () => {
    const prior = runStrategistResourceBudgetProbesWithRecord();
    const tamperedPrior = applyStrategistResourceBudgetRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateStrategistResourceBudgetRunRecord(tamperedPrior).valid, false);

    const result = runStrategistResourceBudgetForgeRegression(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runStrategistResourceBudgetForgeRegression fails when probe alignment regresses", () => {
    const prior = runStrategistResourceBudgetProbesWithRecord();
    const tamperedCurrent = structuredClone(prior);
    const target = tamperedCurrent.evidence[0]!;
    target.aligned = false;
    target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
    tamperedCurrent.summary = {
      ...tamperedCurrent.summary,
      aligned: tamperedCurrent.summary.aligned - 1,
      mismatches: tamperedCurrent.summary.mismatches + 1,
    };

    const report = detectStrategistResourceBudgetProbeRegression(prior, tamperedCurrent);
    assert.equal(report.hasRegression, true);
  });
});

describe("Forge Strategist Resource Budget Guard — P03-B06-A09 adversarial", () => {
  it("rejects tampered records via adversarial scenarios", () => {
    const record = runStrategistResourceBudgetProbesWithRecord();
    const contract = getActiveStrategistResourceBudgetContract();
    const adversarial = runStrategistResourceBudgetAdversarialGuardChecks(record, contract);

    assert.equal(adversarial.total, 3);
    assert.equal(adversarial.rejected, 3, adversarial.failures.join("; "));
    assert.deepEqual(adversarial.failures, []);
  });

  it("detects false alignment and summary/evidence mismatch", () => {
    const falsePassEvidence = buildStrategistResourceBudgetProbeEvidence(
      "sbudget.version_tagged",
      "budget_versioning",
      "PASS",
      "FAIL",
      true,
      "test",
      "false pass claim",
      "observed",
      "2026-07-19T08:00:00.000Z",
    );
    const fixture = loadStrategistResourceBudgetBaseline();
    const contract = getActiveStrategistResourceBudgetContract();
    const falsePassRecord = buildStrategistResourceBudgetRunRecord(
      buildStrategistResourceBudgetProvenance(
        "adv-false-pass",
        fixture,
        contract,
        "2026-07-19T08:00:00.000Z",
        "2026-07-19T08:00:01.000Z",
        1,
      ),
      [falsePassEvidence],
      [buildStrategistResourceBudgetProbeTelemetry("sbudget.version_tagged", "budget_versioning", 0, 1)],
    );
    assert.ok(detectStrategistResourceBudgetFalseAlignment(falsePassRecord).length > 0);

    const summaryEvidence = buildStrategistResourceBudgetProbeEvidence(
      "sbudget.version_tagged",
      "budget_versioning",
      "PASS",
      "FAIL",
      false,
      "test",
      "summary tamper",
      "observed",
      "2026-07-19T08:00:00.000Z",
    );
    const summaryRecord = buildStrategistResourceBudgetRunRecord(
      buildStrategistResourceBudgetProvenance(
        "adv-summary",
        fixture,
        contract,
        "2026-07-19T08:00:00.000Z",
        "2026-07-19T08:00:01.000Z",
        1,
      ),
      [summaryEvidence],
      [buildStrategistResourceBudgetProbeTelemetry("sbudget.version_tagged", "budget_versioning", 0, 1)],
    );
    const mismatchedSummary = {
      ...summaryRecord,
      summary: { ...summaryRecord.summary, mismatches: 0, aligned: 1 },
    };
    assert.ok(detectStrategistResourceBudgetEvidenceSummaryMismatch(mismatchedSummary));
  });

  it("buildStrategistResourceBudgetAdversarialGuardScenarios cover false PASS attack vectors", () => {
    const scenarios = buildStrategistResourceBudgetAdversarialGuardScenarios();
    assert.equal(scenarios.length, 3);
    assert.ok(scenarios.some(s => s.id.includes("false_alignment")));
    assert.ok(scenarios.some(s => s.id.includes("summary_mismatch")));
    assert.ok(scenarios.some(s => s.id.includes("dropped_probe")));
  });
});

describe("Forge Strategist Resource Budget Guard — P03-B06-A09 performance, cost, safety", () => {
  it("passes performance and zero-cost guard on canonical resource budget run", () => {
    const record = runStrategistResourceBudgetProbesWithRecord();
    const contract = getActiveStrategistResourceBudgetContract();
    const guard = validateForgeStrategistResourceBudgetGuard(record, {
      totalCostUsd: 0,
      llmCalls: 0,
      contract,
    });

    assert.equal(guard.passed, true, guard.issues.map(i => i.detail).join("; "));
    assert.ok(guard.metrics.suiteDurationMs >= 0);
    assert.ok(
      guard.metrics.maxProbeDurationMs <
        getForgeStrategistResourceBudgetGuardControls().performance.maxProbeDurationMs,
    );
    assert.equal(guard.metrics.totalCostUsd, 0);
    assert.equal(guard.metrics.llmCalls, 0);
    assert.equal(guard.metrics.adversarialScenariosRejected, 3);
  });

  it("flags cost and performance budget violations", () => {
    const fixture = loadStrategistResourceBudgetBaseline();
    const contract = getActiveStrategistResourceBudgetContract();
    const probeIds = listStrategistResourceBudgetContractProbeIds(contract);
    const evidence = probeIds.map(id => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistResourceBudgetProbeEvidence(
        id,
        probe.category,
        probe.expected,
        probe.expected,
        true,
        probe.criterion,
        "ok",
        probe.disposition,
      );
    });
    const telemetry = probeIds.map((id, index) => {
      const probe = contract.probes.find(p => p.id === id)!;
      return buildStrategistResourceBudgetProbeTelemetry(id, probe.category, index, 10_000);
    });
    const record = buildStrategistResourceBudgetRunRecord(
      buildStrategistResourceBudgetProvenance(
        "perf-test",
        fixture,
        contract,
        "2026-07-19T08:00:00.000Z",
        "2026-07-19T08:00:01.000Z",
        probeIds.length,
      ),
      evidence,
      telemetry,
    );

    const perfIssues = validateStrategistResourceBudgetPerformance(record);
    assert.ok(perfIssues.some(i => i.domain === "performance"));

    const costIssues = validateStrategistResourceBudgetCost(0.05, 2);
    assert.ok(costIssues.some(i => i.domain === "cost"));
  });

  it("flags forbidden secret patterns in evidence detail", () => {
    const fixture = loadStrategistResourceBudgetBaseline();
    const contract = getActiveStrategistResourceBudgetContract();
    const evidence = buildStrategistResourceBudgetProbeEvidence(
      "sbudget.version_tagged",
      "budget_versioning",
      "PASS",
      "PASS",
      true,
      "ok",
      "leaked sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "observed",
    );
    const record = buildStrategistResourceBudgetRunRecord(
      buildStrategistResourceBudgetProvenance(
        "safety-test",
        fixture,
        contract,
        "2026-07-19T08:00:00.000Z",
        "2026-07-19T08:00:01.000Z",
        1,
      ),
      [evidence],
      [buildStrategistResourceBudgetProbeTelemetry("sbudget.version_tagged", "budget_versioning", 0, 1)],
    );

    const safetyIssues = validateStrategistResourceBudgetSafety(record);
    assert.ok(safetyIssues.some(i => i.code === "forbidden_pattern"));
  });
});

describe("Forge Strategist Resource Budget Guard — P03-B06-A09 integration", () => {
  it("runForgeStrategistResourceBudgetRegressionGate includes guard PASS in detail", () => {
    const result = runForgeStrategistResourceBudgetRegressionGate();
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });
});
