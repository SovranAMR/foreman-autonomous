/**
 * FOREMAN — Engine
 *
 * Ana motor — düşünce üretme, araştırma, yürütme.
 * Tüm alt sistemleri (state, persistence, rate limiter, provider)
 * koordine eder.
 */

import type {
  Layer,
  Thought,
  ThinkRequest,
  ThinkResult,
  ResearchResult,
} from "./types.js";
import { DEFAULT_LAYER_CONFIGS } from "./types.js";
import { StateManager } from "./state.js";
import { ThoughtManager } from "./thought-manager.js";
import { ChainManager } from "./chain-manager.js";
import { RateLimiter } from "./rate-limiter.js";
import type { RateLimitConfig } from "./types.js";
import { validateThoughtCompletion } from "./validators.js";
import type { LLMProvider, GenerateResult } from "./provider.js";
import { ProviderRegistry } from "./provider.js";
import { getSystemPrompt, buildContextText, buildUserPrompt } from "./prompts.js";

// ─── ENGINE CONFIG ───────────────────────────────────────────

export interface EngineConfig {
  projectRoot: string;
  projectName: string;
  /** Rate limit override (test için düşük delay) */
  rateLimitOverride?: Partial<RateLimitConfig & { backoffBaseMs: number }>;
}

// ─── ENGINE ──────────────────────────────────────────────────

export class Engine {
  readonly state: StateManager;
  readonly thoughts: ThoughtManager;
  readonly chains: ChainManager;
  readonly rateLimiter: RateLimiter;
  readonly providers: ProviderRegistry;

  private config: EngineConfig;

  constructor(config: EngineConfig) {
    this.config = config;

    // State: load from disk or create fresh
    const loaded = StateManager.load(config.projectRoot);
    this.state = loaded ?? StateManager.create(config.projectRoot, config.projectName);

    // Persistence
    this.thoughts = new ThoughtManager(config.projectRoot);
    this.chains = new ChainManager(config.projectRoot);

    // Rate limiting
    this.rateLimiter = new RateLimiter(config.rateLimitOverride);

    // Provider registry (must be populated externally)
    this.providers = new ProviderRegistry();
  }

  /**
   * Tek bir düşünce üret.
   *
   * Akış:
   * 1. Rate limit acquire
   * 2. Bağlam derle (chain summary + referenced thoughts)
   * 3. Prompt oluştur (system + user)
   * 4. LLM çağrısı
   * 5. Yanıtı parse et → ThinkResult
   * 6. Thought oluştur/güncelle
   * 7. Token kaydet
   */
  async think(request: ThinkRequest): Promise<ThinkResult> {
    // Rate limit
    await this.rateLimiter.acquire();

    // Model seç (override veya layer default)
    const model = request.constraints?.model
      ?? this.rateLimiter.currentModel()
      ?? DEFAULT_LAYER_CONFIGS[request.layer].defaultModel;

    // Provider bul
    const provider = this.providers.getProviderForModel(model);
    if (!provider) {
      throw new Error(`No provider found for model: ${model}`);
    }

    // Bağlam derle
    const referencedThoughts = request.contextRefs
      .filter(ref => ref.startsWith("t_"))
      .map(ref => this.thoughts.get(ref))
      .filter((t): t is Thought => t !== null);

    const chainId = request.contextRefs.find(ref => ref.startsWith("chain_"));
    const chain = chainId ? this.chains.get(chainId) : null;

    const contextText = request.contextText
      ?? buildContextText(chain, referencedThoughts);

    // Prompt oluştur
    const systemPrompt = getSystemPrompt(request.layer);
    const userPrompt = buildUserPrompt(request.input, contextText);

    // LLM çağrısı
    let result: GenerateResult;
    try {
      result = await provider.generate(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        {
          model,
          maxTokens: request.constraints?.maxTokens ?? 4000,
          temperature: 0.7,
        },
      );
      this.rateLimiter.onSuccess();
    } catch (err: any) {
      // Rate limited? → rotate model and retry
      if (err?.status === 429 || err?.message?.includes("429")) {
        const newModel = await this.rateLimiter.onRateLimited();
        const newProvider = this.providers.getProviderForModel(newModel);
        if (!newProvider) {
          throw new Error(`No provider for fallback model: ${newModel}`);
        }
        result = await newProvider.generate(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          { model: newModel, maxTokens: request.constraints?.maxTokens ?? 4000 },
        );
        this.rateLimiter.onSuccess();
      } else {
        throw err;
      }
    }

    // Token kaydet
    this.rateLimiter.recordTokens(result.tokenUsage.total);
    this.state.addTokens(result.tokenUsage.total);

    // Parse result
    const thinkResult = this.parseThinkResult(result.text, result);

    return thinkResult;
  }

