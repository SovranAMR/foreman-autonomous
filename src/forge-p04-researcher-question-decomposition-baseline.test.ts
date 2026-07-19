import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherQuestionDecompositionBaseline,
  runResearcherQuestionDecompositionProbes,
  validateResearcherQuestionDecompositionBaseline,
  summarizeResearcherQuestionDecompositionMatrix,
  listResearcherQuestionDecompositionProbesByExpected,
  listResearcherQuestionDecompositionKnownGaps,
  assessResearchQuestionInputBoundary,
  assessResearchQuestionDecompositionPresence,
  parseResearchQuestionsFromText,
  decomposeResearchQuestions,
  runResearcherQuestionDecompositionProductionSlice,
  runResearcherQuestionDecompositionBoundarySlice,
  runResearcherQuestionDecompositionFailureRecoverySlice,
  validateResearcherQuestionDecompositionProbeMatrix,
  validateResearcherQuestionDecompositionBoundaryProbeMatrix,
  validateResearcherQuestionDecompositionFailureRecoveryProbeMatrix,
  listResearcherQuestionDecompositionFailureRecoveryProbeIds,
  RESEARCHER_QUESTION_DECOMPOSITION_FAILURE_RECOVERY_CATEGORIES,
  getActiveResearcherQuestionDecompositionContract,
  listResearcherQuestionDecompositionContractProbesByCategory,
  RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES,
  RESEARCHER_QUESTION_BLOCK_MAX_LENGTH,
  runResearcherQuestionDecompositionEvidenceSlice,
  runResearcherQuestionDecompositionProbesWithRecord,
  runResearcherQuestionDecompositionFailureRecoverySliceWithRecord,
  validateResearcherQuestionDecompositionRunRecord,
  validateResearcherQuestionDecompositionEvidenceRunRecord,
  buildResearcherQuestionDecompositionProbeEvidence,
  buildResearcherQuestionDecompositionProbeTelemetry,
  buildResearcherQuestionDecompositionProvenance,
  buildResearcherQuestionDecompositionRunRecord,
  FORGE_RESEARCHER_QUESTION_DECOMPOSITION_VERSION,
  runResearcherQuestionDecompositionPropertyFuzzSlice,
  runResearcherQuestionDecompositionPropertyChecks,
  createResearcherQuestionDecompositionFuzzRng,
  runResearcherQuestionDecompositionFuzzValidation,
  runResearcherQuestionDecompositionRunRecordFuzzValidation,
  FORGE_RESEARCHER_QUESTION_DECOMPOSITION_CONTRACT_V1,
  listResearcherQuestionDecompositionContractProbeIds,
  runResearcherQuestionDecompositionForgeRegression,
  detectResearcherQuestionDecompositionProbeRegression,
  applyResearcherQuestionDecompositionRunRecordFuzzMutation,
} from "./forge-p04-researcher-question-decomposition.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Researcher Question Decomposition — P04-B01-A01", () => {
  it("loads versioned question decomposition baseline aligned with P03 phase gate handoff", () => {
    const fixture = loadResearcherQuestionDecompositionBaseline();
    const validation = validateResearcherQuestionDecompositionBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P04-B01-A01");
    assert.equal(fixture.contractAtom, "P04-B01-A06");
    assert.equal(fixture.sourcePhaseGate.atom, "P03-PHASE-GATE");
    assert.equal(fixture.sourcePhaseGate.sealedBlockCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 27);
  });

  it("measures question decomposition probes with full alignment after A03 production slice", () => {
    const results = runResearcherQuestionDecompositionProbes();
    const summary = summarizeResearcherQuestionDecompositionMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 27);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listResearcherQuestionDecompositionProbesByExpected(
      "FAIL",
      loadResearcherQuestionDecompositionBaseline(),
    );
    assert.equal(documentedFail.length, 0);

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES) {
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

  it("documents zero remaining question decomposition gaps after production slice", () => {
    const gaps = listResearcherQuestionDecompositionKnownGaps(
      runResearcherQuestionDecompositionProbes(),
    );
    assert.deepEqual(gaps.map(g => g.id).sort(), []);
  });

  it("assessResearchQuestionDecompositionPresence parses numbered RESEARCH_QUESTIONS", () => {
    const sample = `RESEARCH_QUESTIONS:
1. What are agent pipeline research decomposition patterns?
2. How should FAIL gaps be documented in baseline fixtures?
FINDINGS: Both questions are actionable for P04-B01.
RELEVANCE: 0.9
RISKS: None identified`;

    const presence = assessResearchQuestionDecompositionPresence(sample);
    assert.equal(presence.hasResearchQuestions, true);
    assert.equal(presence.questionCount, 2);
    assert.ok(presence.questions[0].includes("decomposition patterns"));
    assert.deepEqual(parseResearchQuestionsFromText(sample), presence.questions);
  });

  it("assessResearchQuestionInputBoundary rejects empty and null-byte block tasks", () => {
    const empty = assessResearchQuestionInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessResearchQuestionInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessResearchQuestionInputBoundary("task\0input");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessResearchQuestionInputBoundary truncates oversized block tasks", () => {
    const longBlock = "x".repeat(RESEARCHER_QUESTION_BLOCK_MAX_LENGTH + 500);
    const truncated = assessResearchQuestionInputBoundary(longBlock);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedBlock.length, RESEARCHER_QUESTION_BLOCK_MAX_LENGTH);
    assert.equal(truncated.disposition, "exceeds_max_length");
  });
});

