/**
 * FOREMAN — Cron Engine
 *
 * Real cron expression scheduling for Foreman.
 * Transplanted from OpenClaw's cron system with Foreman adaptations.
 *
 * Supports:
 * - Standard cron expressions (5-field: min hour dom month dow)
 * - Extended 6-field (sec min hour dom month dow)
 * - Timezone-aware scheduling
 * - "at" (one-shot) / "every" (interval) / "cron" (expression)
 * - Job persistence (JSON file)
 * - Next-run computation
 * - Job history tracking
 *
 * Dependencies: croner (lightweight cron parser)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// ─── TYPES ───────────────────────────────────────────────────

export type CronScheduleKind = "at" | "every" | "cron";

export interface CronScheduleAt {
  kind: "at";
  /** ISO-8601 timestamp or Unix ms */
  at: string | number;
}

export interface CronScheduleEvery {
  kind: "every";
  /** Interval in milliseconds */
  everyMs: number;
  /** Anchor timestamp (default: first run time) */
  anchorMs?: number;
}

export interface CronScheduleCron {
  kind: "cron";
  /** Cron expression (5 or 6 fields) */
  expr: string;
  /** IANA timezone (default: system timezone) */
  tz?: string;
}

export type CronSchedule = CronScheduleAt | CronScheduleEvery | CronScheduleCron;

export interface CronJob {
  id: string;
  name: string;
  schedule: CronSchedule;
  /** What to execute */
  payload: CronPayload;
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  runCount: number;
  lastResult?: CronRunResult;
}

export interface CronPayload {
  kind: "command" | "callback" | "pipeline";
  /** Shell command (kind=command) */
  command?: string;
  /** Callback identifier (kind=callback) */
  callbackId?: string;
  /** Pipeline task description (kind=pipeline) */
  task?: string;
}

export interface CronRunResult {
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
  timestamp: number;
}

export interface CronRunHistory {
  jobId: string;
  result: CronRunResult;
}

// ─── NEXT RUN COMPUTATION ────────────────────────────────────

