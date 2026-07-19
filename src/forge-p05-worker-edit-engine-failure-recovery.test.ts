import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessEditInputBoundary,
  recoverEditRequest,
  validateSurgicalEdit,
  buildEditEngineTelemetry,
  loadWorkerEditEngineBaseline,
  validateWorkerEditEngineBaseline,
  runWorkerEditEngineFailureRecoverySlice,
  validateWorkerEditEngineFailureRecoveryProbeMatrix,
  listWorkerEditEngineFailureRecoveryProbeIds,
  listWorkerEditEngineContractProbesByCategory,
  getActiveWorkerEditEngineContract,
  WORKER_EDIT_ENGINE_FAILURE_RECOVERY_CATEGORIES,
} from "./forge-p05-worker-edit-engine.js";

describe("Forge Worker Edit Engine Failure/Recovery Slice — P05-B03-A05", () => {
  it("defines failure_path, recovery_path and nogo_path categories with contract probes", () => {
    const contract = getActiveWorkerEditEngineContract();

    assert.equal(
      listWorkerEditEngineContractProbesByCategory("failure_path", contract).length,
      2,
    );
    assert.equal(
      listWorkerEditEngineContractProbesByCategory("recovery_path", contract).length,
      2,
    );
    assert.equal(
      listWorkerEditEngineContractProbesByCategory("nogo_path", contract).length,
      3,
    );

    const probeIds = listWorkerEditEngineFailureRecoveryProbeIds(contract).sort();
    assert.deepEqual(probeIds, [
      "wee.edit_telemetry_record",
      "wee.exported_edit_validator",
      "wee.invalid_version_rejected",
      "wee.malformed_edit_guard",
      "wee.orchestrator_pre_edit_validation",
      "wee.recovery_missing_path_rejected",
      "wee.recovery_string_args_coercion",
    ]);
  });

  it("exercises failure paths: invalid fixture version and null-byte new_text rejected safely", () => {
    const fixture = loadWorkerEditEngineBaseline();
    const invalidVersion = validateWorkerEditEngineBaseline({
      ...fixture,
      version: "9.9.9",
    });
    assert.equal(invalidVersion.valid, false);
    assert.ok(
      invalidVersion.issues.some(issue => issue.detail.includes("unexpected fixture version")),
    );

    const nullByteNewText = assessEditInputBoundary("valid", "replacement\0text");
    assert.equal(nullByteNewText.acceptable, false);
    assert.equal(nullByteNewText.disposition, "contains_null_byte");
  });

  it("exercises recovery paths: JSON string coercion and unrecoverable missing path", () => {
    const coerced = recoverEditRequest(
      "./src/tools.ts",
      JSON.stringify({ old_string: "const x = 1;", new_string: "const x = 2;" }),
    );
    assert.equal(coerced.recovered, true);
    assert.equal(coerced.path, "src/tools.ts");
    assert.equal(coerced.oldText, "const x = 1;");

    const missingPath = recoverEditRequest("", "const x = 1;", "const x = 2;");
    assert.equal(missingPath.recovered, false);
    assert.ok(missingPath.parseErrors.includes("empty"));
  });

  it("exercises NO-GO paths: surgical edit validator, orchestrator wiring and telemetry record", () => {
    const invalidEdit = validateSurgicalEdit({
      name: "edit_file",
      args: { path: "src/tools.ts", old_string: "", new_string: "x" },
    });
    assert.equal(invalidEdit.valid, false);
    assert.ok(invalidEdit.errors.some(error => error.includes("empty")));

    const invalidRange = validateSurgicalEdit({
      name: "edit_range",
      args: {
        path: "src/tools.ts",
        start_line: 10,
        end_line: 5,
        new_content: "x",
      },
    });
    assert.equal(invalidRange.valid, false);
    assert.ok(invalidRange.errors.some(error => error.includes("line range")));

    const telemetry = buildEditEngineTelemetry(
      {
        name: "edit_file",
        args: {
          explanation: "probe",
          path: "src/tools.ts",
          old_string: "const x = 1;",
          new_string: "const x = 2;",
        },
      },
      { sequenceIndex: 2 },
    );
    assert.equal(telemetry.toolName, "edit_file");
    assert.equal(telemetry.sequenceIndex, 2);
    assert.equal(telemetry.validated, true);
    assert.ok(telemetry.validatedAt.length > 0);
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveWorkerEditEngineContract();
    const slice = runWorkerEditEngineFailureRecoverySlice();

    assert.equal(slice.atom, "P05-B03-A05");
    assert.equal(slice.failureRecoveryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of WORKER_EDIT_ENGINE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listWorkerEditEngineContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.expected, probe.expected);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateWorkerEditEngineFailureRecoveryProbeMatrix(
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
