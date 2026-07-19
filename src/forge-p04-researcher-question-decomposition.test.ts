import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherQuestionDecompositionBaseline,
  runResearcherQuestionDecompositionProbes,
  getActiveResearcherQuestionDecompositionContract,
  getResearcherQuestionDecompositionCategoryContract,
  listResearcherQuestionDecompositionContractProbeIds,
  listResearcherQuestionDecompositionContractProbesByCategory,
  listResearcherQuestionDecompositionProbesByDisposition,
  summarizeResearcherQuestionDecompositionContractCoverage,
  validateResearcherQuestionDecompositionContractCoverage,
  validateResearcherQuestionDecompositionAgainstContract,
  RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES,
  FORGE_RESEARCHER_QUESTION_DECOMPOSITION_CONTRACT_V1,
} from "./forge-p04-researcher-question-decomposition.js";

const REQUIRE_FULL_ALIGNMENT: Record<
  (typeof RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES)[number],
  boolean
> = {
  question_versioning: true,
  question_signal: false,
  subquery_signal: false,
  baseline_link: true,
  boundary: true,
  failure_path: true,
  recovery_path: true,
  nogo_path: false,
};

describe("Forge Researcher Question Decomposition Contract — P04-B01-A02", () => {
  it("defines typed acceptance for all eight question decomposition categories", () => {
    const contract = getActiveResearcherQuestionDecompositionContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P04-B01-A06");

    for (const category of RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES) {
      const categoryContract = getResearcherQuestionDecompositionCategoryContract(category);
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

  it("maps 25 probes with zero remaining gaps after A03 production slice", () => {
    const contract = getActiveResearcherQuestionDecompositionContract();
    const summary = summarizeResearcherQuestionDecompositionContractCoverage(contract);
    const coverage = validateResearcherQuestionDecompositionContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 25);
    assert.equal(summary.expectedPass, 25);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 18);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 3);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.question_versioning.probeCount, 3);
    assert.equal(summary.byCategory.question_signal.probeCount, 5);
    assert.equal(summary.byCategory.subquery_signal.probeCount, 4);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 4);
    assert.equal(summary.byCategory.failure_path.probeCount, 3);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists zero remaining gap probes after A03 production slice", () => {
    const gaps = listResearcherQuestionDecompositionProbesByDisposition("gap");
    const nogos = listResearcherQuestionDecompositionProbesByDisposition("nogo");
    assert.deepEqual(gaps.map(p => p.id).sort(), []);
    assert.deepEqual(
      nogos.map(p => p.id).sort(),
      ["rques.exported_orchestrator_question_validator", "rques.nogo_empty_question_halt"],
    );
    assert.ok([...gaps, ...nogos].every(p => p.expected === "PASS"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadResearcherQuestionDecompositionBaseline();
    const contract = getActiveResearcherQuestionDecompositionContract();
    const validation = validateResearcherQuestionDecompositionAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listResearcherQuestionDecompositionContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each researcher question decomposition probe id is globally unique", () => {
    const ids = listResearcherQuestionDecompositionContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runResearcherQuestionDecompositionProbes();
    const contract = getActiveResearcherQuestionDecompositionContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveResearcherQuestionDecompositionContract();
    const flatIds = listResearcherQuestionDecompositionContractProbeIds(contract);
    const categoryIds = RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES.flatMap(category =>
      listResearcherQuestionDecompositionContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("exports stable contract v1 reference for downstream block handoff", () => {
    assert.equal(FORGE_RESEARCHER_QUESTION_DECOMPOSITION_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_RESEARCHER_QUESTION_DECOMPOSITION_CONTRACT_V1.probes.length, 25);
  });
});
