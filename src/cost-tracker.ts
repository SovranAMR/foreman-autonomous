/**
 * FOREMAN — Cost Tracker Engine
 *
 * Real-time cost tracking for LLM API calls.
 * Tracks per-model, per-phase, per-pipeline costs.
 *
 * OpenClaw'dan alınan: MODEL_COSTS pricing table concept
 * Foreman farkı: Pipeline-phase-aware, multi-provider, cumulative tracking
 *
 * Capabilities:
 * - Per-model pricing (input/output/cache tokens)
 * - Phase-level cost breakdown (vision vs worker vs research)
 * - Pipeline-level total cost
 * - Session-level cumulative cost
 * - Cost alerts (budget limits)
 * - Cost report generation
 * - Multi-currency display (USD primary)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// ─── TYPES ───────────────────────────────────────────────────

export interface ModelPricing {
  /** Cost per 1M input tokens in USD */
  input: number;
  /** Cost per 1M output tokens in USD */
  output: number;
  /** Cost per 1M cached input tokens in USD */
  cacheRead: number;
  /** Cost per 1M cache write tokens in USD */
  cacheWrite: number;
}

export interface CostEntry {
  id: string;
  model: string;
  phase: string;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  cost: number;
  timestamp: number;
  chainId?: string;
  atomIndex?: number;
}

export interface PhaseCostBreakdown {
  phase: string;
  totalCost: number;
  totalTokens: number;
  callCount: number;
}

export interface CostReport {
  totalCost: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  byPhase: PhaseCostBreakdown[];
  byModel: Array<{ model: string; cost: number; calls: number }>;
  topExpensiveCalls: CostEntry[];
  averageCostPerCall: number;
  estimatedHourlyCost: number;
}

export interface CostBudget {
  /** Max cost per pipeline run in USD */
  perRun?: number;
  /** Max cost per session (lifetime) in USD */
  perSession?: number;
  /** Max cost per hour in USD */
  perHour?: number;
  /** Alert threshold (fraction of budget, 0.0-1.0) */
  alertThreshold: number;
}

// ─── MODEL PRICING TABLE ─────────────────────────────────────
// Prices per 1M tokens in USD

