import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessWorkerToolCallInputBoundary,
  validateWorkerToolCall,
  validateWorkerToolCallAgainstSchema,
  runWorkerToolDispatchBoundarySlice,
  validateWorkerToolDispatchBoundaryProbeMatrix,
  getActiveWorkerToolDispatchContract,
  listWorkerToolDispatchContractProbesByCategory,
  WORKER_TOOL_DISPATCH_ARGS_MAX_LENGTH,
} from "./forge-p05-worker-tool-dispatch.js";

describe("Forge Worker Tool Dispatch Boundary Slice — P05-B01-A04", () => {
  it("assessWorkerToolCallInputBoundary handles empty, whitespace-only, null-byte and oversized inputs", () => {
    const empty = assessWorkerToolCallInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessWorkerToolCallInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByteName = assessWorkerToolCallInputBoundary("read_file\x00");
    assert.equal(nullByteName.disposition, "contains_null_byte");
    assert.equal(nullByteName.acceptable, false);

    const nullByteArgs = assessWorkerToolCallInputBoundary("read_file", { path: "a\0b" });
    assert.equal(nullByteArgs.disposition, "contains_null_byte");
    assert.equal(nullByteArgs.acceptable, false);

    const nestedNullByte = assessWorkerToolCallInputBoundary("read_file", {
      tags: ["ok", "bad\x00"],
    });
    assert.equal(nestedNullByte.disposition, "contains_null_byte");
    assert.equal(nestedNullByte.acceptable, false);

    const trimmed = assessWorkerToolCallInputBoundary("  read_file  ", {
      path: "src/tools.ts",
    });
    assert.equal(trimmed.acceptable, true);
    assert.equal(trimmed.normalizedName, "read_file");
    assert.equal(trimmed.disposition, "valid");

    const exactMaxPayload = "x".repeat(WORKER_TOOL_DISPATCH_ARGS_MAX_LENGTH - 14);
    const exactMax = assessWorkerToolCallInputBoundary("read_file", { payload: exactMaxPayload });
    assert.equal(exactMax.acceptable, true);
    assert.equal(exactMax.truncated, false);
    assert.equal(exactMax.disposition, "valid");

    const oversized = assessWorkerToolCallInputBoundary("read_file", {
      payload: "x".repeat(WORKER_TOOL_DISPATCH_ARGS_MAX_LENGTH + 500),
    });
    assert.equal(oversized.acceptable, true);
    assert.equal(oversized.truncated, true);
    assert.equal(oversized.disposition, "exceeds_max_length");
  });

  it("validateWorkerToolCall applies boundary normalization before schema validation", () => {
    const whitespaceName = validateWorkerToolCall({
      name: "  read_file  ",
      args: { explanation: "probe", path: "src/tools.ts" },
    });
    assert.equal(whitespaceName.valid, true);
    assert.equal(whitespaceName.call?.name, "read_file");

    const unknownTool = validateWorkerToolCall({
      name: "__nonexistent_foreman_tool__",
      args: {},
    });
    assert.equal(unknownTool.valid, false);
    assert.ok(unknownTool.errors.some(error => error.includes("unknown tool")));

    const nullRequired = validateWorkerToolCallAgainstSchema("read_file", {
      explanation: "probe",
      path: null as unknown as string,
    });
    assert.equal(nullRequired.valid, false);
    assert.ok(nullRequired.errors.some(error => error.includes("missing required parameter")));

    const boundaryBlocked = validateWorkerToolCall({
      name: "read_file\0",
      args: { explanation: "probe", path: "src/tools.ts" },
    });
    assert.equal(boundaryBlocked.valid, false);
    assert.ok(boundaryBlocked.errors.some(error => error.includes("null byte")));
  });

  it("defines boundary category with tool call input edge-case probes", () => {
    const boundary = listWorkerToolDispatchContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 7);
    assert.deepEqual(ids, [
      "wtd.empty_tool_name_boundary",
      "wtd.known_gaps_documented",
      "wtd.long_tool_args_truncation_boundary",
      "wtd.null_byte_tool_name_boundary",
      "wtd.probe_runner_exported",
      "wtd.source_block_gate_ref",
      "wtd.whitespace_tool_name_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveWorkerToolDispatchContract();
    const slice = runWorkerToolDispatchBoundarySlice();

    assert.equal(slice.atom, "P05-B01-A04");
    assert.equal(slice.boundaryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listWorkerToolDispatchContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateWorkerToolDispatchBoundaryProbeMatrix(
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
