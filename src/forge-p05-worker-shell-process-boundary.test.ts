import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessShellCommandInputBoundary,
  assessShellTimeoutBoundary,
  normalizeShellCommandRequest,
  validateShellCommand,
  recoverShellCommandRequest,
  runWorkerShellProcessBoundarySlice,
  validateWorkerShellProcessBoundaryProbeMatrix,
  getActiveWorkerShellProcessContract,
  listWorkerShellProcessContractProbesByCategory,
  WORKER_SHELL_PROCESS_COMMAND_MAX_LENGTH,
  WORKER_SHELL_PROCESS_DEFAULT_TIMEOUT_MS,
  WORKER_SHELL_PROCESS_TIMEOUT_MAX_MS,
} from "./forge-p05-worker-shell-process.js";

describe("Forge Worker Shell Process Boundary Slice — P05-B04-A04", () => {
  it("assessShellCommandInputBoundary handles empty, whitespace-only, null-byte and oversized commands", () => {
    const empty = assessShellCommandInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessShellCommandInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessShellCommandInputBoundary("npm test\x00");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const trimmed = assessShellCommandInputBoundary("  npm test  ");
    assert.equal(trimmed.acceptable, true);
    assert.equal(trimmed.normalizedCommand, "npm test");
    assert.equal(trimmed.disposition, "valid");

    const exactMax = assessShellCommandInputBoundary("x".repeat(WORKER_SHELL_PROCESS_COMMAND_MAX_LENGTH));
    assert.equal(exactMax.acceptable, true);
    assert.equal(exactMax.truncated, false);
    assert.equal(exactMax.disposition, "valid");

    const oversized = assessShellCommandInputBoundary(
      "x".repeat(WORKER_SHELL_PROCESS_COMMAND_MAX_LENGTH + 500),
    );
    assert.equal(oversized.acceptable, true);
    assert.equal(oversized.truncated, true);
    assert.equal(oversized.disposition, "exceeds_max_length");
    assert.equal(oversized.normalizedCommand.length, WORKER_SHELL_PROCESS_COMMAND_MAX_LENGTH);
  });

  it("assessShellTimeoutBoundary rejects invalid and accepts valid timeout selectors", () => {
    const none = assessShellTimeoutBoundary(undefined);
    assert.equal(none.valid, true);
    assert.equal(none.timeoutMs, WORKER_SHELL_PROCESS_DEFAULT_TIMEOUT_MS);

    const valid = assessShellTimeoutBoundary(45_000);
    assert.equal(valid.valid, true);
    assert.equal(valid.timeoutMs, 45_000);

    const zero = assessShellTimeoutBoundary(0);
    assert.equal(zero.valid, false);

    const negative = assessShellTimeoutBoundary(-1);
    assert.equal(negative.valid, false);

    const float = assessShellTimeoutBoundary(1.5);
    assert.equal(float.valid, false);

    const capped = assessShellTimeoutBoundary(WORKER_SHELL_PROCESS_TIMEOUT_MAX_MS + 1_000);
    assert.equal(capped.valid, true);
    assert.equal(capped.timeoutMs, WORKER_SHELL_PROCESS_TIMEOUT_MAX_MS);
  });

  it("normalizeShellCommandRequest applies boundary normalization before recovery", () => {
    const trimmed = normalizeShellCommandRequest("  npm test  ", 45_000);
    assert.equal(trimmed.recovered, true);
    assert.equal(trimmed.command, "npm test");
    assert.equal(trimmed.timeoutMs, 45_000);

    const blocked = normalizeShellCommandRequest("npm test\0");
    assert.equal(blocked.recovered, false);
    assert.ok(blocked.detail.includes("null byte"));

    const invalidTimeout = normalizeShellCommandRequest("npm test", 0);
    assert.equal(invalidTimeout.recovered, false);
    assert.ok(invalidTimeout.detail.includes("timeout"));
  });

  it("recoverShellCommandRequest and validateShellCommand apply boundary normalization before dispatch", () => {
    const recovery = recoverShellCommandRequest(
      JSON.stringify({ command: "  npm test  ", timeout_ms: 45_000 }),
    );
    assert.equal(recovery.recovered, true);
    assert.equal(recovery.command, "npm test");
    assert.equal(recovery.timeoutMs, 45_000);

    const whitespaceCommand = validateShellCommand({
      name: "bash",
      args: { command: "  npm test  ", timeout_ms: 30_000 },
    });
    assert.equal(whitespaceCommand.valid, true);
    assert.equal(whitespaceCommand.command, "npm test");

    const invalidTimeout = validateShellCommand({
      name: "bash",
      args: { command: "npm test", timeout_ms: 0 },
    });
    assert.equal(invalidTimeout.valid, false);
    assert.ok(invalidTimeout.errors.some(error => error.includes("timeout")));

    const nullByteCommand = validateShellCommand({
      name: "bash",
      args: { command: "npm test\0" },
    });
    assert.equal(nullByteCommand.valid, false);
    assert.ok(nullByteCommand.errors.some(error => error.includes("null byte")));
  });

  it("defines boundary category with shell command input edge-case probes", () => {
    const boundary = listWorkerShellProcessContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 7);
    assert.deepEqual(ids, [
      "wsp.empty_command_boundary",
      "wsp.known_gaps_documented",
      "wsp.long_command_truncation_boundary",
      "wsp.null_byte_command_boundary",
      "wsp.probe_runner_exported",
      "wsp.source_block_gate_ref",
      "wsp.whitespace_command_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveWorkerShellProcessContract();
    const slice = runWorkerShellProcessBoundarySlice();

    assert.equal(slice.atom, "P05-B04-A04");
    assert.equal(slice.boundaryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listWorkerShellProcessContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateWorkerShellProcessBoundaryProbeMatrix(
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
