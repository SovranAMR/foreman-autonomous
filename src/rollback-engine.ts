/**
 * FOREMAN — Rollback Engine
 *
 * Undo operations at atom, block, or pipeline level.
 * Uses git commits as checkpoints for reliable rollback.
 *
 * Capabilities:
 * - Atom-level rollback (undo last atom's changes)
 * - Block-level rollback (undo all atoms in a block)
 * - Pipeline-level rollback (undo entire forge run)
 * - Selective rollback (undo specific atoms by ID)
 * - Rollback preview (show what will be undone)
 * - Rollback history (track all rollbacks)
 * - Stash guard (save WIP before rollback, restore after)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";

// ─── TYPES ───────────────────────────────────────────────────

export interface RollbackPoint {
  id: string;
  type: "atom" | "block" | "pipeline";
  commitHash: string;
  description: string;
  timestamp: number;
  atomIndex?: number;
  blockIndex?: number;
  chainId?: string;
  filesChanged: string[];
}

export interface RollbackResult {
  success: boolean;
  point: RollbackPoint;
  filesReverted: string[];
  error?: string;
}

export interface RollbackHistory {
  rollbacks: Array<{
    id: string;
    pointId: string;
    timestamp: number;
    success: boolean;
    filesReverted: number;
  }>;
}

// ─── ROLLBACK ENGINE ─────────────────────────────────────────

export class RollbackEngine {
  private projectRoot: string;
  private points: RollbackPoint[] = [];
  private history: RollbackHistory = { rollbacks: [] };
  private storagePath: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.storagePath = join(projectRoot, ".foreman", "rollback.json");
    this.load();
  }

  /**
   * Create a rollback point (snapshot of current state).
   * Called after each successful atom/block execution.
   */
  createPoint(
    type: "atom" | "block" | "pipeline",
    description: string,
    meta?: { atomIndex?: number; blockIndex?: number; chainId?: string },
  ): RollbackPoint | null {
    const commitHash = this.getCurrentCommitHash();
    if (!commitHash) return null;

    const filesChanged = this.getChangedFiles();

    const point: RollbackPoint = {
      id: `rb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      commitHash,
      description,
      timestamp: Date.now(),
      atomIndex: meta?.atomIndex,
      blockIndex: meta?.blockIndex,
      chainId: meta?.chainId,
      filesChanged,
    };

    this.points.push(point);
    this.save();
    return point;
  }

  /**
   * Rollback to a specific point.
   */
  rollback(pointId: string): RollbackResult {
    const point = this.points.find(p => p.id === pointId);
    if (!point) {
      return { success: false, point: { id: pointId } as RollbackPoint, filesReverted: [], error: "Point not found" };
    }

    return this.rollbackToCommit(point);
  }

  /**
   * Rollback the last atom.
   */
  rollbackLastAtom(): RollbackResult | null {
    const atomPoints = this.points
      .filter(p => p.type === "atom")
      .sort((a, b) => b.timestamp - a.timestamp);

    if (atomPoints.length < 2) return null;

    // Rollback to the point BEFORE the last atom
    const previousPoint = atomPoints[1];
    return this.rollbackToCommit(previousPoint);
  }

  /**
   * Rollback an entire block.
   */
  rollbackBlock(blockIndex: number): RollbackResult | null {
    // Find the block start point (the point just before this block's first atom)
    const blockPoints = this.points
      .filter(p => p.blockIndex === blockIndex)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (blockPoints.length === 0) return null;

    // Find the point right before this block started
    const blockStart = blockPoints[0].timestamp;
    const previousPoint = this.points
      .filter(p => p.timestamp < blockStart)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (!previousPoint) return null;
    return this.rollbackToCommit(previousPoint);
  }

  /**
   * Rollback the entire pipeline.
   */
  rollbackPipeline(): RollbackResult | null {
    const pipelinePoint = this.points.find(p => p.type === "pipeline");
    if (!pipelinePoint) return null;
    return this.rollbackToCommit(pipelinePoint);
  }

  /**
   * Preview what would be rolled back.
   */
  previewRollback(pointId: string): { files: string[]; commits: number } | null {
    const point = this.points.find(p => p.id === pointId);
    if (!point) return null;

    try {
      const log = execSync(
        `git log --oneline ${point.commitHash}..HEAD`,
        { cwd: this.projectRoot, encoding: "utf-8", stdio: "pipe" },
      ).trim();
      const commits = log ? log.split("\n").length : 0;

      const diff = execSync(
        `git diff --name-only ${point.commitHash}`,
        { cwd: this.projectRoot, encoding: "utf-8", stdio: "pipe" },
      ).trim();
      const files = diff ? diff.split("\n") : [];

      return { files, commits };
    } catch {
      return null;
    }
  }

  /**
   * Get all rollback points.
   */
  getPoints(): readonly RollbackPoint[] {
    return this.points;
  }

  /**
   * Get rollback history.
   */
  getHistory(): RollbackHistory {
    return this.history;
  }

  /**
   * Clear all rollback points (after successful pipeline completion).
   */
  clear(): void {
    this.points = [];
    this.save();
  }

  // ─── INTERNAL ───────────────────────────────────────────

  private rollbackToCommit(point: RollbackPoint): RollbackResult {
    try {
      // Stash any uncommitted changes
      let hasStash = false;
      try {
        const stashOutput = execSync(
          "git stash push -m 'foreman-rollback-guard'",
          { cwd: this.projectRoot, encoding: "utf-8", stdio: "pipe" },
        ).trim();
        hasStash = !stashOutput.includes("No local changes");
      } catch { /* no changes to stash */ }

      // Get files that will be reverted
      let filesReverted: string[] = [];
      try {
        const diff = execSync(
          `git diff --name-only ${point.commitHash}`,
          { cwd: this.projectRoot, encoding: "utf-8", stdio: "pipe" },
        ).trim();
        filesReverted = diff ? diff.split("\n") : [];
      } catch { /* ignore */ }

      // Reset to the checkpoint
      execSync(
        `git reset --hard ${point.commitHash}`,
        { cwd: this.projectRoot, encoding: "utf-8", stdio: "pipe" },
      );

      // Remove points that are now invalid
      this.points = this.points.filter(p => p.timestamp <= point.timestamp);
      this.save();

      // Record in history
      this.history.rollbacks.push({
        id: `rh_${Date.now()}`,
        pointId: point.id,
        timestamp: Date.now(),
        success: true,
        filesReverted: filesReverted.length,
      });

      // Restore stash if we had one (best-effort)
      if (hasStash) {
        try {
          execSync("git stash pop", { cwd: this.projectRoot, stdio: "pipe" });
        } catch { /* stash conflicts — leave in stash */ }
      }

      return { success: true, point, filesReverted };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.history.rollbacks.push({
        id: `rh_${Date.now()}`,
        pointId: point.id,
        timestamp: Date.now(),
        success: false,
        filesReverted: 0,
      });
      return { success: false, point, filesReverted: [], error };
    }
  }

  private getCurrentCommitHash(): string | null {
    try {
      return execSync("git rev-parse HEAD", {
        cwd: this.projectRoot,
        encoding: "utf-8",
        stdio: "pipe",
      }).trim();
    } catch {
      return null;
    }
  }

  private getChangedFiles(): string[] {
    try {
      const output = execSync("git diff --name-only HEAD~1 2>/dev/null || echo ''", {
        cwd: this.projectRoot,
        encoding: "utf-8",
        stdio: "pipe",
      }).trim();
      return output ? output.split("\n") : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      const dir = dirname(this.storagePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(this.storagePath, JSON.stringify({
        points: this.points,
        history: this.history,
      }, null, 2), "utf-8");
    } catch { /* best-effort */ }
  }

  private load(): void {
    try {
      if (existsSync(this.storagePath)) {
        const data = JSON.parse(readFileSync(this.storagePath, "utf-8"));
        this.points = data.points ?? [];
        this.history = data.history ?? { rollbacks: [] };
      }
    } catch { /* start fresh */ }
  }
}
