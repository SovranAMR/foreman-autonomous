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
  validateResearcherQuestionDecompositionProbeMatrix,
  getActiveResearcherQuestionDecompositionContract,
  RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES,
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
    assert.equal(fixture.probes.length, 25);
  });

  it("measures question decomposition probes with full alignment after A03 production slice", () => {
    const results = runResearcherQuestionDecompositionProbes();
    const summary = summarizeResearcherQuestionDecompositionMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 25);
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

    const nullByte = assessResearchQuestionInputBoundary("task\0input");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
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
    assert.equal(slice.summary.total, 25);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 25);
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
