import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerResearchTriggerBaseline,
  runVisionerResearchTriggerProbes,
  runVisionerResearchTriggerProductionSlice,
  runVisionerResearchTriggerBoundarySlice,
  runVisionerResearchTriggerFailureRecoverySlice,
} from "./forge-p02-visioner-research-trigger.probe.js";
import {
  assessVisionerResearchTriggerInputBoundary,
  assessVisionerResearchTriggerPresence,
  getActiveVisionerResearchTriggerContract,
  getVisionerResearchTriggerCategoryContract,
  listVisionerResearchTriggerContractProbeIds,
  listVisionerResearchTriggerContractProbesByCategory,
  listVisionerResearchTriggerProbesByDisposition,
  listVisionerResearchTriggerFailureRecoveryProbeIds,
  summarizeVisionerResearchTriggerContractCoverage,
  validateVisionerResearchTriggerAgainstContract,
  validateVisionerResearchTriggerContractCoverage,
  validateVisionerResearchTriggerProbeMatrix,
  validateVisionerResearchTriggerBoundaryProbeMatrix,
  validateVisionerResearchTriggerFailureRecoveryProbeMatrix,
  recoverVisionerResearchTrigger,
  VISIONER_RESEARCH_TRIGGER_CATEGORIES,
  VISIONER_RESEARCH_TRIGGER_FAILURE_RECOVERY_CATEGORIES,
  VISIONER_RESEARCH_TRIGGER_VISION_MAX_LENGTH,
  FORGE_VISIONER_RESEARCH_TRIGGER_VERSION,
} from "./forge-p02-visioner-research-trigger.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Visioner Research Trigger Contract — P02-B05-A02", () => {
  it("defines typed acceptance for all eight visioner research trigger categories", () => {
    const contract = getActiveVisionerResearchTriggerContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P02-B05-A06");

    for (const category of VISIONER_RESEARCH_TRIGGER_CATEGORIES) {
      const categoryContract = getVisionerResearchTriggerCategoryContract(category);
      assert.ok(categoryContract.acceptance.invariant.length > 20, `${category} invariant too short`);
      assert.ok(categoryContract.probes.length >= categoryContract.acceptance.minProbeCount);
      assert.equal(categoryContract.acceptance.requireFullAlignment, true);

      for (const probe of categoryContract.probes) {
        assert.ok(probe.criterion.length > 10, `${probe.id} missing measurable criterion`);
        assert.ok(probe.expected === "PASS" || probe.expected === "FAIL");
        assert.ok(
          probe.disposition === "observed" ||
            probe.disposition === "gap" ||
            probe.disposition === "failure" ||
            probe.disposition === "recovery" ||
            probe.disposition === "nogo",
          `${probe.id} missing disposition`,
        );
      }
    }
  });

  it("maps 23 probes with zero documented gaps after A03 recovery slice", () => {
    const contract = getActiveVisionerResearchTriggerContract();
    const summary = summarizeVisionerResearchTriggerContractCoverage(contract);
    const coverage = validateVisionerResearchTriggerContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.trigger_versioning.probeCount, 3);
    assert.equal(summary.byCategory.trigger_signal.probeCount, 3);
    assert.equal(summary.byCategory.query_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists no remaining gap probes after A03 structured research trigger recovery", () => {
    const gaps = listVisionerResearchTriggerProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadVisionerResearchTriggerBaseline();
    const contract = getActiveVisionerResearchTriggerContract();
    const validation = validateVisionerResearchTriggerAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listVisionerResearchTriggerContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each visioner research trigger probe id is globally unique", () => {
    const ids = listVisionerResearchTriggerContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runVisionerResearchTriggerProbes();
    const contract = getActiveVisionerResearchTriggerContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveVisionerResearchTriggerContract();
    const flatIds = listVisionerResearchTriggerContractProbeIds(contract);
    const categoryIds = VISIONER_RESEARCH_TRIGGER_CATEGORIES.flatMap(category =>
      listVisionerResearchTriggerContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("validates probe matrix with full alignment after A03 recovery slice", () => {
    const contract = getActiveVisionerResearchTriggerContract();
    const results = runVisionerResearchTriggerProbes();
    const matrixValidation = validateVisionerResearchTriggerProbeMatrix(results, contract);

    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
    assert.equal(matrixValidation.passAligned, 23);
    assert.equal(matrixValidation.gapAligned, 0);
    assert.equal(matrixValidation.unexpectedMismatches, 0);

    const passMismatches = results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));
  });

  it("exports A05 harness version for research trigger contract gate", () => {
    assert.equal(FORGE_VISIONER_RESEARCH_TRIGGER_VERSION, "1.0.0-a05");
  });
});

