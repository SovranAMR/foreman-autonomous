/**
 * FOREMAN — Engine
 *
 * Main engine — thought generation, validation, retry.
 * Coordinates all subsystems.
 *
 * IMPORTANT: Engine doesn't tell the prompt to "please format", it parses.
 * If parse fails, it retries. If retry also fails, BLOCK.
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
import { parseForPhase, buildRetryPrompt } from "./parser.js";
import { MemoryManager } from "./memory-manager.js";
import { SessionManager } from "./session-manager.js";
import { CacheManager } from "./cache-manager.js";
import { runWithFallback } from "./model-fallback.js";
import { guardContextWindow } from "./context-guard.js";
import { BlockedError, NoProviderError, formatErrorMessage } from "./errors.js";
import { ExecutionEngine } from "./execution-engine.js";

// ─── ENGINE SUBSYSTEMS ───────────────────────────────────────
import { ProcessRegistry } from "./process-registry.js";
import { CommandQueue } from "./command-queue.js";
import { repairTranscript } from "./transcript-repair.js";
import { TaskScheduler } from "./task-scheduler.js";
import { scanProject } from "./security-scanner.js";
import { syncMemoryMd } from "./memory-md-bridge.js";
import { LinkIntelligence } from "./link-intelligence.js";
import { EditEngine } from "./edit-engine.js";
import { ApprovalEngine } from "./approval-engine.js";
import { checkChainHealth } from "./chain-repair.js";
import { buildIntelligentContext } from "./context-intelligence.js";
import { parseBuildOutput, parseTestOutput } from "./verification-engine.js";
import { GitEngine } from "./git-engine.js";

// ─── ENGINE CONFIG ───────────────────────────────────────────

export interface EngineConfig {
  projectRoot: string;
  projectName: string;
  rateLimitOverride?: Partial<RateLimitConfig & { backoffBaseMs: number }>;
  /** Max retry for format correction (default: 2) */
  maxFormatRetries?: number;
  /** Brave Search API key for web research */
  braveApiKey?: string;
}

// ─── STEP RESULT ─────────────────────────────────────────────

/**
 * step() no longer returns just a Thought.
 * It also returns the parsed structural data.
 */
export interface StepResult {
  thought: Thought;
  /** Parsed structural data (type varies by phase) */
  parsed: any;
  /** Was parse successful (including retries) */
  formatValid: boolean;
  /** How many retries were performed */
  retryCount: number;
}

// ─── ENGINE ──────────────────────────────────────────────────

export class Engine {
  readonly state: StateManager;
  readonly thoughts: ThoughtManager;
  readonly chains: ChainManager;
  readonly rateLimiter: RateLimiter;
  readonly providers: ProviderRegistry;
  readonly memory: MemoryManager;
  readonly sessions: SessionManager;
  readonly cache: CacheManager;

  // ─── SUBSYSTEMS ─────────────────────────────────────────────
  readonly processRegistry: ProcessRegistry;
  readonly commandQueue: CommandQueue;
  readonly scheduler: TaskScheduler;
  readonly editEngine: EditEngine;
  readonly approvalEngine: ApprovalEngine;
  readonly git: GitEngine;
  readonly linkIntelligence: LinkIntelligence;

  private config: EngineConfig;
  private maxFormatRetries: number;

  /** Layer-based confidence thresholds */
  private readonly confidenceThresholds: Record<Layer, { warn: number; block: number }> = {
    visioner:    { warn: 0.6, block: 0.4 },  // vision must have high certainty
    strategist:  { warn: 0.5, block: 0.3 },  // plan can be somewhat uncertain
    researcher:  { warn: 0.4, block: 0.2 },  // research may have low relevance
    worker:      { warn: 0.6, block: 0.35 }, // execution must be certain
  };

