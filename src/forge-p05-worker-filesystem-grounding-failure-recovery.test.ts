import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessFilesystemReadInputBoundary,
  recoverFilesystemReadPath,
  validateReadBeforeEdit,
  validateFilesystemGrounding,
  buildFilesystemGroundingTelemetry,
  loadWorkerFilesystemGroundingBaseline,
  validateWorkerFilesystemGroundingBaseline,
  runWorkerFilesystemGroundingFailureRecoverySlice,
  validateWorkerFilesystemGroundingFailureRecoveryProbeMatrix,
  listWorkerFilesystemGroundingFailureRecoveryProbeIds,
  listWorkerFilesystemGroundingContractProbesByCategory,
  getActiveWorkerFilesystemGroundingContract,
  WORKER_FILESYSTEM_GROUNDING_FAILURE_RECOVERY_CATEGORIES,
} from "./forge-p05-worker-filesystem-grounding.js";

describe("Forge Worker Filesystem Grounding Failure/Recovery Slice — P05-B02-A05", () => {
  it("defines failure_path, recovery_path and nogo_path categories with contract probes", () => {
    const contract = getActiveWorkerFilesystemGroundingContract();

    assert.equal(
      listWorkerFilesystemGroundingContractProbesByCategory("failure_path", contract).length,
      2,
    );
    assert.equal(
      listWorkerFilesystemGroundingContractProbesByCategory("recovery_path", contract).length,
      2,
    );
    assert.equal(
      listWorkerFilesystemGroundingContractProbesByCategory("nogo_path", contract).length,
      3,
    );

    const probeIds = listWorkerFilesystemGroundingFailureRecoveryProbeIds(contract).sort();
    assert.deepEqual(probeIds, [
      "wfg.exported_grounding_validator",
      "wfg.grounding_telemetry_record",
      "wfg.invalid_version_rejected",
      "wfg.malformed_path_guard",
      "wfg.read_before_edit_validator",
      "wfg.recovery_missing_path_rejected",
      "wfg.recovery_relative_path_coercion",
    ]);
  });

  it("exercises failure paths: invalid fixture version and null-byte path rejected safely", () => {
    const fixture = loadWorkerFilesystemGroundingBaseline();
    const invalidVersion = validateWorkerFilesystemGroundingBaseline({
      ...fixture,
      version: "9.9.9",
    });
    assert.equal(invalidVersion.valid, false);
    assert.ok(
      invalidVersion.issues.some(issue => issue.detail.includes("unexpected fixture version")),
    );

    const nullBytePath = assessFilesystemReadInputBoundary("src/\0secret.ts");
    assert.equal(nullBytePath.acceptable, false);
    assert.equal(nullBytePath.disposition, "contains_null_byte");
  });

  it("exercises recovery paths: relative path coercion and unrecoverable missing path", () => {
    const coerced = recoverFilesystemReadPath("./src/tools.ts");
    assert.equal(coerced.recovered, true);
    assert.equal(coerced.path, "src/tools.ts");

    const missingPath = recoverFilesystemReadPath("");
    assert.equal(missingPath.recovered, false);
    assert.ok(missingPath.parseErrors.includes("empty"));
  });

  it("exercises NO-GO paths: read-before-edit validator, grounding validator and telemetry record", () => {
    const ungrounded = validateReadBeforeEdit(
      { name: "edit_file", args: { path: "src/tools.ts" } },
      new Set<string>(),
    );
    assert.equal(ungrounded.valid, false);
    assert.ok(ungrounded.errors.some(error => error.includes("read_file grounding required")));

    const invalidRead = validateFilesystemGrounding(
      { name: "read_file", args: {} },
      new Set<string>(),
    );
    assert.equal(invalidRead.valid, false);
    assert.ok(invalidRead.errors.some(error => error.includes("requires path argument")));

    const telemetry = buildFilesystemGroundingTelemetry(
      { name: "read_file", args: { explanation: "probe", path: "src/tools.ts" } },
      { sequenceIndex: 2 },
    );
    assert.equal(telemetry.toolName, "read_file");
    assert.equal(telemetry.sequenceIndex, 2);
    assert.equal(telemetry.grounded, true);
    assert.ok(telemetry.recordedAt.length > 0);
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveWorkerFilesystemGroundingContract();
    const slice = runWorkerFilesystemGroundingFailureRecoverySlice();

    assert.equal(slice.atom, "P05-B02-A05");
    assert.equal(slice.failureRecoveryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of WORKER_FILESYSTEM_GROUNDING_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listWorkerFilesystemGroundingContractProbesByCategory(
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

    const matrixValidation = validateWorkerFilesystemGroundingFailureRecoveryProbeMatrix(
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
