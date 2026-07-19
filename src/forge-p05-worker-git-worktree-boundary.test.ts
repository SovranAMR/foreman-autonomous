import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessGitBranchInputBoundary,
  normalizeGitCommitRequest,
  recoverGitCommitRequest,
  validateGitCall,
  runWorkerGitWorktreeBoundarySlice,
  validateWorkerGitWorktreeBoundaryProbeMatrix,
  getActiveWorkerGitWorktreeContract,
  listWorkerGitWorktreeContractProbesByCategory,
  WORKER_GIT_WORKTREE_BRANCH_MAX_LENGTH,
} from "./forge-p05-worker-git-worktree.js";

describe("Forge Worker Git Worktree Boundary Slice — P05-B05-A04", () => {
  it("assessGitBranchInputBoundary handles empty, whitespace-only, null-byte and oversized branch names", () => {
    const empty = assessGitBranchInputBoundary("");
    assert.equal(empty.disposition, "empty");
    assert.equal(empty.acceptable, false);

    const whitespace = assessGitBranchInputBoundary("  \t\n ");
    assert.equal(whitespace.disposition, "whitespace_only");
    assert.equal(whitespace.acceptable, false);

    const nullByte = assessGitBranchInputBoundary("foreman/task\0");
    assert.equal(nullByte.disposition, "contains_null_byte");
    assert.equal(nullByte.acceptable, false);

    const trimmed = assessGitBranchInputBoundary("  foreman/task-001  ");
    assert.equal(trimmed.acceptable, true);
    assert.equal(trimmed.normalizedBranch, "foreman/task-001");
    assert.equal(trimmed.disposition, "valid");

    const exactMax = assessGitBranchInputBoundary("feature/" + "x".repeat(WORKER_GIT_WORKTREE_BRANCH_MAX_LENGTH - 9));
    assert.equal(exactMax.acceptable, true);
    assert.equal(exactMax.truncated, false);
    assert.equal(exactMax.disposition, "valid");

    const oversized = assessGitBranchInputBoundary(
      "feature/" + "x".repeat(WORKER_GIT_WORKTREE_BRANCH_MAX_LENGTH + 50),
    );
    assert.equal(oversized.acceptable, true);
    assert.equal(oversized.truncated, true);
    assert.equal(oversized.disposition, "exceeds_max_length");
    assert.equal(oversized.normalizedBranch.length, WORKER_GIT_WORKTREE_BRANCH_MAX_LENGTH);
  });

  it("normalizeGitCommitRequest applies branch boundary normalization before recovery", () => {
    const trimmed = normalizeGitCommitRequest(
      "fix: git worktree boundary",
      ["src/tools.ts"],
      "  foreman/task-001  ",
    );
    assert.equal(trimmed.recovered, true);
    assert.equal(trimmed.message, "fix: git worktree boundary");
    assert.deepEqual(trimmed.files, ["src/tools.ts"]);
    assert.equal(trimmed.branch, "foreman/task-001");

    const blockedBranch = normalizeGitCommitRequest("fix: boundary", undefined, "foreman/task\0");
    assert.equal(blockedBranch.recovered, false);
    assert.ok(blockedBranch.detail.includes("null byte"));

    const blockedMessage = normalizeGitCommitRequest("", undefined, "foreman/task-001");
    assert.equal(blockedMessage.recovered, false);
    assert.ok(blockedMessage.detail.includes("empty"));
  });

  it("recoverGitCommitRequest and validateGitCall apply boundary normalization before dispatch", () => {
    const recovery = recoverGitCommitRequest(
      JSON.stringify({ message: "fix: git baseline", files: ["src/tools.ts"] }),
    );
    assert.equal(recovery.recovered, true);
    assert.equal(recovery.message, "fix: git baseline");
    assert.deepEqual(recovery.files, ["src/tools.ts"]);

    const whitespaceBranch = validateGitCall({
      name: "git_commit",
      args: {
        message: "fix: git worktree boundary",
        branch: "  foreman/task-001  ",
      },
    });
    assert.equal(whitespaceBranch.valid, true);
    assert.equal(whitespaceBranch.branch, "foreman/task-001");

    const nullByteBranch = validateGitCall({
      name: "git_commit",
      args: {
        message: "fix: git worktree boundary",
        branch: "foreman/task\0",
      },
    });
    assert.equal(nullByteBranch.valid, false);
    assert.ok(nullByteBranch.errors.some(error => error.includes("null byte")));

    const emptyMessage = validateGitCall({
      name: "git_commit",
      args: { message: "", branch: "foreman/task-001" },
    });
    assert.equal(emptyMessage.valid, false);
    assert.ok(emptyMessage.errors.some(error => error.includes("empty")));
  });

  it("defines boundary category with git branch input edge-case probes", () => {
    const boundary = listWorkerGitWorktreeContractProbesByCategory("boundary");
    const ids = boundary.map(p => p.id).sort();

    assert.equal(boundary.length, 7);
    assert.deepEqual(ids, [
      "wgt.empty_branch_boundary",
      "wgt.known_gaps_documented",
      "wgt.long_branch_truncation_boundary",
      "wgt.null_byte_branch_boundary",
      "wgt.probe_runner_exported",
      "wgt.source_block_gate_ref",
      "wgt.whitespace_branch_boundary",
    ]);
    assert.ok(boundary.every(p => p.expected === "PASS"));
  });

  it("executes boundary slice with zero unexpected mismatches on edge probes", () => {
    const contract = getActiveWorkerGitWorktreeContract();
    const slice = runWorkerGitWorktreeBoundarySlice();

    assert.equal(slice.atom, "P05-B05-A04");
    assert.equal(slice.boundaryProbeCount, 7);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.boundaryResults.length, 7);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 7);
    assert.equal(slice.matrixValidation.gapAligned, 0);

    for (const boundaryProbe of listWorkerGitWorktreeContractProbesByCategory(
      "boundary",
      contract,
    )) {
      const result = slice.boundaryResults.find(r => r.id === boundaryProbe.id);
      assert.ok(result, `missing boundary result: ${boundaryProbe.id}`);
      assert.equal(result!.expected, boundaryProbe.expected);
      assert.equal(result!.aligned, true, `${boundaryProbe.id}: ${result!.detail}`);
      assert.equal(result!.criterion, boundaryProbe.criterion);
    }

    const matrixValidation = validateWorkerGitWorktreeBoundaryProbeMatrix(
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
