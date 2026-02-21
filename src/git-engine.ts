/**
 * FOREMAN — Git Engine
 *
 * Thought-chain aware git orchestration.
 *
 * OpenClaw has basic git operations (status, diff, commit, branch).
 * Foreman EXCEEDS this with:
 *
 * 1. THOUGHT-AWARE COMMITS: Every atom gets a structured commit with
 *    chain/layer/step metadata embedded in the message.
 * 2. TASK BRANCHING: Automatic branch creation per task, with
 *    naming convention and cleanup.
 * 3. DIFF INTELLIGENCE: Semantic diff analysis — not just "what changed"
 *    but "what kind of change" (new file, refactor, fix, test).
 * 4. STASH GUARD: Automatic stash before risky operations, restore after.
 * 5. CONFLICT DETECTION: Pre-merge conflict check before branch operations.
 * 6. COMMIT HISTORY ANALYSIS: Extract patterns from commit history
 *    for the orchestrator to learn from.
 * 7. ATOMIC ROLLBACK: Revert a single thought's commit without
 *    affecting the rest of the chain.
 *
 * Architecture: GitEngine wraps ExecutionEngine's git primitives
 * and adds thought-chain awareness on top.
 */

import type { ExecutionEngine } from "./execution-engine.js";
import type { Layer } from "./types.js";

// ─── TYPES ───────────────────────────────────────────────────

/** Structured commit result with parsed metadata */
export interface CommitResult {
  success: boolean;
  hash: string;
  shortHash: string;
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  error?: string;
}

/** Diff classification — what kind of change */
export type DiffKind =
  | "new_file"       // file added
  | "deleted_file"   // file removed
  | "modified"       // existing file changed
  | "renamed"        // file moved/renamed
  | "test"           // test file changed
  | "config";        // config/meta file changed

/** Classified file change */
export interface ClassifiedChange {
  file: string;
  kind: DiffKind;
  insertions: number;
  deletions: number;
}

/** Branch info */
export interface BranchInfo {
  current: string;
  local: string[];
  isDetached: boolean;
}

/** Stash entry */
export interface StashEntry {
  index: number;
  message: string;
  ref: string;
}

/** Conflict analysis result */
export interface ConflictCheck {
  hasConflicts: boolean;
  conflictFiles: string[];
  cleanMerge: boolean;
}

/** Commit log entry with parsed metadata */
export interface LogEntry {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
  /** Parsed Foreman metadata from commit message (if present) */
  meta?: {
    chainId?: string;
    thoughtId?: string;
    layer?: Layer;
    atomIndex?: number;
  };
}

/** Rollback result */
export interface RollbackResult {
  success: boolean;
  revertHash?: string;
  error?: string;
}

// ─── CONSTANTS ───────────────────────────────────────────────

/** Branch prefix for Foreman-managed task branches */
const BRANCH_PREFIX = "foreman/";

/** Commit message prefix for structured commits */
const COMMIT_PREFIX = "⚙️";

/** Test file patterns */
const TEST_PATTERNS = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /\/__tests__\//,
  /\/test\//,
];

/** Config file patterns */
const CONFIG_PATTERNS = [
  /^package\.json$/,
  /^tsconfig.*\.json$/,
  /^\.eslint/,
  /^\.prettier/,
  /^vite\.config/,
  /^next\.config/,
  /^\.env/,
  /^\.gitignore$/,
  /^Dockerfile/,
  /^docker-compose/,
];

// ─── GIT ENGINE ──────────────────────────────────────────────

export class GitEngine {
  private exec: ExecutionEngine;

  constructor(executionEngine: ExecutionEngine) {
    this.exec = executionEngine;
  }

  /** Expose ExecutionEngine for cross-system wiring (registry, approval) */
  get executor(): ExecutionEngine {
    return this.exec;
  }

  // ─── THOUGHT-AWARE COMMITS ─────────────────────────────────

