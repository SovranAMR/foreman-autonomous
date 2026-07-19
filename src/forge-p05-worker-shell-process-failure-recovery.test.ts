import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessShellCommandInputBoundary,
  recoverShellCommandRequest,
  validateShellCommand,
  buildShellProcessTelemetry,
  loadWorkerShellProcessBaseline,
  validateWorkerShellProcessBaseline,
  runWorkerShellProcessFailureRecoverySlice,
  validateWorkerShellProcessFailureRecoveryProbeMatrix,
  listWorkerShellProcessFailureRecoveryProbeIds,
  listWorkerShellProcessContractProbesByCategory,
  getActiveWorkerShellProcessContract,
  WORKER_SHELL_PROCESS_FAILURE_RECOVERY_CATEGORIES,
} from "./forge-p05-worker-shell-process.js";

describe("Forge Worker Shell Process Failure/Recovery Slice — P05-B04-A05", () => {
  it("defines failure_path, recovery_path and nogo_path categories with contract probes", () => {
    const contract = getActiveWorkerShellProcessContract();

    assert.equal(
      listWorkerShellProcessContractProbesByCategory("failure_path", contract).length,
      2,
    );
    assert.equal(
      listWorkerShellProcessContractProbesByCategory("recovery_path", contract).length,
      2,
    );
    assert.equal(
      listWorkerShellProcessContractProbesByCategory("nogo_path", contract).length,
      3,
    );

    const probeIds = listWorkerShellProcessFailureRecoveryProbeIds(contract).sort();
    assert.deepEqual(probeIds, [
      "wsp.exported_shell_validator",
      "wsp.invalid_version_rejected",
      "wsp.malformed_command_guard",
      "wsp.orchestrator_pre_shell_validation",
      "wsp.recovery_missing_command_rejected",
      "wsp.recovery_string_args_coercion",
      "wsp.worker_prompt_shell_contract",
    ]);
  });

  it("exercises failure paths: invalid fixture version and null-byte command rejected safely", () => {
    const fixture = loadWorkerShellProcessBaseline();
    const invalidVersion = validateWorkerShellProcessBaseline({
      ...fixture,
      version: "9.9.9",
    });
    assert.equal(invalidVersion.valid, false);
    assert.ok(
      invalidVersion.issues.some(issue => issue.detail.includes("unexpected fixture version")),
    );

    const nullByteCommand = assessShellCommandInputBoundary("npm test\0");
    assert.equal(nullByteCommand.acceptable, false);
    assert.equal(nullByteCommand.disposition, "contains_null_byte");
  });

  it("exercises recovery paths: JSON string coercion and unrecoverable missing command", () => {
    const coerced = recoverShellCommandRequest(
      JSON.stringify({ command: "npm test", timeout_ms: 45_000 }),
    );
    assert.equal(coerced.recovered, true);
    assert.equal(coerced.command, "npm test");
    assert.equal(coerced.timeoutMs, 45_000);

    const missingCommand = recoverShellCommandRequest("");
    assert.equal(missingCommand.recovered, false);
    assert.ok(missingCommand.parseErrors.includes("empty"));
  });

  it("exercises NO-GO paths: shell validator, orchestrator wiring and telemetry record", () => {
    const emptyCommand = validateShellCommand({
      name: "bash",
      args: { command: "" },
    });
    assert.equal(emptyCommand.valid, false);
    assert.ok(emptyCommand.errors.some(error => error.includes("empty")));

    const invalidTimeout = validateShellCommand({
      name: "bash",
      args: { command: "npm test", timeout_ms: 0 },
    });
    assert.equal(invalidTimeout.valid, false);
    assert.ok(invalidTimeout.errors.some(error => error.includes("timeout")));

    const telemetry = buildShellProcessTelemetry(
      {
        name: "bash",
        args: { explanation: "probe", command: "npm test", timeout_ms: 30_000 },
      },
      { sequenceIndex: 2 },
    );
    assert.equal(telemetry.toolName, "bash");
    assert.equal(telemetry.sequenceIndex, 2);
    assert.equal(telemetry.validated, true);
    assert.ok(telemetry.validatedAt.length > 0);
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveWorkerShellProcessContract();
    const slice = runWorkerShellProcessFailureRecoverySlice();

    assert.equal(slice.atom, "P05-B04-A05");
    assert.equal(slice.failureRecoveryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of WORKER_SHELL_PROCESS_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listWorkerShellProcessContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.expected, probe.expected);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateWorkerShellProcessFailureRecoveryProbeMatrix(
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
