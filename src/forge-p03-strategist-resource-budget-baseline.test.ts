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
  validateStrategistResourceBudgetProbeMatrix,
  validateStrategistResourceBudgetBoundaryProbeMatrix,
  validateStrategistResourceBudgetFailureRecoveryProbeMatrix,
  listStrategistResourceBudgetFailureRecoveryProbeIds,
  getActiveStrategistResourceBudgetContract,
  listStrategistResourceBudgetContractProbesByCategory,
  STRATEGIST_RESOURCE_BUDGET_FAILURE_RECOVERY_CATEGORIES,
  assessStrategistResourceBudgetInputBoundary,
  STRATEGIST_RESOURCE_BUDGET_CATEGORIES,
  STRATEGIST_RESOURCE_BUDGET_DECOMPOSE_MAX_LENGTH,
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
