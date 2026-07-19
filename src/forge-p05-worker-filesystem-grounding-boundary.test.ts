import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessFilesystemReadInputBoundary,
  assessFilesystemReadLineRangeBoundary,
  normalizeFilesystemGroundingPath,
  validateFilesystemGrounding,
  validateReadBeforeEdit,
  runWorkerFilesystemGroundingBoundarySlice,
  validateWorkerFilesystemGroundingBoundaryProbeMatrix,
  getActiveWorkerFilesystemGroundingContract,
  listWorkerFilesystemGroundingContractProbesByCategory,
  WORKER_FILESYSTEM_GROUNDING_PATH_MAX_LENGTH,
} from "./forge-p05-worker-filesystem-grounding.js";

describe("Forge Worker Filesystem Grounding Boundary Slice — P05-B02-A04", () => {
  it("assessFilesystemReadInputBoundary handles empty, whitespace-only, null-byte and oversized paths", () => {
    const empty = assessFilesystemReadInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessFilesystemReadInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessFilesystemReadInputBoundary("src/tools.ts\x00");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const trimmed = assessFilesystemReadInputBoundary("  src/tools.ts  ");
    assert.equal(trimmed.acceptable, true);
    assert.equal(trimmed.normalizedPath, "src/tools.ts");
    assert.equal(trimmed.disposition, "valid");

    const exactMax = assessFilesystemReadInputBoundary("src/" + "x".repeat(WORKER_FILESYSTEM_GROUNDING_PATH_MAX_LENGTH - 4));
    assert.equal(exactMax.acceptable, true);
    assert.equal(exactMax.truncated, false);
    assert.equal(exactMax.disposition, "valid");

    const oversized = assessFilesystemReadInputBoundary(
      "src/" + "x".repeat(WORKER_FILESYSTEM_GROUNDING_PATH_MAX_LENGTH + 500),
    );
    assert.equal(oversized.acceptable, true);
    assert.equal(oversized.truncated, true);
    assert.equal(oversized.disposition, "exceeds_max_length");
    assert.equal(oversized.normalizedPath.length, WORKER_FILESYSTEM_GROUNDING_PATH_MAX_LENGTH);
  });

  it("assessFilesystemReadLineRangeBoundary rejects invalid and inverted line ranges", () => {
    const none = assessFilesystemReadLineRangeBoundary({});
    assert.equal(none.valid, true);

    const valid = assessFilesystemReadLineRangeBoundary({ start_line: 1, end_line: 10 });
    assert.equal(valid.valid, true);
    assert.equal(valid.startLine, 1);
    assert.equal(valid.endLine, 10);

    const invalidStart = assessFilesystemReadLineRangeBoundary({ start_line: 0 });
    assert.equal(invalidStart.valid, false);

    const invalidEnd = assessFilesystemReadLineRangeBoundary({ end_line: -1 });
    assert.equal(invalidEnd.valid, false);

    const inverted = assessFilesystemReadLineRangeBoundary({ start_line: 20, end_line: 5 });
    assert.equal(inverted.valid, false);
    assert.ok(inverted.detail.includes("start_line"));
  });

  it("normalizeFilesystemGroundingPath applies boundary normalization before recovery", () => {
    const relative = normalizeFilesystemGroundingPath("  ./src/tools.ts  ");
    assert.equal(relative.recovered, true);
    assert.equal(relative.path, "src/tools.ts");

    const backslash = normalizeFilesystemGroundingPath("src\\tools.ts");
    assert.equal(backslash.recovered, true);
    assert.equal(backslash.path, "src/tools.ts");

    const blocked = normalizeFilesystemGroundingPath("src/\0secret.ts");
    assert.equal(blocked.recovered, false);
    assert.ok(blocked.detail.includes("null byte"));
  });

  it("validateFilesystemGrounding applies boundary normalization before grounding checks", () => {
    const whitespacePath = validateFilesystemGrounding(
      { name: "read_file", args: { explanation: "probe", path: "  src/tools.ts  " } },
      new Set<string>(),
    );
    assert.equal(whitespacePath.valid, true);
    assert.equal(whitespacePath.path, "src/tools.ts");

    const invalidLineRange = validateFilesystemGrounding(
      {
        name: "read_file",
        args: { explanation: "probe", path: "src/tools.ts", start_line: 50, end_line: 10 },
      },
      new Set<string>(),
    );
    assert.equal(invalidLineRange.valid, false);
    assert.ok(invalidLineRange.errors.some(error => error.includes("start_line")));

    const nullBytePath = validateFilesystemGrounding(
      { name: "read_file", args: { explanation: "probe", path: "src/tools.ts\0" } },
      new Set<string>(),
    );
    assert.equal(nullBytePath.valid, false);
    assert.ok(nullBytePath.errors.some(error => error.includes("null byte")));
  });

  it("validateReadBeforeEdit matches grounded paths after boundary normalization", () => {
    const priorReads = new Set<string>(["src/tools.ts"]);
    const ungrounded = validateReadBeforeEdit(
      { name: "edit_file", args: { path: "src/other.ts" } },
      priorReads,
    );
    assert.equal(ungrounded.valid, false);

    const normalizedMatch = validateReadBeforeEdit(
      { name: "edit_file", args: { path: "  ./src/tools.ts  " } },
      priorReads,
    );
    assert.equal(normalizedMatch.valid, true);
    assert.equal(normalizedMatch.path, "src/tools.ts");
  });

  it("defines boundary category with filesystem read path edge-case probes", () => {
    const boundary = listWorkerFilesystemGroundingContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 7);
    assert.deepEqual(ids, [
      "wfg.empty_path_boundary",
      "wfg.known_gaps_documented",
      "wfg.long_path_truncation_boundary",
      "wfg.null_byte_path_boundary",
      "wfg.probe_runner_exported",
      "wfg.source_block_gate_ref",
      "wfg.whitespace_path_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveWorkerFilesystemGroundingContract();
    const slice = runWorkerFilesystemGroundingBoundarySlice();

    assert.equal(slice.atom, "P05-B02-A04");
    assert.equal(slice.boundaryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listWorkerFilesystemGroundingContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateWorkerFilesystemGroundingBoundaryProbeMatrix(
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
