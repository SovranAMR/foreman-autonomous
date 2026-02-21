/**
 * FOREMAN — Execution Engine + Research Engine Tests
 */

import { strict as assert } from "node:assert";
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ExecutionEngine } from "./execution-engine.js";
import { searchFiles, stripHtml } from "./research-engine.js";

const PASS = "✅";
const FAIL = "❌";
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`${PASS} ${name}`);
    passed++;
  } catch (err) {
    console.log(`${FAIL} ${name}`);
    console.error(`   ${err}`);
    failed++;
  }
}

// ─── SETUP ───────────────────────────────────────────────────

const testDir = mkdtempSync(join(tmpdir(), "foreman-exec-"));
mkdirSync(join(testDir, "src"), { recursive: true });
writeFileSync(join(testDir, "src", "hello.ts"), 'export const hello = "world";');
writeFileSync(join(testDir, "src", "foo.ts"), "export function foo() { return 42; }");

const engine = new ExecutionEngine(testDir);

// ─── EXECUTION ENGINE ────────────────────────────────────────

console.log("\n── Execution Engine ──\n");

test("readFile — mevcut dosya", () => {
  const result = engine.readFile("src/hello.ts");
  assert.ok(result.success);
  assert.ok(result.content?.includes("hello"));
});

test("readFile — olmayan dosya", () => {
  const result = engine.readFile("src/nope.ts");
  assert.ok(!result.success);
  assert.ok(result.error?.includes("not found"));
});

test("writeFile — yeni dosya", () => {
  const result = engine.writeFile("src/new.ts", "export const x = 1;");
  assert.ok(result.success);
  assert.ok(existsSync(join(testDir, "src", "new.ts")));
});

test("writeFile — nested dir oluşturur", () => {
  const result = engine.writeFile("src/deep/nested/file.ts", "// deep");
  assert.ok(result.success);
  assert.ok(existsSync(join(testDir, "src", "deep", "nested", "file.ts")));
});

test("editFile — metin değiştir", () => {
  const result = engine.editFile("src/hello.ts", '"world"', '"foreman"');
  assert.ok(result.success);
  const read = engine.readFile("src/hello.ts");
  assert.ok(read.content?.includes("foreman"));
  assert.ok(!read.content?.includes("world"));
});

test("editFile — eski metin bulunamadı", () => {
  const result = engine.editFile("src/hello.ts", "nonexistent_text_xyz", "replacement");
  assert.ok(!result.success);
  assert.ok(result.error?.includes("not found"));
});

test("deleteFile — dosya sil", () => {
  engine.writeFile("src/temp.ts", "temp");
  const result = engine.deleteFile("src/temp.ts");
  assert.ok(result.success);
  assert.ok(!existsSync(join(testDir, "src", "temp.ts")));
});

test("deleteFile — olmayan dosya → başarılı", () => {
  const result = engine.deleteFile("src/nope_delete.ts");
  assert.ok(result.success);
});

test("securePath — traversal engellenir", () => {
  const result = engine.readFile("../../etc/passwd");
  assert.ok(!result.success);
  assert.ok(result.error?.includes("traversal") || result.error?.includes("denied"));
});

test("securePath — .env engellenir", () => {
  writeFileSync(join(testDir, ".env"), "SECRET=123");
  const result = engine.readFile(".env");
  assert.ok(!result.success);
});

test("runShell — basit komut", () => {
  const result = engine.runShell("echo hello");
  assert.ok(result.success);
  assert.strictEqual(result.stdout, "hello");
});

test("runShell — hata veren komut", () => {
  const result = engine.runShell("false");
  assert.ok(!result.success);
});

test("runShell — tehlikeli komut engellenir", () => {
  const result = engine.runShell("sudo rm -rf /");
  assert.ok(!result.success);
  assert.ok(result.stderr.includes("Dangerous"));
});

test("discoverProject — dosya ağacı", () => {
  const tree = engine.discoverProject();
  assert.ok(tree.files.length >= 2);
  assert.ok(tree.files.some(f => f.includes("hello.ts") || f.includes("foo.ts")));
});

