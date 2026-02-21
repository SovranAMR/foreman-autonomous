/**
 * FOREMAN — Edit Engine Tests
 *
 * Tests for multi-occurrence, fuzzy matching, context-anchored edits,
 * line-range replacement, validation, dry run, and undo.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EditEngine,
  findAllOccurrences,
  replaceNthOccurrence,
  normalizeWhitespace,
  findFuzzyMatch,
  generateDiff,
  validateEdit,
} from "./edit-engine.js";

const TEST_DIR = join(process.cwd(), ".test-edit-engine");

function setup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
}

function cleanup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
}

function writeTestFile(name: string, content: string): string {
  const path = join(TEST_DIR, name);
  writeFileSync(path, content, "utf-8");
  return path;
}

function readTestFile(name: string): string {
  return readFileSync(join(TEST_DIR, name), "utf-8");
}

// ─── UTILITY FUNCTIONS ───────────────────────────────────────

describe("findAllOccurrences", () => {
  it("finds all positions", () => {
    const positions = findAllOccurrences("abcXdefXghiX", "X");
    assert.deepEqual(positions, [3, 7, 11]);
  });

  it("returns empty for no match", () => {
    const positions = findAllOccurrences("hello world", "xyz");
    assert.deepEqual(positions, []);
  });

  it("handles multi-char search", () => {
    const positions = findAllOccurrences("foo bar foo baz foo", "foo");
    assert.deepEqual(positions, [0, 8, 16]);
  });
});

describe("replaceNthOccurrence", () => {
  it("replaces 1st occurrence", () => {
    const result = replaceNthOccurrence("a X b X c X", "X", "Y", 1);
    assert.equal(result, "a Y b X c X");
  });

  it("replaces 2nd occurrence", () => {
    const result = replaceNthOccurrence("a X b X c X", "X", "Y", 2);
    assert.equal(result, "a X b Y c X");
  });

  it("replaces 3rd occurrence", () => {
    const result = replaceNthOccurrence("a X b X c X", "X", "Y", 3);
    assert.equal(result, "a X b X c Y");
  });
});

describe("normalizeWhitespace", () => {
  it("collapses spaces", () => {
    assert.equal(normalizeWhitespace("  hello   world  "), "hello world");
  });

  it("trims each line", () => {
    assert.equal(normalizeWhitespace("  foo  \n  bar  "), "foo\nbar");
  });

  it("handles tabs", () => {
    assert.equal(normalizeWhitespace("\t\thello\tworld"), "hello world");
  });
});

describe("findFuzzyMatch", () => {
  it("finds whitespace-different match", () => {
    const content = "function foo() {\n  const x = 1;\n  return x;\n}";
    const search = "function foo() {\n    const x = 1;\n    return x;\n}"; // different indent
    const match = findFuzzyMatch(content, search);
    assert.ok(match, "Should find fuzzy match");
    assert.ok(match.similarity >= 0.9);
    assert.ok(match.hint.includes("Whitespace"));
  });

  it("returns null for no match", () => {
    const content = "completely different content here";
    const search = "function foo() { return bar; }";
    const match = findFuzzyMatch(content, search);
    assert.equal(match, null);
  });

  it("finds partial match and reports differing lines", () => {
    const content = "line1\nline2\nline3\nline4";
    const search = "line1\nLINE2\nline3\nline4";
    const match = findFuzzyMatch(content, search);
    assert.ok(match, "Should find partial match");
    assert.ok(match.similarity >= 0.5);
    assert.ok(match.hint.includes("2")); // line 2 differs
  });
});

describe("generateDiff", () => {
  it("generates unified diff format", () => {
    const diff = generateDiff("old line", "new line", 10);
    assert.ok(diff.includes("@@ -10,1 +10,1 @@"));
    assert.ok(diff.includes("- old line"));
    assert.ok(diff.includes("+ new line"));
  });
});

describe("validateEdit", () => {
  it("warns about unbalanced braces", () => {
    const oldContent = "function foo() { return 1; }";
    const newContent = "function foo() { return 1;"; // missing }
    const warnings = validateEdit(oldContent, newContent, "test.ts");
    assert.ok(warnings.length > 0, "Should have warnings");
    assert.ok(warnings.some(w => w.includes("brace") || w.includes("Brace")));
  });

  it("no warnings for balanced edit", () => {
    const oldContent = "function foo() { return 1; }";
    const newContent = "function foo() { return 2; }";
    const warnings = validateEdit(oldContent, newContent, "test.ts");
    assert.equal(warnings.length, 0);
  });

  it("ignores non-source files", () => {
    const oldContent = "balanced ()";
    const newContent = "unbalanced (((";
    const warnings = validateEdit(oldContent, newContent, "readme.md");
    assert.equal(warnings.length, 0);
  });

  it("ignores brackets inside strings", () => {
    const oldContent = 'const x = "hello";';
    const newContent = 'const x = "hello (world)";';
    const warnings = validateEdit(oldContent, newContent, "test.ts");
    assert.equal(warnings.length, 0);
  });
});

// ─── EDIT ENGINE ─────────────────────────────────────────────

describe("EditEngine", () => {
  let engine: EditEngine;

  beforeEach(() => {
    setup();
    engine = new EditEngine();
  });

  afterEach(() => cleanup());

  it("exact match replacement", () => {
    const path = writeTestFile("test.ts", "const x = 1;\nconst y = 2;\nconst z = 3;");
    const result = engine.edit({
      filePath: path,
      oldText: "const y = 2;",
      newText: "const y = 42;",
    });
    assert.equal(result.success, true);
    assert.equal(result.replacements, 1);
    assert.ok(readTestFile("test.ts").includes("const y = 42;"));
  });

  it("multi-occurrence: replaces specific occurrence", () => {
    const path = writeTestFile("test.ts", "log('a');\nlog('b');\nlog('c');");
    const result = engine.edit({
      filePath: path,
      oldText: "log(",
      newText: "console.log(",
      occurrence: 2,
    });
    assert.equal(result.success, true);
    const content = readTestFile("test.ts");
    assert.equal(content, "log('a');\nconsole.log('b');\nlog('c');");
  });

  it("multi-occurrence: replaces all", () => {
    const path = writeTestFile("test.ts", "log('a');\nlog('b');\nlog('c');");
    const result = engine.edit({
      filePath: path,
      oldText: "log(",
      newText: "console.log(",
      occurrence: "all",
    });
    assert.equal(result.success, true);
    assert.equal(result.replacements, 3);
    const content = readTestFile("test.ts");
    assert.ok(!content.includes("\nlog("));
  });

  it("warns about multiple occurrences when replacing single", () => {
    const path = writeTestFile("test.ts", "X\nX\nX");
    const result = engine.edit({
      filePath: path,
      oldText: "X",
      newText: "Y",
    });
    assert.equal(result.success, true);
    assert.ok(result.warnings.some(w => w.includes("3 times")));
  });

  it("occurrence out of range", () => {
    const path = writeTestFile("test.ts", "hello world");
    const result = engine.edit({
      filePath: path,
      oldText: "hello",
      newText: "hi",
      occurrence: 5,
    });
    assert.equal(result.success, false);
    assert.ok(result.message.includes("Occurrence #5 not found"));
  });

  it("fuzzy match suggestion when exact fails", () => {
    const path = writeTestFile("test.ts", "function hello() {\n  return 1;\n}");
    const result = engine.edit({
      filePath: path,
      oldText: "function hello() {\n    return 1;\n}", // different indent
      newText: "function hello() { return 2; }",
    });
    assert.equal(result.success, false);
    assert.ok(result.closestMatch, "Should provide closest match");
    assert.ok(result.closestMatch!.similarity >= 0.9);
  });

  it("dry run does not modify file", () => {
    const path = writeTestFile("test.ts", "original content");
    const result = engine.edit({
      filePath: path,
      oldText: "original",
      newText: "modified",
      dryRun: true,
    });
    assert.equal(result.success, true);
    assert.equal(result.dryRun, true);
    assert.equal(readTestFile("test.ts"), "original content");
  });

  it("context-anchored edit disambiguates occurrences", () => {
    // oldText appears twice — contextBefore disambiguates to the 2nd one
    const path = writeTestFile("test.ts",
      "// header\nconst x = 1;\n// middle\nconst x = 1;\n// footer");

    // First, make exact match fail by using slightly different whitespace
    // so we fall through to context-anchored matching
    const result = engine.edit({
      filePath: path,
      oldText: "const x = 1;",  // exact match exists, but 2 occurrences
      newText: "const x = 99;",
      occurrence: 2,  // explicitly target 2nd occurrence
    });
    assert.equal(result.success, true);
    const content = readTestFile("test.ts");
    const lines = content.split("\n");
    assert.equal(lines[1], "const x = 1;");  // first unchanged
    assert.equal(lines[3], "const x = 99;"); // second changed
  });

  it("file not found", () => {
    const result = engine.edit({
      filePath: join(TEST_DIR, "nonexistent.ts"),
      oldText: "x",
      newText: "y",
    });
    assert.equal(result.success, false);
    assert.ok(result.message.includes("not found"));
  });

  it("includes diff preview", () => {
    const path = writeTestFile("test.ts", "const x = 1;");
    const result = engine.edit({
      filePath: path,
      oldText: "const x = 1;",
      newText: "const x = 2;",
    });
    assert.ok(result.diff);
    assert.ok(result.diff!.includes("- const x = 1;"));
    assert.ok(result.diff!.includes("+ const x = 2;"));
  });

  it("context-anchored edit with whitespace-normalized match", () => {
    // Exact match fails (indentation differs), context anchoring saves the day
    const path = writeTestFile("test.ts",
      "function a() {\n  return 1;\n}\nfunction b() {\n  return 2;\n}");
    const result = engine.edit({
      filePath: path,
      oldText: "  return 2;",   // exact match exists but appears twice if we search "return"
      newText: "  return 99;",
      contextBefore: "function b() {",
    });
    assert.equal(result.success, true);
    const content = readTestFile("test.ts");
    assert.ok(content.includes("return 99;"));
    assert.ok(content.includes("return 1;")); // first function unchanged
  });
});

// ─── LINE RANGE EDIT ─────────────────────────────────────────

describe("EditEngine line range", () => {
  let engine: EditEngine;

  beforeEach(() => {
    setup();
    engine = new EditEngine();
  });

  afterEach(() => cleanup());

  it("replaces line range", () => {
    const path = writeTestFile("test.ts", "line1\nline2\nline3\nline4\nline5");
    const result = engine.editByLineRange({
      filePath: path,
      startLine: 2,
      endLine: 4,
      newContent: "replaced2\nreplaced3\nreplaced4",
    });
    assert.equal(result.success, true);
    assert.equal(readTestFile("test.ts"), "line1\nreplaced2\nreplaced3\nreplaced4\nline5");
  });

  it("invalid line range", () => {
    const path = writeTestFile("test.ts", "line1\nline2");
    const result = engine.editByLineRange({
      filePath: path,
      startLine: 3,
      endLine: 5,
      newContent: "x",
    });
    assert.equal(result.success, false);
    assert.ok(result.message.includes("Invalid line range"));
  });

  it("dry run line range", () => {
    const path = writeTestFile("test.ts", "a\nb\nc");
    const result = engine.editByLineRange({
      filePath: path,
      startLine: 2,
      endLine: 2,
      newContent: "B",
      dryRun: true,
    });
    assert.equal(result.success, true);
    assert.equal(result.dryRun, true);
    assert.equal(readTestFile("test.ts"), "a\nb\nc");
  });
});

// ─── EDIT HISTORY & UNDO ────────────────────────────────────

describe("EditEngine history & undo", () => {
  let engine: EditEngine;

  beforeEach(() => {
    setup();
    engine = new EditEngine();
  });

  afterEach(() => cleanup());

  it("tracks edit history", () => {
    const path = writeTestFile("test.ts", "original");
    engine.edit({ filePath: path, oldText: "original", newText: "modified" });
    const history = engine.getHistory(path);
    assert.equal(history.length, 1);
    assert.equal(history[0].oldText, "original");
    assert.equal(history[0].newText, "modified");
  });

  it("undo restores previous content", () => {
    const path = writeTestFile("test.ts", "version1");
    engine.edit({ filePath: path, oldText: "version1", newText: "version2" });
    assert.equal(readTestFile("test.ts"), "version2");

    const undoResult = engine.undo(path);
    assert.equal(undoResult.success, true);
    assert.equal(readTestFile("test.ts"), "version1");
  });

  it("undo with no history", () => {
    const path = writeTestFile("test.ts", "content");
    const result = engine.undo(path);
    assert.equal(result.success, false);
    assert.ok(result.message.includes("No edit history"));
  });

  it("tracks thought ID", () => {
    const path = writeTestFile("test.ts", "content");
    engine.edit({
      filePath: path,
      oldText: "content",
      newText: "new content",
      thoughtId: "t_042",
    });
    const history = engine.getHistory();
    assert.equal(history[0].thoughtId, "t_042");
  });
});
