import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessEditInputBoundary,
  assessEditPathBoundary,
  assessEditOccurrenceBoundary,
  normalizeEditRequestPath,
  recoverEditRequest,
  validateSurgicalEdit,
  runWorkerEditEngineBoundarySlice,
  validateWorkerEditEngineBoundaryProbeMatrix,
  getActiveWorkerEditEngineContract,
  listWorkerEditEngineContractProbesByCategory,
  WORKER_EDIT_ENGINE_OLD_TEXT_MAX_LENGTH,
  WORKER_EDIT_ENGINE_PATH_MAX_LENGTH,
} from "./forge-p05-worker-edit-engine.js";

describe("Forge Worker Edit Engine Boundary Slice — P05-B03-A04", () => {
  it("assessEditPathBoundary handles empty, whitespace-only, null-byte and oversized paths", () => {
    const empty = assessEditPathBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessEditPathBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessEditPathBoundary("src/tools.ts\x00");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const trimmed = assessEditPathBoundary("  ./src/tools.ts  ");
    assert.equal(trimmed.acceptable, true);
    assert.equal(trimmed.normalizedPath, "src/tools.ts");
    assert.equal(trimmed.disposition, "valid");

    const backslash = assessEditPathBoundary("src\\tools.ts");
    assert.equal(backslash.acceptable, true);
    assert.equal(backslash.normalizedPath, "src/tools.ts");

    const exactMax = assessEditPathBoundary("src/" + "x".repeat(WORKER_EDIT_ENGINE_PATH_MAX_LENGTH - 4));
    assert.equal(exactMax.acceptable, true);
    assert.equal(exactMax.truncated, false);
    assert.equal(exactMax.disposition, "valid");

    const oversized = assessEditPathBoundary(
      "src/" + "x".repeat(WORKER_EDIT_ENGINE_PATH_MAX_LENGTH + 500),
    );
    assert.equal(oversized.acceptable, true);
    assert.equal(oversized.truncated, true);
    assert.equal(oversized.disposition, "exceeds_max_length");
    assert.equal(oversized.normalizedPath.length, WORKER_EDIT_ENGINE_PATH_MAX_LENGTH);
  });

  it("assessEditOccurrenceBoundary rejects invalid and accepts valid occurrence selectors", () => {
    const none = assessEditOccurrenceBoundary(undefined);
    assert.equal(none.valid, true);

    const all = assessEditOccurrenceBoundary("all");
    assert.equal(all.valid, true);
    assert.equal(all.occurrence, "all");

    const valid = assessEditOccurrenceBoundary(2);
    assert.equal(valid.valid, true);
    assert.equal(valid.occurrence, 2);

    const zero = assessEditOccurrenceBoundary(0);
    assert.equal(zero.valid, false);

    const negative = assessEditOccurrenceBoundary(-1);
    assert.equal(negative.valid, false);

    const float = assessEditOccurrenceBoundary(1.5);
    assert.equal(float.valid, false);

    const invalidString = assessEditOccurrenceBoundary("first");
    assert.equal(invalidString.valid, false);
  });

  it("assessEditInputBoundary handles old_text edge cases including exact max length", () => {
    const exactMax = assessEditInputBoundary("x".repeat(WORKER_EDIT_ENGINE_OLD_TEXT_MAX_LENGTH));
    assert.equal(exactMax.acceptable, true);
    assert.equal(exactMax.truncated, false);
    assert.equal(exactMax.disposition, "valid");

    const nullNewText = assessEditInputBoundary("valid", "replacement\0text");
    assert.equal(nullNewText.acceptable, false);
    assert.equal(nullNewText.disposition, "contains_null_byte");
  });

  it("normalizeEditRequestPath applies boundary normalization before recovery", () => {
    const relative = normalizeEditRequestPath("  ./src/tools.ts  ");
    assert.equal(relative.recovered, true);
    assert.equal(relative.path, "src/tools.ts");

    const backslash = normalizeEditRequestPath("src\\tools.ts");
    assert.equal(backslash.recovered, true);
    assert.equal(backslash.path, "src/tools.ts");

    const blocked = normalizeEditRequestPath("src/\0secret.ts");
    assert.equal(blocked.recovered, false);
    assert.ok(blocked.detail.includes("null byte"));
  });

  it("recoverEditRequest and validateSurgicalEdit apply boundary normalization before dispatch", () => {
    const recovery = recoverEditRequest(
      "./src/tools.ts",
      JSON.stringify({ old_string: "const x = 1;", new_string: "const x = 2;" }),
    );
    assert.equal(recovery.recovered, true);
    assert.equal(recovery.path, "src/tools.ts");

    const whitespacePath = validateSurgicalEdit({
      name: "edit_file",
      args: {
        explanation: "probe",
        path: "  ./src/tools.ts  ",
        old_string: "const x = 1;",
        new_string: "const x = 2;",
      },
    });
    assert.equal(whitespacePath.valid, true);
    assert.equal(whitespacePath.path, "src/tools.ts");

    const invalidOccurrence = validateSurgicalEdit({
      name: "edit_file",
      args: {
        path: "src/tools.ts",
        old_string: "const x = 1;",
        new_string: "const x = 2;",
        occurrence: 0,
      },
    });
    assert.equal(invalidOccurrence.valid, false);
    assert.ok(invalidOccurrence.errors.some(error => error.includes("occurrence")));

    const nullBytePath = validateSurgicalEdit({
      name: "edit_file",
      args: { path: "src/tools.ts\0", old_string: "x", new_string: "y" },
    });
    assert.equal(nullBytePath.valid, false);
    assert.ok(nullBytePath.errors.some(error => error.includes("null byte")));

    const invalidRange = validateSurgicalEdit({
      name: "edit_range",
      args: {
        path: "src/tools.ts",
        start_line: 50,
        end_line: 10,
        new_content: "x",
      },
    });
    assert.equal(invalidRange.valid, false);
    assert.ok(invalidRange.errors.some(error => error.includes("line range")));
  });

  it("defines boundary category with surgical edit input edge-case probes", () => {
    const boundary = listWorkerEditEngineContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 7);
    assert.deepEqual(ids, [
      "wee.empty_old_text_boundary",
      "wee.known_gaps_documented",
      "wee.long_old_text_truncation_boundary",
      "wee.null_byte_old_text_boundary",
      "wee.probe_runner_exported",
      "wee.source_block_gate_ref",
      "wee.whitespace_old_text_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveWorkerEditEngineContract();
    const slice = runWorkerEditEngineBoundarySlice();

    assert.equal(slice.atom, "P05-B03-A04");
    assert.equal(slice.boundaryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listWorkerEditEngineContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateWorkerEditEngineBoundaryProbeMatrix(
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
