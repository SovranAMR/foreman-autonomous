import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runResearcherPhaseGateProbes } from "./forge-p04-researcher-phase-gate.probe.js";
import {
  loadResearcherPhaseGateBaseline,
  getActiveResearcherPhaseGateContract,
  getResearcherPhaseGateCategoryContract,
  listResearcherPhaseGateContractProbeIds,
  listResearcherPhaseGateContractProbesByCategory,
  listResearcherPhaseGateProbesByDisposition,
  summarizeResearcherPhaseGateContractCoverage,
  validateResearcherPhaseGateContract,
  validateResearcherPhaseGateContractCoverage,
  validateResearcherPhaseGateAgainstContract,
  RESEARCHER_PHASE_GATE_CATEGORIES,
  FORGE_RESEARCHER_PHASE_GATE_CONTRACT_V1,
  FORGE_RESEARCHER_PHASE_GATE_VERSION,
} from "./forge-p04-researcher-phase-gate.js";

const REQUIRE_FULL_ALIGNMENT: Record<
  (typeof RESEARCHER_PHASE_GATE_CATEGORIES)[number],
  boolean
> = {
  phase_versioning: true,
  block_gate_signal: true,
  phase_inventory: true,
  baseline_link: true,
  boundary: true,
  failure_path: true,
  recovery_path: true,
  nogo_path: true,
};

describe("Forge Researcher Phase Gate Contract — P04-B10-A02", () => {
  it("defines typed acceptance for all eight researcher phase gate categories", () => {
    const contract = getActiveResearcherPhaseGateContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P04-B10-A02");

    for (const category of RESEARCHER_PHASE_GATE_CATEGORIES) {
      const categoryContract = getResearcherPhaseGateCategoryContract(category);
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

  it("maps 24 probes with full alignment after A03 production slice", () => {
    const contract = getActiveResearcherPhaseGateContract();
    const summary = summarizeResearcherPhaseGateContractCoverage(contract);
    const coverage = validateResearcherPhaseGateContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(validateResearcherPhaseGateContract().valid, true);
    assert.equal(summary.totalProbes, 24);
    assert.equal(summary.expectedPass, 24);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 3);
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

  it("lists zero remaining gap probes after A03 orchestrator wiring", () => {
    const gaps = listResearcherPhaseGateProbesByDisposition("gap");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadResearcherPhaseGateBaseline();
    const contract = getActiveResearcherPhaseGateContract();
    const validation = validateResearcherPhaseGateAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listResearcherPhaseGateContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each researcher phase gate probe id is globally unique", () => {
    const ids = listResearcherPhaseGateContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runResearcherPhaseGateProbes();
    const contract = getActiveResearcherPhaseGateContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveResearcherPhaseGateContract();
    const flatIds = listResearcherPhaseGateContractProbeIds(contract);
    const categoryIds = RESEARCHER_PHASE_GATE_CATEGORIES.flatMap(category =>
      listResearcherPhaseGateContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("exports stable contract v1 reference aligned with baseline probe matrix", () => {
    const fixture = loadResearcherPhaseGateBaseline();
    const contract = getActiveResearcherPhaseGateContract();
    assert.equal(FORGE_RESEARCHER_PHASE_GATE_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_RESEARCHER_PHASE_GATE_CONTRACT_V1.atom, "P04-B10-A02");
    assert.equal(FORGE_RESEARCHER_PHASE_GATE_CONTRACT_V1.probes.length, 24);
    assert.equal(FORGE_RESEARCHER_PHASE_GATE_CONTRACT_V1.probes.length, fixture.probes.length);
    assert.equal(FORGE_RESEARCHER_PHASE_GATE_VERSION, contract.version);
  });
});