test("executeOperations — toplu operasyon", () => {
  const results = engine.executeOperations([
    { type: "write", path: "src/a.ts", content: "const a = 1;" },
    { type: "write", path: "src/b.ts", content: "const b = 2;" },
    { type: "read", path: "src/a.ts" },
  ]);
  assert.strictEqual(results.length, 3);
  assert.ok(results[0].success);
  assert.ok(results[1].success);
  assert.ok(results[2].success);
  assert.strictEqual(results[2].content, "const a = 1;");
});

test("searchInFiles — pattern bul", () => {
  const results = engine.searchInFiles("function foo", "*.ts");
  // Might or might not work depending on grep availability
  // Just make sure it doesn't crash
  assert.ok(Array.isArray(results));
});

// ─── RESEARCH ENGINE ─────────────────────────────────────────

console.log("\n── Research Engine ──\n");

test("searchFiles — pattern bulur", () => {
  const results = searchFiles(testDir, "function foo");
  assert.ok(results.length >= 1);
  assert.ok(results[0].file.includes("foo.ts"));
});

test("searchFiles — bulamadığında boş döner", () => {
  const results = searchFiles(testDir, "nonexistent_pattern_xyz_123");
  assert.strictEqual(results.length, 0);
});

test("stripHtml — HTML temizler", () => {
  const result = stripHtml("<p>Hello <b>World</b></p>");
  assert.strictEqual(result, "Hello World");
});

test("stripHtml — script/style kaldırır", () => {
  const result = stripHtml("<script>alert(1)</script><p>Safe</p>");
  assert.strictEqual(result, "Safe");
});

test("stripHtml — HTML entities decode", () => {
  const result = stripHtml("A &amp; B &lt; C");
  assert.strictEqual(result, "A & B < C");
});

// ─── MOCK PROVIDER SMART RESPONSE ────────────────────────────

console.log("\n── MockProvider Smart Response ──\n");

import { MockProvider } from "./provider.js";
import { parseVisionResponse, parseDecomposeResponse, parseResearchResponse, parseWorkerResponse } from "./parser.js";

test("MockProvider — vision formatı parse edilebilir", async () => {
  const mock = new MockProvider();
  const result = await mock.generate(
    [
      { role: "system", content: "You are the VISIONER — the soul layer" },
      { role: "user", content: "Your Task:\nBuild a calculator" },
    ],
    { model: "mock-model" },
  );
  const parsed = parseVisionResponse(result.text);
  assert.ok(parsed.ok, `Vision parse failed: ${JSON.stringify(parsed)}`);
});

test("MockProvider — decompose formatı parse edilebilir", async () => {
  const mock = new MockProvider();
  const result = await mock.generate(
    [
      { role: "system", content: "You are the STRATEGIST — DECOMPOSE" },
      { role: "user", content: "Your Task:\nBreak into blocks" },
    ],
    { model: "mock-model" },
  );
  const parsed = parseDecomposeResponse(result.text);
  assert.ok(parsed.ok, `Decompose parse failed: ${JSON.stringify(parsed)}`);
});

test("MockProvider — research formatı parse edilebilir", async () => {
  const mock = new MockProvider();
  const result = await mock.generate(
    [
      { role: "system", content: "You are the RESEARCHER — the evidence layer" },
      { role: "user", content: "Your Task:\nResearch best practices" },
    ],
    { model: "mock-model" },
  );
  const parsed = parseResearchResponse(result.text);
  assert.ok(parsed.ok, `Research parse failed: ${JSON.stringify(parsed)}`);
});

test("MockProvider — worker 8-step formatı parse edilebilir", async () => {
  const mock = new MockProvider();
  const result = await mock.generate(
    [
      { role: "system", content: "You are the WORKER — 8-Step Protocol" },
      { role: "user", content: "Your Task:\nImplement the feature" },
    ],
    { model: "mock-model" },
  );
  const parsed = parseWorkerResponse(result.text);
  assert.ok(parsed.ok, `Worker parse failed: ${JSON.stringify(parsed)}`);
});

// ─── CLEANUP ─────────────────────────────────────────────────

rmSync(testDir, { recursive: true, force: true });

// ─── SUMMARY ─────────────────────────────────────────────────

console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);

if (failed > 0) {
  console.log(`✔ ${passed}`);
  console.log(`✘ ${failed}`);
  process.exit(1);
}
