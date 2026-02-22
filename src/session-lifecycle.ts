/**
 * FOREMAN — Session Lifecycle Engine
 *
 * Advanced session management with lifecycle hooks,
 * persistence, isolation, and context propagation.
 *
 * OpenClaw'dan alınan: session-slug, session-file-repair, session management
 * Foreman farkı: Forge-pipeline aware, team session support, session branching
 *
 * Capabilities:
 * - Named sessions with human-readable slugs
 * - Session lifecycle (create → active → idle → expired → archived)
 * - Session branching (fork a session to try something different)
 * - Session context (carry state between sessions)
 * - Session persistence (survives restarts)
 * - Session isolation (separate state per session)
 * - Session limits (max concurrent, max idle time)
 * - Session events (hooks for lifecycle transitions)
 * - Team sessions (group of related sessions)
 * - Session search (find sessions by content/label)
 */

import { EventEmitter } from "node:events";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

// ─── TYPES ───────────────────────────────────────────────────

export interface SessionState {
  id: string;
  slug: string;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  parentId?: string;
  teamId?: string;
  context: SessionContext;
  metadata: Record<string, unknown>;
  messageCount: number;
  tokenCount: number;
}

export type SessionStatus = "active" | "idle" | "paused" | "expired" | "archived" | "error";

export interface SessionContext {
  task?: string;
  chainId?: string;
  phase?: string;
  workDir?: string;
  model?: string;
  identity?: string;
  memory: Record<string, string>;
  files: string[];
}

export interface TeamSession {
  id: string;
  name: string;
  sessionIds: string[];
  createdAt: number;
  strategy: "parallel" | "sequential" | "pipeline";
  status: "active" | "completed" | "failed";
}

export interface SessionConfig {
  maxConcurrent: number;
  maxIdleMs: number;
  maxLifetimeMs: number;
  persistDir: string;
  autoSaveIntervalMs: number;
}

const DEFAULT_CONFIG: SessionConfig = {
  maxConcurrent: 10,
  maxIdleMs: 30 * 60_000, // 30 minutes
  maxLifetimeMs: 8 * 3_600_000, // 8 hours
  persistDir: ".foreman/sessions",
  autoSaveIntervalMs: 60_000, // 1 minute
};

// ─── SLUG GENERATOR ──────────────────────────────────────────

const ADJECTIVES = [
  "swift", "bright", "calm", "deep", "eager", "fair", "grand", "keen",
  "live", "mild", "neat", "pure", "quick", "rare", "safe", "true",
  "warm", "wise", "bold", "cool", "dark", "fast", "gold", "high",
  "iron", "jade", "kind", "loud", "mute", "nova", "open", "pale",
  "rich", "silk", "tall", "vast", "wild", "zero", "blue", "gray",
];

const NOUNS = [
  "arc", "bay", "cove", "dawn", "edge", "flare", "gate", "hawk",
  "isle", "jade", "kite", "lake", "mesa", "nest", "oak", "peak",
  "quay", "reef", "sage", "tide", "vale", "wave", "apex", "bolt",
  "core", "dusk", "echo", "frost", "glen", "haze", "ivy", "jet",
  "knot", "lynx", "mist", "node", "orbit", "pine", "ridge", "star",
];

function generateSlug(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}

// ─── SESSION LIFECYCLE ENGINE ────────────────────────────────

export class SessionLifecycle extends EventEmitter {
  private sessions = new Map<string, SessionState>();
  private teams = new Map<string, TeamSession>();
  private config: SessionConfig;
  private projectRoot: string;
  private autoSaveTimer?: ReturnType<typeof setInterval>;

  constructor(projectRoot: string, config?: Partial<SessionConfig>) {
    super();
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadAll();
    this.startAutoSave();
  }

  /**
   * Create a new session.
   */
  create(options?: {
    slug?: string;
    task?: string;
    parentId?: string;
    teamId?: string;
    workDir?: string;
    model?: string;
    metadata?: Record<string, unknown>;
  }): SessionState {
    // Check concurrent limit
    const activeSessions = this.list({ status: "active" });
    if (activeSessions.length >= this.config.maxConcurrent) {
      // Expire oldest idle session
      const idle = this.list({ status: "idle" }).sort((a, b) => a.updatedAt - b.updatedAt);
      if (idle.length > 0) {
        this.transition(idle[0].id, "expired");
      } else {
        throw new Error(`Max concurrent sessions (${this.config.maxConcurrent}) reached`);
      }
    }

    const session: SessionState = {
      id: randomUUID(),
      slug: options?.slug ?? generateSlug(),
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentId: options?.parentId,
      teamId: options?.teamId,
      context: {
        task: options?.task,
        workDir: options?.workDir,
        model: options?.model,
        memory: {},
        files: [],
      },
      metadata: options?.metadata ?? {},
      messageCount: 0,
      tokenCount: 0,
    };

    this.sessions.set(session.id, session);
    this.emit("created", session);
    this.save(session);
    return session;
  }

  /**
   * Get a session by ID or slug.
   */
  get(idOrSlug: string): SessionState | undefined {
    return this.sessions.get(idOrSlug) ??
      [...this.sessions.values()].find(s => s.slug === idOrSlug);
  }

