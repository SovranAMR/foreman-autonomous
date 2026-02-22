/**
 * FOREMAN — Similarity Engine
 *
 * Local, API-free similarity computation for memory search.
 *
 * OpenClaw uses external embedding APIs (OpenAI, Gemini, Voyage) + SQLite vector search.
 * Foreman computes similarity LOCALLY with zero API calls:
 *
 * 1. TF-IDF VECTORIZATION: Converts text to term-frequency vectors
 *    weighted by inverse document frequency. No external API needed.
 *
 * 2. COSINE SIMILARITY: Proper vector similarity on TF-IDF vectors,
 *    same mathematical foundation as OpenAI embeddings but computed locally.
 *
 * 3. N-GRAM OVERLAP: Character-level n-gram Jaccard similarity for
 *    short texts and typo tolerance. Complements TF-IDF for edge cases.
 *
 * 4. COMPOSITE SCORING: Weighted combination of TF-IDF cosine and
 *    n-gram overlap. Tuned for coding agent memory (code terms,
 *    technical decisions, error patterns).
 *
 * Why not external embeddings?
 * - Foreman makes ucuz models work like pahalı ones → adding API costs defeats the purpose
 * - Local computation = zero latency, zero cost, offline-capable
 * - TF-IDF with proper IDF weighting captures domain-specific terminology
 *   better than generic embeddings for technical/coding content
 *
 * Trade-off: Less semantic understanding than transformer embeddings.
 * Mitigation: N-gram overlap + IDF weighting + compound scoring.
 */

// ─── TYPES ───────────────────────────────────────────────────

/** A document in the corpus (for IDF computation) */
export interface Document {
  id: string;
  text: string;
}

/** Similarity result */
export interface SimilarityResult {
  id: string;
  score: number;
  tfidfScore: number;
  ngramScore: number;
}

/** TF-IDF vector (sparse representation) */
type TfIdfVector = Map<string, number>;

// ─── CONSTANTS ───────────────────────────────────────────────

/** Default n-gram size for character-level similarity */
const DEFAULT_NGRAM_SIZE = 3;

/** Weight for TF-IDF cosine similarity in composite score */
const TFIDF_WEIGHT = 0.7;

/** Weight for n-gram overlap in composite score */
const NGRAM_WEIGHT = 0.3;

/** Minimum token length to include in vocabulary */
const MIN_TOKEN_LENGTH = 2;

/** Stop words — filtered from TF-IDF (common English + code) */
const STOP_WORDS = new Set([
  // English
  "the", "is", "at", "which", "on", "a", "an", "and", "or", "but",
  "in", "with", "to", "for", "of", "not", "no", "can", "had", "has",
  "have", "it", "its", "do", "did", "will", "would", "should", "could",
  "this", "that", "these", "those", "be", "been", "being", "was", "were",
  "are", "am", "from", "by", "as", "if", "then", "than", "so", "such",
  "just", "also", "very", "too", "all", "any", "each", "every", "some",
  // Code-specific (too common to be discriminative)
  "const", "let", "var", "function", "return", "import", "export",
  "true", "false", "null", "undefined", "new", "class",
]);

// ─── TOKENIZATION ────────────────────────────────────────────

/**
 * Tokenize text for TF-IDF.
 *
 * Handles:
 * - camelCase splitting (backgroundColor → background, color)
 * - snake_case splitting (background_color → background, color)
 * - Code-aware: preserves compound tokens before splitting
 * - Lowercased, stop words removed
 */
export function tokenize(text: string): string[] {
  // Split camelCase and PascalCase
  let expanded = text.replace(/([a-z])([A-Z])/g, "$1 $2");
  // Split snake_case and kebab-case
  expanded = expanded.replace(/[_-]/g, " ");
  // Split on non-alphanumeric (but keep dots for versions like "v1.2.3")
  const raw = expanded.split(/[^a-zA-Z0-9.]+/);

  // Also extract original unsplit tokens (for compound words like TypeScript)
  const originals = text.split(/[^a-zA-Z0-9.]+/);

  const tokens: string[] = [];
  const seen = new Set<string>();

  // Add split tokens
  for (const t of raw) {
    const lower = t.toLowerCase().replace(/^\.+|\.+$/g, "");
    if (lower.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(lower) && !seen.has(lower)) {
      tokens.push(lower);
      seen.add(lower);
    }
  }

  // Add original compound tokens (unsplit, lowered)
  for (const t of originals) {
    const lower = t.toLowerCase().replace(/^\.+|\.+$/g, "");
    if (lower.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(lower) && !seen.has(lower)) {
      tokens.push(lower);
      seen.add(lower);
    }
  }

  return tokens;
}

