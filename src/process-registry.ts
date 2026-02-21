/**
 * FOREMAN — Process Registry
 *
 * Full lifecycle tracking for background shell processes.
 *
 * OpenClaw's bash-process-registry.ts: Global Map-based registry with
 * session tracking, output drain, TTL-based pruning, finished session
 * archival. But tightly coupled to OpenClaw's agent infrastructure.
 *
 * Foreman's Process Registry — 8 capabilities that EXCEED OpenClaw:
 *
 * 1. THOUGHT-AWARE SESSIONS: Each process is tied to a thought ID and layer.
 *    Worker starts a build → thought_042 owns it. Kill the thought → kill its processes.
 *    OpenClaw: sessions are tied to agent scope keys, not thought chains.
 *
 * 2. OUTPUT STREAMING WITH RING BUFFER: Pending output stored in a ring buffer
 *    with configurable cap. poll() drains only new output since last poll.
 *    OpenClaw: separate pending arrays for stdout/stderr, manual drain.
 *
 * 3. FINISHED SESSION ARCHIVE: Completed processes kept with full output
 *    for post-mortem analysis. TTL-based auto-pruning (30min default).
 *    OpenClaw: same concept, similar implementation.
 *
 * 4. PROCESS LIFECYCLE EVENTS: onExit callback for each session.
 *    Worker can register "when build finishes, run tests".
 *    OpenClaw: notifyOnExit flag but no callback chain.
 *
 * 5. LAYER-SCOPED QUERIES: List/kill processes by layer.
 *    "Kill all researcher processes" — when strategy changes.
 *    OpenClaw: no layer/scope-based filtering.
 *
 * 6. OUTPUT TAIL: Always-available last N chars of output for quick status.
 *    OpenClaw: same concept.
 *
 * 7. PROCESS STATS: Duration, output size, exit reason tracking.
 *    OpenClaw: partial (startedAt/endedAt but no structured stats).
 *
 * 8. SIGNAL BRIDGE: Parent SIGTERM/SIGINT forwarded to all registered
 *    child processes. No orphans on Foreman shutdown.
 *    OpenClaw: separate child-process-bridge.ts per child, not registry-wide.
 */

import type { Layer } from "./types.js";

// ─── TYPES ───────────────────────────────────────────────────

export type ProcessStatus = "running" | "completed" | "failed" | "killed" | "timeout";

export interface ProcessSession {
  /** Unique session ID */
  id: string;
  /** Shell command that was executed */
  command: string;
  /** Thought that owns this process */
  thoughtId?: string;
  /** Layer that spawned this process */
  layer?: Layer;
  /** Chain ID for cross-reference */
  chainId?: string;
  /** Process ID (OS-level) */
  pid?: number;
  /** When the process started */
  startedAt: number;
  /** Working directory */
  cwd?: string;
  /** Current status */
  status: ProcessStatus;
  /** Whether this process was backgrounded (detached from caller) */
  backgrounded: boolean;

  // ── Output tracking ──
  /** Aggregated stdout (capped) */
  stdout: string;
  /** Aggregated stderr (capped) */
  stderr: string;
  /** Total bytes received (before truncation) */
  totalOutputBytes: number;
  /** Whether output was truncated */
  truncated: boolean;
  /** Last N chars for quick status */
  tail: string;

  // ── Pending output (not yet polled) ──
  /** New stdout since last poll */
  pendingStdout: string;
  /** New stderr since last poll */
  pendingStderr: string;

  // ── Exit info ──
  exitCode?: number | null;
  exitSignal?: NodeJS.Signals | number | null;

  // ── Callbacks ──
  onExit?: (session: FinishedSession) => void;
}

export interface FinishedSession {
  id: string;
  command: string;
  thoughtId?: string;
  layer?: Layer;
  chainId?: string;
  pid?: number;
  startedAt: number;
  endedAt: number;
  cwd?: string;
  status: ProcessStatus;
  exitCode?: number | null;
  exitSignal?: NodeJS.Signals | number | null;
  stdout: string;
  stderr: string;
  tail: string;
  truncated: boolean;
  totalOutputBytes: number;
  durationMs: number;
}

