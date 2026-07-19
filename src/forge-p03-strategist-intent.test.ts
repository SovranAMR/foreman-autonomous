import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistIntentBaseline,
  runStrategistIntentProbes,
  getActiveStrategistIntentContract,
  getStrategistIntentCategoryContract,
  listStrategistIntentContractProbeIds,
  listStrategistIntentContractProbesByCategory,
  listStrategistIntentProbesByDisposition,
  summarizeStrategistIntentContractCoverage,
  validateStrategistIntentContractCoverage,
  validateStrategistIntentAgainstContract,
  assessStrategistVisionInputBoundary,
  runStrategistIntentBoundarySlice,
  validateStrategistIntentBoundaryProbeMatrix,
  runStrategistIntentFailureRecoverySlice,
  validateStrategistIntentFailureRecoveryProbeMatrix,
  listStrategistIntentFailureRecoveryProbeIds,
  STRATEGIST_INTENT_FAILURE_RECOVERY_CATEGORIES,
  STRATEGIST_VISION_MAX_LENGTH,
  STRATEGIST_INTENT_CATEGORIES,
} from "./forge-p03-strategist-intent.js";

describe("Forge Strategist Intent Contract — P03-B01-A02", () => {
  it("defines typed acceptance for all eight strategist intent categories", () => {
    const contract = getActiveStrategistIntentContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B01-A05");

    for (const category of STRATEGIST_INTENT_CATEGORIES) {
      const categoryContract = getStrategistIntentCategoryContract(category);
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

  it("maps 23 probes with zero remaining gaps after A03 recovery slice", () => {
    const contract = getActiveStrategistIntentContract();
    const summary = summarizeStrategistIntentContractCoverage(contract);
    const coverage = validateStrategistIntentContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.intent_versioning.probeCount, 3);
    assert.equal(summary.byCategory.task_signal.probeCount, 3);
    assert.equal(summary.byCategory.decomposition_depth.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists zero remaining gap probes after A03 recovery slice", () => {
    const gaps = listStrategistIntentProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistIntentBaseline();
    const contract = getActiveStrategistIntentContract();
    const validation = validateStrategistIntentAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listStrategistIntentContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each strategist intent probe id is globally unique", () => {
    const ids = listStrategistIntentContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runStrategistIntentProbes();
    const contract = getActiveStrategistIntentContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistIntentContract();
    const flatIds = listStrategistIntentContractProbeIds(contract);
    const categoryIds = STRATEGIST_INTENT_CATEGORIES.flatMap(category =>
      listStrategistIntentContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });
});

describe("Forge Strategist Intent Boundary Slice — P03-B01-A04", () => {
  it("assessStrategistVisionInputBoundary handles empty, whitespace-only and oversized inputs", () => {
    const empty = assessStrategistVisionInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistVisionInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessStrategistVisionInputBoundary("vision\x00output");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const longVision = "x".repeat(STRATEGIST_VISION_MAX_LENGTH + 500);
    const truncated = assessStrategistVisionInputBoundary(longVision);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedVision.length, STRATEGIST_VISION_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("defines boundary category with vision input edge-case probes", () => {
    const boundary = listStrategistIntentContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "sint.empty_vision_boundary",
      "sint.known_gaps_documented",
      "sint.long_vision_truncation_boundary",
      "sint.probe_runner_exported",
      "sint.source_phase_gate_ref",
      "sint.whitespace_vision_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveStrategistIntentContract();
    const slice = runStrategistIntentBoundarySlice();

    assert.equal(slice.atom, "P03-B01-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listStrategistIntentContractProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateStrategistIntentBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });
});

describe("Forge Strategist Intent Failure/Recovery Slice — P03-B01-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveStrategistIntentContract();
    const failure = listStrategistIntentContractProbesByCategory("failure_path", contract);
    const recovery = listStrategistIntentContractProbesByCategory("recovery_path", contract);
    const nogo = listStrategistIntentContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...STRATEGIST_INTENT_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveStrategistIntentContract();
    const slice = runStrategistIntentFailureRecoverySlice();

    assert.equal(slice.atom, "P03-B01-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of STRATEGIST_INTENT_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listStrategistIntentContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateStrategistIntentFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure, recovery and NO-GO strategist intent paths", () => {
    const slice = runStrategistIntentFailureRecoverySlice();
    const probeIds = listStrategistIntentFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const emptyDecomposeGuard = slice.failureRecoveryResults.find(
      r => r.id === "sint.empty_decompose_guard",
    );
    assert.ok(emptyDecomposeGuard);
    assert.equal(emptyDecomposeGuard!.expected, "PASS");
    assert.equal(emptyDecomposeGuard!.actual, "PASS");

    const recoveryProbe = slice.failureRecoveryResults.find(
      r => r.id === "sint.structured_decompose_recovery",
    );
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");

    const nogoProbe = slice.failureRecoveryResults.find(r => r.id === "sint.over_decompose_nogo");
    assert.ok(nogoProbe);
    assert.equal(nogoProbe!.expected, "PASS");
    assert.equal(nogoProbe!.actual, "PASS");
  });
});
