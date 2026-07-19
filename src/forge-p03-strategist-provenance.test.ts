import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadStrategistProvenanceBaseline,
  runStrategistProvenanceProbes,
  getActiveStrategistProvenanceContract,
  getStrategistProvenanceCategoryContract,
  listStrategistProvenanceContractProbeIds,
  listStrategistProvenanceContractProbesByCategory,
  listStrategistProvenanceProbesByDisposition,
  summarizeStrategistProvenanceCoverage,
  validateStrategistProvenanceCoverage,
  validateStrategistProvenanceAgainstContract,
  validateStrategistProvenanceBaseline,
  STRATEGIST_PROVENANCE_CATEGORIES,
  FORGE_STRATEGIST_PROVENANCE_CONTRACT_V1,
} from "./forge-p03-strategist-provenance.js";

describe("Forge Strategist Plan Provenance Contract — P03-B09-A02", () => {
  it("defines typed acceptance for all nine provenance categories", () => {
    const contract = getActiveStrategistProvenanceContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P03-B09-A06");

    for (const category of STRATEGIST_PROVENANCE_CATEGORIES) {
      const categoryContract = getStrategistProvenanceCategoryContract(category);
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

  it("maps 28 probes with six documented FAIL gaps aligned to A01 baseline", () => {
    const contract = getActiveStrategistProvenanceContract();
    const summary = summarizeStrategistProvenanceCoverage(contract);
    const coverage = validateStrategistProvenanceCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 28);
    assert.equal(summary.expectedPass, 22);
    assert.equal(summary.expectedFail, 6);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 4);
    assert.equal(summary.byDisposition.failure, 3);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.provenance_versioning.probeCount, 3);
    assert.equal(summary.byCategory.plan_lineage.probeCount, 3);
    assert.equal(summary.byCategory.drift_detection.probeCount, 4);
    assert.equal(summary.byCategory.provenance_seam.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 3);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists four remaining gap probes matching documented provenance debt", () => {
    const gaps = listStrategistProvenanceProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), [
      "sprov.orchestrator_pre_exec_drift_gate",
      "sprov.parser_provenance_fields",
      "sprov.plan_provenance_graph",
      "sprov.prompt_plan_provenance",
    ]);

    const nogoGaps = listStrategistProvenanceProbesByDisposition("nogo").filter(
      p => p.expected === "FAIL",
    );
    assert.deepEqual(nogoGaps.map(p => p.id).sort(), [
      "sprov.exported_plan_drift_validator",
      "sprov.nogo_undetected_drift",
    ]);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadStrategistProvenanceBaseline();
    const contract = getActiveStrategistProvenanceContract();
    const validation = validateStrategistProvenanceAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    assert.equal(fixture.contractAtom, contract.atom);
    assert.deepEqual(
      listStrategistProvenanceContractProbeIds(contract).sort(),
      fixture.probes.map(p => p.id).sort(),
    );
  });

  it("baseline validation includes contract alignment from A02", () => {
    const fixture = loadStrategistProvenanceBaseline();
    const validation = validateStrategistProvenanceBaseline(fixture);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
  });

  it("exports stable contract v1 reference", () => {
    assert.equal(FORGE_STRATEGIST_PROVENANCE_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_STRATEGIST_PROVENANCE_CONTRACT_V1.probes.length, 28);
  });

  it("each provenance probe id is globally unique", () => {
    const ids = listStrategistProvenanceContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveStrategistProvenanceContract();
    const flatIds = listStrategistProvenanceContractProbeIds(contract);
    const categoryIds = STRATEGIST_PROVENANCE_CATEGORIES.flatMap(category =>
      listStrategistProvenanceContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runStrategistProvenanceProbes();
    const contract = getActiveStrategistProvenanceContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });
});
