import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherResearchToWorkerHandoffBaseline,
  runResearcherResearchToWorkerHandoffProbes,
  getActiveResearcherResearchToWorkerHandoffContract,
  getResearcherResearchToWorkerHandoffCategoryContract,
  listResearcherResearchToWorkerHandoffContractProbeIds,
  listResearcherResearchToWorkerHandoffContractProbesByCategory,
  listResearcherResearchToWorkerHandoffProbesByDisposition,
  summarizeResearcherResearchToWorkerHandoffContractCoverage,
  validateResearcherResearchToWorkerHandoffContract,
  validateResearcherResearchToWorkerHandoffContractCoverage,
  validateResearcherResearchToWorkerHandoffAgainstContract,
  RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES,
  FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CONTRACT_V1,
} from "./forge-p04-researcher-research-to-worker-handoff.js";

const REQUIRE_FULL_ALIGNMENT: Record<
  (typeof RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES)[number],
  boolean
> = {
  evidence_versioning: true,
  handoff_signal: true,
  worker_context_signal: true,
  baseline_link: true,
  boundary: true,
  failure_path: true,
  recovery_path: true,
  nogo_path: true,
};

describe("Forge Researcher Research-to-Worker Handoff Contract — P04-B09-A02", () => {
  it("defines typed acceptance for all eight research-to-worker handoff categories", () => {
    const contract = getActiveResearcherResearchToWorkerHandoffContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P04-B09-A06");

    for (const category of RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES) {
      const categoryContract = getResearcherResearchToWorkerHandoffCategoryContract(category);
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

  it("maps 23 probes with two documented FAIL nogo gaps in typed contract", () => {
    const contract = getActiveResearcherResearchToWorkerHandoffContract();
    const summary = summarizeResearcherResearchToWorkerHandoffContractCoverage(contract);
    const coverage = validateResearcherResearchToWorkerHandoffContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(validateResearcherResearchToWorkerHandoffContract().valid, true);
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 21);
    assert.equal(summary.expectedFail, 2);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.evidence_versioning.probeCount, 3);
    assert.equal(summary.byCategory.handoff_signal.probeCount, 3);
    assert.equal(summary.byCategory.worker_context_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists documented nogo probes as measurable baseline debt", () => {
    const gaps = listResearcherResearchToWorkerHandoffProbesByDisposition("gap");
    const nogos = listResearcherResearchToWorkerHandoffProbesByDisposition("nogo");

    assert.deepEqual(gaps.map(g => g.id).sort(), []);
    assert.deepEqual(
      nogos.map(g => g.id).sort(),
      ["rtwh.exported_handoff_validator", "rtwh.parser_research_handoff_bundle"],
    );
    assert.ok([...nogos].every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadResearcherResearchToWorkerHandoffBaseline();
    const contract = getActiveResearcherResearchToWorkerHandoffContract();
    const validation = validateResearcherResearchToWorkerHandoffAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listResearcherResearchToWorkerHandoffContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each research-to-worker handoff probe id is globally unique", () => {
    const ids = listResearcherResearchToWorkerHandoffContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runResearcherResearchToWorkerHandoffProbes();
    const contract = getActiveResearcherResearchToWorkerHandoffContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveResearcherResearchToWorkerHandoffContract();
    const flatIds = listResearcherResearchToWorkerHandoffContractProbeIds(contract);
    const categoryIds = RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES.flatMap(category =>
      listResearcherResearchToWorkerHandoffContractProbesByCategory(category, contract).map(
        p => p.id,
      ),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("exports stable contract v1 reference for downstream block handoff", () => {
    assert.equal(FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CONTRACT_V1.probes.length, 23);
  });
});