  constructor(config: EngineConfig) {
    this.config = config;
    this.maxFormatRetries = config.maxFormatRetries ?? 2;

    const loaded = StateManager.load(config.projectRoot);
    this.state = loaded ?? StateManager.create(config.projectRoot, config.projectName);

    this.thoughts = new ThoughtManager(config.projectRoot);
    this.chains = new ChainManager(config.projectRoot);
    this.rateLimiter = new RateLimiter(config.rateLimitOverride);
    this.providers = new ProviderRegistry();

    // Memory, session, cache
    this.memory = new MemoryManager(config.projectRoot);
    this.sessions = new SessionManager(config.projectRoot);
    this.cache = new CacheManager(config.projectRoot);

    // ─── SUBSYSTEM INITIALIZATION ───────────────────────────
    this.processRegistry = new ProcessRegistry();
    this.commandQueue = new CommandQueue();
    this.scheduler = new TaskScheduler();
    this.editEngine = new EditEngine();
    this.approvalEngine = new ApprovalEngine(config.projectRoot);
    this.git = new GitEngine(new ExecutionEngine(config.projectRoot));
    this.linkIntelligence = new LinkIntelligence();

    // ─── CROSS-SYSTEM WIRING ────────────────────────────────
    // Connect ProcessRegistry to the GitEngine's ExecutionEngine
    // so async processes get lifecycle tracking
    this.git.executor.connectRegistry(this.processRegistry);

    // Connect ApprovalEngine to GitEngine's ExecutionEngine
    // so all shell commands get risk assessment
    this.git.executor.connectApproval(this.approvalEngine);

    // Connect CommandQueue to GitEngine's ExecutionEngine
    // so async commands get serialized through priority lanes
    this.git.executor.connectQueue(this.commandQueue);

    // Attach signal bridge — forward SIGTERM/SIGINT to child processes
    this.processRegistry.attachSignalBridge();

    // Register periodic tasks in the scheduler
    this.scheduler.addInterval("chain-health", 300_000, () => {
      // Every 5 min: check active chains for health issues
      const chains = this.chains.list();
      for (const chain of chains) {
        const repair = this.repairChain(chain.id);
        if (!repair.healthy) {
          console.error(`[scheduler] Chain ${chain.id} unhealthy: ${repair.details.slice(0, 100)}`);
        }
      }
    });

    this.scheduler.addInterval("memory-consolidate", 600_000, () => {
      // Every 10 min: consolidate memory
      this.memory.consolidate();
    });

    // ─── CROSS-SYSTEM WIRING ────────────────────────────────
    // Cache → Session: cache hit'te session'a token tasarrufunu bildir
    this.cache.onEvent((event) => {
      if (event.type === "hit") {
        const session = this.sessions.getActive();
        if (session) {
          // Token tasarrufunu session'a negatif token olarak eklemek yerine
          // just leave cache hit count as a note
        }
      }
    });
  }

  /**
   * Confidence evaluation for a layer.
   * Each layer has different thresholds — visioner must be highly certain, researcher is more tolerant.
   */
  evaluateConfidence(layer: Layer, confidence: number): "ok" | "warn" | "block" {
    const thresh = this.confidenceThresholds[layer];
    if (confidence < thresh.block) return "block";
    if (confidence < thresh.warn) return "warn";
    return "ok";
  }

