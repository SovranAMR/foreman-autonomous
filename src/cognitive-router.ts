/**
 * FOREMAN — Cognitive Load Balancer (Multi-Provider Router)
 *
 * Sits between the Engine and LLM providers. When one provider hits
 * rate limits (429), instantly routes to the next provider — no sleep,
 * no exponential backoff, zero downtime.
 *
 * Why: A 47-tool, 39-engine system makes concurrent LLM calls.
 * Layer 4 (Worker) writes code while Layer 6 (Visual QA) analyzes screenshots.
 * Single-provider = HTTP 429 wall. Multi-provider = highway speed.
 *
 * Architecture:
 *   Engine.callLLM() → CognitiveRouter.route() → Provider A
 *                                              ↘ Provider B (on 429)
 *                                              ↘ Provider C (on 429)
 *
 * Same model (claude-sonnet) available via:
 *   1. Anthropic Direct API
 *   2. AWS Bedrock
 *   3. Google Vertex AI
 *   4. Antigravity (OpenClaw relay)
 */

import type { LLMProvider, LLMMessage, GenerateOptions, GenerateResult } from "./provider.js";

// ─── TYPES ───────────────────────────────────────────────────

export interface ProviderEndpoint {
  /** Unique identifier for this endpoint */
  id: string;
  /** The actual LLM provider instance */
  provider: LLMProvider;
  /** Priority (lower = preferred). Same priority = round-robin */
  priority: number;
  /** Max requests per minute for this endpoint */
  rpmLimit: number;
  /** Current request count in the sliding window */
  currentRpm: number;
  /** Timestamps of recent requests (sliding window) */
  requestTimestamps: number[];
  /** Consecutive failures (resets on success) */
  consecutiveFailures: number;
  /** Cooldown until this timestamp (ms) — set after repeated 429s */
  cooldownUntil: number;
  /** Total requests served */
  totalRequests: number;
  /** Total tokens processed */
  totalTokens: number;
}

export interface RouteResult {
  result: GenerateResult;
  endpointId: string;
  latencyMs: number;
  failoverCount: number;
}

export interface RouterStats {
  totalRequests: number;
  totalFailovers: number;
  endpointStats: Array<{
    id: string;
    requests: number;
    tokens: number;
    currentRpm: number;
    healthy: boolean;
  }>;
}

// ─── COGNITIVE LOAD BALANCER ─────────────────────────────────

export class CognitiveLoadBalancer {
  private endpoints: Map<string, ProviderEndpoint> = new Map();
  private totalRequests = 0;
  private totalFailovers = 0;

  /**
   * Register a provider endpoint.
   */
  addEndpoint(params: {
    id: string;
    provider: LLMProvider;
    priority?: number;
    rpmLimit?: number;
  }): void {
    this.endpoints.set(params.id, {
      id: params.id,
      provider: params.provider,
      priority: params.priority ?? 10,
      rpmLimit: params.rpmLimit ?? 60,
      currentRpm: 0,
      requestTimestamps: [],
      consecutiveFailures: 0,
      cooldownUntil: 0,
      totalRequests: 0,
      totalTokens: 0,
    });
  }

