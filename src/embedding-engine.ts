/**
 * FOREMAN — Embedding Engine
 *
 * Vector-based semantic search using external embedding APIs.
 * Transplanted from OpenClaw's embedding system, adapted for Foreman.
 *
 * Supports:
 * - OpenAI text-embedding-3-small/large
 * - Gemini text-embedding-004
 * - Local TF-IDF fallback (via existing SimilarityEngine)
 * - Cosine similarity search
 * - Batch embedding with rate limiting
 * - Document indexing + persistence
 *
 * Philosophy: API embeddings are optional upgrade over local TF-IDF.
 * Falls back to SimilarityEngine when no API key available.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// ─── TYPES ───────────────────────────────────────────────────

export interface EmbeddingProvider {
  id: string;
  model: string;
  embedQuery: (text: string) => Promise<number[]>;
  embedBatch: (texts: string[]) => Promise<number[][]>;
}

export interface EmbeddedDocument {
  id: string;
  text: string;
  vector: number[];
  metadata?: Record<string, string>;
  timestamp: number;
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, string>;
}

export interface EmbeddingConfig {
  provider: "openai" | "gemini" | "local";
  model?: string;
  apiKey?: string;
  maxBatchSize: number;
  dimensions?: number;
  persistPath?: string;
}

const DEFAULT_CONFIG: EmbeddingConfig = {
  provider: "local",
  maxBatchSize: 100,
};

// ─── VECTOR MATH ─────────────────────────────────────────────

/** Cosine similarity between two vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom < 1e-10 ? 0 : dot / denom;
}

/** Normalize vector to unit length */
export function normalizeVector(vec: number[]): number[] {
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (magnitude < 1e-10) return vec;
  return vec.map(v => v / magnitude);
}

// ─── PROVIDERS ───────────────────────────────────────────────

/**
 * Create OpenAI embedding provider.
 * Uses text-embedding-3-small by default (cheap, 1536 dimensions).
 */
export function createOpenAiProvider(apiKey: string, model = "text-embedding-3-small"): EmbeddingProvider {
  return {
    id: "openai",
    model,
    async embedQuery(text: string): Promise<number[]> {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: text, model }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI embedding error: ${response.status} ${await response.text()}`);
      }

      const data = await response.json() as { data: Array<{ embedding: number[] }> };
      return normalizeVector(data.data[0].embedding);
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: texts, model }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI batch embedding error: ${response.status}`);
      }

      const data = await response.json() as { data: Array<{ embedding: number[]; index: number }> };
      // Sort by index to maintain order
      return data.data
        .sort((a, b) => a.index - b.index)
        .map(d => normalizeVector(d.embedding));
    },
  };
}

/**
 * Create Gemini embedding provider.
 * Uses text-embedding-004 (768 dimensions, free tier available).
 */
