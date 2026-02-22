/**
 * FOREMAN — Multi-Session Engine
 *
 * Session isolation and sub-agent orchestration.
 * Transplanted from OpenClaw's session management, adapted for Foreman.
 *
 * Capabilities:
 * - Named sessions with isolated state
 * - Sub-agent spawning (run tasks in background)
 * - Session history and message tracking
 * - Inter-session messaging
 * - Session lifecycle (create, pause, resume, terminate)
 * - Concurrent session limits
 *
 * Foreman adaptation: Sessions wrap Engine instances.
 * Each session has its own thought chain and tool context.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

// ─── TYPES ───────────────────────────────────────────────────

export type SessionStatus = "idle" | "running" | "paused" | "completed" | "failed" | "terminated";

export interface SessionMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  sessionId: string;
  toolCalls?: Array<{ name: string; args: string }>;
}

export interface SessionInfo {
  id: string;
  label: string;
  status: SessionStatus;
  parentId?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  task?: string;
  model?: string;
  projectRoot: string;
}

export interface SessionConfig {
  /** Maximum concurrent running sessions (default: 3) */
  maxConcurrent: number;
  /** Maximum messages per session before compaction (default: 100) */
  maxMessages: number;
  /** Session timeout in ms (default: 30 min) */
  timeoutMs: number;
  /** Directory for session persistence */
  sessionsDir: string;
}

const DEFAULT_CONFIG: SessionConfig = {
  maxConcurrent: 3,
  maxMessages: 100,
  timeoutMs: 30 * 60 * 1000,
  sessionsDir: "",
};

// ─── SESSION ─────────────────────────────────────────────────

export class Session {
  readonly id: string;
  readonly label: string;
  readonly parentId?: string;
  readonly createdAt: number;
  readonly projectRoot: string;

  status: SessionStatus = "idle";
  updatedAt: number;
  task?: string;
  model?: string;

  private messages: SessionMessage[] = [];
  private persistPath: string;

  constructor(params: {
    id?: string;
    label: string;
    parentId?: string;
    projectRoot: string;
    persistDir: string;
    task?: string;
    model?: string;
  }) {
    this.id = params.id ?? `session_${randomUUID().slice(0, 8)}`;
    this.label = params.label;
    this.parentId = params.parentId;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.projectRoot = params.projectRoot;
    this.task = params.task;
    this.model = params.model;
    this.persistPath = join(params.persistDir, `${this.id}.json`);
  }

  addMessage(role: "user" | "assistant" | "system", content: string, toolCalls?: Array<{ name: string; args: string }>): SessionMessage {
    const msg: SessionMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role,
      content,
      timestamp: Date.now(),
      sessionId: this.id,
      toolCalls,
    };
    this.messages.push(msg);
    this.updatedAt = Date.now();
    return msg;
  }

  getMessages(limit?: number): SessionMessage[] {
    if (limit) return this.messages.slice(-limit);
    return [...this.messages];
  }

  getLastMessages(count: number): SessionMessage[] {
    return this.messages.slice(-count);
  }

  get messageCount(): number {
    return this.messages.length;
  }

  getInfo(): SessionInfo {
    return {
      id: this.id,
      label: this.label,
      status: this.status,
      parentId: this.parentId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      messageCount: this.messages.length,
      task: this.task,
      model: this.model,
      projectRoot: this.projectRoot,
    };
  }

  // ─── PERSISTENCE ──────────────────────────────────────

  persist(): void {
    try {
      const dir = dirname(this.persistPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const data = {
        id: this.id,
        label: this.label,
        parentId: this.parentId,
        status: this.status,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        task: this.task,
        model: this.model,
        projectRoot: this.projectRoot,
        messages: this.messages,
      };
      writeFileSync(this.persistPath, JSON.stringify(data, null, 2), "utf-8");
    } catch { /* best-effort */ }
  }

  static load(filePath: string): Session | null {
    try {
      if (!existsSync(filePath)) return null;
      const raw = readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw);

      const session = new Session({
        id: data.id,
        label: data.label,
        parentId: data.parentId,
        projectRoot: data.projectRoot,
        persistDir: dirname(filePath),
        task: data.task,
        model: data.model,
      });
      session.status = data.status;
      Object.defineProperty(session, "createdAt", { value: data.createdAt });
      session.updatedAt = data.updatedAt;

      if (Array.isArray(data.messages)) {
        for (const msg of data.messages) {
          session.messages.push(msg);
        }
      }

      return session;
    } catch {
      return null;
    }
  }
}

// ─── SESSION MANAGER ─────────────────────────────────────────

