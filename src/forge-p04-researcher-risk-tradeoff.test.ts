import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherRiskTradeoffBaseline,
  runResearcherRiskTradeoffProbes,
  validateResearcherRiskTradeoffBaseline,
  validateResearcherRiskTradeoffProbeMatrix,
  summarizeResearcherRiskTradeoffMatrix,
  listResearcherRiskTradeoffProbesByExpected,
  listResearcherRiskTradeoffKnownGaps,
  assessResearchRiskTradeoffInputBoundary,
  validateResearchRiskTradeoffCollection,
  recoverResearchRiskTradeoffEvidence,
  getActiveResearcherRiskTradeoffContract,
  getResearcherRiskTradeoffCategoryContract,
  listResearcherRiskTradeoffContractProbeIds,
  listResearcherRiskTradeoffContractProbesByCategory,
  listResearcherRiskTradeoffProbesByDisposition,
  summarizeResearcherRiskTradeoffContractCoverage,
  validateResearcherRiskTradeoffContract,
  validateResearcherRiskTradeoffContractCoverage,
  validateResearcherRiskTradeoffAgainstContract,
  RESEARCHER_RISK_TRADEOFF_CATEGORIES,
  RESEARCHER_RISK_TRADEOFF_INPUT_MAX_LENGTH,
  FORGE_RESEARCHER_RISK_TRADEOFF_CONTRACT_V1,
} from "./forge-p04-researcher-risk-tradeoff.js";

const REQUIRE_FULL_ALIGNMENT: Record<
  (typeof RESEARCHER_RISK_TRADEOFF_CATEGORIES)[number],
  boolean
