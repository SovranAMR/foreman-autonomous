/**
 * FOREMAN — Cache Manager
 *
 * LLM çağrı cache'i — aynı prompt tekrar gelirse cache'den döndür.
 *
 * Hash: SHA-256(systemPrompt + userPrompt + model)
 * TTL: katman bazlı (vizyoner uzun, worker kısa)
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
  /** Max cache entry sayısı */
  maxEntries: number;
  /** Cache'lenecek katmanlar (bazı katmanlar skip edilebilir) */
  cacheableLayers: Layer[];
  /** Katman bazlı TTL — her katmanın cache ömrü farklı */
  layerTtlMs: Record<Layer, number>;
}

/**
 * Katman bazlı TTL:
 * - Visioner: 24 saat — vizyon nadiren değişir
 * - Strategist: 4 saat — plan değişebilir ama sık değil
 * - Researcher: 2 saat — araştırma sonuçları güncel olmalı
 * - Worker: 30 dk — uygulama bağlama çok duyarlı
 */
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  maxEntries: 500,
  cacheableLayers: ["visioner", "strategist", "researcher", "worker"],
  layerTtlMs: {
    visioner: 86_400_000,   // 24 saat
    strategist: 14_400_000, // 4 saat
    researcher: 7_200_000,  // 2 saat
    worker: 1_800_000,      // 30 dakika
  },
};

// ─── EVENT CALLBACK ──────────────────────────────────────────

export type CacheEventCallback = (event: CacheEvent) => void;

export type CacheEvent =
  | { type: "hit"; key: string; layer: Layer; hitCount: number; tokensSaved: number }
  | { type: "miss"; key: string; layer: Layer }
  | { type: "set"; key: string; layer: Layer; ttlMs: number }
  | { type: "evict"; count: number }
  | { type: "purge"; count: number };

// ─── CACHE MANAGER ───────────────────────────────────────────

export class CacheManager {
  private readonly cacheDir: string;
  private config: CacheConfig;
  private eventCallback?: CacheEventCallback;

  constructor(
    private readonly projectRoot: string,
    config?: Partial<CacheConfig>,
  ) {
    this.cacheDir = join(projectRoot, "cache");
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Event callback ayarla — session/memory entegrasyonu için.
   */
  onEvent(callback: CacheEventCallback): void {
    this.eventCallback = callback;
  }

  private emit(event: CacheEvent): void {
    this.eventCallback?.(event);
  }

  /**
   * Cache key üret — prompt + model hash'i.
   */
  makeKey(systemPrompt: string, userPrompt: string, model: string): string {
    const raw = `${systemPrompt}\n---\n${userPrompt}\n---\n${model}`;
    return createHash("sha256").update(raw).digest("hex").slice(0, 16);
  }

  /**
   * Katmana göre TTL al.
   */
  getTtlForLayer(layer: Layer): number {
    return this.config.layerTtlMs[layer] ?? 3_600_000;
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
        unlinkSync(filePath);
        this.emit({ type: "miss", key, layer: entry.layer });
        return null;
      }

      // Hit count artır
      entry.hitCount++;
      entry.lastAccessedAt = new Date().toISOString();
      writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf-8");

      this.emit({
        type: "hit",
        key,
        layer: entry.layer,
        hitCount: entry.hitCount,
        tokensSaved: entry.tokenUsage.total,
      });

      return entry;
    } catch {
      return null;
    }
  }

  /**
   * Cache'e yaz — katman bazlı TTL ile.
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
    const layerTtl = ttlMs ?? this.getTtlForLayer(data.layer);

    if (!this.config.enabled) {
      return {
        key,
        ...data,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        hitCount: 0,
        ttlMs: layerTtl,
      };
    }

    if (!this.config.cacheableLayers.includes(data.layer)) {
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
      ttlMs: layerTtl,
    };

    this.writeToDisk(entry);
    this.emit({ type: "set", key, layer: data.layer, ttlMs: layerTtl });
    return entry;
  }

  has(key: string): boolean { return this.get(key) !== null; }

  delete(key: string): boolean {
    const filePath = this.filePath(key);
    if (existsSync(filePath)) { unlinkSync(filePath); return true; }
    return false;
  }

  clear(): number {
    this.ensureDir();
    const files = readdirSync(this.cacheDir).filter(f => f.startsWith("cch_") && f.endsWith(".json"));
    for (const f of files) { try { unlinkSync(join(this.cacheDir, f)); } catch { /* ignore */ } }
    return files.length;
  }

  purgeExpired(): number {
    this.ensureDir();
    const files = readdirSync(this.cacheDir).filter(f => f.startsWith("cch_") && f.endsWith(".json"));
    let purged = 0;
    for (const f of files) {
      try {
        const entry = JSON.parse(readFileSync(join(this.cacheDir, f), "utf-8")) as CacheEntry;
        const age = Date.now() - new Date(entry.createdAt).getTime();
        if (age > entry.ttlMs) { unlinkSync(join(this.cacheDir, f)); purged++; }
      } catch { try { unlinkSync(join(this.cacheDir, f)); purged++; } catch { /* ignore */ } }
    }
    if (purged > 0) this.emit({ type: "purge", count: purged });
    return purged;
  }

  stats(): CacheStats {
    this.ensureDir();
    const files = readdirSync(this.cacheDir).filter(f => f.startsWith("cch_") && f.endsWith(".json"));
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
    return { entries: files.length, maxEntries: this.config.maxEntries, totalHits, totalTokensSaved, byLayer, enabled: this.config.enabled };
  }

  // ─── PRIVATE ───────────────────────────────────────────────

  private filePath(key: string): string { return join(this.cacheDir, `cch_${key}.json`); }
  private writeToDisk(entry: CacheEntry): void { writeFileSync(this.filePath(entry.key), JSON.stringify(entry, null, 2), "utf-8"); }
  private ensureDir(): void { if (!existsSync(this.cacheDir)) mkdirSync(this.cacheDir, { recursive: true }); }

  private evictIfNeeded(): void {
    this.ensureDir();
    const files = readdirSync(this.cacheDir).filter(f => f.startsWith("cch_") && f.endsWith(".json"));
    if (files.length < this.config.maxEntries) return;
    const entries: { file: string; lastAccessed: string }[] = [];
    for (const f of files) {
      try {
        const entry = JSON.parse(readFileSync(join(this.cacheDir, f), "utf-8")) as CacheEntry;
        entries.push({ file: f, lastAccessed: entry.lastAccessedAt });
      } catch { entries.push({ file: f, lastAccessed: "1970-01-01" }); }
    }
    entries.sort((a, b) => a.lastAccessed.localeCompare(b.lastAccessed));
    const toRemove = Math.max(1, Math.floor(entries.length * 0.1));
    for (let i = 0; i < toRemove; i++) { try { unlinkSync(join(this.cacheDir, entries[i].file)); } catch { /* ignore */ } }
    this.emit({ type: "evict", count: toRemove });
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
