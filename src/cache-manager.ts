/**
 * FOREMAN — Cache Manager
 *
 * LLM çağrı cache'i — aynı prompt tekrar gelirse cache'den döndür.
 *
 * Hash: SHA-256(systemPrompt + userPrompt + model)
 * TTL: varsayılan 1 saat (configurable)
 * Eviction: LRU (en az kullanılan ilk silinir)
 *
 * Her cache entry: {projectRoot}/cache/cch_XXX.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { CacheEntry, Layer } from "./types.js";

// ─── CONFIG ──────────────────────────────────────────────────

export interface CacheConfig {
  /** Cache açık mı */
  enabled: boolean;
  /** Varsayılan TTL (ms) — default 1 saat */
  defaultTtlMs: number;
  /** Max cache entry sayısı */
  maxEntries: number;
  /** Cache'lenecek katmanlar (bazı katmanlar skip edilebilir) */
  cacheableLayers: Layer[];
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  defaultTtlMs: 3600_000, // 1 saat
  maxEntries: 500,
  cacheableLayers: ["visioner", "strategist", "researcher", "worker"],
};

// ─── CACHE MANAGER ───────────────────────────────────────────

export class CacheManager {
  private readonly cacheDir: string;
  private config: CacheConfig;

  constructor(
    private readonly projectRoot: string,
    config?: Partial<CacheConfig>,
  ) {
    this.cacheDir = join(projectRoot, "cache");
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Cache key üret — prompt + model hash'i.
   */
  makeKey(systemPrompt: string, userPrompt: string, model: string): string {
    const raw = `${systemPrompt}\n---\n${userPrompt}\n---\n${model}`;
    return createHash("sha256").update(raw).digest("hex").slice(0, 16);
  }

  /**
   * Cache'den oku. TTL geçmişse null döner.
   */
  get(key: string): CacheEntry | null {
    if (!this.config.enabled) return null;

    const filePath = this.filePath(key);
    if (!existsSync(filePath)) return null;

    try {
      const entry = JSON.parse(readFileSync(filePath, "utf-8")) as CacheEntry;

      // TTL kontrolü
      const age = Date.now() - new Date(entry.createdAt).getTime();
      if (age > entry.ttlMs) {
        // Süresi dolmuş — sil
        unlinkSync(filePath);
        return null;
      }

      // Hit count artır
      entry.hitCount++;
      entry.lastAccessedAt = new Date().toISOString();
      writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf-8");

      return entry;
    } catch {
      return null;
    }
  }

  /**
   * Cache'e yaz.
   */
  set(
    key: string,
    data: {
      model: string;
      layer: Layer;
      response: string;
      tokenUsage: { input: number; output: number; total: number };
    },
    ttlMs?: number,
  ): CacheEntry {
    if (!this.config.enabled) {
      return {
        key,
        ...data,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        hitCount: 0,
        ttlMs: ttlMs ?? this.config.defaultTtlMs,
      };
    }

    if (!this.config.cacheableLayers.includes(data.layer)) {
      // Bu katman cache'lenmemeli
      return {
        key,
        ...data,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        hitCount: 0,
        ttlMs: 0,
      };
    }

    this.ensureDir();

    // Max entries kontrolü — LRU eviction
    this.evictIfNeeded();

    const entry: CacheEntry = {
      key,
      model: data.model,
      layer: data.layer,
      response: data.response,
      tokenUsage: data.tokenUsage,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      hitCount: 0,
      ttlMs: ttlMs ?? this.config.defaultTtlMs,
    };

    this.writeToDisk(entry);
    return entry;
  }

  /**
   * Cache'de var mı kontrol et.
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Tek entry sil.
   */
  delete(key: string): boolean {
    const filePath = this.filePath(key);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      return true;
    }
    return false;
  }

  /**
   * Tüm cache'i temizle.
   */
  clear(): number {
    this.ensureDir();
    const files = readdirSync(this.cacheDir)
      .filter(f => f.startsWith("cch_") && f.endsWith(".json"));

    for (const f of files) {
      try { unlinkSync(join(this.cacheDir, f)); } catch { /* ignore */ }
    }
    return files.length;
  }

  /**
   * Süresi dolmuş entry'leri temizle.
   */
  purgeExpired(): number {
    this.ensureDir();
    const files = readdirSync(this.cacheDir)
      .filter(f => f.startsWith("cch_") && f.endsWith(".json"));

    let purged = 0;
    for (const f of files) {
      try {
        const entry = JSON.parse(readFileSync(join(this.cacheDir, f), "utf-8")) as CacheEntry;
        const age = Date.now() - new Date(entry.createdAt).getTime();
        if (age > entry.ttlMs) {
          unlinkSync(join(this.cacheDir, f));
          purged++;
        }
      } catch {
        // Bozuk dosyayı sil
        try { unlinkSync(join(this.cacheDir, f)); purged++; } catch { /* ignore */ }
      }
    }
    return purged;
  }

  /**
   * İstatistikler.
   */
  stats(): CacheStats {
    this.ensureDir();
    const files = readdirSync(this.cacheDir)
      .filter(f => f.startsWith("cch_") && f.endsWith(".json"));

    let totalHits = 0;
    let totalTokensSaved = 0;
    const byLayer: Record<string, number> = {};

    for (const f of files) {
      try {
        const entry = JSON.parse(readFileSync(join(this.cacheDir, f), "utf-8")) as CacheEntry;
        totalHits += entry.hitCount;
        totalTokensSaved += entry.tokenUsage.total * entry.hitCount;
        byLayer[entry.layer] = (byLayer[entry.layer] ?? 0) + 1;
      } catch { /* skip */ }
    }

    return {
      entries: files.length,
      maxEntries: this.config.maxEntries,
      totalHits,
      totalTokensSaved,
      byLayer,
      enabled: this.config.enabled,
    };
  }

  // ─── PRIVATE ───────────────────────────────────────────────

  private filePath(key: string): string {
    return join(this.cacheDir, `cch_${key}.json`);
  }

  private writeToDisk(entry: CacheEntry): void {
    writeFileSync(this.filePath(entry.key), JSON.stringify(entry, null, 2), "utf-8");
  }

  private ensureDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * LRU eviction — maxEntries aşılmışsa en eski kullanılanı sil.
   */
  private evictIfNeeded(): void {
    this.ensureDir();
    const files = readdirSync(this.cacheDir)
      .filter(f => f.startsWith("cch_") && f.endsWith(".json"));

    if (files.length < this.config.maxEntries) return;

    // LRU: lastAccessedAt'e göre sırala, en eskiyi sil
    const entries: { file: string; lastAccessed: string }[] = [];
    for (const f of files) {
      try {
        const entry = JSON.parse(readFileSync(join(this.cacheDir, f), "utf-8")) as CacheEntry;
        entries.push({ file: f, lastAccessed: entry.lastAccessedAt });
      } catch {
        entries.push({ file: f, lastAccessed: "1970-01-01" });
      }
    }

    entries.sort((a, b) => a.lastAccessed.localeCompare(b.lastAccessed));

    // En eski %10'u sil
    const toRemove = Math.max(1, Math.floor(entries.length * 0.1));
    for (let i = 0; i < toRemove; i++) {
      try { unlinkSync(join(this.cacheDir, entries[i].file)); } catch { /* ignore */ }
    }
  }
}

export interface CacheStats {
  entries: number;
  maxEntries: number;
  totalHits: number;
  totalTokensSaved: number;
  byLayer: Record<string, number>;
  enabled: boolean;
}