  /**
   * Commit with thought-chain metadata embedded in the message.
   *
   * Format:
   *   ⚙️ [layer] description
   *
   *   Chain: chain_001_types
   *   Thought: t_042
   *   Atom: 3/8
   *   Layer: worker
   *
   * This makes `git log` a readable trace of the entire thought process.
   */
  commitThought(opts: {
    message: string;
    chainId: string;
    thoughtId: string;
    layer: Layer;
    atomIndex?: number;
    atomTotal?: number;
    files?: string[];
  }): CommitResult {
    const { message, chainId, thoughtId, layer, atomIndex, atomTotal, files } = opts;

    // Build structured commit message
    // Git requires a blank line between subject and body
    const header = `${COMMIT_PREFIX} [${layer}] ${message}`;
    const metaLines = [
      "",  // blank line separator (git subject/body boundary)
      `Chain: ${chainId}`,
      `Thought: ${thoughtId}`,
    ];
    if (atomIndex !== undefined) {
      metaLines.push(`Atom: ${atomIndex}${atomTotal ? `/${atomTotal}` : ""}`);
    }
    metaLines.push(`Layer: ${layer}`);

    const fullMessage = header + "\n" + metaLines.join("\n");

    // Stage and commit
    const commitResult = this.exec.gitCommit(fullMessage, files);

    if (!commitResult.success) {
      return {
        success: false,
        hash: "",
        shortHash: "",
        message: fullMessage,
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
        error: commitResult.stderr || "Commit failed",
      };
    }

    // Parse commit hash from output
    const hashMatch = commitResult.stdout.match(/\[[\w/.-]+\s+([a-f0-9]+)\]/);
    const hash = hashMatch?.[1] ?? "";

    // Get stats
    const stats = this.getLastCommitStats();

    return {
      success: true,
      hash,
      shortHash: hash.slice(0, 7),
      message: fullMessage,
      filesChanged: stats.filesChanged,
      insertions: stats.insertions,
      deletions: stats.deletions,
    };
  }

  /**
   * Simple commit without thought metadata.
   * For non-thought commits (config, merge, etc.)
   */
  commit(message: string, files?: string[]): CommitResult {
    const result = this.exec.gitCommit(message, files);

    if (!result.success) {
      return {
        success: false,
        hash: "",
        shortHash: "",
        message,
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
        error: result.stderr || "Commit failed",
      };
    }

    const hashMatch = result.stdout.match(/\[[\w/.-]+\s+([a-f0-9]+)\]/);
    const hash = hashMatch?.[1] ?? "";
    const stats = this.getLastCommitStats();

    return {
      success: true,
      hash,
      shortHash: hash.slice(0, 7),
      message,
      filesChanged: stats.filesChanged,
      insertions: stats.insertions,
      deletions: stats.deletions,
    };
  }

  // ─── TASK BRANCHING ────────────────────────────────────────

  /**
   * Create a task branch with Foreman naming convention.
   *
   * Format: foreman/<task-type>/<slug>
   * Example: foreman/feature/hero-section
   */
  createTaskBranch(taskType: string, slug: string): { success: boolean; branch: string; error?: string } {
    const sanitized = slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const branch = `${BRANCH_PREFIX}${taskType}/${sanitized}`;

    // Check for uncommitted changes first
    const status = this.exec.gitStatus();
    if (!status.clean) {
      return {
        success: false,
        branch,
        error: "Working directory not clean. Stash or commit first.",
      };
    }

    const result = this.exec.gitBranch("create", branch);
    return {
      success: result.success,
      branch,
      error: result.success ? undefined : result.stderr,
    };
  }

  /**
   * Switch to a branch (with dirty check).
   */
  switchBranch(branch: string): { success: boolean; error?: string } {
    const status = this.exec.gitStatus();
    if (!status.clean) {
      return {
        success: false,
        error: "Working directory not clean. Stash or commit first.",
      };
    }

    const result = this.exec.gitBranch("checkout", branch);
    return {
      success: result.success,
      error: result.success ? undefined : result.stderr,
    };
  }

