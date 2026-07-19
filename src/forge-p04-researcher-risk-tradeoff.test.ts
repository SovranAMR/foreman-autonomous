import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseResearchTradeoffs } from "./parser.js";
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
  validateResearchRiskTradeoff,
  validateResearcherRiskTradeoffAgainstContract,
  runResearcherRiskTradeoffProductionSlice,
  runResearcherRiskTradeoffBoundarySlice,
  validateResearcherRiskTradeoffBoundaryProbeMatrix,
  runResearcherRiskTradeoffFailureRecoverySlice,
  validateResearcherRiskTradeoffFailureRecoveryProbeMatrix,
  listResearcherRiskTradeoffFailureRecoveryProbeIds,
  buildResearcherRiskTradeoffProbeEvidence,
  buildResearcherRiskTradeoffProbeTelemetry,
  buildResearcherRiskTradeoffProvenance,
  buildResearcherRiskTradeoffRunRecord,
  validateResearcherRiskTradeoffEvidenceRunRecord,
  runResearcherRiskTradeoffEvidenceSlice,
  runResearcherRiskTradeoffFailureRecoverySliceWithRecord,
  FORGE_RESEARCHER_RISK_TRADEOFF_VERSION,
  RESEARCHER_RISK_TRADEOFF_FAILURE_RECOVERY_CATEGORIES,
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
  tradeoff_signal: true,
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

  it("measures risk trade-off probes with full alignment after A03 production slice", () => {
    const results = runResearcherRiskTradeoffProbes();
    const summary = summarizeResearcherRiskTradeoffMatrix(results);
    const contract = getActiveResearcherRiskTradeoffContract();
    const matrixValidation = validateResearcherRiskTradeoffProbeMatrix(results, contract);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listResearcherRiskTradeoffProbesByExpected(
      "FAIL",
      loadResearcherRiskTradeoffBaseline(),
    );
    assert.equal(documentedFail.length, 0);
    assert.equal(matrixValidation.unexpectedMismatches, 0);

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

  it("documents zero remaining risk trade-off gaps after A03 production slice", () => {
    const gaps = listResearcherRiskTradeoffKnownGaps(runResearcherRiskTradeoffProbes());
    assert.equal(gaps.length, 0);
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

  it("maps 23 probes with zero remaining gaps after A03 production slice", () => {
    const contract = getActiveResearcherRiskTradeoffContract();
    const summary = summarizeResearcherRiskTradeoffContractCoverage(contract);
    const coverage = validateResearcherRiskTradeoffContractCoverage(contract);

    assert.equal(coverage.valid, true, coverage.issues.map(i => i.detail).join("\n"));
    assert.equal(validateResearcherRiskTradeoffContract().valid, true);
    assert.equal(summary.totalProbes, 23);
    assert.equal(summary.expectedPass, 23);
    assert.equal(summary.expectedFail, 0);
    assert.equal(summary.byDisposition.observed, 19);
    assert.equal(summary.byDisposition.gap, 0);
    assert.equal(summary.byDisposition.failure, 2);
    assert.equal(summary.byDisposition.recovery, 2);
    assert.equal(summary.byDisposition.nogo, 0);
    assert.equal(summary.byCategory.evidence_versioning.probeCount, 3);
    assert.equal(summary.byCategory.risk_signal.probeCount, 3);
    assert.equal(summary.byCategory.tradeoff_signal.probeCount, 3);
    assert.equal(summary.byCategory.baseline_link.probeCount, 2);
    assert.equal(summary.byCategory.boundary.probeCount, 6);
    assert.equal(summary.byCategory.failure_path.probeCount, 2);
    assert.equal(summary.byCategory.recovery_path.probeCount, 2);
    assert.equal(summary.byCategory.nogo_path.probeCount, 2);
  });

  it("lists zero remaining gap and nogo probes after A03 production slice", () => {
    const gaps = listResearcherRiskTradeoffProbesByDisposition("gap");
    const nogos = listResearcherRiskTradeoffProbesByDisposition("nogo");
    assert.equal(gaps.length, 0);
    assert.equal(nogos.length, 0);
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

describe("Forge Researcher Risk Trade-off Production Slice — P04-B07-A03", () => {
  it("parseResearchTradeoffs extracts structured trade-off dimensions", () => {
    const parsed = parseResearchTradeoffs(
      "FINDINGS: async reduces blocking\nTRADEOFFS:\n1. sync vs async latency\nRISKS: complexity (medium) — bounded pool",
    );

    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.ok(parsed.data.dimensions.some(d => d.dimension.includes("sync")));
    }
  });

  it("validateResearchRiskTradeoff accepts risk and trade-off signals in researcher output", () => {
    const validation = validateResearchRiskTradeoff(
      "FINDINGS: benchmark supports caching\nTRADEOFFS:\n1. memory vs latency\nRISKS: stale cache (low) — TTL invalidation",
    );

    assert.equal(validation.valid, true, validation.issues.join("; "));
    assert.equal(validation.riskPresent, true);
    assert.ok(validation.tradeoffCount >= 1);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveResearcherRiskTradeoffContract();
    const slice = runResearcherRiskTradeoffProductionSlice();

    assert.equal(slice.atom, "P04-B07-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 23);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    const matrixValidation = validateResearcherRiskTradeoffProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const tradeoffProbe = slice.results.find(r => r.id === "rrto.parse_research_tradeoffs");
    assert.ok(tradeoffProbe);
    assert.equal(tradeoffProbe!.expected, "PASS");
    assert.equal(tradeoffProbe!.actual, "PASS");

    const validatorProbe = slice.results.find(r => r.id === "rrto.exported_risk_tradeoff_validator");
    assert.ok(validatorProbe);
    assert.equal(validatorProbe!.expected, "PASS");
    assert.equal(validatorProbe!.actual, "PASS");
  });
});

describe("Forge Researcher Risk Trade-off Boundary Slice — P04-B07-A04", () => {
  it("defines six boundary probes with research input edge-case criteria", () => {
    const boundary = listResearcherRiskTradeoffContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "rrto.empty_research_input_boundary",
      "rrto.known_gaps_documented",
      "rrto.long_research_input_truncation_boundary",
      "rrto.probe_runner_exported",
      "rrto.source_block_gate_ref",
      "rrto.whitespace_research_input_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on research edge probes", () => {
    const contract = getActiveResearcherRiskTradeoffContract();
    const slice = runResearcherRiskTradeoffBoundarySlice();

    assert.equal(slice.atom, "P04-B07-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listResearcherRiskTradeoffContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateResearcherRiskTradeoffBoundaryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("assessResearchRiskTradeoffInputBoundary edge cases align with boundary probe matrix", () => {
    const slice = runResearcherRiskTradeoffBoundarySlice();
    const researchProbes = [
      "rrto.empty_research_input_boundary",
      "rrto.whitespace_research_input_boundary",
      "rrto.long_research_input_truncation_boundary",
    ] as const;

    for (const probeId of researchProbes) {
      const result = slice.boundaryResults.find(r => r.id === probeId);
      assert.ok(result, `missing ${probeId}`);
      assert.equal(result!.actual, "PASS");
      assert.equal(result!.aligned, true);
    }
  });

  it("validateResearchRiskTradeoff and recoverResearchRiskTradeoffEvidence reject invalid boundary inputs", () => {
    const emptyValidation = validateResearchRiskTradeoff("");
    assert.equal(emptyValidation.valid, false);
    assert.ok(emptyValidation.issues.length > 0);

    const whitespaceValidation = validateResearchRiskTradeoff("   \t\n  ");
    assert.equal(whitespaceValidation.valid, false);
    assert.equal(whitespaceValidation.tradeoffCount, 0);

    const nullByteValidation = validateResearchRiskTradeoff("research\0parse");
    assert.equal(nullByteValidation.valid, false);

    const emptyRecovery = recoverResearchRiskTradeoffEvidence("");
    assert.equal(emptyRecovery.recovered, false);
    assert.deepEqual(emptyRecovery.parseErrors, ["empty"]);

    const whitespaceRecovery = recoverResearchRiskTradeoffEvidence("   \t\n  ");
    assert.equal(whitespaceRecovery.recovered, false);
    assert.deepEqual(whitespaceRecovery.parseErrors, ["whitespace_only"]);
  });

  it("assessResearchRiskTradeoffInputBoundary accepts exact max-length research input", () => {
    const exactMax = "x".repeat(RESEARCHER_RISK_TRADEOFF_INPUT_MAX_LENGTH);
    const boundary = assessResearchRiskTradeoffInputBoundary(exactMax);

    assert.equal(boundary.acceptable, true);
    assert.equal(boundary.truncated, false);
    assert.equal(boundary.disposition, "valid");
    assert.equal(boundary.normalizedInput.length, RESEARCHER_RISK_TRADEOFF_INPUT_MAX_LENGTH);

    const collection = validateResearchRiskTradeoffCollection(exactMax, [
      {
        claim: "exact max length topic accepted",
        severity: "low",
        mitigation: "monitor",
      },
    ]);
    assert.equal(collection.valid, true, collection.issues.join("; "));
  });
});

describe("Forge Researcher Risk Trade-off Failure/Recovery Slice — P04-B07-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three path categories", () => {
    const contract = getActiveResearcherRiskTradeoffContract();
    const failure = listResearcherRiskTradeoffContractProbesByCategory(
      "failure_path",
      contract,
    );
    const recovery = listResearcherRiskTradeoffContractProbesByCategory(
      "recovery_path",
      contract,
    );
    const nogo = listResearcherRiskTradeoffContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...RESEARCHER_RISK_TRADEOFF_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveResearcherRiskTradeoffContract();
    const slice = runResearcherRiskTradeoffFailureRecoverySlice();

    assert.equal(slice.atom, "P04-B07-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of RESEARCHER_RISK_TRADEOFF_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listResearcherRiskTradeoffContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateResearcherRiskTradeoffFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure/recovery/NO-GO paths with risk trade-off recovery and orchestrator wiring", () => {
    const slice = runResearcherRiskTradeoffFailureRecoverySlice();
    const probeIds = listResearcherRiskTradeoffFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const invalidVersion = slice.failureRecoveryResults.find(
      r => r.id === "rrto.invalid_version_rejected",
    );
    assert.ok(invalidVersion);
    assert.equal(invalidVersion!.expected, "PASS");
    assert.equal(invalidVersion!.actual, "PASS");

    const malformedInput = slice.failureRecoveryResults.find(
      r => r.id === "rrto.malformed_research_guard",
    );
    assert.ok(malformedInput);
    assert.equal(malformedInput!.expected, "PASS");
    assert.equal(malformedInput!.actual, "PASS");

    const riskRepair = slice.failureRecoveryResults.find(
      r => r.id === "rrto.recovery_risk_tradeoff_repair",
    );
    assert.ok(riskRepair);
    assert.equal(riskRepair!.expected, "PASS");
    assert.equal(riskRepair!.actual, "PASS");

    const tradeoffFallback = slice.failureRecoveryResults.find(
      r => r.id === "rrto.recovery_tradeoff_dimension_fallback",
    );
    assert.ok(tradeoffFallback);
    assert.equal(tradeoffFallback!.expected, "PASS");
    assert.equal(tradeoffFallback!.actual, "PASS");

    const orchestratorGate = slice.failureRecoveryResults.find(
      r => r.id === "rrto.orchestrator_risk_tradeoff_gate",
    );
    assert.ok(orchestratorGate);
    assert.equal(orchestratorGate!.expected, "PASS");
    assert.equal(orchestratorGate!.actual, "PASS");

    const validatorExport = slice.failureRecoveryResults.find(
      r => r.id === "rrto.exported_risk_tradeoff_validator",
    );
    assert.ok(validatorExport);
    assert.equal(validatorExport!.expected, "PASS");
    assert.equal(validatorExport!.actual, "PASS");
  });

  it("recoverResearchRiskTradeoffEvidence and validateResearchRiskTradeoff handle failure inputs safely", () => {
    const unrecoverable = recoverResearchRiskTradeoffEvidence("");
    assert.equal(unrecoverable.recovered, false);
    assert.ok(unrecoverable.parseErrors.includes("empty"));

    const nullByteRecovery = recoverResearchRiskTradeoffEvidence("research\0parse");
    assert.equal(nullByteRecovery.recovered, false);
    assert.equal(nullByteRecovery.parseErrors[0], "contains_null_byte");

    const invalidFixture = validateResearcherRiskTradeoffBaseline({
      ...loadResearcherRiskTradeoffBaseline(),
      version: "9.9.9",
    });
    assert.equal(invalidFixture.valid, false);

    const malformed = `RISK: Unbounded concurrency (high)
tradeoff: latency vs throughput
FINDINGS: partial parse`;
    const recovery = recoverResearchRiskTradeoffEvidence(malformed);
    assert.equal(recovery.recovered, true);
    assert.ok(recovery.researchPlan.risks.length >= 1);
    assert.ok(recovery.researchPlan.tradeoffs.length >= 1);

    const validation = validateResearchRiskTradeoff(
      "RISKS: complexity (medium)\nTRADEOFFS:\n1. sync vs async latency",
    );
    assert.equal(validation.valid, true, validation.issues.join("; "));
  });
});

describe("Forge Researcher Risk Trade-off Evidence — P04-B07-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadResearcherRiskTradeoffBaseline();
    const contract = getActiveResearcherRiskTradeoffContract();
    const probeIds = listResearcherRiskTradeoffFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildResearcherRiskTradeoffProbeEvidence(
        probeId,
        contractProbe.category,
        contractProbe.expected,
        contractProbe.expected,
        true,
        contractProbe.criterion,
        "synthetic",
        contractProbe.disposition,
        completedAt,
      );
    });

    const telemetry = probeIds.map((probeId, index) => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildResearcherRiskTradeoffProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildResearcherRiskTradeoffProvenance(
      "run-rrto-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P04-B07-A06",
        sliceCategories: RESEARCHER_RISK_TRADEOFF_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildResearcherRiskTradeoffRunRecord(provenance, evidence, telemetry);
    const validation = validateResearcherRiskTradeoffEvidenceRunRecord(record, contract);

    assert.equal(record.summary.total, 6);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byCategory.nogo_path >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBlockGateAtom, fixture.sourceBlockGate.atom);
  });

  it("executes evidence slice with zero unexpected mismatches and valid run record", () => {
    const contract = getActiveResearcherRiskTradeoffContract();
    const slice = runResearcherRiskTradeoffEvidenceSlice();

    assert.equal(slice.atom, "P04-B07-A06");
    assert.equal(slice.evidenceProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(
      slice.recordValidation.valid,
      true,
      slice.recordValidation.issues.map(i => i.detail).join("\n"),
    );

    for (const category of RESEARCHER_RISK_TRADEOFF_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listResearcherRiskTradeoffContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.evidenceResults.find(r => r.id === probe.id);
        assert.ok(result, `missing evidence result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const record = slice.record;
    assert.equal(record.evidence.length, 6);
    assert.equal(record.telemetry.length, 6);
    assert.equal(record.provenance.totalProbes, 6);
    assert.equal(record.provenance.sliceAtom, "P04-B07-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_RESEARCHER_RISK_TRADEOFF_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a06");
    assert.equal(record.summary.mismatches, 0);

    for (const item of record.telemetry) {
      assert.ok(item.durationMs >= 0, `${item.probeId} negative duration`);
      assert.ok(Number.isFinite(item.sequenceIndex));
    }

    for (const item of record.evidence) {
      const contractProbe = contract.probes.find(p => p.id === item.probeId)!;
      assert.ok(item.criterion.length > 0, `${item.probeId} missing criterion in evidence`);
      assert.equal(item.criterion, contractProbe.criterion);
      assert.equal(item.disposition, contractProbe.disposition);
      assert.ok(item.recordedAt.length > 10);
    }

    const riskRepair = record.evidence.find(
      e => e.probeId === "rrto.recovery_risk_tradeoff_repair",
    );
    assert.ok(riskRepair);
    assert.equal(riskRepair!.aligned, true);
    assert.equal(riskRepair!.expected, "PASS");
    assert.equal(riskRepair!.actual, "PASS");
    assert.equal(riskRepair!.disposition, "recovery");
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveResearcherRiskTradeoffContract();
    const record = runResearcherRiskTradeoffFailureRecoverySliceWithRecord();
    const validation = validateResearcherRiskTradeoffEvidenceRunRecord(record, contract);

    assert.equal(record.evidence.length, 6);
    assert.equal(record.provenance.sliceAtom, "P04-B07-A06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
  });
});
