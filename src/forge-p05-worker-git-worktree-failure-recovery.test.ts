import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessGitBranchInputBoundary,
  normalizeGitCommitRequest,
  recoverGitCommitRequest,
  validateGitCall,
  validateGitTransaction,
  buildGitWorktreeTelemetry,
  loadWorkerGitWorktreeBaseline,
  validateWorkerGitWorktreeBaseline,
  runWorkerGitWorktreeFailureRecoverySlice,
  validateWorkerGitWorktreeFailureRecoveryProbeMatrix,
  listWorkerGitWorktreeFailureRecoveryProbeIds,
  listWorkerGitWorktreeContractProbesByCategory,
  getActiveWorkerGitWorktreeContract,
  WORKER_GIT_WORKTREE_FAILURE_RECOVERY_CATEGORIES,
} from "./forge-p05-worker-git-worktree.js";

describe("Forge Worker Git Worktree Failure/Recovery Slice — P05-B05-A05", () => {
  it("defines failure_path, recovery_path and nogo_path categories with contract probes", () => {
    const contract = getActiveWorkerGitWorktreeContract();

    assert.equal(
      listWorkerGitWorktreeContractProbesByCategory("failure_path", contract).length,
      2,
    );
    assert.equal(
      listWorkerGitWorktreeContractProbesByCategory("recovery_path", contract).length,
      2,
    );
    assert.equal(
      listWorkerGitWorktreeContractProbesByCategory("nogo_path", contract).length,
      3,
    );

    const probeIds = listWorkerGitWorktreeFailureRecoveryProbeIds(contract).sort();
    assert.deepEqual(probeIds, [
      "wgt.exported_git_validator",
      "wgt.invalid_version_rejected",
      "wgt.malformed_branch_guard",
      "wgt.orchestrator_pre_git_validation",
      "wgt.recovery_missing_message_rejected",
      "wgt.recovery_string_args_coercion",
      "wgt.worker_prompt_git_contract",
    ]);
  });

  it("exercises failure paths: invalid fixture version and null-byte branch rejected safely", () => {
    const fixture = loadWorkerGitWorktreeBaseline();
    const invalidVersion = validateWorkerGitWorktreeBaseline({
      ...fixture,
      version: "9.9.9",
    });
    assert.equal(invalidVersion.valid, false);
    assert.ok(
      invalidVersion.issues.some(issue => issue.detail.includes("unexpected fixture version")),
    );

    const nullByteBranch = assessGitBranchInputBoundary("foreman/task\0");
    assert.equal(nullByteBranch.acceptable, false);
    assert.equal(nullByteBranch.disposition, "contains_null_byte");
  });

  it("exercises recovery paths: JSON string coercion and unrecoverable missing message", () => {
    const coerced = recoverGitCommitRequest(
      JSON.stringify({ message: "fix: git baseline", files: ["src/tools.ts"] }),
    );
    assert.equal(coerced.recovered, true);
    assert.equal(coerced.message, "fix: git baseline");
    assert.deepEqual(coerced.files, ["src/tools.ts"]);

    const normalized = normalizeGitCommitRequest(
      JSON.stringify({ message: "fix: git baseline", files: ["src/tools.ts"] }),
      undefined,
      "  foreman/task-001  ",
    );
    assert.equal(normalized.recovered, true);
    assert.equal(normalized.branch, "foreman/task-001");

    const missingMessage = recoverGitCommitRequest("");
    assert.equal(missingMessage.recovered, false);
    assert.ok(missingMessage.parseErrors.includes("empty"));
  });

  it("exercises NO-GO paths: git validator, orchestrator wiring and telemetry record", () => {
    const emptyMessage = validateGitTransaction({
      name: "git_commit",
      args: { message: "" },
    });
    assert.equal(emptyMessage.valid, false);
    assert.ok(emptyMessage.errors.some(error => error.includes("empty")));

    const nullByteBranch = validateGitCall({
      name: "git_commit",
      args: { message: "fix: git worktree", branch: "foreman/task\0" },
    });
    assert.equal(nullByteBranch.valid, false);
    assert.ok(nullByteBranch.errors.some(error => error.includes("null byte")));

    const telemetry = buildGitWorktreeTelemetry(
      {
        name: "git_commit",
        args: { message: "fix: git worktree baseline", branch: "foreman/task-001" },
      },
      { sequenceIndex: 3 },
    );
    assert.equal(telemetry.toolName, "git_commit");
    assert.equal(telemetry.sequenceIndex, 3);
    assert.equal(telemetry.validated, true);
    assert.ok(telemetry.validatedAt.length > 0);
  });

  it("executes failure/recovery slice with zero unexpected mismatches", () => {
    const contract = getActiveWorkerGitWorktreeContract();
    const slice = runWorkerGitWorktreeFailureRecoverySlice();

    assert.equal(slice.atom, "P05-B05-A05");
    assert.equal(slice.failureRecoveryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.failureRecoveryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const category of WORKER_GIT_WORKTREE_FAILURE_RECOVERY_CATEGORIES) {
      for (const probe of listWorkerGitWorktreeContractProbesByCategory(category, contract)) {
        const result = slice.failureRecoveryResults.find(r => r.id === probe.id);
        assert.ok(result, `missing failure/recovery result: ${probe.id}`);
        assert.equal(result!.expected, probe.expected);
        assert.equal(result!.aligned, true, `${probe.id}: ${result!.detail}`);
        assert.equal(result!.criterion, probe.criterion);
      }
    }

    const matrixValidation = validateWorkerGitWorktreeFailureRecoveryProbeMatrix(
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