describe("Forge Visioner Research Trigger Production Slice — P02-B05-A03", () => {
  it("recoverVisionerResearchTrigger restructures malformed vision into actionable query", () => {
    const malformed = `REASONING: Need benchmark data for dental landing pages
OUTPUT: **GOAL**: Premium dental feel
CONFIDENCE: 0.85
needs_research: yes
research topic: dental landing page best practices 2026`;
    const recovery = recoverVisionerResearchTrigger(malformed);

    assert.equal(recovery.recovered, true);
    assert.match(recovery.composedVision, /NEEDS_RESEARCH: true/);
    assert.match(recovery.composedVision, /RESEARCH_QUERY: dental landing page best practices 2026/);
    assert.equal(recovery.presence.hasNeedsResearch, true);
    assert.equal(recovery.presence.needsResearch, true);
    assert.equal(recovery.presence.hasResearchQuery, true);
    assert.ok(recovery.presence.researchQuery.includes("dental landing page"));
  });

  it("recoverVisionerResearchTrigger rejects null-byte vision output safely", () => {
    const recovery = recoverVisionerResearchTrigger("vision\0output");
    assert.equal(recovery.recovered, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_vision"]);
  });

  it("executes contract-wired probes with zero unexpected mismatches after recovery slice", () => {
    const contract = getActiveVisionerResearchTriggerContract();
    const slice = runVisionerResearchTriggerProductionSlice();

    assert.equal(slice.atom, "P02-B05-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 23);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }
  });
});

describe("Forge Visioner Research Trigger Boundary Slice — P02-B05-A04", () => {
  it("assessVisionerResearchTriggerInputBoundary handles empty, whitespace-only and oversized vision output", () => {
    const empty = assessVisionerResearchTriggerInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessVisionerResearchTriggerInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessVisionerResearchTriggerInputBoundary("vision\x00output");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const longVision = "x".repeat(VISIONER_RESEARCH_TRIGGER_VISION_MAX_LENGTH + 200);
    const truncated = assessVisionerResearchTriggerInputBoundary(longVision);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedVision.length, VISIONER_RESEARCH_TRIGGER_VISION_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("assessVisionerResearchTriggerPresence returns no signals for unacceptable boundary inputs", () => {
    const presence = assessVisionerResearchTriggerPresence("   ");
    assert.equal(presence.hasNeedsResearch, false);
    assert.equal(presence.needsResearch, false);
    assert.equal(presence.hasResearchQuery, false);
    assert.equal(presence.researchQuery, "");
  });

  it("recoverVisionerResearchTrigger rejects empty and whitespace-only vision output safely", () => {
    const emptyRecovery = recoverVisionerResearchTrigger("");
    assert.equal(emptyRecovery.recovered, false);
    assert.deepEqual(emptyRecovery.parseErrors, ["empty_vision"]);

    const whitespaceRecovery = recoverVisionerResearchTrigger("   \t\n  ");
    assert.equal(whitespaceRecovery.recovered, false);
    assert.deepEqual(whitespaceRecovery.parseErrors, ["whitespace_only_vision"]);
  });

  it("defines boundary category with vision input edge-case probes", () => {
    const boundary = listVisionerResearchTriggerContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "vrtr.empty_vision_trigger_presence",
      "vrtr.known_gaps_documented",
      "vrtr.long_vision_truncation_boundary",
      "vrtr.probe_runner_exported",
      "vrtr.source_block_gate_ref",
      "vrtr.whitespace_vision_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveVisionerResearchTriggerContract();
    const slice = runVisionerResearchTriggerBoundarySlice();

    assert.equal(slice.atom, "P02-B05-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listVisionerResearchTriggerContractProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateVisionerResearchTriggerBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves full probe alignment while boundary slice passes", () => {
    const slice = runVisionerResearchTriggerBoundarySlice();
    const recoveryProbe = slice.results.find(r => r.id === "vrtr.structured_research_trigger_recovery");

    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(slice.results.filter(r => !r.aligned).length, 0);
  });
});

describe("Forge Visioner Research Trigger Failure/Recovery Slice — P02-B05-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveVisionerResearchTriggerContract();
    const failure = listVisionerResearchTriggerContractProbesByCategory("failure_path", contract);
    const recovery = listVisionerResearchTriggerContractProbesByCategory("recovery_path", contract);
    const nogo = listVisionerResearchTriggerContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...VISIONER_RESEARCH_TRIGGER_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveVisionerResearchTriggerContract();
    const slice = runVisionerResearchTriggerFailureRecoverySlice();

    assert.equal(slice.atom, "P02-B05-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of VISIONER_RESEARCH_TRIGGER_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listVisionerResearchTriggerContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateVisionerResearchTriggerFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure/recovery/NO-GO paths with full alignment after A03 recovery slice", () => {
    const slice = runVisionerResearchTriggerFailureRecoverySlice();
    const probeIds = listVisionerResearchTriggerFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const malformedGuard = slice.failureRecoveryResults.find(
      r => r.id === "vrtr.malformed_vision_trigger_guard",
    );
    assert.ok(malformedGuard);
    assert.equal(malformedGuard!.expected, "PASS");
    assert.equal(malformedGuard!.actual, "PASS");

    const structuredRecovery = slice.failureRecoveryResults.find(
      r => r.id === "vrtr.structured_research_trigger_recovery",
    );
    assert.ok(structuredRecovery);
    assert.equal(structuredRecovery!.expected, "PASS");
    assert.equal(structuredRecovery!.actual, "PASS");

    const budgetNogo = slice.failureRecoveryResults.find(
      r => r.id === "vrtr.visioner_research_budget_threshold",
    );
    assert.ok(budgetNogo);
    assert.equal(budgetNogo!.expected, "PASS");
    assert.equal(budgetNogo!.actual, "PASS");
  });
});