/**
 * Generate character n-grams from text.
 */
export function ngrams(text: string, n: number = DEFAULT_NGRAM_SIZE): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  const result = new Set<string>();
  for (let i = 0; i <= normalized.length - n; i++) {
    result.add(normalized.slice(i, i + n));
  }
  return result;
}

// ─── TF-IDF ──────────────────────────────────────────────────

/**
 * TF-IDF Vectorizer.
 *
 * Maintains an IDF (Inverse Document Frequency) table across
 * a corpus of documents. Each document's TF vector is weighted
 * by IDF to produce discriminative term weights.
 *
 * IDF formula: log(N / (1 + df)) where N = total docs, df = docs containing term
 * The +1 prevents division by zero.
 */
export class TfIdfVectorizer {
  /** Document frequency: term → number of documents containing it */
  private df = new Map<string, number>();
  /** Total number of documents in corpus */
  private docCount = 0;
  /** Cached IDF values (invalidated on corpus change) */
  private idfCache = new Map<string, number>();
  /** Track whether IDF cache is stale */
  private idfDirty = true;

  /**
   * Add a document to the corpus (updates IDF).
   */
  addDocument(text: string): void {
    const tokens = tokenize(text);
    const uniqueTokens = new Set(tokens);

    for (const token of uniqueTokens) {
      this.df.set(token, (this.df.get(token) ?? 0) + 1);
    }

    this.docCount++;
    this.idfDirty = true;
  }

  /**
   * Add multiple documents at once.
   */
  addDocuments(texts: string[]): void {
    for (const text of texts) {
      this.addDocument(text);
    }
  }

  /**
   * Compute TF-IDF vector for a text.
   */
  vectorize(text: string): TfIdfVector {
    const tokens = tokenize(text);
    if (tokens.length === 0) return new Map();

    // Term frequency (normalized by document length)
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }

    // TF-IDF = TF * IDF
    const tfidf: TfIdfVector = new Map();
    for (const [term, count] of tf) {
      const tfNorm = count / tokens.length;
      const idf = this.getIdf(term);
      tfidf.set(term, tfNorm * idf);
    }

    return tfidf;
  }

  /**
   * Get IDF for a term.
   */
  private getIdf(term: string): number {
    if (this.idfDirty) {
      this.recomputeIdf();
    }
    return this.idfCache.get(term) ?? Math.log(this.docCount + 1);
  }

  /**
   * Recompute all IDF values.
   */
  private recomputeIdf(): void {
    this.idfCache.clear();
    for (const [term, df] of this.df) {
      this.idfCache.set(term, Math.log(this.docCount / (1 + df)));
    }
    this.idfDirty = false;
  }

  /**
   * Get corpus statistics.
   */
  stats(): { docCount: number; vocabSize: number } {
    return {
      docCount: this.docCount,
      vocabSize: this.df.size,
    };
  }
}

// ─── COSINE SIMILARITY ──────────────────────────────────────

/**
 * Cosine similarity between two sparse TF-IDF vectors.
 *
 * Same math as OpenClaw's vector search, but on TF-IDF vectors
 * instead of transformer embeddings.
 *
 * cos(A, B) = (A · B) / (|A| × |B|)
 */
export function cosineSimilarity(a: TfIdfVector, b: TfIdfVector): number {
  if (a.size === 0 || b.size === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // Iterate over smaller vector for efficiency
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];

  for (const [term, weightA] of smaller) {
    const weightB = larger.get(term);
    if (weightB !== undefined) {
      dotProduct += weightA * weightB;
    }
    normA += weightA * weightA;
  }

  // Add remaining terms from larger vector to normB
  for (const [term, weight] of larger) {
    normB += weight * weight;
    if (!smaller.has(term)) {
      // Already counted in normA if in smaller
    }
  }

  // Fix: normA should only include smaller vector terms
  // normB should include all larger vector terms
  // But we need full norms for both vectors
  normA = 0;
  for (const [, weight] of a) {
    normA += weight * weight;
  }
  normB = 0;
  for (const [, weight] of b) {
    normB += weight * weight;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator < 1e-10) return 0;

  return dotProduct / denominator;
}

/**
 * N-gram Jaccard similarity.
 *
 * |A ∩ B| / |A ∪ B|
 *
 * Good for short texts and typo tolerance.
 */