export interface ProcessStats {
  running: number;
  finished: number;
  totalSpawned: number;
  byLayer: Record<string, number>;
  byStatus: Record<string, number>;
}

export interface PollResult {
  stdout: string;
  stderr: string;
  status: ProcessStatus;
  exitCode?: number | null;
}

// ─── CONSTANTS ───────────────────────────────────────────────

const DEFAULT_MAX_OUTPUT = 200_000;
const DEFAULT_PENDING_CAP = 30_000;
const DEFAULT_TAIL_SIZE = 2_000;
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MIN_TTL_MS = 60 * 1000;
const MAX_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

// ─── PROCESS REGISTRY ────────────────────────────────────────

export class ProcessRegistry {
  private running = new Map<string, ProcessSession>();
  private finished = new Map<string, FinishedSession>();
  private sweeper: ReturnType<typeof setInterval> | null = null;
  private ttlMs: number;
  private totalSpawned = 0;
  private signalHandlers: Array<() => void> = [];
  private bridgeAttached = false;

  constructor(options?: { ttlMs?: number }) {
    this.ttlMs = clampTtl(options?.ttlMs);
  }

  // ─── SESSION LIFECYCLE ─────────────────────────────────────

  /**
   * Register a new process session.
   */
  register(params: {
    id: string;
    command: string;
    pid?: number;
    cwd?: string;
    thoughtId?: string;
    layer?: Layer;
    chainId?: string;
    onExit?: (session: FinishedSession) => void;
  }): ProcessSession {
    const session: ProcessSession = {
      id: params.id,
      command: params.command,
      pid: params.pid,
      cwd: params.cwd,
      thoughtId: params.thoughtId,
      layer: params.layer,
      chainId: params.chainId,
      startedAt: Date.now(),
      status: "running",
      backgrounded: false,
      stdout: "",
      stderr: "",
      totalOutputBytes: 0,
      truncated: false,
      tail: "",
      pendingStdout: "",
      pendingStderr: "",
      onExit: params.onExit,
    };

    this.running.set(params.id, session);
    this.totalSpawned++;
    this.startSweeper();
    return session;
  }

  /**
   * Append output to a running session.
   */
  appendOutput(id: string, stream: "stdout" | "stderr", chunk: string): void {
    const session = this.running.get(id);
    if (!session) return;

    session.totalOutputBytes += chunk.length;

    // Aggregate (capped)
    if (stream === "stdout") {
      session.stdout = trimWithCap(session.stdout + chunk, DEFAULT_MAX_OUTPUT);
      session.pendingStdout = trimWithCap(session.pendingStdout + chunk, DEFAULT_PENDING_CAP);
    } else {
      session.stderr = trimWithCap(session.stderr + chunk, DEFAULT_MAX_OUTPUT);
      session.pendingStderr = trimWithCap(session.pendingStderr + chunk, DEFAULT_PENDING_CAP);
    }

    session.truncated = session.totalOutputBytes > DEFAULT_MAX_OUTPUT;
    session.tail = tail(session.stdout + session.stderr, DEFAULT_TAIL_SIZE);
  }

  /**
   * Poll for new output since last poll.
   * Drains pending buffers.
   */
  poll(id: string): PollResult | null {
    // Check running first
    const running = this.running.get(id);
    if (running) {
      const result: PollResult = {
        stdout: running.pendingStdout,
        stderr: running.pendingStderr,
        status: running.status,
        exitCode: running.exitCode,
      };
      running.pendingStdout = "";
      running.pendingStderr = "";
      return result;
    }

    // Check finished
    const done = this.finished.get(id);
    if (done) {
      return {
        stdout: "",
        stderr: "",
        status: done.status,
        exitCode: done.exitCode,
      };
    }

    return null;
  }

  /**
   * Mark a session as backgrounded (detached from caller).
   */
  background(id: string): void {
    const session = this.running.get(id);
    if (session) {
      session.backgrounded = true;
    }
  }

