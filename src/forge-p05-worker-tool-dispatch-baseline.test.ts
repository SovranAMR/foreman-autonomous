import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkerToolDispatchBaseline,
  runWorkerToolDispatchProbes,
  validateWorkerToolDispatchBaseline,
  summarizeWorkerToolDispatchMatrix,
  listWorkerToolDispatchProbesByExpected,
  listWorkerToolDispatchKnownGaps,
  assessWorkerToolCallInputBoundary,
  recoverWorkerToolCall,
  probeUnknownToolDispatchError,
  WORKER_TOOL_DISPATCH_CATEGORIES,
  WORKER_TOOL_DISPATCH_ARGS_MAX_LENGTH,
  FORGE_WORKER_TOOL_DISPATCH_VERSION,
} from "./forge-p05-worker-tool-dispatch.js";
import { getForgeP04B10ToP05Handoff } from "./forge-p04-researcher-phase-gate.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Worker Tool Dispatch — P05-B01-A01", () => {
  it("loads versioned worker tool dispatch baseline aligned with P04-B10 block gate handoff", () => {
    const fixture = loadWorkerToolDispatchBaseline();
    const validation = validateWorkerToolDispatchBaseline(fixture);
    const handoff = getForgeP04B10ToP05Handoff();

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P05-B01-A01");
    assert.equal(fixture.contractAtom, "P05-B01-A02");
    assert.equal(fixture.sourceBlockGate.atom, "P04-B10-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.researcherPhaseGateProbeCount, 24);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 27);
    assert.equal(handoff.targetBlock.entryAtom, "P05-B01-A01");
  });

  it("measures worker tool dispatch probes with zero unexpected mismatches after A03 slice", () => {
    const results = runWorkerToolDispatchProbes();
    const summary = summarizeWorkerToolDispatchMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 27);
    assert.equal(summary.knownGaps.length, 0);

    const documentedFail = listWorkerToolDispatchProbesByExpected(
      "FAIL",
      loadWorkerToolDispatchBaseline(),
    );
    assert.equal(documentedFail.length, 0);

    for (const cat of WORKER_TOOL_DISPATCH_CATEGORIES) {
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

  it("documents zero remaining worker tool dispatch gaps after production slice", () => {
    const gaps = listWorkerToolDispatchKnownGaps(runWorkerToolDispatchProbes());
    assert.deepEqual(gaps.map(g => g.id).sort(), []);
  });

  it("assessWorkerToolCallInputBoundary rejects empty and null-byte tool names", () => {
    const empty = assessWorkerToolCallInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessWorkerToolCallInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessWorkerToolCallInputBoundary("read_file\0");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessWorkerToolCallInputBoundary truncates oversized serialized tool args", () => {
    const longArgs = { payload: "x".repeat(WORKER_TOOL_DISPATCH_ARGS_MAX_LENGTH + 500) };
    const truncated = assessWorkerToolCallInputBoundary("read_file", longArgs);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("recoverWorkerToolCall coerces JSON string args into dispatch-ready object record", () => {
    const recovery = recoverWorkerToolCall(
      "read_file",
      JSON.stringify({ path: "src/tools.ts" }),
    );

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.call.name, "read_file");
    assert.equal(recovery.call.args.path, "src/tools.ts");
  });

  it("probeUnknownToolDispatchError returns deterministic unknown-tool error", async () => {
    const ok = await probeUnknownToolDispatchError();
    assert.equal(ok, true);
  });

  it("exports harness version for worker tool dispatch baseline", () => {
    assert.equal(FORGE_WORKER_TOOL_DISPATCH_VERSION, "1.0.0-a05");
  });
});
