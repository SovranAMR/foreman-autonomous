/**
 * FOREMAN — Batch File Engine
 *
 * Atomic multi-file writes with rollback capability.
 *
 * OpenClaw: single file writes only. Agent must call write_file N times
 * for N files. If the 3rd write fails, the first 2 are already on disk
 * with no rollback.
 *
 * Foreman's batch engine:
 *
 * 1. ATOMIC MULTI-FILE: Write multiple files in one operation.
 *    Either all succeed or all roll back.
 *    OpenClaw: no atomicity across files.
 *
 * 2. BACKUP-BEFORE-WRITE: Creates in-memory backups of all files
 *    before writing. On failure, restores originals.
 *    OpenClaw: no backup mechanism.
 *
 * 3. DIRECTORY AUTO-CREATION: Creates parent dirs as needed.
 *    OpenClaw: same (both have this).
 *
 * 4. DRY RUN: Preview what would be created/overwritten.
 *    OpenClaw: no dry run for writes.
 *
 * 5. CHANGE SUMMARY: Returns structured report of what changed
 *    (created, overwritten, bytes written).
 *    OpenClaw: just "ok" or error.
 *
 * 6. THOUGHT TRACKING: Associates batch writes with the thought
 *    that produced them.
 *    OpenClaw: no thought tracking.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { dirname } from "node:path";

// ─── TYPES ───────────────────────────────────────────────────

export interface BatchFileEntry {
  /** Absolute or relative path */
  path: string;
  /** File content */
  content: string;
}

export interface BatchFileChange {
  path: string;
  action: "created" | "overwritten";
  bytesWritten: number;
  /** Whether the file existed before */
  existed: boolean;
}

export interface BatchWriteResult {
  success: boolean;
  changes: BatchFileChange[];
  /** Files that were rolled back on failure */
  rolledBack: string[];
  /** Error message if failed */
  error?: string;
  /** Was this a dry run */
  dryRun: boolean;
  /** Summary text */
  summary: string;
  /** Associated thought ID */
  thoughtId?: string;
}

// ─── BATCH WRITER ────────────────────────────────────────────

/**
 * Write multiple files atomically with rollback on failure.
 */
export function batchWrite(
  files: BatchFileEntry[],
  options: {
    dryRun?: boolean;
    thoughtId?: string;
    /** Path security check function */
    securePath?: (path: string) => string;
  } = {},
): BatchWriteResult {
  const { dryRun = false, thoughtId } = options;

  if (files.length === 0) {
    return {
      success: true,
      changes: [],
      rolledBack: [],
      dryRun,
      summary: "No files to write.",
      thoughtId,
    };
  }

  // Validate all paths first (fail fast)
  const resolvedPaths: string[] = [];
  for (const file of files) {
    try {
      const resolved = options.securePath ? options.securePath(file.path) : file.path;
      resolvedPaths.push(resolved);
    } catch (err) {
      return {
        success: false,
        changes: [],
        rolledBack: [],
        error: `Path validation failed for '${file.path}': ${err instanceof Error ? err.message : String(err)}`,
        dryRun,
        summary: `Batch write failed: path validation error`,
        thoughtId,
      };
    }
  }

  // Dry run — just report what would happen
  if (dryRun) {
    const changes: BatchFileChange[] = resolvedPaths.map((path, i) => ({
      path: files[i].path,
      action: existsSync(path) ? "overwritten" as const : "created" as const,
      bytesWritten: Buffer.byteLength(files[i].content, "utf-8"),
      existed: existsSync(path),
    }));

    const created = changes.filter(c => c.action === "created").length;
    const overwritten = changes.filter(c => c.action === "overwritten").length;

    return {
      success: true,
      changes,
      rolledBack: [],
      dryRun: true,
      summary: `Would write ${files.length} file(s): ${created} new, ${overwritten} overwritten`,
      thoughtId,
    };
  }

  // Create backups
  const backups = new Map<string, { content: string | null; existed: boolean }>();
  for (const resolved of resolvedPaths) {
    if (existsSync(resolved)) {
      backups.set(resolved, {
        content: readFileSync(resolved, "utf-8"),
        existed: true,
      });
    } else {
      backups.set(resolved, { content: null, existed: false });
    }
  }

  // Write all files
  const changes: BatchFileChange[] = [];
  const written: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const resolved = resolvedPaths[i];
    const file = files[i];

    try {
      const dir = dirname(resolved);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const existed = backups.get(resolved)!.existed;
      writeFileSync(resolved, file.content, "utf-8");
      written.push(resolved);

      changes.push({
        path: file.path,
        action: existed ? "overwritten" : "created",
        bytesWritten: Buffer.byteLength(file.content, "utf-8"),
        existed,
      });
    } catch (err) {
      // Rollback all written files
      const rolledBack = rollback(written, backups);

      return {
        success: false,
        changes,
        rolledBack: rolledBack.map(r => files[resolvedPaths.indexOf(r)]?.path ?? r),
        error: `Failed writing '${file.path}': ${err instanceof Error ? err.message : String(err)}`,
        dryRun: false,
        summary: `Batch write failed at file ${i + 1}/${files.length}, rolled back ${rolledBack.length} file(s)`,
        thoughtId,
      };
    }
  }

  const created = changes.filter(c => c.action === "created").length;
  const overwritten = changes.filter(c => c.action === "overwritten").length;
  const totalBytes = changes.reduce((sum, c) => sum + c.bytesWritten, 0);
  const bytesStr = totalBytes < 1024
    ? `${totalBytes}B`
    : `${(totalBytes / 1024).toFixed(1)}KB`;

  return {
    success: true,
    changes,
    rolledBack: [],
    dryRun: false,
    summary: `Wrote ${files.length} file(s) (${bytesStr}): ${created} new, ${overwritten} overwritten`,
    thoughtId,
  };
}

/**
 * Rollback written files to their backups.
 */
function rollback(
  written: string[],
  backups: Map<string, { content: string | null; existed: boolean }>,
): string[] {
  const rolledBack: string[] = [];

  for (const path of written) {
    const backup = backups.get(path);
    if (!backup) continue;

    try {
      if (backup.existed && backup.content !== null) {
        // Restore original content
        writeFileSync(path, backup.content, "utf-8");
      } else {
        // File didn't exist before — delete it
        if (existsSync(path)) {
          unlinkSync(path);
        }
      }
      rolledBack.push(path);
    } catch {
      // Best effort — can't rollback
    }
  }

  return rolledBack;
}
