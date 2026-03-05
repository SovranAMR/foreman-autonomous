/**
 * FOREMAN — Work Tracker
 *
 * Tracks active work items across conversation turns.
 * Solves the core problem: LLM loses context between tool calls,
 * forgets what it was doing, can't finish multi-step tasks.
 *
 * Architecture:
 *   1. When user gives a task, LLM calls work_start to register it
 *   2. As work progresses, LLM calls work_step to log completed steps
 *   3. When done, LLM calls work_finish
 *   4. Every system prompt includes <active_work> showing pending items
 *   5. If LLM gets interrupted or loses context, it sees its own breadcrumbs
 *
 * Persistence: JSON file on disk, survives process restarts.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ─── TYPES ───────────────────────────────────────────────────

export interface WorkStep {
  /** What was done */
  description: string;
  /** When it was done */
  completedAt: string;
  /** Tool calls made (compact summary) */
  toolSummary?: string;
  /** Result: success | error | skipped */
  result: "success" | "error" | "skipped";
  /** Error message if result is error */
  error?: string;
}

export interface WorkItem {
  /** Unique ID: work_001, work_002, ... */
  id: string;
  /** Human-readable title */
  title: string;
  /** Full task description / goal */
  goal: string;
  /** Planned steps (what needs to be done) */
  plannedSteps: string[];
  /** Completed steps (what was done) */
  completedSteps: WorkStep[];
  /** Current step index (0-based into plannedSteps) */
  currentStepIndex: number;
  /** Status */
  status: "active" | "blocked" | "done" | "failed" | "paused";
  /** Why blocked */
  blockedReason?: string;
  /** Related file paths (for context) */
  relatedFiles: string[];
  /** Key decisions made during this work */
  decisions: string[];
  /** Created timestamp */
  createdAt: string;
  /** Last activity timestamp */
  updatedAt: string;
  /** Parent work item ID (for sub-tasks) */
  parentId?: string;
}

export interface WorkTrackerState {
  items: WorkItem[];
  /** Counter for generating IDs */
  nextId: number;
  /** Last time the tracker was active */
  lastActivity: string;
}

// ─── WORK TRACKER ────────────────────────────────────────────

export class WorkTracker {
  private state: WorkTrackerState;
  private readonly filePath: string;
  private readonly dirPath: string;

  constructor(projectRoot: string) {
    this.dirPath = join(projectRoot, ".foreman");
    this.filePath = join(this.dirPath, "work-tracker.json");
    this.state = this.load();
  }

  // ─── CORE OPERATIONS ──────────────────────────────────────

  /**
   * Start tracking a new work item.
   * Called when the LLM begins a multi-step task.
   */
  startWork(input: {
    title: string;
    goal: string;
    steps: string[];
    relatedFiles?: string[];
    parentId?: string;
  }): WorkItem {
    const id = `work_${String(this.state.nextId).padStart(3, "0")}`;
    this.state.nextId++;

    const item: WorkItem = {
      id,
      title: input.title,
      goal: input.goal,
      plannedSteps: input.steps,
      completedSteps: [],
      currentStepIndex: 0,
      status: "active",
      relatedFiles: input.relatedFiles ?? [],
      decisions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parentId: input.parentId,
    };

    this.state.items.push(item);
    this.save();
    return item;
  }

  /**
   * Log a completed step in a work item.
   * Called after each meaningful action.
   */
  completeStep(workId: string, step: {
    description: string;
    result: "success" | "error" | "skipped";
    toolSummary?: string;
    error?: string;
  }): WorkItem | null {
    const item = this.getItem(workId);
    if (!item) return null;

    item.completedSteps.push({
      ...step,
      completedAt: new Date().toISOString(),
    });

    // Advance step index if successful
    if (step.result === "success" && item.currentStepIndex < item.plannedSteps.length) {
      item.currentStepIndex++;
    }

    // Auto-complete if all steps done
    if (item.currentStepIndex >= item.plannedSteps.length) {
      item.status = "done";
    }

    // Block on error
    if (step.result === "error") {
      item.status = "blocked";
      item.blockedReason = step.error ?? "Step failed";
    }

    item.updatedAt = new Date().toISOString();
    this.save();
    return item;
  }

