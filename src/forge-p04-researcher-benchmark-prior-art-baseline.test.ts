import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherBenchmarkPriorArtBaseline,
  runResearcherBenchmarkPriorArtProbes,
  runResearcherBenchmarkPriorArtProductionSlice,
  runResearcherBenchmarkPriorArtBoundarySlice,
  runResearcherBenchmarkPriorArtFailureRecoverySlice,
  runResearcherBenchmarkPriorArtFailureRecoverySliceWithRecord,
  runResearcherBenchmarkPriorArtEvidenceSlice,
  buildResearcherBenchmarkPriorArtProbeEvidence,
  buildResearcherBenchmarkPriorArtProbeTelemetry,
  buildResearcherBenchmarkPriorArtProvenance,
  buildResearcherBenchmarkPriorArtRunRecord,
  validateResearcherBenchmarkPriorArtEvidenceRunRecord,
  FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_VERSION,
  validateResearcherBenchmarkPriorArtBaseline,
  validateResearcherBenchmarkPriorArtProbeMatrix,
  validateResearcherBenchmarkPriorArtBoundaryProbeMatrix,
  validateResearcherBenchmarkPriorArtFailureRecoveryProbeMatrix,
  listResearcherBenchmarkPriorArtFailureRecoveryProbeIds,
  RESEARCHER_BENCHMARK_PRIOR_ART_FAILURE_RECOVERY_CATEGORIES,
  summarizeResearcherBenchmarkPriorArtMatrix,
  listResearcherBenchmarkPriorArtProbesByExpected,
  listResearcherBenchmarkPriorArtKnownGaps,
  listResearcherBenchmarkPriorArtContractProbesByCategory,
  assessBenchmarkPriorArtInputBoundary,
  validateBenchmarkPriorArtCollection,
  recoverBenchmarkPriorArtEvidence,
  getActiveResearcherBenchmarkPriorArtContract,
  RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES,
  RESEARCHER_BENCHMARK_PRIOR_ART_TOPIC_MAX_LENGTH,
} from "./forge-p04-researcher-benchmark-prior-art.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Researcher Benchmark Prior-Art — P04-B04-A01", () => {
  it("loads versioned benchmark prior-art baseline aligned with P04-B03 block gate handoff", () => {
    const fixture = loadResearcherBenchmarkPriorArtBaseline();
    const validation = validateResearcherBenchmarkPriorArtBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P04-B04-A01");
    assert.equal(fixture.contractAtom, "P04-B04-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P04-B03-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures benchmark prior-art probes with zero unexpected mismatches after A03 slice", () => {
    const results = runResearcherBenchmarkPriorArtProbes();
    const summary = summarizeResearcherBenchmarkPriorArtMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listResearcherBenchmarkPriorArtProbesByExpected(
      "FAIL",
      loadResearcherBenchmarkPriorArtBaseline(),
    );
    assert.equal(documentedFail.length, 0);

    for (const cat of RESEARCHER_BENCHMARK_PRIOR_ART_CATEGORIES) {
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

  it("documents no remaining benchmark prior-art FAIL gaps after production slice", () => {
    const gaps = listResearcherBenchmarkPriorArtKnownGaps(runResearcherBenchmarkPriorArtProbes());
    assert.deepEqual(gaps, []);
  });

  it("assessBenchmarkPriorArtInputBoundary rejects empty and null-byte topics", () => {
    const empty = assessBenchmarkPriorArtInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessBenchmarkPriorArtInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessBenchmarkPriorArtInputBoundary("task\0input");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessBenchmarkPriorArtInputBoundary truncates oversized topics", () => {
    const longTopic = "x".repeat(RESEARCHER_BENCHMARK_PRIOR_ART_TOPIC_MAX_LENGTH + 500);
    const truncated = assessBenchmarkPriorArtInputBoundary(longTopic);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedTopic.length, RESEARCHER_BENCHMARK_PRIOR_ART_TOPIC_MAX_LENGTH);
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("validateBenchmarkPriorArtCollection accepts hits with source and text citation fields", () => {
    const validation = validateBenchmarkPriorArtCollection("agent orchestration benchmarks", [
      {
        source: "https://example.com/benchmark",
        text: "Prior-art benchmark excerpt with measurable regression criteria",
        title: "Example Benchmark",
      },
    ]);

    assert.equal(validation.valid, true, validation.issues.join("; "));
    assert.equal(validation.hitCount, 1);
  });

  it("validateBenchmarkPriorArtCollection rejects zero-hit topics", () => {
    const validation = validateBenchmarkPriorArtCollection("valid topic", []);
    assert.equal(validation.valid, false);
    assert.ok(validation.issues.some(issue => issue.includes("zero benchmark prior-art hits")));
  });
});

describe("Forge Researcher Benchmark Prior-Art Production Slice — P04-B04-A03", () => {
  it("recoverBenchmarkPriorArtEvidence restructures malformed prior-art parse into actionable evidence plan", () => {
    const recovery = recoverBenchmarkPriorArtEvidence(
      'malformed prior-art citation: https://benchmark.example.com/report export function runBenchmark {"source":"broken',
    );

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.evidencePlan.searchQueries.length >= 1);
    assert.ok(
      recovery.evidencePlan.citationTargets.some(target =>
        target.source.includes("benchmark.example.com"),
      ),
    );
    assert.ok(recovery.evidencePlan.searchQueries.some(query => query.includes("runBenchmark")));
  });

  it("recoverBenchmarkPriorArtEvidence rejects null-byte and empty citation parse safely", () => {
    const emptyRecovery = recoverBenchmarkPriorArtEvidence("");
    assert.equal(emptyRecovery.recovered, false);
    assert.deepEqual(emptyRecovery.parseErrors, ["empty"]);

    const nullRecovery = recoverBenchmarkPriorArtEvidence("citation\0parse");
    assert.equal(nullRecovery.recovered, false);
    assert.deepEqual(nullRecovery.parseErrors, ["contains_null_byte"]);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveResearcherBenchmarkPriorArtContract();
    const slice = runResearcherBenchmarkPriorArtProductionSlice();

    assert.equal(slice.atom, "P04-B04-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 23);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 23);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateResearcherBenchmarkPriorArtProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const recoveryProbe = slice.results.find(
      r => r.id === "rbpa.structured_benchmark_prior_art_recovery",
    );
    assert.ok(recoveryProbe);
    assert.equal(recoveryProbe!.expected, "PASS");
    assert.equal(recoveryProbe!.actual, "PASS");
    assert.equal(recoveryProbe!.aligned, true);
  });
});

describe("Forge Researcher Benchmark Prior-Art Boundary Slice — P04-B04-A04", () => {
  it("defines boundary category with topic input edge-case probes", () => {
    const boundary = listResearcherBenchmarkPriorArtContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "rbpa.empty_topic_boundary",
      "rbpa.known_gaps_documented",
      "rbpa.long_topic_truncation_boundary",
      "rbpa.probe_runner_exported",
      "rbpa.source_block_gate_ref",
      "rbpa.whitespace_topic_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on topic edge probes", () => {
    const contract = getActiveResearcherBenchmarkPriorArtContract();
    const slice = runResearcherBenchmarkPriorArtBoundarySlice();

    assert.equal(slice.atom, "P04-B04-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listResearcherBenchmarkPriorArtContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateResearcherBenchmarkPriorArtBoundaryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("assessBenchmarkPriorArtInputBoundary edge cases align with boundary probe matrix", () => {
    const slice = runResearcherBenchmarkPriorArtBoundarySlice();
    const topicProbes = [
      "rbpa.empty_topic_boundary",
      "rbpa.whitespace_topic_boundary",
      "rbpa.long_topic_truncation_boundary",
    ] as const;

    for (const probeId of topicProbes) {
      const result = slice.boundaryResults.find(r => r.id === probeId);
      assert.ok(result, `missing ${probeId}`);
      assert.equal(result!.actual, "PASS");
      assert.equal(result!.aligned, true);
    }
  });
});

describe("Forge Researcher Benchmark Prior-Art Failure Recovery Slice — P04-B04-A05", () => {
  it("defines six failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveResearcherBenchmarkPriorArtContract();
    const failure = listResearcherBenchmarkPriorArtContractProbesByCategory(
      "failure_path",
      contract,
    );
    const recovery = listResearcherBenchmarkPriorArtContractProbesByCategory(
      "recovery_path",
      contract,
    );
    const nogo = listResearcherBenchmarkPriorArtContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 2);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...RESEARCHER_BENCHMARK_PRIOR_ART_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveResearcherBenchmarkPriorArtContract();
    const slice = runResearcherBenchmarkPriorArtFailureRecoverySlice();

    assert.equal(slice.atom, "P04-B04-A05");
    assert.equal(slice.failureRecoveryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of RESEARCHER_BENCHMARK_PRIOR_ART_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listResearcherBenchmarkPriorArtContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateResearcherBenchmarkPriorArtFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure/recovery/NO-GO paths with validator export and prior-art recovery", () => {
    const slice = runResearcherBenchmarkPriorArtFailureRecoverySlice();
    const probeIds = listResearcherBenchmarkPriorArtFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 6);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const invalidVersion = slice.failureRecoveryResults.find(
      r => r.id === "rbpa.invalid_version_rejected",
    );
    assert.ok(invalidVersion);
    assert.equal(invalidVersion!.expected, "PASS");
    assert.equal(invalidVersion!.actual, "PASS");

    const malformedTopic = slice.failureRecoveryResults.find(
      r => r.id === "rbpa.malformed_topic_guard",
    );
    assert.ok(malformedTopic);
    assert.equal(malformedTopic!.expected, "PASS");
    assert.equal(malformedTopic!.actual, "PASS");

    const researchBlockNonFatal = slice.failureRecoveryResults.find(
      r => r.id === "rbpa.research_block_non_fatal",
    );
    assert.ok(researchBlockNonFatal);
    assert.equal(researchBlockNonFatal!.expected, "PASS");
    assert.equal(researchBlockNonFatal!.actual, "PASS");

    const structuredRecovery = slice.failureRecoveryResults.find(
      r => r.id === "rbpa.structured_benchmark_prior_art_recovery",
    );
    assert.ok(structuredRecovery);
    assert.equal(structuredRecovery!.expected, "PASS");
    assert.equal(structuredRecovery!.actual, "PASS");

    const researcherCriticalBlock = slice.failureRecoveryResults.find(
      r => r.id === "rbpa.researcher_critical_block",
    );
    assert.ok(researcherCriticalBlock);
    assert.equal(researcherCriticalBlock!.expected, "PASS");
    assert.equal(researcherCriticalBlock!.actual, "PASS");

    const exportedValidator = slice.failureRecoveryResults.find(
      r => r.id === "rbpa.exported_benchmark_prior_art_validator",
    );
    assert.ok(exportedValidator);
    assert.equal(exportedValidator!.expected, "PASS");
    assert.equal(exportedValidator!.actual, "PASS");
  });
});

describe("Forge Researcher Benchmark Prior-Art Evidence — P04-B04-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadResearcherBenchmarkPriorArtBaseline();
    const contract = getActiveResearcherBenchmarkPriorArtContract();
    const probeIds = listResearcherBenchmarkPriorArtFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildResearcherBenchmarkPriorArtProbeEvidence(
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
      return buildResearcherBenchmarkPriorArtProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildResearcherBenchmarkPriorArtProvenance(
      "run-rbpa-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P04-B04-A06",
        sliceCategories: RESEARCHER_BENCHMARK_PRIOR_ART_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildResearcherBenchmarkPriorArtRunRecord(provenance, evidence, telemetry);
    const validation = validateResearcherBenchmarkPriorArtEvidenceRunRecord(record, contract);

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
    const contract = getActiveResearcherBenchmarkPriorArtContract();
    const slice = runResearcherBenchmarkPriorArtEvidenceSlice();

    assert.equal(slice.atom, "P04-B04-A06");
    assert.equal(slice.evidenceProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(
      slice.recordValidation.valid,
      true,
      slice.recordValidation.issues.map(i => i.detail).join("\n"),
    );

    for (const category of RESEARCHER_BENCHMARK_PRIOR_ART_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listResearcherBenchmarkPriorArtContractProbesByCategory(
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
    assert.equal(record.provenance.sliceAtom, "P04-B04-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_RESEARCHER_BENCHMARK_PRIOR_ART_VERSION);
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

    const researchBlockNonFatal = record.evidence.find(
      e => e.probeId === "rbpa.research_block_non_fatal",
    );
    assert.ok(researchBlockNonFatal);
    assert.equal(researchBlockNonFatal!.aligned, true);
    assert.equal(researchBlockNonFatal!.expected, "PASS");
    assert.equal(researchBlockNonFatal!.actual, "PASS");
    assert.equal(researchBlockNonFatal!.disposition, "recovery");
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveResearcherBenchmarkPriorArtContract();
    const record = runResearcherBenchmarkPriorArtFailureRecoverySliceWithRecord();
    const validation = validateResearcherBenchmarkPriorArtEvidenceRunRecord(record, contract);

    assert.equal(record.evidence.length, 6);
    assert.equal(record.provenance.sliceAtom, "P04-B04-A06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
  });
});
