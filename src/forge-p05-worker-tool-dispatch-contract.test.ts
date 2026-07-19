import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkerToolDispatchBaseline,
  runWorkerToolDispatchProbes,
  getActiveWorkerToolDispatchContract,
  getWorkerToolDispatchCategoryContract,
  listWorkerToolDispatchContractProbeIds,
  listWorkerToolDispatchContractProbesByCategory,
  listWorkerToolDispatchProbesByDisposition,
  summarizeWorkerToolDispatchContractCoverage,
  validateWorkerToolDispatchContract,
  validateWorkerToolDispatchContractCoverage,
  validateWorkerToolDispatchAgainstContract,
  WORKER_TOOL_DISPATCH_CATEGORIES,
  FORGE_WORKER_TOOL_DISPATCH_CONTRACT_V1,
  FORGE_WORKER_TOOL_DISPATCH_VERSION,
} from "./forge-p05-worker-tool-dispatch.js";

const REQUIRE_FULL_ALIGNMENT: Record<
  (typeof WORKER_TOOL_DISPATCH_CATEGORIES)[number],
  boolean
> = {
  dispatch_versioning: true,
  tool_interface: false,
  dispatch_routing: false,
  baseline_link: true,
  boundary: true,
  failure_path: true,
  recovery_path: true,
  nogo_path: false,
};

describe("Forge Worker Tool Dispatch Contract — P05-B01-A02", () => {
  it("defines typed acceptance for all eight worker tool dispatch categories", () => {
    const contract = getActiveWorkerToolDispatchContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P05-B01-A02");

    for (const category of WORKER_TOOL_DISPATCH_CATEGORIES) {
      const categoryContract = getWorkerToolDispatchCategoryContract(category);
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
    const contract = getActiveWorkerToolDispatchContract();
    const summary = summarizeWorkerToolDispatchContractCoverage(contract);
    const coverage = validateWorkerToolDispatchContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(validateWorkerToolDispatchContract().valid, true);
    assert.equal(summary.totalProbes, 27);
    assert.equal(summary.expectedPass, 27);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 20);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 3);
    assert.equal(summary.byCategory.dispatch_versioning.probeCount, 3);
    assert.equal(summary.byCategory.tool_interface.probeCount, 4);
    assert.equal(summary.byCategory.dispatch_routing.probeCount, 4);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 7);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 3);
  });

  it("lists zero gap probes after A03 production slice", () => {
    const gaps = listWorkerToolDispatchProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadWorkerToolDispatchBaseline();
    const contract = getActiveWorkerToolDispatchContract();
    const validation = validateWorkerToolDispatchAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listWorkerToolDispatchContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each worker tool dispatch probe id is globally unique", () => {
    const ids = listWorkerToolDispatchContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runWorkerToolDispatchProbes();
    const contract = getActiveWorkerToolDispatchContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveWorkerToolDispatchContract();
    const flatIds = listWorkerToolDispatchContractProbeIds(contract);
    const categoryIds = WORKER_TOOL_DISPATCH_CATEGORIES.flatMap(category =>
      listWorkerToolDispatchContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("exports stable contract v1 reference aligned with baseline probe matrix", () => {
    const fixture = loadWorkerToolDispatchBaseline();
    const contract = getActiveWorkerToolDispatchContract();
    assert.equal(FORGE_WORKER_TOOL_DISPATCH_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_WORKER_TOOL_DISPATCH_CONTRACT_V1.atom, "P05-B01-A02");
    assert.equal(FORGE_WORKER_TOOL_DISPATCH_CONTRACT_V1.probes.length, 27);
    assert.equal(FORGE_WORKER_TOOL_DISPATCH_CONTRACT_V1.probes.length, fixture.probes.length);
    assert.equal(FORGE_WORKER_TOOL_DISPATCH_VERSION, "1.0.0-a03");
    assert.equal(contract.version, FORGE_WORKER_TOOL_DISPATCH_CONTRACT_V1.version);
  });
});
