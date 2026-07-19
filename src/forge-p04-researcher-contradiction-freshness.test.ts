import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherContradictionFreshnessBaseline,
  runResearcherContradictionFreshnessProbes,
  validateResearcherContradictionFreshnessBaseline,
  summarizeResearcherContradictionFreshnessMatrix,
  listResearcherContradictionFreshnessProbesByExpected,
  listResearcherContradictionFreshnessKnownGaps,
  assessContradictionFreshnessInputBoundary,
  validateContradictionFreshnessCollection,
  recoverContradictionFreshnessEvidence,
  getActiveResearcherContradictionFreshnessContract,
  getResearcherContradictionFreshnessCategoryContract,
  listResearcherContradictionFreshnessContractProbeIds,
  listResearcherContradictionFreshnessContractProbesByCategory,
  listResearcherContradictionFreshnessProbesByDisposition,
  summarizeResearcherContradictionFreshnessContractCoverage,
  validateResearcherContradictionFreshnessContract,
  validateResearcherContradictionFreshnessContractCoverage,
  validateResearcherContradictionFreshnessAgainstContract,
  validateResearcherContradictionFreshnessProbeMatrix,
  runResearcherContradictionFreshnessProductionSlice,
  resolveResearchContradictions,
  validateResearchFreshness,
  RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES,
  RESEARCHER_CONTRADICTION_FRESHNESS_INPUT_MAX_LENGTH,
  FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_CONTRACT_V1,
} from "./forge-p04-researcher-contradiction-freshness.js";

const REQUIRE_FULL_ALIGNMENT: Record<
  (typeof RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES)[number],
  boolean
