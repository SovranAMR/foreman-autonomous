import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessWorkerToolCallInputBoundary,
  recoverWorkerToolCall,
  validateWorkerToolCall,
  validateWorkerToolCallAgainstSchema,
  buildWorkerToolDispatchTelemetry,
  loadWorkerToolDispatchBaseline,
  validateWorkerToolDispatchBaseline,
  runWorkerToolDispatchFailureRecoverySlice,
  validateWorkerToolDispatchFailureRecoveryProbeMatrix,
  listWorkerToolDispatchFailureRecoveryProbeIds,
  listWorkerToolDispatchContractProbesByCategory,
  getActiveWorkerToolDispatchContract,
  WORKER_TOOL_DISPATCH_FAILURE_RECOVERY_CATEGORIES,
} from "./forge-p05-worker-tool-dispatch.js";

describe("Forge Worker Tool Dispatch Failure/Recovery Slice — P05-B01-A05", () => {
  it("defines failure_path, recovery_path and nogo_path categories with contract probes", () => {
    const contract = getActiveWorkerToolDispatchContract();

    assert.equal(
      listWorkerToolDispatchContractProbesByCategory("failure_path", contract).length,
      2,
    );
    assert.equal(
      listWorkerToolDispatchContractProbesByCategory("recovery_path", contract).length,
      2,
    );
    assert.equal(
      listWorkerToolDispatchContractProbesByCategory("nogo_path", contract).length,
      3,
    );

    const probeIds = listWorkerToolDispatchFailureRecoveryProbeIds(contract).sort();
    assert.deepEqual(probeIds, [
      "wtd.dispatch_telemetry_record",
      "wtd.exported_dispatch_validator",
      "wtd.invalid_version_rejected",
      "wtd.malformed_tool_call_guard",
      "wtd.recovery_missing_name_rejected",
      "wtd.recovery_string_args_coercion",
      "wtd.schema_validation_before_dispatch",
    ]);
  });

  it("exercises failure paths: invalid fixture version and null-byte args rejected safely", () => {
    const fixture = loadWorkerToolDispatchBaseline();
    const invalidVersion = validateWorkerToolDispatchBaseline({ ...fixture, version: "9.9.9" });
    assert.equal(invalidVersion.valid, false);
    assert.ok(invalidVersion.issues.some(issue => issue.detail.includes("unexpected fixture version")));

    const nullByteArgs = assessWorkerToolCallInputBoundary("read_file", { path: "file\0.txt" });
    assert.equal(nullByteArgs.acceptable, false);
    assert.equal(nullByteArgs.disposition, "contains_null_byte");
  });

  it("exercises recovery paths: string args coercion and unrecoverable missing name", () => {
    const coerced = recoverWorkerToolCall(
      "read_file",
      JSON.stringify({ path: "src/tools.ts" }),
    );
    assert.equal(coerced.recovered, true);
    assert.equal(coerced.call.name, "read_file");
    assert.equal(coerced.call.args.path, "src/tools.ts");

    const missingName = recoverWorkerToolCall("", { path: "src/tools.ts" });
    assert.equal(missingName.recovered, false);
    assert.ok(missingName.parseErrors.includes("empty"));
  });

  it("exercises NO-GO paths: schema validation, dispatch validator and telemetry record", () => {
    const missingRequired = validateWorkerToolCallAgainstSchema("read_file", {});
    assert.equal(missingRequired.valid, false);
    assert.ok(missingRequired.errors.some(error => error.includes("missing required parameter")));

    const invalidName = validateWorkerToolCall({ name: "", args: {} });
    assert.equal(invalidName.valid, false);

    const telemetry = buildWorkerToolDispatchTelemetry(
      { name: "read_file", args: { explanation: "probe", path: "src/tools.ts" } },
      { sequenceIndex: 2 },
    );
    assert.equal(telemetry.toolName, "read_file");
    assert.equal(telemetry.sequenceIndex, 2);
    assert.equal(telemetry.validated, true);
    assert.ok(telemetry.validatedAt.length > 0);
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveWorkerToolDispatchContract();
    const slice = runWorkerToolDispatchFailureRecoverySlice();

    assert.equal(slice.atom, "P05-B01-A05");
    assert.equal(slice.failureRecoveryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of WORKER_TOOL_DISPATCH_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listWorkerToolDispatchContractProbesByCategory(
        category,
        contract,
      )) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.expected, probe.expected);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateWorkerToolDispatchFailureRecoveryProbeMatrix(
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
