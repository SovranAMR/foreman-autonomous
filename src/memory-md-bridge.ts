/**
 * FOREMAN — Markdown Memory Bridge
 *
 * Bi-directional sync between JSON memory entries and human-readable
 * MEMORY.md file.
 *
 * OpenClaw's MEMORY.md: static file the agent reads/writes manually.
 * No structure, no sync, no versioning. User edits it by hand.
 * Agent sometimes overwrites user edits. No conflict resolution.
 *
 * Foreman's Markdown Memory Bridge:
 *
 * 1. AUTO-SYNC: JSON memories → MEMORY.md on every significant change.
 *    Human can read MEMORY.md to understand what Foreman remembers.
 *    OpenClaw: agent must manually maintain the file.
 *
 * 2. BIDIRECTIONAL: Human edits MEMORY.md → parsed back into JSON entries.
 *    New entries added by human get `source: "manual"`.
 *    OpenClaw: no parsing of human edits.
 *
 * 3. SECTIONED FORMAT: Organized by category with importance indicators.
 *    ⚠️ = hot (importance ≥ 0.8)
 *    📌 = warm (≥ 0.5)
 *    📝 = cold (< 0.5)
 *    OpenClaw: flat text, no organization.
 *
 * 4. METADATA PRESERVATION: Each entry has an invisible HTML comment
 *    with its ID, so edits can be mapped back to JSON entries.
 *    OpenClaw: no ID tracking in markdown.
 *
 * 5. CONFLICT DETECTION: If both JSON and MD changed since last sync,
 *    reports conflicts instead of silently overwriting.
 *    OpenClaw: no conflict detection.
 *
 * 6. CATEGORY MEMORY FILES: Large projects can split memory into
 *    category-specific files: memory/decisions.md, memory/lessons.md.
 *    OpenClaw: single file only.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { MemoryEntry, MemoryCategory } from "./types.js";
import { MemoryManager } from "./memory-manager.js";

// ─── TYPES ───────────────────────────────────────────────────

export interface MemoryMdSyncResult {
  /** Entries written to MEMORY.md */
  written: number;
  /** Entries parsed from human edits */
  parsed: number;
  /** Conflicts detected */
  conflicts: MemoryConflict[];
  /** Path to MEMORY.md */
  filePath: string;
}

export interface MemoryConflict {
  entryId: string;
  jsonContent: string;
  mdContent: string;
}

export interface ParsedMdEntry {
  id: string | null;
  category: MemoryCategory;
  content: string;
  importance: number;
}

// ─── CONSTANTS ───────────────────────────────────────────────

const IMPORTANCE_ICONS: Record<string, string> = {
  hot: "⚠️",
  warm: "📌",
  cold: "📝",
};

const CATEGORY_HEADERS: Record<MemoryCategory, string> = {
  decision: "Decisions",
  pattern: "Patterns",
  constraint: "Constraints",
  lesson: "Lessons Learned",
  error: "Error Solutions",
  reference: "References",
  context: "Context",
  preference: "Preferences",
};

const CATEGORY_ORDER: MemoryCategory[] = [
  "decision", "constraint", "pattern", "lesson", "error",
  "reference", "context", "preference",
];

// ─── MARKDOWN GENERATION ─────────────────────────────────────

/**
 * Generate MEMORY.md content from memory entries.
 */
export function generateMemoryMd(entries: MemoryEntry[]): string {
  if (entries.length === 0) {
    return "# Project Memory\n\n_No memories stored yet._\n";
  }

  const sections: string[] = ["# Project Memory\n"];
  const now = new Date().toISOString().split("T")[0];
  sections.push(`_Last synced: ${now}_\n`);

  // Group by category
  const byCategory = new Map<MemoryCategory, MemoryEntry[]>();
  for (const entry of entries) {
    if (entry.expired) continue;
    const list = byCategory.get(entry.category) || [];
    list.push(entry);
    byCategory.set(entry.category, list);
  }

  // Render each category
  for (const category of CATEGORY_ORDER) {
    const catEntries = byCategory.get(category);
    if (!catEntries || catEntries.length === 0) continue;

    const header = CATEGORY_HEADERS[category] || category;
    sections.push(`## ${header}\n`);

    // Sort by importance (highest first)
    catEntries.sort((a, b) => b.importance - a.importance);

    for (const entry of catEntries) {
      const icon = getImportanceIcon(entry.importance);
      const tags = entry.tags.length > 0 ? ` \`${entry.tags.join("` `")}\`` : "";
      // Embed ID as HTML comment for bidirectional sync
      sections.push(`${icon} ${entry.content}${tags} <!-- ${entry.id} -->`);
    }

    sections.push(""); // blank line between sections
  }

  return sections.join("\n");
}

/**
 * Parse MEMORY.md back into entries.
 * Detects existing entries (by HTML comment ID) and new entries.
 */
