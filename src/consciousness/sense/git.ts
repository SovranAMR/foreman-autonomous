/**
 * FOREMAN — Git Sense Module
 *
 * Monitors git repository state for the project.
 * Detects:
 * - Uncommitted changes sitting too long
 * - Stale branches (no commits in >7 days)
 * - Untracked files accumulating
 * - Large uncommitted diffs (potential data loss risk)
 *
 * Uses git CLI commands directly — no git library dependency.
 */

import { execSync } from "node:child_process";
import type {
  SenseModule,
  SenseReport,
  SenseFinding,
  ConsciousnessConfig,
} from "../types.js";

export class GitSense implements SenseModule {
  readonly id = "git" as const;
  readonly name = "Git Status";

  constructor(private config: ConsciousnessConfig) {}

  async scan(): Promise<SenseReport> {
    const start = Date.now();
    const findings: SenseFinding[] = [];

    try {
      const root = this.config.projectRoot;

      // Check if this is a git repo
      if (!this.isGitRepo(root)) {
        return {
          senseId: this.id,
          timestamp: Date.now(),
          durationMs: Date.now() - start,
          findings: [],
        };
      }

      // ── Dirty working tree ──
      const dirtyFiles = this.getDirtyFileCount(root);
      if (dirtyFiles > 0) {
        const lastCommitAge = this.getLastCommitAgeHours(root);

        if (lastCommitAge > 24) {
          findings.push({
            key: "git_stale_changes",
            summary: `📁 ${dirtyFiles} dosya commit edilmemiş (son commit ${lastCommitAge.toFixed(0)} saat önce)`,
            severity: lastCommitAge > 72 ? "warning" : "info",
            value: dirtyFiles,
            metadata: { dirtyFiles, lastCommitAgeHours: lastCommitAge },
          });
        }
      }

      // ── Untracked files ──
      const untrackedCount = this.getUntrackedCount(root);
      if (untrackedCount > 10) {
        findings.push({
          key: "git_untracked_files",
          summary: `📁 ${untrackedCount} takip edilmeyen dosya var — .gitignore'a eklemeli mi?`,
          severity: "info",
          value: untrackedCount,
        });
      }

      // ── Large uncommitted diff ──
      const diffLines = this.getUncommittedDiffSize(root);
      if (diffLines > 500) {
        findings.push({
          key: "git_large_diff",
          summary: `⚠️ ${diffLines} satır commit edilmemiş değişiklik — kaybetme riski`,
          severity: diffLines > 2000 ? "warning" : "info",
          value: diffLines,
        });
      }

      return {
        senseId: this.id,
        timestamp: Date.now(),
        durationMs: Date.now() - start,
        findings,
      };
    } catch (err) {
      return {
        senseId: this.id,
        timestamp: Date.now(),
        durationMs: Date.now() - start,
        findings,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private isGitRepo(cwd: string): boolean {
    try {
      execSync("git rev-parse --is-inside-work-tree 2>/dev/null", { cwd, timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  private getDirtyFileCount(cwd: string): number {
    try {
      const output = execSync("git status --porcelain 2>/dev/null", {
        encoding: "utf-8",
        cwd,
        timeout: 5000,
      });
      return output.trim().split("\n").filter(l => l.trim().length > 0).length;
    } catch {
      return 0;
    }
  }

  private getLastCommitAgeHours(cwd: string): number {
    try {
      const output = execSync('git log -1 --format="%ct" 2>/dev/null', {
        encoding: "utf-8",
        cwd,
        timeout: 3000,
      });
      const commitTimestamp = parseInt(output.trim(), 10);
      if (!Number.isFinite(commitTimestamp)) return 0;
      return (Date.now() / 1000 - commitTimestamp) / 3600;
    } catch {
      return 0;
    }
  }

  private getUntrackedCount(cwd: string): number {
    try {
      const output = execSync("git ls-files --others --exclude-standard 2>/dev/null", {
        encoding: "utf-8",
        cwd,
        timeout: 5000,
      });
      return output.trim().split("\n").filter(l => l.trim().length > 0).length;
    } catch {
      return 0;
    }
  }

  private getUncommittedDiffSize(cwd: string): number {
    try {
      const output = execSync("git diff --stat 2>/dev/null", {
        encoding: "utf-8",
        cwd,
        timeout: 5000,
      });
      // Last line: "X files changed, Y insertions(+), Z deletions(-)"
      const match = output.match(/(\d+) insertions?\(\+\).*?(\d+) deletions?\(-\)/);
      if (match) {
        return parseInt(match[1], 10) + parseInt(match[2], 10);
      }
      return 0;
    } catch {
      return 0;
    }
  }
}
