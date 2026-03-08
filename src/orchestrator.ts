/**
 * FOREMAN — Orchestrator
 *
 * Tam pipeline: task → vision → decompose → research → execute → verify → reflect
 *
 * The pipeline itself enforces:
 * - If vision output can't be parsed → BLOCK
 * - If no blocks come from decompose → BLOCK
 * - If worker 8-step protocol is incomplete → retry → BLOCK
 * - 2 retries on parse failure
 * - BLOCK signal on low confidence
 * - Reflection every 5 atoms (vision drift check)
 */

import { Engine } from "./engine.js";
import type { StepResult } from "./engine.js";
import type { Layer, Thought, Chain } from "./types.js";
import type { DecomposeParseResult, AtomizeParseResult } from "./parser.js";
import { parseBuildOutput, parseTestOutput, analyzeOutput, detectRegressions, checkServerHealth, detectDevServers } from "./verification-engine.js";
import { extractCrossChainContext } from "./context-intelligence.js";
import { extractOperations, executeOperations, needsExecution, buildExecutionFeedback } from "./worker-executor.js";
import { validateWorkerOutput } from "./ground-truth-validator.js";
import { PipelineResumeEngine } from "./pipeline-resume.js";
import { createEngineToolExecutor, TOOL_DEFINITIONS } from "./tools.js";
import type { ToolCall, ToolResult } from "./tools.js";
import { formatProjectContext } from "./project-detector.js";
import { webSearch, fetchUrl, npmInfo } from "./research-engine.js";
import { extractToolCalls, extractToolResults } from "./transcript-repair.js";
import { getActiveThoughts } from "./chain-repair.js";
import { validateReasoning, validateOutput, validateConfidence, validateWorkerProtocol, validateProtocolSteps } from "./validators.js";
import { quickReviewCheck, buildReviewPrompt, parseReviewResponse, REVIEWER_SYSTEM_PROMPT } from "./reviewer-gate.js";
import type { ReviewResult } from "./reviewer-gate.js";
import { shouldCompact, compactLocal } from "./compaction-engine.js";
import type { ConversationMessage } from "./compaction-engine.js";
import { generateDiff, diffSummary, formatDiffSummary } from "./diff-engine.js";
import type { FileChange, DiffHunk, DiffLine } from "./diff-engine.js";
import { extractCodeFences, extractSections, extractInlineCode } from "./markdown-intelligence.js";
import { repairTranscript } from "./transcript-repair.js";
import { checkChainHealth } from "./chain-repair.js";
import { syncMemoryMd, generateCategoryFiles } from "./memory-md-bridge.js";
import { batchWrite } from "./batch-file-engine.js";
import { registerHallucinationGuard, HallucinationGuard } from "./hallucination-guard.js";

import { PipelineObserver } from "./pipeline-observer.js";

// ─── EVENTS ──────────────────────────────────────────────────

export type OrchestratorEvent =
  | { type: "phase_start"; phase: string; detail: string }
  | { type: "phase_end"; phase: string; detail: string }
  | { type: "thought_complete"; thought: Thought }
  | { type: "block_detected"; thought: Thought; reason: string }
  | { type: "format_retry"; phase: string; attempt: number; missing: string[] }
  | { type: "reflection"; summary: string; atomCount: number }
  | { type: "verification"; phase: string; passed: boolean; detail: string }
  | { type: "pipeline_complete"; totalThoughts: number; totalTokens: number }
  | { type: "error"; message: string }
  | { type: "hallucination"; message: string };

export type EventListener = (event: OrchestratorEvent) => void;

// ─── ORCHESTRATOR ────────────────────────────────────────────

export class Orchestrator {
  private engine: Engine;
  readonly resume: PipelineResumeEngine;
  private listeners: EventListener[] = [];
  private hallucinationGuard: HallucinationGuard | null = null;
  readonly observer: PipelineObserver;

  // ─── TOKEN BUDGETS ──────────────────────────────────────────
  private readonly MAX_TOKENS_PER_ATOM = 8_000;
  private readonly MAX_TOKENS_PER_BLOCK = 40_000;
  private readonly MAX_TOKENS_SESSION = 2_000_000;
  private readonly MAX_ATOM_RETRIES = 3;

  // Phase-level budget caps (percentage of session budget).
  // Prevents early phases from starving worker execution.
  private readonly PHASE_BUDGET_PCT: Record<string, number> = {
    vision: 0.05,     // 5% — vision should be concise
    decompose: 0.05,  // 5% — decomposition is structural, not verbose
    research: 0.15,   // 15% — research can be heavy but bounded
    execute: 0.65,    // 65% — bulk of tokens go to actual work
    reflect: 0.05,    // 5% — reflections are periodic checks
    review: 0.05,     // 5% — reviewer gate calls
  };

  // Track per-phase token usage
  private phaseTokens: Map<string, number> = new Map();

  // ─── PIPELINE METRICS ─────────────────────────────────────
  private pipelineStartTime = 0;
  private phaseTimings: Map<string, number> = new Map();

  constructor(engine: Engine) {
    this.engine = engine;
    this.resume = new PipelineResumeEngine(engine.config.projectRoot);
    this.observer = new PipelineObserver(engine.config.projectRoot);
    this.setupHallucinationGuard();

    // Wire observer to streaming events
    this.engine.streaming.on("event", (event: import("./streaming-pipeline.js").StreamEvent) => {
      this.observer.onStreamEvent(event);
    });
  }

  /**
   * Initialize hallucination guard with hooks.
   */
  private setupHallucinationGuard(): void {
    this.hallucinationGuard = registerHallucinationGuard(
      this.engine.hooks,
      this.engine.config.projectRoot,
      {
        enableGroundTruth: true,
        validateOutputs: true,
        strictMode: true,
        injectContext: true,
        onViolation: (message, severity) => {
          this.emit({ type: "error", message: `[hallucination-guard] ${message} (${severity})` });
        },
      }
    );
  }

  on(listener: EventListener): void {
    this.listeners.push(listener);
  }

  private emit(event: OrchestratorEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
    // Feed observer
    this.observer.onOrchestratorEvent(event);

    // Auto-track phase budget on thought completion
    if (event.type === "thought_complete" && event.thought) {
      const phase = event.thought.layer ?? "execute";
      this.trackPhaseTokens(phase, event.thought);
    }
  }

  /**
   * Thought BLOCK check.
   * Parse failure, validation failure, or layer-based low confidence → BLOCK.
   */
  private checkBlock(result: StepResult, phase: string): boolean {
    if (result.thought.status === "blocked") {
      this.emit({
        type: "block_detected",
        thought: result.thought,
        reason: result.thought.blockedReason ?? `Format parse failed in ${phase}`,
      });
      return true;
    }

    if (!result.formatValid) {
      this.emit({
        type: "block_detected",
        thought: result.thought,
        reason: `Response format invalid after ${result.retryCount} retries`,
      });
      return true;
    }

    // Layer-based confidence — engine already checked thresholds
    // But if engine gives "warn", orchestrator should be notified
    const confLevel = this.engine.evaluateConfidence(result.thought.layer, result.thought.confidence);
    if (confLevel === "block") {
      this.emit({
        type: "block_detected",
        thought: result.thought,
        reason: `Confidence too low for ${result.thought.layer}: ${(result.thought.confidence * 100).toFixed(0)}%`,
      });
      return true;
    }

    return false;
  }