  /**
   * Record a decision made during work.
   * Preserves reasoning for future context.
   */
  addDecision(workId: string, decision: string): WorkItem | null {
    const item = this.getItem(workId);
    if (!item) return null;
    item.decisions.push(decision);
    item.updatedAt = new Date().toISOString();
    this.save();
    return item;
  }

  /**
   * Add related files discovered during work.
   */
  addRelatedFiles(workId: string, files: string[]): void {
    const item = this.getItem(workId);
    if (!item) return;
    for (const f of files) {
      if (!item.relatedFiles.includes(f)) {
        item.relatedFiles.push(f);
      }
    }
    item.updatedAt = new Date().toISOString();
    this.save();
  }

  /**
   * Update planned steps (replan).
   * Called when the LLM discovers the original plan was wrong.
   */
  replan(workId: string, newSteps: string[]): WorkItem | null {
    const item = this.getItem(workId);
    if (!item) return null;
    item.plannedSteps = newSteps;
    item.updatedAt = new Date().toISOString();
    this.save();
    return item;
  }

  /**
   * Mark work as done.
   */
  finishWork(workId: string, summary?: string): WorkItem | null {
    const item = this.getItem(workId);
    if (!item) return null;
    item.status = "done";
    if (summary) {
      item.decisions.push(`COMPLETED: ${summary}`);
    }
    item.updatedAt = new Date().toISOString();
    this.save();
    return item;
  }

  /**
   * Mark work as failed.
   */
  failWork(workId: string, reason: string): WorkItem | null {
    const item = this.getItem(workId);
    if (!item) return null;
    item.status = "failed";
    item.blockedReason = reason;
    item.updatedAt = new Date().toISOString();
    this.save();
    return item;
  }

  /**
   * Unblock a work item and optionally replan.
   */
  unblock(workId: string, newSteps?: string[]): WorkItem | null {
    const item = this.getItem(workId);
    if (!item) return null;
    item.status = "active";
    item.blockedReason = undefined;
    if (newSteps) {
      item.plannedSteps = newSteps;
    }
    item.updatedAt = new Date().toISOString();
    this.save();
    return item;
  }

  /**
   * Pause a work item (user interrupted with different task).
   */
  pauseWork(workId: string): WorkItem | null {
    const item = this.getItem(workId);
    if (!item) return null;
    item.status = "paused";
    item.updatedAt = new Date().toISOString();
    this.save();
    return item;
  }

  /**
   * Resume a paused work item.
   */
  resumeWork(workId: string): WorkItem | null {
    const item = this.getItem(workId);
    if (!item) return null;
    item.status = "active";
    item.updatedAt = new Date().toISOString();
    this.save();
    return item;
  }

  // ─── QUERIES ──────────────────────────────────────────────

  /**
   * Get all active (non-done, non-failed) work items.
   */
  getActiveWork(): WorkItem[] {
    return this.state.items.filter(
      (i) => i.status === "active" || i.status === "blocked" || i.status === "paused"
    );
  }

  /**
   * Get a specific work item.
   */
  getItem(id: string): WorkItem | null {
    return this.state.items.find((i) => i.id === id) ?? null;
  }

