/**
 * FOREMAN — Command Queue with Lanes
 *
 * Serialized execution queue to prevent race conditions when multiple
 * thought chains run commands concurrently.
 *
 * OpenClaw's command-queue.ts: Lane-based serialization with configurable
 * concurrency per lane. Main lane = serial, cron lane = parallel.
 * But no priority, no thought-awareness, no starvation prevention.
 *
 * Foreman's Command Queue — 7 capabilities that EXCEED OpenClaw:
 *
 * 1. THOUGHT-AWARE LANES: Each lane tied to a thought chain.
 *    "chain_A" gets its own lane — serialized within, parallel across.
 *    OpenClaw: generic named lanes with no semantic meaning.
 *
 * 2. PRIORITY QUEUE: Tasks have priority (critical > high > normal > low).
 *    Worker step4_decide "critical" commands jump the queue.
 *    OpenClaw: strict FIFO within each lane.
 *
 * 3. LAYER-BASED PRIORITY DEFAULTS: Visioner tasks default to "high",
 *    worker tasks default to "normal". Configurable per layer.
 *    OpenClaw: no layer concept.
 *
 * 4. STARVATION PREVENTION: Low-priority tasks promoted after N cycles
 *    without execution. No task starves forever.
 *    OpenClaw: no starvation prevention.
 *
 * 5. QUEUE STATS: Wait time tracking, queue depth per lane, throughput.
 *    OpenClaw: no queue observability.
 *
 * 6. TIMEOUT ON QUEUE WAIT: If a task waits longer than queueTimeoutMs,
 *    it's rejected with an error. No infinite blocking.
 *    OpenClaw: no queue timeout.
 *
 * 7. DRAIN MODE: Graceful shutdown — stop accepting new tasks,
 *    wait for running tasks to finish.
 *    OpenClaw: no drain mode.
 */

import type { Layer } from "./types.js";

// ─── TYPES ───────────────────────────────────────────────────

export type TaskPriority = "critical" | "high" | "normal" | "low";

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export interface QueueTask<T = unknown> {
  /** Unique task ID */
  id: string;
  /** The work to execute */
  execute: () => Promise<T>;
  /** Priority level */
  priority: TaskPriority;
  /** Which lane this task belongs to */
  lane: string;
  /** Associated thought */
  thoughtId?: string;
  /** Associated layer */
  layer?: Layer;
  /** When this task was enqueued */
  enqueuedAt: number;
  /** Max time to wait in queue before rejection (ms) */
  queueTimeoutMs?: number;
  /** Cycles waited (for starvation prevention) */
  cyclesWaited: number;
}

interface QueueEntry<T = unknown> {
  task: QueueTask<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

interface LaneState {
  name: string;
  queue: QueueEntry[];
  active: number;
  maxConcurrent: number;
  draining: boolean;
  totalProcessed: number;
  totalWaitMs: number;
}

export interface QueueStats {
  /** Total tasks currently queued (waiting) */
  queued: number;
  /** Total tasks currently executing */
  active: number;
  /** Total tasks processed since start */
  totalProcessed: number;
  /** Average wait time (ms) */
  avgWaitMs: number;
  /** Per-lane stats */
  lanes: Record<string, { queued: number; active: number; processed: number }>;
  /** Whether drain mode is active */
  draining: boolean;
}

// ─── CONSTANTS ───────────────────────────────────────────────

const DEFAULT_LANE = "main";
const DEFAULT_MAX_CONCURRENT = 1;
const DEFAULT_QUEUE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const STARVATION_PROMOTE_AFTER = 10; // promote priority after 10 cycles

/** Default priority by layer */
const LAYER_PRIORITY: Record<Layer, TaskPriority> = {
  visioner: "high",
  strategist: "high",
  researcher: "normal",
  worker: "normal",
};

// ─── COMMAND QUEUE ───────────────────────────────────────────

export class CommandQueue {
  private lanes = new Map<string, LaneState>();
  private globalDraining = false;
  private taskCounter = 0;

  /**
   * Enqueue a task for execution.
   *
   * Returns a promise that resolves when the task completes.
   * The task will wait in its lane's queue until it can run.
   */
  enqueue<T>(params: {
    execute: () => Promise<T>;
    lane?: string;
    priority?: TaskPriority;
    layer?: Layer;
    thoughtId?: string;
    queueTimeoutMs?: number;
  }): Promise<T> {
    if (this.globalDraining) {
      return Promise.reject(new Error("Queue is draining — not accepting new tasks"));
    }

    const lane = params.lane ?? DEFAULT_LANE;
    const priority = params.priority ?? (params.layer ? LAYER_PRIORITY[params.layer] : "normal");
    const id = `task_${++this.taskCounter}`;

    const task: QueueTask<T> = {
      id,
      execute: params.execute,
      priority,
      lane,
      thoughtId: params.thoughtId,
      layer: params.layer,
      enqueuedAt: Date.now(),
      queueTimeoutMs: params.queueTimeoutMs ?? DEFAULT_QUEUE_TIMEOUT_MS,
      cyclesWaited: 0,
    };

    const state = this.getLaneState(lane);

    return new Promise<T>((resolve, reject) => {
      const entry: QueueEntry<T> = {
        task: task as QueueTask,
        resolve: resolve as (value: unknown) => void,
        reject,
      };

      // Insert in priority order
      this.insertByPriority(state, entry);
      this.processLane(lane);
    });
  }