export function ngramSimilarity(a: string, b: string, n: number = DEFAULT_NGRAM_SIZE): number {
  const ngramsA = ngrams(a, n);
  const ngramsB = ngrams(b, n);

  if (ngramsA.size === 0 || ngramsB.size === 0) return 0;

  let intersection = 0;
  for (const gram of ngramsA) {
    if (ngramsB.has(gram)) intersection++;
  }

  const union = new Set([...ngramsA, ...ngramsB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─── SIMILARITY ENGINE ──────────────────────────────────────

/**
 * Composite similarity engine.
 *
 * Combines TF-IDF cosine similarity with n-gram overlap
 * for robust memory search without external APIs.
 */
export class SimilarityEngine {
  private vectorizer: TfIdfVectorizer;
  private documents = new Map<string, { text: string; vector: TfIdfVector }>();

  constructor() {
    this.vectorizer = new TfIdfVectorizer();
  }

  /**
   * Index a document for similarity search.
   */
  index(id: string, text: string): void {
    this.vectorizer.addDocument(text);
    const vector = this.vectorizer.vectorize(text);
    this.documents.set(id, { text, vector });
  }

  /**
   * Re-vectorize all documents (call after batch indexing for accurate IDF).
   *
   * TF-IDF vectors depend on the full corpus (IDF changes as docs are added).
   * After bulk indexing, call this to recompute all vectors with final IDF values.
   */
  reindex(): void {
    for (const [id, doc] of this.documents) {
      const vector = this.vectorizer.vectorize(doc.text);
      this.documents.set(id, { text: doc.text, vector });
    }
  }

  /**
   * Search for similar documents.
   *
   * Returns composite score: TFIDF_WEIGHT * cosine + NGRAM_WEIGHT * ngram
   */
  search(query: string, limit: number = 10, minScore: number = 0.05): SimilarityResult[] {
    const queryVector = this.vectorizer.vectorize(query);
    const results: SimilarityResult[] = [];

    for (const [id, doc] of this.documents) {
      const tfidfScore = cosineSimilarity(queryVector, doc.vector);
      const ngramScore = ngramSimilarity(query, doc.text);
      const score = TFIDF_WEIGHT * tfidfScore + NGRAM_WEIGHT * ngramScore;

      if (score >= minScore) {
        results.push({ id, score, tfidfScore, ngramScore });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Batch index — add multiple documents and reindex once.
   * Uses TfIdfVectorizer.addDocuments for efficient batch TF-IDF computation.
   */
  indexBatch(entries: Array<{ id: string; text: string }>): void {
    // Batch add to vectorizer for IDF accuracy
    this.vectorizer.addDocuments(entries.map(e => e.text));
    for (const entry of entries) {
      const vector = this.vectorizer.vectorize(entry.text);
      this.documents.set(entry.id, { text: entry.text, vector });
    }
  }

  /**
   * Find the single most similar document.
   * Convenience wrapper over search(query, 1).
   */
  findMostSimilar(query: string): SimilarityResult | null {
    const results = this.search(query, 1, 0);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Check if a text has a near-duplicate in the index.
   * Uses higher n-gram weight for deduplication (more string-level similarity).
   */
  hasDuplicate(text: string, threshold: number = 0.7): { isDuplicate: boolean; matchId?: string; score?: number } {
    if (this.documents.size === 0) return { isDuplicate: false };

    // For deduplication, use more n-gram weight (string overlap matters more than TF-IDF)
    const queryVector = this.vectorizer.vectorize(text);
    let bestId: string | undefined;
    let bestScore = 0;

    for (const [id, doc] of this.documents) {
      const tfidfScore = cosineSimilarity(queryVector, doc.vector);
      const nScore = ngramSimilarity(text, doc.text);
      // Dedup uses 0.4 TF-IDF + 0.6 n-gram (string overlap prioritized)
      const score = 0.4 * tfidfScore + 0.6 * nScore;

      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    if (bestScore < threshold || !bestId) {
      return { isDuplicate: false };
    }
    return { isDuplicate: true, matchId: bestId, score: bestScore };
  }

  /**
   * Remove a document from the index.
   * Note: does not remove from IDF corpus (would require full rebuild).
   */
  remove(id: string): boolean {
    return this.documents.delete(id);
  }

  /**
   * Get corpus stats.
   */
  stats(): { documentCount: number; vocabSize: number } {
    const vectorizerStats = this.vectorizer.stats();
    return {
      documentCount: this.documents.size,
      vocabSize: vectorizerStats.vocabSize,
    };
  }
}
