import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerPhaseGateBaseline,
  runVisionerPhaseGateProbes,
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
  VISIONER_PHASE_GATE_CATEGORIES,
  FORGE_VISIONER_PHASE_GATE_VERSION,
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

  it("maps 23 probes with one documented orchestrator phase gate gap", () => {
    const contract = getActiveVisionerPhaseGateContract();
    const summary = summarizeVisionerPhaseGateContractCoverage(contract);
    const coverage = validateVisionerPhaseGateContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 22);
    assert.equal(summary.expectedFail, 1);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 1);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 1);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.phase_versioning.probeCount, 3);
    assert.equal(summary.byCategory.block_gate_signal.probeCount, 3);
    assert.equal(summary.byCategory.phase_inventory.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists one remaining gap probe for orchestrator phase gate runner", () => {
    const gaps = listVisionerPhaseGateProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), ["vpg.orchestrator_phase_gate_runner"]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
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
