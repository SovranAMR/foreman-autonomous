/**
 * FOREMAN — Git Engine Tests
 *
 * Tests for thought-chain aware git orchestration.
 * Uses real git operations in a temporary repo.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { ExecutionEngine } from "./execution-engine.js";
import { GitEngine } from "./git-engine.js";

// ─── SETUP ───────────────────────────────────────────────────

const testDir = mkdtempSync(join(tmpdir(), "foreman-git-test-"));
let exec: ExecutionEngine;
let git: GitEngine;

before(() => {
  // Initialize a real git repo
  execSync("git init", { cwd: testDir });
  execSync('git config user.email "test@foreman.dev"', { cwd: testDir });
  execSync('git config user.name "Foreman Test"', { cwd: testDir });

  // Create initial commit
  writeFileSync(join(testDir, "README.md"), "# Test Project\n");
  execSync("git add -A && git commit -m 'Initial commit'", { cwd: testDir });

  exec = new ExecutionEngine(testDir);
  git = new GitEngine(exec);
});

// ─── THOUGHT-AWARE COMMITS ──────────────────────────────────

describe("thought-aware commits", () => {
  it("commits with chain/thought/layer metadata", () => {
    writeFileSync(join(testDir, "src.ts"), "export const x = 1;\n");

    const result = git.commitThought({
      message: "Add initial type definitions",
      chainId: "chain_001_types",
      thoughtId: "t_042",
      layer: "worker",
      atomIndex: 3,
      atomTotal: 8,
      files: [join(testDir, "src.ts")],
    });

    assert.ok(result.success, `Commit should succeed: ${result.error}`);
    assert.ok(result.hash.length > 0, "Should have a commit hash");
    assert.ok(result.shortHash.length > 0, "Should have a short hash");
    assert.ok(result.message.includes("[worker]"), "Message should include layer");
    assert.ok(result.message.includes("chain_001_types"), "Message should include chain ID");
    assert.ok(result.message.includes("t_042"), "Message should include thought ID");
    assert.ok(result.message.includes("3/8"), "Message should include atom index");
  });

  it("simple commit without metadata", () => {
    writeFileSync(join(testDir, "config.json"), '{"version": 1}\n');

    const result = git.commit("Update config", [join(testDir, "config.json")]);
    assert.ok(result.success);
    assert.ok(result.hash.length > 0);
    assert.ok(!result.message.includes("Chain:"), "Should NOT have chain metadata");
  });

  it("fails gracefully on empty working tree", () => {
    const result = git.commit("Nothing to commit");
    assert.ok(!result.success);
    assert.ok(result.error);
  });
});

// ─── TASK BRANCHING ──────────────────────────────────────────

describe("task branching", () => {
  it("creates task branch with naming convention", () => {
    const result = git.createTaskBranch("feature", "Hero Section");
    assert.ok(result.success, `Should create branch: ${result.error}`);
    assert.equal(result.branch, "foreman/feature/hero-section");

    // Switch back to main
    exec.runShell("git checkout main || git checkout master", );
  });

  it("sanitizes branch names", () => {
    const result = git.createTaskBranch("bug", "Fix #123: Special Chars!!!");
    assert.ok(result.success);
    assert.equal(result.branch, "foreman/bug/fix-123-special-chars");

    exec.runShell("git checkout main || git checkout master");
  });

  it("lists only Foreman branches", () => {
    const branches = git.listTaskBranches();
    assert.ok(branches.length >= 2);
    for (const b of branches) {
      assert.ok(b.startsWith("foreman/"), `Branch should start with foreman/: ${b}`);
    }
  });

  it("refuses to delete non-Foreman branch", () => {
    const result = git.deleteTaskBranch("main");
    assert.ok(!result.success);
    assert.ok(result.error?.includes("Refusing"));
  });

  it("deletes Foreman branch", () => {
    const result = git.deleteTaskBranch("foreman/bug/fix-123-special-chars", true);
    assert.ok(result.success, `Should delete: ${result.error}`);
  });

  it("gets branch info", () => {
    const info = git.getBranches();
    assert.ok(info.current.length > 0);
    assert.ok(info.local.length > 0);
    assert.ok(!info.isDetached);
  });

  it("prevents branch create with dirty working tree", () => {
    writeFileSync(join(testDir, "dirty.txt"), "uncommitted");
    const result = git.createTaskBranch("feature", "dirty-test");
    assert.ok(!result.success);
    assert.ok(result.error?.includes("not clean"));

    // Clean up
    execSync("git checkout -- . && git clean -fd", { cwd: testDir });
  });
});

// ─── DIFF INTELLIGENCE ──────────────────────────────────────

describe("diff intelligence", () => {
  it("classifies new file", () => {
    writeFileSync(join(testDir, "new-feature.ts"), "export const feature = true;\n");
    execSync("git add new-feature.ts", { cwd: testDir });

    const changes = git.classifyChanges(true);
    assert.ok(changes.length > 0);
    const newFile = changes.find(c => c.file === "new-feature.ts");
    assert.ok(newFile, "Should find new-feature.ts");
    assert.equal(newFile.kind, "new_file");

    execSync("git commit -m 'add feature'", { cwd: testDir });
  });

  it("classifies test file", () => {
    writeFileSync(join(testDir, "feature.test.ts"), "test('works', () => {});\n");
    execSync("git add feature.test.ts", { cwd: testDir });

    const changes = git.classifyChanges(true);
    const testFile = changes.find(c => c.file === "feature.test.ts");
    assert.ok(testFile, "Should find test file");
    assert.equal(testFile.kind, "test");

    execSync("git commit -m 'add test'", { cwd: testDir });
  });

  it("classifies config file", () => {
    writeFileSync(join(testDir, "package.json"), '{"name": "test"}\n');
    execSync("git add package.json", { cwd: testDir });

    const changes = git.classifyChanges(true);
    const config = changes.find(c => c.file === "package.json");
    assert.ok(config, "Should find config");
    assert.equal(config.kind, "config");

    execSync("git commit -m 'add config'", { cwd: testDir });
  });

  it("summarizes changes", () => {
    writeFileSync(join(testDir, "summary-test.ts"), "const a = 1;\n");
    execSync("git add summary-test.ts", { cwd: testDir });

    const summary = git.summarizeChanges(true);
    assert.ok(summary.includes("Total:"));
    assert.ok(summary.includes("file"));

    execSync("git commit -m 'summary test'", { cwd: testDir });
  });
});

// ─── STASH GUARD ─────────────────────────────────────────────

describe("stash guard", () => {
  it("stash save on clean repo returns hasChanges=false", () => {
    const result = git.stashSave();
    assert.ok(result.success);
    assert.equal(result.hasChanges, false);
  });

  it("stash save/pop with dirty working tree", () => {
    writeFileSync(join(testDir, "stash-test.txt"), "dirty data\n");
    execSync("git add stash-test.txt", { cwd: testDir });

    const save = git.stashSave("test-stash");
    assert.ok(save.success);
    assert.equal(save.hasChanges, true);

    // Verify working tree is clean after stash
    assert.ok(git.isClean(), "Should be clean after stash");

    const pop = git.stashPop();
    assert.ok(pop.success, `Pop should succeed: ${pop.error}`);

    // Clean up
    execSync("git checkout -- . && git clean -fd", { cwd: testDir });
  });

  it("lists stash entries", () => {
    // Create and stash something (must be tracked)
    writeFileSync(join(testDir, "README.md"), "# Modified for stash test\n");

    const save = git.stashSave("list-test");
    assert.ok(save.success, `Stash should succeed: ${save.error}`);
    assert.ok(save.hasChanges, "Should have changes to stash");

    const list = git.stashList();
    assert.ok(list.length > 0, "Should have stash entries");

    // Clean up
    git.stashPop();
  });
});

// ─── SAFE OPERATIONS ────────────────────────────────────────

describe("safe operations", () => {
  it("safe switch with auto-stash", () => {
    // Create target branch first
    execSync("git branch foreman/test/safe-switch 2>/dev/null || true", { cwd: testDir });

    // Make dirty change
    writeFileSync(join(testDir, "safe-switch.txt"), "dirty\n");
    execSync("git add safe-switch.txt", { cwd: testDir });

    const result = git.safeSwitchBranch("foreman/test/safe-switch");
    assert.ok(result.success, `Safe switch should succeed: ${result.error}`);
    assert.equal(result.stashed, true);

    // Switch back
    git.switchBranch("main");
    git.stashPop();
    execSync("git checkout -- . && git clean -fd", { cwd: testDir });
    git.deleteTaskBranch("foreman/test/safe-switch", true);
  });

  it("currentBranch returns correct branch", () => {
    const branch = git.currentBranch();
    assert.ok(branch === "main" || branch === "master");
  });

  it("isClean reflects working tree state", () => {
    // Aggressive cleanup: unstage + remove untracked + restore tracked
    execSync("git reset HEAD -- . 2>/dev/null || true", { cwd: testDir });
    execSync("git checkout -- . 2>/dev/null || true", { cwd: testDir });
    execSync("git clean -fdx 2>/dev/null || true", { cwd: testDir });
    assert.ok(git.isClean(), `Expected clean but got: ${exec.runShell("git status --porcelain=v1").stdout}`);

    writeFileSync(join(testDir, "dirty-check.txt"), "data\n");
    assert.ok(!git.isClean());

    execSync("rm -f dirty-check.txt", { cwd: testDir });
    assert.ok(git.isClean());
  });
});

// ─── COMMIT HISTORY ANALYSIS ─────────────────────────────────

describe("commit history analysis", () => {
  it("parses commit history", () => {
    const history = git.getHistory(5);
    assert.ok(history.length > 0, "Should have commits");
    assert.ok(history[0].hash.length > 0);
    assert.ok(history[0].shortHash.length > 0);
    assert.ok(history[0].author.length > 0);
    assert.ok(history[0].date.length > 0);
  });

  it("extracts Foreman metadata from commits", () => {
    // Create a thought-aware commit
    writeFileSync(join(testDir, "meta-test.ts"), "export const y = 2;\n");
    git.commitThought({
      message: "Add meta test",
      chainId: "chain_test_meta",
      thoughtId: "t_099",
      layer: "strategist",
      atomIndex: 1,
      atomTotal: 3,
      files: [join(testDir, "meta-test.ts")],
    });

    const history = git.getHistory(3);
    const foremanCommit = history.find(e => e.meta?.chainId === "chain_test_meta");
    assert.ok(foremanCommit, "Should find Foreman commit");
    assert.equal(foremanCommit.meta?.thoughtId, "t_099");
    assert.equal(foremanCommit.meta?.layer, "strategist");
    assert.equal(foremanCommit.meta?.atomIndex, 1);
  });

  it("filters Foreman-only history", () => {
    const foremanOnly = git.getForemanHistory(10);
    for (const entry of foremanOnly) {
      assert.ok(
        entry.message.startsWith("⚙️") || entry.meta !== undefined,
        `Should be Foreman commit: ${entry.message}`,
      );
    }
  });

  it("gets chain-specific history", () => {
    const chainHistory = git.getChainHistory("chain_test_meta");
    assert.ok(chainHistory.length > 0);
    for (const entry of chainHistory) {
      assert.equal(entry.meta?.chainId, "chain_test_meta");
    }
  });
});

// ─── ATOMIC ROLLBACK ─────────────────────────────────────────

describe("atomic rollback", () => {
  it("reverts a thought commit", () => {
    // Create a commit to revert
    writeFileSync(join(testDir, "rollback-target.ts"), "const bad = true;\n");
    const commit = git.commitThought({
      message: "Bad change to revert",
      chainId: "chain_rollback",
      thoughtId: "t_bad",
      layer: "worker",
      files: [join(testDir, "rollback-target.ts")],
    });

    assert.ok(commit.success);

    // Verify file exists
    const exists = readFileSync(join(testDir, "rollback-target.ts"), "utf-8");
    assert.ok(exists.includes("bad"));

    // Rollback
    const rollback = git.rollbackThought(commit.hash, "t_bad");
    assert.ok(rollback.success, `Rollback should succeed: ${rollback.error}`);
    assert.ok(rollback.revertHash);

    // Verify file is gone or reverted
    try {
      readFileSync(join(testDir, "rollback-target.ts"), "utf-8");
      assert.fail("File should be deleted after rollback");
    } catch {
      // Expected — file was added in the reverted commit
    }
  });

  it("fails on invalid commit hash", () => {
    const result = git.rollbackThought("deadbeef", "t_fake");
    assert.ok(!result.success);
    assert.ok(result.error?.includes("Invalid"));
  });
});

// ─── CLEANUP ─────────────────────────────────────────────────

after(() => {
  try { rmSync(testDir, { recursive: true, force: true }); } catch {}
});
