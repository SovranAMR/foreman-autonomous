/**
 * FOREMAN — Web Fetch Engine
 *
 * URL content extraction for the researcher layer.
 * Fetches URLs and converts HTML to readable markdown/text.
 *
 * Transplanted from OpenClaw's web-fetch infrastructure.
 *
 * Three-tier extraction:
 *   1. Readability (best) — @mozilla/readability + linkedom
 *   2. Regex HTML→Markdown (fallback) — no deps
 *   3. Raw text (last resort) — strip tags only
 *
 * Security:
 *   - SSRF protection (private IP blocking)
 *   - Timeout via AbortSignal
 *   - Max redirect limit
 *   - Max response size
 *
 * Features:
 *   - In-memory cache (TTL-based)
 *   - Markdown or text extraction modes
 *   - Smart truncation with metadata
 *   - JSON pretty-printing for API responses
 */

import {
  type CacheEntry,
  DEFAULT_CACHE_TTL_MINUTES,
  DEFAULT_TIMEOUT_SECONDS,
  normalizeCacheKey,
  readCache,
  readResponseText,
  resolveCacheTtlMs,
  resolveTimeoutSeconds,
  withTimeout,
  writeCache,
} from "./web-shared.js";

import {
  type ExtractMode,
  extractReadableContent,
  htmlToMarkdown,
  markdownToText,
  truncateText,
} from "./web-fetch-utils.js";

// ─── CONSTANTS ───────────────────────────────────────────────

const DEFAULT_FETCH_MAX_CHARS = 50_000;
const DEFAULT_FETCH_MAX_REDIRECTS = 3;
const DEFAULT_FETCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/**
 * Private/reserved IP ranges — block SSRF attacks.
 * Foreman should never fetch from internal networks.
 */
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^fc00:/i,
  /^fe80:/i,
  /^::1$/,
  /^localhost$/i,
];

// ─── CACHE ───────────────────────────────────────────────────

const FETCH_CACHE = new Map<string, CacheEntry<FetchResponse>>();

// ─── TYPES ───────────────────────────────────────────────────

export interface FetchResponse {
  url: string;
  finalUrl: string;
  status: number;
  contentType?: string;
  title?: string;
  extractMode: ExtractMode;
  extractor: "readability" | "html2md" | "json" | "raw";
  truncated: boolean;
  length: number;
  tookMs: number;
  text: string;
  cached?: boolean;
}

export interface FetchParams {
  url: string;
  extractMode?: ExtractMode;
  maxChars?: number;
  maxRedirects?: number;
  timeoutSeconds?: number;
  cacheTtlMinutes?: number;
  userAgent?: string;
}

// ─── SSRF GUARD ──────────────────────────────────────────────

/**
 * Check if a URL points to a private/reserved IP address.
 * Prevents SSRF attacks where the worker might be tricked
 * into fetching internal resources.
 */
function isPrivateUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname;

    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return true;
      }
    }

    return false;
  } catch {
    return true; // Invalid URL = block
  }
}

// ─── URL VALIDATION ──────────────────────────────────────────

function validateUrl(urlStr: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error("Invalid URL: must be a valid http or https URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Invalid URL: must be http or https");
  }

  if (isPrivateUrl(urlStr)) {
    throw new Error("URL blocked: cannot fetch from private/internal addresses");
  }

  return parsed;
}

// ─── CONTENT TYPE ────────────────────────────────────────────

function normalizeContentType(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const [raw] = value.split(";");
  return raw?.trim() || undefined;
}

function looksLikeHtml(value: string): boolean {
  const head = value.trimStart().slice(0, 256).toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

// ─── FETCH WITH REDIRECT FOLLOWING ───────────────────────────

/**
 * Fetch with manual redirect following and SSRF checks on each hop.
 * Each redirect target is validated against private IP patterns.
 */
async function fetchWithRedirects(params: {
  url: string;
  maxRedirects: number;
  timeoutMs: number;
  userAgent: string;
}): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = params.url;
  let redirectCount = 0;

  while (true) {
    // Validate each hop
    validateUrl(currentUrl);

    const res = await fetch(currentUrl, {
      method: "GET",
      headers: {
        Accept: "*/*",
        "User-Agent": params.userAgent,
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "manual",
      signal: withTimeout(undefined, params.timeoutMs),
    });

    // Check for redirect
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new Error(`Redirect (${res.status}) without Location header`);
      }

      redirectCount++;
      if (redirectCount > params.maxRedirects) {
        throw new Error(`Too many redirects (${redirectCount} > ${params.maxRedirects})`);
      }

      // Resolve relative redirect URLs
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return { response: res, finalUrl: currentUrl };
  }
}

