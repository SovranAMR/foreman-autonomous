/**
 * FOREMAN — Engine
 *
 * Ana motor — düşünce üretme, doğrulama, retry.
 * Tüm alt sistemleri koordine eder.
 *
 * ÖNEMLİ: Engine prompt'la "lütfen formatla" demez, parse eder.
 * Parse başarısızsa retry eder. Retry da başarısızsa BLOCK.
 */

import type {
  Layer,
  Thought,
  ThinkRequest,
  ThinkResult,
  WorkerProtocol,
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
import type { ParsePhase, ParseError } from "./parser.js";
import { parseForPhase, buildRetryPrompt, parseWorkerResponse, parseVisionResponse, parseResearchResponse, parseDecomposeResponse, parseAtomizeResponse } from "./parser.js";

// ─── ENGINE CONFIG ───────────────────────────────────────────

export interface EngineConfig {
  projectRoot: string;
  projectName: string;
  rateLimitOverride?: Partial<RateLimitConfig & { backoffBaseMs: number }>;
  /** Max retry for format correction (default: 2) */
  maxFormatRetries?: number;
}

// ─── STEP RESULT ─────────────────────────────────────────────

/**
 * step() artık sadece Thought döndürmüyor.
 * Parse edilen yapısal data'yı da döndürüyor.
 */
export interface StepResult {
  thought: Thought;
  /** Parse edilmiş yapısal data (phase'e göre tip değişir) */
  parsed: any;
  /** Parse başarılı mı (retry dahil) */
  formatValid: boolean;
  /** Kaç retry yapıldı */
  retryCount: number;
}

// ─── ENGINE ──────────────────────────────────────────────────

export class Engine {
  readonly state: StateManager;
  readonly thoughts: ThoughtManager;
  readonly chains: ChainManager;
  readonly rateLimiter: RateLimiter;
  readonly providers: ProviderRegistry;

  private config: EngineConfig;
  private maxFormatRetries: number;

  constructor(config: EngineConfig) {
    this.config = config;
    this.maxFormatRetries = config.maxFormatRetries ?? 2;

    const loaded = StateManager.load(config.projectRoot);
    this.state = loaded ?? StateManager.create(config.projectRoot, config.projectName);

    this.thoughts = new ThoughtManager(config.projectRoot);
    this.chains = new ChainManager(config.projectRoot);
    this.rateLimiter = new RateLimiter(config.rateLimitOverride);
    this.providers = new ProviderRegistry();
  }

  /**
   * LLM'e tek bir çağrı yap.
   */
  async callLLM(
    systemPrompt: string,
    userPrompt: string,
    layer: Layer,
    overrideModel?: string,
  ): Promise<GenerateResult> {
    await this.rateLimiter.acquire();

    const model = overrideModel
      ?? this.rateLimiter.currentModel()
      ?? DEFAULT_LAYER_CONFIGS[layer].defaultModel;

    const provider = this.providers.getProviderForModel(model);
    if (!provider) {
      throw new Error(`No provider found for model: ${model}`);
    }

    let result: GenerateResult;
    try {
      result = await provider.generate(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { model, maxTokens: 4000, temperature: 0.7 },
      );
      this.rateLimiter.onSuccess();
    } catch (err: any) {
      if (err?.status === 429 || err?.message?.includes("429")) {
        const newModel = await this.rateLimiter.onRateLimited();
        const newProvider = this.providers.getProviderForModel(newModel);
        if (!newProvider) throw new Error(`No provider for fallback: ${newModel}`);
        result = await newProvider.generate(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          { model: newModel, maxTokens: 4000 },
        );
        this.rateLimiter.onSuccess();
      } else {
        throw err;
      }
    }

    this.rateLimiter.recordTokens(result.tokenUsage.total);
    this.state.addTokens(result.tokenUsage.total);

    return result;
  }

  /**
   * Phase-aware step: LLM çağır → parse et → başarısızsa retry → validate → persist.
   *
   * Bu metod pipeline'ın gerçek disiplin noktası:
   * 1. LLM çağrısı yapılır
   * 2. Çıktı phase'e göre parse edilir (vision/decompose/research/atomize/execute)
   * 3. Parse başarısızsa → LLM'e retry prompt gönderilir (max 2 retry)
   * 4. Worker thought'larında 8-adım protokol parse edilir ve Thought'a yazılır
   * 5. Validator çalıştırılır — geçemezse thought "blocked" olur
   */
  async stepWithPhase(
    chainId: string,
    input: string,
    layer: Layer,
    phase: ParsePhase,
    contextRefs: string[] = [],
  ): Promise<StepResult> {
    // 1. Thought oluştur
    const thought = this.thoughts.create({
      chainId,
      layer,
      input,
      contextRefs,
    });

    this.chains.addThought(chainId, thought.id);
    this.rateLimiter.resetThoughtBudget();

    // State geçişi
    const stateMap: Record<Layer, "visioning" | "decomposing" | "researching" | "executing"> = {
      visioner: "visioning",
      strategist: "decomposing",
      researcher: "researching",
      worker: "executing",
    };
    const targetState = stateMap[layer];
    if (this.state.canTransition(targetState)) {
      this.state.transition(targetState, `Starting thought ${thought.id}`, {
        thoughtId: thought.id,
        chainId,
      });
    }

    this.thoughts.update(thought.id, { status: "thinking" });

    // 2. Bağlam derle
    const referencedThoughts = contextRefs
      .filter(ref => ref.startsWith("t_"))
      .map(ref => this.thoughts.get(ref))
      .filter((t): t is Thought => t !== null);
    const chain = this.chains.get(chainId);
    const contextText = buildContextText(chain, referencedThoughts);

    const systemPrompt = getSystemPrompt(layer);
    const userPrompt = buildUserPrompt(input, contextText);

    // 3. İlk LLM çağrısı
    let result = await this.callLLM(systemPrompt, userPrompt, layer);
    let rawText = result.text;
    let totalTokens = result.tokenUsage.total;
    let retryCount = 0;
    let parseResult = parseForPhase(phase, rawText);

    // 4. Parse başarısızsa → retry
    while (!parseResult.ok && retryCount < this.maxFormatRetries) {
      retryCount++;
      const retryPrompt = buildRetryPrompt(
        (parseResult as { ok: false; error: ParseError }).error,
        phase,
      );
      result = await this.callLLM(systemPrompt, retryPrompt, layer);
      rawText = result.text;
      totalTokens += result.tokenUsage.total;
      parseResult = parseForPhase(phase, rawText);
    }

    const formatValid = parseResult.ok;
    let parsedData: any = null;
    let reasoning = rawText;
    let output = rawText;
    let confidence = 0.7;
    let workerProtocol: WorkerProtocol | undefined;

    if (parseResult.ok) {
      parsedData = parseResult.data;

      // Phase'e göre data çıkar
      if (phase === "execute") {
        // Worker — 8-adım protokol
        workerProtocol = parsedData.protocol;
        confidence = parsedData.confidence;
        reasoning = Object.entries(workerProtocol!)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n");
        output = workerProtocol!.step8_report;
      } else if (phase === "vision" || phase === "reflect") {
        reasoning = parsedData.reasoning;
        output = parsedData.output;
        confidence = parsedData.confidence;
      } else if (phase === "decompose") {
        reasoning = parsedData.reasoning;
        output = parsedData.blocks.map((b: string, i: number) => `${i + 1}. ${b}`).join("\n");
        confidence = parsedData.confidence;
      } else if (phase === "research") {
        reasoning = parsedData.reasoning;
        output = parsedData.findings;
        confidence = parsedData.relevance;
      } else if (phase === "atomize") {
        reasoning = `Atomized into ${parsedData.atoms.length} tasks`;
        output = parsedData.atoms.map((a: string, i: number) => `${i + 1}. ${a}`).join("\n");
        confidence = parsedData.confidence;
      }
    }

    // 5. Thought güncelle
    const updateData: Partial<Thought> = {
      reasoning,
      output,
      confidence,
      tokenCost: totalTokens,
      model: result.model,
      completedAt: new Date().toISOString(),
    };

    if (workerProtocol) {
      updateData.workerProtocol = workerProtocol;
    }

    // 6. Validation — parse başarısızsa veya validator reject ederse → blocked
    if (!formatValid) {
      updateData.status = "blocked";
      updateData.blockedReason = `Format parse failed after ${retryCount} retries. Missing: ${
        (parseResult as any).error?.missing?.join(", ") ?? "unknown"
      }`;
    } else {
      updateData.status = "done";
    }

    const updated = this.thoughts.update(thought.id, updateData);

    // Worker validation (8-adım tam mı?)
    if (updated.status === "done" && updated.layer === "worker") {
      const validation = validateThoughtCompletion(updated);
      if (!validation.valid) {
        this.thoughts.update(thought.id, {
          status: "blocked",
          blockedReason: `Validation failed: ${validation.errors.join("; ")}`,
        });
      }
    }

    // State: verifying
    if (this.state.canTransition("verifying")) {
      this.state.transition("verifying", `Thought ${thought.id} completed`, { thoughtId: thought.id });
    }

    const finalThought = this.thoughts.get(thought.id)!;

    return {
      thought: finalThought,
      parsed: parsedData,
      formatValid,
      retryCount,
    };
  }

  /**
   * Eski step() — geriye uyumluluk için.
   * Yeni kod stepWithPhase() kullanmalı.
   */
  async step(
    chainId: string,
    input: string,
    layer: Layer,
    contextRefs: string[] = [],
  ): Promise<Thought> {
    // Layer'dan phase tahmin et
    const phaseMap: Record<Layer, ParsePhase> = {
      visioner: "vision",
      strategist: "decompose",
      researcher: "research",
      worker: "execute",
    };
    const result = await this.stepWithPhase(chainId, input, layer, phaseMap[layer], contextRefs);
    return result.thought;
  }

  /**
   * Eski think() — geriye uyumluluk.
   */
  async think(request: ThinkRequest): Promise<ThinkResult> {
    await this.rateLimiter.acquire();

    const model = request.constraints?.model
      ?? this.rateLimiter.currentModel()
      ?? DEFAULT_LAYER_CONFIGS[request.layer].defaultModel;

    const provider = this.providers.getProviderForModel(model);
    if (!provider) throw new Error(`No provider found for model: ${model}`);

    const referencedThoughts = request.contextRefs
      .filter(ref => ref.startsWith("t_"))
      .map(ref => this.thoughts.get(ref))
      .filter((t): t is Thought => t !== null);

    const chainId = request.contextRefs.find(ref => ref.startsWith("chain_"));
    const chain = chainId ? this.chains.get(chainId) : null;
    const contextText = request.contextText ?? buildContextText(chain, referencedThoughts);

    const systemPrompt = getSystemPrompt(request.layer);
    const userPrompt = buildUserPrompt(request.input, contextText);

    let result: GenerateResult;
    try {
      result = await provider.generate(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { model, maxTokens: request.constraints?.maxTokens ?? 4000, temperature: 0.7 },
      );
      this.rateLimiter.onSuccess();
    } catch (err: any) {
      if (err?.status === 429 || err?.message?.includes("429")) {
        const newModel = await this.rateLimiter.onRateLimited();
        const newProvider = this.providers.getProviderForModel(newModel);
        if (!newProvider) throw new Error(`No provider for fallback: ${newModel}`);
        result = await newProvider.generate(
          [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
          { model: newModel, maxTokens: request.constraints?.maxTokens ?? 4000 },
        );
        this.rateLimiter.onSuccess();
      } else {
        throw err;
      }
    }

    this.rateLimiter.recordTokens(result.tokenUsage.total);
    this.state.addTokens(result.tokenUsage.total);

    const text = result.text;
    const reasoningMatch = text.match(/REASONING:\s*([\s\S]*?)(?=OUTPUT:|CONFIDENCE:|NEEDS_RESEARCH:|FINDINGS:|STEP1_READ:|$)/i);
    const outputMatch = text.match(/OUTPUT:\s*([\s\S]*?)(?=CONFIDENCE:|NEEDS_RESEARCH:|RESEARCH_QUERY:|$)/i);
    const confidenceMatch = text.match(/CONFIDENCE:\s*([\d.]+)/i);
    const needsResearchMatch = text.match(/NEEDS_RESEARCH:\s*(true|false)/i);

    return {
      reasoning: reasoningMatch?.[1]?.trim() ?? text,
      output: outputMatch?.[1]?.trim() ?? text,
      confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.7,
      needsResearch: needsResearchMatch?.[1]?.toLowerCase() === "true",
      tokenCost: result.tokenUsage.total,
      model: result.model,
    };
  }
}
