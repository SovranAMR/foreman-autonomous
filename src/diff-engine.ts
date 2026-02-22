/**
 * FOREMAN — Diff Engine
 *
 * Show changes before applying them. Visual diff preview for
 * file writes, edits, and multi-file operations.
 *
 * Capabilities:
 * - Unified diff generation (old vs new content)
 * - Syntax-aware highlighting
 * - Multi-file change summary
 * - Inline diff (show changes within lines)
 * - Stats: lines added/removed/modified
 * - Side-by-side preview (when terminal is wide enough)
 */

import { readFileSync, existsSync } from "node:fs";
import { extname, relative } from "node:path";

// ─── TYPES ───────────────────────────────────────────────────

export interface DiffResult {
  path: string;
  relativePath: string;
  isNew: boolean;
  isDelete: boolean;
  linesAdded: number;
  linesRemoved: number;
  linesModified: number;
  hunks: DiffHunk[];
  unified: string;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldLine?: number;
  newLine?: number;
}

export interface FileChange {
  path: string;
  oldContent?: string;
  newContent: string;
  type: "create" | "modify" | "delete";
}

export interface DiffSummary {
  totalFiles: number;
  filesCreated: number;
  filesModified: number;
  filesDeleted: number;
  totalAdded: number;
  totalRemoved: number;
  diffs: DiffResult[];
}

// ─── DIFF ENGINE ─────────────────────────────────────────────

/**
 * Generate a unified diff between old and new content.
 */
export function generateDiff(
  path: string,
  oldContent: string,
  newContent: string,
  projectRoot = "",
  contextLines = 3,
): DiffResult {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const isNew = oldContent === "";
  const isDelete = newContent === "";
  const relativePath = projectRoot ? relative(projectRoot, path) || path : path;

  // LCS-based diff
  const hunks = computeHunks(oldLines, newLines, contextLines);

  let linesAdded = 0;
  let linesRemoved = 0;
  let linesModified = 0;

  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add") linesAdded++;
      if (line.type === "remove") linesRemoved++;
    }
  }
  linesModified = Math.min(linesAdded, linesRemoved);

  // Build unified diff string
  const unified = formatUnified(relativePath, hunks, isNew, isDelete);

  return {
    path,
    relativePath,
    isNew,
    isDelete,
    linesAdded,
    linesRemoved,
    linesModified,
    hunks,
    unified,
  };
}

/**
 * Generate diff for a file change (reads old content from disk).
 */
export function diffFileChange(change: FileChange, projectRoot = ""): DiffResult {
  let oldContent = "";

  if (change.type === "modify" || change.type === "delete") {
    if (change.oldContent !== undefined) {
      oldContent = change.oldContent;
    } else if (existsSync(change.path)) {
      try {
        oldContent = readFileSync(change.path, "utf-8");
      } catch { /* new file */ }
    }
  }

  const newContent = change.type === "delete" ? "" : change.newContent;
  return generateDiff(change.path, oldContent, newContent, projectRoot);
}

/**
 * Generate a diff summary for multiple file changes.
 */
export function diffSummary(changes: FileChange[], projectRoot = ""): DiffSummary {
  const diffs = changes.map(c => diffFileChange(c, projectRoot));

  return {
    totalFiles: diffs.length,
    filesCreated: diffs.filter(d => d.isNew).length,
    filesModified: diffs.filter(d => !d.isNew && !d.isDelete).length,
    filesDeleted: diffs.filter(d => d.isDelete).length,
    totalAdded: diffs.reduce((sum, d) => sum + d.linesAdded, 0),
    totalRemoved: diffs.reduce((sum, d) => sum + d.linesRemoved, 0),
    diffs,
  };
}

/**
 * Format a diff summary as a human-readable string.
 */
export function formatDiffSummary(summary: DiffSummary): string {
  const lines: string[] = [];
  const G = "\x1b[32m";
  const R = "\x1b[31m";
  const Y = "\x1b[33m";
  const D = "\x1b[90m";
  const B = "\x1b[1m";
  const X = "\x1b[0m";

  lines.push(`${B}${summary.totalFiles} file(s) changed${X}`);

  if (summary.filesCreated > 0) lines.push(`  ${G}+ ${summary.filesCreated} created${X}`);
  if (summary.filesModified > 0) lines.push(`  ${Y}~ ${summary.filesModified} modified${X}`);
  if (summary.filesDeleted > 0) lines.push(`  ${R}- ${summary.filesDeleted} deleted${X}`);

  lines.push(`  ${G}+${summary.totalAdded}${X} ${R}-${summary.totalRemoved}${X} lines`);
  lines.push("");

  for (const diff of summary.diffs) {
    const icon = diff.isNew ? `${G}+${X}` : diff.isDelete ? `${R}-${X}` : `${Y}~${X}`;
    lines.push(`  ${icon} ${diff.relativePath} ${D}(+${diff.linesAdded} -${diff.linesRemoved})${X}`);
  }

  return lines.join("\n");
}

/**
 * Format a colored diff for terminal output.
 */
export function formatColoredDiff(diff: DiffResult): string {
  const G = "\x1b[32m";
  const R = "\x1b[31m";
  const C = "\x1b[36m";
  const D = "\x1b[90m";
  const X = "\x1b[0m";

  const lines: string[] = [];
  lines.push(`${D}--- a/${diff.relativePath}${X}`);
  lines.push(`${D}+++ b/${diff.relativePath}${X}`);

  for (const hunk of diff.hunks) {
    lines.push(`${C}@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${X}`);
    for (const line of hunk.lines) {
      switch (line.type) {
        case "add":
          lines.push(`${G}+${line.content}${X}`);
          break;
        case "remove":
          lines.push(`${R}-${line.content}${X}`);
          break;
        case "context":
          lines.push(`${D} ${line.content}${X}`);
          break;
      }
    }
  }

  return lines.join("\n");
}

