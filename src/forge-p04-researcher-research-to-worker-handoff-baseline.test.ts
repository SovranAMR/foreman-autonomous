import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherResearchToWorkerHandoffBaseline,
  runResearcherResearchToWorkerHandoffProbes,
  validateResearcherResearchToWorkerHandoffBaseline,
  summarizeResearcherResearchToWorkerHandoffMatrix,
  listResearcherResearchToWorkerHandoffProbesByExpected,
  listResearcherResearchToWorkerHandoffKnownGaps,
  assessResearchToWorkerHandoffInputBoundary,
  validateResearchToWorkerHandoffCollection,
  recoverResearchToWorkerHandoff,
  RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES,
  RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_INPUT_MAX_LENGTH,
  FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_VERSION,
} from "./forge-p04-researcher-research-to-worker-handoff.js";
import { getForgeP04B08ToB09Handoff } from "./forge-p04-researcher-spike-falsification.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Researcher Research-to-Worker Handoff — P04-B09-A01", () => {
  it("loads versioned research-to-worker handoff baseline aligned with P04-B08 block gate handoff", () => {
    const fixture = loadResearcherResearchToWorkerHandoffBaseline();
    const validation = validateResearcherResearchToWorkerHandoffBaseline(fixture);
    const handoff = getForgeP04B08ToB09Handoff();

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P04-B09-A01");
    assert.equal(fixture.contractAtom, "P04-B09-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P04-B08-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.spikeFalsificationProbeCount, 23);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
    assert.equal(handoff.targetBlock.entryAtom, "P04-B09-A01");
  });

  it("measures research-to-worker handoff probes with documented FAIL gaps from B08 sealed handoff", () => {
    const results = runResearcherResearchToWorkerHandoffProbes();
    const summary = summarizeResearcherResearchToWorkerHandoffMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listResearcherResearchToWorkerHandoffProbesByExpected(
      "FAIL",
      loadResearcherResearchToWorkerHandoffBaseline(),
    );
    assert.equal(documentedFail.length, 2);
    assert.ok(documentedFail.some(p => p.id === "rtwh.parser_research_handoff_bundle"));
    assert.ok(documentedFail.some(p => p.id === "rtwh.exported_handoff_validator"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_CATEGORIES) {
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

  it("documents research-to-worker handoff gaps as measurable baseline debt", () => {
    const gaps = listResearcherResearchToWorkerHandoffKnownGaps(
      runResearcherResearchToWorkerHandoffProbes(),
    );
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, [
      "rtwh.exported_handoff_validator",
      "rtwh.parser_research_handoff_bundle",
    ]);
  });

  it("assessResearchToWorkerHandoffInputBoundary rejects empty and null-byte handoff inputs", () => {
    const empty = assessResearchToWorkerHandoffInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessResearchToWorkerHandoffInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessResearchToWorkerHandoffInputBoundary("handoff\0parse");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessResearchToWorkerHandoffInputBoundary truncates oversized handoff inputs", () => {
    const longInput = "x".repeat(RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_INPUT_MAX_LENGTH + 500);
    const truncated = assessResearchToWorkerHandoffInputBoundary(longInput);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(
      truncated.normalizedInput.length,
      RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_INPUT_MAX_LENGTH,
    );
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("validateResearchToWorkerHandoffCollection accepts bundles with findings and sources", () => {
    const validation = validateResearchToWorkerHandoffCollection({
      version: "1.0.0",
      findings: "Bounded concurrency reduces p99 latency under burst load",
      sources: ["https://example.com/async-patterns"],
      risks: ["Increased complexity (medium)"],
      tradeoffs: ["sync vs async (latency vs complexity)"],
      relevance: 0.85,
    });

    assert.equal(validation.valid, true, validation.issues.join("; "));
    assert.equal(validation.fieldCount, 5);
  });

  it("validateResearchToWorkerHandoffCollection rejects bundles missing findings", () => {
    const validation = validateResearchToWorkerHandoffCollection({
      version: "1.0.0",
      findings: "",
      sources: ["https://example.com/async-patterns"],
      risks: [],
      tradeoffs: [],
      relevance: null,
    });
    assert.equal(validation.valid, false);
    assert.ok(validation.issues.some(issue => issue.includes("missing findings")));
  });

  it("recoverResearchToWorkerHandoff restructures malformed research parse into worker bundle", () => {
    const recovery = recoverResearchToWorkerHandoff(
      "FINDINGS: async worker pool reduces tail latency\nSOURCES: https://example.com/async",
      { topic: "worker pool handoff" },
    );

    assert.equal(recovery.recovered, true);
    assert.ok(recovery.bundle.findings.length > 0);
    assert.ok(recovery.bundle.sources.length >= 1);
  });

  it("recoverResearchToWorkerHandoff rejects null-byte and empty parse safely", () => {
    const emptyRecovery = recoverResearchToWorkerHandoff("");
    assert.equal(emptyRecovery.recovered, false);
    assert.deepEqual(emptyRecovery.parseErrors, ["empty"]);

    const nullRecovery = recoverResearchToWorkerHandoff("handoff\0parse");
    assert.equal(nullRecovery.recovered, false);
    assert.deepEqual(nullRecovery.parseErrors, ["contains_null_byte"]);
  });

  it("harness version exported for research-to-worker handoff baseline", () => {
    assert.equal(FORGE_RESEARCHER_RESEARCH_TO_WORKER_HANDOFF_VERSION.startsWith("1.0.0"), true);
  });
});