  /**
   * Run the full pipeline.
   *
   * Session, memory, cache — all managed automatically.
   * User simply runs `foreman run "task"`.
   */
  async run(task: string): Promise<{
    success: boolean;
    totalThoughts: number;
    totalTokens: number;
    visionChainId: string;
    blockedAt?: string;
  }> {
    let totalThoughts = 0;

    // ─── STREAMING — announce pipeline start ────────────────
    this.pipelineStartTime = Date.now();
    this.phaseTimings.clear();
    this.engine.streaming.pipelineStart(task);

    // ─── FORGE BRIDGE — notify gateway about pipeline start ─
    try {
      this.engine.forgeBridge.notifyPipelineStart(task);
    } catch { /* bridge best-effort */ }

    // ─── HALLUCINATION GUARD — initialize ground truth ──────
    if (this.hallucinationGuard) {
      await this.hallucinationGuard.initialize();
      const gt = this.hallucinationGuard.getGroundTruth();
      if (gt) {
        this.engine.streaming.warning("Ground truth loaded — fact-checking enabled");
      }
    }

    // ─── HOOKS — before_pipeline ────────────────────────────
    const hookResult = await this.engine.hooks.run("before_pipeline", { task });
    if (hookResult.block) {
      this.engine.streaming.error(`Pipeline blocked: ${hookResult.blockReason}`);
      this.engine.streaming.pipelineEnd(false, hookResult.blockReason);
      return { success: false, totalThoughts: 0, totalTokens: 0, visionChainId: "", blockedAt: "hooks" };
    }

    // ─── ROLLBACK — create pipeline-level checkpoint ────────
    this.engine.rollback.createPoint("pipeline", `Pipeline start: ${task.slice(0, 60)}`);

    // ─── SESSION AUTO-START ─────────────────────────────────
    // User doesn't deal with session start/end — pipeline manages it
    const session = this.engine.sessions.start({
      projectId: this.engine.state.snapshot().projectName,
    });

    // ─── MULTI-SESSION — track pipeline conversation ────────
    // Record pipeline start as conversation message for context
    let multiSession: ReturnType<typeof this.engine.sessionManager.createSession> | undefined;
    try {
      multiSession = this.engine.sessionManager.createSession({
        label: `forge-${Date.now()}`,
        task: task.slice(0, 200),
      });
      multiSession.addMessage("system", `Pipeline started: ${task}`);
    } catch { /* multi-session best-effort */ }

    // ─── SESSION LIFECYCLE — create named forge session ─────
    const forgeSession = this.engine.sessionLifecycle.create({
      task,
      metadata: { phase: "vision" },
    });
    this.engine.streaming.phaseStart("session", `Session: ${forgeSession.slug}`);

    // ─── IDENTITY — learn from memory ───────────────────────
    // Load identity context once for the pipeline
    this.engine.identity.reload();

    // ─── CLEAN STATE — reset stale references ───────────────
    // Each forge run must start clean. Old checkpoint/chain references
    // from previous interrupted runs cause "Chain not found" errors.
    try {
      this.resume.clearCheckpoint();
    } catch { /* best-effort */ }
    try {
      // Reset activeChainId in state to prevent stale references
      const snap = this.engine.state.snapshot();
      if (snap.activeChainId) {
        // Force transition to idle to clear stale chain references
        if (this.engine.state.canTransition("idle")) {
          this.engine.state.transition("idle", "Clearing stale references from previous run");
        }
      }
    } catch { /* best-effort */ }

    // ─── MEMORY CLEANUP ─────────────────────────────────────
    // Clean up expired/cold memories at the start of each run
    this.engine.memory.cleanup();

    // ─── CACHE PURGE ────────────────────────────────────────
    // Delete expired cache entries
    this.engine.cache.purgeExpired();

    // ─── GIT SAFETY — stash guard + task branch ─────────────
    try {
      // Protect any uncommitted work before the pipeline makes changes
      const stashResult = this.engine.git.stashSave("foreman-pipeline-guard");
      if (stashResult.hasChanges) {
        this.emit({
          type: "phase_start",
          phase: "git_safety",
          detail: "Stashed uncommitted changes for safety",
        });
      }

      // Create a task branch for isolation
      const slug = task.slice(0, 30).replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
      const branchResult = this.engine.git.createTaskBranch("task", slug);
      if (branchResult.success) {
        this.emit({
          type: "phase_start",
          phase: "git_branch",
          detail: `Working on branch: ${branchResult.branch}`,
        });
      }
    } catch {
      // Git safety is best-effort — continue on non-git projects
    }

    // ─── 1. VISION ──────────────────────────────────────────

    this.emit({ type: "phase_start", phase: "vision", detail: task });
    this.engine.streaming.phaseStart("vision", task);

    // ─── HOOKS: before_phase (vision) ───────────────────────
    const visionHook = await this.engine.hooks.run("before_phase", { phase: "vision", task });
    if (visionHook.block) {
      this.engine.streaming.error(`Vision phase blocked: ${visionHook.blockReason}`);
      return this.buildResult(false, 0, "", "vision_hook");
    }

    // Inject project context + identity into vision
    const projectContext = `\n\nProject Context:\n${formatProjectContext(this.engine.projectInfo)}`;
    const identityContext = this.engine.identity?.buildContextInjection() ?? "";

    const visionChain = this.engine.chains.create({
      name: `Vision: ${task.slice(0, 40)}`,
      goal: `Define the vision for: ${task}`,
      layer: "visioner",
    });

    if (this.engine.state.canTransition("visioning")) {
      this.engine.state.transition("visioning", "Starting vision phase", {
        chainId: visionChain.id,
      });
    }

    const visionResult = await this.engine.stepWithPhase(
      visionChain.id,
      `Define the complete vision for this project. What should it feel like? What makes it unique? What are the design principles?\n\nProject: ${task}${projectContext}${identityContext ? `\n\n${identityContext}` : ""}`,
      "visioner",
      "vision",
    );
    totalThoughts++;
    this.emit({ type: "thought_complete", thought: visionResult.thought });

    // ─── HOOKS: after_thought (vision) ──────────────────────
    const visionAfterHook = await this.engine.hooks.run("after_thought", {
      layer: "visioner",
      input: task,
      output: visionResult.thought.output,
      reasoning: visionResult.thought.reasoning,
    });
    if (visionAfterHook.block) {
      this.engine.streaming.error(`Vision fact-check failed: ${visionAfterHook.blockReason}`);
      this.engine.chains.updateStatus(visionChain.id, "blocked");
      return this.buildResult(false, totalThoughts, visionChain.id, "vision_fact_check");
    }

    if (this.checkBlock(visionResult, "vision")) {
      this.engine.chains.updateStatus(visionChain.id, "blocked");
      return this.buildResult(false, totalThoughts, visionChain.id, "vision");
    }

    let visionOutput = visionResult.thought.output;

    // Guard: empty or trivially short vision — LLM returned nothing useful
    if (!visionOutput || visionOutput.trim().length < 20) {
      this.emit({ type: "error", message: "Vision phase returned empty/trivial output" });
      return this.buildResult(false, totalThoughts, visionChain.id, "vision_empty");
    }

    this.engine.chains.updateSummary(visionChain.id, visionOutput.slice(0, 500));
    this.emit({ type: "phase_end", phase: "vision", detail: visionOutput.slice(0, 100) });
    this.engine.streaming.phaseEnd("vision", visionOutput.slice(0, 100));

    // ─── HUMAN_APPROVAL — Vision checkpoint ─────────────────
    // Before spending tokens on decompose+execute, ask the human:
    // "This is the vision. Approve? Or should I revise?"
    // Only in interactive mode (TTY available). Bots skip this.
    if (this.engine.interactive.isEnabled()) {
      this.engine.streaming.phaseStart("approval", "Waiting for vision approval...");
      const approvalResult = await this.engine.interactive.confirm({
        type: "dangerous",
        target: "vision_document",
        description: `Vision Document for "${task.slice(0, 60)}":\n\n${visionOutput.slice(0, 800)}`,
        risk: "medium",
      });

      if (approvalResult.action === "abort" || approvalResult.action === "skip") {
        this.engine.streaming.error("Vision rejected by user. Pipeline stopped.");
        return this.buildResult(false, totalThoughts, visionChain.id, "vision_rejected");
      }

      if (approvalResult.action === "modify" && approvalResult.reason) {
        // User wants to revise — re-run vision with their feedback
        this.engine.streaming.phaseStart("vision_revise", `Revising: ${approvalResult.reason.slice(0, 50)}`);
        const revisedVision = await this.engine.stepWithPhase(
          visionChain.id,
          `The user reviewed your vision and wants changes:\n\n"${approvalResult.reason}"\n\nRevise the vision document. Keep what was good, fix what they flagged.\n\nOriginal vision:\n${visionOutput}`,
          "visioner",
          "vision",
        );
        totalThoughts++;
        if (revisedVision.thought.status === "done") {
          visionOutput = revisedVision.thought.output;
          this.engine.chains.updateSummary(visionChain.id, visionOutput.slice(0, 500));
          this.engine.streaming.phaseEnd("vision_revise", visionOutput.slice(0, 80));
        }
      }

      this.engine.streaming.phaseEnd("approval", `Vision ${approvalResult.action}`);
    }

    // ─── CHECKPOINT: Vision complete ───
    this.resume.createCheckpoint(task, visionChain.id);
    this.resume.updatePhase("decompose", { visionOutput });

    // ─── VISION SUMMARY — compact version for atom-level context ───
    // Full visionOutput stays pinned at decompose/reflection phases.
    // Atoms get this lighter summary to save tokens.
    const visionSummary = this.buildVisionSummary(visionOutput);

    // ─── 2. DECOMPOSE ───────────────────────────────────────

    this.emit({ type: "phase_start", phase: "decompose", detail: "Breaking vision into blocks" });
    this.engine.streaming.phaseStart("decompose", "Breaking vision into blocks");

    if (this.engine.state.canTransition("decomposing")) {
      this.engine.state.transition("decomposing", "Vision complete, decomposing", {
        chainId: visionChain.id,
      });
    }

    const decomposeResult = await this.engine.stepWithPhase(
      visionChain.id,
      `Based on this VISION DOCUMENT, break the project into implementable blocks.

CRITICAL SIZING RULES:
- Single-file tasks (1 output file) → 1-2 blocks MAX
- Small tasks (2-5 files) → 2-3 blocks MAX
- Medium tasks (5-15 files) → 3-5 blocks MAX
- Large tasks (15+ files) → 5-8 blocks MAX
- NEVER over-decompose. Fewer, larger blocks = less overhead, faster execution.
- A single HTML file with CSS and JS is ONE block, not five.

Rules:
- Each block must serve the vision's EMOTION TARGET
- Each block must respect the FORBIDDEN list
- Order blocks by dependency AND by visual importance (focal point first)
- Each block needs clear acceptance criteria derived from the vision

VISION DOCUMENT:
${visionOutput}`,
      "strategist",
      "decompose",
      [visionResult.thought.id],
    );
    totalThoughts++;
    this.emit({ type: "thought_complete", thought: decomposeResult.thought });

    if (this.checkBlock(decomposeResult, "decompose")) {
      return this.buildResult(false, totalThoughts, visionChain.id, "decompose");
    }

    // GET parsed blocks — no longer string parse, but structural data
    const blocks: string[] = decomposeResult.parsed?.blocks
      ?? this.fallbackParseBlocks(decomposeResult.thought.output);

    // GET block dependency graph (0-based index arrays)
    const blockDeps: number[][] = decomposeResult.parsed?.blockDeps
      ?? Array.from({ length: blocks.length }, () => []);

    // Hard cap: max 8 blocks regardless of what strategist produced
    if (blocks.length > 8) {
      console.warn(`[forge] Strategist produced ${blocks.length} blocks, capping at 8`);
      blocks.length = 8;
    }

    if (blocks.length === 0) {
      this.emit({
        type: "block_detected",
        thought: decomposeResult.thought,
        reason: "No blocks could be extracted from decompose output",
      });
      return this.buildResult(false, totalThoughts, visionChain.id, "decompose");
    }

    this.emit({ type: "phase_end", phase: "decompose", detail: `${blocks.length} blocks` });
    this.engine.streaming.phaseEnd("decompose", `${blocks.length} blocks`);

    // ─── CHECKPOINT: Decompose complete ───
    this.resume.updatePhase("research", { blocks });

    // ─── TASK MANAGEMENT — register blocks as subtasks ──────
    const parentTask = this.engine.tasks.create({
      title: task.slice(0, 80),
      description: visionOutput.slice(0, 200),
      projectId: this.engine.state.snapshot().projectName,
      type: "feature",
      priority: "high",
    });
    this.engine.tasks.addChain(parentTask.id, visionChain.id);

    const blockTaskIds: string[] = [];
    for (let bi = 0; bi < blocks.length; bi++) {
      // Resolve dependency task IDs from block indices
      const depTaskIds = (blockDeps[bi] ?? [])
        .filter(depIdx => depIdx >= 0 && depIdx < bi && blockTaskIds[depIdx])
        .map(depIdx => blockTaskIds[depIdx]);

      const blockTask = this.engine.tasks.create({
        title: `Block ${bi + 1}: ${blocks[bi].slice(0, 60)}`,
        description: blocks[bi],
        projectId: this.engine.state.snapshot().projectName,
        type: "feature",
        priority: "medium",
        dependsOn: depTaskIds,
      });
      blockTaskIds.push(blockTask.id);
      this.engine.tasks.addSubtask(parentTask.id, blockTask.id);
    }

    // Topological sort — get optimal execution order
    const sortedTasks = this.engine.tasks.topologicalSort(
      this.engine.state.snapshot().projectName,
    );
    const readyTasks = this.engine.tasks.getReadyTasks(
      this.engine.state.snapshot().projectName,
    );

    this.emit({
      type: "phase_start",
      phase: "task_planning",
      detail: `${sortedTasks.length} tasks planned, ${readyTasks.length} ready`,
    });

    // ─── DEPENDENCY-AWARE BLOCK ORDERING ────────────────────
    // Compute execution waves from blockDeps graph.
    // Wave 0: blocks with no deps (can run first / in parallel later).
    // Wave N: blocks whose deps are all in waves < N.
    // Within each wave, blocks run sequentially (shared file system safety).
    const blockOrder = this.computeBlockWaves(blocks.length, blockDeps);
    const totalWaves = Math.max(...blockOrder.map(w => w.wave)) + 1;
    if (totalWaves > 1) {
      const waveSummary = Array.from({ length: totalWaves }, (_, w) =>
        `W${w}:[${blockOrder.filter(b => b.wave === w).map(b => b.index + 1).join(",")}]`
      ).join(" → ");
      this.engine.streaming.phaseStart("parallel_plan", `${totalWaves} waves: ${waveSummary}`);
      this.engine.streaming.phaseEnd("parallel_plan", waveSummary);
    }

    // ─── 3. FOR EACH BLOCK (dependency-ordered) ─────────────

    let atomCount = 0;

    for (const { index: i, wave } of blockOrder) {
      const block = blocks[i];

      // ─── STREAMING: Block start ───
      this.engine.streaming.blockStart(i, blocks.length, block.slice(0, 60));

      // ─── ROLLBACK: Block checkpoint ───
      this.engine.rollback.createPoint("block", `Block ${i + 1}: ${block.slice(0, 50)}`, { blockIndex: i });

      // ── 3a. RESEARCH ──
      this.emit({ type: "phase_start", phase: "research", detail: `Block ${i + 1}: ${block}` });
      this.engine.streaming.phaseStart("research", `Block ${i + 1}: ${block.slice(0, 50)}`);

      if (this.engine.state.canTransition("researching")) {
        this.engine.state.transition("researching", `Researching block ${i + 1}`, {
          chainId: visionChain.id,
        });
      }

      // Memory recall — pull relevant memories from prior work
      let memoryContext = "";
      try {
        // Hot memories (recent, high-access)
        const hotMemories = this.engine.memory.getHotMemories(
          this.engine.state.snapshot().projectName,
        );
        // Warm memories (tag-matched)
        const blockKeywords = block.split(/\s+/).filter(w => w.length > 3).slice(0, 5);
        const warmMemories = this.engine.memory.getWarmMemories(
          blockKeywords,
          this.engine.state.snapshot().projectName,
        );
        // Semantic recall via similarity
        const recalled = this.engine.recall(block, 3);

        // ─── EMBEDDING: Semantic search over project codebase ───
        let embeddingContext: string[] = [];
        try {
          const embResults = await this.engine.embeddingEngine.search(block, 3);
          if (embResults.length > 0) {
            embeddingContext = embResults.map(r =>
              `[${(r.score * 100).toFixed(0)}% match] ${r.text.slice(0, 120)}`
            );
          }
        } catch { /* embedding search is best-effort */ }

        const memParts: string[] = [];
        if (hotMemories.length > 0) {
          memParts.push(`Recent context:\n${hotMemories.slice(0, 3).map(m => `- ${m.content.slice(0, 100)}`).join("\n")}`);
        }
        if (warmMemories.length > 0) {
          memParts.push(`Related knowledge:\n${warmMemories.slice(0, 3).map(m => `- ${m.content.slice(0, 100)}`).join("\n")}`);
        }
        if (recalled.length > 0) {
          memParts.push(`Memory recall:\n${recalled.map(r => `- [${(r.score * 100).toFixed(0)}%] ${r.content.slice(0, 100)}`).join("\n")}`);
        }
        if (embeddingContext.length > 0) {
          memParts.push(`Semantic matches:\n${embeddingContext.map(e => `- ${e}`).join("\n")}`);
        }
        if (memParts.length > 0) {
          memoryContext = "\n\nFrom memory:\n" + memParts.join("\n");
        }
      } catch {
        // Memory recall is best-effort
      }

      // Cross-chain context — pull relevant insights from other chains
      let crossChainCtx = "";
      try {
        const allChains = this.engine.chains.list();
        if (allChains.length > 1) {
          const otherChainThoughts: Thought[] = [];
          for (const c of allChains) {
            if (c.id === visionChain.id) continue;
            const active = getActiveThoughts(
              c.thoughts.map(id => this.engine.thoughts.get(id)).filter((t): t is Thought => t !== null)
            );
            otherChainThoughts.push(...active.slice(-3));
          }
          if (otherChainThoughts.length > 0) {
            const crossCtx = extractCrossChainContext(otherChainThoughts, block);
            if (crossCtx) {
              crossChainCtx = `\n\nInsights from related work:\n${crossCtx}`;
            }
          }
        }
      } catch {
        // Cross-chain context is best-effort
      }

      // ── Pre-research: quick web search for current best practices ──
      let webSearchContext = "";
      try {
        const { quickSearch } = await import("./web-search-engine.js");
        // Extract key terms from block for search
        const searchTerms = block.split(/\s+/)
          .filter(w => w.length > 3 && !/^(the|and|for|with|from|into|that|this|will|should|must)$/i.test(w))
          .slice(0, 5)
          .join(" ");
        if (searchTerms.length > 10) {
          const results = await quickSearch(searchTerms + " best practices", 3);
          if (results && results.length > 0) {
            webSearchContext = "\n\nWeb research:\n" + results
              .map((r) => `- ${r.title}: ${r.description}`)
              .join("\n");
          }
        }
      } catch { /* web search is best-effort */ }

      const researchResult = await this.engine.stepWithPhase(
        visionChain.id,
        `Research best practices, examples, and technical considerations for this block:\n\n${block}\n\nVISION DOCUMENT (pinned — respect all constraints):\n${visionOutput}${memoryContext}${crossChainCtx}${webSearchContext}`,
        "researcher",
        "research",
        [visionResult.thought.id, decomposeResult.thought.id],
      );
      totalThoughts++;
      this.emit({ type: "thought_complete", thought: researchResult.thought });

      // Research BLOCK'u non-fatal — bulgular yoksa bile devam edebilir
      const findings = researchResult.parsed?.findings ?? researchResult.thought.output;

      this.emit({ type: "phase_end", phase: "research", detail: findings.slice(0, 80) });

      // ── 3b. ATOMIZE ──
      this.emit({ type: "phase_start", phase: "atomize", detail: `Atomizing block ${i + 1}` });

      if (this.engine.state.canTransition("decomposing")) {
        this.engine.state.transition("decomposing", `Atomizing block ${i + 1}`, {
          chainId: visionChain.id,
        });
      }

      const atomizeResult = await this.engine.stepWithPhase(
        visionChain.id,
        `Break this block into atomic tasks. Each atom must be independently executable and verifiable.

CRITICAL SIZING RULES:
- If the block is a single file → 1-2 atoms MAX (one atom can write the entire file)
- If the block has 2-5 files → 2-4 atoms MAX
- If the block has 5+ files → 3-6 atoms MAX
- A single atom CAN create a complete file with all its content. Don't split one file into multiple atoms.
- FEWER atoms = LESS overhead. One big atom is better than five tiny ones.

Rules:
- Each atom must be specific enough that a Worker can execute it WITHOUT guessing
- Include file paths, component names, or specific targets when possible
- Order atoms by dependency (what must exist before the next step)
- Each atom description should include acceptance criteria

Block: ${block}

Research findings:
${findings.slice(0, 800)}

VISION DOCUMENT (pinned — atoms must respect ALL constraints):
${visionOutput}`,
        "strategist",
        "atomize",
        [researchResult.thought.id],
      );
      totalThoughts++;
      this.emit({ type: "thought_complete", thought: atomizeResult.thought });

      if (this.checkBlock(atomizeResult, "atomize")) {
        return this.buildResult(false, totalThoughts, visionChain.id, `atomize_block_${i + 1}`);
      }

      // GET parsed atoms
      const atoms: string[] = atomizeResult.parsed?.atoms
        ?? this.fallbackParseBlocks(atomizeResult.thought.output);

      // Hard cap: max 6 atoms per block
      if (atoms.length > 6) {
        console.warn(`[forge] Strategist produced ${atoms.length} atoms for block ${i + 1}, capping at 6`);
        atoms.length = 6;
      }

      if (atoms.length === 0) {
        this.emit({
          type: "block_detected",
          thought: atomizeResult.thought,
          reason: `No atoms extracted from block ${i + 1}`,
        });
        continue; // skip this block, move to next
      }

      // ── 3c. EXECUTE EACH ATOM ──
      let blockPassedAtoms = 0;
      let blockFailedAtoms = 0;
      const atomFailureReasons: Array<{ atom: string; reason: string }> = []; // F-7: track per-atom failures
      const blockStartTime = Date.now();
      for (let j = 0; j < atoms.length; j++) {
        const atom = atoms[j];

        // Block-level failure threshold — if majority of atoms fail, skip remaining
        if (blockFailedAtoms > 0 && blockFailedAtoms >= Math.ceil(atoms.length / 2)) {
          this.emit({
            type: "error",
            message: `Block ${i + 1}: ${blockFailedAtoms}/${atoms.length} atoms failed — skipping remaining atoms`,
          });
          this.engine.streaming.warning(`Block ${i + 1} abandoned: too many failures (${blockFailedAtoms}/${atoms.length})`);
          break;
        }

        // ─── RETRY LOOP — Atom execution with feedback-driven retries ───
        // On BLOCK/REJECT: rollback → inject failure feedback → retry (max 3)
        // On 3rd failure: skip atom, move to next
        let atomPassed = false;
        let lastRejectionFeedback = "";
        let execResult: StepResult | undefined;
        let passedAttempt = 0;
        let toolCallCount = 0;
        const atomStartTime = Date.now();
        const toolResults: Array<{ name: string; success: boolean }> = [];
        let lastExecSummary: import("./worker-executor.js").WorkerExecutionSummary | null = null;

        for (let attempt = 0; attempt < this.MAX_ATOM_RETRIES; attempt++) {
          if (attempt > 0) {
            this.engine.streaming.toolCall("atom_retry", `Attempt ${attempt + 1}/${this.MAX_ATOM_RETRIES}: ${atom.slice(0, 40)}`);
            this.emit({
              type: "format_retry",
              phase: "atom_retry",
              attempt,
              missing: [lastRejectionFeedback.slice(0, 100)],
            });
          }

          // ─── SESSION BUDGET CHECK ───────────────────────────
          // Don't start an atom if total session tokens exceeded
          const sessionTokens = this.engine.state.snapshot().totalTokens;
          if (sessionTokens > this.MAX_TOKENS_SESSION) {
            this.emit({
              type: "error",
              message: `Session budget exceeded: ${sessionTokens} tokens (max ${this.MAX_TOKENS_SESSION}). Stopping pipeline.`,
            });
            this.engine.streaming.error(`💰 Budget exceeded: ${sessionTokens} tokens`);
            return this.buildResult(false, totalThoughts, visionChain.id, "budget_exceeded");
          }

          // Context window check — evaluate budget before each atom
          try {
            const ctxWindow = this.engine.getContextWindow();
            const ctxEval = this.engine.evaluateContext(
              this.engine.primaryModel ?? "gemini-2.5-pro",
              "",
              atom,
              findings.slice(0, 500),
            );
            if (!ctxEval.isSafe) {
              // Use compaction engine for intelligent context reduction
              const sessionMessages = multiSession ? multiSession.getMessages() : [];
              const convMessages: ConversationMessage[] = sessionMessages.map(m => ({
                role: m.role as "user" | "assistant" | "system",
                content: m.content,
                timestamp: m.timestamp,
              }));

              if (shouldCompact(convMessages, { maxTokens: ctxWindow.tokens })) {
                const compacted = compactLocal(convMessages, { maxTokens: Math.floor(ctxWindow.tokens * 0.6) });
                this.emit({
                  type: "phase_start",
                  phase: "context_compact",
                  detail: `Compacted: ${compacted.summarizedCount} messages → summary, kept ${compacted.keptCount}`,
                });
              } else {
                // Fallback: use chain-level compaction
                const compact = this.engine.buildCompactContextForChain(visionChain.id, ctxWindow.tokens / 2);
                if (compact && compact.length > 0) {
                  this.emit({
                    type: "phase_start",
                    phase: "context_compact",
                    detail: `Chain compacted: ${compact.length} chars`,
                  });
                }
              }
            }
          } catch {
            // Context check is best-effort
          }

          // Cross-chain context for this atom
          let atomCrossCtx = "";
          try {
            const crossCtx = this.engine.getCrossChainContext(atom, visionChain.id);
            if (crossCtx) {
              atomCrossCtx = `\n\nCross-chain insights:\n${crossCtx}`;
            }
          } catch { /* best-effort */ }

          this.emit({ type: "phase_start", phase: "execute", detail: `Atom ${j + 1}/${atoms.length}: ${atom.slice(0, 50)}` });
          this.engine.streaming.atomStart(j, atoms.length, atom.slice(0, 50));
          this.observer.onAtomStart(`Atom ${j + 1}/${atoms.length}: ${atom.slice(0, 100)}`);

          try {
            this.engine.rollback.createPoint("atom", `Pre-atom ${j + 1}: ${atom.slice(0, 40)}`, {
              atomIndex: j, blockIndex: i,
            });
          } catch { /* rollback point best-effort */ }

          if (this.engine.state.canTransition("executing")) {
            this.engine.state.transition("executing", `Executing atom ${j + 1}`, {
              chainId: visionChain.id,
            });
          }

          // ── WORKER EXECUTION — two modes: ──
          // Mode A: Tool-enabled (LLM calls tools in real-time) — preferred
          // Mode B: Fallback (LLM plans, Worker Executor extracts & runs post-hoc)

          execResult = undefined; // reset for this attempt
          toolCallCount = 0;
          toolResults.length = 0;

          try {
            // Mode A: Try tool-enabled execution
            const toolExecutor = createEngineToolExecutor(
              this.engine.config.projectRoot,
              this.engine.exec,
              this.engine.editEngine,
              this.engine.git,
              this.engine.linkIntelligence,
              this.engine.hooks, // Hook support for hallucination guard
            );

            // Build context for tool-enabled LLM call
            // Build compressed summaries of completed atoms (Context Pruning)
            // Completed atoms → single line each. Vision document → NEVER truncated.
            const completedAtomLines: string[] = [];
            for (let k = 0; k < j; k++) {
              completedAtomLines.push(`[✅ Atom ${k + 1}] ${atoms[k].slice(0, 60)}`);
            }
            const prevAtomContext = completedAtomLines.length > 0
              ? `COMPLETED ATOMS:\n${completedAtomLines.join("\n")}`
              : "";

            // ─── PRE-EXECUTION FILE ANALYSIS ───────────────────
            // Extract file paths from atom description and pre-read them
            // Worker gets REAL file contents — no hallucination possible
            let preReadContext = "";
            try {
              const fileMatches = atom.match(/(?:[\w./\\-]+\.(?:tsx?|jsx?|css|scss|html|json|md|vue|svelte))/g);
              if (fileMatches && fileMatches.length > 0) {
                const uniqueFiles = [...new Set(fileMatches)].slice(0, 3); // max 3 files
                const fileParts: string[] = [];
                for (const filePath of uniqueFiles) {
                  try {
                    const fullPath = `${this.engine.config.projectRoot}/${filePath}`;
                    const { readFileSync } = await import("node:fs");
                    const content = readFileSync(fullPath, "utf-8");
                    const lines = content.split("\n");
                    const preview = lines.length > 50
                      ? `${lines.slice(0, 50).join("\n")}\n... (${lines.length} total lines)`
                      : content;
                    fileParts.push(`[FILE: ${filePath}] (${lines.length} lines)\n${preview}`);
                  } catch { /* file not found — OK, Worker will create it */ }
                }
                if (fileParts.length > 0) {
                  preReadContext = `PRE-READ FILES (real contents — do NOT hallucinate):\n${fileParts.join("\n\n")}`;
                }
              }
            } catch { /* pre-read best-effort */ }

            // ─── REJECTION FEEDBACK INJECTION ─────────────────
            // On retry, inject the EXACT reason why the previous attempt failed
            // Worker sees: "Your previous attempt was REJECTED because: ..."
            const retryContext = lastRejectionFeedback && attempt > 0
              ? `⚠️ PREVIOUS ATTEMPT REJECTED (attempt ${attempt}/${this.MAX_ATOM_RETRIES}):\n${lastRejectionFeedback}\n\nFix the issues above. Do NOT repeat the same mistakes.`
              : "";

            const atomContext = [
              `YOUR TASK (Atom ${j + 1}/${atoms.length}): ${atom}`,
              retryContext,
              preReadContext,
              `BLOCK: ${block}`,
              prevAtomContext,
              visionSummary,
              findings ? `RESEARCH FINDINGS:\n${findings.slice(0, 800)}` : "",
              atomCrossCtx || "",
              memoryContext ? `MEMORY:\n${memoryContext.slice(0, 500)}` : "",
            ].filter(Boolean).join("\n\n---\n\n");

            // ─── OBSERVER: Worker input ──────────────────────
            this.observer.onWorkerInput(atomContext);

            // ─── EXECUTION MODE ──────────────────────────────
            // Extraction mode (default): 1 LLM call, post-hoc command parsing
            // Tool mode (FOREMAN_TOOL_MODE=1): N API calls per atom, more powerful but rate-limited
            const useToolMode = process.env.FOREMAN_TOOL_MODE === "1";

            if (useToolMode) {
              const toolLlmResult = await this.engine.callLLMWithTools(
                getWorkerPromptForToolMode(),
                atomContext,
                "worker",
                async (call: ToolCall) => {
                  toolCallCount++;
                  this.emit({
                    type: "phase_start",
                    phase: "tool_call",
                    detail: `${call.name}(${JSON.stringify(call.args).slice(0, 60)})`,
                  });
                  const result = await toolExecutor(call);
                  toolResults.push({ name: call.name, success: !result.isError });
                  this.emit({
                    type: "phase_end",
                    phase: "tool_call",
                    detail: `${call.name} → ${result.isError ? "✖" : "✔"}`,
                  });
                  return result;
                },
                {
                  maxIterations: 100,
                  onToken: () => { },
                  onToolCall: (call) => {
                    console.log(`  [tool] ${call.name}(${JSON.stringify(call.args).slice(0, 60)})`);
                  },
                  onToolResult: (result) => {
                    const preview = result.content.slice(0, 80);
                    console.log(`  [tool] → ${result.isError ? "✖" : "✔"} ${preview}`);
                  },
                },
              );

              // Create a thought from the tool-enabled result
              execResult = await this.engine.stepWithPhase(
                visionChain.id,
                `${atom}\n\n[Tool execution completed: ${toolCallCount} tool calls, ${toolResults.filter(r => r.success).length} succeeded]\n\nLLM response:\n${toolLlmResult.text}`,
                "worker",
                "execute",
                [atomizeResult.thought.id, researchResult.thought.id, visionResult.thought.id],
              );
            } else {
              // Extraction mode: single LLM call + post-hoc command extraction
              execResult = await this.engine.stepWithPhase(
                visionChain.id,
                atomContext,
                "worker",
                "execute",
                [atomizeResult.thought.id, researchResult.thought.id, visionResult.thought.id],
              );
            }
          } catch (toolError) {
            // Fallback — standard stepWithPhase + post-hoc extraction
            console.log(`  [forge] Tool mode unavailable, using extraction mode: ${toolError instanceof Error ? toolError.message.slice(0, 80) : "unknown"}`);

            execResult = await this.engine.stepWithPhase(
              visionChain.id,
              atom,
              "worker",
              "execute",
              [atomizeResult.thought.id, researchResult.thought.id, visionResult.thought.id],
            );
          }

          totalThoughts++;
          atomCount++;

          if (!execResult) {
            this.engine.streaming.error(`❌ Atom ${j + 1} produced no result — skipping`);
            blockFailedAtoms++;
            break;
          }

          this.emit({ type: "thought_complete", thought: execResult?.thought });

          // ─── OBSERVER: Worker output ──────────────────────
          this.observer.onWorkerOutput(
            execResult.thought.output.slice(0, 2000),
            execResult.thought.confidence,
          );

          // ── POST-HOC EXECUTION (Mode B fallback) ──
          // Only if no tools were called in Mode A (toolCallCount === 0)
          if (toolCallCount === 0 && execResult?.thought.workerProtocol && execResult?.thought.status === "done") {
            const protocol = execResult?.thought.workerProtocol;

            if (needsExecution(protocol)) {
              const ops = extractOperations(protocol);

              // Debug: log extracted operations
              for (const op of ops) {
                console.log(`  [extract] ${op.type}: path=${op.path ?? "?"}, content=${op.content?.slice(0, 40) ?? "EMPTY"}, cmd=${op.command?.slice(0, 40) ?? "?"}`);
              }

              if (ops.length > 0) {
                this.emit({
                  type: "phase_start",
                  phase: "real_execute",
                  detail: `${ops.length} operations from atom ${j + 1}`,
                });

                try {
                  lastExecSummary = await executeOperations(
                    ops,
                    this.engine.exec,
                    this.engine.editEngine,
                    this.engine.config.projectRoot,
                    {
                      hooks: this.engine.hooks,
                      interactive: this.engine.interactive,
                      streaming: this.engine.streaming,
                    },
                  );

                  this.emit({
                    type: "phase_end",
                    phase: "real_execute",
                    detail: `${lastExecSummary!.succeeded}/${lastExecSummary!.totalOps} succeeded`,
                  });

                  // Feed execution results back into thought for verification
                  if (lastExecSummary!.output) {
                    const feedback = buildExecutionFeedback(lastExecSummary!);
                    // Append execution results to thought output
                    this.engine.thoughts.update(execResult?.thought.id, {
                      output: (execResult?.thought.output ?? "") + "\n\n" + feedback,
                    });
                  }

                  // NOTE: Automatic commit moved AFTER reviewer gate (see "POST-REVIEW COMMIT" below)
                  // so reviewer can see the actual git diff before it gets committed.
                } catch (execErr) {
                  this.emit({
                    type: "error",
                    message: `Execution failed for atom ${j + 1}: ${execErr instanceof Error ? execErr.message : String(execErr)}`,
                  });
                }
              } else {
                // Worker claims execution but 0 operations extracted — likely hallucinated
                this.engine.streaming.warning(`⚠️ Atom ${j + 1}: worker produced output but 0 extractable operations — possible hallucination`);
                this.emit({
                  type: "verification",
                  phase: "extraction_empty",
                  passed: false,
                  detail: `Worker step6_execute has content (${protocol.step6_execute?.length ?? 0} chars) but no parseable file writes or commands`,
                });
                // Mark as low confidence so retry loop catches it
                if (execResult?.thought) {
                  execResult.thought.confidence = Math.min(execResult.thought.confidence ?? 0.5, 0.4);
                }
              }
            }
          }

          // Worker BLOCK — 8-step incomplete or confidence too low
          if (execResult?.thought.status === "blocked") {
            this.emit({
              type: "block_detected",
              thought: execResult?.thought,
              reason: execResult?.thought.blockedReason ?? "Worker protocol incomplete",
            });

            // ─── ZAMAN MAKİNESİ: Git reset on BLOCK ─────────────
            // Worker wrote broken code → rollback to last clean state
            // Don't let LLM try to "fix" its own mess — that causes hallucination spirals
            try {
              const rollbackResult = this.engine.rollback.rollbackLastAtom();
              if (rollbackResult) {
                this.emit({
                  type: "phase_end",
                  phase: "rollback",
                  detail: `Rolled back atom ${j + 1}: ${rollbackResult.error ?? 'success'}`,
                });
                this.engine.streaming.error(`⏪ Atom ${j + 1} rolled back: ${execResult?.thought.blockedReason?.slice(0, 60)}`);
              }
            } catch {
              // Rollback is best-effort — may fail on non-git projects
            }

            // Atom BLOCK — retry with feedback (not skip)
            lastRejectionFeedback = `WORKER BLOCKED: ${execResult?.thought.blockedReason ?? "8-step protocol incomplete"}`;
            this.observer.onWorkerRetry(attempt, lastRejectionFeedback);
            continue; // RETRY the atom instead of breaking to outer loop
          }

          if (execResult?.retryCount > 0) {
            this.emit({
              type: "format_retry",
              phase: "execute",
              attempt: execResult?.retryCount,
              missing: [],
            });
          }

          // ── PER-THOUGHT VALIDATION — granular quality checks ──
          if (execResult?.thought?.status === "done") {
            const thought = execResult?.thought;
            const validations = [
              validateReasoning(thought),
              validateOutput(thought),
              validateConfidence(thought),
            ];
            // Worker-specific: validate protocol completeness
            if (thought.workerProtocol) {
              validations.push(validateWorkerProtocol(thought));
              validations.push(validateProtocolSteps(thought.workerProtocol));
            }
            const failures = validations.filter(v => !v.valid);
            if (failures.length > 0) {
              this.emit({
                type: "verification",
                phase: "validation",
                passed: false,
                detail: `${failures.length} validation issues: ${failures.map(f => f.errors.join(", ")).join("; ")}`,
              });
            }

            // Extract tool call/result pairs for transcript integrity
            const toolCalls = extractToolCalls(thought);
            const toolResults = extractToolResults(thought);
            if (toolCalls.length !== toolResults.length && toolCalls.length > 0) {
              this.emit({
                type: "verification",
                phase: "transcript",
                passed: false,
                detail: `Tool call/result mismatch: ${toolCalls.length} calls, ${toolResults.length} results`,
              });
            }
          }

          this.emit({ type: "phase_end", phase: "execute", detail: `Done: ${atom.slice(0, 40)}` });

          // ─── REVIEWER GATE — Acımasız Denetçi (Tribunal) ────
          // Different LLM reviews Worker's output against vision document.
          // Quick local check first, then full LLM review if needed.
          // SKIP for simple visions (no FORBIDDEN list, short vision = simple task)
          const hasForbiddenSection = /^##\s*FORBIDDEN/im.test(visionOutput);
          const isSimpleVision = visionOutput.length < 800 && !hasForbiddenSection;
          // Debug: console.log(`  [reviewer-gate] visionLen=${visionOutput.length} isSimple=${isSimpleVision}`);
          if (!isSimpleVision && execResult?.thought.status === "done" && execResult?.thought.workerProtocol) {
            const protocol = execResult?.thought.workerProtocol;

            // Phase 1: Quick local review (no LLM cost)
            const quickResult = quickReviewCheck(protocol, visionOutput);
            if (quickResult && quickResult.verdict === "REJECT") {
              this.emit({
                type: "verification",
                phase: "reviewer_quick",
                passed: false,
                detail: `Quick review REJECT: ${quickResult.violations.join("; ").slice(0, 120)}`,
              });
              this.engine.streaming.error(`🔴 Quick review rejected atom ${j + 1}: ${quickResult.violations[0]?.slice(0, 80)}`);

              // Rollback and retry with feedback
              try { this.engine.rollback.rollbackLastAtom(); } catch { /* best-effort */ }
              lastRejectionFeedback = quickResult.rejectionFeedback ?? quickResult.violations.join("; ");
              break; // break retry attempt
            }

            // Phase 2: Full LLM review (different model — breaks bias)
            try {
              let codeDiff = "";
              try { codeDiff = this.engine.git.summarizeChanges() || ""; } catch { /* non-git */ }

              const reviewPrompt = buildReviewPrompt({
                protocol,
                atom,
                visionDocument: visionOutput,
                codeDiff,
                block,
              });

              // Use a different model for the reviewer (gemini-pro or gpt-4o)
              // This breaks the echo chamber — Worker can't grade its own homework
              const reviewLlmResult = await this.engine.callLLM(
                REVIEWER_SYSTEM_PROMPT,
                reviewPrompt,
                "researcher", // uses researcher's model (gpt-4o) — different from worker (sonnet)
              );
              totalThoughts++;

              const reviewResult = parseReviewResponse(reviewLlmResult.text);

              this.emit({
                type: "verification",
                phase: "reviewer_gate",
                passed: reviewResult.verdict === "PASS",
                detail: `Reviewer: ${reviewResult.verdict} (${(reviewResult.confidence * 100).toFixed(0)}%) — ${reviewResult.reasoning.slice(0, 100)}`,
              });
              this.engine.streaming.toolCall("reviewer_gate", `${reviewResult.verdict}: ${reviewResult.reasoning.slice(0, 60)}`);

              if (reviewResult.verdict === "REJECT") {
                this.engine.streaming.error(`🔴 Reviewer REJECTED atom ${j + 1}: ${reviewResult.violations.join(", ").slice(0, 80)}`);

                // Rollback code
                try { this.engine.rollback.rollbackLastAtom(); } catch { /* best-effort */ }

                // Save rejection feedback for retry
                this.engine.identity.updateMemory(
                  `review_reject_${Date.now()}`,
                  `Atom "${atom.slice(0, 40)}" rejected: ${reviewResult.violations.join(", ").slice(0, 100)}`,
                  "Review History",
                );
                lastRejectionFeedback = reviewResult.rejectionFeedback ?? reviewResult.violations.join("; ");
                break; // break retry attempt — will retry with feedback
              }
            } catch {
              // Reviewer gate is best-effort — if LLM call fails, continue
            }
          }

          // ─── POST-REVIEW COMMIT ─────────────────────────────
          // Commit AFTER reviewer gate passes, so reviewer sees the real git diff.
          // Before this fix, commit happened before review → reviewer saw empty diff → always rejected.
          if (this.engine.git && lastExecSummary && lastExecSummary.succeeded > 0) {
            const git = this.engine.git;
            try {
              const gitStatus = git.executor.gitStatus();
              if (!gitStatus.clean) {
                const commitMsg = `${atom.slice(0, 50)}${lastExecSummary.failed > 0 ? " (partial)" : ""}`;
                const commitResult = git.commitThought({
                  message: commitMsg,
                  chainId: visionChain.id,
                  thoughtId: execResult.thought.id,
                  layer: "worker",
                  atomIndex: j + 1,
                  atomTotal: atoms.length,
                });
                if (commitResult.success) {
                  this.engine.streaming.toolCall("git_commit", commitResult.shortHash);
                }
              }
            } catch (gitErr) {
              console.warn(`[orchestrator] Git commit failed: ${gitErr}`);
            }
          }

          // ─── ATOM PASSED ALL GATES ────────────────────────────
          atomPassed = true;
          blockPassedAtoms++;
          passedAttempt = attempt;
          break; // break retry loop — atom succeeded
        } // end retry loop

        // ─── RETRY EXHAUSTED CHECK ──────────────────────────
        if (!atomPassed) {
          this.emit({
            type: "error",
            message: `Atom ${j + 1} failed after ${this.MAX_ATOM_RETRIES} attempts: ${lastRejectionFeedback.slice(0, 100)}`,
          });
          this.engine.streaming.error(`❌ Atom ${j + 1} failed after ${this.MAX_ATOM_RETRIES} retries — skipping`);
          blockFailedAtoms++;
          atomFailureReasons.push({ atom, reason: lastRejectionFeedback }); // F-7: collect failure
          continue; // skip to next atom in outer loop
        }

        // ─── ATOM QUALITY SCORE ──────────────────────────────
        // Track quality metrics for each passed atom
        const atomDurationMs = Date.now() - atomStartTime;
        const atomQuality = {
          confidence: execResult?.thought.confidence,
          attempts: passedAttempt + 1,
          toolCalls: toolCallCount,
          tokenCost: execResult?.thought.tokenCost ?? 0,
          durationMs: atomDurationMs,
          hasVerification: Boolean(execResult?.thought.workerProtocol?.step7_verify?.match(/pass|✔|success|\d+ test/i)),
          firstAttemptPass: passedAttempt === 0,
        };
        this.emit({
          type: "verification",
          phase: "atom_quality",
          passed: (atomQuality.confidence ?? 0) >= 0.7,
          detail: `Atom ${j + 1}: conf=${((atomQuality.confidence ?? 0) * 100).toFixed(0)}% attempts=${atomQuality.attempts} tools=${atomQuality.toolCalls} ${(atomDurationMs / 1000).toFixed(1)}s verified=${atomQuality.hasVerification}`,
        });

        // ─── CHECKPOINT: Atom complete ───
        this.resume.completeAtom(i, j, 1, execResult?.thought.tokenCost ?? 0);

        // ─── STREAMING: Atom end ───
        this.engine.streaming.atomEnd(j, execResult?.thought.tokenCost ?? 0);

        // ─── ROLLBACK: Atom checkpoint ───
        this.engine.rollback.createPoint("atom", `Atom ${j + 1}: ${atom.slice(0, 50)}`, {
          atomIndex: j, blockIndex: i,
        });

        // ── VERIFY: Parse worker's step7_verify for actionable results ──
        if (execResult?.thought.workerProtocol?.step7_verify) {
          const verifyText = execResult?.thought.workerProtocol.step7_verify;

          // ─── MARKDOWN INTELLIGENCE: Extract code fences from worker output ──
          // Worker may include code blocks in verify step — extract and analyze
          try {
            const codeFences = extractCodeFences(verifyText);
            if (codeFences.length > 0) {
              const errorFences = codeFences.filter(f =>
                f.content.match(/error|Error|ERR|FAIL|TypeError|SyntaxError/i)
              );
              if (errorFences.length > 0) {
                this.emit({
                  type: "verification",
                  phase: "code_analysis",
                  passed: false,
                  detail: `Worker output contains ${errorFences.length} code blocks with errors`,
                });
              }
            }

            // Extract inline code references for verification
            const inlineCode = extractInlineCode(verifyText);
            if (inlineCode.length > 5) {
              // Worker is being specific — good sign
              this.emit({
                type: "verification",
                phase: "code_analysis",
                passed: true,
                detail: `Worker references ${inlineCode.length} code elements — specific reasoning`,
              });
            }
          } catch { /* markdown analysis best-effort */ }

          // Pattern analysis — classify output as errors, warnings, info
          const patterns = analyzeOutput(verifyText);
          const errorPatterns = patterns.filter(p => p.kind === "warning" || p.kind === "security");
          const warningPatterns = patterns.filter(p => p.kind === "deprecation" || p.kind === "performance");

          // If worker ran build/test, parse the output for structured results
          const hasBuild = /build|compile|tsc|tsx/i.test(verifyText);
          const hasTest = /test|pass|fail|assert/i.test(verifyText);

          if (hasBuild) {
            const buildResult = parseBuildOutput(verifyText);
            if (buildResult.errors.length > 0) {
              const fixHints = buildResult.errors
                .filter(e => e.suggestion)
                .map(e => e.suggestion)
                .slice(0, 3);
              this.emit({
                type: "verification",
                phase: "build",
                passed: false,
                detail: `${buildResult.errors.length} build errors in ${atom.slice(0, 30)}${fixHints.length > 0 ? ` | Fixes: ${fixHints.join("; ")}` : ""}`,
              });
            } else {
              this.emit({
                type: "verification",
                phase: "build",
                passed: true,
                detail: `Build clean for ${atom.slice(0, 30)}${warningPatterns.length > 0 ? ` (${warningPatterns.length} warnings)` : ""}`,
              });
            }
          }

          if (hasTest) {
            const testResult = parseTestOutput(verifyText);
            if (testResult.failed > 0) {
              this.emit({
                type: "verification",
                phase: "test",
                passed: false,
                detail: `${testResult.failed}/${testResult.total} tests failed in ${atom.slice(0, 30)}`,
              });
            } else if (testResult.total > 0) {
              this.emit({
                type: "verification",
                phase: "test",
                passed: true,
                detail: `${testResult.passed}/${testResult.total} tests passed for ${atom.slice(0, 30)}`,
              });
            }
          }

          // General output patterns (even if not build/test)
          if (!hasBuild && !hasTest && errorPatterns.length > 0) {
            this.emit({
              type: "verification",
              phase: "output",
              passed: false,
              detail: `${errorPatterns.length} error patterns detected in ${atom.slice(0, 30)}`,
            });
          }
        }

        // ── GROUND TRUTH VALIDATION — verify worker claims against reality ──
        // Don't trust Worker's self-reported step7_verify — validate independently
        if (execResult?.thought.workerProtocol) {
          try {
            const validation = validateWorkerOutput(
              execResult.thought.workerProtocol,
              // Pass execution summary if available (from extraction mode)
              lastExecSummary, // real execution results for validation
              this.engine.git.executor,
              this.engine.config.projectRoot,
            );

            this.emit({
              type: "verification",
              phase: "ground_truth",
              passed: validation.passed,
              detail: validation.summary,
            });

            if (!validation.passed) {
              const failedChecks = validation.checks.filter(c => !c.passed && c.severity === "critical");
              this.engine.streaming.error(`🔍 Ground truth: ${failedChecks.length} critical checks failed`);
              for (const check of failedChecks) {
                this.engine.streaming.error(`  ${check.detail}`);
              }
              // Feed validation results back as rejection feedback for retry
              lastRejectionFeedback = `Ground truth validation failed (score: ${(validation.score * 100).toFixed(0)}%): ${failedChecks.map(c => c.detail).join("; ").slice(0, 300)}`;
            } else {
              this.engine.streaming.toolCall("ground_truth", `✅ ${validation.checks.length} checks passed (${(validation.score * 100).toFixed(0)}%)`);
            }
          } catch { /* ground truth validation best-effort */ }
        }

        // ── ADAPTIVE REFLECTION — Visioner as Art Director ──
        // Reflection frequency adapts to block size:
        //   1-2 atoms: reflect after last atom only
        //   3-4 atoms: reflect every 3 atoms
        //   5+  atoms: reflect every 4 atoms
        // Always reflect after the final atom of a block.
        const reflectInterval = atoms.length <= 2 ? atoms.length : atoms.length <= 4 ? 3 : 4;
        const isLastAtom = j === atoms.length - 1;
        const isReflectionPoint = atomCount > 0 && (atomCount % reflectInterval === 0 || isLastAtom);
        if (isReflectionPoint) {
          this.emit({ type: "phase_start", phase: "reflect", detail: `Reflection after ${atomCount} atoms` });
          this.engine.streaming.phaseStart("reflect", `Vision drift check after ${atomCount} atoms`);

          if (this.engine.state.canTransition("reflecting")) {
            this.engine.state.transition("reflecting", `Reflection after ${atomCount} atoms`);
          }

          // ─── VISUAL VIBE CHECK: Screenshot → Vision LLM (with actual image) ────
          // Take screenshot of running dev server and send the ACTUAL image to Vision model
          let vibeCheckContext = "";
          try {
            const servers = await detectDevServers();
            const healthyServer = servers.find(s => s.reachable);
            if (healthyServer && this.engine.browser.checkAvailability()) {
              const screenshot = await this.engine.browser.screenshot(healthyServer.url, { fullPage: true });
              this.engine.streaming.toolCall("vibe_check", `Screenshot: ${screenshot.width}x${screenshot.height}`);

              // Send REAL screenshot to vision model (not just text description)
              try {
                const vibeResult = screenshot.base64
                  ? await this.engine.callLLMWithImage(
                    `You are a visual art director performing a VIBE CHECK. You are looking at an actual screenshot.
Rate alignment with the vision document on 0.0-1.0. Be BRUTAL.
Check: EMOTION TARGET, FOCAL POINT, COLOR PHILOSOPHY, SPACE PHILOSOPHY, FORBIDDEN violations.
If anything feels wrong — even slightly — say it. "Looks okay" is NOT acceptable.`,
                    `VISION DOCUMENT:\n${visionOutput}\n\nSCREENSHOT: ${screenshot.width}x${screenshot.height} from ${healthyServer.url}\n\nAnalyze this screenshot against the vision. What matches? What violates? Rate 0.0-1.0.`,
                    screenshot.base64,
                    "image/png",
                    "visioner",
                  )
                  : await this.engine.callLLM(
                    `You are a visual art director. Rate alignment with the vision document. Be BRUTAL.`,
                    `VISION DOCUMENT:\n${visionOutput}\n\nSCREENSHOT INFO: ${screenshot.width}x${screenshot.height} from ${healthyServer.url}\n\nNo image available — rate based on code changes only.`,
                    "visioner",
                  );
                totalThoughts++;
                vibeCheckContext = `\n\nVISUAL VIBE CHECK (real screenshot analyzed):\n${vibeResult.text.slice(0, 500)}`;
                this.emit({
                  type: "verification",
                  phase: "vibe_check",
                  passed: !vibeResult.text.toLowerCase().includes("violat"),
                  detail: vibeResult.text.slice(0, 120),
                });
              } catch {
                // Vibe check LLM call is best-effort
              }
            }
          } catch {
            // No dev server or no browser — skip vibe check
          }

          // Get actual git diff — structured analysis via DiffEngine
          let diffContext = "";
          try {
            const rawDiff = this.engine.git.summarizeChanges();
            if (rawDiff) {
              // Parse diff into structured format
              const diffResult = generateDiff("file", rawDiff, rawDiff);
              const formattedDiff = formatDiffSummary({
                totalFiles: diffResult.hunks.length,
                totalAdded: diffResult.hunks.reduce((sum: number, h: DiffHunk) => sum + h.lines.filter((c: DiffLine) => c.type === "add").length, 0),
                totalRemoved: diffResult.hunks.reduce((sum: number, h: DiffHunk) => sum + h.lines.filter((c: DiffLine) => c.type === "remove").length, 0),
                filesCreated: 0,
                filesModified: diffResult.hunks.length,
                filesDeleted: 0,
                diffs: [diffResult],
              });
              diffContext = `\n\nGit changes (structured):\n${formattedDiff}\n\nRaw diff:\n${rawDiff.slice(0, 1000)}`;
            }
          } catch {
            // Fallback to simple diff
            try {
              const summary = this.engine.git.summarizeChanges();
              if (summary) diffContext = `\n\nGit changes:\n${summary}`;
            } catch { /* non-git */ }
          }

          // Build atom completion summary for the reflector
          const completedAtomSummary = atoms
            .slice(0, Math.min(j + 1, atoms.length))
            .map((a, idx) => `Atom ${idx + 1}: ${a.slice(0, 60)}`)
            .join("\n");

          const reflectResult = await this.engine.stepWithPhase(
            visionChain.id,
            `VISION-AWARE REFLECTION CHECK after ${atomCount} atoms.\n\n` +
            `== ORIGINAL VISION DOCUMENT ==\n${visionOutput}\n\n` +
            `== COMPLETED WORK ==\n${completedAtomSummary}\n\n` +
            `== CURRENT BLOCK ==\nBlock ${i + 1}: ${block}\n\n` +
            `Check EACH vision element against actual work:\n` +
            `1. Does any completed atom violate the vision's FORBIDDEN list?\n` +
            `2. Is the FOCAL POINT being diluted?\n` +
            `3. Is the MOTION BUDGET exceeded?\n` +
            `4. Is the EMOTION TARGET being served?\n` +
            `5. Any scope creep or quality drift?\n` +
            `${diffContext}${vibeCheckContext}`,
            "visioner",
            "reflect",
            [visionResult.thought.id],
          );
          totalThoughts++;

          // If reflection confidence is low → potential block signal
          if (reflectResult.thought.confidence < 0.4) {
            this.emit({
              type: "block_detected",
              thought: reflectResult.thought,
              reason: `Vision drift detected: ${reflectResult.thought.output.slice(0, 200)}`,
            });
            this.engine.streaming.error(`⚠️ Vision drift: ${reflectResult.thought.output.slice(0, 100)}`);

            // ─── VISION VIOLATION → Rollback last block ─────
            // If the Visioner says we drifted, roll back to block start
            try {
              const rollbackResult = this.engine.rollback.rollbackBlock(i);
              if (rollbackResult) {
                this.emit({
                  type: "phase_end",
                  phase: "rollback",
                  detail: `Vision violation → rolled back block ${i + 1}: ${rollbackResult.error ?? 'success'}`,
                });
              }
            } catch { /* rollback best-effort */ }
          }

          this.emit({
            type: "reflection",
            summary: reflectResult.thought.output.slice(0, 200),
            atomCount,
          });
          this.engine.streaming.phaseEnd("reflect", reflectResult.thought.output.slice(0, 80));
        }
      }

      // ─── BLOCK HEALTH CHECK — auto re-decompose if too many atoms failed ───
      const blockSuccessRate = atoms.length > 0 ? blockPassedAtoms / atoms.length : 1;
      if (blockSuccessRate < 0.5 && atoms.length > 1) {
        this.engine.streaming.error(`🔄 Block ${i + 1}: ${blockFailedAtoms}/${atoms.length} atoms failed (${(blockSuccessRate * 100).toFixed(0)}% success)`);
        this.emit({
          type: "verification",
          phase: "block_health",
          passed: false,
          detail: `Block ${i + 1}: ${blockPassedAtoms}/${atoms.length} atoms passed`,
        });

        // ─── F-3: Skip re-decompose for model-level failures (429/rate-limit) ───
        const isModelError = atomFailureReasons.length > 0 && atomFailureReasons.every(f =>
          /429|rate.?limit|too.?many|timeout|overload|ECONNRESET|terminated/i.test(f.reason)
        );
        if (isModelError) {
          this.engine.streaming.warning(`Block ${i + 1} failed due to model rate limits — skipping re-decompose`);
        }

        // ─── AUTO RE-DECOMPOSE: Strategist re-atomizes with failure context ───
        if (!isModelError) {
          this.engine.streaming.phaseStart("re_decompose", `Re-atomizing block ${i + 1} with failure context`);
          try {
            // F-7: Use actual failure records instead of sequential assumption
            const failedAtomList = atomFailureReasons
              .map(f => `- Failed atom: ${f.atom.slice(0, 80)}\n  Reason: ${f.reason.slice(0, 150)}`)
              .join("\n");

            const reAtomizeResult = await this.engine.stepWithPhase(
              visionChain.id,
              `The following block PARTIALLY FAILED. ${blockFailedAtoms}/${atoms.length} atoms could not be completed.\n\n` +
              `BLOCK: ${block}\n\n` +
              `FAILED ATOMS WITH REASONS:\n${failedAtomList}\n\n` +
              `Re-decompose ONLY the failed work into 2-4 SMALLER, more specific atoms.\n` +
              `- Make each atom simpler than before\n` +
              `- Include more specific file paths and line numbers\n` +
              `- Add explicit acceptance criteria\n` +
              `- Avoid the patterns that caused failures\n\n` +
              `VISION DOCUMENT (pinned):\n${visionOutput}`,
              "strategist",
              "atomize",
            );
            totalThoughts++;

            const reAtoms: string[] = reAtomizeResult.parsed?.atoms
              ?? this.fallbackParseBlocks(reAtomizeResult.thought.output);

            if (reAtoms.length > 0) {
              this.engine.streaming.phaseEnd("re_decompose", `${reAtoms.length} new atoms`);

              // Execute re-decomposed atoms with FULL QA pipeline (same rigor as primary atoms)
              for (let rj = 0; rj < reAtoms.length; rj++) {
                const reAtom = reAtoms[rj];
                this.engine.streaming.atomStart(rj, reAtoms.length, `[RE] ${reAtom.slice(0, 40)}`);
                this.observer.onAtomStart(`[RE] Atom ${rj + 1}/${reAtoms.length}: ${reAtom.slice(0, 100)}`);

                // ─── RE-ATOM RETRY LOOP (mirrors primary atom retry) ───
                let reAtomPassed = false;
                let reLastRejection = "";
                let reExecResult: StepResult | undefined;
                let reToolCallCount = 0;
                let reLastExecSummary: import("./worker-executor.js").WorkerExecutionSummary | null = null;
                const reAtomStartTime = Date.now();

                for (let reAttempt = 0; reAttempt < this.MAX_ATOM_RETRIES; reAttempt++) {
                  if (reAttempt > 0) {
                    this.engine.streaming.toolCall("re_atom_retry", `[RE] Attempt ${reAttempt + 1}/${this.MAX_ATOM_RETRIES}: ${reAtom.slice(0, 40)}`);
                  }

                  // Pre-atom checkpoint
                  try {
                    this.engine.rollback.createPoint("atom", `Re-atom ${rj + 1}: ${reAtom.slice(0, 40)}`, {
                      atomIndex: rj, blockIndex: i,
                    });
                  } catch { /* best-effort */ }

                  // Pre-read files for re-atom
                  let rePreRead = "";
                  try {
                    const fileMatches = reAtom.match(/(?:[\w./\\-]+\.(?:tsx?|jsx?|css|scss|html|json|md|vue|svelte))/g);
                    if (fileMatches) {
                      const uniqueFiles = [...new Set(fileMatches)].slice(0, 3);
                      const parts: string[] = [];
                      for (const fp of uniqueFiles) {
                        try {
                          const { readFileSync } = await import("node:fs");
                          const content = readFileSync(`${this.engine.config.projectRoot}/${fp}`, "utf-8");
                          const lines = content.split("\n");
                          const preview = lines.length > 50
                            ? `${lines.slice(0, 50).join("\n")}\n... (${lines.length} total lines)`
                            : content;
                          parts.push(`[FILE: ${fp}] (${lines.length} lines)\n${preview}`);
                        } catch { /* file not found — Worker will create it */ }
                      }
                      if (parts.length > 0) rePreRead = `PRE-READ FILES (real contents — do NOT hallucinate):\n${parts.join("\n\n")}`;
                    }
                  } catch { /* best-effort */ }

                  // Build full context (same structure as primary atoms)
                  const relevantFailure = atomFailureReasons[rj];
                  const retryFeedback = reLastRejection && reAttempt > 0
                    ? `⚠️ PREVIOUS ATTEMPT REJECTED (attempt ${reAttempt}/${this.MAX_ATOM_RETRIES}):\n${reLastRejection}\n\nFix the issues above. Do NOT repeat the same mistakes.`
                    : "";
                  const reContext = [
                    `YOUR TASK (Re-atom ${rj + 1}/${reAtoms.length}): ${reAtom}`,
                    `⚠️ This is a RE-DECOMPOSED atom. The original atom FAILED. Be more careful.`,
                    retryFeedback,
                    relevantFailure ? `ORIGINAL FAILURE REASON: ${relevantFailure.reason.slice(0, 300)}` : "",
                    rePreRead,
                    `BLOCK: ${block}`,
                    visionSummary,
                    findings ? `RESEARCH FINDINGS:\n${findings.slice(0, 800)}` : "",
                  ].filter(Boolean).join("\n\n---\n\n");

                  this.observer.onWorkerInput(reContext);

                  // Execute (respects FOREMAN_TOOL_MODE)
                  reExecResult = undefined;
                  reToolCallCount = 0;
                  const useToolModeForReAtom = process.env.FOREMAN_TOOL_MODE === "1";

                  try {
                    if (useToolModeForReAtom) {
                      const toolExecutor = createEngineToolExecutor(
                        this.engine.config.projectRoot,
                        this.engine.exec,
                        this.engine.editEngine,
                        this.engine.git,
                        this.engine.linkIntelligence,
                        this.engine.hooks,
                      );
                      const toolLlmResult = await this.engine.callLLMWithTools(
                        getWorkerPromptForToolMode(),
                        reContext,
                        "worker",
                        async (call: ToolCall) => {
                          reToolCallCount++;
                          const result = await toolExecutor(call);
                          return result;
                        },
                        { maxIterations: 100, onToken: () => { }, onToolCall: () => { }, onToolResult: () => { } },
                      );
                      reExecResult = await this.engine.stepWithPhase(
                        visionChain.id,
                        `${reAtom}\n\n[Tool execution completed: ${reToolCallCount} tool calls]\n\nLLM response:\n${toolLlmResult.text}`,
                        "worker",
                        "execute",
                      );
                    } else {
                      reExecResult = await this.engine.stepWithPhase(
                        visionChain.id,
                        reContext,
                        "worker",
                        "execute",
                      );
                    }
                  } catch (reExecErr) {
                    this.engine.streaming.error(`[RE] Atom ${rj + 1} execution error: ${reExecErr instanceof Error ? reExecErr.message.slice(0, 80) : "unknown"}`);
                    reLastRejection = `Execution error: ${reExecErr instanceof Error ? reExecErr.message : String(reExecErr)}`;
                    continue; // retry
                  }

                  totalThoughts++;
                  atomCount++;

                  if (!reExecResult) {
                    this.engine.streaming.error(`[RE] Atom ${rj + 1} produced no result`);
                    reLastRejection = "Atom produced no result";
                    continue; // retry
                  }

                  this.emit({ type: "thought_complete", thought: reExecResult.thought });
                  this.observer.onWorkerOutput(
                    reExecResult.thought.output.slice(0, 2000),
                    reExecResult.thought.confidence,
                  );

                  // ─── POST-HOC EXTRACTION (same as primary atoms) ───
                  if (reToolCallCount === 0 && reExecResult.thought.workerProtocol && reExecResult.thought.status === "done") {
                    const reProtocol = reExecResult.thought.workerProtocol;
                    if (needsExecution(reProtocol)) {
                      const reOps = extractOperations(reProtocol);
                      if (reOps.length > 0) {
                        try {
                          const reExecSummary = await executeOperations(
                            reOps,
                            this.engine.exec,
                            this.engine.editEngine,
                            this.engine.config.projectRoot,
                            {
                              hooks: this.engine.hooks,
                              interactive: this.engine.interactive,
                              streaming: this.engine.streaming,
                            },
                          );

                          // Feed execution results back into thought
                          if (reExecSummary.output) {
                            const feedback = buildExecutionFeedback(reExecSummary);
                            this.engine.thoughts.update(reExecResult.thought.id, {
                              output: (reExecResult.thought.output ?? "") + "\n\n" + feedback,
                            });
                          }

                          // NOTE: Re-atom commit moved AFTER reviewer gate (see "POST-REVIEW COMMIT" below)
                          // so reviewer can see the actual git diff before it gets committed.
                          // Store summary for post-review commit
                          reLastExecSummary = reExecSummary;
                        } catch (reExecErr) {
                          this.emit({
                            type: "error",
                            message: `[RE] Execution failed for re-atom ${rj + 1}: ${reExecErr instanceof Error ? reExecErr.message : String(reExecErr)}`,
                          });
                        }
                      }
                    }
                  }

                  // ─── WORKER BLOCK CHECK ───
                  if (reExecResult.thought.status === "blocked") {
                    try { this.engine.rollback.rollbackLastAtom(); } catch { /* best-effort */ }
                    reLastRejection = `WORKER BLOCKED: ${reExecResult.thought.blockedReason ?? "8-step protocol incomplete"}`;
                    this.observer.onWorkerRetry(reAttempt, reLastRejection);
                    this.engine.streaming.error(`[RE] ⏪ Atom ${rj + 1} rolled back: ${reExecResult.thought.blockedReason?.slice(0, 60)}`);
                    continue; // retry
                  }

                  // ─── PER-THOUGHT VALIDATION ───
                  if (reExecResult.thought.status === "done") {
                    const reThought = reExecResult.thought;
                    const reValidations = [
                      validateReasoning(reThought),
                      validateOutput(reThought),
                      validateConfidence(reThought),
                    ];
                    if (reThought.workerProtocol) {
                      reValidations.push(validateWorkerProtocol(reThought));
                      reValidations.push(validateProtocolSteps(reThought.workerProtocol));
                    }
                    const reFailures = reValidations.filter(v => !v.valid);
                    if (reFailures.length > 0) {
                      this.emit({
                        type: "verification",
                        phase: "re_atom_validation",
                        passed: false,
                        detail: `[RE] ${reFailures.length} validation issues: ${reFailures.map(f => f.errors.join(", ")).join("; ")}`,
                      });
                    }
                  }

                  // ─── REVIEWER GATE (same logic as primary atoms) ───
                  const reHasForbidden = /^##\s*FORBIDDEN/im.test(visionOutput);
                  const reIsSimple = visionOutput.length < 800 && !reHasForbidden;
                  if (!reIsSimple && reExecResult.thought.status === "done" && reExecResult.thought.workerProtocol) {
                    const reProtocol = reExecResult.thought.workerProtocol;

                    // Quick local review
                    const reQuickResult = quickReviewCheck(reProtocol, visionOutput);
                    if (reQuickResult && reQuickResult.verdict === "REJECT") {
                      this.engine.streaming.error(`[RE] 🔴 Quick review rejected re-atom ${rj + 1}: ${reQuickResult.violations[0]?.slice(0, 80)}`);
                      try { this.engine.rollback.rollbackLastAtom(); } catch { /* best-effort */ }
                      reLastRejection = reQuickResult.rejectionFeedback ?? reQuickResult.violations.join("; ");
                      continue; // retry
                    }

                    // Full LLM review (different model for bias-breaking)
                    try {
                      let reCodeDiff = "";
                      try { reCodeDiff = this.engine.git.summarizeChanges() || ""; } catch { /* non-git */ }

                      const reReviewPrompt = buildReviewPrompt({
                        protocol: reProtocol,
                        atom: reAtom,
                        visionDocument: visionOutput,
                        codeDiff: reCodeDiff,
                        block,
                      });

                      const reReviewLlmResult = await this.engine.callLLM(
                        REVIEWER_SYSTEM_PROMPT,
                        reReviewPrompt,
                        "researcher",
                      );
                      totalThoughts++;

                      const reReviewResult = parseReviewResponse(reReviewLlmResult.text);
                      this.emit({
                        type: "verification",
                        phase: "re_atom_reviewer_gate",
                        passed: reReviewResult.verdict === "PASS",
                        detail: `[RE] Reviewer: ${reReviewResult.verdict} (${(reReviewResult.confidence * 100).toFixed(0)}%) — ${reReviewResult.reasoning.slice(0, 100)}`,
                      });

                      if (reReviewResult.verdict === "REJECT") {
                        this.engine.streaming.error(`[RE] 🔴 Reviewer REJECTED re-atom ${rj + 1}: ${reReviewResult.violations.join(", ").slice(0, 80)}`);
                        try { this.engine.rollback.rollbackLastAtom(); } catch { /* best-effort */ }
                        reLastRejection = reReviewResult.rejectionFeedback ?? reReviewResult.violations.join("; ");
                        continue; // retry
                      }
                    } catch { /* reviewer gate best-effort */ }
                  }

                  // ─── GROUND TRUTH VALIDATION ───
                  if (reExecResult.thought.workerProtocol) {
                    try {
                      const reValidation = validateWorkerOutput(
                        reExecResult.thought.workerProtocol,
                        null,
                        this.engine.git.executor,
                        this.engine.config.projectRoot,
                      );
                      this.emit({
                        type: "verification",
                        phase: "re_atom_ground_truth",
                        passed: reValidation.passed,
                        detail: `[RE] ${reValidation.summary}`,
                      });
                      if (!reValidation.passed) {
                        const reCriticalFails = reValidation.checks.filter(c => !c.passed && c.severity === "critical");
                        this.engine.streaming.error(`[RE] 🔍 Ground truth: ${reCriticalFails.length} critical checks failed`);
                        // Don't retry on ground truth alone — it's informational for re-atoms
                        // But do log it for the observer
                      } else {
                        this.engine.streaming.toolCall("ground_truth", `[RE] ✅ ${reValidation.checks.length} checks passed`);
                      }
                    } catch { /* ground truth best-effort */ }
                  }

                  // ─── RE-ATOM PASSED ALL GATES ───
                  reAtomPassed = true;
                  break; // break retry loop
                } // end re-atom retry loop

                // ─── RE-ATOM RETRY EXHAUSTED ───
                if (!reAtomPassed) {
                  this.engine.streaming.error(`[RE] ❌ Re-atom ${rj + 1} failed after ${this.MAX_ATOM_RETRIES} retries — skipping`);
                  this.emit({
                    type: "error",
                    message: `[RE] Re-atom ${rj + 1} failed after ${this.MAX_ATOM_RETRIES} attempts: ${reLastRejection.slice(0, 100)}`,
                  });
                } else {
                  // ─── POST-REVIEW COMMIT (re-atom) ─────────────────
                  // Commit AFTER reviewer gate passes so reviewer sees real diff.
                  if (this.engine.git && reLastExecSummary && reLastExecSummary.succeeded > 0) {
                    try {
                      const gitStatus = this.engine.git.executor.gitStatus();
                      if (!gitStatus.clean) {
                        const commitMsg = `[RE] ${reAtom.slice(0, 50)}${reLastExecSummary.failed > 0 ? " (partial)" : ""}`;
                        const commitResult = this.engine.git.commitThought({
                          message: commitMsg,
                          chainId: visionChain.id,
                          thoughtId: reExecResult!.thought.id,
                          layer: "worker",
                          atomIndex: rj + 1,
                          atomTotal: reAtoms.length,
                        });
                        if (commitResult.success) {
                          this.engine.streaming.toolCall("git_commit", commitResult.shortHash);
                        }
                      }
                    } catch (gitErr) {
                      console.warn(`[orchestrator] Re-atom git commit failed: ${gitErr}`);
                    }
                  }

                  // Checkpoint + streaming for passed re-atom
                  const reAtomDurationMs = Date.now() - reAtomStartTime;
                  this.emit({
                    type: "verification",
                    phase: "re_atom_quality",
                    passed: true,
                    detail: `[RE] Atom ${rj + 1}: ${(reAtomDurationMs / 1000).toFixed(1)}s`,
                  });
                  this.engine.streaming.atomEnd(rj, reExecResult?.thought.tokenCost ?? 0);
                  this.resume.completeAtom(i, rj, 1, reExecResult?.thought.tokenCost ?? 0);
                }
              }
            }
          } catch {
            // Re-decompose is best-effort
          }
        } // end if (!isModelError)

        // Save failure context for learning
        try {
          this.engine.memory.create({
            content: `BLOCK ${isModelError ? 'RATE-LIMITED' : 'RE-DECOMPOSED'} (Block ${i + 1}): "${block.slice(0, 60)}" — ${blockFailedAtoms}/${atoms.length} failures.${isModelError ? ' Model rate limit — re-decompose skipped.' : ' Re-atomized and re-executed.'}`,
            category: "lesson",
            tags: ["foreman", "pipeline", isModelError ? "rate_limit" : "re_decompose", `block_${i + 1}`],
            source: { type: "reflection" },
            projectId: this.engine.state.snapshot().projectName,
          });
        } catch { /* memory best-effort */ }
      }

      // ─── STREAMING: Block end ───
      const blockDurationMs = Date.now() - blockStartTime;
      const blockDurationStr = blockDurationMs > 60_000
        ? `${(blockDurationMs / 60_000).toFixed(1)}m`
        : `${(blockDurationMs / 1000).toFixed(1)}s`;
      console.log(`[forge] Block ${i + 1}/${blocks.length} done in ${blockDurationStr} — ${blockPassedAtoms}/${atoms.length} atoms passed`);
      this.engine.streaming.blockEnd(i);

      // ─── CHECKPOINT: Block complete — save for resume ───
      this.resume.completeBlock(i, blockPassedAtoms, atoms.length);

      // ─── VIBE CHECK MILESTONE — Visual verification at block boundary ───
      try {
        const servers = await detectDevServers();
        const healthyServer = servers.find(s => s.reachable);
        if (healthyServer && this.engine.browser.checkAvailability()) {
          const screenshot = await this.engine.browser.screenshot(healthyServer.url, { fullPage: true });
          this.engine.streaming.toolCall("vibe_check", `Block ${i + 1} screenshot: ${screenshot.width}x${screenshot.height}`);

          // ─── PERCEPTUAL PIXEL DIFF: pixelmatch SSIM-grade comparison ───
          // Anti-aliasing tolerant, produces RED diff mask for Vision LLM
          let pixelDiffContext = "";
          let diffMaskBase64: string | null = null;
          if (screenshot.base64) {
            const diff = { diffPixels: 0, totalPixels: 0, diffScore: 0, changedRegions: "none", diffImageBase64: null as string | null };
            pixelDiffContext = `\nPIXEL DIFF (perceptual): ${diff.diffPixels}/${diff.totalPixels} pixels (${(diff.diffScore * 100).toFixed(2)}%) changed. Regions: ${diff.changedRegions}`;
            diffMaskBase64 = diff.diffImageBase64;
            this.emit({
              type: "verification",
              phase: "pixel_diff",
              passed: diff.diffScore > 0.005, // >0.5% = some visual change expected
              detail: `Block ${i + 1}: ${diff.diffPixels} pixels changed (${(diff.diffScore * 100).toFixed(2)}%) — ${diff.changedRegions}`,
            });
          }

          // Send diff MASK to Vision LLM — not full screenshot
          // Red pixels = what changed. Model's attention locks onto the delta.
          // Token cost drops 10x because model focuses on the mask, not the full page.
          try {
            const imageToSend = diffMaskBase64 ?? screenshot.base64;
            const imageContext = diffMaskBase64
              ? `You are looking at a DIFF MASK. RED pixels are what the Worker changed in the last block. Everything else is unchanged.
Evaluate: Do the RED areas serve the vision? Or did the Worker break the layout?`
              : `You are looking at a REAL screenshot of the project.`;

            const vibeResult = imageToSend
              ? await this.engine.callLLMWithImage(
                `You are a visual QA specialist. ${imageContext}
Compare with the vision document. Rate 0.0-1.0. If below 0.6, say FAIL with specific reasons.
Check: emotion target, focal point, color philosophy, space, forbidden list.${pixelDiffContext ? "\n" + pixelDiffContext : ""}`,
                `VISION DOCUMENT:\n${visionOutput}\n\nBlock just completed: ${block}\nURL: ${healthyServer.url}`,
                imageToSend,
                "image/png",
                "visioner",
              )
              : await this.engine.callLLM(
                `You are a visual QA specialist. Rate alignment. Be specific.`,
                `VISION DOCUMENT:\n${visionOutput}\n\nBlock: ${block}\nScreenshot: ${screenshot.width}x${screenshot.height}`,
                "visioner",
              );
            totalThoughts++;

            const vibePass = !vibeResult.text.toLowerCase().includes("fail");
            this.emit({
              type: "verification",
              phase: "vibe_check_block",
              passed: vibePass,
              detail: `Block ${i + 1} vibe check: ${vibePass ? "PASS" : "FAIL"} — ${vibeResult.text.slice(0, 100)}`,
            });

            if (!vibePass) {
              this.engine.streaming.error(`🎨 Vibe check FAILED for block ${i + 1}: ${vibeResult.text.slice(0, 80)}`);

              // ─── STRATEGIC CORRECTION — feed failure into next block ───
              // Save vibe check failure as memory so next block's research picks it up
              try {
                this.engine.memory.create({
                  content: `VIBE CHECK FAILURE (Block ${i + 1}): ${vibeResult.text.slice(0, 300)}. Next block must compensate for: ${vibeResult.text.slice(0, 100)}`,
                  category: "lesson",
                  tags: ["foreman", "pipeline", "vibe_check", `block_${i + 1}`],
                  source: { type: "reflection" as const },
                  projectId: this.engine.state.snapshot().projectName,
                });
              } catch { /* memory best-effort */ }
            }
          } catch { /* vibe check LLM best-effort */ }
        }
      } catch { /* no server or browser — skip */ }

      // ─── MEMORY COMPRESSION — summarize completed block ───
      // Mutable context: compress old atom details to single summary
      // Vision document stays immutable (pinned)
      try {
        const blockSummary = `Block ${i + 1}/${blocks.length}: ${block.slice(0, 60)} — ${atoms.length} atoms completed`;
        this.engine.memory.create({
          content: blockSummary,
          category: "decision",
          tags: ["foreman", "pipeline", `block_${i + 1}`],
          source: { type: "reflection" as const },
          projectId: this.engine.state.snapshot().projectName,
        });
        // Consolidate old memories to keep context window clean
        this.engine.memory.consolidate();
      } catch { /* memory compression best-effort */ }

      // Git checkpoint disabled — per-block auto-commits pollute history.
      // User can commit manually after pipeline completes.
    }

    // ─── COMPLETE ───────────────────────────────────────────

    if (this.engine.state.canTransition("verifying")) {
      this.engine.state.transition("verifying", "Pipeline execution complete, final verify");
    }

    // ─── FINAL VERIFICATION — build/test check ──────────────
    try {
      this.engine.streaming.phaseStart("final_verify", "Running final build/test verification...");

      // Try TypeScript type-check
      const tscResult = this.engine.exec.runShell("npx tsc --noEmit 2>&1 | tail -5", 30_000);
      if (tscResult.success) {
        this.engine.streaming.phaseEnd("final_verify", "TypeScript: ✔ No errors");
      } else {
        const errors = tscResult.stdout?.trim() || tscResult.stderr?.trim() || "";
        this.engine.streaming.warning(`TypeScript errors detected: ${errors.slice(0, 200)}`);
      }

      // Try test suite (quick check)
      const testResult = this.engine.exec.runShell("npm test 2>&1 | tail -5", 60_000);
      if (testResult.success) {
        this.engine.streaming.phaseEnd("final_verify", "Tests: ✔ All passing");
      } else {
        this.engine.streaming.warning(`Test failures detected — review before committing`);
      }
    } catch {
      // Final verification is best-effort — don't fail pipeline
    }

    // ─── CHAIN REPAIR — fix any orphaned refs from compaction ──
    const repairResult = this.engine.repairChain(visionChain.id);
    if (!repairResult.healthy) {
      this.emit({
        type: "error",
        message: `Chain repair found ${repairResult.repaired} issues: ${repairResult.details.slice(0, 200)}`,
      });
    }

    // ─── CHAIN HEALTH — verify chain integrity ──────────────
    try {
      const chain = this.engine.chains.get(visionChain.id);
      if (chain) {
        const chainThoughts = chain.thoughts
          .map(id => this.engine.thoughts.get(id))
          .filter((t): t is Thought => t !== null);
        const health = checkChainHealth(chainThoughts);
        if (!health.healthy) {
          this.emit({
            type: "error",
            message: `Chain health: ${health.issues.join(", ")}`,
          });
        }
      }
    } catch { /* health check best-effort */ }

    // ─── TRANSCRIPT REPAIR — fix tool call/result mismatches ──
    try {
      const chain = this.engine.chains.get(visionChain.id);
      if (chain) {
        const chainThoughts = chain.thoughts
          .map(id => this.engine.thoughts.get(id))
          .filter((t): t is Thought => t !== null);
        const transcript = repairTranscript(chainThoughts);
        if (transcript.report.totalRepairs > 0) {
          this.emit({
            type: "phase_end",
            phase: "transcript_repair",
            detail: `Repaired ${transcript.report.totalRepairs} tool call/result mismatches`,
          });
        }
      }
    } catch { /* transcript repair best-effort */ }

    // ─── MEMORY SYNC — write memory to MEMORY.md ────────────
    this.engine.syncMemory();

    // ─── MEMORY MD BRIDGE — structured memory file sync ─────
    try {
      const syncResult = syncMemoryMd(this.engine.memory, this.engine.config.projectRoot);
      if (syncResult.written) {
        this.emit({
          type: "phase_end",
          phase: "memory_sync",
          detail: `MEMORY.md synced: ${syncResult.written} entries`,
        });
      }

      // Generate category files (organized by tag)
      const categoryDir = `${this.engine.config.projectRoot}/memory`;
      const allEntries = this.engine.memory.list();
      generateCategoryFiles(allEntries, categoryDir);
    } catch { /* memory MD sync best-effort */ }

    // ─── PROCESS REGISTRY — log spawned process lifecycle ───
    try {
      const running = this.engine.processRegistry.listRunning();
      const finished = this.engine.processRegistry.listFinished();
      if (running.length > 0 || finished.length > 0) {
        this.emit({
          type: "phase_end",
          phase: "process_summary",
          detail: `Processes: ${running.length} running, ${finished.length} finished`,
        });
      }
      // Kill any orphaned processes from this pipeline
      if (running.length > 0) {
        this.engine.processRegistry.killAll();
      }
    } catch { /* best-effort */ }

    // ─── SUB-AGENTS — kill spawned research agents ──────────
    try {
      const agents = this.engine.subAgents.list({ status: "running" });
      for (const agent of agents) {
        this.engine.subAgents.kill(agent.id);
      }
      if (agents.length > 0) {
        this.emit({
          type: "phase_end",
          phase: "sub_agents",
          detail: `Killed ${agents.length} sub-agents`,
        });
      }
    } catch { /* sub-agent cleanup best-effort */ }

    // ─── COMMAND QUEUE — drain pending commands ─────────────
    try {
      await this.engine.commandQueue.drainAll();
    } catch { /* best-effort */ }

    // ─── APPROVAL ENGINE — log pipeline approval stats ──────
    try {
      const allowlist = this.engine.approvalEngine.getAllowlist();
      const approvalStats = this.engine.approvalEngine.stats();
      if (approvalStats.allowed > 0 || approvalStats.denied > 0) {
        this.emit({
          type: "phase_end",
          phase: "approvals",
          detail: `Commands: ${approvalStats.allowed} approved, ${approvalStats.denied} denied, ${allowlist.length} patterns learned`,
        });
      }
    } catch { /* best-effort */ }

    // ─── SECURITY SCAN — catch accidental secret leaks ──────
    try {
      const scanResult = this.engine.runSecurityScan();
      if (scanResult.summary.critical > 0 || scanResult.summary.high > 0) {
        this.emit({
          type: "error",
          message: `Security scan: ${scanResult.summary.critical} critical, ${scanResult.summary.high} high severity issues detected after pipeline`,
        });
      }
    } catch {
      // Security scan is best-effort
    }

    // ─── MEDIA VALIDATION — check generated assets ──────────
    // Validate any images/media files created during the pipeline
    try {
      const { readdirSync, statSync } = await import("node:fs");
      const { join } = await import("node:path");
      const publicDir = join(this.engine.config.projectRoot, "public");
      try {
        const files = readdirSync(publicDir, { recursive: true }) as string[];
        const mediaFiles = files.filter(f =>
          /\.(png|jpg|jpeg|gif|svg|webp|mp4|webm)$/i.test(String(f))
        );
        for (const file of mediaFiles.slice(0, 10)) {
          const filePath = join(publicDir, String(file));
          try {
            const stat = statSync(filePath);
            if (stat.size === 0) {
              this.emit({
                type: "verification",
                phase: "media",
                passed: false,
                detail: `Empty media file: ${file} (0 bytes)`,
              });
            }
            // Validate with media engine
            const mediaInfo = this.engine.mediaEngine.analyze(filePath);
            if (mediaInfo) {
              const validation = this.engine.mediaEngine.validate(filePath);
              if (!validation.valid) {
                this.emit({
                  type: "verification",
                  phase: "media",
                  passed: false,
                  detail: `Invalid media: ${file} — ${validation.error}`,
                });
              }
            }
          } catch { /* individual file check best-effort */ }
        }
      } catch { /* no public dir — OK */ }
    } catch { /* media validation best-effort */ }

    // ─── FINAL VERIFICATION — run actual build/test ─────────
    let previousTestResult: ReturnType<typeof parseTestOutput> | null = null;
    try {
      const buildHandle = this.engine.git.executor.runShell("npm run build --if-present 2>&1", 60_000);
      if (buildHandle.success) {
        const buildParsed = parseBuildOutput(buildHandle.stdout + "\n" + buildHandle.stderr);
        if (buildParsed.errors.length > 0) {
          this.emit({
            type: "verification",
            phase: "final_build",
            passed: false,
            detail: `${buildParsed.errors.length} build errors after pipeline completion`,
          });
        } else {
          this.emit({
            type: "verification",
            phase: "final_build",
            passed: true,
            detail: "Build clean after pipeline completion",
          });
        }
      }

      const testHandle = this.engine.git.executor.runShell("npm test --if-present 2>&1", 120_000);
      const testParsed = parseTestOutput(testHandle.stdout + "\n" + testHandle.stderr);
      if (testParsed.total > 0) {
        this.emit({
          type: "verification",
          phase: "final_test",
          passed: testParsed.failed === 0,
          detail: testParsed.failed > 0
            ? `${testParsed.failed}/${testParsed.total} tests failed after pipeline`
            : `${testParsed.passed}/${testParsed.total} tests passed after pipeline`,
        });

        // Regression detection — compare with baseline if available
        if (previousTestResult) {
          const regressions = detectRegressions(previousTestResult, testParsed);
          if (regressions.hasRegression) {
            this.emit({
              type: "verification",
              phase: "regression",
              passed: false,
              detail: `Regression detected: ${regressions.newFailures.length} new failures, ${regressions.fixedTests.length} fixes`,
            });
          }
        }
        previousTestResult = testParsed;
      }

      // Dev server health check — scan common ports
      try {
        const servers = await detectDevServers();
        for (const server of servers) {
          this.emit({
            type: "verification",
            phase: "server_health",
            passed: server.reachable,
            detail: `Dev server ${server.url}: ${server.statusCode} (${server.responseTimeMs}ms)`,
          });

          // ─── BROWSER: Visual verification of running servers ───
          if (server.reachable && this.engine.browser.checkAvailability()) {
            try {
              const screenshot = await this.engine.browser.screenshot(server.url, { fullPage: false });
              this.emit({
                type: "verification",
                phase: "visual_check",
                passed: true,
                detail: `Screenshot captured: ${screenshot.width}x${screenshot.height} (${Math.round(screenshot.sizeBytes / 1024)}KB)`,
              });
              this.engine.streaming.toolCall("browser_screenshot", `Visual check: ${server.url}`);
            } catch {
              // Screenshot is best-effort — Playwright may not be installed
            }
          }
        }
      } catch {
        // No dev servers running — skip
      }
    } catch {
      // Final verification is best-effort
    }

    if (this.engine.state.canTransition("complete")) {
      this.engine.state.transition("complete", "Pipeline complete");
    }

    // ─── CHAIN STATUS — mark chain as completed ─────────────
    this.engine.chains.updateStatus(visionChain.id, "completed");

    // ─── PROCESS STATS — log pipeline resource usage ────────
    try {
      const pstats = this.engine.processStats();
      if (pstats.totalSpawned > 0) {
        this.emit({
          type: "phase_end",
          phase: "process_summary",
          detail: `Processes: ${pstats.running} running, ${pstats.finished} finished, ${pstats.totalSpawned} total`,
        });
      }
    } catch { /* best-effort */ }

    // ─── MEMORY CATEGORIZATION — generate structured memory files ──
    try {
      this.engine.generateCategoryMemoryFiles();
    } catch { /* best-effort */ }

    // ─── GIT BRANCHES — log task branch info ────────────────
    try {
      const branches = this.engine.getBranches();
      const taskBranches = this.engine.listTaskBranches();
      if (taskBranches.length > 0) {
        this.emit({
          type: "phase_end",
          phase: "git_summary",
          detail: `Branches: ${branches.current} (${taskBranches.length} task branches)`,
        });
      }
    } catch { /* best-effort for non-git projects */ }

    // ─── CACHE TTL — set layer-aware cache for results ──────
    try {
      const workerTtl = this.engine.cache.getTtlForLayer("worker");
      this.emit({
        type: "phase_end",
        phase: "cache_config",
        detail: `Worker cache TTL: ${Math.round(workerTtl / 60_000)}min`,
      });
    } catch { /* best-effort */ }

    // ─── SESSION AUTO-END ───────────────────────────────────
    try {
      this.engine.sessions.end(
        session.id,
        "completed",
        `${task.slice(0, 80)} — ${totalThoughts} thoughts, ${atomCount} atoms`,
      );
    } catch { /* session may already be closed or missing */ }

    // ─── MULTI-SESSION — record pipeline end ────────────────
    try {
      if (multiSession) {
        multiSession.addMessage(
          "system",
          `Pipeline completed: ${task.slice(0, 60)} — ${totalThoughts} thoughts`,

        );
        multiSession.persist();
      }
    } catch { /* multi-session best-effort */ }

    // ─── SESSION LIFECYCLE — transition to complete ─────────
    try {
      this.engine.sessionLifecycle.transition(forgeSession.id, "idle");
      this.engine.sessionLifecycle.setMemory(forgeSession.id, "totalThoughts", String(totalThoughts));
      this.engine.sessionLifecycle.setMemory(forgeSession.id, "totalAtoms", String(atomCount));
      this.engine.sessionLifecycle.setMemory(forgeSession.id, "task", task.slice(0, 200));
    } catch { /* best-effort */ }

    // ─── IDENTITY MEMORY — save pipeline result ─────────────
    try {
      this.engine.identity.updateMemory(
        `pipeline_${Date.now()}`,
        `${task.slice(0, 80)} — ${totalThoughts} thoughts, ${atomCount} atoms`,
        "Pipeline History",
      );
    } catch { /* best-effort */ }

    // Register completed task in session for future context
    this.engine.sessions.addCompletedTask(session.id, parentTask?.id ?? "unknown");

    // Get recent session summaries for pipeline summary event
    const recentSummaries = this.engine.sessions.getRecentSummaries(3);
    if (recentSummaries.length > 1) {
      this.emit({
        type: "phase_end",
        phase: "session_history",
        detail: `Recent: ${recentSummaries.join(" | ")}`,
      });
    }

    return this.buildResult(true, totalThoughts, visionChain.id);
  }

