import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerPhaseGateBaseline,
  runVisionerPhaseGateProbes,
  runVisionerPhaseGateProductionSlice,
} from "./forge-p02-visioner-phase-gate.probe.js";
import {
  getActiveVisionerPhaseGateContract,
  getVisionerPhaseGateCategoryContract,
  listVisionerPhaseGateContractProbeIds,
  listVisionerPhaseGateContractProbesByCategory,
  listVisionerPhaseGateProbesByDisposition,
  summarizeVisionerPhaseGateContractCoverage,
  validateVisionerPhaseGateContractCoverage,
  validateVisionerPhaseGateAgainstContract,
  validateVisionerPhaseGateProbeMatrix,
  recoverVisionerPhaseGateEvidence,
  assessVisionerPhaseGateInputBoundary,
  VISIONER_PHASE_GATE_CATEGORIES,
  FORGE_VISIONER_PHASE_GATE_VERSION,
  P02_VISIONER_PHASE_BLOCK_COUNT,
} from "./forge-p02-visioner-phase-gate.js";

describe("Forge Visioner Phase Gate Contract — P02-B10-A02", () => {
  it("defines typed acceptance for all eight visioner phase gate categories", () => {
    const contract = getActiveVisionerPhaseGateContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P02-B10-A02");

    for (const category of VISIONER_PHASE_GATE_CATEGORIES) {
      const categoryContract = getVisionerPhaseGateCategoryContract(category);
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

  it("maps 24 probes with full alignment after A03 production slice", () => {
    const contract = getActiveVisionerPhaseGateContract();
    const summary = summarizeVisionerPhaseGateContractCoverage(contract);
    const coverage = validateVisionerPhaseGateContractCoverage(contract);

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

  it("lists zero remaining gap probes after A03 orchestrator wiring", () => {
    const gaps = listVisionerPhaseGateProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadVisionerPhaseGateBaseline();
    const contract = getActiveVisionerPhaseGateContract();
    const validation = validateVisionerPhaseGateAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listVisionerPhaseGateContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each visioner phase gate probe id is globally unique", () => {
    const ids = listVisionerPhaseGateContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runVisionerPhaseGateProbes();
    const contract = getActiveVisionerPhaseGateContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveVisionerPhaseGateContract();
    const flatIds = listVisionerPhaseGateContractProbeIds(contract);
    const categoryIds = VISIONER_PHASE_GATE_CATEGORIES.flatMap(category =>
      listVisionerPhaseGateContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("exports FORGE_VISIONER_PHASE_GATE_VERSION aligned with contract semver", () => {
    const contract = getActiveVisionerPhaseGateContract();
    assert.equal(FORGE_VISIONER_PHASE_GATE_VERSION, contract.version);
  });
});

describe("Forge Visioner Phase Gate Production Slice — P02-B10-A03", () => {
  it("recoverVisionerPhaseGateEvidence restructures malformed block seal manifest", () => {
    const malformed = `block gates incomplete
P02-B01: PASS atoms=10
P02-B02: pass atoms=10
approval regression: pass
handoff: valid`;
    const recovery = recoverVisionerPhaseGateEvidence(malformed, {
      approvalRegressionPassed: true,
      handoffValid: true,
    });

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.evidence);
    assert.equal(recovery.blockSeals.length, P02_VISIONER_PHASE_BLOCK_COUNT);
    assert.equal(recovery.approvalRegressionPassed, true);
    assert.equal(recovery.handoffValid, true);
    assert.ok(recovery.blockSeals.every(seal => seal.passed));
  });

  it("recoverVisionerPhaseGateEvidence rejects null-byte manifest safely", () => {
    const recovery = recoverVisionerPhaseGateEvidence("manifest\0corrupt");
    assert.equal(recovery.recovered, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_manifest"]);
  });

  it("assessVisionerPhaseGateInputBoundary handles empty and whitespace-only manifest", () => {
    const empty = assessVisionerPhaseGateInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessVisionerPhaseGateInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveVisionerPhaseGateContract();
    const slice = runVisionerPhaseGateProductionSlice();

    assert.equal(slice.atom, "P02-B10-A03");
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

    const matrixValidation = validateVisionerPhaseGateProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });
});
