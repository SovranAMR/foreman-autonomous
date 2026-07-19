import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkerEditEngineBaseline,
  runWorkerEditEngineProbes,
  validateWorkerEditEngineBaseline,
  summarizeWorkerEditEngineMatrix,
  listWorkerEditEngineProbesByExpected,
  listWorkerEditEngineKnownGaps,
  assessEditInputBoundary,
  recoverEditRequest,
  probeEditNotFoundError,
  WORKER_EDIT_ENGINE_CATEGORIES,
  WORKER_EDIT_ENGINE_OLD_TEXT_MAX_LENGTH,
  FORGE_WORKER_EDIT_ENGINE_VERSION,
} from "./forge-p05-worker-edit-engine.js";
import { getForgeP05B02ToB03Handoff } from "./forge-p05-worker-filesystem-grounding.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Worker Edit Engine — P05-B03-A01", () => {
  it("loads versioned edit engine baseline aligned with P05-B02 block gate handoff", () => {
    const fixture = loadWorkerEditEngineBaseline();
    const validation = validateWorkerEditEngineBaseline(fixture);
    const handoff = getForgeP05B02ToB03Handoff();

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P05-B03-A01");
    assert.equal(fixture.contractAtom, "P05-B03-A02");
    assert.equal(fixture.sourceBlockGate.atom, "P05-B02-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.workerFilesystemGroundingProbeCount, 27);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 27);
    assert.equal(handoff.targetBlock.entryAtom, "P05-B03-A01");
  });

  it("measures edit engine probes with documented FAIL gaps from P05-B02 sealed handoff", () => {
    const results = runWorkerEditEngineProbes();
    const summary = summarizeWorkerEditEngineMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 27);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listWorkerEditEngineProbesByExpected(
      "FAIL",
      loadWorkerEditEngineBaseline(),
    );
    assert.equal(documentedFail.length, 6);
    assert.ok(documentedFail.some(p => p.id === "wee.typed_edit_call_union"));
    assert.ok(documentedFail.some(p => p.id === "wee.multi_occurrence_dispatch"));
    assert.ok(documentedFail.some(p => p.id === "wee.exported_edit_validator"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of WORKER_EDIT_ENGINE_CATEGORIES) {
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

  it("documents edit engine gaps as measurable baseline debt", () => {
    const gaps = listWorkerEditEngineKnownGaps(runWorkerEditEngineProbes());
    assert.equal(gaps.length, 6);
    assert.deepEqual(
      gaps.map(g => g.id).sort(),
      [
        "wee.edit_telemetry_record",
        "wee.exported_edit_validator",
        "wee.multi_occurrence_dispatch",
        "wee.orchestrator_pre_edit_validation",
        "wee.typed_edit_call_union",
        "wee.worker_prompt_edit_contract",
      ],
    );
  });

  it("assessEditInputBoundary rejects empty and null-byte old_text", () => {
    const empty = assessEditInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessEditInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessEditInputBoundary("const x = 1;\0");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessEditInputBoundary truncates oversized old_text", () => {
    const longText = "x".repeat(WORKER_EDIT_ENGINE_OLD_TEXT_MAX_LENGTH + 500);
    const truncated = assessEditInputBoundary(longText);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedOldText.length, WORKER_EDIT_ENGINE_OLD_TEXT_MAX_LENGTH);
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("recoverEditRequest coerces JSON string args into dispatch-ready edit record", () => {
    const recovery = recoverEditRequest(
      "./src/tools.ts",
      JSON.stringify({ old_string: "const x = 1;", new_string: "const x = 2;" }),
    );

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.path, "src/tools.ts");
    assert.equal(recovery.oldText, "const x = 1;");
  });

  it("probeEditNotFoundError returns deterministic not-found edit error", () => {
    const ok = probeEditNotFoundError();
    assert.equal(ok, true);
  });

  it("exports harness version for edit engine baseline", () => {
    assert.equal(FORGE_WORKER_EDIT_ENGINE_VERSION, "1.0.0-a01");
  });
});
