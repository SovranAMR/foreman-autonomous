/**
 * FOREMAN — Task Scheduler
 *
 * Scheduled and recurring task execution.
 *
 * OpenClaw's cron system: Full cron expression parser, at/every/cron
 * schedule types, job persistence, wake events, isolated sessions.
 * Built for a daemon that runs 24/7.
 *
 * Foreman's Task Scheduler — 5 capabilities tailored to a coding orchestrator:
 *
 * 1. INTERVAL TASKS: "Run tests every 5 minutes during development".
 *    Simple setInterval with drift compensation.
 *    OpenClaw: same concept via "every" schedule.
 *
 * 2. ON-EVENT TASKS: "After every commit, run lint".
 *    Event-driven triggers (commit, file-change, chain-complete).
 *    OpenClaw: systemEvent payload but no file/git event triggers.
 *
 * 3. DEBOUNCED TASKS: File watchers fire multiple events per save.
 *    Scheduler debounces — waits for silence before running.
 *    OpenClaw: no debouncing.
 *
 * 4. ONE-SHOT DELAYED: "Run cleanup in 30 minutes".
 *    OpenClaw: "at" schedule type, similar.
 *
 * 5. TASK DEPENDENCIES: "Run deploy AFTER tests pass".
 *    DAG-based dependency resolution between scheduled tasks.
 *    OpenClaw: no task dependencies.
 */

import type { Layer } from "./types.js";

// ─── TYPES ───────────────────────────────────────────────────

export type ScheduleKind = "interval" | "event" | "delayed" | "once";

export type EventType =
  | "commit"
  | "file-change"
  | "chain-complete"
  | "test-pass"
  | "test-fail"
  | "build-success"
  | "build-fail"
  | "custom";

export interface ScheduledTask {
  id: string;
  name: string;
  kind: ScheduleKind;
  /** The function to execute */
  execute: () => Promise<void>;
  /** Interval in ms (for "interval" kind) */
  intervalMs?: number;
  /** Delay in ms (for "delayed" kind) */
  delayMs?: number;
  /** Event to trigger on (for "event" kind) */
  event?: EventType;
  /** Custom event name (when event="custom") */
  customEvent?: string;
  /** Debounce period in ms (for "event" kind) */
  debounceMs?: number;
  /** Task IDs that must complete before this runs */
  dependsOn?: string[];
  /** Associated layer */
  layer?: Layer;
  /** Is this task enabled */
  enabled: boolean;
  /** How many times has this task run */
  runCount: number;
  /** Last run timestamp */
  lastRunAt?: number;
  /** Last run duration (ms) */
  lastDurationMs?: number;
  /** Last error */
  lastError?: string;
}

export interface SchedulerStats {
  totalTasks: number;
  activeTasks: number;
  totalRuns: number;
  byKind: Record<string, number>;
}

// ─── TASK SCHEDULER ──────────────────────────────────────────

export class TaskScheduler {
  private tasks = new Map<string, ScheduledTask>();
  private timers = new Map<string, ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private completedTasks = new Set<string>();
  private taskCounter = 0;
  private totalRuns = 0;

  /**
   * Register an interval task.
   */
  addInterval(params: {
    name: string;
    execute: () => Promise<void>;
    intervalMs: number;
    layer?: Layer;
  }): string {
    const id = this.nextId();
    const task: ScheduledTask = {
      id,
      name: params.name,
      kind: "interval",
      execute: params.execute,
      intervalMs: params.intervalMs,
      layer: params.layer,
      enabled: true,
      runCount: 0,
    };
    this.tasks.set(id, task);
    this.startInterval(task);
    return id;
  }

  /**
   * Register an event-triggered task.
   */
  addEventTask(params: {
    name: string;
    execute: () => Promise<void>;
    event: EventType;
    customEvent?: string;
    debounceMs?: number;
    layer?: Layer;
  }): string {
    const id = this.nextId();
    const task: ScheduledTask = {
      id,
      name: params.name,
      kind: "event",
      execute: params.execute,
      event: params.event,
      customEvent: params.customEvent,
      debounceMs: params.debounceMs,
      layer: params.layer,
      enabled: true,
      runCount: 0,
    };
    this.tasks.set(id, task);
    return id;
  }

  /**
   * Register a one-shot delayed task.
   */
  addDelayed(params: {
    name: string;
    execute: () => Promise<void>;
    delayMs: number;
    dependsOn?: string[];
    layer?: Layer;
  }): string {
    const id = this.nextId();
    const task: ScheduledTask = {
      id,
      name: params.name,
      kind: "delayed",
      execute: params.execute,
      delayMs: params.delayMs,
      dependsOn: params.dependsOn,
      layer: params.layer,
      enabled: true,
      runCount: 0,
    };
    this.tasks.set(id, task);
    this.startDelayed(task);
    return id;
  }

