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
  validateResearcherContradictionFreshnessBoundaryProbeMatrix,
  runResearcherContradictionFreshnessBoundarySlice,
  validateResearcherContradictionFreshnessFailureRecoveryProbeMatrix,
  runResearcherContradictionFreshnessFailureRecoverySlice,
  listResearcherContradictionFreshnessFailureRecoveryProbeIds,
  RESEARCHER_CONTRADICTION_FRESHNESS_FAILURE_RECOVERY_CATEGORIES,
  buildResearcherContradictionFreshnessProbeEvidence,
  buildResearcherContradictionFreshnessProbeTelemetry,
  buildResearcherContradictionFreshnessProvenance,
  buildResearcherContradictionFreshnessRunRecord,
  validateResearcherContradictionFreshnessEvidenceRunRecord,
  runResearcherContradictionFreshnessFailureRecoverySliceWithRecord,
  runResearcherContradictionFreshnessEvidenceSlice,
  FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_VERSION,
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

describe("Forge Researcher Contradiction Freshness Boundary Slice — P04-B06-A04", () => {
  it("defines six boundary probes with evidence input edge-case criteria", () => {
    const boundary = listResearcherContradictionFreshnessContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "rcfr.empty_evidence_input_boundary",
      "rcfr.known_gaps_documented",
      "rcfr.long_evidence_input_truncation_boundary",
      "rcfr.probe_runner_exported",
      "rcfr.source_block_gate_ref",
      "rcfr.whitespace_evidence_input_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on evidence edge probes", () => {
    const contract = getActiveResearcherContradictionFreshnessContract();
    const slice = runResearcherContradictionFreshnessBoundarySlice();

    assert.equal(slice.atom, "P04-B06-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listResearcherContradictionFreshnessContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateResearcherContradictionFreshnessBoundaryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("assessContradictionFreshnessInputBoundary edge cases align with boundary probe matrix", () => {
    const slice = runResearcherContradictionFreshnessBoundarySlice();
    const evidenceProbes = [
      "rcfr.empty_evidence_input_boundary",
      "rcfr.whitespace_evidence_input_boundary",
      "rcfr.long_evidence_input_truncation_boundary",
    ] as const;

    for (const probeId of evidenceProbes) {
      const result = slice.boundaryResults.find(r => r.id === probeId);
      assert.ok(result, `missing ${probeId}`);
      assert.equal(result!.actual, "PASS");
      assert.equal(result!.aligned, true);
    }
  });

  it("resolveResearchContradictions and validateResearchFreshness reject invalid boundary inputs", () => {
    const emptyResolution = resolveResearchContradictions("");
    assert.equal(emptyResolution.resolved, false);
    assert.equal(emptyResolution.edges.length, 0);

    const nullByteResolution = resolveResearchContradictions("evidence\0input");
    assert.equal(nullByteResolution.resolved, false);

    const emptyFreshness = validateResearchFreshness("");
    assert.equal(emptyFreshness.valid, false);
    assert.ok(emptyFreshness.issues.length > 0);

    const whitespaceFreshness = validateResearchFreshness("   \t\n  ");
    assert.equal(whitespaceFreshness.valid, false);
    assert.equal(whitespaceFreshness.freshnessHints.length, 0);
  });

  it("assessContradictionFreshnessInputBoundary accepts exact max-length evidence input", () => {
    const exactMax = "x".repeat(RESEARCHER_CONTRADICTION_FRESHNESS_INPUT_MAX_LENGTH);
    const boundary = assessContradictionFreshnessInputBoundary(exactMax);

    assert.equal(boundary.acceptable, true);
    assert.equal(boundary.truncated, false);
    assert.equal(boundary.disposition, "valid");
    assert.equal(boundary.normalizedInput.length, RESEARCHER_CONTRADICTION_FRESHNESS_INPUT_MAX_LENGTH);

    const collection = validateContradictionFreshnessCollection(exactMax, [
      { claim: "exact max length topic accepted", source: "https://example.com/spec" },
    ]);
    assert.equal(collection.valid, true, collection.issues.join("; "));
  });
});

describe("Forge Researcher Contradiction Freshness Failure/Recovery Slice — P04-B06-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three path categories", () => {
    const contract = getActiveResearcherContradictionFreshnessContract();
    const failure = listResearcherContradictionFreshnessContractProbesByCategory(
      "failure_path",
      contract,
    );
    const recovery = listResearcherContradictionFreshnessContractProbesByCategory(
      "recovery_path",
      contract,
    );
    const nogo = listResearcherContradictionFreshnessContractProbesByCategory(
      "nogo_path",
      contract,
    );

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...RESEARCHER_CONTRADICTION_FRESHNESS_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveResearcherContradictionFreshnessContract();
    const slice = runResearcherContradictionFreshnessFailureRecoverySlice();

    assert.equal(slice.atom, "P04-B06-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of RESEARCHER_CONTRADICTION_FRESHNESS_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listResearcherContradictionFreshnessContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateResearcherContradictionFreshnessFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure/recovery/NO-GO paths with contradiction recovery and orchestrator wiring", () => {
    const slice = runResearcherContradictionFreshnessFailureRecoverySlice();
    const probeIds = listResearcherContradictionFreshnessFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const invalidVersion = slice.failureRecoveryResults.find(
      r => r.id === "rcfr.invalid_version_rejected",
    );
    assert.ok(invalidVersion);
    assert.equal(invalidVersion!.expected, "PASS");
    assert.equal(invalidVersion!.actual, "PASS");

    const malformedInput = slice.failureRecoveryResults.find(
      r => r.id === "rcfr.malformed_evidence_guard",
    );
    assert.ok(malformedInput);
    assert.equal(malformedInput!.expected, "PASS");
    assert.equal(malformedInput!.actual, "PASS");

    const contradictionRepair = slice.failureRecoveryResults.find(
      r => r.id === "rcfr.recovery_contradiction_plan_repair",
    );
    assert.ok(contradictionRepair);
    assert.equal(contradictionRepair!.expected, "PASS");
    assert.equal(contradictionRepair!.actual, "PASS");

    const staleFallback = slice.failureRecoveryResults.find(
      r => r.id === "rcfr.recovery_stale_source_fallback",
    );
    assert.ok(staleFallback);
    assert.equal(staleFallback!.expected, "PASS");
    assert.equal(staleFallback!.actual, "PASS");

    const resolveConflicts = slice.failureRecoveryResults.find(
      r => r.id === "rcfr.resolve_contradiction_conflicts",
    );
    assert.ok(resolveConflicts);
    assert.equal(resolveConflicts!.expected, "PASS");
    assert.equal(resolveConflicts!.actual, "PASS");

    const freshnessValidator = slice.failureRecoveryResults.find(
      r => r.id === "rcfr.exported_freshness_validator",
    );
    assert.ok(freshnessValidator);
    assert.equal(freshnessValidator!.expected, "PASS");
    assert.equal(freshnessValidator!.actual, "PASS");
  });

  it("recoverContradictionFreshnessEvidence and resolveResearchContradictions handle failure inputs safely", () => {
    const unrecoverable = recoverContradictionFreshnessEvidence("");
    assert.equal(unrecoverable.recovered, false);
    assert.ok(unrecoverable.parseErrors.includes("empty"));

    const nullByteRecovery = recoverContradictionFreshnessEvidence("evidence\0input");
    assert.equal(nullByteRecovery.recovered, false);
    assert.equal(nullByteRecovery.parseErrors[0], "contains_null_byte");

    const invalidFixture = validateResearcherContradictionFreshnessBaseline({
      ...loadResearcherContradictionFreshnessBaseline(),
      version: "9.9.9",
    });
    assert.equal(invalidFixture.valid, false);

    const resolution = resolveResearchContradictions(
      "CONTRADICTION: claim A vs claim B\nFRESHNESS: pm",
      { topic: "failure recovery slice" },
    );
    assert.equal(resolution.resolved, true);
    assert.ok(resolution.edges.length >= 1);

    const freshness = validateResearchFreshness(
      "FINDINGS: benchmark\nFRESHNESS: pm\nSOURCES: https://example.com/spec",
    );
    assert.equal(freshness.valid, true, freshness.issues.join("; "));
  });
});

describe("Forge Researcher Contradiction Freshness Evidence — P04-B06-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadResearcherContradictionFreshnessBaseline();
    const contract = getActiveResearcherContradictionFreshnessContract();
    const probeIds = listResearcherContradictionFreshnessFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildResearcherContradictionFreshnessProbeEvidence(
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
      return buildResearcherContradictionFreshnessProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildResearcherContradictionFreshnessProvenance(
      "run-rcfr-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P04-B06-A06",
        sliceCategories: RESEARCHER_CONTRADICTION_FRESHNESS_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildResearcherContradictionFreshnessRunRecord(provenance, evidence, telemetry);
    const validation = validateResearcherContradictionFreshnessEvidenceRunRecord(record, contract);

    assert.equal(record.summary.total, 6);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 2);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourceBlockGateAtom, fixture.sourceBlockGate.atom);
  });

  it("executes evidence slice with zero unexpected mismatches and valid run record", () => {
    const contract = getActiveResearcherContradictionFreshnessContract();
    const slice = runResearcherContradictionFreshnessEvidenceSlice();

    assert.equal(slice.atom, "P04-B06-A06");
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

    for (const category of RESEARCHER_CONTRADICTION_FRESHNESS_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listResearcherContradictionFreshnessContractProbesByCategory(
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
    assert.equal(record.provenance.sliceAtom, "P04-B06-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(
      record.provenance.harnessVersion,
      FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_VERSION,
    );
    assert.equal(record.provenance.harnessVersion, "1.0.0-a07");
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

    const contradictionRepair = record.evidence.find(
      e => e.probeId === "rcfr.recovery_contradiction_plan_repair",
    );
    assert.ok(contradictionRepair);
    assert.equal(contradictionRepair!.aligned, true);
    assert.equal(contradictionRepair!.expected, "PASS");
    assert.equal(contradictionRepair!.actual, "PASS");
    assert.equal(contradictionRepair!.disposition, "recovery");
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveResearcherContradictionFreshnessContract();
    const record = runResearcherContradictionFreshnessFailureRecoverySliceWithRecord();
    const validation = validateResearcherContradictionFreshnessEvidenceRunRecord(record, contract);

    assert.equal(record.evidence.length, 6);
    assert.equal(record.provenance.sliceAtom, "P04-B06-A06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
  });
});
