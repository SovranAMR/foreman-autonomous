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
  recoverStrategistDependencyDag,
  inferBlockDependenciesFromOrder,
  runStrategistDependencyDagProductionSlice,
  validateStrategistDependencyDagProbeMatrix,
  STRATEGIST_DEPENDENCY_DAG_CATEGORIES,
  FORGE_STRATEGIST_DEPENDENCY_DAG_CONTRACT_V1,
} from "./forge-p03-strategist-dependency-dag.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

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

  it("maps 23 probes with six documented FAIL gaps aligned to A01 baseline", () => {
    const contract = getActiveStrategistDependencyDagContract();
    const summary = summarizeStrategistDependencyDagCoverage(contract);
    const coverage = validateStrategistDependencyDagCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 17);
    assert.equal(summary.expectedFail, 6);
    assert.equal(summary.byDisposition.observed, 13);
    assert.equal(summary.byDisposition.gap, 6);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
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

  it("lists six gap probes matching documented dependency DAG debt", () => {
    const gaps = listStrategistDependencyDagProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), [
      "sdag.exported_dag_validator",
      "sdag.nogo_cycle_block_halt",
      "sdag.nogo_invalid_dep_graph",
      "sdag.orchestrator_atom_waves",
      "sdag.parser_atom_deps",
      "sdag.prompt_atom_dependencies",
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

describe("Forge Strategist Dependency DAG Production Slice — P03-B04-A03", () => {
  it("recoverStrategistDependencyDag restructures malformed dependency graph into valid DAG plan", () => {
    const malformed = `REASONING: Need dependency DAG plan
Here are the steps:
Block 1: Setup dependency DAG types
Block 2: Wire block dependency parser seam
Block 3: Add dependency DAG baseline tests
DEPENDENCIES: 2→99, 3→3, 4→1
CONFIDENCE: 0.8`;
    const recovery = recoverStrategistDependencyDag(malformed);

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.dagValid, true);
    assert.ok(recovery.blockCount >= 3);
    assert.match(recovery.composedDecompose, /DEPENDENCIES:/);
    assert.ok(recovery.blocks.some(block => block.includes("dependency DAG types")));
    assert.ok(recovery.blocks.some(block => block.includes("dependency parser seam")));
    assert.ok(recovery.blocks.some(block => block.includes("dependency DAG baseline")));
  });

  it("recoverStrategistDependencyDag rejects null-byte decompose output safely", () => {
    const recovery = recoverStrategistDependencyDag("decompose\0output");
    assert.equal(recovery.recovered, false);
    assert.equal(recovery.dagValid, false);
    assert.deepEqual(recovery.parseErrors, ["null_byte_in_decompose"]);
  });

  it("inferBlockDependenciesFromOrder provides sequential fallback when DEPENDENCIES missing", () => {
    const missingDeps = `REASONING: Blocks without explicit deps
OUTPUT:
Block 1: Root dependency block
Block 2: Depends on prior work implicitly
Block 3: Final dependency integration
CONFIDENCE: 0.75`;
    const recovery = recoverStrategistDependencyDag(missingDeps);
    const inferred = inferBlockDependenciesFromOrder(3);

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.dagValid, true);
    assert.deepEqual(inferred[0], []);
    assert.deepEqual(inferred[1], [0]);
    assert.deepEqual(inferred[2], [1]);
    assert.ok(recovery.parseErrors.includes("missing_deps_inferred"));
  });

  it("executes contract-wired probes with zero unexpected mismatches after recovery slice", () => {
    const contract = getActiveStrategistDependencyDagContract();
    const slice = runStrategistDependencyDagProductionSlice();

    assert.equal(slice.atom, "P03-B04-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 17);
    assert.equal(slice.matrixValidation.gapAligned, 6);
    assert.equal(slice.summary.knownGaps.length, 6);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateStrategistDependencyDagProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const recoveryProbe = slice.results.find(r => r.id === "sdag.recovery_dag_repair");
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);

    const fallbackProbe = slice.results.find(r => r.id === "sdag.recovery_missing_deps_fallback");
    assert.ok(fallbackProbe);
    assert.equal(fallbackProbe!.expected, "PASS");
    assert.equal(fallbackProbe!.actual, "PASS");
    assert.equal(fallbackProbe!.aligned, true);
  });
});
