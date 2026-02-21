/**
 * FOREMAN — Markdown Memory Bridge Tests
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryManager } from "./memory-manager.js";
import {
  generateMemoryMd,
  parseMemoryMd,
  syncMemoryMd,
  generateCategoryFiles,
} from "./memory-md-bridge.js";
import type { MemoryEntry } from "./types.js";

const TEST_DIR = join(process.cwd(), ".test-memory-md");

function setup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
}

function cleanup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
}

function makeEntry(overrides: Partial<MemoryEntry> & { id: string }): MemoryEntry {
  return {
    projectId: "test",
    category: "decision",
    content: "Test content",
    source: { type: "thought", ref: "t_001" },
    importance: 0.7,
    tags: [],
    useCount: 0,
    createdAt: new Date().toISOString(),
    expired: false,
    ...overrides,
  };
}

// ─── MARKDOWN GENERATION ─────────────────────────────────────

describe("generateMemoryMd", () => {
  it("generates empty file for no entries", () => {
    const md = generateMemoryMd([]);
    assert.ok(md.includes("No memories stored yet"));
  });

  it("organizes by category", () => {
    const entries = [
      makeEntry({ id: "mem_001", category: "decision", content: "Use TypeScript" }),
      makeEntry({ id: "mem_002", category: "lesson", content: "Always test first" }),
      makeEntry({ id: "mem_003", category: "error", content: "Fix: add .js extension" }),
    ];
    const md = generateMemoryMd(entries);
    assert.ok(md.includes("## Decisions"));
    assert.ok(md.includes("## Lessons Learned"));
    assert.ok(md.includes("## Error Solutions"));
  });

  it("uses importance icons", () => {
    const entries = [
      makeEntry({ id: "mem_001", importance: 0.9, content: "Critical decision" }),
      makeEntry({ id: "mem_002", importance: 0.6, content: "Medium priority" }),
      makeEntry({ id: "mem_003", importance: 0.3, content: "Low priority" }),
    ];
    const md = generateMemoryMd(entries);
    assert.ok(md.includes("⚠️ Critical decision"));
    assert.ok(md.includes("📌 Medium priority"));
    assert.ok(md.includes("📝 Low priority"));
  });

  it("embeds entry IDs as HTML comments", () => {
    const entries = [
      makeEntry({ id: "mem_042", content: "Remember this" }),
    ];
    const md = generateMemoryMd(entries);
    assert.ok(md.includes("<!-- mem_042 -->"));
  });

  it("includes tags as inline code", () => {
    const entries = [
      makeEntry({ id: "mem_001", content: "Use ESM", tags: ["typescript", "modules"] }),
    ];
    const md = generateMemoryMd(entries);
    assert.ok(md.includes("`typescript`"));
    assert.ok(md.includes("`modules`"));
  });

  it("excludes expired entries", () => {
    const entries = [
      makeEntry({ id: "mem_001", content: "Active", expired: false }),
      makeEntry({ id: "mem_002", content: "Expired", expired: true }),
    ];
    const md = generateMemoryMd(entries);
    assert.ok(md.includes("Active"));
    assert.ok(!md.includes("Expired"));
  });

  it("sorts by importance within category", () => {
    const entries = [
      makeEntry({ id: "mem_001", importance: 0.5, content: "Medium" }),
      makeEntry({ id: "mem_002", importance: 0.9, content: "High" }),
      makeEntry({ id: "mem_003", importance: 0.3, content: "Low" }),
    ];
    const md = generateMemoryMd(entries);
    const highIdx = md.indexOf("High");
    const medIdx = md.indexOf("Medium");
    const lowIdx = md.indexOf("Low");
    assert.ok(highIdx < medIdx, "High should come before Medium");
    assert.ok(medIdx < lowIdx, "Medium should come before Low");
  });
});

// ─── MARKDOWN PARSING ────────────────────────────────────────

describe("parseMemoryMd", () => {
  it("parses entries with IDs", () => {
    const md = `# Project Memory

## Decisions

⚠️ Use TypeScript for everything <!-- mem_001 -->
📌 Prefer ESM over CJS <!-- mem_002 -->`;

    const entries = parseMemoryMd(md);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].id, "mem_001");
    assert.equal(entries[0].content, "Use TypeScript for everything");
    assert.equal(entries[0].category, "decision");
    assert.ok(entries[0].importance >= 0.8);
  });

  it("parses new entries without IDs", () => {
    const md = `## Lessons Learned

📌 Never skip tests`;

    const entries = parseMemoryMd(md);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, null);
    assert.equal(entries[0].content, "Never skip tests");
    assert.equal(entries[0].category, "lesson");
  });

  it("resolves category from header", () => {
    const md = `## Constraints

📌 Max 500 LOC per file <!-- mem_001 -->

## Error Solutions

📝 Fix: missing .js in imports <!-- mem_002 -->`;

    const entries = parseMemoryMd(md);
    assert.equal(entries[0].category, "constraint");
    assert.equal(entries[1].category, "error");
  });

  it("strips inline tags from content", () => {
    const md = `## Decisions

📌 Use ESM modules \`typescript\` \`esm\` <!-- mem_001 -->`;

    const entries = parseMemoryMd(md);
    assert.equal(entries[0].content, "Use ESM modules");
  });

  it("maps importance from icons", () => {
    const md = `## Decisions

⚠️ Hot entry <!-- mem_001 -->
📌 Warm entry <!-- mem_002 -->
📝 Cold entry <!-- mem_003 -->`;

    const entries = parseMemoryMd(md);
    assert.ok(entries[0].importance >= 0.8);
    assert.ok(entries[1].importance >= 0.5 && entries[1].importance < 0.8);
    assert.ok(entries[2].importance < 0.5);
  });
});

// ─── SYNC ────────────────────────────────────────────────────

describe("syncMemoryMd", () => {
  beforeEach(() => setup());
  afterEach(() => cleanup());

  it("creates MEMORY.md from JSON entries", () => {
    const manager = new MemoryManager(TEST_DIR);
    manager.create({
      category: "decision",
      content: "Use strict TypeScript",
      source: { type: "thought", ref: "t_001" },
      importance: 0.9,
    });

    const result = syncMemoryMd(manager, TEST_DIR);
    assert.ok(existsSync(join(TEST_DIR, "MEMORY.md")));
    assert.equal(result.written, 1);

    const md = readFileSync(join(TEST_DIR, "MEMORY.md"), "utf-8");
    assert.ok(md.includes("Use strict TypeScript"));
  });

  it("imports human edits from MEMORY.md", () => {
    const manager = new MemoryManager(TEST_DIR);

    // Write a MEMORY.md with a new entry (no ID = human added)
    const humanMd = `# Project Memory

## Lessons Learned

📌 Always run tests before committing`;

    writeFileSync(join(TEST_DIR, "MEMORY.md"), humanMd, "utf-8");

    const result = syncMemoryMd(manager, TEST_DIR);
    assert.equal(result.parsed, 1);

    // Should now be in JSON memory
    const memories = manager.list();
    assert.ok(memories.some(m => m.content.includes("Always run tests")));
  });

  it("updates JSON when human edits existing entry", () => {
    const manager = new MemoryManager(TEST_DIR);
    const entry = manager.create({
      category: "decision",
      content: "Original content",
      source: { type: "thought", ref: "t_001" },
      importance: 0.7,
    });

    // Human edits the MEMORY.md
    const editedMd = `# Project Memory

## Decisions

📌 Updated by human <!-- ${entry.id} -->`;

    writeFileSync(join(TEST_DIR, "MEMORY.md"), editedMd, "utf-8");

    syncMemoryMd(manager, TEST_DIR);

    const updated = manager.get(entry.id);
    assert.ok(updated);
    assert.equal(updated!.content, "Updated by human");
  });
});

// ─── CATEGORY FILES ──────────────────────────────────────────

describe("generateCategoryFiles", () => {
  it("generates separate files per category", () => {
    const entries = [
      makeEntry({ id: "mem_001", category: "decision", content: "Use TS" }),
      makeEntry({ id: "mem_002", category: "lesson", content: "Test first" }),
      makeEntry({ id: "mem_003", category: "decision", content: "Use ESM" }),
    ];

    const memDir = join(TEST_DIR, "memory");
    const files = generateCategoryFiles(entries, memDir);

    assert.equal(files.size, 2); // decisions + lessons
    const decisionPath = [...files.keys()].find(k => k.includes("decision"));
    assert.ok(decisionPath);
    const decisionContent = files.get(decisionPath!)!;
    assert.ok(decisionContent.includes("Use TS"));
    assert.ok(decisionContent.includes("Use ESM"));
  });

  it("excludes expired entries", () => {
    const entries = [
      makeEntry({ id: "mem_001", category: "decision", content: "Active" }),
      makeEntry({ id: "mem_002", category: "decision", content: "Gone", expired: true }),
    ];

    const files = generateCategoryFiles(entries, TEST_DIR);
    const content = [...files.values()].join("\n");
    assert.ok(content.includes("Active"));
    assert.ok(!content.includes("Gone"));
  });
});