describe("Forge Researcher Question Decomposition Production Slice — P04-B01-A03", () => {
  it("decomposeResearchQuestions splits block task into measurable sub-queries", () => {
    const decomposition = decomposeResearchQuestions(
      "Implement typed research question decomposition in orchestrator before researcher stepWithPhase.",
    );

    assert.equal(decomposition.acceptable, true);
    assert.ok(decomposition.questionCount >= 1);
    assert.ok(decomposition.questions.every(question => question.length > 10));
  });

  it("decomposeResearchQuestions rejects empty block task safely", () => {
    const decomposition = decomposeResearchQuestions("   ");
    assert.equal(decomposition.acceptable, false);
    assert.equal(decomposition.questionCount, 0);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveResearcherQuestionDecompositionContract();
    const slice = runResearcherQuestionDecompositionProductionSlice();

    assert.equal(slice.atom, "P04-B01-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 27);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 27);
    assert.equal(slice.matrixValidation.gapAligned, 0);
    assert.equal(slice.summary.knownGaps.length, 0);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateResearcherQuestionDecompositionProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const decomposeProbe = slice.results.find(r => r.id === "rques.decompose_research_questions_fn");
    assert.ok(decomposeProbe);
    assert.equal(decomposeProbe!.expected, "PASS");
    assert.equal(decomposeProbe!.actual, "PASS");
    assert.equal(decomposeProbe!.aligned, true);
  });
});

describe("Forge Researcher Question Decomposition Boundary Slice — P04-B01-A04", () => {
  it("defines boundary category with block task input edge-case probes", () => {
    const boundary = listResearcherQuestionDecompositionContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 6);
    assert.deepEqual(ids, [
      "rques.empty_block_boundary",
      "rques.known_gaps_documented",
      "rques.long_block_truncation_boundary",
      "rques.probe_runner_exported",
      "rques.source_phase_gate_ref",
      "rques.whitespace_block_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveResearcherQuestionDecompositionContract();
    const slice = runResearcherQuestionDecompositionBoundarySlice();

    assert.equal(slice.atom, "P04-B01-A04");
    assert.equal(slice.boundaryProbeCount, 6);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 6);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 6);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listResearcherQuestionDecompositionContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateResearcherQuestionDecompositionBoundaryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });
});

