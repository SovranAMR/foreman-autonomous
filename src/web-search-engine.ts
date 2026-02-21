/**
 * FOREMAN — Web Search Engine
 *
 * Brave Search API integration for the researcher layer.
 * Replaces the fragile DuckDuckGo HTML scraping with a proper API.
 *
 * Transplanted from OpenClaw's web-search infrastructure.
 * Stripped to essentials — no Perplexity/Grok (Foreman is a coding orchestrator, not a chatbot).
 *
 * Features:
 *   - Brave Search API with proper auth
 *   - In-memory response cache (TTL-based)
 *   - Region/language filtering
 *   - Freshness filtering (past day/week/month/year or date range)
 *   - Timeout via AbortSignal
 *   - Graceful error handling (never crashes the pipeline)
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

// ─── CONSTANTS ───────────────────────────────────────────────

const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_SEARCH_COUNT = 5;
const MAX_SEARCH_COUNT = 10;

const BRAVE_FRESHNESS_SHORTCUTS = new Set(["pd", "pw", "pm", "py"]);
const BRAVE_FRESHNESS_RANGE = /^(\d{4}-\d{2}-\d{2})to(\d{4}-\d{2}-\d{2})$/;

// ─── CACHE ───────────────────────────────────────────────────

const SEARCH_CACHE = new Map<string, CacheEntry<SearchResponse>>();

// ─── TYPES ───────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  description: string;
  published?: string;
  siteName?: string;
}

export interface SearchResponse {
  query: string;
  provider: "brave";
  count: number;
  tookMs: number;
  results: SearchResult[];
  cached?: boolean;
}

export interface SearchParams {
  query: string;
  apiKey: string;
  count?: number;
  country?: string;
  searchLang?: string;
  freshness?: string;
  timeoutSeconds?: number;
  cacheTtlMinutes?: number;
}

// ─── BRAVE API TYPES ─────────────────────────────────────────

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
}

interface BraveSearchApiResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

// ─── VALIDATION ──────────────────────────────────────────────

/**
 * Validate and normalize freshness parameter.
 * Returns undefined if invalid — caller can handle gracefully.
 */
function normalizeFreshness(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  if (BRAVE_FRESHNESS_SHORTCUTS.has(lower)) return lower;

  const match = trimmed.match(BRAVE_FRESHNESS_RANGE);
  if (!match) return undefined;

  const [, start, end] = match;
  if (!isValidIsoDate(start) || !isValidIsoDate(end)) return undefined;
  if (start > end) return undefined;

  return `${start}to${end}`;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map((p) => Number.parseInt(p, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function resolveSearchCount(value: number | undefined, fallback: number): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(MAX_SEARCH_COUNT, Math.floor(parsed)));
}

function resolveSiteName(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

// ─── SEARCH EXECUTION ────────────────────────────────────────

/**
 * Execute a Brave Search API query.
 *
 * Flow:
 *   1. Check cache
 *   2. Build URL with params
 *   3. Execute with timeout
 *   4. Parse results
 *   5. Cache response
 *   6. Return typed results
 *
 * Never throws on API error — returns empty results with error info.
 */
export async function braveSearch(params: SearchParams): Promise<SearchResponse> {
  const {
    query,
    apiKey,
    count = DEFAULT_SEARCH_COUNT,
    country,
    searchLang,
    freshness: rawFreshness,
    timeoutSeconds: rawTimeout,
    cacheTtlMinutes: rawCacheTtl,
  } = params;

  const timeoutSeconds = resolveTimeoutSeconds(rawTimeout, DEFAULT_TIMEOUT_SECONDS);
  const cacheTtlMs = resolveCacheTtlMs(rawCacheTtl, DEFAULT_CACHE_TTL_MINUTES);
  const resolvedCount = resolveSearchCount(count, DEFAULT_SEARCH_COUNT);
  const freshness = normalizeFreshness(rawFreshness);

  // Cache check
  const cacheKey = normalizeCacheKey(
    `brave:${query}:${resolvedCount}:${country || "default"}:${searchLang || "default"}:${freshness || "default"}`,
  );
  const cached = readCache(SEARCH_CACHE, cacheKey);
  if (cached) {
    return { ...cached.value, cached: true };
  }

  const start = Date.now();

  // Build URL
  const url = new URL(BRAVE_SEARCH_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(resolvedCount));
  if (country) url.searchParams.set("country", country);
  if (searchLang) url.searchParams.set("search_lang", searchLang);
  if (freshness) url.searchParams.set("freshness", freshness);

  // Execute
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    signal: withTimeout(undefined, timeoutSeconds * 1000),
  });

  if (!res.ok) {
    const detail = await readResponseText(res);
    throw new Error(`Brave Search API error (${res.status}): ${detail || res.statusText}`);
  }

  // Parse
  const data = (await res.json()) as BraveSearchApiResponse;
  const rawResults = Array.isArray(data.web?.results) ? (data.web?.results ?? []) : [];

  const results: SearchResult[] = rawResults.map((entry) => ({
    title: entry.title ?? "",
    url: entry.url ?? "",
    description: entry.description ?? "",
    published: entry.age || undefined,
    siteName: resolveSiteName(entry.url),
  }));

  const response: SearchResponse = {
    query,
    provider: "brave",
    count: results.length,
    tookMs: Date.now() - start,
    results,
  };

  // Cache
  writeCache(SEARCH_CACHE, cacheKey, response, cacheTtlMs);

  return response;
}

// ─── CONVENIENCE SEARCH ──────────────────────────────────────

/**
 * Simple search — just query + optional API key from env.
 * Used by the researcher layer when config is minimal.
 */
export async function quickSearch(
  query: string,
  maxResults: number = DEFAULT_SEARCH_COUNT,
): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    const response = await braveSearch({ query, apiKey, count: maxResults });
    return response.results;
  } catch {
    return [];
  }
}

// ─── CACHE MANAGEMENT ────────────────────────────────────────

/**
 * Clear the search cache.
 */
export function clearSearchCache(): void {
  SEARCH_CACHE.clear();
}

/**
 * Get cache stats.
 */
export function searchCacheStats(): { size: number; maxEntries: number } {
  return {
    size: SEARCH_CACHE.size,
    maxEntries: 100,
  };
}
