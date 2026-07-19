import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherSpikeFalsificationBaseline,
  runResearcherSpikeFalsificationProbes,
  getActiveResearcherSpikeFalsificationContract,
  getResearcherSpikeFalsificationCategoryContract,
  listResearcherSpikeFalsificationContractProbeIds,
  listResearcherSpikeFalsificationContractProbesByCategory,
  listResearcherSpikeFalsificationProbesByDisposition,
  summarizeResearcherSpikeFalsificationContractCoverage,
  validateResearcherSpikeFalsificationContract,
  validateResearcherSpikeFalsificationContractCoverage,
  validateResearcherSpikeFalsificationAgainstContract,
  RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES,
  FORGE_RESEARCHER_SPIKE_FALSIFICATION_CONTRACT_V1,
} from "./forge-p04-researcher-spike-falsification.js";

const REQUIRE_FULL_ALIGNMENT: Record<
  (typeof RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES)[number],
  boolean
> = {
  evidence_versioning: true,
  spike_signal: true,
  falsification_signal: true,
  baseline_link: true,
  boundary: true,
  failure_path: true,
  recovery_path: true,
  nogo_path: true,
};

describe("Forge Researcher Spike Falsification Contract — P04-B08-A02", () => {
  it("defines typed acceptance for all eight spike falsification categories", () => {
    const contract = getActiveResearcherSpikeFalsificationContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P04-B08-A06");

    for (const category of RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES) {
      const categoryContract = getResearcherSpikeFalsificationCategoryContract(category);
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

  it("maps 23 probes with two documented FAIL gap probes in typed contract", () => {
    const contract = getActiveResearcherSpikeFalsificationContract();
    const summary = summarizeResearcherSpikeFalsificationContractCoverage(contract);
    const coverage = validateResearcherSpikeFalsificationContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(validateResearcherSpikeFalsificationContract().valid, true);
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 21);
    assert.equal(summary.expectedFail, 2);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 2);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 0);
    assert.equal(summary.byCategory.evidence_versioning.probeCount, 3);
    assert.equal(summary.byCategory.spike_signal.probeCount, 3);
    assert.equal(summary.byCategory.falsification_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists documented gap probes as measurable baseline debt", () => {
    const gaps = listResearcherSpikeFalsificationProbesByDisposition("gap");
    const nogos = listResearcherSpikeFalsificationProbesByDisposition("nogo");

    assert.deepEqual(
      gaps.map(g => g.id).sort(),
      ["rsf.exported_spike_falsification_validator", "rsf.parser_spike_experiment"],
    );
    assert.deepEqual(nogos.map(g => g.id).sort(), []);
    assert.ok([...gaps].every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadResearcherSpikeFalsificationBaseline();
    const contract = getActiveResearcherSpikeFalsificationContract();
    const validation = validateResearcherSpikeFalsificationAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listResearcherSpikeFalsificationContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each spike falsification probe id is globally unique", () => {
    const ids = listResearcherSpikeFalsificationContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runResearcherSpikeFalsificationProbes();
    const contract = getActiveResearcherSpikeFalsificationContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveResearcherSpikeFalsificationContract();
    const flatIds = listResearcherSpikeFalsificationContractProbeIds(contract);
    const categoryIds = RESEARCHER_SPIKE_FALSIFICATION_CATEGORIES.flatMap(category =>
      listResearcherSpikeFalsificationContractProbesByCategory(category, contract).map(
        p => p.id,
      ),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("exports stable contract v1 reference for downstream block handoff", () => {
    assert.equal(FORGE_RESEARCHER_SPIKE_FALSIFICATION_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_RESEARCHER_SPIKE_FALSIFICATION_CONTRACT_V1.probes.length, 23);
  });
});