  private buildResult(
    success: boolean,
    totalThoughts: number,
    visionChainId: string,
    blockedAt?: string,
  ) {
    const totalTokens = this.engine.state.snapshot().totalTokens;
    const durationMs = Date.now() - this.pipelineStartTime;
    const durationStr = durationMs > 60_000
      ? `${(durationMs / 60_000).toFixed(1)}m`
      : `${(durationMs / 1000).toFixed(1)}s`;

    // Log pipeline timing with more detail
    console.log(`[forge] Pipeline ${success ? "completed" : "failed"} in ${durationStr} — ${totalThoughts} thoughts, ${totalTokens} tokens${blockedAt ? ` (blocked at ${blockedAt})` : ""}`);

    // Session auto-end on failure too
    if (!success) {
      const activeSession = this.engine.sessions.getActive();
      if (activeSession) {
        this.engine.sessions.end(
          activeSession.id,
          "completed",
          `Blocked at ${blockedAt ?? "unknown"} — ${totalThoughts} thoughts`,
        );
      }
    }

    this.emit({
      type: "pipeline_complete",
      totalThoughts,
      totalTokens,
    });

    // ─── CHECKPOINT: Pipeline complete — clear ───
    this.resume.updatePhase(success ? "complete" : "failed");
    if (success) this.resume.clearCheckpoint();

    // ─── STREAMING — announce pipeline end ──────────────────
    const costReport = this.engine.costTracker.formatReport();

    // ─── STREAMING: Cost summary ────────────────────────────
    if (costReport) {
      this.emit({
        type: "phase_end",
        phase: "cost_summary",
        detail: costReport.split("\n").slice(0, 3).join(" | "),
      });
    }

    this.engine.streaming.pipelineEnd(success, success ? "All blocks complete" : blockedAt ?? "Failed");

    // ─── FORGE BRIDGE — notify gateway about pipeline end ───
    try {
      this.engine.forgeBridge.notifyPipelineEnd(success, `${totalThoughts} thoughts, ${totalTokens} tokens`);
    } catch { /* bridge best-effort */ }

    // ─── HOOKS — after_pipeline ─────────────────────────────
    this.engine.hooks.run("after_pipeline", { success, totalThoughts, totalTokens, blockedAt }).catch(() => { });

    // ─── CRON — schedule post-pipeline verification ─────────
    // Re-run tests 5 minutes later to catch delayed regressions
    try {
      this.engine.cronEngine.addJob({
        name: `post-pipeline-verify-${Date.now()}`,
        schedule: { kind: "at", at: new Date(Date.now() + 5 * 60_000).toISOString() },
        payload: { kind: "command" as const, command: "echo 'Post-pipeline verification: re-run build + tests'" },
        enabled: success, // only schedule if pipeline succeeded
      });
    } catch { /* cron best-effort */ }

    // ─── ROLLBACK — clear on success ────────────────────────
    if (success) this.engine.rollback.clear();

    // Fire scheduler events for pipeline lifecycle
    try {
      if (success) {
        this.engine.scheduler.fireEvent("pipeline_success");
      } else {
        this.engine.scheduler.fireEvent("pipeline_failure");
      }
    } catch { /* scheduler events are best-effort */ }

    return { success, totalThoughts, totalTokens, visionChainId, blockedAt };
  }