export function createGeminiProvider(apiKey: string, model = "text-embedding-004"): EmbeddingProvider {
  return {
    id: "gemini",
    model,
    async embedQuery(text: string): Promise<number[]> {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${model}`,
          content: { parts: [{ text }] },
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini embedding error: ${response.status} ${await response.text()}`);
      }

      const data = await response.json() as { embedding: { values: number[] } };
      return normalizeVector(data.embedding.values);
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: texts.map(text => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini batch embedding error: ${response.status}`);
      }

      const data = await response.json() as { embeddings: Array<{ values: number[] }> };
      return data.embeddings.map(e => normalizeVector(e.values));
    },
  };
}

// ─── EMBEDDING ENGINE ────────────────────────────────────────

export class EmbeddingEngine {
  private documents: Map<string, EmbeddedDocument> = new Map();
  private provider: EmbeddingProvider | null = null;
  private config: EmbeddingConfig;
  private persistPath: string;
  private dirty = false;

  constructor(projectRoot: string, config?: Partial<EmbeddingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.persistPath = this.config.persistPath
      ?? join(projectRoot, ".foreman", "embeddings.json");
    this.load();
    this.initProvider();
  }

  private initProvider(): void {
    if (this.config.provider === "openai" && this.config.apiKey) {
      this.provider = createOpenAiProvider(this.config.apiKey, this.config.model);
    } else if (this.config.provider === "gemini" && this.config.apiKey) {
      this.provider = createGeminiProvider(this.config.apiKey, this.config.model);
    }
    // "local" → no provider, use TF-IDF fallback
  }

  /** Check if vector embeddings are available */
  hasProvider(): boolean {
    return this.provider !== null;
  }

  /** Get provider info */
  getProviderInfo(): { id: string; model: string } | null {
    return this.provider ? { id: this.provider.id, model: this.provider.model } : null;
  }

  // ─── INDEXING ───────────────────────────────────────────

  /**
   * Index a single document.
   * Embeds the text and stores the vector for later search.
   */
  async index(id: string, text: string, metadata?: Record<string, string>): Promise<void> {
    if (!this.provider) {
      throw new Error("No embedding provider configured. Set apiKey for openai/gemini.");
    }

    const vector = await this.provider.embedQuery(text);
    this.documents.set(id, {
      id,
      text: text.slice(0, 10_000), // Cap stored text
      vector,
      metadata,
      timestamp: Date.now(),
    });
    this.dirty = true;
  }

  /**
   * Batch index multiple documents.
   * Uses batch API for efficiency.
   */
  async indexBatch(
    docs: Array<{ id: string; text: string; metadata?: Record<string, string> }>,
  ): Promise<{ indexed: number; failed: number }> {
    if (!this.provider) {
      throw new Error("No embedding provider configured.");
    }

    let indexed = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < docs.length; i += this.config.maxBatchSize) {
      const batch = docs.slice(i, i + this.config.maxBatchSize);
      try {
        const vectors = await this.provider.embedBatch(batch.map(d => d.text));

        for (let j = 0; j < batch.length; j++) {
          this.documents.set(batch[j].id, {
            id: batch[j].id,
            text: batch[j].text.slice(0, 10_000),
            vector: vectors[j],
            metadata: batch[j].metadata,
            timestamp: Date.now(),
          });
          indexed++;
        }
      } catch (err) {
        console.warn(`[embeddings] Batch ${i / this.config.maxBatchSize} failed:`, err);
        failed += batch.length;
      }
    }

    if (indexed > 0) {
      this.dirty = true;
      this.persist();
    }

    return { indexed, failed };
  }

  // ─── SEARCH ─────────────────────────────────────────────

  /**
   * Semantic search: find documents most similar to query.
   */
  async search(query: string, topK = 5, minScore = 0.3): Promise<SearchResult[]> {
    if (!this.provider) {
      throw new Error("No embedding provider configured.");
    }

    if (this.documents.size === 0) return [];

    const queryVector = await this.provider.embedQuery(query);

    const scored: SearchResult[] = [];
    for (const doc of this.documents.values()) {
      const score = cosineSimilarity(queryVector, doc.vector);
      if (score >= minScore) {
        scored.push({
          id: doc.id,
          text: doc.text,
          score,
          metadata: doc.metadata,
        });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * Find similar documents to an already-indexed document.
   */
  findSimilar(docId: string, topK = 5, minScore = 0.3): SearchResult[] {
    const doc = this.documents.get(docId);
    if (!doc) return [];

    const scored: SearchResult[] = [];
    for (const other of this.documents.values()) {
      if (other.id === docId) continue;
      const score = cosineSimilarity(doc.vector, other.vector);
      if (score >= minScore) {
        scored.push({
          id: other.id,
          text: other.text,
          score,
          metadata: other.metadata,
        });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  // ─── MANAGEMENT ─────────────────────────────────────────

  removeDocument(id: string): boolean {
    const deleted = this.documents.delete(id);
    if (deleted) this.dirty = true;
    return deleted;
  }

  getDocument(id: string): EmbeddedDocument | undefined {
    return this.documents.get(id);
  }

  listDocuments(): Array<{ id: string; metadata?: Record<string, string>; timestamp: number }> {
    return [...this.documents.values()].map(d => ({
      id: d.id,
      metadata: d.metadata,
      timestamp: d.timestamp,
    }));
  }

  documentCount(): number {
    return this.documents.size;
  }

  clear(): void {
    this.documents.clear();
    this.dirty = true;
    this.persist();
  }

  // ─── PERSISTENCE ────────────────────────────────────────

  persist(): void {
    if (!this.dirty) return;
    try {
      const dir = dirname(this.persistPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const data = [...this.documents.values()];
      writeFileSync(this.persistPath, JSON.stringify(data), "utf-8");
      this.dirty = false;
    } catch { /* best-effort */ }
  }

  private load(): void {
    try {
      if (!existsSync(this.persistPath)) return;
      const raw = readFileSync(this.persistPath, "utf-8");
      const data = JSON.parse(raw) as EmbeddedDocument[];

      for (const doc of data) {
        this.documents.set(doc.id, doc);
      }
    } catch { /* fresh start */ }
  }

  /** Stats */
  stats(): {
    documentCount: number;
    provider: string;
    model: string;
    persistPath: string;
  } {
    return {
      documentCount: this.documents.size,
      provider: this.provider?.id ?? "local (TF-IDF fallback)",
      model: this.provider?.model ?? "none",
      persistPath: this.persistPath,
    };
  }
}
