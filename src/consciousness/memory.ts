/**
 * FOREMAN — Consciousness Memory
 *
 * Persistent "diary" for the consciousness loop.
 * Records every tick's observations, decisions, and actions.
 *
 * Features:
 * - Circular buffer: keeps last N ticks (default 288 = 24 hours at 5min intervals)
 * - Pattern detection: identifies recurring issues
 * - Persisted to disk as JSON
 * - Queryable: "what happened in the last hour?", "how many times did X happen?"
 *
 * Storage format:
 *   ~/.foreman/consciousness/thoughts.json — ThoughtRecord[]
 *   ~/.foreman/consciousness/state.json — ThinkEngine state (cooldowns, counters)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ThoughtRecord, CooldownEntry } from "./types.js";

// ─── CONSCIOUSNESS MEMORY ────────────────────────────────────

export class ConsciousnessMemory {
  private thoughts: ThoughtRecord[] = [];
  private readonly thoughtsPath: string;
  private readonly statePath: string;
  private readonly maxThoughts: number;

  /**
   * @param baseDir - Directory to store consciousness files (e.g., ~/.foreman/consciousness)
   * @param maxThoughts - Maximum number of thoughts to keep (default: 288 = 24h at 5min intervals)
   */
  constructor(baseDir: string, maxThoughts = 288) {
    this.thoughtsPath = join(baseDir, "thoughts.json");
    this.statePath = join(baseDir, "state.json");
    this.maxThoughts = maxThoughts;

    // Ensure directory exists
    const dir = dirname(this.thoughtsPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Load existing thoughts
    this.loadThoughts();
  }

  // ─── THOUGHT RECORDING ────────────────────────────────────

  /**
   * Record a new thought (one tick's results).
   * Automatically trims old thoughts beyond maxThoughts.
   */
  recordThought(thought: ThoughtRecord): void {
    this.thoughts.push(thought);

    // Trim to maxThoughts
    if (this.thoughts.length > this.maxThoughts) {
      this.thoughts = this.thoughts.slice(-this.maxThoughts);
    }

    this.persistThoughts();
  }

  /**
   * Get the last N thoughts.
   */
  getRecentThoughts(count = 10): ThoughtRecord[] {
    return this.thoughts.slice(-count);
  }

  /**
   * Get all thoughts from the last N minutes.
   */
  getThoughtsSince(minutesAgo: number): ThoughtRecord[] {
    const cutoff = Date.now() - minutesAgo * 60 * 1000;
    return this.thoughts.filter(t => t.timestamp >= cutoff);
  }

  /**
   * Get the total number of recorded thoughts.
   */
  get thoughtCount(): number {
    return this.thoughts.length;
  }

  /**
   * Get the current tick number (for the next thought).
   */
  get nextTick(): number {
    if (this.thoughts.length === 0) return 1;
    return this.thoughts[this.thoughts.length - 1].tick + 1;
  }

  // ─── PATTERN DETECTION ────────────────────────────────────

  /**
   * Count how many times a finding key appeared in recent thoughts.
   */
  countFindingOccurrences(key: string, minutesAgo = 60): number {
    const recent = this.getThoughtsSince(minutesAgo);
    let count = 0;
    for (const thought of recent) {
      for (const decision of thought.decisions) {
        if (decision.findingKey === key) count++;
      }
    }
    return count;
  }

  /**
   * Find recurring issues (appeared N+ times in last hour).
   */
  findRecurringIssues(threshold = 3, minutesAgo = 60): Array<{ key: string; count: number }> {
    const counts = new Map<string, number>();
    const recent = this.getThoughtsSince(minutesAgo);

    for (const thought of recent) {
      for (const decision of thought.decisions) {
        if (decision.action !== "log_only") {
          counts.set(decision.findingKey, (counts.get(decision.findingKey) ?? 0) + 1);
        }
      }
    }

    const recurring: Array<{ key: string; count: number }> = [];
    for (const [key, count] of counts) {
      if (count >= threshold) {
        recurring.push({ key, count });
      }
    }

    return recurring.sort((a, b) => b.count - a.count);
  }

  /**
   * Generate a one-line summary of recent consciousness state.
   */
  generateStatusSummary(): string {
    const recent = this.getThoughtsSince(60); // last hour
    if (recent.length === 0) return "Henüz düşünce kaydı yok";

    const totalFindings = recent.reduce((sum, t) => sum + t.decisions.length, 0);
    const notifications = recent.reduce(
      (sum, t) => sum + t.actions.filter(a => a.decision.action === "notify").length,
      0
    );
    const autoFixes = recent.reduce(
      (sum, t) => sum + t.actions.filter(a => a.decision.action === "auto_fix").length,
      0
    );

    const parts: string[] = [
      `${recent.length} tick`,
      `${totalFindings} bulgu`,
    ];
    if (notifications > 0) parts.push(`${notifications} bildirim`);
    if (autoFixes > 0) parts.push(`${autoFixes} otomatik düzeltme`);

    return `Son 1 saat: ${parts.join(", ")}`;
  }

  // ─── THINK STATE PERSISTENCE ──────────────────────────────

  /**
   * Save ThinkEngine state (cooldowns, counters).
   */
  saveThinkState(state: { cooldowns: CooldownEntry[]; todayMessageCount: number; todayDate: string }): void {
    try {
      writeFileSync(this.statePath, JSON.stringify(state, null, 2), "utf-8");
    } catch (err) {
      console.error(`[consciousness-memory] Failed to save state:`, err);
    }
  }

  /**
   * Load ThinkEngine state.
   */
  loadThinkState(): { cooldowns: CooldownEntry[]; todayMessageCount: number; todayDate: string } | null {
    try {
      if (!existsSync(this.statePath)) return null;
      const raw = readFileSync(this.statePath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // ─── PERSISTENCE ──────────────────────────────────────────

  private loadThoughts(): void {
    try {
      if (!existsSync(this.thoughtsPath)) return;
      const raw = readFileSync(this.thoughtsPath, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        this.thoughts = data;
      }
    } catch {
      // Fresh start
      this.thoughts = [];
    }
  }

  private persistThoughts(): void {
    try {
      // Only persist last maxThoughts entries
      const toSave = this.thoughts.slice(-this.maxThoughts);
      writeFileSync(this.thoughtsPath, JSON.stringify(toSave, null, 2), "utf-8");
    } catch (err) {
      console.error(`[consciousness-memory] Failed to persist thoughts:`, err);
    }
  }

  /**
   * Clear all thoughts and state. Use for testing or reset.
   */
  clear(): void {
    this.thoughts = [];
    this.persistThoughts();
    try {
      if (existsSync(this.statePath)) {
        writeFileSync(this.statePath, "{}", "utf-8");
      }
    } catch { /* best-effort */ }
  }
}
