import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistPhaseGateBaseline,
  runStrategistPhaseGateProbes,
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
  STRATEGIST_PHASE_GATE_CATEGORIES,
  FORGE_STRATEGIST_PHASE_GATE_CONTRACT_V1,
  FORGE_STRATEGIST_PHASE_GATE_VERSION,
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

  it("maps 24 probes with one documented FAIL gap from A01 baseline", () => {
    const contract = getActiveStrategistPhaseGateContract();
    const summary = summarizeStrategistPhaseGateCoverage(contract);
    const coverage = validateStrategistPhaseGateCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 24);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 1);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 1);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
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

  it("lists one gap probe for orchestrator phase gate runner", () => {
    const gaps = listStrategistPhaseGateProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), ["spg.orchestrator_phase_gate_runner"]);
    assert.equal(gaps[0]?.expected, "FAIL");
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
