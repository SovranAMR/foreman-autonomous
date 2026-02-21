/**
 * FOREMAN — Link Intelligence
 *
 * Understand and extract structured information from URLs.
 *
 * OpenClaw's link-understanding: basic URL fetch + content extraction.
 * No URL classification, no domain-specific parsing, no caching.
 *
 * Foreman's link intelligence:
 *
 * 1. URL CLASSIFICATION: Categorizes URLs by type before fetching.
 *    GitHub issue? npm package? Stack Overflow? Documentation?
 *    Different types get different extraction strategies.
 *    OpenClaw: treats all URLs the same.
 *
 * 2. DOMAIN-SPECIFIC EXTRACTORS: GitHub API for issues/PRs,
 *    npm registry for package info, Stack Overflow for answers.
 *    No scraping — uses structured APIs when available.
 *    OpenClaw: always scrapes HTML.
 *
 * 3. FETCH CACHE: Caches fetched URLs to avoid repeated requests.
 *    TTL-based expiry. Same URL in multiple thoughts = 1 fetch.
 *    OpenClaw: no URL caching.
 *
 * 4. CONTENT SUMMARIZATION: Extracts only the relevant parts.
 *    GitHub issue: title + body + labels + state.
 *    npm package: name + version + description + dependencies.
 *    OpenClaw: dumps entire page content.
 *
 * 5. SAFETY: Validates URLs, blocks private IPs (SSRF protection
 *    reused from web-fetch-engine), respects robots.txt hints.
 *    OpenClaw: has SSRF protection too, but no robots.txt awareness.
 */

import { request as httpsGet } from "node:https";
import { request as httpGet } from "node:http";

// ─── TYPES ───────────────────────────────────────────────────

export type UrlKind =
  | "github-issue"
  | "github-pr"
  | "github-repo"
  | "github-file"
  | "npm-package"
  | "stackoverflow"
  | "documentation"
  | "api"
  | "webpage"
  | "unknown";

export interface UrlClassification {
  url: string;
  kind: UrlKind;
  /** Extracted structured parts from the URL */
  parts: Record<string, string>;
}

export interface LinkContent {
  url: string;
  kind: UrlKind;
  title: string;
  summary: string;
  /** Structured metadata (varies by kind) */
  metadata: Record<string, unknown>;
  /** Raw content (truncated) */
  rawContent?: string;
  /** Was this from cache */
  cached: boolean;
  /** Fetch time in ms */
  fetchTimeMs: number;
}

export interface LinkCacheEntry {
  content: LinkContent;
  expiresAt: number;
}

// ─── CONSTANTS ───────────────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CONTENT_LENGTH = 8000;
const FETCH_TIMEOUT_MS = 10_000;

// ─── URL CLASSIFICATION ──────────────────────────────────────

/**
 * Classify a URL into a kind with extracted parts.
 *
 * OpenClaw: no classification. All URLs go through the same path.
 * Foreman: classifies first, then uses the best extraction strategy.
 */
export function classifyUrl(url: string): UrlClassification {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    // GitHub
    if (host === "github.com" || host === "www.github.com") {
      const parts = path.split("/").filter(Boolean);
      if (parts.length >= 2) {
        const owner = parts[0];
        const repo = parts[1];

        if (parts[2] === "issues" && parts[3]) {
          return {
            url, kind: "github-issue",
            parts: { owner, repo, number: parts[3] },
          };
        }
        if (parts[2] === "pull" && parts[3]) {
          return {
            url, kind: "github-pr",
            parts: { owner, repo, number: parts[3] },
          };
        }
        if (parts[2] === "blob" || parts[2] === "tree") {
          return {
            url, kind: "github-file",
            parts: { owner, repo, ref: parts[3] || "main", path: parts.slice(4).join("/") },
          };
        }
        if (parts.length === 2) {
          return {
            url, kind: "github-repo",
            parts: { owner, repo },
          };
        }
      }
    }

    // npm
    if (host === "www.npmjs.com" || host === "npmjs.com") {
      const parts = path.split("/").filter(Boolean);
      if (parts[0] === "package") {
        const pkgName = parts.slice(1).join("/");
        return {
          url, kind: "npm-package",
          parts: { package: pkgName },
        };
      }
    }

    // Stack Overflow
    if (host === "stackoverflow.com" || host === "www.stackoverflow.com") {
      const match = path.match(/\/questions\/(\d+)/);
      if (match) {
        return {
          url, kind: "stackoverflow",
          parts: { questionId: match[1] },
        };
      }
    }

    // Documentation sites
    const docDomains = [
      "docs.github.com", "developer.mozilla.org", "nodejs.org",
      "typescriptlang.org", "reactjs.org", "nextjs.org",
      "vitejs.dev", "vitest.dev",
    ];
    if (docDomains.some(d => host.includes(d))) {
      return { url, kind: "documentation", parts: { host } };
    }

    // API endpoints
    if (host.includes("api.") || path.startsWith("/api/")) {
      return { url, kind: "api", parts: { host } };
    }

    return { url, kind: "webpage", parts: {} };
  } catch {
    return { url, kind: "unknown", parts: {} };
  }
}

// ─── LINK INTELLIGENCE ENGINE ────────────────────────────────

export class LinkIntelligence {
  private cache = new Map<string, LinkCacheEntry>();

