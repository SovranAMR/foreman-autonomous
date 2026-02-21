/**
 * FOREMAN — Web Shared Utilities
 *
 * Cache, timeout, response reading — shared between web-search and web-fetch.
 * Transplanted from OpenClaw's battle-tested web infrastructure.
 *
 * Design:
 *   - In-memory cache with TTL and max-entry eviction
 *   - AbortSignal-based timeout (no dangling requests)
 *   - Safe response text reading (never throws on body parse)
 */

// ─── TYPES ───────────────────────────────────────────────────

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  insertedAt: number;
}

// ─── DEFAULTS ────────────────────────────────────────────────

export const DEFAULT_TIMEOUT_SECONDS = 30;
export const DEFAULT_CACHE_TTL_MINUTES = 15;
const DEFAULT_CACHE_MAX_ENTRIES = 100;

// ─── TIMEOUT RESOLUTION ─────────────────────────────────────

/**
 * Resolve timeout seconds from config value.
 * Always returns at least 1 second.
 */
export function resolveTimeoutSeconds(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.floor(parsed));
}

// ─── CACHE TTL ───────────────────────────────────────────────

/**
 * Resolve cache TTL from minutes to milliseconds.
 */
export function resolveCacheTtlMs(value: unknown, fallbackMinutes: number): number {
  const minutes =
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallbackMinutes;
  return Math.round(minutes * 60_000);
}

// ─── CACHE KEY ───────────────────────────────────────────────

/**
 * Normalize cache key — lowercase, trimmed.
 */
export function normalizeCacheKey(value: string): string {
  return value.trim().toLowerCase();
}

// ─── CACHE READ ──────────────────────────────────────────────

/**
 * Read from in-memory cache.
 * Returns null if not found or expired.
 * Expired entries are automatically purged.
 */
export function readCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
): { value: T; cached: boolean } | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return { value: entry.value, cached: true };
}

// ─── CACHE WRITE ─────────────────────────────────────────────

/**
 * Write to in-memory cache.
 * Evicts oldest entry if at capacity.
 * TTL <= 0 skips caching entirely.
 */
export function writeCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
): void {
  if (ttlMs <= 0) {
    return;
  }
  if (cache.size >= DEFAULT_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) {
      cache.delete(oldest.value);
    }
  }
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    insertedAt: Date.now(),
  });
}

// ─── TIMEOUT SIGNAL ──────────────────────────────────────────

/**
 * Create an AbortSignal that fires after timeoutMs.
 * If a parent signal is provided, abort propagates both ways.
 * Timer is cleaned up on abort to prevent leaks.
 */
export function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  if (timeoutMs <= 0) {
    return signal ?? new AbortController().signal;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        controller.abort();
      },
      { once: true },
    );
  }

  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
    },
    { once: true },
  );

  return controller.signal;
}

// ─── RESPONSE READING ────────────────────────────────────────

/**
 * Safely read response body as text.
 * Never throws — returns empty string on failure.
 */
export async function readResponseText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
