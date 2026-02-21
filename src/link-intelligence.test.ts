/**
 * FOREMAN — Link Intelligence Tests
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyUrl, LinkIntelligence } from "./link-intelligence.js";

// ─── URL CLASSIFICATION ──────────────────────────────────────

describe("classifyUrl", () => {
  it("classifies GitHub issues", () => {
    const result = classifyUrl("https://github.com/SovranAMR/foreman/issues/42");
    assert.equal(result.kind, "github-issue");
    assert.equal(result.parts.owner, "SovranAMR");
    assert.equal(result.parts.repo, "foreman");
    assert.equal(result.parts.number, "42");
  });

  it("classifies GitHub PRs", () => {
    const result = classifyUrl("https://github.com/facebook/react/pull/123");
    assert.equal(result.kind, "github-pr");
    assert.equal(result.parts.owner, "facebook");
    assert.equal(result.parts.repo, "react");
    assert.equal(result.parts.number, "123");
  });

  it("classifies GitHub repos", () => {
    const result = classifyUrl("https://github.com/SovranAMR/foreman");
    assert.equal(result.kind, "github-repo");
    assert.equal(result.parts.owner, "SovranAMR");
    assert.equal(result.parts.repo, "foreman");
  });

  it("classifies GitHub file links", () => {
    const result = classifyUrl("https://github.com/SovranAMR/foreman/blob/main/src/types.ts");
    assert.equal(result.kind, "github-file");
    assert.equal(result.parts.ref, "main");
    assert.equal(result.parts.path, "src/types.ts");
  });

  it("classifies npm packages", () => {
    const result = classifyUrl("https://www.npmjs.com/package/typescript");
    assert.equal(result.kind, "npm-package");
    assert.equal(result.parts.package, "typescript");
  });

  it("classifies scoped npm packages", () => {
    const result = classifyUrl("https://www.npmjs.com/package/@sinclair/typebox");
    assert.equal(result.kind, "npm-package");
    assert.equal(result.parts.package, "@sinclair/typebox");
  });

  it("classifies Stack Overflow", () => {
    const result = classifyUrl("https://stackoverflow.com/questions/12345678/some-question");
    assert.equal(result.kind, "stackoverflow");
    assert.equal(result.parts.questionId, "12345678");
  });

  it("classifies documentation sites", () => {
    const result = classifyUrl("https://developer.mozilla.org/en-US/docs/Web/API/fetch");
    assert.equal(result.kind, "documentation");
  });

  it("classifies API endpoints", () => {
    const result = classifyUrl("https://api.example.com/v1/users");
    assert.equal(result.kind, "api");
  });

  it("classifies generic webpages", () => {
    const result = classifyUrl("https://example.com/blog/post");
    assert.equal(result.kind, "webpage");
  });

  it("handles invalid URLs", () => {
    const result = classifyUrl("not-a-url");
    assert.equal(result.kind, "unknown");
  });
});

// ─── LINK INTELLIGENCE ───────────────────────────────────────

describe("LinkIntelligence", () => {
  it("fetches npm package info", async () => {
    const engine = new LinkIntelligence();
    const result = await engine.fetch("https://www.npmjs.com/package/typescript");

    assert.equal(result.kind, "npm-package");
    assert.ok(result.title.includes("typescript"), `Title should include typescript: ${result.title}`);
    assert.ok(result.metadata.version, "Should have version");
    assert.equal(result.cached, false);
  });

  it("caches repeated fetches", async () => {
    const engine = new LinkIntelligence();

    const first = await engine.fetch("https://www.npmjs.com/package/typescript");
    assert.equal(first.cached, false);

    const second = await engine.fetch("https://www.npmjs.com/package/typescript");
    assert.equal(second.cached, true);
  });

  it("classify without fetching", () => {
    const engine = new LinkIntelligence();
    const result = engine.classify("https://github.com/SovranAMR/foreman/issues/1");
    assert.equal(result.kind, "github-issue");
  });

  it("handles fetch errors gracefully", async () => {
    const engine = new LinkIntelligence();
    const result = await engine.fetch("https://api.github.com/repos/nonexistent-user-xxx/nonexistent-repo-yyy/issues/99999");
    // Should not throw — returns fallback content
    assert.ok(result.summary.includes("Failed") || result.metadata.error === true || result.title);
  });

  it("cache stats work", () => {
    const engine = new LinkIntelligence();
    const stats = engine.cacheStats();
    assert.equal(stats.size, 0);
  });

  it("clear cache works", async () => {
    const engine = new LinkIntelligence();
    await engine.fetch("https://www.npmjs.com/package/typescript");
    assert.ok(engine.cacheStats().size > 0);
    engine.clearCache();
    assert.equal(engine.cacheStats().size, 0);
  });

  it("fetches GitHub repo info", async () => {
    const engine = new LinkIntelligence();
    const result = await engine.fetch("https://github.com/SovranAMR/foreman");
    assert.equal(result.kind, "github-repo");
    assert.ok(result.title.includes("foreman") || result.title.includes("SovranAMR"));
  });
});