export class MultiSessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
  private config: SessionConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(projectRoot: string, config?: Partial<SessionConfig>) {
    super();
    this.config = {
      ...DEFAULT_CONFIG,
      sessionsDir: join(projectRoot, ".foreman", "sessions"),
      ...config,
    };
    this.loadSessions();
    this.startCleanup();
  }

  // ─── SESSION LIFECYCLE ──────────────────────────────────

  /**
   * Create a new session.
   */
  createSession(params: {
    label: string;
    parentId?: string;
    task?: string;
    model?: string;
    projectRoot?: string;
  }): Session {
    const session = new Session({
      label: params.label,
      parentId: params.parentId,
      projectRoot: params.projectRoot ?? this.config.sessionsDir.replace("/.foreman/sessions", ""),
      persistDir: this.config.sessionsDir,
      task: params.task,
      model: params.model,
    });

    this.sessions.set(session.id, session);
    session.persist();
    this.emit("session:created", session.getInfo());
    return session;
  }

  /**
   * Spawn a sub-agent session.
   * Creates a child session linked to parent.
   */
  spawnSubAgent(params: {
    parentSessionId: string;
    task: string;
    label?: string;
    model?: string;
  }): Session | null {
    const parent = this.sessions.get(params.parentSessionId);
    if (!parent) return null;

    // Check concurrency limit
    const running = [...this.sessions.values()].filter(s => s.status === "running");
    if (running.length >= this.config.maxConcurrent) {
      this.emit("session:limit", {
        reason: `Max concurrent sessions (${this.config.maxConcurrent}) reached`,
      });
      return null;
    }

    const session = this.createSession({
      label: params.label ?? `sub-${parent.label}`,
      parentId: parent.id,
      task: params.task,
      model: params.model,
      projectRoot: parent.projectRoot,
    });

    session.status = "running";
    session.persist();
    this.emit("session:spawned", { parentId: parent.id, childId: session.id });
    return session;
  }

  /**
   * Get session by ID.
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session by label.
   */
  getSessionByLabel(label: string): Session | undefined {
    return [...this.sessions.values()].find(s => s.label === label);
  }

  /**
   * List all sessions with optional filters.
   */
  listSessions(filters?: {
    status?: SessionStatus;
    parentId?: string;
    activeMinutes?: number;
  }): SessionInfo[] {
    let sessions = [...this.sessions.values()];

    if (filters?.status) {
      sessions = sessions.filter(s => s.status === filters.status);
    }
    if (filters?.parentId) {
      sessions = sessions.filter(s => s.parentId === filters.parentId);
    }
    if (filters?.activeMinutes) {
      const cutoff = Date.now() - filters.activeMinutes * 60_000;
      sessions = sessions.filter(s => s.updatedAt >= cutoff);
    }

    return sessions
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(s => s.getInfo());
  }

  /**
   * Send a message to a session (inter-session messaging).
   */
  sendMessage(sessionId: string, role: "user" | "system", content: string): SessionMessage | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const msg = session.addMessage(role, content);
    session.persist();
    this.emit("session:message", { sessionId, message: msg });
    return msg;
  }

  /**
   * Get message history for a session.
   */
  getHistory(sessionId: string, limit?: number): SessionMessage[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.getMessages(limit);
  }

  /**
   * Terminate a session.
   */
  terminateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = "terminated";
    session.updatedAt = Date.now();
    session.persist();
    this.emit("session:terminated", session.getInfo());
    return true;
  }

  /**
   * Complete a session (mark as done).
   */
  completeSession(sessionId: string, summary?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = "completed";
    if (summary) {
      session.addMessage("system", `Session completed: ${summary}`);
    }
    session.updatedAt = Date.now();
    session.persist();
    this.emit("session:completed", session.getInfo());
    return true;
  }

  // ─── SUB-AGENT QUERIES ──────────────────────────────────

  /**
   * List child sessions of a parent.
   */
  getSubAgents(parentId: string): SessionInfo[] {
    return this.listSessions({ parentId });
  }

  /**
   * Kill a sub-agent session.
   */
  killSubAgent(sessionId: string): boolean {
    return this.terminateSession(sessionId);
  }

  // ─── CLEANUP ────────────────────────────────────────────

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const session of this.sessions.values()) {
        if (
          session.status === "running" &&
          now - session.updatedAt > this.config.timeoutMs
        ) {
          session.status = "failed";
          session.addMessage("system", "Session timed out");
          session.persist();
          this.emit("session:timeout", session.getInfo());
        }
      }
    }, 60_000);
    this.cleanupInterval.unref();
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // ─── PERSISTENCE ────────────────────────────────────────

  private loadSessions(): void {
    try {
      if (!existsSync(this.config.sessionsDir)) return;
      const files = readdirSync(this.config.sessionsDir)
        .filter(f => f.endsWith(".json"));

      for (const file of files) {
        const session = Session.load(join(this.config.sessionsDir, file));
        if (session) {
          this.sessions.set(session.id, session);
        }
      }
    } catch { /* fresh start */ }
  }

  /** Stats */
  stats(): {
    total: number;
    running: number;
    completed: number;
    failed: number;
  } {
    const sessions = [...this.sessions.values()];
    return {
      total: sessions.length,
      running: sessions.filter(s => s.status === "running").length,
      completed: sessions.filter(s => s.status === "completed").length,
      failed: sessions.filter(s => s.status === "failed").length,
    };
  }
}
