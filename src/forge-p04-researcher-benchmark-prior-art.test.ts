import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherBenchmarkPriorArtBaseline,
  runResearcherBenchmarkPriorArtProbes,
  getActiveResearcherBenchmarkPriorArtContract,
  getResearcherBenchmarkPriorArtCategoryContract,
  listResearcherBenchmarkPriorArtContractProbeIds,
  listResearcherBenchmarkPriorArtContractProbesByCategory,
  listResearcherBenchmarkPriorArtProbesByDisposition,
  summarizeResearcherBenchmarkPriorArtContractCoverage,
  validateResearcherBenchmarkPriorArtContractCoverage,
  validateResearcherBenchmarkPriorArtAgainstContract,
  RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES,
  FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_CONTRACT_V1,
} from "./forge-p04-researcher-benchmark-prior-art.js";

const REQUIRE_FULL_ALIGNMENT: Record<
  (typeof RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES)[number],
  boolean
> = {
  evidence_versioning: true,
  benchmark_signal: true,
  prior_art_signal: true,
  baseline_link: true,
  boundary: true,
  failure_path: true,
  recovery_path: false,
  nogo_path: true,
};

describe("Forge Researcher Benchmark Prior-Art Contract — P04-B04-A02", () => {
  it("defines typed acceptance for all eight benchmark prior-art categories", () => {
    const contract = getActiveResearcherBenchmarkPriorArtContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P04-B04-A06");

    for (const category of RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES) {
      const categoryContract = getResearcherBenchmarkPriorArtCategoryContract(category);
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

  it("maps 23 probes with zero documented FAIL gaps after recoverBenchmarkPriorArtEvidence slice", () => {
    const contract = getActiveResearcherBenchmarkPriorArtContract();
    const summary = summarizeResearcherBenchmarkPriorArtContractCoverage(contract);
    const coverage = validateResearcherBenchmarkPriorArtContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 16);
    assert.equal(summary.byDisposition.gap, 1);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.evidence_versioning.probeCount, 3);
    assert.equal(summary.byCategory.benchmark_signal.probeCount, 3);
    assert.equal(summary.byCategory.prior_art_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists documented gap probes after recoverBenchmarkPriorArtEvidence production slice", () => {
    const gaps = listResearcherBenchmarkPriorArtProbesByDisposition("gap");
    assert.deepEqual(
      gaps.map(g => g.id).sort(),
      ["rbpa.known_gaps_documented"],
    );
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadResearcherBenchmarkPriorArtBaseline();
    const contract = getActiveResearcherBenchmarkPriorArtContract();
    const validation = validateResearcherBenchmarkPriorArtAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listResearcherBenchmarkPriorArtContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each benchmark prior-art probe id is globally unique", () => {
    const ids = listResearcherBenchmarkPriorArtContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runResearcherBenchmarkPriorArtProbes();
    const contract = getActiveResearcherBenchmarkPriorArtContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveResearcherBenchmarkPriorArtContract();
    const flatIds = listResearcherBenchmarkPriorArtContractProbeIds(contract);
    const categoryIds = RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES.flatMap(category =>
      listResearcherBenchmarkPriorArtContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("exports stable contract v1 reference for downstream block handoff", () => {
    assert.equal(FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_CONTRACT_V1.probes.length, 23);
  });
});