  /**
   * List sessions with optional filters.
   */
  list(filter?: {
    status?: SessionStatus;
    teamId?: string;
    parentId?: string;
  }): SessionState[] {
    let result = [...this.sessions.values()];
    if (filter?.status) result = result.filter(s => s.status === filter.status);
    if (filter?.teamId) result = result.filter(s => s.teamId === filter.teamId);
    if (filter?.parentId) result = result.filter(s => s.parentId === filter.parentId);
    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Transition session to a new status.
   */
  transition(sessionId: string, newStatus: SessionStatus): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const oldStatus = session.status;
    session.status = newStatus;
    session.updatedAt = Date.now();

    if (newStatus === "expired" || newStatus === "archived") {
      session.expiresAt = Date.now();
    }

    this.emit("transition", { session, from: oldStatus, to: newStatus });
    this.save(session);
    return true;
  }

  /**
   * Update session activity (resets idle timer).
   */
  touch(sessionId: string, tokens?: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.updatedAt = Date.now();
    session.messageCount++;
    if (tokens) session.tokenCount += tokens;

    if (session.status === "idle") {
      session.status = "active";
    }

    this.save(session);
  }

  /**
   * Set session context.
   */
  setContext(sessionId: string, context: Partial<SessionContext>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    Object.assign(session.context, context);
    session.updatedAt = Date.now();
    this.save(session);
  }

  /**
   * Set session memory key.
   */
  setMemory(sessionId: string, key: string, value: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.context.memory[key] = value;
    session.updatedAt = Date.now();
    this.save(session);
  }

  /**
   * Fork a session (branch off to try something different).
   */
  fork(sessionId: string, options?: { slug?: string; task?: string }): SessionState | null {
    const parent = this.sessions.get(sessionId);
    if (!parent) return null;

    return this.create({
      slug: options?.slug,
      task: options?.task ?? parent.context.task,
      parentId: sessionId,
      teamId: parent.teamId,
      workDir: parent.context.workDir,
      model: parent.context.model,
      metadata: { ...parent.metadata, forkedFrom: sessionId },
    });
  }

  /**
   * Create a team of sessions.
   */
  createTeam(name: string, strategy: TeamSession["strategy"]): TeamSession {
    const team: TeamSession = {
      id: randomUUID(),
      name,
      sessionIds: [],
      createdAt: Date.now(),
      strategy,
      status: "active",
    };
    this.teams.set(team.id, team);
    return team;
  }

  /**
   * Add a session to a team.
   */
  addToTeam(teamId: string, sessionId: string): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;

    if (!team.sessionIds.includes(sessionId)) {
      team.sessionIds.push(sessionId);
    }

    const session = this.sessions.get(sessionId);
    if (session) session.teamId = teamId;

    return true;
  }

  /**
   * Search sessions by content.
   */
  search(query: string): SessionState[] {
    const q = query.toLowerCase();
    return [...this.sessions.values()].filter(s =>
      s.slug.includes(q) ||
      (s.context.task?.toLowerCase().includes(q) ?? false) ||
      Object.values(s.context.memory).some(v => v.toLowerCase().includes(q)),
    );
  }

  /**
   * Clean up expired sessions.
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      // Expire idle sessions
      if (session.status === "active" && now - session.updatedAt > this.config.maxIdleMs) {
        this.transition(id, "idle");
      }

      // Expire old idle sessions
      if (session.status === "idle" && now - session.updatedAt > this.config.maxIdleMs * 2) {
        this.transition(id, "expired");
      }

      // Archive old expired sessions
      if (session.status === "expired" && now - session.updatedAt > this.config.maxLifetimeMs) {
        this.transition(id, "archived");
        cleaned++;
      }

      // Lifetime limit
      if (now - session.createdAt > this.config.maxLifetimeMs && session.status !== "archived") {
        this.transition(id, "expired");
      }
    }

    return cleaned;
  }

  /**
   * Get stats.
   */
  getStats(): {
    total: number;
    active: number;
    idle: number;
    expired: number;
    archived: number;
    totalTokens: number;
    totalMessages: number;
    teams: number;
  } {
    const all = [...this.sessions.values()];
    return {
      total: all.length,
      active: all.filter(s => s.status === "active").length,
      idle: all.filter(s => s.status === "idle").length,
      expired: all.filter(s => s.status === "expired").length,
      archived: all.filter(s => s.status === "archived").length,
      totalTokens: all.reduce((sum, s) => sum + s.tokenCount, 0),
      totalMessages: all.reduce((sum, s) => sum + s.messageCount, 0),
      teams: this.teams.size,
    };
  }

  /**
   * Shutdown — save all sessions, clear timers.
   */
  shutdown(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
    for (const session of this.sessions.values()) {
      this.save(session);
    }
  }

  // ─── PERSISTENCE ────────────────────────────────────────

  private save(session: SessionState): void {
    try {
      const dir = join(this.projectRoot, this.config.persistDir);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const path = join(dir, `${session.slug}.json`);
      writeFileSync(path, JSON.stringify(session, null, 2), "utf-8");
    } catch { /* best-effort */ }
  }

  private loadAll(): void {
    try {
      const dir = join(this.projectRoot, this.config.persistDir);
      if (!existsSync(dir)) return;

      const files = readdirSync(dir).filter(f => f.endsWith(".json"));
      for (const file of files) {
        try {
          const content = readFileSync(join(dir, file), "utf-8");
          const session = JSON.parse(content) as SessionState;
          // Only load recent sessions
          if (Date.now() - session.updatedAt < this.config.maxLifetimeMs) {
            this.sessions.set(session.id, session);
          }
        } catch { /* skip corrupt files */ }
      }
    } catch { /* no sessions dir */ }
  }

  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(() => {
      for (const session of this.sessions.values()) {
        if (session.status === "active" || session.status === "idle") {
          this.save(session);
        }
      }
    }, this.config.autoSaveIntervalMs);
    this.autoSaveTimer.unref();
  }
}
