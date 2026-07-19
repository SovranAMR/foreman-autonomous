import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkerGitWorktreeBaseline,
  runWorkerGitWorktreeProbes,
  validateWorkerGitWorktreeBaseline,
  summarizeWorkerGitWorktreeMatrix,
  listWorkerGitWorktreeProbesByExpected,
  listWorkerGitWorktreeKnownGaps,
  assessGitBranchInputBoundary,
  recoverGitCommitRequest,
  probeDangerousGitOperationBlocked,
  WORKER_GIT_WORKTREE_CATEGORIES,
  WORKER_GIT_WORKTREE_BRANCH_MAX_LENGTH,
  FORGE_WORKER_GIT_WORKTREE_VERSION,
} from "./forge-p05-worker-git-worktree.js";
import { getForgeP05B04ToB05Handoff } from "./forge-p05-worker-shell-process.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Worker Git Worktree — P05-B05-A01", () => {
  it("loads versioned git worktree baseline aligned with P05-B04 block gate handoff", () => {
    const fixture = loadWorkerGitWorktreeBaseline();
    const validation = validateWorkerGitWorktreeBaseline(fixture);
    const handoff = getForgeP05B04ToB05Handoff();

    assert.equal(fixture.version, "1.0.0");
    assert.equal(fixture.atom, "P05-B05-A01");
    assert.equal(fixture.contractAtom, "P05-B05-A02");
    assert.equal(fixture.sourceBlockGate.atom, "P05-B04-A10");
    assert.equal(fixture.sourceBlockGate.sealedAtomCount, 10);
    assert.equal(fixture.sourceBlockGate.workerShellProcessProbeCount, 27);
    assert.equal(validation.valid, true, validation.issues.map(i => i.detail).join("\n"));
    assert.equal(fixture.probes.length, 27);
    assert.equal(handoff.targetBlock.entryAtom, "P05-B05-A01");
  });

  it("measures git worktree probes with four remaining FAIL gaps after A03 slice", () => {
    const results = runWorkerGitWorktreeProbes();
    const summary = summarizeWorkerGitWorktreeMatrix(results);

    assert.equal(summary.total, results.length);
    assert.equal(summary.total, 27);
    assert.ok(summary.knownGaps.length >= 1, "A01 requires at least one documented failing probe");

    const documentedFail = listWorkerGitWorktreeProbesByExpected(
      "FAIL",
      loadWorkerGitWorktreeBaseline(),
    );
    assert.equal(documentedFail.length, 4);
    assert.ok(!documentedFail.some(p => p.id === "wgt.typed_git_call_union"));
    assert.ok(documentedFail.some(p => p.id === "wgt.worktree_transaction_engine"));
    assert.ok(documentedFail.some(p => p.id === "wgt.worker_prompt_git_contract"));

    for (const gap of summary.knownGaps) {
      assert.equal(gap.expected, "FAIL");
      assert.equal(gap.actual, "FAIL");
      assert.equal(gap.aligned, true);
    }

    for (const cat of WORKER_GIT_WORKTREE_CATEGORIES) {
      assert.ok(summary.byCategory[cat], `missing category summary: ${cat}`);
      assert.ok(summary.byCategory[cat].total > 0, `${cat} has no probes`);
    }

    const passMismatches = results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(
      passMismatches.length,
      0,
      formatMismatchReport(passMismatches),
    );
  });

  it("documents four remaining git worktree gaps as measurable baseline debt", () => {
    const gaps = listWorkerGitWorktreeKnownGaps(runWorkerGitWorktreeProbes());
    assert.equal(gaps.length, 4);
    assert.deepEqual(
      gaps.map(g => g.id).sort(),
      [
        "wgt.exported_git_validator",
        "wgt.orchestrator_pre_git_validation",
        "wgt.worker_prompt_git_contract",
        "wgt.worktree_transaction_engine",
      ],
    );
  });

  it("assessGitBranchInputBoundary rejects empty and null-byte branch names", () => {
    const empty = assessGitBranchInputBoundary("");
    assert.equal(empty.acceptable, false);
    assert.equal(empty.disposition, "empty");

    const whitespace = assessGitBranchInputBoundary("   \t\n  ");
    assert.equal(whitespace.acceptable, false);
    assert.equal(whitespace.disposition, "whitespace_only");

    const nullByte = assessGitBranchInputBoundary("foreman/task\0");
    assert.equal(nullByte.acceptable, false);
    assert.equal(nullByte.disposition, "contains_null_byte");
  });

  it("assessGitBranchInputBoundary truncates oversized branch names", () => {
    const longBranch = "feature/" + "x".repeat(WORKER_GIT_WORKTREE_BRANCH_MAX_LENGTH + 50);
    const truncated = assessGitBranchInputBoundary(longBranch);
    assert.equal(truncated.acceptable, true);
    assert.equal(truncated.truncated, true);
    assert.equal(truncated.normalizedBranch.length, WORKER_GIT_WORKTREE_BRANCH_MAX_LENGTH);
    assert.equal(truncated.disposition, "exceeds_max_length");
  });

  it("recoverGitCommitRequest coerces JSON string args into dispatch-ready record", () => {
    const recovery = recoverGitCommitRequest(
      JSON.stringify({ message: "fix: git baseline", files: ["src/tools.ts"] }),
    );

    assert.equal(recovery.recovered, true);
    assert.equal(recovery.message, "fix: git baseline");
    assert.deepEqual(recovery.files, ["src/tools.ts"]);
  });

  it("probeDangerousGitOperationBlocked confirms execution engine dangerous pattern guard", () => {
    assert.equal(probeDangerousGitOperationBlocked(), true);
  });

  it("exports harness version for git worktree baseline", () => {
    assert.equal(FORGE_WORKER_GIT_WORKTREE_VERSION, "1.0.0-a04");
  });
});
