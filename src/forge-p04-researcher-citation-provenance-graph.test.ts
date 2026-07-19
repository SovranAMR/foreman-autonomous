import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherCitationProvenanceGraphBaseline,
  runResearcherCitationProvenanceGraphProbes,
  getActiveResearcherCitationProvenanceGraphContract,
  getResearcherCitationProvenanceGraphCategoryContract,
  listResearcherCitationProvenanceGraphContractProbeIds,
  listResearcherCitationProvenanceGraphContractProbesByCategory,
  listResearcherCitationProvenanceGraphProbesByDisposition,
  summarizeResearcherCitationProvenanceGraphContractCoverage,
  validateResearcherCitationProvenanceGraphContract,
  validateResearcherCitationProvenanceGraphContractCoverage,
  validateResearcherCitationProvenanceGraphAgainstContract,
  RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES,
  FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_CONTRACT_V1,
} from "./forge-p04-researcher-citation-provenance-graph.js";

const REQUIRE_FULL_ALIGNMENT: Record<
  (typeof RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES)[number],
  boolean
> = {
  evidence_versioning: true,
  citation_signal: true,
  provenance_graph_signal: true,
  baseline_link: true,
  boundary: true,
  failure_path: true,
  recovery_path: true,
  nogo_path: true,
};

describe("Forge Researcher Citation Provenance Graph Contract — P04-B05-A02", () => {
  it("defines typed acceptance for all eight citation provenance graph categories", () => {
    const contract = getActiveResearcherCitationProvenanceGraphContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P04-B05-A06");

    for (const category of RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES) {
      const categoryContract = getResearcherCitationProvenanceGraphCategoryContract(category);
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

  it("maps 23 probes with four documented FAIL gaps in typed contract", () => {
    const contract = getActiveResearcherCitationProvenanceGraphContract();
    const summary = summarizeResearcherCitationProvenanceGraphContractCoverage(contract);
    const coverage = validateResearcherCitationProvenanceGraphContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(validateResearcherCitationProvenanceGraphContract().valid, true);
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 19);
    assert.equal(summary.expectedFail, 4);
    assert.equal(summary.byDisposition.observed, 15);
    assert.equal(summary.byDisposition.gap, 2);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.evidence_versioning.probeCount, 3);
    assert.equal(summary.byCategory.citation_signal.probeCount, 3);
    assert.equal(summary.byCategory.provenance_graph_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists documented gap and nogo probes as measurable baseline debt", () => {
    const gaps = listResearcherCitationProvenanceGraphProbesByDisposition("gap");
    const nogos = listResearcherCitationProvenanceGraphProbesByDisposition("nogo");

    assert.deepEqual(
      gaps.map(g => g.id).sort(),
      ["rcpg.build_research_citation_graph", "rcpg.researcher_sources_prompt"],
    );
    assert.deepEqual(
      nogos.map(g => g.id).sort(),
      ["rcpg.exported_citation_graph_validator", "rcpg.parser_citation_edges"],
    );
    assert.ok([...gaps, ...nogos].every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadResearcherCitationProvenanceGraphBaseline();
    const contract = getActiveResearcherCitationProvenanceGraphContract();
    const validation = validateResearcherCitationProvenanceGraphAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listResearcherCitationProvenanceGraphContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each citation provenance graph probe id is globally unique", () => {
    const ids = listResearcherCitationProvenanceGraphContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runResearcherCitationProvenanceGraphProbes();
    const contract = getActiveResearcherCitationProvenanceGraphContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveResearcherCitationProvenanceGraphContract();
    const flatIds = listResearcherCitationProvenanceGraphContractProbeIds(contract);
    const categoryIds = RESEARCHER_CITATION_PROVENANCE_GRAPH_CATEGORIES.flatMap(category =>
      listResearcherCitationProvenanceGraphContractProbesByCategory(category, contract).map(
        p => p.id,
      ),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("exports stable contract v1 reference for downstream block handoff", () => {
    assert.equal(FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_RESEARCHER_CITATION_PROVENANCE_GRAPH_CONTRACT_V1.probes.length, 23);
  });
});