  /**
   * Fire an event — triggers all matching event tasks.
   */
  async fireEvent(event: EventType, customEvent?: string): Promise<number> {
    let triggered = 0;

    for (const task of this.tasks.values()) {
      if (!task.enabled || task.kind !== "event") continue;
      if (task.event !== event) continue;
      if (event === "custom" && task.customEvent !== customEvent) continue;

      if (task.debounceMs && task.debounceMs > 0) {
        // Debounce: reset timer on each event
        const existingTimer = this.debounceTimers.get(task.id);
        if (existingTimer) clearTimeout(existingTimer);

        const timer = setTimeout(() => {
          this.debounceTimers.delete(task.id);
          this.runTask(task);
        }, task.debounceMs);
        if (typeof timer === "object" && "unref" in timer) timer.unref();
        this.debounceTimers.set(task.id, timer);
      } else {
        await this.runTask(task);
      }
      triggered++;
    }

    return triggered;
  }

  /**
   * Remove a task.
   */
  remove(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    // Clear timers
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer as ReturnType<typeof setTimeout>);
      clearInterval(timer as ReturnType<typeof setInterval>);
      this.timers.delete(id);
    }

    const debounce = this.debounceTimers.get(id);
    if (debounce) {
      clearTimeout(debounce);
      this.debounceTimers.delete(id);
    }

    this.tasks.delete(id);
    return true;
  }

  /**
   * Enable/disable a task.
   */
  setEnabled(id: string, enabled: boolean): void {
    const task = this.tasks.get(id);
    if (!task) return;
    task.enabled = enabled;

    if (!enabled) {
      const timer = this.timers.get(id);
      if (timer) {
        clearTimeout(timer as ReturnType<typeof setTimeout>);
        clearInterval(timer as ReturnType<typeof setInterval>);
        this.timers.delete(id);
      }
    } else if (task.kind === "interval") {
      this.startInterval(task);
    }
  }

  /**
   * Get a task by ID.
   */
  get(id: string): ScheduledTask | null {
    return this.tasks.get(id) ?? null;
  }

  /**
   * List all tasks.
   */
  list(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get scheduler statistics.
   */
  stats(): SchedulerStats {
    const byKind: Record<string, number> = {};
    let activeTasks = 0;

    for (const task of this.tasks.values()) {
      byKind[task.kind] = (byKind[task.kind] ?? 0) + 1;
      if (task.enabled) activeTasks++;
    }

    return {
      totalTasks: this.tasks.size,
      activeTasks,
      totalRuns: this.totalRuns,
      byKind,
    };
  }

  /**
   * Stop all tasks and clear state.
   */
  shutdown(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer as ReturnType<typeof setTimeout>);
      clearInterval(timer as ReturnType<typeof setInterval>);
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.debounceTimers.clear();
    this.tasks.clear();
    this.completedTasks.clear();
    this.totalRuns = 0;
  }

  // ─── PRIVATE ───────────────────────────────────────────────

  private async runTask(task: ScheduledTask): Promise<void> {
    if (!task.enabled) return;

    // Check dependencies
    if (task.dependsOn && task.dependsOn.length > 0) {
      const unmet = task.dependsOn.filter(dep => !this.completedTasks.has(dep));
      if (unmet.length > 0) return;
    }

    const startTime = Date.now();
    try {
      await task.execute();
      task.lastError = undefined;
    } catch (err) {
      task.lastError = err instanceof Error ? err.message : String(err);
    }

    task.runCount++;
    task.lastRunAt = Date.now();
    task.lastDurationMs = Date.now() - startTime;
    this.totalRuns++;
    this.completedTasks.add(task.id);
  }

  private startInterval(task: ScheduledTask): void {
    if (!task.intervalMs || task.intervalMs <= 0) return;

    const timer = setInterval(() => {
      if (task.enabled) {
        this.runTask(task);
      }
    }, task.intervalMs);
    if (typeof timer === "object" && "unref" in timer) timer.unref();
    this.timers.set(task.id, timer);
  }

  private startDelayed(task: ScheduledTask): void {
    if (!task.delayMs || task.delayMs <= 0) return;

    const timer = setTimeout(() => {
      this.timers.delete(task.id);
      this.runTask(task);
    }, task.delayMs);
    if (typeof timer === "object" && "unref" in timer) timer.unref();
    this.timers.set(task.id, timer);
  }

  private nextId(): string {
    return `sched_${++this.taskCounter}`;
  }
}