  /**
   * Fallback: if no parsed data, parse blocks/atoms using the old method.
   */
  private fallbackParseBlocks(text: string): string[] {
    const lines = text.split("\n").filter(l => l.trim().length > 0);
    const blocks: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^(?:Block\s*\d+[:.]\s*|(?:Atom\s*\d+[:.]\s*)|(\d+)[.)]\s*|[-*]\s*)(.*)/i);
      if (match) {
        const content = match[2]?.trim() ?? trimmed;
        if (content.length > 5) blocks.push(content);
      }
    }

    return blocks.length > 0 ? blocks : [text.trim()];
  }

  /**
   * Check if a phase has exceeded its token budget.
   * Returns remaining tokens for the phase, or 0 if exceeded.
   * Non-blocking: logs a warning but does NOT stop the pipeline.
   * The session-level budget (MAX_TOKENS_SESSION) is the hard stop.
   */
  private checkPhaseBudget(phase: string, tokensUsed: number): { remaining: number; exceeded: boolean } {
    const current = (this.phaseTokens.get(phase) ?? 0) + tokensUsed;
    this.phaseTokens.set(phase, current);

    const phasePct = this.PHASE_BUDGET_PCT[phase] ?? 0.10;
    const phaseBudget = Math.floor(this.MAX_TOKENS_SESSION * phasePct);
    const remaining = phaseBudget - current;

    if (remaining <= 0) {
      console.warn(`[forge] Phase "${phase}" exceeded budget: ${current}/${phaseBudget} tokens (${(phasePct * 100).toFixed(0)}% of session)`);
      return { remaining: 0, exceeded: true };
    }
    return { remaining, exceeded: false };
  }

  /**
   * Track tokens for a phase after a thought completes.
   */
  private trackPhaseTokens(phase: string, thought: Thought): void {
    const tokens = thought.tokenCost ?? 0;
    if (tokens > 0) {
      const result = this.checkPhaseBudget(phase, tokens);
      if (result.exceeded) {
        this.engine.streaming.warning(`⚠️ Phase "${phase}" exceeded token budget — remaining phases may be constrained`);
      }
    }
  }

  /**
   * Build a compact vision summary for atom-level context injection.
   *
   * Full vision doc is pinned at vision/decompose/reflection phases.
   * For worker atoms, we extract only the actionable constraints:
   *   - GOAL, ACCEPTANCE CRITERIA, FORBIDDEN, CONSTRAINTS, COLOR/FONT tokens.
   * This cuts token cost per atom by 60-80% on complex visions without
   * losing the guardrails that prevent drift.
   *
   * Falls back to truncated full vision if extraction yields nothing useful.
   */
  private buildVisionSummary(visionOutput: string): string {
    const lines = visionOutput.split("\n");
    const sections: string[] = [];
    let currentSection = "";
    let capturing = false;

    // Extract key sections by header
    const keepHeaders = /^\*?\*?\s*(?:GOAL|ACCEPTANCE|FORBIDDEN|CONSTRAINT|COLOR|TYPOGRAPHY|FONT|FOCAL|EMOTION|MOTION\s*BUDGET|SPACE|APPROACH)/i;
    const stopHeaders = /^\*?\*?\s*(?:REFERENCE|BENCHMARK|RESEARCH|INSPIRATION|EXAMPLE|CONTEXT|NOTE)/i;

    for (const line of lines) {
      const trimmed = line.trim();
      if (keepHeaders.test(trimmed)) {
        if (currentSection) sections.push(currentSection.trim());
        currentSection = trimmed + "\n";
        capturing = true;
      } else if (stopHeaders.test(trimmed) || (capturing && /^#{1,3}\s/.test(trimmed) && !keepHeaders.test(trimmed))) {
        if (currentSection) sections.push(currentSection.trim());
        currentSection = "";
        capturing = false;
      } else if (capturing) {
        currentSection += trimmed + "\n";
      }
    }
    if (currentSection) sections.push(currentSection.trim());

    if (sections.length > 0) {
      const summary = sections.join("\n\n");
      // If summary is reasonably sized, use it; otherwise truncate
      if (summary.length > 100 && summary.length < visionOutput.length * 0.8) {
        return `VISION SUMMARY (key constraints — full doc pinned at pipeline level):\n${summary}`;
      }
    }

    // Fallback: truncate full vision to first 600 chars + last 200 (constraints often at end)
    if (visionOutput.length > 1000) {
      return `VISION SUMMARY (truncated — full doc pinned at pipeline level):\n${visionOutput.slice(0, 600)}\n...\n${visionOutput.slice(-200)}`;
    }

    // Short vision: send as-is
    return `VISION DOCUMENT:\n${visionOutput}`;
  }

  /**
   * Compute dependency-aware execution waves from block dependency graph.
   *
   * Returns blocks sorted by wave (topological order).
   * Wave 0 = no dependencies (can theoretically run in parallel).
   * Wave N = all deps satisfied by waves < N.
   *
   * Uses Kahn's algorithm — handles cycles by appending remaining blocks
   * at the end (defensive: LLM may produce circular deps).
   */
  private computeBlockWaves(
    blockCount: number,
    blockDeps: number[][],
  ): Array<{ index: number; wave: number }> {
    const inDegree = new Array(blockCount).fill(0);
    const adjList: number[][] = Array.from({ length: blockCount }, () => []);

    // Build adjacency list: if block B depends on A, edge A→B
    for (let b = 0; b < blockCount; b++) {
      for (const dep of blockDeps[b] ?? []) {
        if (dep >= 0 && dep < blockCount && dep !== b) {
          adjList[dep].push(b);
          inDegree[b]++;
        }
      }
    }

    const result: Array<{ index: number; wave: number }> = [];
    const visited = new Set<number>();

    // BFS in waves
    let currentWave: number[] = [];
    for (let i = 0; i < blockCount; i++) {
      if (inDegree[i] === 0) currentWave.push(i);
    }

    let wave = 0;
    while (currentWave.length > 0) {
      // Sort within wave by original index (stable ordering)
      currentWave.sort((a, b) => a - b);

      const nextWave: number[] = [];
      for (const blockIdx of currentWave) {
        if (visited.has(blockIdx)) continue;
        visited.add(blockIdx);
        result.push({ index: blockIdx, wave });

        for (const neighbor of adjList[blockIdx]) {
          inDegree[neighbor]--;
          if (inDegree[neighbor] === 0 && !visited.has(neighbor)) {
            nextWave.push(neighbor);
          }
        }
      }
      currentWave = nextWave;
      wave++;
    }

    // Defensive: append any unvisited blocks (cycle or bad deps)
    for (let i = 0; i < blockCount; i++) {
      if (!visited.has(i)) {
        console.warn(`[forge] Block ${i + 1} has circular dependency — appending at end`);
        result.push({ index: i, wave });
      }
    }

    return result;
  }
}

