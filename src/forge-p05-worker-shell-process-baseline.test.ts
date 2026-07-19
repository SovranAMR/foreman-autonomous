import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkerShellProcessBaseline,
  runWorkerShellProcessProbes,
  validateWorkerShellProcessBaseline,
  summarizeWorkerShellProcessMatrix,
  listWorkerShellProcessProbesByExpected,
  listWorkerShellProcessKnownGaps,
  assessShellCommandInputBoundary,
  recoverShellCommandRequest,
  probeDangerousShellCommandBlocked,
  WORKER_SHELL_PROCESS_CATEGORIES,
  WORKER_SHELL_PROCESS_COMMAND_MAX_LENGTH,
  FORGE_WORKER_SHELL_PROCESS_VERSION,
} from "./forge-p05-worker-shell-process.js";
import { getForgeP05B03ToB04Handoff } from "./forge-p05-worker-edit-engine.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Worker Shell Process — P05-B04-A01", () => {
  it("loads versioned shell process baseline aligned with P05-B03 block gate handoff", () => {
    const fixture = loadWorkerShellProcessBaseline();
    const validation = validateWorkerShellProcessBaseline(fixture);
    const handoff = getForgeP05B03ToB04Handoff();

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P05-B04-A01");
    assert.equal(fixture.contractAtom, "P05-B04-A02");
    assert.equal(fixture.sourceBlockGate.atom, "P05-B03-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.workerEditEngineProbeCount, 27);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 27);
    assert.equal(handoff.targetBlock.entryAtom, "P05-B04-A01");
  });

  it("measures shell process probes with full alignment after A03 production slice", () => {
    const results = runWorkerShellProcessProbes();
    const summary = summarizeWorkerShellProcessMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 27);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listWorkerShellProcessProbesByExpected(
      "FAIL",
      loadWorkerShellProcessBaseline(),
    );
    assert.equal(documentedFail.length, 0);

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of WORKER_SHELL_PROCESS_CATEGORIES) {
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

  it("documents zero remaining shell process gaps after production slice", () => {
    const gaps = listWorkerShellProcessKnownGaps(runWorkerShellProcessProbes());
    assert.deepEqual(gaps.map(g => g.id).sort(), []);
  });

  it("assessShellCommandInputBoundary rejects empty and null-byte commands", () => {
    const empty = assessShellCommandInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessShellCommandInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessShellCommandInputBoundary("npm test\0");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessShellCommandInputBoundary truncates oversized shell commands", () => {
    const longCommand = "x".repeat(WORKER_SHELL_PROCESS_COMMAND_MAX_LENGTH + 500);
    const truncated = assessShellCommandInputBoundary(longCommand);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedCommand.length, WORKER_SHELL_PROCESS_COMMAND_MAX_LENGTH);
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("recoverShellCommandRequest coerces JSON string args into dispatch-ready record", () => {
    const recovery = recoverShellCommandRequest(
      JSON.stringify({ command: "npm test", timeout_ms: 60_000 }),
    );

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.command, "npm test");
    assert.equal(recovery.timeoutMs, 60_000);
  });

  it("probeDangerousShellCommandBlocked confirms execution engine dangerous pattern guard", () => {
    assert.equal(probeDangerousShellCommandBlocked(), true);
  });

  it("exports harness version for shell process baseline", () => {
    assert.equal(FORGE_WORKER_SHELL_PROCESS_VERSION, "1.0.0-a03");
  });
});