  /**
   * LLM yanıtını ThinkResult'a parse et.
   */
  private parseThinkResult(text: string, raw: GenerateResult): ThinkResult {
    // REASONING: ... ve OUTPUT: ... bloklarını ara
    const reasoningMatch = text.match(/REASONING:\s*([\s\S]*?)(?=OUTPUT:|CONFIDENCE:|NEEDS_RESEARCH:|FINDINGS:|STEP1_READ:|$)/i);
    const outputMatch = text.match(/OUTPUT:\s*([\s\S]*?)(?=CONFIDENCE:|NEEDS_RESEARCH:|RESEARCH_QUERY:|$)/i);
    const confidenceMatch = text.match(/CONFIDENCE:\s*([\d.]+)/i);
    const needsResearchMatch = text.match(/NEEDS_RESEARCH:\s*(true|false)/i);
    const researchQueryMatch = text.match(/RESEARCH_QUERY:\s*([\s\S]*?)(?=\n\n|$)/i);

    return {
      reasoning: reasoningMatch?.[1]?.trim() ?? text,
      output: outputMatch?.[1]?.trim() ?? text,
      confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.7,
      needsResearch: needsResearchMatch?.[1]?.toLowerCase() === "true",
      researchQuery: researchQueryMatch?.[1]?.trim(),
      tokenCost: raw.tokenUsage.total,
      model: raw.model,
    };
  }

  /**
   * Bir düşünce zincirinde tek adım ilerle.
   *
   * 1. Thought oluştur (pending)
   * 2. State geçişi (layer'a göre)
   * 3. think() çağır
   * 4. Thought güncelle (reasoning, output, status)
   * 5. Validate
   * 6. State geçişi (verifying)
   */
  async step(
    chainId: string,
    input: string,
    layer: Layer,
    contextRefs: string[] = [],
  ): Promise<Thought> {
    // 1. Thought oluştur
    const thought = this.thoughts.create({
      chainId,
      layer,
      input,
      contextRefs,
    });

    // Chain'e ekle
    this.chains.addThought(chainId, thought.id);

    // Reset thought budget
    this.rateLimiter.resetThoughtBudget();

    // 2. State geçişi
    const stateForLayer: Record<Layer, "visioning" | "decomposing" | "researching" | "executing"> = {
      visioner: "visioning",
      strategist: "decomposing",
      researcher: "researching",
      worker: "executing",
    };

    // State geçişi — eğer uygunsa
    const targetState = stateForLayer[layer];
    if (this.state.canTransition(targetState)) {
      this.state.transition(targetState, `Starting thought ${thought.id}`, {
        thoughtId: thought.id,
        chainId,
      });
    }

    // 3. think() çağır
    this.thoughts.update(thought.id, { status: "thinking" });

    const result = await this.think({
      input,
      layer,
      contextRefs,
    });

    // 4. Thought güncelle
    const updated = this.thoughts.update(thought.id, {
      reasoning: result.reasoning,
      output: result.output,
      confidence: result.confidence,
      needsResearch: result.needsResearch,
      researchQuery: result.researchQuery,
      tokenCost: result.tokenCost,
      model: result.model,
      status: "done",
      completedAt: new Date().toISOString(),
    });

    // 5. Verify durumuna geç (uygunsa)
    if (this.state.canTransition("verifying")) {
      this.state.transition("verifying", `Thought ${thought.id} completed, verifying`, {
        thoughtId: thought.id,
      });
    }

    return updated;
  }
}
