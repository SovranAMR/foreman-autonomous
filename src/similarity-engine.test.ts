/**
 * FOREMAN — Similarity Engine Tests
 *
 * Tests for local TF-IDF + n-gram similarity computation.
 * No mocks, no external APIs — pure math.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  tokenize,
  ngrams,
  TfIdfVectorizer,
  cosineSimilarity,
  ngramSimilarity,
  SimilarityEngine,
} from "./similarity-engine.js";

// ─── TOKENIZATION ────────────────────────────────────────────

describe("tokenize", () => {
  it("splits camelCase", () => {
    const tokens = tokenize("backgroundColor");
    assert.ok(tokens.includes("background"));
    assert.ok(tokens.includes("color"));
  });

  it("splits snake_case", () => {
    const tokens = tokenize("background_color");
    assert.ok(tokens.includes("background"));
    assert.ok(tokens.includes("color"));
  });

  it("splits kebab-case", () => {
    const tokens = tokenize("font-size");
    assert.ok(tokens.includes("font"));
    assert.ok(tokens.includes("size"));
  });

  it("lowercases", () => {
    const tokens = tokenize("TypeScript ESM");
    assert.ok(tokens.includes("script"));
    assert.ok(tokens.includes("esm"));
  });

  it("removes stop words", () => {
    const tokens = tokenize("the function is not working");
    assert.ok(!tokens.includes("the"));
    assert.ok(!tokens.includes("is"));
    assert.ok(!tokens.includes("not"));
    assert.ok(tokens.includes("working"));
  });

  it("removes short tokens", () => {
    const tokens = tokenize("a b cd ef");
    assert.ok(!tokens.includes("a"));
    assert.ok(!tokens.includes("b"));
    assert.ok(tokens.includes("cd"));
    assert.ok(tokens.includes("ef"));
  });

  it("handles empty string", () => {
    assert.deepEqual(tokenize(""), []);
  });

  it("handles code-like text", () => {
    const tokens = tokenize("npm install @mozilla/readability linkedom");
    assert.ok(tokens.includes("npm"));
    assert.ok(tokens.includes("install"));
    assert.ok(tokens.includes("readability"));
    assert.ok(tokens.includes("linkedom"));
  });
});

// ─── N-GRAMS ─────────────────────────────────────────────────

describe("ngrams", () => {
  it("generates character trigrams", () => {
    const grams = ngrams("hello");
    assert.ok(grams.has("hel"));
    assert.ok(grams.has("ell"));
    assert.ok(grams.has("llo"));
    assert.equal(grams.size, 3);
  });

  it("normalizes whitespace", () => {
    const grams = ngrams("a  b");
    assert.ok(grams.has("a b"));
  });

  it("handles short text", () => {
    assert.equal(ngrams("ab").size, 0);
    assert.equal(ngrams("abc").size, 1);
  });

  it("handles empty string", () => {
    assert.equal(ngrams("").size, 0);
  });
});

// ─── TF-IDF VECTORIZER ──────────────────────────────────────

describe("TfIdfVectorizer", () => {
  it("builds vocabulary from documents", () => {
    const v = new TfIdfVectorizer();
    v.addDocument("TypeScript is great for web development");
    v.addDocument("Python is great for machine learning");

    const stats = v.stats();
    assert.equal(stats.docCount, 2);
    assert.ok(stats.vocabSize > 0);
  });

  it("vectorizes text with TF-IDF weights", () => {
    const v = new TfIdfVectorizer();
    v.addDocument("TypeScript web development");
    v.addDocument("Python machine learning");
    v.addDocument("TypeScript type safety compiler");

    const vec = v.vectorize("TypeScript compiler");

    // "compiler" appears in only 1 doc → high IDF → positive weight
    const compilerWeight = vec.get("compiler") ?? 0;
    assert.ok(compilerWeight > 0, "compiler should have positive weight (rare term)");

    // "typescript" appears in 2/3 docs → low IDF → near-zero or zero weight
    // This is correct TF-IDF behavior: common terms are less discriminative
    const tsWeight = vec.get("typescript") ?? 0;
    assert.ok(tsWeight <= compilerWeight,
      `Common term 'typescript' (${tsWeight.toFixed(3)}) should weigh ≤ rare 'compiler' (${compilerWeight.toFixed(3)})`);
  });

  it("rare terms get higher IDF", () => {
    const v = new TfIdfVectorizer();
    // "error" appears in all 3 docs, "segfault" in only 1
    v.addDocument("error in module loader");
    v.addDocument("error in network handler");
    v.addDocument("segfault error in native binding");

    const vec = v.vectorize("segfault error");
    const errorWeight = vec.get("error") ?? 0;
    const segfaultWeight = vec.get("segfault") ?? 0;

    // segfault should have higher weight (rarer term)
    assert.ok(segfaultWeight > errorWeight,
      `segfault (${segfaultWeight.toFixed(3)}) should weigh more than error (${errorWeight.toFixed(3)})`);
  });

  it("handles empty text", () => {
    const v = new TfIdfVectorizer();
    v.addDocument("hello world");
    const vec = v.vectorize("");
    assert.equal(vec.size, 0);
  });
});

// ─── COSINE SIMILARITY ──────────────────────────────────────

describe("cosineSimilarity", () => {
  it("identical vectors = 1.0", () => {
    const vec = new Map([["hello", 1], ["world", 1]]);
    assert.ok(Math.abs(cosineSimilarity(vec, vec) - 1.0) < 0.001);
  });

  it("orthogonal vectors = 0.0", () => {
    const a = new Map([["hello", 1]]);
    const b = new Map([["world", 1]]);
    assert.equal(cosineSimilarity(a, b), 0);
  });

  it("partial overlap = between 0 and 1", () => {
    const a = new Map([["hello", 1], ["world", 1]]);
    const b = new Map([["hello", 1], ["there", 1]]);
    const sim = cosineSimilarity(a, b);
    assert.ok(sim > 0 && sim < 1, `Expected 0 < ${sim} < 1`);
  });

  it("empty vectors = 0", () => {
    assert.equal(cosineSimilarity(new Map(), new Map()), 0);
    assert.equal(cosineSimilarity(new Map([["a", 1]]), new Map()), 0);
  });
});

// ─── N-GRAM SIMILARITY ──────────────────────────────────────

describe("ngramSimilarity", () => {
  it("identical text = 1.0", () => {
    assert.ok(Math.abs(ngramSimilarity("hello world", "hello world") - 1.0) < 0.001);
  });

  it("completely different text = 0 or near-0", () => {
    const sim = ngramSimilarity("xyz", "abc");
    assert.ok(sim < 0.1, `Expected near-zero, got ${sim}`);
  });

  it("similar text = moderate score", () => {
    const sim = ngramSimilarity("backgroundColor", "background-color");
    assert.ok(sim > 0.3, `Expected > 0.3, got ${sim}`);
  });

  it("handles empty strings", () => {
    assert.equal(ngramSimilarity("", "hello"), 0);
    assert.equal(ngramSimilarity("hello", ""), 0);
  });
});

// ─── SIMILARITY ENGINE (COMPOSITE) ──────────────────────────

describe("SimilarityEngine", () => {
  it("indexes and searches documents", () => {
    const engine = new SimilarityEngine();

    engine.index("mem_001", "No Three.js — 300KB bundle savings for performance");
    engine.index("mem_002", "Mobile-first design, no hover effects");
    engine.index("mem_003", "Canvas2D is better than SVG for hero animation");
    engine.index("mem_004", "Lenis scroll library causes Safari flicker, removed");
    engine.index("mem_005", "Dark theme: #1A1A1A background with #F5A623 gold accents");
    engine.reindex();

    const results = engine.search("bundle size performance");
    assert.ok(results.length > 0);
    assert.equal(results[0].id, "mem_001"); // Most relevant to "bundle size performance"
  });

  it("finds correct match for code terms", () => {
    const engine = new SimilarityEngine();

    engine.index("d1", "TypeScript ESM strict typing no any keyword");
    engine.index("d2", "Python Flask REST API backend server");
    engine.index("d3", "React hooks useState useEffect component lifecycle");
    engine.reindex();

    const results = engine.search("typescript strict type checking");
    assert.ok(results.length > 0);
    assert.equal(results[0].id, "d1");
  });

  it("finds correct match for error patterns", () => {
    const engine = new SimilarityEngine();

    engine.index("e1", "ENOENT error when reading config file at startup");
    engine.index("e2", "SIGTERM timeout during npm install on slow network");
    engine.index("e3", "Memory leak in event listener cleanup on unmount");
    engine.reindex();

    const results = engine.search("file not found ENOENT");
    assert.ok(results.length > 0);
    assert.equal(results[0].id, "e1");
  });

  it("deduplication detection", () => {
    const engine = new SimilarityEngine();

    engine.index("orig", "No Three.js library — saves 300KB in bundle size");
    engine.reindex();

    // Near-identical rephrasing
    const dup = engine.hasDuplicate("No Three.js — saves 300KB bundle size");
    assert.ok(dup.isDuplicate, `Expected duplicate, score=${dup.score}`);
    assert.equal(dup.matchId, "orig");
  });

  it("non-duplicate detection", () => {
    const engine = new SimilarityEngine();

    engine.index("orig", "TypeScript strict mode enabled");
    engine.reindex();

    const dup = engine.hasDuplicate("Python virtual environment setup");
    assert.ok(!dup.isDuplicate);
  });

  it("remove document from index", () => {
    const engine = new SimilarityEngine();

    engine.index("a", "hello world");
    engine.index("b", "goodbye world");
    engine.reindex();

    assert.ok(engine.remove("a"));
    const results = engine.search("hello");
    assert.ok(!results.some(r => r.id === "a"));
  });

  it("stats returns correct counts", () => {
    const engine = new SimilarityEngine();

    engine.index("a", "TypeScript strict");
    engine.index("b", "Python Flask");
    engine.index("c", "React hooks");

    const stats = engine.stats();
    assert.equal(stats.documentCount, 3);
    assert.ok(stats.vocabSize > 0);
  });

  it("respects minScore filter", () => {
    const engine = new SimilarityEngine();

    engine.index("a", "TypeScript compiler optimization");
    engine.index("b", "French cooking recipe for croissant");
    engine.reindex();

    const results = engine.search("TypeScript build", 10, 0.1);
    // "French cooking" should be filtered out (score < 0.1)
    assert.ok(!results.some(r => r.id === "b"),
      "Unrelated doc should be filtered by minScore");
  });

  it("handles single-document corpus", () => {
    const engine = new SimilarityEngine();

    engine.index("only", "The only document about TypeScript");
    engine.reindex();

    const results = engine.search("TypeScript");
    assert.ok(results.length > 0);
    assert.equal(results[0].id, "only");
  });

  it("handles empty query", () => {
    const engine = new SimilarityEngine();

    engine.index("a", "hello world");
    engine.reindex();

    const results = engine.search("");
    assert.equal(results.length, 0);
  });
});