> = {
  evidence_versioning: true,
  risk_signal: true,
  tradeoff_signal: false,
  baseline_link: true,
  boundary: true,
  failure_path: true,
  recovery_path: true,
  nogo_path: false,
};

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Researcher Risk Trade-off — P04-B07-A01", () => {
  it("loads versioned risk trade-off baseline aligned with P04-B06 block gate handoff", () => {
    const fixture = loadResearcherRiskTradeoffBaseline();
    const validation = validateResearcherRiskTradeoffBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P04-B07-A01");
    assert.equal(fixture.contractAtom, "P04-B07-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P04-B06-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.contradictionFreshnessProbeCount, 23);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures risk trade-off probes with documented FAIL gaps from B06 sealed handoff", () => {
    const results = runResearcherRiskTradeoffProbes();
    const summary = summarizeResearcherRiskTradeoffMatrix(results);
    const contract = getActiveResearcherRiskTradeoffContract();
    const matrixValidation = validateResearcherRiskTradeoffProbeMatrix(results, contract);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");
    assert.equal(matrixValidation.unexpectedMismatches, 0);

    const documentedFail = listResearcherRiskTradeoffProbesByExpected(
      "FAIL",
      loadResearcherRiskTradeoffBaseline(),
    );
    assert.equal(documentedFail.length, 4);
    assert.ok(documentedFail.some(p => p.id === "rrto.researcher_tradeoffs_output_field"));
    assert.ok(documentedFail.some(p => p.id === "rrto.exported_risk_tradeoff_validator"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of RESEARCHER_RISK_TRADEOFF_CATEGORIES) {
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

  it("documents risk trade-off gaps as measurable baseline debt", () => {
    const gaps = listResearcherRiskTradeoffKnownGaps(runResearcherRiskTradeoffProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "rrto.exported_risk_tradeoff_validator",
      "rrto.orchestrator_risk_tradeoff_gate",
      "rrto.parse_research_tradeoffs",
      "rrto.researcher_tradeoffs_output_field",
    ]);
    assert.ok(
      gaps.every(g => RESEARCHER_RISK_TRADEOFF_CATEGORIES.includes(g.category)),
      "documented gaps are risk trade-off probes",
    );
  });

  it("assessResearchRiskTradeoffInputBoundary rejects empty and null-byte research inputs", () => {
    const empty = assessResearchRiskTradeoffInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessResearchRiskTradeoffInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessResearchRiskTradeoffInputBoundary("research\0parse");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessResearchRiskTradeoffInputBoundary truncates oversized research inputs", () => {
    const longInput = "x".repeat(RESEARCHER_RISK_TRADEOFF_INPUT_MAX_LENGTH + 500);
    const truncated = assessResearchRiskTradeoffInputBoundary(longInput);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedInput.length, RESEARCHER_RISK_TRADEOFF_INPUT_MAX_LENGTH);
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("validateResearchRiskTradeoffCollection accepts findings with risk claims", () => {
    const validation = validateResearchRiskTradeoffCollection("agent orchestration risk analysis", [
      {
        claim: "Unbounded concurrency increases tail latency",
        severity: "medium",
        mitigation: "Apply bounded worker pool",
      },
    ]);

    assert.equal(validation.valid, true, validation.issues.join("; "));
    assert.equal(validation.findingCount, 1);
  });

  it("validateResearchRiskTradeoffCollection rejects zero-hit topics", () => {
    const validation = validateResearchRiskTradeoffCollection("valid topic", []);
    assert.equal(validation.valid, false);
    assert.ok(validation.issues.some(issue => issue.includes("zero risk/trade-off findings")));
  });

  it("recoverResearchRiskTradeoffEvidence restructures malformed risk/trade-off parse", () => {
    const recovery = recoverResearchRiskTradeoffEvidence(
      "RISK: Token budget overrun (high)\ntradeoff: speed vs cost\nFINDINGS: partial",
    );

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.researchPlan.risks.length >= 1);
    assert.ok(recovery.researchPlan.tradeoffs.some(t => t.includes("speed")));
  });

  it("recoverResearchRiskTradeoffEvidence rejects null-byte and empty parse safely", () => {
    const emptyRecovery = recoverResearchRiskTradeoffEvidence("");
    assert.equal(emptyRecovery.recovered, false);
    assert.deepEqual(emptyRecovery.parseErrors, ["empty"]);

    const nullRecovery = recoverResearchRiskTradeoffEvidence("research\0parse");
    assert.equal(nullRecovery.recovered, false);
    assert.deepEqual(nullRecovery.parseErrors, ["contains_null_byte"]);
  });
});

describe("Forge Researcher Risk Trade-off Contract — P04-B07-A02", () => {
  it("defines typed acceptance for all eight risk trade-off categories", () => {
    const contract = getActiveResearcherRiskTradeoffContract();
    assert.equal(contract.version, "1.0.0");
    assert.equal(contract.atom, "P04-B07-A06");

    for (const category of RESEARCHER_RISK_TRADEOFF_CATEGORIES) {
      const categoryContract = getResearcherRiskTradeoffCategoryContract(category);
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

  it("maps 23 probes with four documented FAIL gaps wired to risk, trade-off and nogo paths", () => {
    const contract = getActiveResearcherRiskTradeoffContract();
    const summary = summarizeResearcherRiskTradeoffContractCoverage(contract);
    const coverage = validateResearcherRiskTradeoffContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(validateResearcherRiskTradeoffContract().valid, true);
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 19);
    assert.equal(summary.expectedFail, 4);
    assert.equal(summary.byDisposition.observed, 15);
    assert.equal(summary.byDisposition.gap, 2);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 2);
    assert.equal(summary.byCategory.evidence_versioning.probeCount, 3);
    assert.equal(summary.byCategory.risk_signal.probeCount, 3);
    assert.equal(summary.byCategory.tradeoff_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists four gap and nogo probes with measurable FAIL dispositions", () => {
    const gaps = listResearcherRiskTradeoffProbesByDisposition("gap");
    const nogos = listResearcherRiskTradeoffProbesByDisposition("nogo");
    assert.deepEqual(gaps.map(g => g.id).sort(), [
      "rrto.parse_research_tradeoffs",
      "rrto.researcher_tradeoffs_output_field",
    ]);
    assert.deepEqual(nogos.map(g => g.id).sort(), [
      "rrto.exported_risk_tradeoff_validator",
      "rrto.orchestrator_risk_tradeoff_gate",
    ]);
    assert.ok([...gaps, ...nogos].every(p => p.expected === "FAIL"));
  });

  it("enforces fixture ↔ contract probe mapping with category alignment", () => {
    const fixture = loadResearcherRiskTradeoffBaseline();
    const contract = getActiveResearcherRiskTradeoffContract();
    const validation = validateResearcherRiskTradeoffAgainstContract(fixture, contract);

    assert.equal(
      validation.valid,
      true,
      validation.issues.map(i => `${i.kind}:${i.probeId ?? i.category ?? ""}: ${i.detail}`).join("\n"),
    );

    const contractIds = new Set(listResearcherRiskTradeoffContractProbeIds(contract));
    const fixtureIds = fixture.probes.map(p => p.id);
    assert.deepEqual([...fixtureIds].sort(), [...contractIds].sort());
    assert.equal(fixture.contractAtom, contract.atom);
  });

  it("each risk trade-off probe id is globally unique", () => {
    const ids = listResearcherRiskTradeoffContractProbeIds();
    assert.equal(new Set(ids).size, ids.length);
  });

  it("wires harness probe criteria from typed contract source of truth", () => {
    const results = runResearcherRiskTradeoffProbes();
    const contract = getActiveResearcherRiskTradeoffContract();

    assert.equal(results.length, contract.probes.length);
    for (const result of results) {
      const contractProbe = contract.probes.find(p => p.id === result.id)!;
      assert.ok(result.criterion, `${result.id} missing criterion from contract wiring`);
      assert.equal(result.criterion, contractProbe.criterion);
    }
  });

  it("category contracts expose probes matching flat contract list", () => {
    const contract = getActiveResearcherRiskTradeoffContract();
    const flatIds = listResearcherRiskTradeoffContractProbeIds(contract);
    const categoryIds = RESEARCHER_RISK_TRADEOFF_CATEGORIES.flatMap(category =>
      listResearcherRiskTradeoffContractProbesByCategory(category, contract).map(p => p.id),
    );
    assert.deepEqual(categoryIds, flatIds);
  });

  it("exports stable contract v1 reference for downstream block handoff", () => {
    assert.equal(FORGE_RESEARCHER_RISK_TRADEOFF_CONTRACT_V1.version, "1.0.0");
    assert.equal(FORGE_RESEARCHER_RISK_TRADEOFF_CONTRACT_V1.probes.length, 23);
  });
});
