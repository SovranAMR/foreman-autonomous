import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadVisionerIntentBaseline,
  runVisionerIntentProbes,
} from "./forge-p02-visioner-intent.probe.js";
import {
  getActiveVisionerIntentContract,
  getVisionerIntentCategoryContract,
  listVisionerIntentContractProbeIds,
  listVisionerIntentContractProbesByCategory,
  listVisionerIntentProbesByDisposition,
  summarizeVisionerIntentContractCoverage,
  validateVisionerIntentContractCoverage,
  validateVisionerIntentAgainstContract,
  VISIONER_INTENT_CATEGORIES,
} from "./forge-p02-visioner-intent.js";

describe("Forge Visioner Intent Contract — P02-B01-A02", () => {
  it("defines typed acceptance for all eight visioner intent categories", () => {
    const contract = getActiveVisionerIntentContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P02-B01-A05");

    for (const category of VISIONER_INTENT_CATEGORIES) {
      const categoryContract = getVisionerIntentCategoryContract(category);
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

  it("maps 20 probes with five documented gap dispositions from A01 baseline", () => {
    const contract = getActiveVisionerIntentContract();
    const summary = summarizeVisionerIntentContractCoverage(contract);
    const coverage = validateVisionerIntentContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 20);
    assert.equal(summary.expectedPass, 15);
    assert.equal(summary.expectedFail, 5);
    assert.equal(summary.byDisposition.observed, 11);
    assert.equal(summary.byDisposition.gap, 5);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 1);
    assert.equal(summary.byDisposition.nogo, 1);
    assert.equal(summary.byCategory.intent_versioning.probeCount, 3);
    assert.equal(summary.byCategory.task_signal.probeCount, 3);
    assert.equal(summary.byCategory.intent_depth.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 3);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists five documented gap probes for visioner intent wiring", () => {
    const gaps = listVisionerIntentProbesByDisposition("gap");
    const ids = gaps.map(p => p.id).sort();
    assert.deepEqual(ids, [
      "vint.depth_routed_prompt",
      "vint.intent_ambiguity_nogo",
      "vint.programmatic_depth_classifier",
      "vint.structured_intent_parse",
      "vint.structured_intent_recovery",
    ]);
    assert.ok(gaps.every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadVisionerIntentBaseline();
    const contract = getActiveVisionerIntentContract();
    const validation = validateVisionerIntentAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listVisionerIntentContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each visioner intent probe id is globally unique", () => {
    const ids = listVisionerIntentContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runVisionerIntentProbes();
    const contract = getActiveVisionerIntentContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveVisionerIntentContract();
    const flatIds = listVisionerIntentContractProbeIds(contract);
    const categoryIds = VISIONER_INTENT_CATEGORIES.flatMap(category =>
      listVisionerIntentContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });
});
