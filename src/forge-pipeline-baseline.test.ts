import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadForgeBaselineFixture,
  runForgeBaselineProbes,
  runForgeBaselineProbesWithRecord,
  summarizeBaselineMatrix,
  validateFixtureAgainstContract,
  validateBaselineRunRecord,
} from "./forge-baseline-harness.js";
import { getActiveForgeBaselineContract } from "./forge-baseline-contract.js";

describe("Forge Pipeline Baseline — P01-B01-A01 + A02 contract", () => {
  it("loads versioned baseline fixture aligned with typed contract", () => {
    const fixture = loadForgeBaselineFixture();
    const contract = getActiveForgeBaselineContract();
    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P01-B01-A01");
    assert.equal(fixture.contractAtom, contract.atom);
    assert.equal(validateFixtureAgainstContract(fixture).valid, true);
    assert.ok(fixture.paths.state.length >= 5);
    assert.ok(fixture.paths.tool.length >= 3);
    assert.ok(fixture.paths.verification.length >= 4);
    assert.ok(fixture.paths.reviewer.length >= 6);
    assert.ok(fixture.paths.rollback.length >= 5);
    assert.ok(fixture.paths.resume.length >= 4);
  });

  it("executes PASS/FAIL matrix for state, tool, verification, reviewer, rollback, resume", async () => {
    const results = await runForgeBaselineProbes();
    const summary = summarizeBaselineMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.mismatches.length, 0, formatMismatchReport(summary.mismatches));

    for (const path of ["state", "tool", "verification", "reviewer", "rollback", "resume"] as const) {
      assert.ok(summary.byPath[path], `missing path summary: ${path}`);
    }

    for (const result of results) {
      assert.ok(result.criterion, `probe ${result.id} missing contract criterion`);
    }
  });

  it("records evidence, telemetry and provenance for full baseline run (P01-B01-A06)", async () => {
    const record = await runForgeBaselineProbesWithRecord();
    const validation = validateBaselineRunRecord(record);

    assert.equal(record.evidence.length, 27);
    assert.equal(record.telemetry.length, 27);
    assert.equal(record.provenance.totalProbes, 27);
    assert.ok(record.provenance.runId.length > 8);
    assert.ok(record.provenance.startedAt <= record.provenance.completedAt);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(record.summary.mismatches, 0);

    for (const item of record.telemetry) {
      assert.ok(item.durationMs >= 0, `${item.probeId} negative duration`);
      assert.ok(Number.isFinite(item.sequenceIndex));
    }

    for (const item of record.evidence) {
      assert.ok(item.criterion.length > 0, `${item.probeId} missing criterion in evidence`);
      assert.ok(item.recordedAt.length > 10);
    }
  });
});

function formatMismatchReport(mismatches: Awaited<ReturnType<typeof runForgeBaselineProbes>>): string {
  if (mismatches.length === 0) return "";
  return mismatches
    .map(m => `${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}