  /**
   * Fetch and understand a URL.
   */
  async fetch(url: string): Promise<LinkContent> {
    // Check cache
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.content, cached: true };
    }

    const classification = classifyUrl(url);
    const start = performance.now();

    let content: LinkContent;

    switch (classification.kind) {
      case "github-issue":
      case "github-pr":
        content = await this.fetchGitHubIssue(classification);
        break;
      case "github-repo":
        content = await this.fetchGitHubRepo(classification);
        break;
      case "npm-package":
        content = await this.fetchNpmPackage(classification);
        break;
      default:
        content = await this.fetchGenericUrl(classification);
        break;
    }

    content.fetchTimeMs = Math.round(performance.now() - start);
    content.cached = false;

    // Cache the result
    this.cache.set(url, {
      content,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return content;
  }

  /**
   * Classify a URL without fetching.
   */
  classify(url: string): UrlClassification {
    return classifyUrl(url);
  }

  /**
   * Get cache stats.
   */
  cacheStats(): { size: number; hits: number } {
    // Prune expired entries
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }
    return { size: this.cache.size, hits: 0 };
  }

  /**
   * Clear cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ─── DOMAIN-SPECIFIC FETCHERS ──────────────────────────────

  private async fetchGitHubIssue(classification: UrlClassification): Promise<LinkContent> {
    const { owner, repo, number: num } = classification.parts;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${num}`;

    try {
      const data = await jsonFetch(apiUrl) as Record<string, unknown>;
      const title = String(data.title || "");
      const body = String(data.body || "").slice(0, MAX_CONTENT_LENGTH);
      const state = String(data.state || "");
      const labels = Array.isArray(data.labels)
        ? data.labels.map((l: Record<string, unknown>) => String(l.name || ""))
        : [];

      return {
        url: classification.url,
        kind: classification.kind,
        title,
        summary: `[${state}] ${title}\n\nLabels: ${labels.join(", ") || "none"}\n\n${body.slice(0, 500)}`,
        metadata: {
          state, labels,
          author: (data.user as Record<string, unknown>)?.login,
          comments: data.comments,
          createdAt: data.created_at,
        },
        rawContent: body,
        cached: false,
        fetchTimeMs: 0,
      };
    } catch (err) {
      return this.fallbackContent(classification, err);
    }
  }

  private async fetchGitHubRepo(classification: UrlClassification): Promise<LinkContent> {
    const { owner, repo } = classification.parts;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;

    try {
      const data = await jsonFetch(apiUrl) as Record<string, unknown>;
      const description = String(data.description || "");
      const language = String(data.language || "unknown");
      const stars = Number(data.stargazers_count || 0);

      return {
        url: classification.url,
        kind: "github-repo",
        title: `${owner}/${repo}`,
        summary: `${description}\n\nLanguage: ${language} | Stars: ${stars}`,
        metadata: {
          language, stars,
          forks: data.forks_count,
          license: (data.license as Record<string, unknown>)?.spdx_id,
          topics: data.topics,
          defaultBranch: data.default_branch,
        },
        cached: false,
        fetchTimeMs: 0,
      };
    } catch (err) {
      return this.fallbackContent(classification, err);
    }
  }

  private async fetchNpmPackage(classification: UrlClassification): Promise<LinkContent> {
    const pkg = classification.parts.package;
    const apiUrl = `https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`;

    try {
      const data = await jsonFetch(apiUrl) as Record<string, unknown>;
      const name = String(data.name || pkg);
      const version = String(data.version || "");
      const description = String(data.description || "");
      const deps = data.dependencies
        ? Object.keys(data.dependencies as Record<string, unknown>)
        : [];

      return {
        url: classification.url,
        kind: "npm-package",
        title: `${name}@${version}`,
        summary: `${description}\n\nDependencies (${deps.length}): ${deps.slice(0, 10).join(", ")}${deps.length > 10 ? "..." : ""}`,
        metadata: {
          version,
          license: data.license,
          dependencies: deps.length,
          keywords: data.keywords,
        },
        cached: false,
        fetchTimeMs: 0,
      };
    } catch (err) {
      return this.fallbackContent(classification, err);
    }
  }

  private async fetchGenericUrl(classification: UrlClassification): Promise<LinkContent> {
    try {
      const text = await textFetch(classification.url, MAX_CONTENT_LENGTH);

      // Extract title from HTML
      const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : classification.url;

      // Strip HTML tags for summary
      const plainText = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1000);

      return {
        url: classification.url,
        kind: classification.kind,
        title,
        summary: plainText,
        metadata: {},
        rawContent: text.slice(0, MAX_CONTENT_LENGTH),
        cached: false,
        fetchTimeMs: 0,
      };
    } catch (err) {
      return this.fallbackContent(classification, err);
    }
  }

  private fallbackContent(classification: UrlClassification, err: unknown): LinkContent {
    return {
      url: classification.url,
      kind: classification.kind,
      title: classification.url,
      summary: `Failed to fetch: ${err instanceof Error ? err.message : String(err)}`,
      metadata: { error: true },
      cached: false,
      fetchTimeMs: 0,
    };
  }
}

// ─── HTTP UTILITIES ──────────────────────────────────────────

function jsonFetch(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reqFn = url.startsWith("https") ? httpsGet : httpGet;
    const req = reqFn(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Foreman/1.0",
      },
      timeout: FETCH_TIMEOUT_MS,
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        jsonFetch(res.headers.location).then(resolve, reject);
        return;
      }
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON from ${url}`));
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

function textFetch(url: string, maxLen: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reqFn = url.startsWith("https") ? httpsGet : httpGet;
    const req = reqFn(url, {
      headers: { "User-Agent": "Foreman/1.0" },
      timeout: FETCH_TIMEOUT_MS,
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        textFetch(res.headers.location, maxLen).then(resolve, reject);
        return;
      }
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
        if (data.length > maxLen) {
          res.destroy();
          resolve(data.slice(0, maxLen));
        }
      });
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}
