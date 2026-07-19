import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkerGitWorktreeBaseline,
  runWorkerGitWorktreeProductionSlice,
  validateWorkerGitWorktreeProbeMatrix,
  validateGitCall,
  buildGitWorktreeTelemetry,
  getActiveWorkerGitWorktreeContract,
  listWorkerGitWorktreeProbesByDisposition,
  FORGE_WORKER_GIT_WORKTREE_VERSION,
} from "./forge-p05-worker-git-worktree.js";

function formatMismatchReport(
  mismatches: { id: string; expected: string; actual: string; detail: string }[],
): string {
  return mismatches
    .map(m => `  ${m.id}: expected=${m.expected} actual=${m.actual} (${m.detail})`)
    .join("\n");
}

describe("Forge Worker Git Worktree Production Slice — P05-B05-A03", () => {
  it("validateGitCall rejects empty git_commit message before dispatch", () => {
    const invalid = validateGitCall({ name: "git_commit", args: { message: "" } });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.length > 0);
  });

  it("validateGitCall accepts normalized git_commit args with optional branch", () => {
    const valid = validateGitCall({
      name: "git_commit",
      args: {
        message: "fix: git worktree baseline",
        files: ["src/tools.ts"],
        branch: "  foreman/task-001  ",
      },
    });
    assert.equal(valid.valid, true);
    assert.equal(valid.message, "fix: git worktree baseline");
    assert.deepEqual(valid.files, ["src/tools.ts"]);
    assert.equal(valid.branch, "foreman/task-001");
  });

  it("buildGitWorktreeTelemetry records git provenance for valid calls", () => {
    const telemetry = buildGitWorktreeTelemetry(
      {
        name: "git_commit",
        args: { message: "fix: git worktree baseline", branch: "foreman/task-001" },
      },
      { sequenceIndex: 4 },
    );

    assert.equal(telemetry.toolName, "git_commit");
    assert.equal(telemetry.message, "fix: git worktree baseline");
    assert.equal(telemetry.branch, "foreman/task-001");
    assert.equal(telemetry.sequenceIndex, 4);
    assert.equal(telemetry.validated, true);
    assert.equal(telemetry.harnessVersion, FORGE_WORKER_GIT_WORKTREE_VERSION);
    assert.ok(telemetry.validatedAt.length > 0);
  });

  it("executes contract-wired probes with zero unexpected mismatches after production slice", () => {
    const contract = getActiveWorkerGitWorktreeContract();
    const slice = runWorkerGitWorktreeProductionSlice();

    assert.equal(slice.atom, "P05-B05-A03");
    assert.equal(slice.fixtureValid, true);
    assert.equal(slice.contractAligned, true);
    assert.equal(slice.matrixValid, true);
    assert.equal(slice.summary.total, 27);
    assert.equal(slice.matrixValidation.unexpectedMismatches, 0);
    assert.equal(slice.matrixValidation.passAligned, 23);
    assert.equal(slice.matrixValidation.gapAligned, 4);
    assert.equal(slice.summary.knownGaps.length, 4);

    for (const contractProbe of contract.probes) {
      const result = slice.results.find(r => r.id === contractProbe.id);
      assert.ok(result, `missing probe result: ${contractProbe.id}`);
      assert.equal(result!.criterion, contractProbe.criterion, `${contractProbe.id} criterion`);
    }

    const passMismatches = slice.results.filter(r => r.expected === "PASS" && !r.aligned);
    assert.equal(passMismatches.length, 0, formatMismatchReport(passMismatches));

    const matrixValidation = validateWorkerGitWorktreeProbeMatrix(slice.results, contract);
    assert.equal(
      matrixValidation.valid,
      true,
      matrixValidation.issues.map(i => `${i.kind}:${i.probeId ?? ""}: ${i.detail}`).join("\n"),
    );

    const fixture = loadWorkerGitWorktreeBaseline();
    assert.equal(fixture.probes.filter(p => p.expected === "FAIL").length, 4);
  });

  it("closes first A02 gap probe via TypedGitCall production wiring", () => {
    const slice = runWorkerGitWorktreeProductionSlice();
    const result = slice.results.find(r => r.id === "wgt.typed_git_call_union");
    assert.ok(result, "missing typed_git_call_union probe result");
    assert.equal(result!.expected, "PASS");
    assert.equal(result!.actual, "PASS");
    assert.equal(result!.aligned, true);

    const gaps = listWorkerGitWorktreeProbesByDisposition("gap");
    assert.equal(gaps.length, 4);
    assert.ok(!gaps.some(probe => probe.id === "wgt.typed_git_call_union"));
    assert.deepEqual(
      gaps.map(p => p.id).sort(),
      [
        "wgt.exported_git_validator",
        "wgt.orchestrator_pre_git_validation",
        "wgt.worker_prompt_git_contract",
        "wgt.worktree_transaction_engine",
      ],
    );
  });
});