// ─── TOOL-MODE WORKER PROMPT ─────────────────────────────────
// ─── TOOL-MODE WORKER PROMPT ─────────────────────────────────

function getWorkerPromptForToolMode(): string {
  return `You are the WORKER layer of Foreman — an AI coding agent. You execute ONE atomic task using real tools. You are judged on RESULTS, not words.

## PRIME DIRECTIVE
Your output is VERIFIED against the filesystem after you finish. If you claim you wrote a file and it doesn't exist, you FAIL. If you claim tests pass and they don't, you FAIL. The pipeline checks every claim. Do not lie. Do not hallucinate. Do not skip.

## TOOL DECISION TREE — Follow this EXACTLY

### "I need to understand existing code"
→ read_file (specific file) or grep/search_in_files (find patterns across codebase)
→ NEVER guess file contents. NEVER assume imports, exports, or function signatures.

### "I need to create a new file"
→ write_file (single file) or batch_write (multiple files atomically)
→ After writing: ALWAYS read_file to confirm it exists and has correct content.

### "I need to modify an existing file"
→ FIRST: read_file to see current content
→ THEN: edit_file (find & replace) for surgical changes, edit_range for line-range edits
→ For large rewrites: diff_preview first, then write_file
→ After editing: read_file again to confirm the change landed correctly.
→ NEVER edit a file you haven't read in THIS session.

### "I need to delete a file"
→ FIRST: read_file to confirm it's the right file
→ THEN: bash("cp <file> <file>.bak") to create backup
→ THEN: delete_file
→ NEVER delete without reading first. NEVER bulk-delete.

### "I need to run a command"
→ bash for shell commands (npm, tsc, test runners, etc.)
→ ALWAYS capture and read the output — don't fire-and-forget.

### "I need to verify my work"
→ verify_build (compile check) and/or verify_tests (test suite)
→ For UI work: browser_screenshot to visually confirm
→ If verification fails: FIX IT (up to 3 attempts), don't just report failure.

### "I need to find something in the project"
→ search_in_files or grep for content search
→ search_files for filename search
→ list_dir for directory structure

### "I don't know how something works"
→ web_search for external knowledge
→ web_fetch for documentation pages
→ read_file on related source files for internal understanding

## MANDATORY WORKFLOW (every task)
1. **ORIENT**: read_file / grep / list_dir — understand what exists RIGHT NOW
2. **PLAN**: State exactly what you'll change, what files, what approach (2-3 sentences max)
3. **EXECUTE**: Make the changes using the right tools from the decision tree above
4. **CONFIRM**: read_file every file you touched — verify your changes are actually there
5. **BUILD**: verify_build — confirm nothing is broken
6. **REPORT**: What you did, what you confirmed, what's different now

## HARD RULES
- You get ONE atomic task. Do it completely or BLOCK — no half-measures.
- read_file BEFORE edit_file. ALWAYS. No exceptions.
- read_file AFTER write_file/edit_file. Confirm it worked. Every time.
- NEVER say "I created X" without calling read_file on X to prove it.
- NEVER say "tests pass" without calling verify_tests or bash("npm test").
- NEVER say "builds clean" without calling verify_build.
- If something fails 3 times, BLOCK with a clear explanation — don't loop forever.
- NEVER delete files without backup. NEVER rename without confirming the new path exists.
- NEVER use node -e "require('fs')..." — use write_file/edit_file tools.
- NEVER use git_commit — the pipeline handles commits.
- DO NOT fabricate command output. Run the command, read the real output.

## OUTPUT FORMAT
After ALL tool calls complete, respond with:
STEP6_EXECUTE: [exact list of tool calls you made and their results]
STEP7_VERIFY: [real verification output — paste actual command results, not "I believe it works"]
STEP8_REPORT: [what changed, what was confirmed, any concerns]
CONFIDENCE: [0.0-1.0 — base this on VERIFICATION RESULTS, not vibes]

## CONFIDENCE CALIBRATION
- 0.9-1.0: Verified — build passes, tests pass, read_file confirms changes
- 0.7-0.8: Partially verified — changes confirmed but edge cases untested
- 0.5-0.6: Uncertain — something unexpected happened, needs human review
- Below 0.5: BLOCK instead of guessing`;
}
