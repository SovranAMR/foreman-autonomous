/**
 * FOREMAN — Web Infrastructure Tests
 *
 * Tests for the transplanted OpenClaw web modules:
 *   - web-shared (cache, timeout, response reading)
 *   - web-fetch-utils (HTML→MD, truncation, entity decoding)
 *   - web-search-engine (Brave search — unit tests only, no API calls)
 *   - web-fetch-engine (SSRF guard, URL validation — unit tests only)
 *   - research-engine (file search, npm info — integration)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── WEB-SHARED TESTS ───────────────────────────────────────

describe("web-shared", async () => {
  const {
    resolveTimeoutSeconds,
    resolveCacheTtlMs,
    normalizeCacheKey,
    readCache,
    writeCache,
    withTimeout,
    readResponseText,
  } = await import("./web-shared.js");

  type CacheEntry<T> = { value: T; expiresAt: number; insertedAt: number };

  it("resolveTimeoutSeconds — valid number", () => {
    assert.equal(resolveTimeoutSeconds(10, 30), 10);
  });

  it("resolveTimeoutSeconds — invalid input uses fallback", () => {
    assert.equal(resolveTimeoutSeconds("abc", 30), 30);
    assert.equal(resolveTimeoutSeconds(undefined, 30), 30);
    assert.equal(resolveTimeoutSeconds(NaN, 30), 30);
  });

  it("resolveTimeoutSeconds — minimum 1 second", () => {
    assert.equal(resolveTimeoutSeconds(0, 30), 1); // 0 is finite → used, but clamped to 1
    assert.equal(resolveTimeoutSeconds(-5, 30), 1); // negative → clamped to 1
  });

  it("resolveCacheTtlMs — converts minutes to ms", () => {
    assert.equal(resolveCacheTtlMs(15, 15), 900_000);
    assert.equal(resolveCacheTtlMs(1, 15), 60_000);
  });

  it("resolveCacheTtlMs — invalid input uses fallback", () => {
    assert.equal(resolveCacheTtlMs(undefined, 15), 900_000);
    assert.equal(resolveCacheTtlMs("x", 15), 900_000);
  });

  it("normalizeCacheKey — trims and lowercases", () => {
    assert.equal(normalizeCacheKey("  Hello World  "), "hello world");
  });

  it("cache read/write — basic flow", () => {
    const cache = new Map<string, CacheEntry<string>>();
    writeCache(cache, "key1", "value1", 60_000);
    const result = readCache(cache, "key1");
    assert.ok(result);
    assert.equal(result.value, "value1");
    assert.equal(result.cached, true);
  });

  it("cache read — miss returns null", () => {
    const cache = new Map<string, CacheEntry<string>>();
    assert.equal(readCache(cache, "nonexistent"), null);
  });

  it("cache read — expired entry returns null and is deleted", () => {
    const cache = new Map<string, CacheEntry<string>>();
    cache.set("expired", {
      value: "old",
      expiresAt: Date.now() - 1000,
      insertedAt: Date.now() - 60_000,
    });
    assert.equal(readCache(cache, "expired"), null);
    assert.equal(cache.has("expired"), false);
  });

  it("cache write — TTL <= 0 skips caching", () => {
    const cache = new Map<string, CacheEntry<string>>();
    writeCache(cache, "key1", "value1", 0);
    assert.equal(cache.size, 0);
    writeCache(cache, "key2", "value2", -100);
    assert.equal(cache.size, 0);
  });

  it("cache write — evicts oldest at capacity", () => {
    const cache = new Map<string, CacheEntry<number>>();
    // Fill to capacity (100)
    for (let i = 0; i < 100; i++) {
      writeCache(cache, `key_${i}`, i, 60_000);
    }
    assert.equal(cache.size, 100);

    // 101st entry should evict the oldest (key_0)
    writeCache(cache, "key_new", 999, 60_000);
    assert.equal(cache.size, 100);
    assert.equal(cache.has("key_0"), false);
    assert.ok(readCache(cache, "key_new"));
  });

  it("withTimeout — returns AbortSignal", () => {
    const signal = withTimeout(undefined, 5000);
    assert.ok(signal instanceof AbortSignal);
    assert.equal(signal.aborted, false);
  });

  it("withTimeout — aborts after timeout", async () => {
    const signal = withTimeout(undefined, 10);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(signal.aborted, true);
  });
});

// ─── WEB-FETCH-UTILS TESTS ──────────────────────────────────

describe("web-fetch-utils", async () => {
  const { htmlToMarkdown, markdownToText, truncateText } = await import("./web-fetch-utils.js");

  it("htmlToMarkdown — extracts title", () => {
    const html = "<html><head><title>Test Page</title></head><body><p>Hello</p></body></html>";
    const result = htmlToMarkdown(html);
    assert.equal(result.title, "Test Page");
    assert.ok(result.text.includes("Hello"));
  });

  it("htmlToMarkdown — converts headings", () => {
    const html = "<h1>Main</h1><h2>Sub</h2><h3>SubSub</h3>";
    const result = htmlToMarkdown(html);
    assert.ok(result.text.includes("# Main"));
    assert.ok(result.text.includes("## Sub"));
    assert.ok(result.text.includes("### SubSub"));
  });

  it("htmlToMarkdown — converts links", () => {
    const html = '<a href="https://example.com">Example</a>';
    const result = htmlToMarkdown(html);
    assert.ok(result.text.includes("[Example](https://example.com)"));
  });

  it("htmlToMarkdown — converts list items", () => {
    const html = "<ul><li>First</li><li>Second</li></ul>";
    const result = htmlToMarkdown(html);
    assert.ok(result.text.includes("- First"));
    assert.ok(result.text.includes("- Second"));
  });

  it("htmlToMarkdown — strips script and style", () => {
    const html = "<script>alert('xss')</script><style>.x{}</style><p>Clean</p>";
    const result = htmlToMarkdown(html);
    assert.ok(!result.text.includes("alert"));
    assert.ok(!result.text.includes(".x{}"));
    assert.ok(result.text.includes("Clean"));
  });

  it("htmlToMarkdown — decodes entities", () => {
    const html = "<p>&amp; &lt; &gt; &quot; &#39; &nbsp;</p>";
    const result = htmlToMarkdown(html);
    assert.ok(result.text.includes("&"));
    assert.ok(result.text.includes("<"));
    assert.ok(result.text.includes(">"));
  });

  it("markdownToText — strips markdown formatting", () => {
    const md = "# Heading\n\n[Link](https://x.com)\n\n- Item 1\n- Item 2\n\n`code`";
    const result = markdownToText(md);
    assert.ok(!result.includes("#"));
    assert.ok(!result.includes("[Link]"));
    assert.ok(result.includes("Link"));
    assert.ok(!result.includes("- "));
    assert.ok(result.includes("Item 1"));
    assert.ok(!result.includes("`"));
    assert.ok(result.includes("code"));
  });

  it("markdownToText — strips images", () => {
    const md = "Before ![alt](img.png) After";
    const result = markdownToText(md);
    assert.ok(!result.includes("!["));
    assert.ok(result.includes("Before"));
    assert.ok(result.includes("After"));
  });

  it("truncateText — no truncation needed", () => {
    const result = truncateText("Hello", 100);
    assert.equal(result.text, "Hello");
    assert.equal(result.truncated, false);
  });

  it("truncateText — truncation needed", () => {
    const result = truncateText("Hello World", 5);
    assert.equal(result.text, "Hello");
    assert.equal(result.truncated, true);
  });

  it("truncateText — exact length", () => {
    const result = truncateText("Hello", 5);
    assert.equal(result.text, "Hello");
    assert.equal(result.truncated, false);
  });
});

// ─── WEB-SEARCH-ENGINE TESTS ─────────────────────────────────

describe("web-search-engine", async () => {
  const { quickSearch, clearSearchCache, searchCacheStats } = await import("./web-search-engine.js");

  it("quickSearch — returns empty without API key", async () => {
    // Don't set BRAVE_API_KEY — should return empty
    const original = process.env.BRAVE_API_KEY;
    delete process.env.BRAVE_API_KEY;
    const results = await quickSearch("test query");
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 0);
    if (original) process.env.BRAVE_API_KEY = original;
  });

  it("clearSearchCache — empties cache", () => {
    clearSearchCache();
    const stats = searchCacheStats();
    assert.equal(stats.size, 0);
  });

  it("searchCacheStats — returns stats", () => {
    const stats = searchCacheStats();
    assert.ok(typeof stats.size === "number");
    assert.ok(typeof stats.maxEntries === "number");
  });
});

// ─── WEB-FETCH-ENGINE TESTS ──────────────────────────────────

describe("web-fetch-engine", async () => {
  const { webFetch, clearFetchCache, fetchCacheStats } = await import("./web-fetch-engine.js");

  it("webFetch — rejects invalid URL", async () => {
    await assert.rejects(
      () => webFetch({ url: "not-a-url" }),
      { message: /Invalid URL/ },
    );
  });

  it("webFetch — rejects non-http protocol", async () => {
    await assert.rejects(
      () => webFetch({ url: "ftp://example.com/file" }),
      { message: /must be http or https/ },
    );
  });

  it("webFetch — blocks private IPs (127.0.0.1)", async () => {
    await assert.rejects(
      () => webFetch({ url: "http://127.0.0.1/secret" }),
      { message: /private\/internal/ },
    );
  });

  it("webFetch — blocks private IPs (10.x)", async () => {
    await assert.rejects(
      () => webFetch({ url: "http://10.0.0.1/admin" }),
      { message: /private\/internal/ },
    );
  });

  it("webFetch — blocks private IPs (192.168.x)", async () => {
    await assert.rejects(
      () => webFetch({ url: "http://192.168.1.1/router" }),
      { message: /private\/internal/ },
    );
  });

  it("webFetch — blocks localhost", async () => {
    await assert.rejects(
      () => webFetch({ url: "http://localhost:3000/api" }),
      { message: /private\/internal/ },
    );
  });

  it("clearFetchCache — empties cache", () => {
    clearFetchCache();
    const stats = fetchCacheStats();
    assert.equal(stats.size, 0);
  });
});

// ─── RESEARCH-ENGINE TESTS ───────────────────────────────────

describe("research-engine", async () => {
  const { searchFiles, npmInfo, stripHtml, research } = await import("./research-engine.js");

  it("searchFiles — finds pattern in project", () => {
    // Search for 'Engine' in foreman src
    const results = searchFiles("/home/sovranamr/projects/foreman", "Engine", "*.ts", 5);
    assert.ok(Array.isArray(results));
    // Should find at least one match (engine.ts, execution-engine.ts, etc.)
    assert.ok(results.length > 0, "Should find 'Engine' in project files");
    assert.ok(results[0].file);
    assert.ok(typeof results[0].line === "number");
    assert.ok(results[0].text);
  });

  it("searchFiles — returns empty for nonexistent pattern", () => {
    // Use a pattern that won't match anything, including this test file
    const results = searchFiles("/tmp", "XYZNONEXISTENT98765QWERTY", "*.ts");
    assert.equal(results.length, 0);
  });

  it("searchFiles — respects maxResults", () => {
    const results = searchFiles("/home/sovranamr/projects/foreman", "import", "*.ts", 3);
    assert.ok(results.length <= 3);
  });

  it("npmInfo — fetches real package info", async () => {
    const info = await npmInfo("commander");
    assert.ok(info.includes("commander"));
    assert.ok(info.includes("v"));
  });

  it("npmInfo — handles nonexistent package", async () => {
    const info = await npmInfo("this-package-definitely-does-not-exist-12345");
    assert.ok(info.includes("not found") || info.includes("Failed"));
  });

  it("stripHtml — removes tags and decodes entities", () => {
    const result = stripHtml("<p>Hello &amp; <strong>World</strong></p>");
    assert.equal(result, "Hello & World");
  });

  it("stripHtml — removes script tags", () => {
    const result = stripHtml("<script>evil()</script>Clean text");
    assert.ok(!result.includes("evil"));
    assert.ok(result.includes("Clean text"));
  });

  it("research — runs combined research", async () => {
    const result = await research({
      query: "Engine",
      projectRoot: "/home/sovranamr/projects/foreman",
      includeWeb: false, // Don't need API key for this test
      includeFiles: true,
      fileGlob: "*.ts",
    });

    assert.ok(result.query === "Engine");
    assert.ok(Array.isArray(result.webResults));
    assert.ok(Array.isArray(result.fileResults));
    assert.ok(result.fileResults.length > 0);
    assert.ok(typeof result.summary === "string");
    assert.ok(result.summary.includes("Project File Matches"));
  });

  it("research — handles no results gracefully", async () => {
    const result = await research({
      query: "XYZNONEXISTENT98765QWERTY",
      projectRoot: "/tmp",
      includeWeb: false,
      includeFiles: true,
    });

    assert.equal(result.fileResults.length, 0);
    assert.equal(result.summary, "No results found");
  });
});