describe("Forge Researcher Question Decomposition Failure/Recovery Slice — P04-B01-A05", () => {
  it("defines seven failure/recovery/NO-GO probes across three categories", () => {
    const contract = getActiveResearcherQuestionDecompositionContract();
    const failure = listResearcherQuestionDecompositionContractProbesByCategory(
      "failure_path",
      contract,
    );
    const recovery = listResearcherQuestionDecompositionContractProbesByCategory(
      "recovery_path",
      contract,
    );
    const nogo = listResearcherQuestionDecompositionContractProbesByCategory("nogo_path", contract);

    assert.equal(failure.length, 3);
    assert.equal(recovery.length, 2);
    assert.equal(nogo.length, 2);
    assert.deepEqual(
      [...RESEARCHER_QUESTION_DECOMPOSITION_FAILURE_RECOVERY_CATEGORIES],
      ["failure_path", "recovery_path", "nogo_path"],
    );
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveResearcherQuestionDecompositionContract();
    const slice = runResearcherQuestionDecompositionFailureRecoverySlice();

    assert.equal(slice.atom, "P04-B01-A05");
    assert.equal(slice.failureRecoveryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of RESEARCHER_QUESTION_DECOMPOSITION_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listResearcherQuestionDecompositionContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateResearcherQuestionDecompositionFailureRecoveryProbeMatrix(
      slice.results,
      contract,
    );
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );
  });

  it("exercises failure/recovery/NO-GO paths with orchestrator halt and non-fatal wiring", () => {
    const slice = runResearcherQuestionDecompositionFailureRecoverySlice();
    const probeIds = listResearcherQuestionDecompositionFailureRecoveryProbeIds();

    assert.equal(probeIds.length, 7);
    assert.ok(probeIds.every(id => slice.failureRecoveryResults.find(r => r.id === id)?.aligned));

    const invalidVersion = slice.failureRecoveryResults.find(
      r => r.id === "rques.invalid_version_rejected",
    );
    assert.ok(invalidVersion);
    assert.equal(invalidVersion!.expected, "PASS");
    assert.equal(invalidVersion!.actual, "PASS");

    const researchBlockNonFatal = slice.failureRecoveryResults.find(
      r => r.id === "rques.research_block_non_fatal",
    );
    assert.ok(researchBlockNonFatal);
    assert.equal(researchBlockNonFatal!.expected, "PASS");
    assert.equal(researchBlockNonFatal!.actual, "PASS");

    const emptyQuestionHalt = slice.failureRecoveryResults.find(
      r => r.id === "rques.nogo_empty_question_halt",
    );
    assert.ok(emptyQuestionHalt);
    assert.equal(emptyQuestionHalt!.expected, "PASS");
    assert.equal(emptyQuestionHalt!.actual, "PASS");

    const orchestratorValidator = slice.failureRecoveryResults.find(
      r => r.id === "rques.exported_orchestrator_question_validator",
    );
    assert.ok(orchestratorValidator);
    assert.equal(orchestratorValidator!.expected, "PASS");
    assert.equal(orchestratorValidator!.actual, "PASS");
  });
});

