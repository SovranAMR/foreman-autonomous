import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearcherInRepoEvidenceBaseline,
  runResearcherInRepoEvidenceProbes,
  validateResearcherInRepoEvidenceBaseline,
  summarizeResearcherInRepoEvidenceMatrix,
  listResearcherInRepoEvidenceProbesByExpected,
  listResearcherInRepoEvidenceKnownGaps,
  assessInRepoEvidenceInputBoundary,
  validateInRepoEvidenceCollection,
  RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES,
  RESEARCHER_IN_REPO_EVIDENCE_QUERY_MAX_LENGTH,
} from "./forge-p04-researcher-in-repo-evidence.js";
import { searchFiles } from "./research-engine.js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = dirname(fileURLToPath(import.meta.url));

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Researcher In-Repo Evidence — P04-B02-A01", () => {
  it("loads versioned in-repo evidence baseline aligned with P04-B01 block gate handoff", () => {
    const fixture = loadResearcherInRepoEvidenceBaseline();
    const validation = validateResearcherInRepoEvidenceBaseline(fixture);

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P04-B02-A01");
    assert.equal(fixture.contractAtom, "P04-B02-A06");
    assert.equal(fixture.sourceBlockGate.atom, "P04-B01-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 23);
  });

  it("measures in-repo evidence probes with documented FAIL gaps from P04-B01 sealed handoff", () => {
    const results = runResearcherInRepoEvidenceProbes();
    const summary = summarizeResearcherInRepoEvidenceMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 23);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listResearcherInRepoEvidenceProbesByExpected(
      "FAIL",
      loadResearcherInRepoEvidenceBaseline(),
    );
    assert.equal(documentedFail.length, 1);
    assert.ok(documentedFail.some(p => p.id === "riev.structured_repo_evidence_recovery"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES) {
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

  it("documents remaining in-repo evidence gaps as measurable baseline debt", () => {
    const gaps = listResearcherInRepoEvidenceKnownGaps(runResearcherInRepoEvidenceProbes());
    const ids = gaps.map(g => g.id).sort();

    assert.deepEqual(ids, ["riev.structured_repo_evidence_recovery"]);
    assert.ok(
      gaps.every(g => RESEARCHER_IN_REPO_EVIDENCE_CATEGORIES.includes(g.category)),
      "documented gaps are in-repo evidence probes",
    );
  });

  it("assessInRepoEvidenceInputBoundary rejects empty and null-byte search queries", () => {
    const empty = assessInRepoEvidenceInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessInRepoEvidenceInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessInRepoEvidenceInputBoundary("task\0input");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessInRepoEvidenceInputBoundary truncates oversized search queries", () => {
    const longQuery = "x".repeat(RESEARCHER_IN_REPO_EVIDENCE_QUERY_MAX_LENGTH + 500);
    const truncated = assessInRepoEvidenceInputBoundary(longQuery);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedQuery.length, RESEARCHER_IN_REPO_EVIDENCE_QUERY_MAX_LENGTH);
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("validateInRepoEvidenceCollection accepts live repo hits with citation fields", () => {
    const hits = searchFiles(SRC_ROOT, "export function searchFiles", "*.ts", 3);
    const validation = validateInRepoEvidenceCollection("searchFiles", hits);

    assert.ok(hits.length > 0);
    assert.equal(validation.valid, true, validation.issues.join("; "));
    assert.equal(validation.fileHitCount, hits.length);
  });

  it("validateInRepoEvidenceCollection rejects zero-hit queries", () => {
    const validation = validateInRepoEvidenceCollection("valid query", []);
    assert.equal(validation.valid, false);
    assert.ok(validation.issues.some(issue => issue.includes("zero in-repo file hits")));
  });
});
