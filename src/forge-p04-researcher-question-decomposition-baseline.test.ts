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