  /**
   * Mark a session as exited.
   */
  markExited(
    id: string,
    exitCode: number | null,
    exitSignal: NodeJS.Signals | number | null,
    status?: ProcessStatus,
  ): FinishedSession | null {
    const session = this.running.get(id);
    if (!session) return null;

    const resolvedStatus = status ?? (exitCode === 0 ? "completed" : "failed");
    session.status = resolvedStatus;
    session.exitCode = exitCode;
    session.exitSignal = exitSignal;
    session.tail = tail(session.stdout + session.stderr, DEFAULT_TAIL_SIZE);

    const finishedSession = this.moveToFinished(session);

    // Fire onExit callback
    if (session.onExit && finishedSession) {
      try {
        session.onExit(finishedSession);
      } catch { /* don't let callback errors crash the registry */ }
    }

    return finishedSession;
  }

  // ─── QUERIES ───────────────────────────────────────────────

  /**
   * Get a running session by ID.
   */
  get(id: string): ProcessSession | null {
    return this.running.get(id) ?? null;
  }

  /**
   * Get a finished session by ID.
   */
  getFinished(id: string): FinishedSession | null {
    return this.finished.get(id) ?? null;
  }

  /**
   * List all running sessions.
   */
  listRunning(): ProcessSession[] {
    return Array.from(this.running.values());
  }

  /**
   * List running sessions filtered by layer.
   * OpenClaw: no layer-based filtering.
   */
  listByLayer(layer: Layer): ProcessSession[] {
    return Array.from(this.running.values()).filter(s => s.layer === layer);
  }

  /**
   * List running sessions filtered by thought ID.
   */
  listByThought(thoughtId: string): ProcessSession[] {
    return Array.from(this.running.values()).filter(s => s.thoughtId === thoughtId);
  }

  /**
   * List running sessions filtered by chain ID.
   */
  listByChain(chainId: string): ProcessSession[] {
    return Array.from(this.running.values()).filter(s => s.chainId === chainId);
  }

  /**
   * List all finished sessions.
   */
  listFinished(): FinishedSession[] {
    return Array.from(this.finished.values());
  }

  /**
   * Kill a specific running session.
   */
  kill(id: string, signal: NodeJS.Signals = "SIGTERM"): boolean {
    const session = this.running.get(id);
    if (!session || !session.pid) return false;

    try {
      // Kill process group (-pid)
      process.kill(-session.pid, signal);
    } catch {
      try {
        process.kill(session.pid, signal);
      } catch { /* already dead */ }
    }

    this.markExited(id, null, signal, "killed");
    return true;
  }

  /**
   * Kill all processes owned by a thought.
   * When a thought is abandoned/rolled back, its processes must die.
   * OpenClaw: no thought-scoped kill.
   */
  killByThought(thoughtId: string, signal: NodeJS.Signals = "SIGTERM"): number {
    let count = 0;
    for (const session of this.running.values()) {
      if (session.thoughtId === thoughtId) {
        this.kill(session.id, signal);
        count++;
      }
    }
    return count;
  }

  /**
   * Kill all processes owned by a layer.
   * When strategy changes, kill all researcher processes.
   * OpenClaw: no layer-scoped kill.
   */
  killByLayer(layer: Layer, signal: NodeJS.Signals = "SIGTERM"): number {
    let count = 0;
    for (const session of this.running.values()) {
      if (session.layer === layer) {
        this.kill(session.id, signal);
        count++;
      }
    }
    return count;
  }

  /**
   * Kill ALL running processes.
   */
  killAll(signal: NodeJS.Signals = "SIGTERM"): number {
    let count = 0;
    for (const session of this.running.values()) {
      this.kill(session.id, signal);
      count++;
    }
    return count;
  }

  // ─── STATS ─────────────────────────────────────────────────

  /**
   * Get registry statistics.
   */
  stats(): ProcessStats {
    const byLayer: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const session of this.running.values()) {
      const layer = session.layer ?? "unknown";
      byLayer[layer] = (byLayer[layer] ?? 0) + 1;
      byStatus[session.status] = (byStatus[session.status] ?? 0) + 1;
    }
    for (const session of this.finished.values()) {
      byStatus[session.status] = (byStatus[session.status] ?? 0) + 1;
    }

