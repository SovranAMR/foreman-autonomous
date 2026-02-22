/**
 * FOREMAN — Identity Engine
 *
 * Persistent identity for the agent. Reads IDENTITY.md, SOUL.md, USER.md
 * from project root and injects into every LLM call context.
 *
 * OpenClaw'dan alınan: IDENTITY.md + SOUL.md + USER.md workspace files
 * Foreman farkı: Hot-reload, merge with conversation context, per-user profiles
 *
 * Capabilities:
 * - Read IDENTITY.md (who the agent is)
 * - Read SOUL.md (personality, tone, boundaries)
 * - Read USER.md (who the user is, preferences)
 * - Read MEMORY.md (persistent memory)
 * - Hot-reload on file change
 * - Context injection for LLM calls
 * - Per-user profile support (multi-user bots)
 * - Identity evolution (agent can update its own identity)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";

// ─── TYPES ───────────────────────────────────────────────────

export interface AgentIdentity {
  name: string;
  emoji?: string;
  vibe?: string;
  values: string[];
  boundaries: string[];
  raw: string;
}

export interface AgentSoul {
  coreTruths: string[];
  boundaries: string[];
  vibe: string;
  raw: string;
}

export interface UserProfile {
  name: string;
  language?: string;
  timezone?: string;
  communicationStyle?: string;
  preferences: string[];
  redLines: string[];
  raw: string;
}

export interface PersistentMemory {
  entries: MemoryEntry[];
  raw: string;
}

export interface MemoryEntry {
  key: string;
  value: string;
  section?: string;
  updatedAt?: number;
}

export interface IdentityContext {
  identity?: AgentIdentity;
  soul?: AgentSoul;
  user?: UserProfile;
  memory?: PersistentMemory;
  customFiles: Map<string, string>;
}

// ─── IDENTITY ENGINE ─────────────────────────────────────────

export class IdentityEngine {
  private projectRoot: string;
  private cache = new Map<string, { content: string; mtime: number }>();
  private context: IdentityContext;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.context = {
      customFiles: new Map(),
    };
    this.reload();
  }

  /**
   * Full reload — read all identity files from disk.
   */
  reload(): void {
    this.context.identity = this.loadIdentity();
    this.context.soul = this.loadSoul();
    this.context.user = this.loadUser();
    this.context.memory = this.loadMemory();
    this.loadCustomFiles();
  }

  /**
   * Get the full identity context.
   */
  getContext(): IdentityContext {
    this.hotReload();
    return this.context;
  }

  /**
   * Build a system prompt injection from identity files.
   * This gets prepended/appended to LLM system prompts.
   */
  buildContextInjection(): string {
    this.hotReload();
    const parts: string[] = [];

    if (this.context.identity) {
      parts.push(`## Agent Identity\n${this.context.identity.raw}`);
    }

    if (this.context.soul) {
      parts.push(`## Soul & Personality\n${this.context.soul.raw}`);
    }

    if (this.context.user) {
      parts.push(`## User Profile\n${this.context.user.raw}`);
    }

    if (this.context.memory && this.context.memory.raw.length > 0) {
      // Truncate memory to avoid blowing context window
      const memoryText = this.context.memory.raw.length > 4000
        ? this.context.memory.raw.slice(0, 4000) + "\n...(truncated)"
        : this.context.memory.raw;
      parts.push(`## Memory\n${memoryText}`);
    }

    for (const [name, content] of this.context.customFiles) {
      if (content.length > 0 && content.length < 2000) {
        parts.push(`## ${name}\n${content}`);
      }
    }

    return parts.join("\n\n");
  }

  /**
   * Get agent name.
   */
  getAgentName(): string {
    return this.context.identity?.name ?? "Foreman";
  }

  /**
   * Get user name.
   */
  getUserName(): string {
    return this.context.user?.name ?? "User";
  }

  /**
   * Update a memory entry (persist to MEMORY.md).
   */
  updateMemory(key: string, value: string, section?: string): void {
    if (!this.context.memory) {
      this.context.memory = { entries: [], raw: "" };
    }

    const existing = this.context.memory.entries.find(e => e.key === key);
    if (existing) {
      existing.value = value;
      existing.updatedAt = Date.now();
    } else {
      this.context.memory.entries.push({ key, value, section, updatedAt: Date.now() });
    }

    this.persistMemory();
  }

  /**
   * Search memory entries.
   */
  searchMemory(query: string): MemoryEntry[] {
    if (!this.context.memory) return [];
    const q = query.toLowerCase();
    return this.context.memory.entries.filter(e =>
      e.key.toLowerCase().includes(q) ||
      e.value.toLowerCase().includes(q) ||
      (e.section?.toLowerCase().includes(q) ?? false),
    );
  }

  /**
   * Get a specific memory entry.
   */
  getMemory(key: string): string | undefined {
    return this.context.memory?.entries.find(e => e.key === key)?.value;
  }

  /**
   * Update identity (agent evolves).
   */
  updateIdentity(content: string): void {
    const path = join(this.projectRoot, "IDENTITY.md");
    writeFileSync(path, content, "utf-8");
    this.context.identity = this.parseIdentity(content);
    this.cache.set("IDENTITY.md", { content, mtime: Date.now() });
  }

  // ─── LOADERS ────────────────────────────────────────────

  private loadIdentity(): AgentIdentity | undefined {
    const content = this.readFile("IDENTITY.md");
    if (!content) return undefined;
    return this.parseIdentity(content);
  }

  private parseIdentity(content: string): AgentIdentity {
    const nameMatch = content.match(/\*\*Name:\*\*\s*(.+)/i) ?? content.match(/^#\s+(.+)/m);
    const emojiMatch = content.match(/\*\*Emoji:\*\*\s*(.+)/i);
    const vibeMatch = content.match(/\*\*Vibe:\*\*\s*(.+)/i);

    const values: string[] = [];
    const boundaries: string[] = [];

    // Extract values section
    const valuesSection = content.match(/## (?:What I Stand For|Values|Değerler)([\s\S]*?)(?=\n## |$)/i);
    if (valuesSection) {
      const lines = valuesSection[1].split("\n").filter(l => l.trim().startsWith("-"));
      values.push(...lines.map(l => l.replace(/^-\s*/, "").trim()));
    }

    // Extract boundaries
    const boundariesSection = content.match(/## (?:Boundaries|How I Operate|Sınırlar)([\s\S]*?)(?=\n## |$)/i);
    if (boundariesSection) {
      const lines = boundariesSection[1].split("\n").filter(l => l.trim().startsWith("-"));
      boundaries.push(...lines.map(l => l.replace(/^-\s*/, "").trim()));
    }

    return {
      name: nameMatch?.[1]?.trim() ?? "Foreman",
      emoji: emojiMatch?.[1]?.trim(),
      vibe: vibeMatch?.[1]?.trim(),
      values,
      boundaries,
      raw: content,
    };
  }

  private loadSoul(): AgentSoul | undefined {
    const content = this.readFile("SOUL.md");
    if (!content) return undefined;

    const coreTruths: string[] = [];
    const boundaries: string[] = [];

    const truthsSection = content.match(/## Core Truths([\s\S]*?)(?=\n## |$)/i);
    if (truthsSection) {
      const paragraphs = truthsSection[1].split("\n\n").filter(p => p.trim());
      coreTruths.push(...paragraphs.map(p => p.replace(/\*\*/g, "").trim()).filter(Boolean));
    }

    const boundSection = content.match(/## Boundaries([\s\S]*?)(?=\n## |$)/i);
    if (boundSection) {
      const lines = boundSection[1].split("\n").filter(l => l.trim().startsWith("-"));
      boundaries.push(...lines.map(l => l.replace(/^-\s*/, "").trim()));
    }

    const vibeSection = content.match(/## Vibe([\s\S]*?)(?=\n## |$)/i);

    return {
      coreTruths,
      boundaries,
      vibe: vibeSection?.[1]?.trim() ?? "",
      raw: content,
    };
  }

  private loadUser(): UserProfile | undefined {
    const content = this.readFile("USER.md");
    if (!content) return undefined;

    const nameMatch = content.match(/\*\*(?:İsim|Name):\*\*\s*(.+)/i);
    const langMatch = content.match(/\*\*(?:Language|Dil):\*\*\s*(.+)/i);
    const tzMatch = content.match(/\*\*(?:Timezone|Saat):\*\*\s*(.+)/i);
    const styleMatch = content.match(/## (?:İletişim Tarzı|Communication Style)([\s\S]*?)(?=\n## |$)/i);

    const preferences: string[] = [];
    const redLines: string[] = [];

    const prefSection = content.match(/## (?:Ne Mutlu Ediyor|Preferences)([\s\S]*?)(?=\n## |$)/i);
    if (prefSection) {
      const lines = prefSection[1].split("\n").filter(l => l.trim().startsWith("-"));
      preferences.push(...lines.map(l => l.replace(/^-\s*/, "").trim()));
    }

    const redSection = content.match(/## (?:Kırmızı Çizgiler|Red Lines)([\s\S]*?)(?=\n## |$)/i);
    if (redSection) {
      const lines = redSection[1].split("\n").filter(l => l.trim().match(/^[\d❌-]/));
      redLines.push(...lines.map(l => l.replace(/^[\d❌.\s-]+/, "").trim()));
    }

    return {
      name: nameMatch?.[1]?.trim() ?? "User",
      language: langMatch?.[1]?.trim(),
      timezone: tzMatch?.[1]?.trim(),
      communicationStyle: styleMatch?.[1]?.trim(),
      preferences,
      redLines,
      raw: content,
    };
  }

  private loadMemory(): PersistentMemory | undefined {
    const content = this.readFile("MEMORY.md");
    if (!content) return undefined;

    const entries: MemoryEntry[] = [];
    let currentSection = "";

    for (const line of content.split("\n")) {
      const sectionMatch = line.match(/^##\s+(.+)/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
        continue;
      }

      const kvMatch = line.match(/^[-*]\s*\*\*(.+?):\*\*\s*(.+)/);
      if (kvMatch) {
        entries.push({
          key: kvMatch[1].trim(),
          value: kvMatch[2].trim(),
          section: currentSection || undefined,
        });
      }
    }

    return { entries, raw: content };
  }

  private loadCustomFiles(): void {
    const customNames = ["TOOLS.md", "HEARTBEAT.md", "BOOTSTRAP.md"];
    for (const name of customNames) {
      const content = this.readFile(name);
      if (content && content.trim().length > 0) {
        this.context.customFiles.set(name.replace(".md", ""), content);
      }
    }

    // Also load memory/*.md files
    const memoryDir = join(this.projectRoot, "memory");
    if (existsSync(memoryDir)) {
      try {
        const files = readdirSync(memoryDir).filter(f => f.endsWith(".md")).slice(0, 20);
        for (const file of files) {
          const content = this.readFile(join("memory", file));
          if (content && content.length < 5000) {
            this.context.customFiles.set(`memory/${file}`, content);
          }
        }
      } catch { /* ignore */ }
    }
  }

  // ─── FILE I/O ───────────────────────────────────────────

  private readFile(relativePath: string): string | undefined {
    const fullPath = join(this.projectRoot, relativePath);
    try {
      if (!existsSync(fullPath)) return undefined;
      const content = readFileSync(fullPath, "utf-8");
      const mtime = statSync(fullPath).mtimeMs;
      this.cache.set(relativePath, { content, mtime });
      return content;
    } catch {
      return undefined;
    }
  }

  private hotReload(): void {
    for (const [path, cached] of this.cache) {
      try {
        const fullPath = join(this.projectRoot, path);
        if (!existsSync(fullPath)) continue;
        const mtime = statSync(fullPath).mtimeMs;
        if (mtime > cached.mtime) {
          this.reload();
          return;
        }
      } catch { /* ignore */ }
    }
  }

  private persistMemory(): void {
    if (!this.context.memory) return;

    const sections = new Map<string, MemoryEntry[]>();
    for (const entry of this.context.memory.entries) {
      const section = entry.section ?? "General";
      if (!sections.has(section)) sections.set(section, []);
      sections.get(section)!.push(entry);
    }

    const lines: string[] = ["# Memory\n"];
    for (const [section, entries] of sections) {
      lines.push(`## ${section}`);
      for (const entry of entries) {
        lines.push(`- **${entry.key}:** ${entry.value}`);
      }
      lines.push("");
    }

    const content = lines.join("\n");
    const memoryPath = join(this.projectRoot, "MEMORY.md");
    writeFileSync(memoryPath, content, "utf-8");
    this.context.memory.raw = content;
    this.cache.set("MEMORY.md", { content, mtime: Date.now() });
  }
}