  /**
   * Get queue statistics.
   */
  stats(): QueueStats {
    let totalQueued = 0;
    let totalActive = 0;
    let totalProcessed = 0;
    let totalWaitMs = 0;
    const laneStats: QueueStats["lanes"] = {};

    for (const [name, state] of this.lanes) {
      totalQueued += state.queue.length;
      totalActive += state.active;
      totalProcessed += state.totalProcessed;
      totalWaitMs += state.totalWaitMs;
      laneStats[name] = {
        queued: state.queue.length,
        active: state.active,
        processed: state.totalProcessed,
      };
    }

    return {
      queued: totalQueued,
      active: totalActive,
      totalProcessed,
      avgWaitMs: totalProcessed > 0 ? Math.round(totalWaitMs / totalProcessed) : 0,
      lanes: laneStats,
      draining: this.globalDraining,
    };
  }

  /**
   * Set max concurrent tasks for a lane.
   */
  setLaneConcurrency(lane: string, max: number): void {
    const state = this.getLaneState(lane);
    state.maxConcurrent = Math.max(1, max);
  }

  /**
   * Enter drain mode — stop accepting new tasks, finish running ones.
   * Returns a promise that resolves when all running tasks complete.
   */
  async drainAll(): Promise<void> {
    this.globalDraining = true;

    // Wait for all active tasks to complete
    const promises: Promise<void>[] = [];
    for (const state of this.lanes.values()) {
      state.draining = true;
      // Reject all queued (waiting) tasks
      for (const entry of state.queue) {
        entry.reject(new Error("Queue drained — task cancelled"));
      }
      state.queue = [];

      // Wait for active tasks
      if (state.active > 0) {
        promises.push(
          new Promise<void>((resolve) => {
            const check = () => {
              if (state.active === 0) {
                resolve();
              } else {
                setTimeout(check, 50);
              }
            };
            check();
          }),
        );
      }
    }

    await Promise.all(promises);
  }

  /**
   * Reset queue (for tests).
   */
  reset(): void {
    for (const state of this.lanes.values()) {
      for (const entry of state.queue) {
        entry.reject(new Error("Queue reset"));
      }
    }
    this.lanes.clear();
    this.globalDraining = false;
    this.taskCounter = 0;
  }

  // ─── PRIVATE ───────────────────────────────────────────────

  private getLaneState(lane: string): LaneState {
    const existing = this.lanes.get(lane);
    if (existing) return existing;

    const state: LaneState = {
      name: lane,
      queue: [],
      active: 0,
      maxConcurrent: DEFAULT_MAX_CONCURRENT,
      draining: false,
      totalProcessed: 0,
      totalWaitMs: 0,
    };
    this.lanes.set(lane, state);
    return state;
  }

  private insertByPriority(state: LaneState, entry: QueueEntry): void {
    const taskPriority = PRIORITY_ORDER[entry.task.priority];

    // Find insertion point (stable sort — same priority goes to end)
    let insertIdx = state.queue.length;
    for (let i = 0; i < state.queue.length; i++) {
      const existingPriority = PRIORITY_ORDER[state.queue[i].task.priority];
      if (taskPriority < existingPriority) {
        insertIdx = i;
        break;
      }
    }

    state.queue.splice(insertIdx, 0, entry);
  }

  private drainLane(lane: string): void {
    const state = this.getLaneState(lane);
    if (state.draining) return;

    while (state.active < state.maxConcurrent && state.queue.length > 0) {
      // Promote starved tasks
      this.promoteStarvedTasks(state);

      // Check queue timeouts
      this.rejectTimedOutTasks(state);

      if (state.queue.length === 0) break;

      const entry = state.queue.shift()!;
      const waitMs = Date.now() - entry.task.enqueuedAt;
      state.totalWaitMs += waitMs;
      state.active++;

      entry.task.execute()
        .then((result) => {
          entry.resolve(result);
        })
        .catch((err) => {
          entry.reject(err);
        })
        .finally(() => {
          state.active--;
          state.totalProcessed++;
          this.drainLane(lane);
        });
    }
  }

  // Trigger lane processing
  private processLane(lane: string): void {
    this.drainLane(lane);
  }

  /**
   * Promote low-priority tasks that have waited too long.
   * Starvation prevention.
   * OpenClaw: no starvation prevention.
   */
  private promoteStarvedTasks(state: LaneState): void {
    for (const entry of state.queue) {
      entry.task.cyclesWaited++;
      if (entry.task.cyclesWaited >= STARVATION_PROMOTE_AFTER) {
        const current = PRIORITY_ORDER[entry.task.priority];
        if (current > 0) { // don't promote beyond critical
          const newPriority = Object.entries(PRIORITY_ORDER)
            .find(([, v]) => v === current - 1)?.[0] as TaskPriority | undefined;
          if (newPriority) {
            entry.task.priority = newPriority;
            entry.task.cyclesWaited = 0;
          }
        }
      }
    }
  }

  /**
   * Reject tasks that have been queued longer than their timeout.
   */
  private rejectTimedOutTasks(state: LaneState): void {
    const now = Date.now();
    const timedOut: QueueEntry[] = [];
    const kept: QueueEntry[] = [];

    for (const entry of state.queue) {
      const waited = now - entry.task.enqueuedAt;
      if (entry.task.queueTimeoutMs && waited > entry.task.queueTimeoutMs) {
        timedOut.push(entry);
      } else {
        kept.push(entry);
      }
    }

    state.queue = kept;
    for (const entry of timedOut) {
      entry.reject(new Error(`Task ${entry.task.id} timed out after ${Date.now() - entry.task.enqueuedAt}ms in queue`));
    }
  }
}
