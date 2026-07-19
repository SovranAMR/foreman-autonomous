import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistDependencyDagBaseline,
  getActiveStrategistDependencyDagContract,
  getStrategistDependencyDagCategoryContract,
  listStrategistDependencyDagContractProbeIds,
  listStrategistDependencyDagContractProbesByCategory,
  listStrategistDependencyDagProbesByDisposition,
  summarizeStrategistDependencyDagCoverage,
  validateStrategistDependencyDagCoverage,
  validateStrategistDependencyDagAgainstContract,
  validateStrategistDependencyDagBaseline,
  STRATEGIST_DEPENDENCY_DAG_CATEGORIES,
  FORGE_STRATEGIST_DEPENDENCY_DAG_CONTRACT_V1,
} from "./forge-p03-strategist-dependency-dag.js";

describe("Forge Strategist Dependency DAG Contract — P03-B04-A02", () => {
  it("defines typed acceptance for all eight dependency DAG categories", () => {
    const contract = getActiveStrategistDependencyDagContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B04-A06");

    for (const category of STRATEGIST_DEPENDENCY_DAG_CATEGORIES) {
      const categoryContract = getStrategistDependencyDagCategoryContract(category);
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

  it("maps 23 probes with eight documented FAIL gaps aligned to A01 baseline", () => {
    const contract = getActiveStrategistDependencyDagContract();
    const summary = summarizeStrategistDependencyDagCoverage(contract);
    const coverage = validateStrategistDependencyDagCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 15);
    assert.equal(summary.expectedFail, 8);
    assert.equal(summary.byDisposition.observed, 13);
    assert.equal(summary.byDisposition.gap, 8);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 0);
    assert.equal(summary.byDisposition.nogo, 0);
    assert.equal(summary.byCategory.dag_versioning.probeCount, 3);
    assert.equal(summary.byCategory.block_dag.probeCount, 4);
    assert.equal(summary.byCategory.atom_dag.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 4);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 3);
  });

  it("lists eight gap probes matching documented dependency DAG debt", () => {
    const gaps = listStrategistDependencyDagProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), [
      "sdag.exported_dag_validator",
      "sdag.nogo_cycle_block_halt",
      "sdag.nogo_invalid_dep_graph",
      "sdag.orchestrator_atom_waves",
      "sdag.parser_atom_deps",
      "sdag.prompt_atom_dependencies",
      "sdag.recovery_dag_repair",
      "sdag.recovery_missing_deps_fallback",
    ]);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistDependencyDagBaseline();
    const contract = getActiveStrategistDependencyDagContract();
    const validation = validateStrategistDependencyDagAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistDependencyDagContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("baseline validation includes contract alignment from A02", () => {
    const fixture = loadStrategistDependencyDagBaseline();
    const validation = validateStrategistDependencyDagBaseline(fixture);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_DEPENDENCY_DAG_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_DEPENDENCY_DAG_CONTRACT_V1.probes.length, 23);
  });

  it("each dependency DAG probe id is globally unique", () => {
    const ids = listStrategistDependencyDagContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistDependencyDagContract();
    const flatIds = listStrategistDependencyDagContractProbeIds(contract);
    const categoryIds = STRATEGIST_DEPENDENCY_DAG_CATEGORIES.flatMap(category =>
      listStrategistDependencyDagContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });
});
