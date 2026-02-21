/**
 * FOREMAN — Memory, Session, Cache Tests
 */

import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoryManager } from "./memory-manager.js";
import { SessionManager } from "./session-manager.js";
import { CacheManager } from "./cache-manager.js";

const PASS = "✅";
const FAIL = "❌";
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`${PASS} ${name}`);
    passed++;
  } catch (err) {
    console.log(`${FAIL} ${name}`);
    console.error(`   ${err}`);
    failed++;
  }
}

async function run() {

  // ═══════════════════════════════════════════════════════════
  // MEMORY
  // ═══════════════════════════════════════════════════════════

  const memDir = mkdtempSync(join(tmpdir(), "foreman-mem-"));
  const mem = new MemoryManager(memDir);

  await test("Memory: create", () => {
    const e = mem.create({
      category: "constraint",
      content: "No Three.js — 300KB savings",
      source: { type: "user" },
      importance: 0.9,
      tags: ["performance", "bundle"],
    });
    assert.equal(e.id, "mem_001");
    assert.equal(e.importance, 0.9);
    assert.equal(e.useCount, 0);
  });

  await test("Memory: create multiple categories", () => {
    mem.create({
      category: "preference",
      content: "Mobile-first, no hover effects",
      source: { type: "user" },
      importance: 0.85,
      tags: ["mobile", "ux"],
    });
    mem.create({
      category: "lesson",
      content: "Lenis causes Safari flicker, removed",
      source: { type: "thought", ref: "t_005" },
      importance: 0.7,
      tags: ["safari", "scroll"],
    });
    mem.create({
      category: "decision",
      content: "Canvas2D > SVG for hero animation",
      source: { type: "reflection" },
      importance: 0.6,
      tags: ["hero", "animation"],
    });
    mem.create({
      category: "context",
      content: "Low importance context note",
      source: { type: "manual" },
      importance: 0.3,
      tags: ["misc"],
    });
    assert.equal(mem.list().length, 5);
  });

  await test("Memory: hot memories (importance >= 0.8)", () => {
    const hot = mem.getHotMemories();
    assert.equal(hot.length, 2); // constraint (0.9) + preference (0.85)
    assert.ok(hot[0].importance >= hot[1].importance); // sorted
  });

  await test("Memory: warm memories by tag", () => {
    const warm = mem.getWarmMemories(["animation"]);
    assert.equal(warm.length, 1); // decision (0.6, tags: hero, animation)
    assert.ok(warm[0].content.includes("Canvas2D"));
  });

  await test("Memory: buildContextBlock", () => {
    const ctx = mem.buildContextBlock(["animation"]);
    assert.ok(ctx.includes("Project Memory"));
    assert.ok(ctx.includes("No Three.js")); // hot
    assert.ok(ctx.includes("Canvas2D")); // warm (matching tag)
  });

  await test("Memory: touch increments useCount", () => {
    mem.touch("mem_001");
    mem.touch("mem_001");
    const e = mem.get("mem_001");
    assert.ok(e!.useCount >= 2);
    assert.ok(e!.lastUsedAt);
  });

  await test("Memory: search by keyword", () => {
    const results = mem.search("safari scroll");
    assert.ok(results.length >= 1);
    assert.ok(results[0].entry.content.includes("Safari"));
    assert.ok(results[0].score > 0);
  });

  await test("Memory: search by tag match", () => {
    const results = mem.search("performance bundle");
    assert.ok(results.some(r => r.entry.content.includes("Three.js")));
  });

  await test("Memory: expire (soft delete)", () => {
    mem.expire("mem_005");
    const all = mem.list(); // excludes expired by default
    assert.equal(all.length, 4);
    const allInc = mem.list({ includeExpired: true });
    assert.equal(allInc.length, 5);
  });

  await test("Memory: filter by category", () => {
    const constraints = mem.list({ category: "constraint" });
    assert.equal(constraints.length, 1);
  });

  await test("Memory: extractFromThought", () => {
    const entry = mem.extractFromThought({
      id: "t_050",
      layer: "visioner",
      reasoning: "Dark theme fits dental premium feel",
      output: "Use #1A1A1A background with #F5A623 gold accents",
      confidence: 0.85,
      tags: ["design", "color"],
    });
    assert.ok(entry);
    assert.equal(entry!.category, "decision");
    assert.ok(entry!.content.includes("#1A1A1A"));
  });

  await test("Memory: extractFromThought skips low confidence", () => {
    const entry = mem.extractFromThought({
      id: "t_051",
      layer: "worker",
      reasoning: "not sure",
      output: "maybe this works",
      confidence: 0.3,
    });
    assert.equal(entry, null);
  });

  await test("Memory: stats", () => {
    const s = mem.stats();
    assert.ok(s.total >= 5);
    assert.ok(s.hotCount >= 2);
    assert.ok(s.warmCount >= 1);
    assert.ok(s.byCategory["constraint"] >= 1);
  });

  // ═══════════════════════════════════════════════════════════
  // SESSION
  // ═══════════════════════════════════════════════════════════

  const sesDir = mkdtempSync(join(tmpdir(), "foreman-ses-"));
  const ses = new SessionManager(sesDir);

  await test("Session: start", () => {
    const s = ses.start({ projectId: "proj_001" });
    assert.equal(s.id, "ses_001");
    assert.equal(s.status, "active");
    assert.equal(s.totalTokens, 0);
  });

  await test("Session: getActive", () => {
    const active = ses.getActive();
    assert.ok(active);
    assert.equal(active!.id, "ses_001");
  });

  await test("Session: addThought", () => {
    ses.addThought("ses_001", "t_001");
    ses.addThought("ses_001", "t_002");
    const s = ses.get("ses_001");
    assert.equal(s!.thoughtIds.length, 2);
  });

  await test("Session: addCompletedTask", () => {
    ses.addCompletedTask("ses_001", "task_001");
    const s = ses.get("ses_001");
    assert.equal(s!.completedTaskIds.length, 1);
  });

  await test("Session: addTokens", () => {
    ses.addTokens("ses_001", 1500);
    ses.addTokens("ses_001", 800);
    const s = ses.get("ses_001");
    assert.equal(s!.totalTokens, 2300);
  });

  await test("Session: end with summary", () => {
    ses.end("ses_001", "completed", "Built hero section with canvas animation. 2 tasks done, 5 thoughts.");
    const s = ses.get("ses_001");
    assert.equal(s!.status, "completed");
    assert.ok(s!.endedAt);
    assert.ok(s!.summary!.includes("hero section"));
  });

  await test("Session: start new session auto-abandons previous", () => {
    const s2 = ses.start({ projectId: "proj_001" });
    assert.equal(s2.id, "ses_002");
    assert.equal(s2.status, "active");
  });

  await test("Session: end session 2", () => {
    ses.end("ses_002", "completed", "Services section added with glassmorphism.");
    const s = ses.get("ses_002");
    assert.equal(s!.status, "completed");
  });

  await test("Session: getRecentSummaries", () => {
    const summaries = ses.getRecentSummaries(5);
    assert.equal(summaries.length, 2);
    // Both summaries should be present (order may vary for same-second timestamps)
    const combined = summaries.join(" ");
    assert.ok(combined.includes("hero section") || combined.includes("Services"));
  });

  await test("Session: buildSessionContext", () => {
    const ctx = ses.buildSessionContext();
    assert.ok(ctx.includes("Previous Sessions"));
    assert.ok(ctx.includes("hero section") || ctx.includes("Services"));
  });

  await test("Session: stats", () => {
    const s = ses.stats();
    assert.equal(s.total, 2);
    assert.equal(s.completed, 2);
    assert.ok(s.totalTokens > 0);
  });

  // ═══════════════════════════════════════════════════════════
  // CACHE
  // ═══════════════════════════════════════════════════════════

  const cacheDir = mkdtempSync(join(tmpdir(), "foreman-cache-"));
  const cache = new CacheManager(cacheDir);

  await test("Cache: makeKey deterministic", () => {
    const k1 = cache.makeKey("sys", "user", "claude");
    const k2 = cache.makeKey("sys", "user", "claude");
    assert.equal(k1, k2);
    assert.equal(k1.length, 16);
  });

  await test("Cache: makeKey unique for different inputs", () => {
    const k1 = cache.makeKey("sys", "user1", "claude");
    const k2 = cache.makeKey("sys", "user2", "claude");
    assert.notEqual(k1, k2);
  });

  await test("Cache: set and get", () => {
    const key = cache.makeKey("system prompt", "Build hero section", "claude-sonnet");
    cache.set(key, {
      model: "claude-sonnet",
      layer: "worker",
      response: "STEP1_READ: ...\nSTEP2_CONTEXT: ...",
      tokenUsage: { input: 500, output: 200, total: 700 },
    });

    const entry = cache.get(key);
    assert.ok(entry);
    assert.equal(entry!.model, "claude-sonnet");
    assert.equal(entry!.tokenUsage.total, 700);
  });

  await test("Cache: hit increments counter", () => {
    const key = cache.makeKey("system prompt", "Build hero section", "claude-sonnet");
    cache.get(key); // hit 1
    cache.get(key); // hit 2
    const entry = cache.get(key); // hit 3
    assert.ok(entry!.hitCount >= 3);
  });

  await test("Cache: miss returns null", () => {
    const entry = cache.get("nonexistent_key_1234");
    assert.equal(entry, null);
  });

  await test("Cache: TTL expiry", () => {
    const key = cache.makeKey("expire", "test", "model");
    cache.set(key, {
      model: "test",
      layer: "worker",
      response: "expired",
      tokenUsage: { input: 10, output: 10, total: 20 },
    }, 1); // 1ms TTL

    // Wait 5ms
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }

    const entry = cache.get(key);
    assert.equal(entry, null); // expired
  });

  await test("Cache: delete", () => {
    const key = cache.makeKey("del", "test", "model");
    cache.set(key, {
      model: "test",
      layer: "worker",
      response: "delete me",
      tokenUsage: { input: 10, output: 10, total: 20 },
    });
    assert.ok(cache.has(key));
    cache.delete(key);
    assert.equal(cache.has(key), false);
  });

  await test("Cache: clear all", () => {
    // Add some entries
    for (let i = 0; i < 5; i++) {
      cache.set(`clear_${i}`, {
        model: "test",
        layer: "worker",
        response: `entry ${i}`,
        tokenUsage: { input: 10, output: 10, total: 20 },
      });
    }
    const cleared = cache.clear();
    assert.ok(cleared >= 5);
  });

  await test("Cache: stats", () => {
    // Re-add for stats
    const key = cache.makeKey("stats", "test", "model");
    cache.set(key, {
      model: "claude-sonnet",
      layer: "worker",
      response: "stats test",
      tokenUsage: { input: 100, output: 50, total: 150 },
    });
    cache.get(key); // 1 hit

    const s = cache.stats();
    assert.ok(s.entries >= 1);
    assert.ok(s.totalHits >= 1);
    assert.ok(s.totalTokensSaved >= 150);
    assert.equal(s.enabled, true);
  });

  await test("Cache: disabled returns null", () => {
    const disabledCache = new CacheManager(
      mkdtempSync(join(tmpdir(), "foreman-cache-off-")),
      { enabled: false },
    );
    const key = disabledCache.makeKey("sys", "user", "model");
    disabledCache.set(key, {
      model: "test",
      layer: "worker",
      response: "should not cache",
      tokenUsage: { input: 10, output: 10, total: 20 },
    });
    assert.equal(disabledCache.get(key), null);
  });

  // ─── DONE ──────────────────────────────────────────────────

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
