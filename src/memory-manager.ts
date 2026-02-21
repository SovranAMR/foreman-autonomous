/**
 * FOREMAN — Memory Manager
 *
 * Persistently stores learned information and injects it into prompts when needed.
 *
 * Three-tier memory:
 * 1. Hot memory — importance >= 0.8, her prompt'a girer
 * 2. Warm memory — importance >= 0.5, ilgili tag varsa girer
 * 3. Cold memory — importance < 0.5, accessible only via search
 *
 * Her memory dosyaya persist edilir: {projectRoot}/memory/mem_XXX.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { MemoryEntry, MemoryCategory, MemorySource } from "./types.js";

// ─── INPUT TYPES ──────────────────────────────────────────────

export interface CreateMemoryInput {
  projectId?: string;
  category: MemoryCategory;
  content: string;
  source: MemorySource;
  importance?: number;
  tags?: string[];
}

export interface MemoryFilter {
  projectId?: string;
  category?: MemoryCategory;
  tag?: string;
  minImportance?: number;
  includeExpired?: boolean;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
}

// ─── MEMORY MANAGER ──────────────────────────────────────────

export class MemoryManager {
  private readonly memoryDir: string;

  constructor(private readonly projectRoot: string) {
    this.memoryDir = join(projectRoot, "memory");
  }

  /**
   * Create a new memory.
   */
  create(input: CreateMemoryInput): MemoryEntry {
    this.ensureDir();

    const id = this.nextId();
    const entry: MemoryEntry = {
      id,
      projectId: input.projectId ?? "global",
      category: input.category,
      content: input.content,
      source: input.source,
      importance: input.importance ?? 0.5,
      tags: input.tags ?? [],
      useCount: 0,
      createdAt: new Date().toISOString(),
      expired: false,
    };

    this.writeToDisk(entry);
    return entry;
  }

  /**
   * Read memory.
   */
  get(id: string): MemoryEntry | null {
    const filePath = this.filePath(id);
    if (!existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, "utf-8")) as MemoryEntry;
    } catch {
      return null;
    }
  }

  /**
   * Update memory.
   */
  update(id: string, patch: Partial<Omit<MemoryEntry, "id" | "createdAt">>): MemoryEntry {
    const existing = this.get(id);
    if (!existing) throw new Error(`Memory not found: ${id}`);
    const updated = { ...existing, ...patch };
    this.writeToDisk(updated);
    return updated;
  }

  /**
   * Mark memory as "used".
   * useCount increases, lastUsedAt is updated.
   */
  touch(id: string): MemoryEntry {
    const entry = this.get(id);
    if (!entry) throw new Error(`Memory not found: ${id}`);
    entry.useCount++;
    entry.lastUsedAt = new Date().toISOString();
    this.writeToDisk(entry);
    return entry;
  }

  /**
   * Memory'yi sil (soft delete — expired=true).
   */
  expire(id: string): MemoryEntry {
    return this.update(id, { expired: true });
  }

  /**
   * List all memories (with filter).
   */
  list(filter?: MemoryFilter): MemoryEntry[] {
    this.ensureDir();

    const files = readdirSync(this.memoryDir)
      .filter(f => f.startsWith("mem_") && f.endsWith(".json"))
      .sort();

    const entries: MemoryEntry[] = [];
    for (const file of files) {
      try {
        const entry = JSON.parse(readFileSync(join(this.memoryDir, file), "utf-8")) as MemoryEntry;

        if (!filter?.includeExpired && entry.expired) continue;
        if (filter?.projectId && entry.projectId !== filter.projectId && entry.projectId !== "global") continue;
        if (filter?.category && entry.category !== filter.category) continue;
        if (filter?.tag && !entry.tags.includes(filter.tag)) continue;
        if (filter?.minImportance && entry.importance < filter.minImportance) continue;

        entries.push(entry);
      } catch { /* skip */ }
    }

    return entries;
  }

  // ─── CONTEXT BUILDING ──────────────────────────────────────

  /**
   * HOT memory — importance >= 0.8.
   * Added to every prompt. Critical decisions, constraints, preferences.
   */
  getHotMemories(projectId?: string): MemoryEntry[] {
    return this.list({ projectId, minImportance: 0.8 })
      .sort((a, b) => b.importance - a.importance);
  }

  /**
   * WARM memory — by relevant tags.
   * Added to prompt if tag matches.
   */
  getWarmMemories(tags: string[], projectId?: string): MemoryEntry[] {
    const all = this.list({ projectId, minImportance: 0.5 });
    return all.filter(entry =>
      entry.importance < 0.8 && // exclude hot ones
      entry.tags.some(t => tags.includes(t))
    );
  }

  /**
   * Build memory context to add to prompt.
   * Returns hot + warm memories as text.
   */
  buildContextBlock(tags: string[] = [], projectId?: string, maxTokens: number = 2000): string {
    const hot = this.getHotMemories(projectId);
    const warm = this.getWarmMemories(tags, projectId);
    const all = [...hot, ...warm];

    if (all.length === 0) return "";

    // Touch — increment use count
    for (const entry of all) {
      this.touch(entry.id);
    }

    const parts: string[] = ["## Project Memory"];

    for (const entry of all) {
      const prefix = entry.importance >= 0.8 ? "⚠️" : "📌";
      parts.push(`${prefix} [${entry.category}] ${entry.content}`);
    }

    const text = parts.join("\n");
    // Truncate if exceeding token limit
    if (text.length > maxTokens * 4) { // ~4 char/token
      return text.slice(0, maxTokens * 4) + "\n... (truncated)";
    }
    return text;
  }

  /**
   * Basit keyword search.
   * Daha sonra embedding-based semantic search eklenebilir.
   */
  search(query: string, projectId?: string): MemorySearchResult[] {
    const all = this.list({ projectId });
    const queryLower = query.toLowerCase();
    const words = queryLower.split(/\s+/).filter(w => w.length > 2);

    const results: MemorySearchResult[] = [];

    for (const entry of all) {
      const contentLower = entry.content.toLowerCase();
      const tagStr = entry.tags.join(" ").toLowerCase();

      let score = 0;
      for (const word of words) {
        if (contentLower.includes(word)) score += 0.3;
        if (tagStr.includes(word)) score += 0.2;
      }

      // Category bonus
      if (entry.category === "decision" || entry.category === "constraint") score += 0.1;

      // Importance bonus
      score += entry.importance * 0.2;

      // Recency bonus
      if (entry.lastUsedAt) {
        const age = Date.now() - new Date(entry.lastUsedAt).getTime();
        if (age < 3600_000) score += 0.1; // used within the last hour
      }

      if (score > 0.1) {
        results.push({ entry, score: Math.min(score, 1) });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  // ─── BATCH OPERATIONS ──────────────────────────────────────

  /**
   * Extract memory from a thought.
   * Visioner decisions, research findings, worker lessons automatically become memory.
   * Duplicate protection: if same content exists, don't add, update existing.
   */
  extractFromThought(thought: {
    id: string;
    layer: string;
    reasoning: string;
    output: string;
    confidence: number;
    tags?: string[];
  }): MemoryEntry | null {
    // Low confidence → not worth memorizing
    if (thought.confidence < 0.6) return null;

    const categoryMap: Record<string, MemoryCategory> = {
      visioner: "decision",
      strategist: "pattern",
      researcher: "reference",
      worker: "lesson",
    };

    const category = categoryMap[thought.layer] ?? "context";

    // Content: reasoning + output summary
    const content = thought.output.length > 200
      ? thought.output.slice(0, 200) + "..."
      : thought.output;

    const fullContent = `[${thought.layer}] ${content}`;

    // Duplicate protection — update if similar content exists, don't add again
    const existing = this.findSimilar(fullContent);
    if (existing) {
      // Update existing memory's importance (higher confidence → more important)
      const newImportance = Math.max(existing.importance, thought.confidence * 0.8);
      this.update(existing.id, {
        importance: newImportance,
        useCount: existing.useCount + 1,
        lastUsedAt: new Date().toISOString(),
      });
      return existing;
    }

    return this.create({
      category,
      content: fullContent,
      source: { type: "thought", ref: thought.id },
      importance: thought.confidence * 0.8,
      tags: thought.tags ?? [],
    });
  }

  /**
   * Check if similar content exists.
   * Simple: if 70% of the first 80 characters match, consider it similar.
   */
  private findSimilar(content: string): MemoryEntry | null {
    const target = content.toLowerCase().slice(0, 80);
    const all = this.list();

    for (const entry of all) {
      const existing = entry.content.toLowerCase().slice(0, 80);
      if (this.similarity(target, existing) > 0.7) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Simple character similarity ratio (Jaccard-like).
   */
  private similarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Clean up unused memories + importance decay.
   *
   * - Unused for 7+ days and importance < 0.5 → expire
   * - Memories unused for 3+ days have their importance decreased by 5% (decay)
   * - Manual source memories are exempt from decay (user consciously added)
   */
  cleanup(maxAgeDays: number = 7): number {
    const all = this.list({ includeExpired: false });
    const expireCutoff = Date.now() - maxAgeDays * 86400_000;
    const decayCutoff = Date.now() - 3 * 86400_000;
    let cleaned = 0;

    for (const entry of all) {
      const lastUsed = entry.lastUsedAt
        ? new Date(entry.lastUsedAt).getTime()
        : new Date(entry.createdAt).getTime();

      // Expire: low importance + unused for a long time
      if (entry.importance < 0.5 && lastUsed < expireCutoff) {
        this.expire(entry.id);
        cleaned++;
        continue;
      }

      // Decay: unused for 3+ days, if not manual decrease importance by 5%
      if (entry.source.type !== "manual" && lastUsed < decayCutoff && entry.importance > 0.2) {
        const decayed = Math.max(0.1, entry.importance * 0.95);
        if (decayed !== entry.importance) {
          this.update(entry.id, { importance: decayed });
        }
      }
    }

    return cleaned;
  }

  /**
   * Statistics.
   */
  stats(): MemoryStats {
    const all = this.list({ includeExpired: true });
    const active = all.filter(e => !e.expired);
    const byCategory: Record<string, number> = {};
    for (const e of active) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
    }
    return {
      total: all.length,
      active: active.length,
      expired: all.length - active.length,
      byCategory,
      hotCount: active.filter(e => e.importance >= 0.8).length,
      warmCount: active.filter(e => e.importance >= 0.5 && e.importance < 0.8).length,
      coldCount: active.filter(e => e.importance < 0.5).length,
    };
  }

  // ─── PRIVATE ───────────────────────────────────────────────

  private filePath(id: string): string {
    return join(this.memoryDir, `${id}.json`);
  }

  private writeToDisk(entry: MemoryEntry): void {
    writeFileSync(this.filePath(entry.id), JSON.stringify(entry, null, 2), "utf-8");
  }

  private ensureDir(): void {
    if (!existsSync(this.memoryDir)) {
      mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  private nextId(): string {
    this.ensureDir();
    const files = readdirSync(this.memoryDir)
      .filter(f => f.startsWith("mem_") && f.endsWith(".json"));
    if (files.length === 0) return "mem_001";
    const numbers = files.map(f => {
      const match = f.match(/mem_(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });
    return `mem_${(Math.max(...numbers) + 1).toString().padStart(3, "0")}`;
  }
}

export interface MemoryStats {
  total: number;
  active: number;
  expired: number;
  byCategory: Record<string, number>;
  hotCount: number;
  warmCount: number;
  coldCount: number;
}
