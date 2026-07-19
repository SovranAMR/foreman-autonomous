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

  it("measures question decomposition probes with documented FAIL gaps from P03 sealed handoff", () => {
    const results = runResearcherQuestionDecompositionProbes();
    const summary = summarizeResearcherQuestionDecompositionMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 25);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listResearcherQuestionDecompositionProbesByExpected(
      "FAIL",
      loadResearcherQuestionDecompositionBaseline(),
    );
    assert.equal(documentedFail.length, 6);
    assert.ok(documentedFail.some(p => p.id === "rques.prompt_research_questions"));
    assert.ok(documentedFail.some(p => p.id === "rques.orchestrator_pre_research_decompose"));

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

  it("documents question decomposition gaps as measurable baseline debt", () => {
    const gaps = listResearcherQuestionDecompositionKnownGaps(
      runResearcherQuestionDecompositionProbes(),
    );
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "rques.decompose_research_questions_fn",
      "rques.exported_orchestrator_question_validator",
      "rques.nogo_empty_question_halt",
      "rques.orchestrator_pre_research_decompose",
      "rques.parser_research_questions_extract",
      "rques.prompt_research_questions",
    ]);
    assert.ok(
      gaps.every(g => RESEARCHER_QUESTION_DECOMPOSITION_CATEGORIES.includes(g.category)),
      "documented gaps are question decomposition probes",
    );
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