> = {
  evidence_versioning: true,
  contradiction_signal: true,
  freshness_signal: true,
  baseline_link: true,
  boundary: true,
  failure_path: true,
  recovery_path: true,
  nogo_path: true,
};

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Researcher Contradiction Freshness — P04-B06-A01", () => {
  it("loads versioned contradiction freshness baseline aligned with P04-B05 block gate handoff", () => {
    const fixture = loadResearcherContradictionFreshnessBaseline();
    const validation = validateResearcherContradictionFreshnessBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P04-B06-A01");
    assert.equal(fixture.contractAtom, "P04-B06-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P04-B05-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures contradiction freshness probes with full alignment after A03 production slice", () => {
    const results = runResearcherContradictionFreshnessProbes();
    const summary = summarizeResearcherContradictionFreshnessMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listResearcherContradictionFreshnessProbesByExpected(
      "FAIL",
      loadResearcherContradictionFreshnessBaseline(),
    );
    assert.equal(documentedFail.length, 0);

    for (const cat of RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES) {
      assert.ok(summary.byCategory[cat], `missing category summary: ${cat}`);
      assert.ok(summary.byCategory[cat].total > 0, `${cat} has no probes`);
    }

    const passMismatches = results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(
      passMismatches.length,
      0,
      formatMismatchReport(passMismatches),
    );
  });

  it("documents zero remaining contradiction freshness gaps after production slice", () => {
    const gaps = listResearcherContradictionFreshnessKnownGaps(
      runResearcherContradictionFreshnessProbes(),
    );
    assert.deepEqual(gaps.map(g => g.id).sort(), []);
  });

  it("assessContradictionFreshnessInputBoundary rejects empty and null-byte evidence inputs", () => {
    const empty = assessContradictionFreshnessInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessContradictionFreshnessInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessContradictionFreshnessInputBoundary("evidence\0parse");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessContradictionFreshnessInputBoundary truncates oversized evidence inputs", () => {
    const longInput = "x".repeat(RESEARCHER_CONTRADICTION_FRESHNESS_INPUT_MAX_LENGTH + 500);
    const truncated = assessContradictionFreshnessInputBoundary(longInput);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(
      truncated.normalizedInput.length,
      RESEARCHER_CONTRADICTION_FRESHNESS_INPUT_MAX_LENGTH,
    );
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("validateContradictionFreshnessCollection accepts findings with claim and source citations", () => {
    const validation = validateContradictionFreshnessCollection("agent orchestration freshness", [
      {
        claim: "Tool-calling latency improved with caching",
        source: "https://example.com/benchmark",
        freshness: "pm",
      },
    ]);

    assert.equal(validation.valid, true, validation.issues.join("; "));
    assert.equal(validation.findingCount, 1);
  });

  it("recoverContradictionFreshnessEvidence restructures malformed parse into actionable resolution plan", () => {
    const recovery = recoverContradictionFreshnessEvidence(
      'CONTRADICTION: claim A vs claim B\nSTALE SOURCE: https://legacy.example.com/report (2020)',
      { topic: "contradiction freshness" },
    );

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.resolutionPlan.contradictions.length >= 1);
    assert.ok(recovery.resolutionPlan.staleSources.length >= 1);
  });
});

describe("Forge Researcher Contradiction Freshness Contract — P04-B06-A02", () => {
  it("defines typed acceptance for all eight contradiction freshness categories", () => {
    const contract = getActiveResearcherContradictionFreshnessContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P04-B06-A06");

    for (const category of RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES) {
      const categoryContract = getResearcherContradictionFreshnessCategoryContract(category);
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

  it("maps 23 probes with zero remaining gaps after A03 production slice", () => {
    const contract = getActiveResearcherContradictionFreshnessContract();
    const summary = summarizeResearcherContradictionFreshnessContractCoverage(contract);
    const coverage = validateResearcherContradictionFreshnessContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(validateResearcherContradictionFreshnessContract().valid, true);
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 17);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.evidence_versioning.probeCount, 3);
    assert.equal(summary.byCategory.contradiction_signal.probeCount, 3);
    assert.equal(summary.byCategory.freshness_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists zero remaining gap probes after A03 production slice", () => {
    const gaps = listResearcherContradictionFreshnessProbesByDisposition("gap");
    const nogos = listResearcherContradictionFreshnessProbesByDisposition("nogo");
    assert.deepEqual(gaps.map(g => g.id).sort(), []);
    assert.deepEqual(
      nogos.map(g => g.id).sort(),
      ["rcfr.exported_freshness_validator", "rcfr.resolve_contradiction_conflicts"],
    );
    assert.ok([...nogos].every(p => p.expected === "PASS"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadResearcherContradictionFreshnessBaseline();
    const contract = getActiveResearcherContradictionFreshnessContract();
    const validation = validateResearcherContradictionFreshnessAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listResearcherContradictionFreshnessContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each contradiction freshness probe id is globally unique", () => {
    const ids = listResearcherContradictionFreshnessContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runResearcherContradictionFreshnessProbes();
    const contract = getActiveResearcherContradictionFreshnessContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveResearcherContradictionFreshnessContract();
    const flatIds = listResearcherContradictionFreshnessContractProbeIds(contract);
    const categoryIds = RESEARCHER_CONTRADICTION_FRESHNESS_CATEGORIES.flatMap(category =>
      listResearcherContradictionFreshnessContractProbesByCategory(category, contract).map(
        p => p.id,
      ),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("exports stable contract v1 reference for downstream block handoff", () => {
    assert.equal(FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_CONTRACT_V1.probes.length, 23);
  });
});

describe("Forge Researcher Contradiction Freshness Production Slice — P04-B06-A03", () => {
  it("measures contradiction freshness probes with full alignment after A03 production slice", () => {
    const results = runResearcherContradictionFreshnessProbes();
    const summary = summarizeResearcherContradictionFreshnessMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listResearcherContradictionFreshnessProbesByExpected(
      "FAIL",
      loadResearcherContradictionFreshnessBaseline(),
    );
    assert.equal(documentedFail.length, 0);

    const passMismatches = results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(
      passMismatches.length,
      0,
      formatMismatchReport(passMismatches),
    );
  });

  it("resolveResearchContradictions exports contradiction resolution edges", () => {
    const resolution = resolveResearchContradictions(
      "CONTRADICTION: claim A vs claim B\nSTALE SOURCE: https://legacy.example.com/report (2020)",
      { topic: "contradiction freshness" },
    );

    assert.equal(resolution.resolved, true);
    assert.ok(resolution.edges.length >= 1);
    assert.ok(resolution.contradictionCount >= 1);
  });

  it("validateResearchFreshness accepts freshness signals in researcher output", () => {
    const validation = validateResearchFreshness(
      "FINDINGS: benchmark supports caching\nFRESHNESS: pm\nSOURCES: https://example.com/benchmark",
    );

    assert.equal(validation.valid, true, validation.issues.join("; "));
    assert.ok(validation.freshnessHints.includes("pm"));
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveResearcherContradictionFreshnessContract();
    const slice = runResearcherContradictionFreshnessProductionSlice();

    assert.equal(slice.atom, "P04-B06-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 23);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    const matrixValidation = validateResearcherContradictionFreshnessProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const resolveProbe = slice.results.find(r => r.id === "rcfr.resolve_contradiction_conflicts");
    assert.ok(resolveProbe);
    assert.equal(resolveProbe!.expected, "PASS");
    assert.equal(resolveProbe!.actual, "PASS");

    const freshnessProbe = slice.results.find(r => r.id === "rcfr.exported_freshness_validator");
    assert.ok(freshnessProbe);
    assert.equal(freshnessProbe!.expected, "PASS");
    assert.equal(freshnessProbe!.actual, "PASS");
  });
});