    return {
      running: this.running.size,
      finished: this.finished.size,
      totalSpawned: this.totalSpawned,
      byLayer,
      byStatus,
    };
  }

  // ─── SIGNAL BRIDGE ─────────────────────────────────────────

  /**
   * Attach signal bridge — forwards SIGTERM/SIGINT to all running processes.
   * Called once at startup. Prevents orphaned child processes on Foreman exit.
   *
   * OpenClaw: per-child bridge via attachChildProcessBridge().
   * Foreman: registry-wide bridge — one handler covers all children.
   */
  attachSignalBridge(): void {
    if (this.bridgeAttached) return;
    this.bridgeAttached = true;

    const signals: NodeJS.Signals[] = process.platform === "win32"
      ? ["SIGTERM", "SIGINT"]
      : ["SIGTERM", "SIGINT", "SIGHUP", "SIGQUIT"];

    for (const signal of signals) {
      const handler = () => {
        this.killAll(signal);
      };
      try {
        process.on(signal, handler);
        this.signalHandlers.push(() => {
          try { process.off(signal, handler); } catch { /* ignore */ }
        });
      } catch { /* unsupported signal */ }
    }
  }

  /**
   * Detach signal bridge.
   */
  detachSignalBridge(): void {
    for (const cleanup of this.signalHandlers) {
      cleanup();
    }
    this.signalHandlers = [];
    this.bridgeAttached = false;
  }

  // ─── CLEANUP ───────────────────────────────────────────────

  /**
   * Clear all finished sessions.
   */
  clearFinished(): void {
    this.finished.clear();
  }

  /**
   * Reset everything (for tests).
   */
  reset(): void {
    this.running.clear();
    this.finished.clear();
    this.totalSpawned = 0;
    this.stopSweeper();
    this.detachSignalBridge();
  }

  // ─── PRIVATE ───────────────────────────────────────────────

  private moveToFinished(session: ProcessSession): FinishedSession {
    this.running.delete(session.id);
    const finished: FinishedSession = {
      id: session.id,
      command: session.command,
      thoughtId: session.thoughtId,
      layer: session.layer,
      chainId: session.chainId,
      pid: session.pid,
      startedAt: session.startedAt,
      endedAt: Date.now(),
      cwd: session.cwd,
      status: session.status,
      exitCode: session.exitCode,
      exitSignal: session.exitSignal,
      stdout: session.stdout,
      stderr: session.stderr,
      tail: session.tail,
      truncated: session.truncated,
      totalOutputBytes: session.totalOutputBytes,
      durationMs: Date.now() - session.startedAt,
    };
    this.finished.set(session.id, finished);
    return finished;
  }

  private pruneFinished(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, session] of this.finished) {
      if (session.endedAt < cutoff) {
        this.finished.delete(id);
      }
    }
  }

  private startSweeper(): void {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => this.pruneFinished(), Math.max(30_000, this.ttlMs / 6));
    if (this.sweeper && typeof this.sweeper === "object" && "unref" in this.sweeper) {
      (this.sweeper as NodeJS.Timeout).unref();
    }
  }

  private stopSweeper(): void {
    if (!this.sweeper) return;
    clearInterval(this.sweeper);
    this.sweeper = null;
  }
}

// ─── UTILITIES ───────────────────────────────────────────────

function tail(text: string, max: number = DEFAULT_TAIL_SIZE): string {
  if (text.length <= max) return text;
  return text.slice(text.length - max);
}

function trimWithCap(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(text.length - max);
}

function clampTtl(value?: number): number {
  if (!value || Number.isNaN(value)) return DEFAULT_TTL_MS;
  return Math.min(Math.max(value, MIN_TTL_MS), MAX_TTL_MS);
}

/**
 * Generate a unique session ID.
 */
export function createSessionId(): string {
  return `proc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
