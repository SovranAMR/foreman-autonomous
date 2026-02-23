/**
 * FOREMAN — Research Engine
 *
 * Gives the researcher layer real research capabilities:
 * - Web search via Brave Search API (replaces fragile DuckDuckGo HTML scraping)
 * - URL fetch with content extraction (Readability → HTML→MD → raw)
 * - File system research (grep, pattern search)
 * - npm/package research
 *
 * This is the unified research interface for the orchestrator.
 * All web infrastructure lives in web-search-engine.ts and web-fetch-engine.ts.
 *
 * Research results are injected into the Researcher's prompt context.
 */

import { execSync } from "node:child_process";
import {
  braveSearch,
  quickSearch,
  type SearchResult,
  type SearchResponse,
} from "./web-search-engine.js";
import { webFetch, quickFetch, type FetchResponse } from "./web-fetch-engine.js";

// ─── TYPES ───────────────────────────────────────────────────

export type { SearchResult, SearchResponse } from "./web-search-engine.js";
export type { FetchResponse } from "./web-fetch-engine.js";

export interface FileSearchResult {
  file: string;
  line: number;
  text: string;
}

export interface ResearchContext {
  query: string;
  webResults: SearchResult[];
  fileResults: FileSearchResult[];
  fetchedContent: Array<{ url: string; text: string; title?: string }>;
  summary: string;
}

export interface ResearchConfig {
  /** Brave Search API key (or set BRAVE_API_KEY env) */
  braveApiKey?: string;
  /** Max web search results */
  maxSearchResults?: number;
  /** Max file search results */
  maxFileResults?: number;
  /** Max chars when fetching a URL */
  fetchMaxChars?: number;
  /** Search timeout in seconds */
  timeoutSeconds?: number;
  /** Cache TTL in minutes */
  cacheTtlMinutes?: number;
}

// ─── WEB SEARCH ──────────────────────────────────────────────

/**
 * Web search via Brave Search API.
 *
 * If API key is provided → full Brave Search with caching, region, freshness.
 * If no API key → returns empty (no fallback to unreliable scrapers).
 *
 * Design decision: we don't fall back to DuckDuckGo HTML scraping.
 * It's fragile, breaks randomly, and gives poor results.
 * Either use a proper API or don't search at all.
 */
export async function webSearch(
  query: string,
  config?: ResearchConfig,
): Promise<SearchResult[]> {
  const apiKey = config?.braveApiKey || process.env.BRAVE_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    const response = await braveSearch({
      query,
      apiKey,
      count: config?.maxSearchResults ?? 5,
      timeoutSeconds: config?.timeoutSeconds,
      cacheTtlMinutes: config?.cacheTtlMinutes,
    });
    return response.results;
  } catch {
    // Search failed — don't crash the pipeline
    return [];
  }
}

// ─── URL FETCH ───────────────────────────────────────────────

/**
 * Fetch content from a URL and return as readable text.
 *
 * Three-tier extraction:
 *   1. Readability (best) — @mozilla/readability
 *   2. HTML→Markdown (fallback) — regex-based
 *   3. Raw text (last resort)
 *
 * SSRF protected: won't fetch from private/internal IPs.
 */
export async function fetchUrl(
  url: string,
  config?: ResearchConfig,
): Promise<{ text: string; title?: string }> {
  try {
    const result = await webFetch({
      url,
      extractMode: "markdown",
      maxChars: config?.fetchMaxChars ?? 10_000,
      timeoutSeconds: config?.timeoutSeconds,
      cacheTtlMinutes: config?.cacheTtlMinutes,
    });
    return { text: result.text, title: result.title };
  } catch (err: any) {
    return { text: `[Fetch error: ${err.message}]` };
  }
}

// ─── NPM/PACKAGE RESEARCH ────────────────────────────────────

/**
 * Get information about an npm package.
 * Direct registry query — no API key needed.
 */
export async function npmInfo(packageName: string): Promise<string> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return `Package "${packageName}" not found`;

    const data = (await response.json()) as Record<string, any>;
    const parts: string[] = [];
    parts.push(`**${data.name}** v${data.version}`);
    if (data.description) parts.push(data.description);
    if (data.homepage) parts.push(`Homepage: ${data.homepage}`);
    if (data.repository?.url) parts.push(`Repo: ${data.repository.url}`);

    const depCount = Object.keys(data.dependencies ?? {}).length;
    const devDepCount = Object.keys(data.devDependencies ?? {}).length;
    parts.push(`Dependencies: ${depCount} runtime, ${devDepCount} dev`);

    return parts.join("\n");
  } catch {
    return `Failed to fetch npm info for "${packageName}"`;
  }
}

