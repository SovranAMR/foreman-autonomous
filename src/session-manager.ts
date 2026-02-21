/**
 * FOREMAN — Session Manager
 *
 * Manages work sessions.
 * Summaries of previous sessions are provided as context to new sessions.
 *
 * Her session: {projectRoot}/sessions/ses_XXX.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Session } from "./types.js";

export interface CreateSessionInput {
  projectId: string;
}

export class SessionManager {
  private readonly sessionsDir: string;

  constructor(private readonly projectRoot: string) {
    this.sessionsDir = join(projectRoot, "sessions");
  }

  /**
   * Start a new session.
   */
  start(input: CreateSessionInput): Session {
    this.ensureDir();

    // Close previous active session
    const active = this.getActive();
    if (active) {
      this.end(active.id, "abandoned");
    }

    const id = this.nextId();
    const session: Session = {
      id,
      projectId: input.projectId,
      startedAt: new Date().toISOString(),
      completedTaskIds: [],
      thoughtIds: [],
      memoryIds: [],
      totalTokens: 0,
      status: "active",
    };

    this.writeToDisk(session);
    return session;
  }

  /**
   * Get the active session.
   */
  getActive(): Session | null {
    const all = this.list();
    return all.find(s => s.status === "active") ?? null;
  }

  /**
   * Session'a thought ekle.
   */
  addThought(sessionId: string, thoughtId: string): Session {
    const session = this.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (!session.thoughtIds.includes(thoughtId)) {
      session.thoughtIds.push(thoughtId);
      this.writeToDisk(session);
    }
    return session;
  }

  /**
   * Session'a tamamlanan task ekle.
   */
  addCompletedTask(sessionId: string, taskId: string): Session {
    const session = this.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (!session.completedTaskIds.includes(taskId)) {
      session.completedTaskIds.push(taskId);
      this.writeToDisk(session);
    }
    return session;
  }

  /**
   * Session'a memory ekle.
   */
  addMemory(sessionId: string, memoryId: string): Session {
    const session = this.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (!session.memoryIds.includes(memoryId)) {
      session.memoryIds.push(memoryId);
      this.writeToDisk(session);
    }
    return session;
  }

  /**
   * Token ekle.
   */
  addTokens(sessionId: string, tokens: number): Session {
    const session = this.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.totalTokens += tokens;
    this.writeToDisk(session);
    return session;
  }

  /**
   * End a session.
   */
  end(sessionId: string, status: "completed" | "abandoned" = "completed", summary?: string): Session {
    const session = this.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    session.status = status;
    session.endedAt = new Date().toISOString();
    if (summary) session.summary = summary;
    this.writeToDisk(session);
    return session;
  }

  /**
   * Session oku.
   */
  get(id: string): Session | null {
    const filePath = this.filePath(id);
    if (!existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, "utf-8")) as Session;
    } catch {
      return null;
    }
  }

  /**
   * List all sessions.
   */
  list(): Session[] {
    this.ensureDir();
    const files = readdirSync(this.sessionsDir)
      .filter(f => f.startsWith("ses_") && f.endsWith(".json"))
      .sort();

    return files.map(f => {
      try {
        return JSON.parse(readFileSync(join(this.sessionsDir, f), "utf-8")) as Session;
      } catch {
        return null;
      }
    }).filter((s): s is Session => s !== null);
  }

  /**
   * Get summaries of last N sessions — for cross-session context.
   */
  getRecentSummaries(count: number = 3): string[] {
    const all = this.list()
      .filter(s => s.status === "completed" && s.summary)
      .sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""));

    return all.slice(0, count).map(s => s.summary!);
  }

  /**
   * Build cross-session context text.
   */
  buildSessionContext(count: number = 3): string {
    const summaries = this.getRecentSummaries(count);
    if (summaries.length === 0) return "";

    const parts = ["## Previous Sessions"];
    for (let i = 0; i < summaries.length; i++) {
      parts.push(`\nSession ${i + 1}:\n${summaries[i]}`);
    }
    return parts.join("\n");
  }

  /**
   * Statistics.
   */
  stats(): SessionStats {
    const all = this.list();
    let totalTokens = 0;
    let totalThoughts = 0;
    let totalTasks = 0;

    for (const s of all) {
      totalTokens += s.totalTokens;
      totalThoughts += s.thoughtIds.length;
      totalTasks += s.completedTaskIds.length;
    }

    return {
      total: all.length,
      active: all.filter(s => s.status === "active").length,
      completed: all.filter(s => s.status === "completed").length,
      abandoned: all.filter(s => s.status === "abandoned").length,
      totalTokens,
      totalThoughts,
      totalTasks,
    };
  }

  // ─── PRIVATE ───────────────────────────────────────────────

  private filePath(id: string): string {
    return join(this.sessionsDir, `${id}.json`);
  }

  private writeToDisk(session: Session): void {
    writeFileSync(this.filePath(session.id), JSON.stringify(session, null, 2), "utf-8");
  }

  private ensureDir(): void {
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  private nextId(): string {
    this.ensureDir();
    const files = readdirSync(this.sessionsDir)
      .filter(f => f.startsWith("ses_") && f.endsWith(".json"));
    if (files.length === 0) return "ses_001";
    const numbers = files.map(f => {
      const match = f.match(/ses_(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });
    return `ses_${(Math.max(...numbers) + 1).toString().padStart(3, "0")}`;
  }
}

export interface SessionStats {
  total: number;
  active: number;
  completed: number;
  abandoned: number;
  totalTokens: number;
  totalThoughts: number;
  totalTasks: number;
}
