import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistPhaseGateBaseline,
  runStrategistPhaseGateProbes,
  runStrategistPhaseGateProductionSlice,
  runStrategistPhaseGateBoundarySlice,
  validateStrategistPhaseGateBaseline,
} from "./forge-p03-strategist-phase-gate.probe.js";
import {
  getActiveStrategistPhaseGateContract,
  getStrategistPhaseGateCategoryContract,
  listStrategistPhaseGateContractProbeIds,
  listStrategistPhaseGateContractProbesByCategory,
  listStrategistPhaseGateProbesByDisposition,
  summarizeStrategistPhaseGateCoverage,
  validateStrategistPhaseGateCoverage,
  validateStrategistPhaseGateAgainstContract,
  validateStrategistPhaseGateProbeMatrix,
  validateStrategistPhaseGateBoundaryProbeMatrix,
  recoverStrategistPhaseGateEvidence,
  assessStrategistPhaseGateInputBoundary,
  STRATEGIST_PHASE_GATE_MANIFEST_MAX_LENGTH,
  STRATEGIST_PHASE_GATE_CATEGORIES,
  FORGE_STRATEGIST_PHASE_GATE_CONTRACT_V1,
  FORGE_STRATEGIST_PHASE_GATE_VERSION,
  P03_STRATEGIST_PHASE_BLOCK_COUNT,
} from "./forge-p03-strategist-phase-gate.js";

describe("Forge Strategist Phase Gate Contract — P03-B10-A02", () => {
  it("defines typed acceptance for all eight strategist phase gate categories", () => {
    const contract = getActiveStrategistPhaseGateContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B10-A02");

    for (const category of STRATEGIST_PHASE_GATE_CATEGORIES) {
      const categoryContract = getStrategistPhaseGateCategoryContract(category);
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

  it("maps 24 probes with full PASS alignment after A03 production slice", () => {
    const contract = getActiveStrategistPhaseGateContract();
    const summary = summarizeStrategistPhaseGateCoverage(contract);
    const coverage = validateStrategistPhaseGateCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 24);
    assert.equal(summary.expectedPass, 24);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 3);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.phase_versioning.probeCount, 3);
    assert.equal(summary.byCategory.block_gate_signal.probeCount, 3);
    assert.equal(summary.byCategory.phase_inventory.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 3);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("documents zero remaining strategist phase gate gap probes after A03", () => {
    const gaps = listStrategistPhaseGateProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistPhaseGateBaseline();
    const contract = getActiveStrategistPhaseGateContract();
    const validation = validateStrategistPhaseGateAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistPhaseGateContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("baseline validation includes contract alignment from A02", () => {
    const fixture = loadStrategistPhaseGateBaseline();
    const validation = validateStrategistPhaseGateBaseline(fixture);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_PHASE_GATE_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_PHASE_GATE_CONTRACT_V1.probes.length, 24);
    assert.equal(FORGE_STRATEGIST_PHASE_GATE_CONTRACT_V1.atom, "P03-B10-A02");
  });

  it("each strategist phase gate probe id is globally unique", () => {
    const ids = listStrategistPhaseGateContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistPhaseGateContract();
    const flatIds = listStrategistPhaseGateContractProbeIds(contract);
    const categoryIds = STRATEGIST_PHASE_GATE_CATEGORIES.flatMap(category =>
      listStrategistPhaseGateContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runStrategistPhaseGateProbes();
    const contract = getActiveStrategistPhaseGateContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("exports FORGE_STRATEGIST_PHASE_GATE_VERSION aligned with contract semver", () => {
    const contract = getActiveStrategistPhaseGateContract();
    assert.equal(FORGE_STRATEGIST_PHASE_GATE_VERSION, contract.version);
  });
});

describe("Forge Strategist Phase Gate Production Slice — P03-B10-A03", () => {
  it("recoverStrategistPhaseGateEvidence restructures malformed block seal manifest", () => {
    const malformed = `block gates incomplete
P03-B01: PASS atoms=10
P03-B02: pass atoms=10
provenance regression: pass
handoff: valid`;
    const recovery = recoverStrategistPhaseGateEvidence(malformed, {
      provenanceRegressionPassed: true,
      handoffValid: true,
    });

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.evidence);
    assert.equal(recovery.blockSeals.length, P03_STRATEGIST_PHASE_BLOCK_COUNT);
    assert.equal(recovery.provenanceRegressionPassed, true);
    assert.equal(recovery.handoffValid, true);
    assert.ok(recovery.blockSeals.every(seal => seal.passed));
  });

  it("recoverStrategistPhaseGateEvidence rejects null-byte manifest safely", () => {
    const recovery = recoverStrategistPhaseGateEvidence("manifest\0corrupt");
    assert.equal(recovery.recovered, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_manifest"]);
  });

  it("assessStrategistPhaseGateInputBoundary handles empty and whitespace-only manifest", () => {
    const empty = assessStrategistPhaseGateInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessStrategistPhaseGateInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveStrategistPhaseGateContract();
    const slice = runStrategistPhaseGateProductionSlice();

    assert.equal(slice.atom, "P03-B10-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 24);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 24);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const matrixValidation = validateStrategistPhaseGateProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });
});

describe("Forge Strategist Phase Gate Boundary Slice — P03-B10-A04", () => {
  it("assessStrategistPhaseGateInputBoundary handles null-byte and truncation edge cases", () => {
    const nullByte = assessStrategistPhaseGateInputBoundary("manifest\0corrupt");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const longManifest = "x".repeat(STRATEGIST_PHASE_GATE_MANIFEST_MAX_LENGTH + 200);
    const truncated = assessStrategistPhaseGateInputBoundary(longManifest);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedManifest.length, STRATEGIST_PHASE_GATE_MANIFEST_MAX_LENGTH);
    assert.equal(truncated.acceptable, true);
  });

  it("recoverStrategistPhaseGateEvidence rejects whitespace-only malformed manifest input", () => {
    const whitespaceRecovery = recoverStrategistPhaseGateEvidence("   \t\n  ");
    assert.equal(whitespaceRecovery.recovered, false);
    assert.deepEqual(whitespaceRecovery.parseErrors, ["whitespace_only_manifest"]);
  });

  it("defines boundary category with manifest input edge-case probes", () => {
    const boundary = listStrategistPhaseGateContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "spg.empty_manifest_boundary",
      "spg.known_gaps_documented",
      "spg.long_manifest_truncation_boundary",
      "spg.probe_runner_exported",
      "spg.source_block_gate_ref",
      "spg.whitespace_manifest_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveStrategistPhaseGateContract();
    const slice = runStrategistPhaseGateBoundarySlice();

    assert.equal(slice.atom, "P03-B10-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listStrategistPhaseGateContractProbesByCategory("boundary", contract)) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateStrategistPhaseGateBoundaryProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("preserves full probe alignment while boundary slice passes", () => {
    const slice = runStrategistPhaseGateBoundarySlice();
    const recoveryProbe = slice.results.find(r => r.id === "spg.structured_phase_gate_recovery");

    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
    assert.equal(slice.results.filter(r => !r.aligned).length, 0);
  });
});