// ─── FILE SYSTEM RESEARCH ────────────────────────────────────

/**
 * Search for pattern in project files using grep.
 */
export function searchFiles(
  projectRoot: string,
  pattern: string,
  glob: string = "*.ts",
  maxResults: number = 20,
): FileSearchResult[] {
  try {
    const stdout = execSync(
      `grep -rn "${pattern.replace(/"/g, '\\"')}" --include="${glob}" . 2>/dev/null || true`,
      { cwd: projectRoot, encoding: "utf-8", timeout: 10_000, maxBuffer: 512 * 1024 },
    );

    return stdout
      .split("\n")
      .filter((l) => l.length > 0)
      .map((line) => {
        const match = line.match(/^\.\/(.+?):(\d+):(.*)/);
        if (!match) return null;
        return { file: match[1], line: parseInt(match[2]), text: match[3].trim() };
      })
      .filter((r): r is FileSearchResult => r !== null)
      .slice(0, maxResults);
  } catch {
    return [];
  }
}

// ─── COMBINED RESEARCH ───────────────────────────────────────

/**
 * Full research: web search + URL fetch + file system.
 * The unified function used by the researcher layer.
 *
 * Flow:
 *   1. Web search (Brave API)
 *   2. Fetch top N result URLs for deeper content
 *   3. File system grep in project
 *   4. Build summary
 *
 * All operations run in parallel where possible.
 */
export async function research(params: {
  query: string;
  projectRoot: string;
  config?: ResearchConfig;
  includeWeb?: boolean;
  includeFiles?: boolean;
  fetchTopResults?: number;
  fileGlob?: string;
}): Promise<ResearchContext> {
  const {
    query,
    projectRoot,
    config,
    includeWeb = true,
    includeFiles = true,
    fetchTopResults = 2,
    fileGlob = "*.ts",
  } = params;

  // Parallel: web search + file search
  const [webResults, fileResults] = await Promise.all([
    includeWeb ? webSearch(query, config) : Promise.resolve([]),
    includeFiles
      ? Promise.resolve(searchFiles(projectRoot, query.split(" ")[0], fileGlob, config?.maxFileResults))
      : Promise.resolve([]),
  ]);

  // Fetch top web result URLs for deeper content
  let fetchedContent: Array<{ url: string; text: string; title?: string }> = [];
  if (includeWeb && webResults.length > 0 && fetchTopResults > 0) {
    const topUrls = webResults.slice(0, fetchTopResults).map((r) => r.url).filter(Boolean);
    const fetchPromises = topUrls.map(async (url) => {
      try {
        const result = await fetchUrl(url, config);
        return { url, text: result.text.slice(0, 3000), title: result.title };
      } catch {
        return null;
      }
    });
    const fetched = await Promise.all(fetchPromises);
    fetchedContent = fetched.filter((r): r is NonNullable<typeof r> => r !== null);
  }

  // Build summary
  const summaryParts: string[] = [];

  if (webResults.length > 0) {
    summaryParts.push("## Web Findings:");
    for (const r of webResults) {
      summaryParts.push(`- **${r.title}**: ${r.description}`);
      summaryParts.push(`  Source: ${r.url}`);
    }
  }

  if (fetchedContent.length > 0) {
    summaryParts.push("\n## Fetched Content:");
    for (const f of fetchedContent) {
      const titleStr = f.title ? ` — ${f.title}` : "";
      summaryParts.push(`### ${f.url}${titleStr}`);
      summaryParts.push(f.text.slice(0, 1500));
    }
  }

  if (fileResults.length > 0) {
    summaryParts.push("\n## Project File Matches:");
    for (const r of fileResults.slice(0, 10)) {
      summaryParts.push(`- ${r.file}:${r.line} → ${r.text}`);
    }
  }

  return {
    query,
    webResults,
    fileResults,
    fetchedContent,
    summary: summaryParts.join("\n") || "No results found",
  };
}

// ─── LEGACY EXPORTS ──────────────────────────────────────────

/**
 * Legacy stripHtml — kept for backward compatibility.
 * New code should use web-fetch-utils directly.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}
