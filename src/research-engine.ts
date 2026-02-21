/**
 * FOREMAN — Research Engine
 *
 * Gives the researcher layer web research capabilities:
 * - Web search (fetch-based, no API key needed)
 * - URL fetch & content extraction
 * - File system research (grep, AST scan)
 * - npm/package research
 *
 * Research results are injected into the Researcher's prompt.
 */

import { execSync } from "node:child_process";

// ─── TYPES ───────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ResearchContext {
  query: string;
  webResults: SearchResult[];
  fileResults: Array<{ file: string; line: number; text: string }>;
  summary: string;
}

// ─── WEB SEARCH ──────────────────────────────────────────────

/**
 * Web research with DuckDuckGo Lite (no API key required).
 * Fallback: curl ile HTML parse.
 */
export async function webSearch(query: string, maxResults: number = 5): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  try {
    // DuckDuckGo HTML API
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Foreman/1.0; +https://github.com/SovranAMR/foreman)",
      },
    });

    if (!response.ok) return results;

    const html = await response.text();

    // Parse results from DDG HTML
    const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      const rawUrl = match[1];
      const title = stripHtml(match[2]);
      const snippet = stripHtml(match[3]);

      // Resolve DDG redirect URLs
      const actualUrl = decodeURIComponent(
        rawUrl.replace(/.*uddg=/, "").replace(/&.*$/, "")
      );

      if (title && actualUrl && !actualUrl.includes("duckduckgo.com")) {
        results.push({ title, url: actualUrl, snippet });
      }
    }

    // If regex didn't work, try simple parse
    if (results.length === 0) {
      const simpleRegex = /<a[^>]+class="result__url"[^>]*[^>]*>([\s\S]*?)<\/a>/g;
      let simpleMatch;
      while ((simpleMatch = simpleRegex.exec(html)) !== null && results.length < maxResults) {
        const urlText = stripHtml(simpleMatch[1]).trim();
        if (urlText && urlText.includes(".")) {
          results.push({ title: urlText, url: `https://${urlText}`, snippet: "" });
        }
      }
    }
  } catch {
    // Web search failed silently
  }

  return results;
}

// ─── URL FETCH ───────────────────────────────────────────────

/**
 * Fetch content from URL and return as text.
 * HTML → plain text conversion.
 */
export async function fetchUrl(url: string, maxChars: number = 5000): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Foreman/1.0)",
        "Accept": "text/html,text/plain,application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return `[Error: HTTP ${response.status}]`;

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    if (contentType.includes("json")) {
      return text.slice(0, maxChars);
    }

    // HTML → metin
    const cleaned = stripHtml(text)
      .replace(/\s+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return cleaned.slice(0, maxChars);
  } catch (err: any) {
    return `[Error: ${err.message}]`;
  }
}

// ─── NPM/PACKAGE RESEARCH ────────────────────────────────────

/**
 * Get information about an npm package.
 */
export async function npmInfo(packageName: string): Promise<string> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return `Package "${packageName}" not found`;

    const data = await response.json() as any;
    const parts: string[] = [];
    parts.push(`**${data.name}** v${data.version}`);
    if (data.description) parts.push(data.description);
    if (data.homepage) parts.push(`Homepage: ${data.homepage}`);
    if (data.repository?.url) parts.push(`Repo: ${data.repository.url}`);

    // Dependencies count
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
 * Search for pattern in project files.
 */
export function searchFiles(
  projectRoot: string,
  pattern: string,
  glob: string = "*.ts",
  maxResults: number = 20,
): Array<{ file: string; line: number; text: string }> {
  try {
    const stdout = execSync(
      `grep -rn "${pattern.replace(/"/g, '\\"')}" --include="${glob}" . 2>/dev/null || true`,
      { cwd: projectRoot, encoding: "utf-8", timeout: 10_000, maxBuffer: 512 * 1024 },
    );

    return stdout
      .split("\n")
      .filter(l => l.length > 0)
      .map(line => {
        const match = line.match(/^\.\/(.+?):(\d+):(.*)/);
        if (!match) return null;
        return { file: match[1], line: parseInt(match[2]), text: match[3].trim() };
      })
      .filter((r): r is { file: string; line: number; text: string } => r !== null)
      .slice(0, maxResults);
  } catch {
    return [];
  }
}

// ─── COMBINED RESEARCH ───────────────────────────────────────

/**
 * Full research: web + file system.
 * The single function used by the researcher layer.
 */
export async function research(params: {
  query: string;
  projectRoot: string;
  includeWeb?: boolean;
  includeFiles?: boolean;
  fileGlob?: string;
}): Promise<ResearchContext> {
  const { query, projectRoot, includeWeb = true, includeFiles = true, fileGlob = "*.ts" } = params;

  // Parallel research
  const [webResults, fileResults] = await Promise.all([
    includeWeb ? webSearch(query) : Promise.resolve([]),
    includeFiles
      ? Promise.resolve(searchFiles(projectRoot, query.split(" ")[0], fileGlob))
      : Promise.resolve([]),
  ]);

  // Build summary
  const summaryParts: string[] = [];

  if (webResults.length > 0) {
    summaryParts.push("## Web Findings:");
    for (const r of webResults) {
      summaryParts.push(`- **${r.title}**: ${r.snippet}`);
      summaryParts.push(`  Source: ${r.url}`);
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
    summary: summaryParts.join("\n") || "No results found",
  };
}

// ─── HELPERS ─────────────────────────────────────────────────

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