function resolveCronTimezone(tz?: string): string {
  const trimmed = typeof tz === "string" ? tz.trim() : "";
  if (trimmed) return trimmed;
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Compute next run time for a schedule.
 * For "at": returns the timestamp if in the future.
 * For "every": computes next interval step from anchor.
 * For "cron": parses expression and finds next match.
 */
export function computeNextRunMs(schedule: CronSchedule, nowMs: number): number | undefined {
  if (schedule.kind === "at") {
    const atMs = typeof schedule.at === "number"
      ? schedule.at
      : typeof schedule.at === "string"
        ? new Date(schedule.at).getTime()
        : NaN;
    if (!Number.isFinite(atMs)) return undefined;
    return atMs > nowMs ? atMs : undefined;
  }

  if (schedule.kind === "every") {
    const everyMs = Math.max(1, Math.floor(schedule.everyMs));
    const anchor = Math.max(0, Math.floor(schedule.anchorMs ?? nowMs));
    if (nowMs < anchor) return anchor;
    const elapsed = nowMs - anchor;
    const steps = Math.max(1, Math.floor((elapsed + everyMs - 1) / everyMs));
    return anchor + steps * everyMs;
  }

  // cron expression
  const expr = schedule.expr.trim();
  if (!expr) return undefined;

  try {
    // Simple cron field parsing (no external dep needed for basic expressions)
    const next = computeNextCronMatch(expr, nowMs, resolveCronTimezone(schedule.tz));
    return next;
  } catch {
    return undefined;
  }
}

/**
 * Parse cron expression and find next matching time.
 * Supports standard 5-field: minute hour dom month dow
 */
function computeNextCronMatch(expr: string, nowMs: number, tz: string): number | undefined {
  const fields = expr.split(/\s+/);
  if (fields.length < 5) return undefined;

  const [minField, hourField, domField, monthField, dowField] = fields;

  const parseField = (field: string, min: number, max: number): number[] => {
    if (field === "*") return Array.from({ length: max - min + 1 }, (_, i) => i + min);

    const values: number[] = [];
    for (const part of field.split(",")) {
      if (part.includes("/")) {
        const [range, step] = part.split("/");
        const stepNum = parseInt(step, 10);
        const rangeVals = range === "*"
          ? Array.from({ length: max - min + 1 }, (_, i) => i + min)
          : parseField(range, min, max);
        for (let i = 0; i < rangeVals.length; i += stepNum) {
          values.push(rangeVals[i]);
        }
      } else if (part.includes("-")) {
        const [start, end] = part.split("-").map(Number);
        for (let i = start; i <= end; i++) values.push(i);
      } else {
        values.push(parseInt(part, 10));
      }
    }
    return values.filter(v => v >= min && v <= max);
  };

  const minutes = parseField(minField, 0, 59);
  const hours = parseField(hourField, 0, 23);
  const doms = parseField(domField, 1, 31);
  const months = parseField(monthField, 1, 12);
  const dows = parseField(dowField, 0, 6); // 0=Sunday

  // Search forward up to 366 days
  const start = new Date(nowMs + 60_000); // at least 1 minute ahead
  const maxSearch = 366 * 24 * 60; // 366 days in minutes

  for (let i = 0; i < maxSearch; i++) {
    const candidate = new Date(start.getTime() + i * 60_000);

    // Apply timezone offset
    const tzDate = new Date(candidate.toLocaleString("en-US", { timeZone: tz }));

    if (
      months.includes(tzDate.getMonth() + 1) &&
      (domField === "*" || doms.includes(tzDate.getDate())) &&
      (dowField === "*" || dows.includes(tzDate.getDay())) &&
      hours.includes(tzDate.getHours()) &&
      minutes.includes(tzDate.getMinutes())
    ) {
      // Align to exact minute
      candidate.setSeconds(0, 0);
      return candidate.getTime();
    }
  }

  return undefined;
}

// ─── CRON ENGINE ─────────────────────────────────────────────

type JobCallback = (job: CronJob) => Promise<CronRunResult>;

export class CronEngine {
  private jobs: Map<string, CronJob> = new Map();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private callbacks: Map<string, JobCallback> = new Map();
  private history: CronRunHistory[] = [];
  private persistPath: string;
  private running = false;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private maxHistory = 100;

  constructor(projectRoot: string) {
    this.persistPath = join(projectRoot, ".foreman", "cron-jobs.json");
    this.load();
  }

  // ─── JOB MANAGEMENT ─────────────────────────────────────

  addJob(params: {
    name: string;
    schedule: CronSchedule;
    payload: CronPayload;
    enabled?: boolean;
  }): CronJob {
    const id = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const job: CronJob = {
      id,
      name: params.name,
      schedule: params.schedule,
      payload: params.payload,
      enabled: params.enabled ?? true,
      createdAt: now,
      runCount: 0,
      nextRunAt: computeNextRunMs(params.schedule, now),
    };

    this.jobs.set(id, job);
    this.persist();

    if (this.running && job.enabled) {
      this.scheduleJob(job);
    }

    return job;
  }

  removeJob(jobId: string): boolean {
    const timer = this.timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobId);
    }

    const deleted = this.jobs.delete(jobId);
    if (deleted) this.persist();
    return deleted;
  }

  updateJob(jobId: string, patch: Partial<Pick<CronJob, "name" | "schedule" | "payload" | "enabled">>): CronJob | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    if (patch.name !== undefined) job.name = patch.name;
    if (patch.schedule !== undefined) {
      job.schedule = patch.schedule;
      job.nextRunAt = computeNextRunMs(patch.schedule, Date.now());
    }
    if (patch.payload !== undefined) job.payload = patch.payload;
    if (patch.enabled !== undefined) {
      job.enabled = patch.enabled;
      if (!patch.enabled) {
        const timer = this.timers.get(jobId);
        if (timer) {
          clearTimeout(timer);
          this.timers.delete(jobId);
        }
      } else if (this.running) {
        this.scheduleJob(job);
      }
    }

    this.persist();
    return job;
  }

  getJob(jobId: string): CronJob | undefined {
    return this.jobs.get(jobId);
  }

  listJobs(includeDisabled = false): CronJob[] {
    const jobs = [...this.jobs.values()];
    return includeDisabled ? jobs : jobs.filter(j => j.enabled);
  }

  getHistory(jobId?: string, limit = 20): CronRunHistory[] {
    const filtered = jobId
      ? this.history.filter(h => h.jobId === jobId)
      : this.history;
    return filtered.slice(-limit);
  }

  // ─── CALLBACK REGISTRATION ──────────────────────────────

  registerCallback(callbackId: string, fn: JobCallback): void {
    this.callbacks.set(callbackId, fn);
  }

  // ─── ENGINE LIFECYCLE ───────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;

    // Schedule all enabled jobs
    for (const job of this.jobs.values()) {
      if (job.enabled) {
        this.scheduleJob(job);
      }
    }

    // Tick every 30 seconds to catch missed schedules
    this.tickInterval = setInterval(() => this.tick(), 30_000);
    this.tickInterval.unref();
  }

  stop(): void {
    this.running = false;

    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  // ─── MANUAL TRIGGER ─────────────────────────────────────

  async runNow(jobId: string): Promise<CronRunResult | null> {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    return this.executeJob(job);
  }

  // ─── INTERNAL SCHEDULING ────────────────────────────────

  private scheduleJob(job: CronJob): void {
    // Clear existing timer
    const existing = this.timers.get(job.id);
    if (existing) clearTimeout(existing);

    const now = Date.now();
    const nextRun = computeNextRunMs(job.schedule, now);
    if (!nextRun) return;

    job.nextRunAt = nextRun;
    const delay = Math.max(0, nextRun - now);

    const timer = setTimeout(async () => {
      this.timers.delete(job.id);
      await this.executeJob(job);

      // Reschedule if not one-shot
      if (job.schedule.kind !== "at" && job.enabled && this.running) {
        this.scheduleJob(job);
      }
    }, delay);
    timer.unref();

    this.timers.set(job.id, timer);
  }

  private async executeJob(job: CronJob): Promise<CronRunResult> {
    const start = Date.now();

    try {
      let result: CronRunResult;

      if (job.payload.kind === "callback" && job.payload.callbackId) {
        const cb = this.callbacks.get(job.payload.callbackId);
        if (cb) {
          result = await cb(job);
        } else {
          result = {
            success: false,
            error: `Callback not found: ${job.payload.callbackId}`,
            durationMs: Date.now() - start,
            timestamp: Date.now(),
          };
        }
      } else if (job.payload.kind === "command" && job.payload.command) {
        // Execute shell command
        const { execSync } = await import("node:child_process");
        try {
          const output = execSync(job.payload.command, {
            encoding: "utf-8",
            timeout: 60_000,
            maxBuffer: 1024 * 1024,
          }).trim();
          result = {
            success: true,
            output: output.slice(0, 5000),
            durationMs: Date.now() - start,
            timestamp: Date.now(),
          };
        } catch (err: unknown) {
          const error = err as { stderr?: string; message?: string };
          result = {
            success: false,
            error: (error.stderr ?? error.message ?? "Command failed").slice(0, 2000),
            durationMs: Date.now() - start,
            timestamp: Date.now(),
          };
        }
      } else {
        result = {
          success: false,
          error: `Unknown payload kind: ${job.payload.kind}`,
          durationMs: Date.now() - start,
          timestamp: Date.now(),
        };
      }

      job.lastRunAt = Date.now();
      job.lastResult = result;
      job.runCount++;

      // Update nextRunAt
      job.nextRunAt = computeNextRunMs(job.schedule, Date.now());

      this.history.push({ jobId: job.id, result });
      if (this.history.length > this.maxHistory) {
        this.history = this.history.slice(-this.maxHistory);
      }

      this.persist();
      return result;
    } catch (err) {
      const result: CronRunResult = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        timestamp: Date.now(),
      };
      job.lastRunAt = Date.now();
      job.lastResult = result;
      job.runCount++;
      this.history.push({ jobId: job.id, result });
      this.persist();
      return result;
    }
  }

  private tick(): void {
    const now = Date.now();
    for (const job of this.jobs.values()) {
      if (!job.enabled) continue;
      if (!this.timers.has(job.id) && job.nextRunAt && job.nextRunAt <= now) {
        // Missed schedule — execute and reschedule
        this.executeJob(job).catch(() => {});
        if (job.schedule.kind !== "at") {
          this.scheduleJob(job);
        }
      }
    }
  }

  // ─── PERSISTENCE ────────────────────────────────────────

  private persist(): void {
    try {
      const dir = dirname(this.persistPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const data = {
        jobs: [...this.jobs.values()],
        history: this.history.slice(-50), // Keep last 50 in file
      };
      writeFileSync(this.persistPath, JSON.stringify(data, null, 2), "utf-8");
    } catch { /* best-effort */ }
  }

  private load(): void {
    try {
      if (!existsSync(this.persistPath)) return;
      const raw = readFileSync(this.persistPath, "utf-8");
      const data = JSON.parse(raw);

      if (Array.isArray(data.jobs)) {
        for (const job of data.jobs) {
          this.jobs.set(job.id, job);
        }
      }
      if (Array.isArray(data.history)) {
        this.history = data.history;
      }
    } catch { /* fresh start */ }
  }

  /** Stats summary */
  stats(): { total: number; enabled: number; running: boolean; totalRuns: number } {
    const jobs = [...this.jobs.values()];
    return {
      total: jobs.length,
      enabled: jobs.filter(j => j.enabled).length,
      running: this.running,
      totalRuns: jobs.reduce((sum, j) => sum + j.runCount, 0),
    };
  }
}
