import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadForgeBaselineFixture,
  runForgeBaselineProbes,
  summarizeBaselineMatrix,
} from "./forge-baseline-harness.js";

describe("Forge Pipeline Baseline — P01-B01-A01", () => {
  it("loads versioned baseline fixture", () => {
    const fixture = loadForgeBaselineFixture();
    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P01-B01-A01");
    assert.ok(fixture.paths.state.length >= 3);
    assert.ok(fixture.paths.tool.length >= 3);
    assert.ok(fixture.paths.verification.length >= 4);
    assert.ok(fixture.paths.reviewer.length >= 4);
    assert.ok(fixture.paths.rollback.length >= 3);
    assert.ok(fixture.paths.resume.length >= 3);
  });

  it("executes PASS/FAIL matrix for state, tool, verification, reviewer, rollback, resume", async () => {
    const results = await runForgeBaselineProbes();
    const summary = summarizeBaselineMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.mismatches.length, 0, formatMismatchReport(summary.mismatches));

    for (const path of ["state", "tool", "verification", "reviewer", "rollback", "resume"] as const) {
      assert.ok(summary.byPath[path], `missing path summary: ${path}`);
    }
  });
});

function formatMismatchReport(mismatches: Awaited<ReturnType<typeof runForgeBaselineProbes>>): string {
  if (mismatches.length === 0) return "";
  return mismatches
    .map(m => `${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}