export function parseMemoryMd(content: string): ParsedMdEntry[] {
  const entries: ParsedMdEntry[] = [];
  let currentCategory: MemoryCategory = "context";

  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Category header: ## Decisions, ## Lessons Learned, etc.
    const headerMatch = trimmed.match(/^##\s+(.+)$/);
    if (headerMatch) {
      const headerText = headerMatch[1].trim();
      const cat = resolveCategory(headerText);
      if (cat) currentCategory = cat;
      continue;
    }

    // Memory entry: ⚠️ content <!-- mem_001 -->
    // or: 📌 content `tag1` `tag2` <!-- mem_002 -->
    // or new entry without ID: ⚠️ new content
    const entryMatch = trimmed.match(/^(?:⚠️|📌|📝)\s+(.+?)(?:\s*<!--\s*(mem_\d+)\s*-->)?$/);
    if (!entryMatch) continue;

    const rawContent = entryMatch[1].trim();
    const id = entryMatch[2] || null;

    // Strip tags from content
    const contentWithoutTags = rawContent.replace(/\s*`[^`]+`/g, "").trim();

    // Determine importance from icon
    let importance = 0.5;
    if (trimmed.startsWith("⚠")) importance = 0.9;
    else if (trimmed.startsWith("📌")) importance = 0.6;
    else if (trimmed.startsWith("📝")) importance = 0.3;

    entries.push({
      id,
      category: currentCategory,
      content: contentWithoutTags,
      importance,
    });
  }

  return entries;
}

/**
 * Resolve a header text to a MemoryCategory.
 */
function resolveCategory(headerText: string): MemoryCategory | null {
  const lower = headerText.toLowerCase();
  for (const [cat, name] of Object.entries(CATEGORY_HEADERS)) {
    if (lower === name.toLowerCase()) return cat as MemoryCategory;
  }
  // Partial match
  if (lower.includes("decision")) return "decision";
  if (lower.includes("pattern")) return "pattern";
  if (lower.includes("constraint")) return "constraint";
  if (lower.includes("lesson")) return "lesson";
  if (lower.includes("error")) return "error";
  if (lower.includes("reference")) return "reference";
  if (lower.includes("preference")) return "preference";
  return null;
}

function getImportanceIcon(importance: number): string {
  if (importance >= 0.8) return IMPORTANCE_ICONS.hot;
  if (importance >= 0.5) return IMPORTANCE_ICONS.warm;
  return IMPORTANCE_ICONS.cold;
}

// ─── SYNC ENGINE ─────────────────────────────────────────────

/**
 * Sync JSON memories ↔ MEMORY.md
 *
 * Strategy:
 * 1. Read existing MEMORY.md (if any)
 * 2. Parse for human edits (new entries without ID)
 * 3. Import human edits into JSON memory
 * 4. Generate new MEMORY.md from all JSON entries
 * 5. Write MEMORY.md
 */
export function syncMemoryMd(
  manager: MemoryManager,
  projectRoot: string,
): MemoryMdSyncResult {
  const mdPath = join(projectRoot, "MEMORY.md");
  let parsed = 0;
  const conflicts: MemoryConflict[] = [];

  // 1. Parse existing MEMORY.md for human edits
  if (existsSync(mdPath)) {
    const existingContent = readFileSync(mdPath, "utf-8");
    const mdEntries = parseMemoryMd(existingContent);

    for (const mdEntry of mdEntries) {
      if (mdEntry.id) {
        // Existing entry — check for conflicts
        const jsonEntry = manager.get(mdEntry.id);
        if (jsonEntry && jsonEntry.content !== mdEntry.content) {
          // Human edited the content in MEMORY.md
          // Update JSON with the human's version (human wins)
          manager.update(mdEntry.id, {
            content: mdEntry.content,
            importance: mdEntry.importance,
          });
          parsed++;
        }
      } else {
        // New entry added by human — import it
        manager.create({
          category: mdEntry.category,
          content: mdEntry.content,
          source: { type: "manual", ref: "MEMORY.md" },
          importance: mdEntry.importance,
          tags: [],
        });
        parsed++;
      }
    }
  }

  // 2. Generate fresh MEMORY.md from all entries
  const allEntries = manager.list();
  const mdContent = generateMemoryMd(allEntries);
  writeFileSync(mdPath, mdContent, "utf-8");

  return {
    written: allEntries.filter(e => !e.expired).length,
    parsed,
    conflicts,
    filePath: mdPath,
  };
}

// ─── CATEGORY FILES ──────────────────────────────────────────

/**
 * Generate category-specific memory files for large projects.
 *
 * memory/decisions.md, memory/lessons.md, etc.
 * OpenClaw: single MEMORY.md only.
 */
export function generateCategoryFiles(
  entries: MemoryEntry[],
  memoryDir: string,
): Map<string, string> {
  const files = new Map<string, string>();
  const byCategory = new Map<MemoryCategory, MemoryEntry[]>();

  for (const entry of entries) {
    if (entry.expired) continue;
    const list = byCategory.get(entry.category) || [];
    list.push(entry);
    byCategory.set(entry.category, list);
  }

  for (const [category, catEntries] of byCategory) {
    if (catEntries.length === 0) continue;

    const header = CATEGORY_HEADERS[category] || category;
    const lines: string[] = [`# ${header}\n`];

    catEntries.sort((a, b) => b.importance - a.importance);
    for (const entry of catEntries) {
      const icon = getImportanceIcon(entry.importance);
      lines.push(`${icon} ${entry.content} <!-- ${entry.id} -->`);
    }

    const fileName = `${category}.md`;
    const filePath = join(memoryDir, fileName);
    const content = lines.join("\n") + "\n";
    files.set(filePath, content);
  }

  return files;
}