  /**
   * Get branch information.
   */
  getBranches(): BranchInfo {
    const result = this.exec.runShell("git branch --no-color");
    const lines = result.stdout.split("\n").filter((l: string) => l.trim());

    let current = "";
    const local: string[] = [];
    let isDetached = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("* ")) {
        const name = trimmed.slice(2).trim();
        if (name.startsWith("(HEAD detached")) {
          isDetached = true;
          current = name;
        } else {
          current = name;
        }
      } else {
        local.push(trimmed);
      }
    }

    if (current && !isDetached) {
      local.unshift(current);
    }

    return { current, local, isDetached };
  }

  /**
   * Delete a Foreman task branch (only foreman/* branches).
   * Safety: refuses to delete non-Foreman branches.
   */
  deleteTaskBranch(branch: string, force = false): { success: boolean; error?: string } {
    if (!branch.startsWith(BRANCH_PREFIX)) {
      return {
        success: false,
        error: `Refusing to delete non-Foreman branch: ${branch}`,
      };
    }

    const flag = force ? "-D" : "-d";
    const result = this.exec.runShell(`git branch ${flag} "${branch}"`);
    return {
      success: result.success,
      error: result.success ? undefined : result.stderr,
    };
  }

  /**
   * List all Foreman-managed branches.
   */
  listTaskBranches(): string[] {
    const result = this.exec.runShell("git branch --no-color");
    return result.stdout
      .split("\n")
      .map((l: string) => l.replace(/^\*?\s*/, "").trim())
      .filter((l: string) => l.startsWith(BRANCH_PREFIX));
  }

  // ─── DIFF INTELLIGENCE ────────────────────────────────────

  /**
   * Classify changes — not just "what files changed" but "what kind of change."
   *
   * OpenClaw's gitDiff returns raw numstat.
   * Foreman classifies each change as new_file/deleted/modified/renamed/test/config.
   */
  classifyChanges(staged = false): ClassifiedChange[] {
    // Get file status
    const statusFlag = staged ? "--cached" : "";
    const nameStatus = this.exec.runShell(`git diff ${statusFlag} --name-status`);
    const numstat = this.exec.runShell(`git diff ${statusFlag} --numstat`);

    if (!nameStatus.success || !numstat.success) return [];

    const statusMap = new Map<string, string>();
    for (const line of nameStatus.stdout.split("\n")) {
      const parts = line.trim().split(/\t+/);
      if (parts.length >= 2) {
        const status = parts[0];
        const file = parts[parts.length - 1]; // last part (handles renames)
        statusMap.set(file, status);
      }
    }

    const changes: ClassifiedChange[] = [];
    for (const line of numstat.stdout.split("\n")) {
      const match = line.trim().match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (!match) continue;

      const insertions = match[1] === "-" ? 0 : parseInt(match[1], 10);
      const deletions = match[2] === "-" ? 0 : parseInt(match[2], 10);
      const file = match[3];

      const gitStatus = statusMap.get(file) ?? "M";
      const kind = this.classifyFile(file, gitStatus);

      changes.push({ file, kind, insertions, deletions });
    }

    return changes;
  }

  /**
   * Summarize changes for commit message or thought context.
   */
  summarizeChanges(staged = false): string {
    const changes = this.classifyChanges(staged);
    if (changes.length === 0) return "No changes";

    const groups = new Map<DiffKind, ClassifiedChange[]>();
    for (const change of changes) {
      const existing = groups.get(change.kind) ?? [];
      existing.push(change);
      groups.set(change.kind, existing);
    }

    const parts: string[] = [];
    const labels: Record<DiffKind, string> = {
      new_file: "New",
      deleted_file: "Deleted",
      modified: "Modified",
      renamed: "Renamed",
      test: "Tests",
      config: "Config",
    };

    for (const [kind, items] of groups) {
      const files = items.map(i => i.file).join(", ");
      const total = items.reduce((sum, i) => sum + i.insertions + i.deletions, 0);
      parts.push(`${labels[kind]} (${items.length}): ${files} [±${total}]`);
    }

    const totalInsert = changes.reduce((s, c) => s + c.insertions, 0);
    const totalDelete = changes.reduce((s, c) => s + c.deletions, 0);
    parts.push(`Total: ${changes.length} files, +${totalInsert}/-${totalDelete}`);

    return parts.join("\n");
  }

  // ─── STASH GUARD ───────────────────────────────────────────

  /**
   * Auto-stash before risky operations.
   * Returns a stash ref that can be used to restore.
   *
   * OpenClaw has no stash support.
   * Foreman protects work-in-progress during branch switches and merges.
   */
  stashSave(message?: string): { success: boolean; hasChanges: boolean; error?: string } {
    const status = this.exec.gitStatus();
    if (status.clean) {
      return { success: true, hasChanges: false };
    }

    const msg = message ?? `foreman-autostash-${Date.now()}`;
    const result = this.exec.runShell(`git stash push -m "${msg.replace(/"/g, '\\"')}"`);
    return {
      success: result.success,
      hasChanges: true,
      error: result.success ? undefined : result.stderr,
    };
  }

  /**
   * Restore the most recent stash (or a specific one).
   */
  stashPop(index?: number): { success: boolean; error?: string } {
    const ref = index !== undefined ? `stash@{${index}}` : "";
    const result = this.exec.runShell(`git stash pop ${ref}`.trim());
    return {
      success: result.success,
      error: result.success ? undefined : result.stderr,
    };
  }

  /**
   * List stash entries.
   */
  stashList(): StashEntry[] {
    const result = this.exec.runShell("git stash list");
    if (!result.success) return [];

    return result.stdout
      .split("\n")
      .filter((l: string) => l.trim())
      .map((line: string, idx: number) => {
        // Format: stash@{0}: WIP on main: abc1234 message
        // or:     stash@{0}: On main: message
        const refMatch = line.match(/^(stash@\{\d+\})/);
        const ref = refMatch?.[1] ?? `stash@{${idx}}`;
        const indexMatch = ref.match(/\{(\d+)\}/);
        const message = line.replace(/^stash@\{\d+\}:\s*/, "");
        return {
          index: indexMatch ? parseInt(indexMatch[1], 10) : idx,
          message,
          ref,
        };
      });
  }

  // ─── CONFLICT DETECTION ────────────────────────────────────

  /**
   * Check if merging a branch would cause conflicts WITHOUT actually merging.
   *
   * Uses git merge-tree (dry run) to detect conflicts before they happen.
   * This is something OpenClaw doesn't have at all.
   */
  checkConflicts(targetBranch: string): ConflictCheck {
    // Get current branch
    const currentResult = this.exec.runShell("git branch --show-current");
    const currentBranch = currentResult.stdout.trim();

    if (!currentBranch) {
      return { hasConflicts: false, conflictFiles: [], cleanMerge: false };
    }

    // Use merge-tree to simulate merge
    const mergeBase = this.exec.runShell(`git merge-base "${currentBranch}" "${targetBranch}"`);
    if (!mergeBase.success) {
      return { hasConflicts: false, conflictFiles: [], cleanMerge: false };
    }

    const base = mergeBase.stdout.trim();
    const mergeTree = this.exec.runShell(
      `git merge-tree "${base}" "${currentBranch}" "${targetBranch}"`,
    );

    // Parse merge-tree output for conflicts
    const conflictFiles: string[] = [];
    const lines = mergeTree.stdout.split("\n");
    let inConflict = false;

    for (const line of lines) {
      if (line.includes("changed in both")) {
        inConflict = true;
      }
      if (inConflict && line.trim().startsWith("base")) {
        // Skip base marker
      }
      if (inConflict && /^\+\+\+ /.test(line)) {
        const file = line.replace(/^\+\+\+ [ab]\//, "").trim();
        if (file && !conflictFiles.includes(file)) {
          conflictFiles.push(file);
        }
      }
      if (line === "") inConflict = false;
    }

    // Alternative: check for conflict markers
    if (conflictFiles.length === 0 && mergeTree.stdout.includes("<<<<<<<")) {
      // Extract files from conflict markers
      for (const line of lines) {
        const match = line.match(/^diff --git a\/(.+) b\//);
        if (match) {
          conflictFiles.push(match[1]);
        }
      }
    }

    return {
      hasConflicts: conflictFiles.length > 0,
      conflictFiles,
      cleanMerge: mergeTree.success && conflictFiles.length === 0,
    };
  }

  // ─── COMMIT HISTORY ANALYSIS ───────────────────────────────

  /**
   * Parse commit log with Foreman metadata extraction.
   *
   * Reads structured commit messages and extracts chain/thought/layer info,
   * enabling the orchestrator to trace thought chains through git history.
   */
  getHistory(count = 20): LogEntry[] {
    // Get headers (one line per commit) — tab-separated
    const headerResult = this.exec.runShell(
      `git log --format="%H\t%h\t%an\t%aI\t%s" -n ${count}`,
    );
    if (!headerResult.success) return [];

    const entries: LogEntry[] = [];
    const lines = headerResult.stdout.split("\n").filter((l: string) => l.trim());

    for (const line of lines) {
      const fields = line.split("\t");
      if (fields.length < 5) continue;

      const hash = fields[0];
      const shortHash = fields[1];
      const author = fields[2];
      const date = fields[3];
      const message = fields.slice(4).join("\t");

      // Get body for this specific commit to extract metadata
      const bodyResult = this.exec.runShell(`git log --format="%b" -n 1 ${hash}`);
      const body = bodyResult.success ? bodyResult.stdout.trim() : "";
      const meta = this.parseCommitMeta(body);

      entries.push({ hash, shortHash, author, date, message, meta });
    }

    return entries;
  }

  /**
   * Get Foreman-only commits (filter by prefix).
   */
  getForemanHistory(count = 20): LogEntry[] {
    return this.getHistory(count * 2)
      .filter(e => e.message.startsWith(COMMIT_PREFIX) || e.meta !== undefined)
      .slice(0, count);
  }

  /**
   * Get commits for a specific chain.
   */
  getChainHistory(chainId: string): LogEntry[] {
    return this.getHistory(100)
      .filter(e => e.meta?.chainId === chainId);
  }

  // ─── ATOMIC ROLLBACK ──────────────────────────────────────

  /**
   * Revert a single thought's commit without affecting the chain.
   *
   * Uses `git revert --no-commit` to stage the revert,
   * then commits with a structured rollback message.
   */
  rollbackThought(commitHash: string, thoughtId: string): RollbackResult {
    // Verify the commit exists
    const verify = this.exec.runShell(`git cat-file -t "${commitHash}"`);
    if (!verify.success || verify.stdout.trim() !== "commit") {
      return { success: false, error: `Invalid commit: ${commitHash}` };
    }

    // Attempt revert
    const revert = this.exec.runShell(
      `git revert --no-commit "${commitHash}"`,
    );

    if (!revert.success) {
      // Abort the failed revert
      this.exec.runShell("git revert --abort");
      return {
        success: false,
        error: `Revert failed (likely conflicts): ${revert.stderr}`,
      };
    }

    // Commit the revert with metadata
    const revertCommit = this.exec.gitCommit(
      `${COMMIT_PREFIX} [rollback] Revert thought ${thoughtId}\n\nReverts: ${commitHash}`,
    );

    if (!revertCommit.success) {
      return { success: false, error: revertCommit.stderr };
    }

    const hashMatch = revertCommit.stdout.match(/\[[\w/.-]+\s+([a-f0-9]+)\]/);
    return {
      success: true,
      revertHash: hashMatch?.[1],
    };
  }

  // ─── SAFE OPERATIONS ──────────────────────────────────────

  /**
   * Stash-guarded branch switch.
   * Automatically stashes, switches, and optionally restores.
   */
  safeSwitchBranch(branch: string): {
    success: boolean;
    stashed: boolean;
    error?: string;
  } {
    const stash = this.stashSave(`pre-switch-${branch}`);
    if (!stash.success) {
      return { success: false, stashed: false, error: stash.error };
    }

    const switchResult = this.switchBranch(branch);
    if (!switchResult.success) {
      // Restore stash if switch failed
      if (stash.hasChanges) {
        this.stashPop();
      }
      return { success: false, stashed: false, error: switchResult.error };
    }

    return { success: true, stashed: stash.hasChanges };
  }

  /**
   * Check if the repo is in a clean state for operations.
   */
  isClean(): boolean {
    return this.exec.gitStatus().clean;
  }

  /**
   * Get current branch name.
   */
  currentBranch(): string {
    const result = this.exec.runShell("git branch --show-current");
    return result.stdout.trim();
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────

  private getLastCommitStats(): { filesChanged: number; insertions: number; deletions: number } {
    const stat = this.exec.runShell("git diff --stat HEAD~1..HEAD --numstat 2>/dev/null");
    if (!stat.success) return { filesChanged: 0, insertions: 0, deletions: 0 };

    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;

    for (const line of stat.stdout.split("\n")) {
      const match = line.trim().match(/^(\d+)\t(\d+)\t/);
      if (match) {
        insertions += parseInt(match[1], 10);
        deletions += parseInt(match[2], 10);
        filesChanged++;
      }
    }

    return { filesChanged, insertions, deletions };
  }

  private classifyFile(file: string, gitStatus: string): DiffKind {
    // Pattern-based classification takes priority for test/config
    // Even a NEW test file is a "test" change, not just "new_file"
    if (TEST_PATTERNS.some(p => p.test(file))) return "test";
    if (CONFIG_PATTERNS.some(p => p.test(file))) return "config";

    // Git status for structural changes
    if (gitStatus.startsWith("A")) return "new_file";
    if (gitStatus.startsWith("D")) return "deleted_file";
    if (gitStatus.startsWith("R")) return "renamed";

    return "modified";
  }

  private parseCommitMeta(body: string): LogEntry["meta"] | undefined {
    if (!body.trim()) return undefined;

    const chainMatch = body.match(/Chain:\s*(.+)/);
    const thoughtMatch = body.match(/Thought:\s*(.+)/);
    const layerMatch = body.match(/Layer:\s*(.+)/);
    const atomMatch = body.match(/Atom:\s*(\d+)/);

    if (!chainMatch && !thoughtMatch && !layerMatch) return undefined;

    return {
      chainId: chainMatch?.[1]?.trim(),
      thoughtId: thoughtMatch?.[1]?.trim(),
      layer: layerMatch?.[1]?.trim() as Layer | undefined,
      atomIndex: atomMatch ? parseInt(atomMatch[1], 10) : undefined,
    };
  }
}