// ─── MAIN FETCH ──────────────────────────────────────────────

/**
 * Fetch and extract content from a URL.
 *
 * Flow:
 *   1. Validate URL (protocol + SSRF)
 *   2. Check cache
 *   3. Fetch with redirect following
 *   4. Extract content based on content type
 *   5. Truncate to maxChars
 *   6. Cache result
 *
 * Never crashes the pipeline — throws on hard failures,
 * but callers should catch and continue.
 */
export async function webFetch(params: FetchParams): Promise<FetchResponse> {
  const {
    url,
    extractMode = "markdown",
    maxChars = DEFAULT_FETCH_MAX_CHARS,
    maxRedirects = DEFAULT_FETCH_MAX_REDIRECTS,
    timeoutSeconds: rawTimeout,
    cacheTtlMinutes: rawCacheTtl,
    userAgent = DEFAULT_FETCH_USER_AGENT,
  } = params;

  const timeoutSeconds = resolveTimeoutSeconds(rawTimeout, DEFAULT_TIMEOUT_SECONDS);
  const cacheTtlMs = resolveCacheTtlMs(rawCacheTtl, DEFAULT_CACHE_TTL_MINUTES);

  // Validate
  validateUrl(url);

  // Cache check
  const cacheKey = normalizeCacheKey(`fetch:${url}:${extractMode}:${maxChars}`);
  const cached = readCache(FETCH_CACHE, cacheKey);
  if (cached) {
    return { ...cached.value, cached: true };
  }

  const start = Date.now();

  // Fetch
  const { response: res, finalUrl } = await fetchWithRedirects({
    url,
    maxRedirects,
    timeoutMs: timeoutSeconds * 1000,
    userAgent,
  });

  if (!res.ok) {
    const detail = await readResponseText(res);
    throw new Error(`Web fetch failed (${res.status}): ${detail || res.statusText}`);
  }

  // Read body
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const normalizedContentType = normalizeContentType(contentType) ?? "application/octet-stream";
  const body = await readResponseText(res);

  // Extract content based on type
  let text = body;
  let title: string | undefined;
  let extractor: FetchResponse["extractor"] = "raw";

  if (contentType.includes("text/html") || looksLikeHtml(body)) {
    // HTML — try Readability first, fallback to regex
    const readable = await extractReadableContent({
      html: body,
      url: finalUrl,
      extractMode,
    });

    if (readable?.text) {
      text = readable.text;
      title = readable.title;
      extractor = "readability";
    } else {
      // Readability failed — use regex HTML→Markdown
      const rendered = htmlToMarkdown(body);
      text = extractMode === "text" ? markdownToText(rendered.text) : rendered.text;
      title = rendered.title;
      extractor = "html2md";
    }
  } else if (contentType.includes("application/json")) {
    // JSON — pretty-print
    try {
      text = JSON.stringify(JSON.parse(body), null, 2);
      extractor = "json";
    } catch {
      text = body;
      extractor = "raw";
    }
  }

  // Truncate
  const truncated = truncateText(text, maxChars);

  const response: FetchResponse = {
    url,
    finalUrl,
    status: res.status,
    contentType: normalizedContentType,
    title,
    extractMode,
    extractor,
    truncated: truncated.truncated,
    length: truncated.text.length,
    tookMs: Date.now() - start,
    text: truncated.text,
  };

  // Cache
  writeCache(FETCH_CACHE, cacheKey, response, cacheTtlMs);

  return response;
}

// ─── CONVENIENCE FETCH ───────────────────────────────────────

/**
 * Quick fetch — just URL, returns text.
 * Used by the researcher layer for simple content extraction.
 */
export async function quickFetch(
  url: string,
  maxChars: number = 10_000,
): Promise<string> {
  try {
    const result = await webFetch({ url, maxChars, extractMode: "markdown" });
    return result.text;
  } catch (err: any) {
    return `[Fetch error: ${err.message}]`;
  }
}

// ─── CACHE MANAGEMENT ────────────────────────────────────────

export function clearFetchCache(): void {
  FETCH_CACHE.clear();
}

export function fetchCacheStats(): { size: number } {
  return { size: FETCH_CACHE.size };
}