export const MODEL_COSTS: Record<string, ModelPricing> = {
  // Gemini
  "gemini-2.5-pro": { input: 1.25, output: 10.0, cacheRead: 0.3125, cacheWrite: 0 },
  "gemini-2.5-flash": { input: 0.15, output: 0.60, cacheRead: 0.0375, cacheWrite: 0 },
  "gemini-2.0-flash": { input: 0.10, output: 0.40, cacheRead: 0.025, cacheWrite: 0 },
  "gemini-3-pro": { input: 2.0, output: 12.0, cacheRead: 0.2, cacheWrite: 0 },
  "gemini-3-flash": { input: 0.50, output: 3.0, cacheRead: 0.05, cacheWrite: 0 },
  "gemini-3.1-pro-high": { input: 2.5, output: 15.0, cacheRead: 0.25, cacheWrite: 0 },

  // OpenAI
  "gpt-4o": { input: 2.50, output: 10.0, cacheRead: 1.25, cacheWrite: 0 },
  "gpt-4o-mini": { input: 0.15, output: 0.60, cacheRead: 0.075, cacheWrite: 0 },
  "gpt-4.1": { input: 2.0, output: 8.0, cacheRead: 0.5, cacheWrite: 0 },
  "gpt-4.1-mini": { input: 0.40, output: 1.60, cacheRead: 0.1, cacheWrite: 0 },
  "gpt-4.1-nano": { input: 0.10, output: 0.40, cacheRead: 0.025, cacheWrite: 0 },
  "gpt-5.1": { input: 1.07, output: 8.5, cacheRead: 0.107, cacheWrite: 0 },
  "o3-mini": { input: 1.10, output: 4.40, cacheRead: 0.55, cacheWrite: 0 },

  // Anthropic
  "claude-3-5-sonnet": { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-3.5-sonnet": { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-3-7-sonnet": { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-3.7-sonnet": { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-sonnet-4": { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-3-5-haiku": { input: 0.80, output: 4.0, cacheRead: 0.08, cacheWrite: 1.0 },
  "claude-3.5-haiku": { input: 0.80, output: 4.0, cacheRead: 0.08, cacheWrite: 1.0 },
  "claude-haiku-3.5": { input: 0.80, output: 4.0, cacheRead: 0.08, cacheWrite: 1.0 },
  "claude-opus-4": { input: 15.0, output: 75.0, cacheRead: 1.5, cacheWrite: 18.75 },

  // Grok / xAI
  "grok-2": { input: 2.0, output: 10.0, cacheRead: 0, cacheWrite: 0 },
  "grok-3": { input: 4.0, output: 20.0, cacheRead: 0, cacheWrite: 0 },
  "grok-3-thinking": { input: 4.0, output: 20.0, cacheRead: 0, cacheWrite: 0 },

  // Deepseek
  "deepseek-chat": { input: 0.27, output: 1.10, cacheRead: 0.07, cacheWrite: 0 },
  "deepseek-reasoner": { input: 0.55, output: 2.19, cacheRead: 0.14, cacheWrite: 0 },

  // Kimi / Moonshot
  "kimi-k2.5": { input: 0.80, output: 3.20, cacheRead: 0.20, cacheWrite: 0 },
  "kimi-k2-thinking": { input: 0.80, output: 3.20, cacheRead: 0.20, cacheWrite: 0 },
  "kimi-k2-thinking-turbo": { input: 0.40, output: 1.60, cacheRead: 0.10, cacheWrite: 0 },
  "moonshot-v1-128k": { input: 0.80, output: 3.20, cacheRead: 0.20, cacheWrite: 0 },

  // Free/cheap models
  "llama-3.3-70b": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  "qwen-2.5-72b": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

const DEFAULT_PRICING: ModelPricing = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

// ─── COST TRACKER ────────────────────────────────────────────

export class CostTracker {
  private entries: CostEntry[] = [];
  private sessionStart: number;
  private budget: CostBudget;
  private storagePath: string;
  private alertCallback?: (message: string) => void;

  constructor(projectRoot: string, budget?: Partial<CostBudget>) {
    this.sessionStart = Date.now();
    this.storagePath = join(projectRoot, ".foreman", "cost-history.json");
    this.budget = { alertThreshold: 0.8, ...budget };
    this.load();
  }

  /**
   * Set alert callback.
   */
  public onAlert(callback: (message: string) => void): void {
    this.alertCallback = callback;
  }

  /**
   * Inject budget configuration.
   */
  public setBudget(budget: Partial<CostBudget>): void {
    this.budget = { ...this.budget, ...budget };
    this.checkBudget();
  }

  /**
   * Record a cost entry.
   */
  public record(
    model: string,
    phase: string,
    inputTokens: number,
    outputTokens: number,
    cacheTokens = 0,
    meta?: { chainId?: string; atomIndex?: number },
  ): CostEntry {
    const pricing = this.getPricing(model);
    const cost = this.calculateCost(pricing, inputTokens, outputTokens, cacheTokens);

    const entry: CostEntry = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
      model,
      phase,
      inputTokens,
      outputTokens,
      cacheTokens,
      cost,
      timestamp: Date.now(),
      chainId: meta?.chainId,
      atomIndex: meta?.atomIndex,
    };

    this.entries.push(entry);
    this.checkBudget();
    this.save();

    return entry;
  }

  /**
   * Get total cost for this session.
   */
  public getTotalCost(): number {
    return this.entries.reduce((sum, e) => sum + e.cost, 0);
  }

  /**
   * Get total tokens for this session.
   */
  public getTotalTokens(): number {
    return this.entries.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0);
  }

  /**
   * Get cost for a specific pipeline run (by chainId).
   */
  public getRunCost(chainId: string): number {
    return this.entries
      .filter(e => e.chainId === chainId)
      .reduce((sum, e) => sum + e.cost, 0);
  }

  /**
   * Generate a cost report.
   */
  public generateReport(): CostReport {
    const totalCost = this.getTotalCost();
    const totalTokens = this.getTotalTokens();
    const totalInputTokens = this.entries.reduce((s, e) => s + e.inputTokens, 0);
    const totalOutputTokens = this.entries.reduce((s, e) => s + e.outputTokens, 0);
    const totalCalls = this.entries.length;

    // By phase
    const phaseMap = new Map<string, PhaseCostBreakdown>();
    for (const entry of this.entries) {
      const existing = phaseMap.get(entry.phase) ?? { phase: entry.phase, totalCost: 0, totalTokens: 0, callCount: 0 };
      existing.totalCost += entry.cost;
      existing.totalTokens += entry.inputTokens + entry.outputTokens;
      existing.callCount++;
      phaseMap.set(entry.phase, existing);
    }

    // By model
    const modelMap = new Map<string, { model: string; cost: number; calls: number }>();
    for (const entry of this.entries) {
      const existing = modelMap.get(entry.model) ?? { model: entry.model, cost: 0, calls: 0 };
      existing.cost += entry.cost;
      existing.calls++;
      modelMap.set(entry.model, existing);
    }

    // Top expensive calls
    const topExpensiveCalls = [...this.entries]
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);

    // Estimated hourly cost
    const sessionDurationHours = (Date.now() - this.sessionStart) / 3_600_000;
    const estimatedHourlyCost = sessionDurationHours > 0 ? totalCost / sessionDurationHours : 0;

    return {
      totalCost,
      totalTokens,
      totalInputTokens,
      totalOutputTokens,
      totalCalls,
      byPhase: [...phaseMap.values()].sort((a, b) => b.totalCost - a.totalCost),
      byModel: [...modelMap.values()].sort((a, b) => b.cost - a.cost),
      topExpensiveCalls,
      averageCostPerCall: totalCalls > 0 ? totalCost / totalCalls : 0,
      estimatedHourlyCost,
    };
  }

  /**
   * Format report as string.
   */
  public formatReport(): string {
    const r = this.generateReport();
    const lines: string[] = [];

    lines.push(`\x1b[1m💰 Cost Report\x1b[0m`);
    lines.push(`  Total: $${r.totalCost.toFixed(4)} (${r.totalCalls} calls)`);
    lines.push(`  Tokens: ${r.totalInputTokens.toLocaleString()} in / ${r.totalOutputTokens.toLocaleString()} out`);
    lines.push(`  Avg: $${r.averageCostPerCall.toFixed(6)}/call`);

    if (r.estimatedHourlyCost > 0) {
      lines.push(`  Rate: ~$${r.estimatedHourlyCost.toFixed(4)}/hour`);
    }

    if (r.byPhase.length > 0) {
      lines.push(`\n  \x1b[1mBy Phase:\x1b[0m`);
      for (const p of r.byPhase) {
        lines.push(`    ${p.phase.padEnd(12)} $${p.totalCost.toFixed(4)} (${p.callCount} calls)`);
      }
    }

    if (r.byModel.length > 0) {
      lines.push(`\n  \x1b[1mBy Model:\x1b[0m`);
      for (const m of r.byModel) {
        lines.push(`    ${m.model.padEnd(25)} $${m.cost.toFixed(4)} (${m.calls} calls)`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Get pricing for a model (exact match or fuzzy).
   */
  public getPricing(modelId: string): ModelPricing {
    // Exact match
    if (MODEL_COSTS[modelId]) return MODEL_COSTS[modelId];

    // Fuzzy match (strip version suffixes, check prefixes)
    const normalized = modelId.toLowerCase().replace(/-latest$/, "");
    for (const [key, pricing] of Object.entries(MODEL_COSTS)) {
      if (normalized.startsWith(key) || key.startsWith(normalized)) {
        return pricing;
      }
    }

    return DEFAULT_PRICING;
  }

  /**
   * Add custom model pricing.
   */
  public addPricing(modelId: string, pricing: ModelPricing): void {
    MODEL_COSTS[modelId] = pricing;
  }

  // ─── INTERNAL ───────────────────────────────────────────

  private calculateCost(
    pricing: ModelPricing,
    inputTokens: number,
    outputTokens: number,
    cacheTokens: number,
  ): number {
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    const cacheCost = (cacheTokens / 1_000_000) * pricing.cacheRead;
    return inputCost + outputCost + cacheCost;
  }

  private checkBudget(): void {
    const total = this.getTotalCost();

    if (this.budget.perSession && total > this.budget.perSession * this.budget.alertThreshold) {
      this.alertCallback?.(`⚠️ Session cost $${total.toFixed(4)} approaching budget $${this.budget.perSession.toFixed(2)}`);
    }

    if (this.budget.perHour) {
      const hourlyRate = total / ((Date.now() - this.sessionStart) / 3_600_000);
      if (hourlyRate > this.budget.perHour * this.budget.alertThreshold) {
        this.alertCallback?.(`⚠️ Hourly rate $${hourlyRate.toFixed(4)}/h approaching limit $${this.budget.perHour.toFixed(2)}/h`);
      }
    }
  }

  private save(): void {
    try {
      const dir = dirname(this.storagePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(this.storagePath, JSON.stringify({
        sessionStart: this.sessionStart,
        entries: this.entries.slice(-1000), // Keep last 1000 entries
      }, null, 2), "utf-8");
    } catch { /* best-effort */ }
  }

  private load(): void {
    try {
      if (existsSync(this.storagePath)) {
        const data = JSON.parse(readFileSync(this.storagePath, "utf-8"));
        // Only load entries from current session (within last 8 hours)
        const cutoff = Date.now() - 8 * 3_600_000;
        this.entries = (data.entries ?? []).filter((e: CostEntry) => e.timestamp > cutoff);
        if (data.sessionStart && data.sessionStart > cutoff) {
          this.sessionStart = data.sessionStart;
        }
      }
    } catch { /* start fresh */ }
  }
}