  /**
   * Make a single LLM call — with model fallback + context guard.
   * In mock mode, bypasses the fallback chain.
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

    // Context window guard — does the prompt fit?
    const guard = guardContextWindow({
      model,
      systemPrompt,
      userPrompt,
      contextText: "", // context is already included in userPrompt
    });

    if (!guard.isSafe) {
      throw new BlockedError("pre-call", layer, guard.warning ?? "Context window exceeded");
    }

    // If mock provider exists → call directly, don't enter fallback chain
    const mockProvider = this.providers.getProviderForModel("mock-model");
    if (mockProvider) {
      const result = await mockProvider.generate(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { model: "mock-model", maxTokens: 4000, temperature: 0.7 },
      );
      this.rateLimiter.onSuccess();
      this.rateLimiter.recordTokens(result.tokenUsage.total);
      this.state.addTokens(result.tokenUsage.total);
      return result;
    }

    // Call with model fallback
    const fallbackResult = await runWithFallback({
      registry: this.providers,
      layer,
      run: async (provider, selectedModel) => {
        const result = await provider.generate(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          { model: selectedModel, maxTokens: 4000, temperature: 0.7 },
        );
        return result;
      },
      onRetry: (info) => {
        // Rate limiter'a bildir
        if (info.attempt > 1) {
          this.rateLimiter.onSuccess(); // reset previous attempt's cooldown
        }
      },
      onFallback: (from, to, errorClass) => {
        // Fallback info — for logging
      },
    });

    const result = fallbackResult.result;
    this.rateLimiter.onSuccess();
    this.rateLimiter.recordTokens(result.tokenUsage.total);
    this.state.addTokens(result.tokenUsage.total);

    return result;
  }

  /**
   * Phase-aware step: call LLM → parse → retry on failure → validate → persist.
   *
   * This method is the pipeline's real discipline point:
   * 1. LLM call is made
   * 2. Output is parsed according to phase (vision/decompose/research/atomize/execute)
   * 3. If parse fails → retry prompt is sent to LLM (max 2 retries)
   * 4. In worker thoughts, the 8-step protocol is parsed and written to the Thought
   * 5. Validator runs — if it fails, thought becomes "blocked"
   */
  async stepWithPhase(
    chainId: string,
    input: string,
    layer: Layer,
    phase: ParsePhase,
    contextRefs: string[] = [],
  ): Promise<StepResult> {
    // 1. Create thought
    const thought = this.thoughts.create({
      chainId,
      layer,
      input,
      contextRefs,
    });

    this.chains.addThought(chainId, thought.id);
    this.rateLimiter.resetThoughtBudget();

    // State transition
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

    // 2. Compile context — intelligent context with layer-aware budgets
    const referencedThoughts = contextRefs
      .filter(ref => ref.startsWith("t_"))
      .map(ref => this.thoughts.get(ref))
      .filter((t): t is Thought => t !== null);
    const chain = this.chains.get(chainId);

    const allChainThoughts = chain
      ? chain.thoughts.map(id => this.thoughts.get(id)).filter((t): t is Thought => t !== null)
      : referencedThoughts;

    // Memory context — hot + warm (tag match)
    const thoughtTags = referencedThoughts.flatMap(t => t.input.split(/\s+/).filter(w => w.length > 3));
    const memoryContext = this.memory.buildContextBlock(thoughtTags);

    // Session context — summaries of previous sessions
    const sessionContext = this.sessions.buildSessionContext(2);

    // Use intelligent context engine — layer-aware budgets, relevance scoring,
    // progressive summarization, decision anchoring
    const intelligentCtx = buildIntelligentContext({
      thoughts: allChainThoughts,
      currentInput: input,
      currentLayer: layer,
      contextWindowTokens: 128_000,
      chainSummary: chain?.contextSummary,
    });

    // Combine memory + session + intelligent context
    const contextText = `${memoryContext}\n${sessionContext}\n${intelligentCtx.text}`;

    const systemPrompt = getSystemPrompt(layer, phase);
    const userPrompt = buildUserPrompt(input, contextText);

    // 3. Cache check — has the same prompt+model been asked before?
    const cacheKey = this.cache.makeKey(systemPrompt, userPrompt, DEFAULT_LAYER_CONFIGS[layer].defaultModel);
    const cached = this.cache.get(cacheKey);

    let rawText: string;
    let totalTokens: number;
    let resultModel: string;

    if (cached) {
      // Cache hit — no LLM call
      rawText = cached.response;
      totalTokens = 0; // no tokens spent
      resultModel = cached.model;
    } else {
      // Cache miss — LLM call
      let result = await this.callLLM(systemPrompt, userPrompt, layer);
      rawText = result.text;
      totalTokens = result.tokenUsage.total;
      resultModel = result.model;

      // Cache'e kaydet
      this.cache.set(cacheKey, {
        model: result.model,
        layer,
        response: result.text,
        tokenUsage: result.tokenUsage,
      });
    }

    let retryCount = 0;
    let parseResult = parseForPhase(phase, rawText);

    // 4. If parse fails → retry
    while (!parseResult.ok && retryCount < this.maxFormatRetries) {
      retryCount++;
      const retryPrompt = buildRetryPrompt(
        (parseResult as { ok: false; error: ParseError }).error,
        phase,
      );
      const retryResult = await this.callLLM(systemPrompt, retryPrompt, layer);
      rawText = retryResult.text;
      totalTokens += retryResult.tokenUsage.total;
      resultModel = retryResult.model;
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

      // Extract data according to phase
      if (phase === "execute") {
        // Worker — 8-step protocol
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

    // 5. Update thought
    const updateData: Partial<Thought> = {
      reasoning,
      output,
      confidence,
      tokenCost: totalTokens,
      model: resultModel,
      completedAt: new Date().toISOString(),
    };

    if (workerProtocol) {
      updateData.workerProtocol = workerProtocol;
    }

    // 6. Validation — if parse failed or validator rejects → blocked
    if (!formatValid) {
      updateData.status = "blocked";
      updateData.blockedReason = `Format parse failed after ${retryCount} retries. Missing: ${
        (parseResult as any).error?.missing?.join(", ") ?? "unknown"
      }`;
    } else {
      updateData.status = "done";
    }

    const updated = this.thoughts.update(thought.id, updateData);

    // Worker validation (are all 8 steps complete?)
    if (updated.status === "done" && updated.layer === "worker") {
      const validation = validateThoughtCompletion(updated);
      if (!validation.valid) {
        this.thoughts.update(thought.id, {
          status: "blocked",
          blockedReason: `Validation failed: ${validation.errors.join("; ")}`,
        });
      }
    }

    // Layer-based confidence evaluation
    const finalThought = this.thoughts.get(thought.id)!;
    if (finalThought.status === "done") {
      const confLevel = this.evaluateConfidence(layer, finalThought.confidence);
      if (confLevel === "block") {
        this.thoughts.update(thought.id, {
          status: "blocked",
          blockedReason: `Confidence too low for ${layer}: ${(finalThought.confidence * 100).toFixed(0)}% (threshold: ${(this.confidenceThresholds[layer].block * 100).toFixed(0)}%)`,
        });
      }
    }

    // Memory extraction — learn from high-confidence thoughts
    const completed = this.thoughts.get(thought.id)!;
    if (completed.status === "done" && completed.confidence >= 0.7) {
      const extracted = this.memory.extractFromThought({
        id: completed.id,
        layer: completed.layer,
        reasoning: completed.reasoning,
        output: completed.output,
        confidence: completed.confidence,
      });
      // Memory → Session connection
      if (extracted) {
        const activeSession = this.sessions.getActive();
        if (activeSession) {
          this.sessions.addMemory(activeSession.id, extracted.id);
        }
      }
    }

    // Session tracking — thought + token
    const currentSession = this.sessions.getActive();
    if (currentSession) {
      this.sessions.addThought(currentSession.id, thought.id);
      if (totalTokens > 0) {
        this.sessions.addTokens(currentSession.id, totalTokens);
      }
    }

    // State: verifying
    if (this.state.canTransition("verifying")) {
      this.state.transition("verifying", `Thought ${thought.id} completed`, { thoughtId: thought.id });
    }

    const returnThought = this.thoughts.get(thought.id)!;

    return {
      thought: returnThought,
      parsed: parsedData,
      formatValid,
      retryCount,
    };
  }

  /**
   * Legacy step() — for backward compatibility.
   * New code should use stepWithPhase().
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
   * Legacy think() — backward compatibility.
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

  // ─── SUBSYSTEM METHODS ──────────────────────────────────────

  /**
   * Repair a thought chain — fix orphaned refs, stale thoughts, duplicates.
   * Uses both ChainRepair (health check) and TranscriptRepair (orphan detection).
   */
  repairChain(chainId: string): { healthy: boolean; repaired: number; details: string } {
    const chain = this.chains.get(chainId);
    if (!chain) return { healthy: false, repaired: 0, details: "Chain not found" };

    const thoughts = chain.thoughts
      .map(id => this.thoughts.get(id))
      .filter((t): t is Thought => t !== null);

    // Chain health check (stale, confidence, duplicates, circular)
    const health = checkChainHealth(thoughts);

    // Transcript repair (orphaned tool calls/results, contextRef integrity, layer gaps)
    const repairReport = repairTranscript(thoughts);

    const totalIssues = health.issueCount + repairReport.report.totalRepairs;

    return {
      healthy: health.healthy && repairReport.report.totalRepairs === 0,
      repaired: totalIssues,
      details: [
        ...health.issues.map(i => `[chain] ${i.type}: ${i.description}`),
        repairReport.report.totalRepairs > 0
          ? `[transcript] ${repairReport.report.droppedOrphanResults} orphan results, ${repairReport.report.droppedOrphanCalls} orphan calls, ${repairReport.report.repairedContextRefs} broken refs, ${repairReport.report.insertedGapMarkers} gap markers`
          : "",
      ].filter(Boolean).join("\n") || "All clear",
    };
  }

  /**
   * Run a security scan on the project.
   */
  runSecurityScan() {
    return scanProject(this.config.projectRoot);
  }

  /**
   * Sync memory JSON → MEMORY.md (human-readable).
   */
  syncMemory(): void {
    syncMemoryMd(this.memory, this.config.projectRoot);
  }

  /**
   * Graceful shutdown — stop scheduler, drain command queue, kill processes.
   */
  async shutdown(): Promise<void> {
    this.scheduler.shutdown();
    await this.commandQueue.drainAll();
    this.processRegistry.killAll("SIGTERM");

    // Final memory sync
    this.syncMemory();

    // Consolidate memory
    this.memory.consolidate();

    // End active session
    const activeSession = this.sessions.getActive();
    if (activeSession) {
      this.sessions.end(
        activeSession.id,
        "completed",
        `Session ended via shutdown — ${this.state.snapshot().totalTokens} tokens used`,
      );
    }
  }
}
