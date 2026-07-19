import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkerFilesystemGroundingBaseline,
  runWorkerFilesystemGroundingProbes,
  getActiveWorkerFilesystemGroundingContract,
  getWorkerFilesystemGroundingCategoryContract,
  listWorkerFilesystemGroundingContractProbeIds,
  listWorkerFilesystemGroundingContractProbesByCategory,
  listWorkerFilesystemGroundingProbesByDisposition,
  summarizeWorkerFilesystemGroundingContractCoverage,
  validateWorkerFilesystemGroundingContract,
  validateWorkerFilesystemGroundingContractCoverage,
  validateWorkerFilesystemGroundingAgainstContract,
  WORKER_FILESYSTEM_GROUNDING_CATEGORIES,
  FORGE_WORKER_FILESYSTEM_GROUNDING_CONTRACT_V1,
  FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION,
} from "./forge-p05-worker-filesystem-grounding.js";

const REQUIRE_FULL_ALIGNMENT: Record<
  (typeof WORKER_FILESYSTEM_GROUNDING_CATEGORIES)[number],
  boolean
> = {
  grounding_versioning: true,
  read_signal: false,
  path_signal: false,
  baseline_link: true,
  boundary: true,
  failure_path: true,
  recovery_path: true,
  nogo_path: false,
};

describe("Forge Worker Filesystem Grounding Contract — P05-B02-A02", () => {
  it("defines typed acceptance for all eight worker filesystem grounding categories", () => {
    const contract = getActiveWorkerFilesystemGroundingContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P05-B02-A02");

    for (const category of WORKER_FILESYSTEM_GROUNDING_CATEGORIES) {
      const categoryContract = getWorkerFilesystemGroundingCategoryContract(category);
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
    const contract = getActiveWorkerFilesystemGroundingContract();
    const summary = summarizeWorkerFilesystemGroundingContractCoverage(contract);
    const coverage = validateWorkerFilesystemGroundingContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(validateWorkerFilesystemGroundingContract().valid, true);
    assert.equal(summary.totalProbes, 27);
    assert.equal(summary.expectedPass, 27);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 20);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 3);
    assert.equal(summary.byCategory.grounding_versioning.probeCount, 3);
    assert.equal(summary.byCategory.read_signal.probeCount, 4);
    assert.equal(summary.byCategory.path_signal.probeCount, 4);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 7);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 3);
  });

  it("lists zero gap probes after A03 filesystem grounding production slice", () => {
    const gaps = listWorkerFilesystemGroundingProbesByDisposition("gap");
    const nogo = listWorkerFilesystemGroundingProbesByDisposition("nogo");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
    assert.deepEqual(
      nogo.map(p => p.id).sort(),
      [
        "wfg.exported_grounding_validator",
        "wfg.grounding_telemetry_record",
        "wfg.read_before_edit_validator",
      ],
    );
    assert.ok(nogo.every(probe => probe.expected === "PASS"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadWorkerFilesystemGroundingBaseline();
    const contract = getActiveWorkerFilesystemGroundingContract();
    const validation = validateWorkerFilesystemGroundingAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listWorkerFilesystemGroundingContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each worker filesystem grounding probe id is globally unique", () => {
    const ids = listWorkerFilesystemGroundingContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runWorkerFilesystemGroundingProbes();
    const contract = getActiveWorkerFilesystemGroundingContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveWorkerFilesystemGroundingContract();
    const flatIds = listWorkerFilesystemGroundingContractProbeIds(contract);
    const categoryIds = WORKER_FILESYSTEM_GROUNDING_CATEGORIES.flatMap(category =>
      listWorkerFilesystemGroundingContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("exports stable contract v1 reference aligned with baseline probe matrix", () => {
    const fixture = loadWorkerFilesystemGroundingBaseline();
    const contract = getActiveWorkerFilesystemGroundingContract();
    assert.equal(FORGE_WORKER_FILESYSTEM_GROUNDING_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_WORKER_FILESYSTEM_GROUNDING_CONTRACT_V1.atom, "P05-B02-A02");
    assert.equal(FORGE_WORKER_FILESYSTEM_GROUNDING_CONTRACT_V1.probes.length, 27);
    assert.equal(FORGE_WORKER_FILESYSTEM_GROUNDING_CONTRACT_V1.probes.length, fixture.probes.length);
    assert.equal(FORGE_WORKER_FILESYSTEM_GROUNDING_VERSION, "1.0.0-a04");
    assert.equal(contract.version, FORGE_WORKER_FILESYSTEM_GROUNDING_CONTRACT_V1.version);
  });
});
