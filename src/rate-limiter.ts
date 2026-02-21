/**
 * FOREMAN — Rate Limiter
 *
 * LLM çağrılarını throttle eder, model rotasyonu yapar,
 * token bütçesini takip eder.
 *
 * Tek provider'ı boğmadan gece boyunca çalışabilmek için.
 */

import type { RateLimitConfig, ModelRotation, TokenBudget } from "./types.js";

/**
 * Extended config with test-friendly options.
 */
interface InternalConfig extends RateLimitConfig {
  /** Base ms for exponential backoff (default 1000) */
  backoffBaseMs: number;
}

// ─── ERRORS ───────────────────────────────────────────────────

export class BudgetExceededError extends Error {
  constructor(
    public readonly scope: "thought" | "chain" | "session",
    public readonly limit: number,
    public readonly current: number,
  ) {
    super(
      `Token budget exceeded (${scope}): ${current}/${limit}. ` +
      `Reduce scope or increase budget.`
    );
    this.name = "BudgetExceededError";
  }
}

// ─── DEFAULT CONFIG ──────────────────────────────────────────

export const DEFAULT_RATE_LIMIT_CONFIG: InternalConfig = {
  minDelayBetweenCalls: 3000,      // 3 saniye
  maxCallsPerMinute: 15,
  cooldownAfterBurst: 30000,       // 30 saniye
  backoffStrategy: "exponential",
  backoffBaseMs: 1000,             // 1 saniye base
  maxRetries: 5,
  modelRotation: {
    primary: "claude-sonnet",
    fallback: ["gpt-4o-mini", "gemini-flash"],
    rotateOn429: true,
  },
  budget: {
    perThought: 8000,
    perChain: 40000,
    perSession: 500000,
  },
};

// ─── SLEEP HELPER ────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── RATE LIMITER ────────────────────────────────────────────

export class RateLimiter {
  private config: InternalConfig;
  private callTimestamps: number[] = [];
  private lastCallTime: number = 0;
  private currentModelIndex: number = -1; // -1 = primary
  private consecutiveRetries: number = 0;

  // Token tracking
  private thoughtTokens: number = 0;
  private chainTokens: number = 0;
  private sessionTokens: number = 0;

  constructor(config?: Partial<InternalConfig>) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
  }

  /**
   * Çağrı yapmadan önce izin al.
   * Yeterli süre geçmediyse bekler.
   * Burst limit aşıldıysa cooldown bekler.
   */
  async acquire(): Promise<void> {
    const now = Date.now();

    // 1. Min delay kontrolü
    const elapsed = now - this.lastCallTime;
    if (elapsed < this.config.minDelayBetweenCalls) {
      const waitTime = this.config.minDelayBetweenCalls - elapsed;
      await sleep(waitTime);
    }

    // 2. Burst protection — sliding window
    this.pruneOldTimestamps();
    if (this.callTimestamps.length >= this.config.maxCallsPerMinute) {
      // Cooldown
      await sleep(this.config.cooldownAfterBurst);
      this.callTimestamps = []; // reset window
    }

    // Çağrıyı kaydet
    const callTime = Date.now();
    this.lastCallTime = callTime;
    this.callTimestamps.push(callTime);
  }

  /**
   * 429 geldiğinde çağır. Exponential backoff + model rotate.
   * Döndürdüğü model'i kullan.
   */
  async onRateLimited(): Promise<string> {
    this.consecutiveRetries++;

    if (this.consecutiveRetries > this.config.maxRetries) {
      throw new Error(
        `Max retries (${this.config.maxRetries}) exceeded. ` +
        `All models exhausted or rate limits too strict.`
      );
    }

    // Exponential backoff: 2^retry * baseMs
    const backoffMs = Math.pow(2, this.consecutiveRetries) * this.config.backoffBaseMs;
    await sleep(backoffMs);

    // Model rotasyonu
    if (this.config.modelRotation.rotateOn429) {
      return this.rotateModel();
    }

    return this.currentModel();
  }

  /**
   * Başarılı çağrı sonrası. Retry counter sıfırla.
   */
  onSuccess(): void {
    this.consecutiveRetries = 0;
  }

  /**
   * Mevcut aktif model.
   */
  currentModel(): string {
    if (this.currentModelIndex < 0) {
      return this.config.modelRotation.primary;
    }
    const fallbacks = this.config.modelRotation.fallback;
    return fallbacks[this.currentModelIndex % fallbacks.length];
  }

  /**
   * Sonraki modele geç. Döngüsel — tüm fallback'leri geçince primary'e döner.
   */
  private rotateModel(): string {
    const fallbacks = this.config.modelRotation.fallback;
    if (fallbacks.length === 0) {
      return this.config.modelRotation.primary; // fallback yok
    }

    this.currentModelIndex++;
    if (this.currentModelIndex >= fallbacks.length) {
      // Tüm fallback'ler denendi, primary'e dön
      this.currentModelIndex = -1;
      return this.config.modelRotation.primary;
    }

    return fallbacks[this.currentModelIndex];
  }

  /**
   * Model'i primary'e sıfırla.
   */
  resetModel(): void {
    this.currentModelIndex = -1;
    this.consecutiveRetries = 0;
  }

  // ─── TOKEN BUDGET ──────────────────────────────────────────

  /**
   * Token harcaması kaydet ve bütçe kontrolü yap.
   *
   * @throws BudgetExceededError
   */
  recordTokens(count: number): void {
    this.thoughtTokens += count;
    this.chainTokens += count;
    this.sessionTokens += count;

    // Bütçe kontrolü
    if (this.thoughtTokens > this.config.budget.perThought) {
      throw new BudgetExceededError("thought", this.config.budget.perThought, this.thoughtTokens);
    }
    if (this.chainTokens > this.config.budget.perChain) {
      throw new BudgetExceededError("chain", this.config.budget.perChain, this.chainTokens);
    }
    if (this.sessionTokens > this.config.budget.perSession) {
      throw new BudgetExceededError("session", this.config.budget.perSession, this.sessionTokens);
    }
  }

  /**
   * Yeni thought başladığında thought token counter sıfırla.
   */
  resetThoughtBudget(): void {
    this.thoughtTokens = 0;
  }

  /**
   * Yeni chain başladığında chain token counter sıfırla.
   */
  resetChainBudget(): void {
    this.chainTokens = 0;
    this.thoughtTokens = 0;
  }

  /**
   * Mevcut token kullanımını döndür.
   */
  tokenUsage(): { thought: number; chain: number; session: number } {
    return {
      thought: this.thoughtTokens,
      chain: this.chainTokens,
      session: this.sessionTokens,
    };
  }

  // ─── PRIVATE ───────────────────────────────────────────────

  /**
   * 60 saniyeden eski timestamp'leri temizle (sliding window).
   */
  private pruneOldTimestamps(): void {
    const cutoff = Date.now() - 60_000;
    this.callTimestamps = this.callTimestamps.filter(t => t > cutoff);
  }
}