// ─── DIFF ALGORITHM ──────────────────────────────────────────

/**
 * Myers diff algorithm simplified — compute edit script.
 * Returns list of operations: equal / insert / delete.
 */
interface EditOp {
  type: "equal" | "insert" | "delete";
  oldIndex: number;
  newIndex: number;
  content: string;
}

function computeEditScript(oldLines: string[], newLines: string[]): EditOp[] {
  const ops: EditOp[] = [];
  const n = oldLines.length;
  const m = newLines.length;

  // Simple LCS-based diff (O(nm) but works well for typical file sizes)
  const lcs = computeLCS(oldLines, newLines);

  let oi = 0;
  let ni = 0;
  let li = 0;

  while (oi < n || ni < m) {
    if (li < lcs.length && oi === lcs[li].oldIndex && ni === lcs[li].newIndex) {
      ops.push({ type: "equal", oldIndex: oi, newIndex: ni, content: oldLines[oi] });
      oi++;
      ni++;
      li++;
    } else if (li < lcs.length && oi < lcs[li].oldIndex && ni < lcs[li].newIndex) {
      // Both sides advanced — emit delete then insert
      ops.push({ type: "delete", oldIndex: oi, newIndex: ni, content: oldLines[oi] });
      oi++;
    } else if (oi < n && (li >= lcs.length || oi < lcs[li].oldIndex)) {
      ops.push({ type: "delete", oldIndex: oi, newIndex: ni, content: oldLines[oi] });
      oi++;
    } else if (ni < m && (li >= lcs.length || ni < lcs[li].newIndex)) {
      ops.push({ type: "insert", oldIndex: oi, newIndex: ni, content: newLines[ni] });
      ni++;
    } else {
      break; // Safety
    }
  }

  return ops;
}

interface LCSEntry {
  oldIndex: number;
  newIndex: number;
}

function computeLCS(a: string[], b: string[]): LCSEntry[] {
  const n = a.length;
  const m = b.length;

  // Optimization: for very large files, use a simpler approach
  if (n * m > 10_000_000) {
    return simpleLCS(a, b);
  }

  // Standard DP LCS
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS
  const result: LCSEntry[] = [];
  let i = n;
  let j = m;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift({ oldIndex: i - 1, newIndex: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

/**
 * Simple line-matching LCS for very large files.
 * Matches identical lines in order — not optimal but O(n+m).
 */
function simpleLCS(a: string[], b: string[]): LCSEntry[] {
  const bMap = new Map<string, number[]>();
  for (let j = 0; j < b.length; j++) {
    const line = b[j];
    if (!bMap.has(line)) bMap.set(line, []);
    bMap.get(line)!.push(j);
  }

  const result: LCSEntry[] = [];
  let lastJ = -1;

  for (let i = 0; i < a.length; i++) {
    const matches = bMap.get(a[i]);
    if (!matches) continue;
    for (const j of matches) {
      if (j > lastJ) {
        result.push({ oldIndex: i, newIndex: j });
        lastJ = j;
        break;
      }
    }
  }

  return result;
}

function computeHunks(oldLines: string[], newLines: string[], contextLines: number): DiffHunk[] {
  const ops = computeEditScript(oldLines, newLines);
  if (ops.length === 0) return [];

  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let lastChangeIndex = -contextLines - 1;

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const isChange = op.type !== "equal";

    if (isChange) {
      // Start new hunk if needed
      if (!currentHunk || i - lastChangeIndex > contextLines * 2) {
        if (currentHunk) hunks.push(currentHunk);
        currentHunk = {
          oldStart: Math.max(1, op.oldIndex - contextLines + 1),
          oldCount: 0,
          newStart: Math.max(1, op.newIndex - contextLines + 1),
          newCount: 0,
          lines: [],
        };

        // Add leading context
        for (let c = Math.max(0, i - contextLines); c < i; c++) {
          if (ops[c].type === "equal") {
            currentHunk.lines.push({
              type: "context",
              content: ops[c].content,
              oldLine: ops[c].oldIndex + 1,
              newLine: ops[c].newIndex + 1,
            });
            currentHunk.oldCount++;
            currentHunk.newCount++;
          }
        }
      }

      lastChangeIndex = i;

      if (op.type === "delete") {
        currentHunk!.lines.push({ type: "remove", content: op.content, oldLine: op.oldIndex + 1 });
        currentHunk!.oldCount++;
      } else {
        currentHunk!.lines.push({ type: "add", content: op.content, newLine: op.newIndex + 1 });
        currentHunk!.newCount++;
      }
    } else if (currentHunk && i - lastChangeIndex <= contextLines) {
      // Trailing context
      currentHunk.lines.push({
        type: "context",
        content: op.content,
        oldLine: op.oldIndex + 1,
        newLine: op.newIndex + 1,
      });
      currentHunk.oldCount++;
      currentHunk.newCount++;
    }
  }

  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

function formatUnified(path: string, hunks: DiffHunk[], isNew: boolean, isDelete: boolean): string {
  const lines: string[] = [];
  lines.push(`--- ${isNew ? "/dev/null" : `a/${path}`}`);
  lines.push(`+++ ${isDelete ? "/dev/null" : `b/${path}`}`);

  for (const hunk of hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
    for (const line of hunk.lines) {
      switch (line.type) {
        case "add": lines.push(`+${line.content}`); break;
        case "remove": lines.push(`-${line.content}`); break;
        case "context": lines.push(` ${line.content}`); break;
      }
    }
  }

  return lines.join("\n");
}
