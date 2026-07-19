import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkerEditEngineBaseline,
  runWorkerEditEngineProbes,
  getActiveWorkerEditEngineContract,
  getWorkerEditEngineCategoryContract,
  listWorkerEditEngineContractProbeIds,
  listWorkerEditEngineContractProbesByCategory,
  listWorkerEditEngineProbesByDisposition,
  summarizeWorkerEditEngineContractCoverage,
  validateWorkerEditEngineContract,
  validateWorkerEditEngineContractCoverage,
  validateWorkerEditEngineAgainstContract,
  WORKER_EDIT_ENGINE_CATEGORIES,
  FORGE_WORKER_EDIT_ENGINE_CONTRACT_V1,
  FORGE_WORKER_EDIT_ENGINE_VERSION,
} from "./forge-p05-worker-edit-engine.js";

const REQUIRE_FULL_ALIGNMENT: Record<
  (typeof WORKER_EDIT_ENGINE_CATEGORIES)[number],
  boolean
> = {
  edit_versioning: true,
  edit_signal: false,
  match_signal: false,
  baseline_link: true,
  boundary: true,
  failure_path: true,
  recovery_path: true,
  nogo_path: false,
};

describe("Forge Worker Edit Engine Contract — P05-B03-A02", () => {
  it("defines typed acceptance for all eight worker edit engine categories", () => {
    const contract = getActiveWorkerEditEngineContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P05-B03-A02");

    for (const category of WORKER_EDIT_ENGINE_CATEGORIES) {
      const categoryContract = getWorkerEditEngineCategoryContract(category);
      assert.ok(categoryContract.acceptance.invariant.length > 20, `${category} invariant too short`);
      assert.ok(categoryContract.probes.length >= categoryContract.acceptance.minProbeCount);
      assert.equal(
        categoryContract.acceptance.requireFullAlignment,
        REQUIRE_FULL_ALIGNMENT[category],
      );

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

  it("maps 27 probes with zero documented FAIL gaps after A03 production slice", () => {
    const contract = getActiveWorkerEditEngineContract();
    const summary = summarizeWorkerEditEngineContractCoverage(contract);
    const coverage = validateWorkerEditEngineContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(validateWorkerEditEngineContract().valid, true);
    assert.equal(summary.totalProbes, 27);
    assert.equal(summary.expectedPass, 27);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 23);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 0);
    assert.equal(summary.byCategory.edit_versioning.probeCount, 3);
    assert.equal(summary.byCategory.edit_signal.probeCount, 4);
    assert.equal(summary.byCategory.match_signal.probeCount, 4);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 7);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 3);
  });

  it("lists zero gap probes after A03 production wiring", () => {
    const gaps = listWorkerEditEngineProbesByDisposition("gap");
    assert.equal(gaps.length, 0);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadWorkerEditEngineBaseline();
    const contract = getActiveWorkerEditEngineContract();
    const validation = validateWorkerEditEngineAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listWorkerEditEngineContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each worker edit engine probe id is globally unique", () => {
    const ids = listWorkerEditEngineContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runWorkerEditEngineProbes();
    const contract = getActiveWorkerEditEngineContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveWorkerEditEngineContract();
    const flatIds = listWorkerEditEngineContractProbeIds(contract);
    const categoryIds = WORKER_EDIT_ENGINE_CATEGORIES.flatMap(category =>
      listWorkerEditEngineContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("exports stable contract v1 reference aligned with baseline probe matrix", () => {
    const fixture = loadWorkerEditEngineBaseline();
    const contract = getActiveWorkerEditEngineContract();
    assert.equal(FORGE_WORKER_EDIT_ENGINE_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_WORKER_EDIT_ENGINE_CONTRACT_V1.atom, "P05-B03-A02");
    assert.equal(FORGE_WORKER_EDIT_ENGINE_CONTRACT_V1.probes.length, 27);
    assert.equal(FORGE_WORKER_EDIT_ENGINE_CONTRACT_V1.probes.length, fixture.probes.length);
    assert.equal(FORGE_WORKER_EDIT_ENGINE_VERSION, "1.0.0-a04");
    assert.equal(contract.version, FORGE_WORKER_EDIT_ENGINE_CONTRACT_V1.version);
  });
});