  /**
   * Route a request through available endpoints.
   * On 429/rate-limit: instantly failover to next endpoint (no sleep).
   * On repeated failures: put endpoint in cooldown.
   */
  async route(
    messages: LLMMessage[],
    options: GenerateOptions,
  ): Promise<RouteResult> {
    this.totalRequests++;
    let failoverCount = 0;

    // Sort endpoints by priority, then by load (fewest current requests)
    const sorted = this.getAvailableEndpoints();

    if (sorted.length === 0) {
      throw new Error("All provider endpoints are rate-limited or in cooldown. Retry later.");
    }

    for (const endpoint of sorted) {
      try {
        // Prune old timestamps from sliding window (1 minute)
        this.pruneTimestamps(endpoint);

        // Check RPM limit BEFORE sending
        if (endpoint.currentRpm >= endpoint.rpmLimit) {
          failoverCount++;
          this.totalFailovers++;
          continue; // Skip to next endpoint
        }

        const start = Date.now();
        const result = await endpoint.provider.generate(messages, options);
        const latencyMs = Date.now() - start;

        // Success — record metrics
        endpoint.requestTimestamps.push(Date.now());
        endpoint.currentRpm++;
        endpoint.consecutiveFailures = 0;
        endpoint.totalRequests++;
        endpoint.totalTokens += result.tokenUsage.total;

        return { result, endpointId: endpoint.id, latencyMs, failoverCount };

      } catch (err) {
        const isRateLimit = this.isRateLimitError(err);

        endpoint.consecutiveFailures++;
        failoverCount++;
        this.totalFailovers++;

        if (isRateLimit) {
          // Put endpoint in cooldown based on consecutive failures
          const cooldownMs = Math.min(
            60_000, // max 60s cooldown
            1000 * Math.pow(2, endpoint.consecutiveFailures), // exponential: 2s, 4s, 8s, 16s, 32s, 60s
          );
          endpoint.cooldownUntil = Date.now() + cooldownMs;
        }

        // Try next endpoint (no sleep, instant failover)
        continue;
      }
    }

    throw new Error(
      `All ${sorted.length} endpoints failed after ${failoverCount} failovers. ` +
      `Endpoints: ${sorted.map(e => `${e.id}(fail:${e.consecutiveFailures})`).join(", ")}`,
    );
  }

  /**
   * Get endpoints sorted by availability.
   * Filters out endpoints in cooldown, sorts by priority then load.
   */
  private getAvailableEndpoints(): ProviderEndpoint[] {
    const now = Date.now();
    return [...this.endpoints.values()]
      .filter(e => e.cooldownUntil < now) // not in cooldown
      .sort((a, b) => {
        // Primary: priority (lower first)
        if (a.priority !== b.priority) return a.priority - b.priority;
        // Secondary: least loaded (fewer current RPM)
        return a.currentRpm - b.currentRpm;
      });
  }

  /**
   * Remove timestamps older than 60 seconds from sliding window.
   */
  private pruneTimestamps(endpoint: ProviderEndpoint): void {
    const cutoff = Date.now() - 60_000;
    endpoint.requestTimestamps = endpoint.requestTimestamps.filter(t => t > cutoff);
    endpoint.currentRpm = endpoint.requestTimestamps.length;
  }

  /**
   * Detect rate limit errors (HTTP 429, provider-specific messages).
   */
  private isRateLimitError(err: unknown): boolean {
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      return msg.includes("429") ||
        msg.includes("rate limit") ||
        msg.includes("too many requests") ||
        msg.includes("quota exceeded") ||
        msg.includes("resource_exhausted");
    }
    return false;
  }

  /**
   * Get router statistics.
   */
  stats(): RouterStats {
    const now = Date.now();
    return {
      totalRequests: this.totalRequests,
      totalFailovers: this.totalFailovers,
      endpointStats: [...this.endpoints.values()].map(e => {
        this.pruneTimestamps(e);
        return {
          id: e.id,
          requests: e.totalRequests,
          tokens: e.totalTokens,
          currentRpm: e.currentRpm,
          healthy: e.cooldownUntil < now && e.consecutiveFailures < 5,
        };
      }),
    };
  }

  /**
   * Number of registered endpoints.
   */
  get size(): number {
    return this.endpoints.size;
  }

  /**
   * Check if any endpoint is available.
   */
  hasAvailableEndpoint(): boolean {
    return this.getAvailableEndpoints().length > 0;
  }

  /**
   * Reset all cooldowns (manual recovery).
   */
  resetCooldowns(): void {
    for (const endpoint of this.endpoints.values()) {
      endpoint.cooldownUntil = 0;
      endpoint.consecutiveFailures = 0;
    }
  }
}
