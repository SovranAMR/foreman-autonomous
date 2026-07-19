import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistParallelWaveBaseline,
  runStrategistParallelWaveProbes,
  getActiveStrategistParallelWaveContract,
  getStrategistParallelWaveCategoryContract,
  listStrategistParallelWaveContractProbeIds,
  listStrategistParallelWaveContractProbesByCategory,
  listStrategistParallelWaveProbesByDisposition,
  summarizeStrategistParallelWaveCoverage,
  validateStrategistParallelWaveCoverage,
  validateStrategistParallelWaveAgainstContract,
  validateStrategistParallelWaveBaseline,
  STRATEGIST_PARALLEL_WAVE_CATEGORIES,
  FORGE_STRATEGIST_PARALLEL_WAVE_CONTRACT_V1,
} from "./forge-p03-strategist-parallel-wave.js";

describe("Forge Strategist Parallel Wave Contract — P03-B07-A02", () => {
  it("defines typed acceptance for all nine parallel wave categories", () => {
    const contract = getActiveStrategistParallelWaveContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B07-A06");

    for (const category of STRATEGIST_PARALLEL_WAVE_CATEGORIES) {
      const categoryContract = getStrategistParallelWaveCategoryContract(category);
      assert.ok(categoryContract.acceptance.invariant.length > 20, `${category} invariant too short`);
      assert.ok(categoryContract.probes.length >= categoryContract.acceptance.minProbeCount);

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

  it("maps 27 probes with six documented FAIL gaps aligned to A01 baseline", () => {
    const contract = getActiveStrategistParallelWaveContract();
    const summary = summarizeStrategistParallelWaveCoverage(contract);
    const coverage = validateStrategistParallelWaveCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 27);
    assert.equal(summary.expectedPass, 21);
    assert.equal(summary.expectedFail, 6);
    assert.equal(summary.byDisposition.observed, 16);
    assert.equal(summary.byDisposition.gap, 4);
    assert.equal(summary.byDisposition.failure, 3);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.wave_versioning.probeCount, 3);
    assert.equal(summary.byCategory.block_wave_plan.probeCount, 4);
    assert.equal(summary.byCategory.atom_wave_plan.probeCount, 2);
    assert.equal(summary.byCategory.resource_wave_budget.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 3);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists four remaining gap probes matching documented parallel wave debt", () => {
    const gaps = listStrategistParallelWaveProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), [
      "swave.orchestrator_atom_waves",
      "swave.orchestrator_pre_exec_wave_gate",
      "swave.parser_wave_plan_fields",
      "swave.prompt_parallel_wave_plan",
    ]);

    const nogoGaps = listStrategistParallelWaveProbesByDisposition("nogo").filter(
      p => p.expected === "FAIL",
    );
    assert.deepEqual(nogoGaps.map(p => p.id).sort(), [
      "swave.exported_wave_validator",
      "swave.nogo_invalid_wave_plan",
    ]);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistParallelWaveBaseline();
    const contract = getActiveStrategistParallelWaveContract();
    const validation = validateStrategistParallelWaveAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistParallelWaveContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("baseline validation includes contract alignment from A02", () => {
    const fixture = loadStrategistParallelWaveBaseline();
    const validation = validateStrategistParallelWaveBaseline(fixture);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_PARALLEL_WAVE_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_PARALLEL_WAVE_CONTRACT_V1.probes.length, 27);
  });

  it("each parallel wave probe id is globally unique", () => {
    const ids = listStrategistParallelWaveContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistParallelWaveContract();
    const flatIds = listStrategistParallelWaveContractProbeIds(contract);
    const categoryIds = STRATEGIST_PARALLEL_WAVE_CATEGORIES.flatMap(category =>
      listStrategistParallelWaveContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runStrategistParallelWaveProbes();
    const contract = getActiveStrategistParallelWaveContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});