describe("Forge Researcher Question Decomposition Evidence — P04-B01-A06", () => {
  it("builds run record with disposition, criterion and aligned probe outcomes", () => {
    const fixture = loadResearcherQuestionDecompositionBaseline();
    const contract = getActiveResearcherQuestionDecompositionContract();
    const probeIds = listResearcherQuestionDecompositionFailureRecoveryProbeIds(contract);
    const startedAt = "2026-07-19T00:00:00.000Z";
    const completedAt = "2026-07-19T00:00:01.000Z";

    const evidence = probeIds.map(probeId => {
      const contractProbe = contract.probes.find(p => p.id === probeId)!;
      return buildResearcherQuestionDecompositionProbeEvidence(
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
      return buildResearcherQuestionDecompositionProbeTelemetry(
        probeId,
        contractProbe.category,
        index,
        index * 0.5,
      );
    });

    const provenance = buildResearcherQuestionDecompositionProvenance(
      "run-rques-a06",
      fixture,
      contract,
      startedAt,
      completedAt,
      probeIds.length,
      {
        sliceAtom: "P04-B01-A06",
        sliceCategories: RESEARCHER_QUESTION_DECOMPOSITION_FAILURE_RECOVERY_CATEGORIES,
        gitCommit: "abc1234",
      },
    );

    const record = buildResearcherQuestionDecompositionRunRecord(provenance, evidence, telemetry);
    const validation = validateResearcherQuestionDecompositionEvidenceRunRecord(record, contract);

    assert.equal(record.summary.total, 7);
    assert.equal(record.summary.mismatches, 0);
    assert.ok(record.summary.byDisposition.failure >= 3);
    assert.ok(record.summary.byDisposition.recovery >= 2);
    assert.ok(record.summary.byDisposition.nogo >= 2);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.provenance.contractAtom, contract.atom);
    assert.equal(record.provenance.fixtureAtom, fixture.atom);
    assert.equal(record.provenance.sourcePhaseGateAtom, fixture.sourcePhaseGate.atom);
  });

  it("executes evidence slice with zero unexpected mismatches and valid run record", () => {
    const contract = getActiveResearcherQuestionDecompositionContract();
    const slice = runResearcherQuestionDecompositionEvidenceSlice();

    assert.equal(slice.atom, "P04-B01-A06");
    assert.equal(slice.evidenceProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.recordValid, true);
    assert.equal(slice.evidenceResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.recordValidation.valid, true, slice.recordValidation.issues.map(i => i.detail).join("\n"));

    for (const category of RESEARCHER_QUESTION_DECOMPOSITION_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listResearcherQuestionDecompositionContractProbesByCategory(
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
    assert.equal(record.evidence.length, 7);
    assert.equal(record.telemetry.length, 7);
    assert.equal(record.provenance.totalProbes, 7);
    assert.equal(record.provenance.sliceAtom, "P04-B01-A06");
    assert.deepEqual(record.provenance.sliceCategories, [
      "failure_path",
      "recovery_path",
      "nogo_path",
    ]);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(record.provenance.harnessVersion, FORGE_RESEARCHER_QUESTION_DECOMPOSITION_VERSION);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a09");
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

    const researchBlockNonFatal = record.evidence.find(e => e.probeId === "rques.research_block_non_fatal");
    assert.ok(researchBlockNonFatal);
    assert.equal(researchBlockNonFatal!.aligned, true);
    assert.equal(researchBlockNonFatal!.expected, "PASS");
    assert.equal(researchBlockNonFatal!.actual, "PASS");
    assert.equal(researchBlockNonFatal!.disposition, "recovery");
  });

  it("records evidence, telemetry and provenance for full question decomposition run", () => {
    const contract = getActiveResearcherQuestionDecompositionContract();
    const record = runResearcherQuestionDecompositionProbesWithRecord();
    const validation = validateResearcherQuestionDecompositionRunRecord(record, contract);

    assert.equal(record.evidence.length, 27);
    assert.equal(record.telemetry.length, 27);
    assert.equal(record.provenance.totalProbes, 27);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a09");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.summary.aligned, 27);
  });

  it("records evidence slice via failure/recovery with-record helper", () => {
    const contract = getActiveResearcherQuestionDecompositionContract();
    const record = runResearcherQuestionDecompositionFailureRecoverySliceWithRecord();
    const validation = validateResearcherQuestionDecompositionEvidenceRunRecord(record, contract);

    assert.equal(record.evidence.length, 7);
    assert.equal(record.telemetry.length, 7);
    assert.equal(record.provenance.sliceAtom, "P04-B01-A06");
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);
  });
});

describe("Forge Researcher Question Decomposition Property/Fuzz — P04-B01-A07", () => {
  it("passes all structural properties on canonical contract", () => {
    const result = runResearcherQuestionDecompositionPropertyChecks(
      FORGE_RESEARCHER_QUESTION_DECOMPOSITION_CONTRACT_V1,
    );
    assert.equal(
      result.allPassed,
      true,
      result.failed.map(f => `${f.propertyId}: ${f.detail}`).join("\n"),
    );
    assert.equal(result.passed, result.total);
    assert.equal(result.total, 8);
  });

  it("createResearcherQuestionDecompositionFuzzRng is deterministic for reproducible fuzz seeds", () => {
    const rngA = createResearcherQuestionDecompositionFuzzRng(1337);
    const rngB = createResearcherQuestionDecompositionFuzzRng(1337);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    assert.deepEqual(seqA, seqB);
    assert.notDeepEqual(
      seqA,
      Array.from({ length: 5 }, () => createResearcherQuestionDecompositionFuzzRng(1338)()),
    );
  });

  it("rejects all deterministic fixture mutations", () => {
    const fixture = loadResearcherQuestionDecompositionBaseline();
    const contract = getActiveResearcherQuestionDecompositionContract();

    for (const seed of [42, 99, 20260719]) {
      const fuzz = runResearcherQuestionDecompositionFuzzValidation(fixture, contract, seed, 24);
      assert.equal(fuzz.iterations, 24);
      assert.equal(fuzz.rejected, 24, `seed=${seed} accepted=${fuzz.accepted}`);
      assert.equal(fuzz.allMutationsRejected, true);
      for (const item of fuzz.cases) {
        assert.equal(
          item.valid,
          false,
          `${item.mutation.kind}@${item.mutation.probeId} should fail`,
        );
        assert.ok(item.issueKinds.length > 0);
      }
    }
  });

  it("accepts valid failure/recovery record and rejects corrupted mutations", () => {
    const contract = getActiveResearcherQuestionDecompositionContract();
    const record = runResearcherQuestionDecompositionFailureRecoverySliceWithRecord();

    assert.equal(
      validateResearcherQuestionDecompositionEvidenceRunRecord(record, contract).valid,
      true,
      validateResearcherQuestionDecompositionEvidenceRunRecord(record, contract)
        .issues.map(i => i.detail)
        .join("\n"),
    );

    const fuzz = runResearcherQuestionDecompositionRunRecordFuzzValidation(record, contract);
    assert.equal(fuzz.validBaseline, true);
    assert.equal(fuzz.mutationsAccepted, 0);
    assert.equal(fuzz.mutationsRejected, 5);
  });

  it("executes property/fuzz slice with zero accepted mutations and valid baseline record", () => {
    const contract = getActiveResearcherQuestionDecompositionContract();
    const slice = runResearcherQuestionDecompositionPropertyFuzzSlice();
    const record = runResearcherQuestionDecompositionFailureRecoverySliceWithRecord();

    assert.equal(slice.atom, "P04-B01-A07");
    assert.equal(slice.propertyChecksPassed, true);
    assert.equal(slice.contractFuzzRejected, true);
    assert.equal(slice.runRecordFuzzRejected, true);
    assert.equal(slice.contractFuzz.accepted, 0);
    assert.equal(slice.runRecordFuzz.mutationsAccepted, 0);

    assert.equal(
      validateResearcherQuestionDecompositionEvidenceRunRecord(record, contract).valid,
      true,
    );
    assert.equal(record.summary.mismatches, 0);
    assert.equal(record.provenance.harnessVersion, "1.0.0-a09");
    assert.equal(listResearcherQuestionDecompositionContractProbeIds(contract).length, 27);
  });
});

describe("Forge Researcher Question Decomposition Regression — P04-B01-A08", () => {
  it("runResearcherQuestionDecompositionForgeRegression passes on canonical question decomposition matrix", () => {
    const result = runResearcherQuestionDecompositionForgeRegression();

    assert.equal(result.atom, "P04-B01-A08");
    assert.equal(result.passed, true, result.detail);
    assert.equal(result.recordValid, true);
    assert.equal(result.record.summary.mismatches, 0);
    assert.equal(result.record.evidence.length, 27);
    assert.equal(result.probeRegression, null);
    assert.equal(result.productionSlice.matrixValid, true);
    assert.equal(result.productionSlice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(result.propertyFuzzSlice.propertyChecksPassed, true);
    assert.equal(result.propertyFuzzSlice.contractFuzzRejected, true);
    assert.equal(result.propertyFuzzSlice.runRecordFuzzRejected, true);
    assert.equal(result.guard.passed, true);
    assert.ok(result.detail.includes("27/27 probes aligned"));
    assert.ok(result.detail.includes("productionSlice:"));
    assert.ok(result.detail.includes("propertyFuzz:"));
    assert.ok(result.detail.includes("guard:"));
    assert.ok(result.detail.includes("adversarial=3/3"));
  });

  it("detectResearcherQuestionDecompositionProbeRegression flags newly misaligned probes", () => {
    const prior = runResearcherQuestionDecompositionProbesWithRecord();
    const current = structuredClone(prior);
    const target = current.evidence.find(item => item.aligned);
    assert.ok(target, "expected at least one aligned probe");

    target!.aligned = false;
    target!.actual = target!.expected === "PASS" ? "FAIL" : "PASS";
    current.summary = {
      ...current.summary,
      aligned: current.summary.aligned - 1,
      mismatches: current.summary.mismatches + 1,
    };

    const report = detectResearcherQuestionDecompositionProbeRegression(prior, current);
    assert.equal(report.hasRegression, true);
    assert.deepEqual(report.regressions, [target!.probeId]);
    assert.ok(report.summary.includes("probe regression"));
  });

  it("runResearcherQuestionDecompositionForgeRegression compares against prior record without false regression", () => {
    const prior = runResearcherQuestionDecompositionProbesWithRecord();
    const result = runResearcherQuestionDecompositionForgeRegression(prior);

    assert.equal(result.passed, true, result.detail);
    assert.ok(result.probeRegression);
    assert.equal(result.probeRegression?.hasRegression, false);
  });

  it("runResearcherQuestionDecompositionForgeRegression rejects tampered prior records", () => {
    const prior = runResearcherQuestionDecompositionProbesWithRecord();
    const tamperedPrior = applyResearcherQuestionDecompositionRunRecordFuzzMutation(prior, {
      kind: "drop_evidence",
      probeId: prior.evidence[0]?.probeId,
    });

    assert.equal(validateResearcherQuestionDecompositionRunRecord(tamperedPrior).valid, false);

    const result = runResearcherQuestionDecompositionForgeRegression(tamperedPrior);
    assert.equal(result.priorRecordValid, false);
    assert.equal(result.passed, false);
    assert.ok(result.detail.includes("priorValidation:"));
  });

  it("runResearcherQuestionDecompositionForgeRegression fails when probe alignment regresses", () => {
    const prior = runResearcherQuestionDecompositionProbesWithRecord();
    const tamperedCurrent = structuredClone(prior);
    const target = tamperedCurrent.evidence[0]!;
    target.aligned = false;
    target.actual = target.expected === "PASS" ? "FAIL" : "PASS";
    tamperedCurrent.summary = {
      ...tamperedCurrent.summary,
      aligned: tamperedCurrent.summary.aligned - 1,
      mismatches: tamperedCurrent.summary.mismatches + 1,
    };

    const report = detectResearcherQuestionDecompositionProbeRegression(prior, tamperedCurrent);
    assert.equal(report.hasRegression, true);
  });
});
