/**
 * FOREMAN — Markdown Intelligence Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractCodeFences,
  extractTables,
  extractSections,
  extractLists,
  parseFrontmatter,
  extractInlineCode,
} from "./markdown-intelligence.js";

// ─── CODE FENCES ─────────────────────────────────────────────

describe("extractCodeFences", () => {
  it("extracts simple code fence", () => {
    const md = "```typescript\nconst x = 1;\n```";
    const fences = extractCodeFences(md);
    assert.equal(fences.length, 1);
    assert.equal(fences[0].language, "typescript");
    assert.equal(fences[0].content, "const x = 1;");
  });

  it("extracts multiple fences", () => {
    const md = "```ts\ncode1\n```\n\ntext\n\n```python\ncode2\n```";
    const fences = extractCodeFences(md);
    assert.equal(fences.length, 2);
    assert.equal(fences[0].language, "ts");
    assert.equal(fences[1].language, "python");
  });

  it("handles fence without language", () => {
    const md = "```\nplain code\n```";
    const fences = extractCodeFences(md);
    assert.equal(fences.length, 1);
    assert.equal(fences[0].language, "");
    assert.equal(fences[0].content, "plain code");
  });

  it("handles tilde fences", () => {
    const md = "~~~bash\necho hello\n~~~";
    const fences = extractCodeFences(md);
    assert.equal(fences.length, 1);
    assert.equal(fences[0].language, "bash");
  });

  it("preserves multi-line content", () => {
    const md = "```\nline1\nline2\nline3\n```";
    const fences = extractCodeFences(md);
    assert.equal(fences[0].content, "line1\nline2\nline3");
  });

  it("tracks line numbers", () => {
    const md = "some text\n```ts\ncode\n```\nmore text";
    const fences = extractCodeFences(md);
    assert.equal(fences[0].startLine, 2);
  });
});

// ─── TABLES ──────────────────────────────────────────────────

describe("extractTables", () => {
  it("extracts simple table", () => {
    const md = `| Name | Age |
| --- | --- |
| Alice | 30 |
| Bob | 25 |`;
    const tables = extractTables(md);
    assert.equal(tables.length, 1);
    assert.deepEqual(tables[0].headers, ["Name", "Age"]);
    assert.equal(tables[0].rows.length, 2);
    assert.deepEqual(tables[0].rows[0], ["Alice", "30"]);
  });

  it("detects alignment", () => {
    const md = `| Left | Center | Right |
| :--- | :---: | ---: |
| a | b | c |`;
    const tables = extractTables(md);
    assert.deepEqual(tables[0].alignments, ["left", "center", "right"]);
  });

  it("handles table without leading pipes", () => {
    const md = `Name | Value
--- | ---
key | val`;
    const tables = extractTables(md);
    assert.equal(tables.length, 1);
    assert.deepEqual(tables[0].headers, ["Name", "Value"]);
  });
});

// ─── SECTIONS ────────────────────────────────────────────────

describe("extractSections", () => {
  it("splits by headings", () => {
    const md = `# Title

Intro text

## Plan

Plan content

## Implementation

Code here`;
    const sections = extractSections(md);
    assert.equal(sections.length, 3);
    assert.equal(sections[0].title, "Title");
    assert.equal(sections[0].level, 1);
    assert.ok(sections[0].content.includes("Intro text"));
    assert.equal(sections[1].title, "Plan");
    assert.equal(sections[2].title, "Implementation");
  });

  it("handles text without headings", () => {
    const md = "Just plain text\nwith multiple lines";
    const sections = extractSections(md);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].level, 0);
    assert.ok(sections[0].content.includes("plain text"));
  });

  it("tracks heading levels", () => {
    const md = "# H1\n\n## H2\n\n### H3";
    const sections = extractSections(md);
    assert.equal(sections[0].level, 1);
    assert.equal(sections[1].level, 2);
    assert.equal(sections[2].level, 3);
  });
});

// ─── LISTS ───────────────────────────────────────────────────

describe("extractLists", () => {
  it("extracts unordered list", () => {
    const md = "- Item 1\n- Item 2\n- Item 3";
    const items = extractLists(md);
    assert.equal(items.length, 3);
    assert.equal(items[0].text, "Item 1");
    assert.equal(items[0].ordered, false);
  });

  it("extracts ordered list", () => {
    const md = "1. First\n2. Second\n3. Third";
    const items = extractLists(md);
    assert.equal(items.length, 3);
    assert.equal(items[0].ordered, true);
    assert.equal(items[0].number, 1);
    assert.equal(items[2].number, 3);
  });

  it("detects task list items", () => {
    const md = "- [x] Done task\n- [ ] Pending task";
    const items = extractLists(md);
    assert.equal(items.length, 2);
    assert.equal(items[0].checked, true);
    assert.equal(items[0].text, "Done task");
    assert.equal(items[1].checked, false);
  });

  it("handles nested lists", () => {
    const md = "- Top\n  - Nested\n    - Deep";
    const items = extractLists(md);
    assert.equal(items.length, 3);
    assert.equal(items[0].depth, 0);
    assert.equal(items[1].depth, 1);
    assert.equal(items[2].depth, 2);
  });

  it("handles * and + markers", () => {
    const md = "* Star item\n+ Plus item";
    const items = extractLists(md);
    assert.equal(items.length, 2);
  });
});

// ─── FRONTMATTER ─────────────────────────────────────────────

describe("parseFrontmatter", () => {
  it("parses YAML frontmatter", () => {
    const md = `---
title: My Document
language: typescript
---

Content here`;
    const result = parseFrontmatter(md);
    assert.equal(result.found, true);
    assert.equal(result.data.title, "My Document");
    assert.equal(result.data.language, "typescript");
    assert.ok(result.content.includes("Content here"));
  });

  it("returns content when no frontmatter", () => {
    const md = "Just content, no frontmatter";
    const result = parseFrontmatter(md);
    assert.equal(result.found, false);
    assert.equal(result.content, md);
  });

  it("strips quotes from values", () => {
    const md = `---
name: "quoted value"
other: 'single quoted'
---

body`;
    const result = parseFrontmatter(md);
    assert.equal(result.data.name, "quoted value");
    assert.equal(result.data.other, "single quoted");
  });
});

// ─── INLINE CODE ─────────────────────────────────────────────

describe("extractInlineCode", () => {
  it("extracts inline code spans", () => {
    const md = "Use `npm install` and then `npm test`";
    const codes = extractInlineCode(md);
    assert.equal(codes.length, 2);
    assert.equal(codes[0], "npm install");
    assert.equal(codes[1], "npm test");
  });

  it("does not extract triple backtick fences", () => {
    const md = "```typescript\ncode\n```\nUse `this` inline";
    const codes = extractInlineCode(md);
    // Should only get "this", not the fence content
    assert.ok(codes.includes("this"));
    assert.ok(!codes.includes("typescript"));
  });

  it("handles empty input", () => {
    assert.deepEqual(extractInlineCode(""), []);
  });
});