  /**
   * Get recently completed work (last N).
   */
  getRecentDone(count: number = 5): WorkItem[] {
    return this.state.items
      .filter((i) => i.status === "done" || i.status === "failed")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, count);
  }

  // ─── CONTEXT INJECTION ────────────────────────────────────

  /**
   * Build context text for system prompt injection.
   * This is the KEY function — it tells the LLM what it's working on.
   */
  buildContextInjection(): string {
    const active = this.getActiveWork();
    const recentDone = this.getRecentDone(3);

    if (active.length === 0 && recentDone.length === 0) {
      return "";
    }

    const parts: string[] = [];

    if (active.length > 0) {
      parts.push(`<active_work>`);
      parts.push(`YOU HAVE ${active.length} ACTIVE TASK(S). DO NOT START NEW WORK UNTIL THESE ARE DONE.`);
      parts.push(`If the user's message relates to an active task, CONTINUE that task from where you left off.`);
      parts.push(`If the user asks something unrelated, PAUSE active tasks first (work_pause), then start new work.`);
      parts.push(``);

      for (const item of active) {
        parts.push(`── ${item.id}: ${item.title} [${item.status.toUpperCase()}] ──`);
        parts.push(`Goal: ${item.goal}`);

        if (item.status === "blocked") {
          parts.push(`⚠️ BLOCKED: ${item.blockedReason}`);
          parts.push(`Action needed: Fix the blocker, then call work_unblock`);
        }

        if (item.status === "paused") {
          parts.push(`⏸️ PAUSED — Resume with work_resume when ready`);
        }

        // Show progress
        const total = item.plannedSteps.length;
        const done = item.currentStepIndex;
        parts.push(`Progress: ${done}/${total} steps`);

        // Show completed steps (last 3 only for brevity)
        if (item.completedSteps.length > 0) {
          const recent = item.completedSteps.slice(-3);
          parts.push(`Recent steps:`);
          for (const s of recent) {
            const icon = s.result === "success" ? "✅" : s.result === "error" ? "❌" : "⏭️";
            parts.push(`  ${icon} ${s.description}`);
            if (s.error) parts.push(`     Error: ${s.error}`);
          }
        }

        // Show remaining steps
        if (done < total) {
          parts.push(`Remaining steps:`);
          for (let i = done; i < total; i++) {
            const marker = i === done ? "→" : " ";
            parts.push(`  ${marker} ${i + 1}. ${item.plannedSteps[i]}`);
          }
        }

        // Show key decisions
        if (item.decisions.length > 0) {
          parts.push(`Key decisions:`);
          for (const d of item.decisions.slice(-3)) {
            parts.push(`  • ${d}`);
          }
        }

        // Show related files
        if (item.relatedFiles.length > 0) {
          parts.push(`Related files: ${item.relatedFiles.join(", ")}`);
        }

        parts.push(``);
      }
      parts.push(`</active_work>`);
    }

    if (recentDone.length > 0) {
      parts.push(`<recent_completed>`);
      for (const item of recentDone) {
        const icon = item.status === "done" ? "✅" : "❌";
        const ago = this.timeAgo(item.updatedAt);
        parts.push(`${icon} ${item.title} — ${ago}`);
      }
      parts.push(`</recent_completed>`);
    }

    return parts.join("\n");
  }

  // ─── CLEANUP ──────────────────────────────────────────────

  /**
   * Archive old completed items (keep last 20).
   * Called periodically to prevent state file bloat.
   */
  cleanup(): void {
    const completed = this.state.items.filter(
      (i) => i.status === "done" || i.status === "failed"
    );

    if (completed.length > 20) {
      // Sort by updatedAt, keep newest 20
      completed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const toRemove = new Set(completed.slice(20).map((i) => i.id));
      this.state.items = this.state.items.filter((i) => !toRemove.has(i.id));
      this.save();
    }
  }

  /**
   * Auto-expire stale active items (older than 24h with no activity).
   */
  expireStale(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let changed = false;

    for (const item of this.state.items) {
      if (
        (item.status === "active" || item.status === "blocked") &&
        new Date(item.updatedAt).getTime() < cutoff
      ) {
        item.status = "failed";
        item.blockedReason = "Auto-expired: no activity for 24h";
        changed = true;
      }
    }

    if (changed) this.save();
  }

  // ─── PERSISTENCE ──────────────────────────────────────────

  private load(): WorkTrackerState {
    if (!existsSync(this.filePath)) {
      return { items: [], nextId: 1, lastActivity: new Date().toISOString() };
    }

    try {
      const raw = readFileSync(this.filePath, "utf-8");
      return JSON.parse(raw) as WorkTrackerState;
    } catch {
      return { items: [], nextId: 1, lastActivity: new Date().toISOString() };
    }
  }

  private save(): void {
    if (!existsSync(this.dirPath)) {
      mkdirSync(this.dirPath, { recursive: true });
    }
    this.state.lastActivity = new Date().toISOString();
    writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf-8");
  }

  // ─── HELPERS ──────────────────────────────────────────────

  private timeAgo(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
